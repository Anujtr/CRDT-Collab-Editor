import * as Y from 'yjs';
import { v4 as uuidv4 } from 'uuid';
import { RedisClient } from '../config/database';
import { DocumentDatabaseModel, DocumentMetadata as DBDocumentMetadata, DocumentWithCollaborators } from '../models/DocumentDatabase';
import { Permission } from '../../../shared/src/types/auth';
import logger from '../utils/logger';
import { metricsService } from './metricsService';

// Use database model for metadata, keep service interface for compatibility
interface DocumentMetadata {
  id: string;
  title: string;
  ownerId: string;
  collaborators: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  lastActivity: string;
  version: number;
}

interface DocumentAccess {
  userId: string;
  permission: 'read' | 'write' | 'admin';
  joinedAt: string;
}

interface DocumentUpdate {
  documentId: string;
  userId: string;
  update: Uint8Array;
  timestamp: number;
}

interface QueuedUpdate {
  documentId: string;
  userId: string;
  update: Uint8Array;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  originalTimestamp: number;
}

class DocumentService {
  private documents: Map<string, Y.Doc> = new Map();
  private documentMetadata: Map<string, DocumentMetadata> = new Map();
  private documentAccess: Map<string, Set<DocumentAccess>> = new Map();
  private updateHandlers: Map<string, Set<(update: DocumentUpdate) => void>> = new Map();
  private updateQueue: Map<string, QueuedUpdate[]> = new Map();
  private processingQueue = false;
  private queueProcessInterval: NodeJS.Timeout | null = null;
  private fallbackBroadcaster: ((update: DocumentUpdate) => void) | null = null;

  constructor() {
    this.setupRedisSubscription();
    this.startQueueProcessor();
  }

  /**
   * Create a new document
   */
  async createDocument(ownerId: string, title?: string, isPublic: boolean = false): Promise<DocumentMetadata> {
    logger.info('Creating document start', { ownerId, title, isPublic });
    
    const documentId = uuidv4();
    logger.info('Generated document ID', { documentId });
    
    // Create document in database first
    const dbDocument = await DocumentDatabaseModel.create({
      id: documentId,
      title: title || 'Untitled Document',
      ownerId,
      isPublic
    });

    logger.info('Created document in database', { dbDocument });

    // Convert database document to service format
    const metadata: DocumentMetadata = {
      id: dbDocument.id,
      title: dbDocument.title,
      ownerId: dbDocument.ownerId,
      collaborators: [dbDocument.ownerId], // Owner is always a collaborator
      isPublic: dbDocument.isPublic,
      createdAt: dbDocument.createdAt.toISOString(),
      updatedAt: dbDocument.updatedAt.toISOString(),
      lastActivity: dbDocument.lastActivity.toISOString(),
      version: dbDocument.version
    };

    // Create new Yjs document
    const doc = new Y.Doc();
    doc.guid = documentId;
    
    logger.info('Created Y.Doc instance');
    
    // Initialize with empty text content for now
    // TODO: Later we'll switch to proper Yjs Array structure for Slate.js
    const textContent = doc.getText('content');
    if (textContent.length === 0) {
      textContent.insert(0, ''); // Empty document
    }

    logger.info('Initialized Slate content');

    // Store in memory and Redis
    this.documents.set(documentId, doc);
    this.documentMetadata.set(documentId, metadata);
    this.documentAccess.set(documentId, new Set([{
      userId: ownerId,
      permission: 'admin',
      joinedAt: dbDocument.createdAt.toISOString()
    }]));

    logger.info('Stored in memory');

    logger.info('About to persist document to Redis');
    await this.persistDocument(documentId);
    logger.info('Document persisted to Redis');

    logger.info(`Document created: ${documentId} by user: ${ownerId}`);
    metricsService.incrementDocumentCreated();

    return metadata;
  }

  /**
   * Get document by ID
   */
  async getDocument(documentId: string): Promise<Y.Doc | null> {
    // Check memory first
    if (this.documents.has(documentId)) {
      return this.documents.get(documentId)!;
    }

    // Load from Redis
    const doc = await this.loadDocument(documentId);
    if (doc) {
      this.documents.set(documentId, doc);
      return doc;
    }

    return null;
  }

