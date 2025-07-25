import * as Y from 'yjs';
import { v4 as uuidv4 } from 'uuid';
import { RedisClient } from '../config/database';
import logger from '../utils/logger';
import { metricsService } from './metricsService';

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

class DocumentService {
  private documents: Map<string, Y.Doc> = new Map();
  private documentMetadata: Map<string, DocumentMetadata> = new Map();
  private documentAccess: Map<string, Set<DocumentAccess>> = new Map();
  private updateHandlers: Map<string, Set<(update: DocumentUpdate) => void>> = new Map();

  constructor() {
    this.setupRedisSubscription();
  }

  /**
   * Create a new document
   */
  async createDocument(ownerId: string, title?: string, isPublic: boolean = false): Promise<DocumentMetadata> {
    const documentId = uuidv4();
    const now = new Date().toISOString();
    
    const metadata: DocumentMetadata = {
      id: documentId,
      title: title || 'Untitled Document',
      ownerId,
      collaborators: [ownerId],
      isPublic,
      createdAt: now,
      updatedAt: now,
      lastActivity: now,
      version: 0
    };

    // Create new Yjs document
    const doc = new Y.Doc();
    doc.guid = documentId;
    
    // Initialize with empty Slate.js structure
    const slateContent = doc.getArray('content');
    slateContent.insert(0, [{
      type: 'paragraph',
      children: [{ text: '' }]
    }]);

    // Store in memory and Redis
    this.documents.set(documentId, doc);
    this.documentMetadata.set(documentId, metadata);
    this.documentAccess.set(documentId, new Set([{
      userId: ownerId,
      permission: 'admin',
      joinedAt: now
    }]));

    await this.persistDocument(documentId);
    await this.persistMetadata(documentId);

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

    // Load from Redis
    const metadata = await this.loadMetadata(documentId);
    if (metadata) {
      this.documentMetadata.set(documentId, metadata);
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

      // Apply update to Yjs document
      Y.applyUpdate(doc, update);

      // Update metadata
      const metadata = this.documentMetadata.get(documentId);
      if (metadata) {
        metadata.updatedAt = new Date().toISOString();
        metadata.lastActivity = new Date().toISOString();
        metadata.version += 1;
        await this.persistMetadata(documentId);
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
        handlers.forEach(handler => handler(updateData));
      }

      metricsService.incrementDocumentUpdate();
      logger.debug(`Document updated: ${documentId} by user: ${userId}`);

      return true;
    } catch (error) {
      logger.error(`Error applying update to document ${documentId}:`, error);
      return false;
    }
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
      const metadata = await this.getDocumentMetadata(documentId);
      if (!metadata) {
        return false;
      }

      // Update metadata
      if (!metadata.collaborators.includes(userId)) {
        metadata.collaborators.push(userId);
        metadata.updatedAt = new Date().toISOString();
        await this.persistMetadata(documentId);
      }

      // Update access permissions
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
      return true;
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
      const metadata = await this.getDocumentMetadata(documentId);
      if (!metadata) {
        return false;
      }

      // Update metadata
      metadata.collaborators = metadata.collaborators.filter(id => id !== userId);
      metadata.updatedAt = new Date().toISOString();
      await this.persistMetadata(documentId);

      // Update access permissions
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
      return true;
    } catch (error) {
      logger.error(`Error removing collaborator from document ${documentId}:`, error);
      return false;
    }
  }

  /**
   * Check if user has read access to document
   */
  async hasReadAccess(documentId: string, userId: string): Promise<boolean> {
    const metadata = await this.getDocumentMetadata(documentId);
    if (!metadata) {
      return false;
    }

    // Document owner always has access
    if (metadata.ownerId === userId) {
      return true;
    }

    // Public documents are readable by all
    if (metadata.isPublic) {
      return true;
    }

    // Check if user is a collaborator
    return metadata.collaborators.includes(userId);
  }

  /**
   * Check if user has write access to document
   */
  async hasWriteAccess(documentId: string, userId: string): Promise<boolean> {
    const metadata = await this.getDocumentMetadata(documentId);
    if (!metadata) {
      return false;
    }

    // Document owner always has write access
    if (metadata.ownerId === userId) {
      return true;
    }

    // Check specific permissions
    const accessSet = this.documentAccess.get(documentId);
    if (accessSet) {
      for (const access of accessSet) {
        if (access.userId === userId && (access.permission === 'write' || access.permission === 'admin')) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Delete document
   */
  async deleteDocument(documentId: string, userId: string): Promise<boolean> {
    try {
      const metadata = await this.getDocumentMetadata(documentId);
      if (!metadata) {
        return false;
      }

      // Only document owner can delete
      if (metadata.ownerId !== userId) {
        logger.warn(`User ${userId} attempted to delete document ${documentId} without permission`);
        return false;
      }

      // Remove from memory
      this.documents.delete(documentId);
      this.documentMetadata.delete(documentId);
      this.documentAccess.delete(documentId);
      this.updateHandlers.delete(documentId);

      // Remove from Redis
      await RedisClient.deleteCache(`document:${documentId}`);
      await RedisClient.deleteCache(`document:metadata:${documentId}`);

      logger.info(`Document deleted: ${documentId} by user: ${userId}`);
      metricsService.incrementDocumentDeleted();

      return true;
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
  }> {
    try {
      // Get all document keys from Redis
      const client = RedisClient.getClient();
      const keys = await client.keys('document:metadata:*');
      const documents: DocumentMetadata[] = [];

      for (const key of keys) {
        const metadata = await RedisClient.getCache(key.replace('document:metadata:', ''));
        if (metadata) {
          const doc = JSON.parse(metadata) as DocumentMetadata;
          
          // Check if user has access
          if (await this.hasReadAccess(doc.id, userId)) {
            documents.push(doc);
          }
        }
      }

      // Sort by last activity
      documents.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());

      // Apply pagination
      const total = documents.length;
      const totalPages = Math.ceil(total / limit);
      const start = (page - 1) * limit;
      const paginatedDocuments = documents.slice(start, start + limit);

      return {
        documents: paginatedDocuments,
        total,
        page,
        totalPages
      };
    } catch (error) {
      logger.error(`Error listing documents for user ${userId}:`, error);
      return {
        documents: [],
        total: 0,
        page,
        totalPages: 0
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
    const doc = this.documents.get(documentId);
    if (!doc) {
      return;
    }

    const state = Y.encodeStateAsUpdate(doc);
    await RedisClient.setCache(`document:${documentId}`, Buffer.from(state));
  }

  /**
   * Load document from Redis
   */
  private async loadDocument(documentId: string): Promise<Y.Doc | null> {
    try {
      const state = await RedisClient.getCache(`document:${documentId}`);
      if (!state) {
        return null;
      }

      const doc = new Y.Doc();
      doc.guid = documentId;
      
      // Apply stored state
      const update = new Uint8Array(Buffer.from(state, 'binary'));
      Y.applyUpdate(doc, update);

      return doc;
    } catch (error) {
      logger.error(`Error loading document ${documentId}:`, error);
      return null;
    }
  }

  /**
   * Persist metadata to Redis
   */
  private async persistMetadata(documentId: string): Promise<void> {
    const metadata = this.documentMetadata.get(documentId);
    if (!metadata) {
      return;
    }

    await RedisClient.setCache(`document:metadata:${documentId}`, JSON.stringify(metadata));
  }

  /**
   * Load metadata from Redis
   */
  private async loadMetadata(documentId: string): Promise<DocumentMetadata | null> {
    try {
      const metadata = await RedisClient.getCache(`document:metadata:${documentId}`);
      if (!metadata) {
        return null;
      }

      return JSON.parse(metadata) as DocumentMetadata;
    } catch (error) {
      logger.error(`Error loading metadata for document ${documentId}:`, error);
      return null;
    }
  }

  /**
   * Broadcast update to all connected clients via Redis pub/sub
   */
  private async broadcastUpdate(update: DocumentUpdate): Promise<void> {
    try {
      await RedisClient.publishDocumentUpdate(update.documentId, {
        ...update,
        update: Array.from(update.update) // Convert Uint8Array to regular array for JSON
      });
    } catch (error) {
      logger.error(`Error broadcasting update for document ${update.documentId}:`, error);
    }
  }

  /**
   * Setup Redis subscription for document updates
   */
  private setupRedisSubscription(): void {
    RedisClient.subscribeToDocument('updates', (data: any) => {
        try {
          const updateData = data;
          const update: DocumentUpdate = {
            ...updateData,
            update: new Uint8Array(updateData.update) // Convert back to Uint8Array
          };

          // Notify local handlers (including WebSocket handlers)
          const handlers = this.updateHandlers.get(update.documentId);
          if (handlers) {
            handlers.forEach(handler => handler(update));
          }
        } catch (error) {
          logger.error('Error processing document update from Redis:', error);
        }
    });
  }

  /**
   * Get document statistics
   */
  async getDocumentStats(): Promise<{
    totalDocuments: number;
    activeDocuments: number;
    totalUpdates: number;
  }> {
    const client = RedisClient.getClient();
    const keys = await client.keys('document:metadata:*');
    const totalDocuments = keys.length;
    const activeDocuments = this.documents.size;

    return {
      totalDocuments,
      activeDocuments,
      totalUpdates: metricsService.getDocumentUpdateCount()
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
}

export const documentService = new DocumentService();
export { DocumentMetadata, DocumentAccess, DocumentUpdate };