  /**
   * Get document metadata
   */
  async getDocumentMetadata(documentId: string): Promise<DocumentMetadata | null> {
    // Check memory first
    if (this.documentMetadata.has(documentId)) {
      return this.documentMetadata.get(documentId)!;
    }

    // Load from database
    const dbDocument = await DocumentDatabaseModel.findById(documentId);
    if (dbDocument) {
      const metadata: DocumentMetadata = {
        id: dbDocument.id,
        title: dbDocument.title,
        ownerId: dbDocument.ownerId,
        collaborators: [dbDocument.ownerId, ...dbDocument.collaborators.map(c => c.userId)],
        isPublic: dbDocument.isPublic,
        createdAt: dbDocument.createdAt.toISOString(),
        updatedAt: dbDocument.updatedAt.toISOString(),
        lastActivity: dbDocument.lastActivity.toISOString(),
        version: dbDocument.version
      };
      
      this.documentMetadata.set(documentId, metadata);
      
      // Also cache access permissions
      const accessSet = new Set([
        {
          userId: dbDocument.ownerId,
          permission: 'admin' as const,
          joinedAt: dbDocument.createdAt.toISOString()
        },
        ...dbDocument.collaborators.map(c => ({
          userId: c.userId,
          permission: c.permission === Permission.DOCUMENT_WRITE ? 'write' as const : 'read' as const,
          joinedAt: c.joinedAt.toISOString()
        }))
      ]);
      this.documentAccess.set(documentId, accessSet);
      
      return metadata;
    }

    return null;
  }

  /**
   * Update document with Yjs update
   */
  async applyUpdate(documentId: string, userId: string, update: Uint8Array): Promise<boolean> {
    try {
      const doc = await this.getDocument(documentId);
      if (!doc) {
        logger.error(`Document not found: ${documentId}`);
        return false;
      }

      // Check user permissions
      if (!(await this.hasWriteAccess(documentId, userId))) {
        logger.warn(`User ${userId} attempted to update document ${documentId} without permission`);
        return false;
      }

      const result = await this.processUpdate(documentId, userId, update);
      if (!result.success) {
        // Queue update for retry if it's a recoverable error
        if (result.retryable) {
          await this.queueUpdateForRetry(documentId, userId, update);
          logger.warn(`Update queued for retry: ${documentId} by user: ${userId}`);
        }
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`Error applying update to document ${documentId}:`, error);
      // Queue for retry on unexpected errors
      await this.queueUpdateForRetry(documentId, userId, update);
      return false;
    }
  }

  /**
   * Process a document update with error handling
   */
  private async processUpdate(documentId: string, userId: string, update: Uint8Array): Promise<{ success: boolean; retryable: boolean; error?: Error }> {
    try {
      const doc = this.documents.get(documentId);
      if (!doc) {
        return { success: false, retryable: false };
      }

      // Apply update to Yjs document
      Y.applyUpdate(doc, update);

      // Update metadata in database
      await DocumentDatabaseModel.updateActivity(documentId);
      
      // Update in-memory metadata if cached
      const metadata = this.documentMetadata.get(documentId);
      if (metadata) {
        const now = new Date().toISOString();
        metadata.updatedAt = now;
        metadata.lastActivity = now;
        metadata.version += 1;
      }

      // Persist document state
      await this.persistDocument(documentId);

      // Broadcast update to all connected clients
      const updateData: DocumentUpdate = {
        documentId,
        userId,
        update,
        timestamp: Date.now()
      };

      await this.broadcastUpdate(updateData);

      // Notify update handlers
      const handlers = this.updateHandlers.get(documentId);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(updateData);
          } catch (handlerError) {
            logger.error(`Error in update handler for document ${documentId}:`, handlerError);
          }
        });
      }

      metricsService.incrementDocumentUpdate();
      logger.debug(`Document updated: ${documentId} by user: ${userId}`);

      return { success: true, retryable: false };
    } catch (error) {
      const isRetryable = this.isRetryableError(error);
      logger.error(`Error processing update for document ${documentId}:`, error);
      return { success: false, retryable: isRetryable, error: error as Error };
    }
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Network errors, timeout errors, and temporary Redis failures are retryable
    const errorMessage = error?.message?.toLowerCase() || '';
    return (
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('econnreset') ||
      errorMessage.includes('enotfound') ||
      error?.code === 'REDIS_CONNECTION_ERROR'
    );
  }

  /**
   * Queue an update for retry
   */
  private async queueUpdateForRetry(documentId: string, userId: string, update: Uint8Array, maxRetries: number = 3): Promise<void> {
    const queuedUpdate: QueuedUpdate = {
      documentId,
      userId,
      update,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries,
      originalTimestamp: Date.now()
    };

    if (!this.updateQueue.has(documentId)) {
      this.updateQueue.set(documentId, []);
    }

    this.updateQueue.get(documentId)!.push(queuedUpdate);
    logger.info(`Update queued for retry: ${documentId} (queue size: ${this.updateQueue.get(documentId)!.length})`);
  }

  /**
   * Start the queue processor
   */
  private startQueueProcessor(): void {
    if (this.queueProcessInterval) {
      clearInterval(this.queueProcessInterval);
    }

    this.queueProcessInterval = setInterval(async () => {
      if (!this.processingQueue) {
        await this.processUpdateQueue();
      }
    }, 5000); // Process queue every 5 seconds
  }

  /**
   * Process the update queue
   */
  private async processUpdateQueue(): Promise<void> {
    if (this.processingQueue) {
      return;
    }

    this.processingQueue = true;
    
    try {
      for (const [documentId, updates] of this.updateQueue.entries()) {
        if (updates.length === 0) {
          continue;
        }

        const processedUpdates: number[] = [];
        
        for (let i = 0; i < updates.length; i++) {
          const queuedUpdate = updates[i];
          if (!queuedUpdate) {
            continue;
          }
          
          // Skip updates that are too old (older than 5 minutes)
          if (Date.now() - queuedUpdate.originalTimestamp > 5 * 60 * 1000) {
            logger.warn(`Dropping expired update for document ${documentId}`);
            processedUpdates.push(i);
            continue;
          }

          // Try to process the update
          const result = await this.processUpdate(queuedUpdate.documentId, queuedUpdate.userId, queuedUpdate.update);
          
          if (result.success) {
            logger.info(`Successfully processed queued update for document ${documentId}`);
            processedUpdates.push(i);
          } else if (queuedUpdate.retryCount >= queuedUpdate.maxRetries) {
            logger.error(`Max retries exceeded for update in document ${documentId}, dropping update`);
            processedUpdates.push(i);
          } else {
            // Increment retry count with exponential backoff
            queuedUpdate.retryCount++;
            queuedUpdate.timestamp = Date.now() + (Math.pow(2, queuedUpdate.retryCount) * 1000);
            logger.info(`Retry ${queuedUpdate.retryCount}/${queuedUpdate.maxRetries} scheduled for document ${documentId}`);
          }
        }

        // Remove processed updates (in reverse order to maintain indices)
        processedUpdates.reverse().forEach(index => {
          updates.splice(index, 1);
        });

        // Clean up empty queues
        if (updates.length === 0) {
          this.updateQueue.delete(documentId);
        }
      }
    } catch (error) {
      logger.error('Error processing update queue:', error);
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Get queue statistics for monitoring
   */
  getQueueStats(): { totalQueued: number; queuesByDocument: Record<string, number> } {
    const stats = {
      totalQueued: 0,
      queuesByDocument: {} as Record<string, number>
    };

    for (const [documentId, updates] of this.updateQueue.entries()) {
      stats.queuesByDocument[documentId] = updates.length;
      stats.totalQueued += updates.length;
    }

    return stats;
  }

  /**
   * Get document state as update
   */
  async getDocumentState(documentId: string): Promise<Uint8Array | null> {
    const doc = await this.getDocument(documentId);
    if (!doc) {
      return null;
    }

    return Y.encodeStateAsUpdate(doc);
  }

  /**
   * Add collaborator to document
   */
  async addCollaborator(documentId: string, userId: string, permission: 'read' | 'write' = 'write'): Promise<boolean> {
    try {
      const dbPermission = permission === 'write' ? Permission.DOCUMENT_WRITE : Permission.DOCUMENT_READ;
      const success = await DocumentDatabaseModel.addCollaborator(documentId, userId, dbPermission);
      
      if (success) {
        // Update cached metadata if it exists
        const metadata = this.documentMetadata.get(documentId);
        if (metadata && !metadata.collaborators.includes(userId)) {
          metadata.collaborators.push(userId);
          metadata.updatedAt = new Date().toISOString();
        }

        // Update cached access permissions
        let accessSet = this.documentAccess.get(documentId);
        if (!accessSet) {
          accessSet = new Set();
          this.documentAccess.set(documentId, accessSet);
        }

        // Remove existing access entry for this user
        for (const access of accessSet) {
          if (access.userId === userId) {
            accessSet.delete(access);
            break;
          }
        }

        // Add new access entry
        accessSet.add({
          userId,
          permission,
          joinedAt: new Date().toISOString()
        });

        logger.info(`User ${userId} added as ${permission} collaborator to document ${documentId}`);
      }
      
      return success;
    } catch (error) {
      logger.error(`Error adding collaborator to document ${documentId}:`, error);
      return false;
    }
  }

  /**
   * Remove collaborator from document
   */
  async removeCollaborator(documentId: string, userId: string): Promise<boolean> {
    try {
      const success = await DocumentDatabaseModel.removeCollaborator(documentId, userId);
      
      if (success) {
        // Update cached metadata if it exists
        const metadata = this.documentMetadata.get(documentId);
        if (metadata) {
          metadata.collaborators = metadata.collaborators.filter(id => id !== userId);
          metadata.updatedAt = new Date().toISOString();
        }

        // Update cached access permissions
        const accessSet = this.documentAccess.get(documentId);
        if (accessSet) {
          for (const access of accessSet) {
            if (access.userId === userId) {
              accessSet.delete(access);
              break;
            }
          }
        }

        logger.info(`User ${userId} removed from document ${documentId}`);
      }
      
      return success;
    } catch (error) {
      logger.error(`Error removing collaborator from document ${documentId}:`, error);
      return false;
    }
  }

  /**
   * Check if user has read access to document
   */
  async hasReadAccess(documentId: string, userId: string): Promise<boolean> {
    return await DocumentDatabaseModel.hasAccess(documentId, userId, Permission.DOCUMENT_READ);
  }

  /**
   * Check if user has write access to document
   */
  async hasWriteAccess(documentId: string, userId: string): Promise<boolean> {
    return await DocumentDatabaseModel.hasAccess(documentId, userId, Permission.DOCUMENT_WRITE);
  }

  /**
   * Delete document
   */
  async deleteDocument(documentId: string, userId: string): Promise<boolean> {
    try {
      // Check permissions first
      const metadata = await this.getDocumentMetadata(documentId);
      if (!metadata) {
        return false;
      }

      // Only document owner can delete
      if (metadata.ownerId !== userId) {
        logger.warn(`User ${userId} attempted to delete document ${documentId} without permission`);
        return false;
      }

      // Delete from database
      const success = await DocumentDatabaseModel.deleteById(documentId);
      
      if (success) {
        // Remove from memory
        this.documents.delete(documentId);
        this.documentMetadata.delete(documentId);
        this.documentAccess.delete(documentId);
        this.updateHandlers.delete(documentId);

        // Remove from Redis
        await RedisClient.deleteCache(`document:${documentId}`);

        logger.info(`Document deleted: ${documentId} by user: ${userId}`);
        metricsService.incrementDocumentDeleted();
      }

      return success;
    } catch (error) {
      logger.error(`Error deleting document ${documentId}:`, error);
      return false;
    }
  }

  /**
   * List documents for user
   */
  async listDocuments(userId: string, page: number = 1, limit: number = 20): Promise<{
    documents: DocumentMetadata[];
    total: number;
    page: number;
    totalPages: number;
    fallbackMode: boolean;
  }> {
    try {
      const result = await DocumentDatabaseModel.listForUser(userId, { page, limit });
      
      // Convert database documents to service format
      const documents: DocumentMetadata[] = result.documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        ownerId: doc.ownerId,
        collaborators: [doc.ownerId, ...doc.collaborators.map(c => c.userId)],
        isPublic: doc.isPublic,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        lastActivity: doc.lastActivity.toISOString(),
        version: doc.version
      }));

      return {
        documents,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        fallbackMode: false // Using database, not fallback
      };
    } catch (error) {
      logger.error(`Error listing documents for user ${userId}:`, error);
      return {
        documents: [],
        total: 0,
        page,
        totalPages: 0,
        fallbackMode: true
      };
    }
  }

  /**
   * Subscribe to document updates
   */
  onDocumentUpdate(documentId: string, handler: (update: DocumentUpdate) => void): () => void {
    let handlers = this.updateHandlers.get(documentId);
    if (!handlers) {
      handlers = new Set();
      this.updateHandlers.set(documentId, handlers);
    }

    handlers.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.updateHandlers.get(documentId);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.updateHandlers.delete(documentId);
        }
      }
    };
  }

  /**
   * Persist document to Redis
   */
  private async persistDocument(documentId: string): Promise<void> {
    logger.info('persistDocument start', { documentId });
    
    const doc = this.documents.get(documentId);
    if (!doc) {
      logger.warn('persistDocument: no doc found', { documentId });
      return;
    }

    logger.info('persistDocument: encoding state');
    const state = Y.encodeStateAsUpdate(doc);
    logger.info('persistDocument: state encoded', { stateLength: state.length });
    
    // Convert Buffer to base64 string for JSON serialization
    const stateString = Buffer.from(state).toString('base64');
    logger.info('persistDocument: converted to base64', { base64Length: stateString.length });
    
    logger.info('persistDocument: calling Redis setCache');
    await RedisClient.setCache(`document:${documentId}`, stateString);
    logger.info('persistDocument: Redis setCache completed');
  }

  /**
   * Load document from Redis
   */
  private async loadDocument(documentId: string): Promise<Y.Doc | null> {
    try {
      const stateString = await RedisClient.getCache(`document:${documentId}`);
      if (!stateString) {
        return null;
      }

      const doc = new Y.Doc();
      doc.guid = documentId;
      
      // Apply stored state (decode from base64)
      const update = new Uint8Array(Buffer.from(stateString, 'base64'));
      Y.applyUpdate(doc, update);

      return doc;
    } catch (error) {
      logger.error(`Error loading document ${documentId}:`, error);
      return null;
    }
  }


  /**
   * Set fallback broadcaster for when Redis is unavailable
   */
  setFallbackBroadcaster(broadcaster: (update: DocumentUpdate) => void): void {
    this.fallbackBroadcaster = broadcaster;
  }

  /**
   * Broadcast update to all connected clients via Redis pub/sub or fallback
   */
  private async broadcastUpdate(update: DocumentUpdate): Promise<void> {
    try {
      const result = await RedisClient.publishDocumentUpdate(update.documentId, {
        ...update,
        update: Array.from(update.update) // Convert Uint8Array to regular array for JSON
      });

      // If Redis publish failed, use fallback broadcasting
      if (!result.success && result.fallback) {
        logger.info(`Using fallback broadcasting for document ${update.documentId}`);
        if (this.fallbackBroadcaster) {
          try {
            this.fallbackBroadcaster(update);
          } catch (fallbackError) {
            logger.error(`Fallback broadcasting failed for document ${update.documentId}:`, fallbackError);
          }
        } else {
          logger.warn(`No fallback broadcaster available for document ${update.documentId}`);
        }
      }
    } catch (error) {
      logger.error(`Error broadcasting update for document ${update.documentId}:`, error);
      
      // Try fallback as last resort
      if (this.fallbackBroadcaster) {
        try {
          this.fallbackBroadcaster(update);
          logger.info(`Fallback broadcasting succeeded for document ${update.documentId}`);
        } catch (fallbackError) {
          logger.error(`Fallback broadcasting also failed for document ${update.documentId}:`, fallbackError);
        }
      }
    }
  }

  /**
   * Setup Redis subscription for document updates
   */
  private setupRedisSubscription(): void {
    this.subscribeToRedisUpdates();
    
    // Periodically check Redis health and resubscribe if needed
    setInterval(() => {
      if (RedisClient.isFallbackMode()) {
        logger.debug('Redis in fallback mode, attempting to resubscribe');
        this.subscribeToRedisUpdates();
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Subscribe to Redis updates with error handling
   */
  private async subscribeToRedisUpdates(): Promise<void> {
    try {
      const result = await RedisClient.subscribeToDocument('updates', (data: any) => {
        try {
          const updateData = data;
          const update: DocumentUpdate = {
            ...updateData,
            update: new Uint8Array(updateData.update) // Convert back to Uint8Array
          };

          // Notify local handlers (including WebSocket handlers)
          const handlers = this.updateHandlers.get(update.documentId);
          if (handlers) {
            handlers.forEach(handler => {
              try {
                handler(update);
              } catch (handlerError) {
                logger.error(`Error in update handler for document ${update.documentId}:`, handlerError);
              }
            });
          }
        } catch (error) {
          logger.error('Error processing document update from Redis:', error);
        }
      });

      if (!result.success && result.fallback) {
        logger.warn('Redis subscription failed, running in direct broadcast mode');
      }
    } catch (error) {
      logger.error('Error setting up Redis subscription:', error);
    }
  }

  /**
   * Get document statistics
   */
  async getDocumentStats(): Promise<{
    totalDocuments: number;
    activeDocuments: number;
    totalUpdates: number;
    redisHealth: any;
    queueStats: any;
    dbStats: any;
  }> {
    const activeDocuments = this.documents.size;
    let dbStats = { totalDocuments: 0, publicDocuments: 0, totalCollaborators: 0 };
    
    try {
      dbStats = await DocumentDatabaseModel.getStats();
    } catch (error) {
      logger.error('Error getting database document stats:', error);
    }

    return {
      totalDocuments: dbStats.totalDocuments,
      activeDocuments,
      totalUpdates: metricsService.getDocumentUpdateCount(),
      redisHealth: RedisClient.getHealthStatus(),
      queueStats: this.getQueueStats(),
      dbStats
    };
  }

  /**
   * Cleanup inactive documents from memory
   */
  cleanupInactiveDocuments(maxAge: number = 3600000): void { // 1 hour default
    const now = Date.now();
    const documentsToRemove: string[] = [];

    for (const [documentId, metadata] of this.documentMetadata) {
      const lastActivity = new Date(metadata.lastActivity).getTime();
      if (now - lastActivity > maxAge) {
        documentsToRemove.push(documentId);
      }
    }

    for (const documentId of documentsToRemove) {
      this.documents.delete(documentId);
      this.documentMetadata.delete(documentId);
      // Keep access permissions and handlers for when document is loaded again
    }

    if (documentsToRemove.length > 0) {
      logger.info(`Cleaned up ${documentsToRemove.length} inactive documents from memory`);
    }
  }

  /**
   * Clear all in-memory state (for testing purposes)
   */
  clearForTesting(): void {
    if (this.queueProcessInterval) {
      clearInterval(this.queueProcessInterval);
      this.queueProcessInterval = null;
    }
    
    this.documents.clear();
    this.documentMetadata.clear();
    this.documentAccess.clear();
    this.updateHandlers.clear();
    this.updateQueue.clear();
    this.processingQueue = false;
  }
  
  /**
   * Shutdown method for graceful cleanup
   */
  shutdown(): void {
    if (this.queueProcessInterval) {
      clearInterval(this.queueProcessInterval);
      this.queueProcessInterval = null;
    }
    
    logger.info('DocumentService shutdown complete');
  }
}

export const documentService = new DocumentService();
export { DocumentMetadata, DocumentAccess, DocumentUpdate };