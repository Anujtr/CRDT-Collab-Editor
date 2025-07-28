import { Server, Socket } from 'socket.io';
import { JWTUtils } from '../utils/jwt';
import { UserDatabaseModel } from '../models/UserDatabase';
import { AuthenticatedSocket, ConnectionManager } from './connectionManager';
import { Permission } from '../../../shared/src/types/auth';
import { RedisClient } from '../config/database';
import { metricsService } from '../services/metricsService';
import { documentService } from '../services/documentService';
import logger from '../utils/logger';

export class SocketHandlers {
  private io: Server;
  private documentSubscriptions: Map<string, Set<string>> = new Map(); // documentId -> socketIds
  private socketSubscriptions: Map<string, Set<string>> = new Map(); // socketId -> documentIds
  private unsubscribeFunctions: Map<string, (() => void)[]> = new Map(); // documentId -> unsubscribe functions

  constructor(io: Server) {
    this.io = io;
    this.setupDocumentUpdateBroadcasting();
    this.setupFallbackBroadcasting();
  }

  private setupDocumentUpdateBroadcasting(): void {
    // The document service already handles Redis pub/sub for broadcasting updates
    // We'll hook into that system by subscribing to specific documents when users join
    // This is handled in the handleJoinDocument method via subscribeToDocumentUpdates
  }

  /**
   * Setup fallback broadcasting for when Redis is unavailable
   */
  private setupFallbackBroadcasting(): void {
    // Register fallback broadcaster with document service
    documentService.setFallbackBroadcaster((update) => {
      this.broadcastUpdateDirectly(update);
    });
  }

  /**
   * Broadcast update directly via Socket.IO rooms (fallback when Redis is down)
   */
  private broadcastUpdateDirectly(update: any): void {
    try {
      this.io.to(`document:${update.documentId}`).emit('document-update', {
        documentId: update.documentId,
        update: Array.from(update.update), // Convert Uint8Array to regular array for JSON
        userId: update.userId,
        timestamp: update.timestamp
      });

      metricsService.recordWebSocketMessage('document-update', 'out');
      
      logger.debug('Broadcasted document update via direct WebSocket (fallback)', {
        documentId: update.documentId,
        userId: update.userId,
        updateSize: update.update.length
      });
    } catch (error) {
      logger.error('Error in fallback broadcasting', {
        documentId: update.documentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  setupHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      const connectionStartTime = Date.now();
      logger.info('New socket connection', { socketId: socket.id, ip: socket.handshake.address });
      
      // Track WebSocket connection metrics
      metricsService.recordWebSocketConnection(true);

      // Check if socket was auto-authenticated via handshake
      const authenticatedSocket = socket as AuthenticatedSocket;
      if (authenticatedSocket.user) {
        // Add to connection manager
        ConnectionManager.addConnection(authenticatedSocket);
        
        // Send authenticated event
        socket.emit('authenticated', {
          userId: authenticatedSocket.user.userId,
          username: authenticatedSocket.user.username,
          role: authenticatedSocket.user.role
        });
        
        logger.info('Socket auto-authenticated and ready', {
          socketId: socket.id,
          userId: authenticatedSocket.user.userId
        });
      }

      // Set up authentication timeout with progressive warnings
      const authTimeoutMs = 30000; // 30 second timeout
      const warningIntervals = [15000, 25000]; // Warn at 15s and 25s
      const warnings: NodeJS.Timeout[] = [];
      
      // Set up warning timeouts
      warningIntervals.forEach((interval, index) => {
        const warningTimeout = setTimeout(() => {
          if (!(socket as AuthenticatedSocket).user) {
            const remainingTime = (authTimeoutMs - interval) / 1000;
            logger.warn('Socket authentication warning', { 
              socketId: socket.id,
              remainingSeconds: remainingTime,
              warning: index + 1
            });
            socket.emit('auth-warning', {
              message: `Authentication required within ${remainingTime} seconds`,
              remainingTime: remainingTime,
              code: 'AUTH_WARNING'
            });
          }
        }, interval);
        warnings.push(warningTimeout);
      });
      
      // Set up final timeout
      const authTimeout = setTimeout(() => {
        if (!(socket as AuthenticatedSocket).user) {
          logger.warn('Socket authentication timeout', { 
            socketId: socket.id,
            timeoutMs: authTimeoutMs,
            connectionTime: Date.now() - connectionStartTime
          });
          socket.emit('error', { 
            message: 'Authentication timeout', 
            code: 'AUTH_TIMEOUT',
            timeoutMs: authTimeoutMs
          });
          socket.disconnect();
        }
      }, authTimeoutMs);
      
      // Function to clear all auth timeouts
      const clearAuthTimeouts = () => {
        clearTimeout(authTimeout);
        warnings.forEach(warning => clearTimeout(warning));
      };

      // Handle authentication
      socket.on('authenticate', async (data) => {
        metricsService.recordWebSocketMessage('authenticate', 'in');
        await this.handleAuthentication(socket as AuthenticatedSocket, data, clearAuthTimeouts);
      });

      // Handle document operations (requires authentication)
      socket.on('join-document', async (data) => {
        metricsService.recordWebSocketMessage('join-document', 'in');
        await this.handleJoinDocument(socket as AuthenticatedSocket, data);
      });

      socket.on('leave-document', async (data) => {
        metricsService.recordWebSocketMessage('leave-document', 'in');
        await this.handleLeaveDocument(socket as AuthenticatedSocket, data);
      });

      // Handle CRDT updates
      socket.on('document-update', async (data) => {
        metricsService.recordWebSocketMessage('document-update', 'in');
        await this.handleDocumentUpdate(socket as AuthenticatedSocket, data);
      });

      // Handle cursor/selection updates
      socket.on('cursor-update', async (data) => {
        metricsService.recordWebSocketMessage('cursor-update', 'in');
        await this.handleCursorUpdate(socket as AuthenticatedSocket, data);
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        clearAuthTimeouts();
        
        // Track connection duration
        const connectionDuration = (Date.now() - connectionStartTime) / 1000;
        metricsService.recordWebSocketConnectionDuration(connectionDuration);
        metricsService.recordWebSocketConnection(false);
        
        this.handleDisconnection(socket as AuthenticatedSocket, reason);
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error('Socket error', { 
          socketId: socket.id, 
          error: error.message || error 
        });
      });
    });
  }

  private async handleAuthentication(socket: AuthenticatedSocket, data: any, clearAuthTimeouts: () => void): Promise<void> {
    const startTime = Date.now();
    
    try {
      const { token } = data;

      logger.debug('Authentication attempt', {
        socketId: socket.id,
        hasToken: !!token,
        tokenLength: token?.length || 0
      });

      if (!token) {
        logger.warn('Authentication failed - no token provided', { socketId: socket.id });
        socket.emit('auth-error', { 
          message: 'Token required', 
          code: 'TOKEN_REQUIRED',
          details: 'Authentication token must be provided'
        });
        return;
      }

      // Verify JWT token
      let decoded;
      try {
        decoded = JWTUtils.verifyToken(token);
        logger.debug('Token verified successfully', {
          socketId: socket.id,
          userId: decoded.userId,
          tokenExpiry: decoded.exp
        });
      } catch (tokenError) {
        logger.warn('Token verification failed', {
          socketId: socket.id,
          error: tokenError instanceof Error ? tokenError.message : 'Unknown token error'
        });
        socket.emit('auth-error', {
          message: 'Invalid token',
          code: 'INVALID_TOKEN',
          details: tokenError instanceof Error ? tokenError.message : 'Token verification failed'
        });
        return;
      }
      
      // Verify user still exists and is active
      let user;
      try {
        user = await UserDatabaseModel.findById(decoded.userId);
        if (!user) {
          logger.warn('Authentication failed - user not found', {
            socketId: socket.id,
            userId: decoded.userId
          });
          socket.emit('auth-error', { 
            message: 'User not found', 
            code: 'USER_NOT_FOUND',
            details: 'User account may have been deleted'
          });
          return;
        }
        
        logger.debug('User found and verified', {
          socketId: socket.id,
          userId: user.id,
          username: user.username,
          role: user.role
        });
      } catch (dbError) {
        logger.error('Database error during authentication', {
          socketId: socket.id,
          userId: decoded.userId,
          error: dbError instanceof Error ? dbError.message : 'Unknown database error'
        });
        socket.emit('auth-error', {
          message: 'Authentication service error',
          code: 'SERVICE_ERROR',
          details: 'Temporary authentication service issue'
        });
        return;
      }

      // Set user info on socket
      socket.user = decoded;

      // Add to connection manager
      try {
        ConnectionManager.addConnection(socket);
      } catch (connectionError) {
        logger.error('Failed to add connection to manager', {
          socketId: socket.id,
          userId: user.id,
          error: connectionError instanceof Error ? connectionError.message : 'Unknown connection error'
        });
        // Don't fail authentication for this - continue
      }

      // Clear auth timeouts
      clearAuthTimeouts();

      // Send success response
      const authResponse = {
        userId: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions,
        authenticatedAt: Date.now(),
        authDuration: Date.now() - startTime
      };
      
      socket.emit('authenticated', authResponse);

      logger.info('Socket authenticated successfully', {
        socketId: socket.id,
        userId: user.id,
        username: user.username,
        role: user.role,
        authDurationMs: Date.now() - startTime
      });

    } catch (error) {
      const authDuration = Date.now() - startTime;
      
      logger.error('Socket authentication failed with unexpected error', {
        socketId: socket.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        authDurationMs: authDuration,
        stack: error instanceof Error ? error.stack : undefined
      });

      socket.emit('auth-error', {
        message: 'Authentication failed',
        code: 'AUTH_FAILED',
        details: 'An unexpected error occurred during authentication'
      });
    }
  }

  private async handleJoinDocument(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      if (!socket.user) {
        socket.emit('error', { 
          message: 'Authentication required', 
          code: 'AUTH_REQUIRED' 
        });
        return;
      }

      const { documentId } = data;
      if (!documentId) {
        socket.emit('error', { 
          message: 'Document ID required', 
          code: 'DOCUMENT_ID_REQUIRED' 
        });
        return;
      }

      const connection = ConnectionManager.getConnection(socket.id);
      if (!connection) {
        socket.emit('error', { 
          message: 'Connection not found', 
          code: 'CONNECTION_NOT_FOUND' 
        });
        return;
      }

      // Check permissions using document service
      const hasReadAccess = await documentService.hasReadAccess(documentId, socket.user.userId);
      if (!hasReadAccess) {
        socket.emit('error', { 
          message: 'Document not found or access denied', 
          code: 'ACCESS_DENIED' 
        });
        return;
      }

      // Join document room
      const joined = ConnectionManager.joinDocument(socket.id, documentId);
      if (!joined) {
        socket.emit('error', { 
          message: 'Failed to join document', 
          code: 'JOIN_FAILED' 
        });
        return;
      }

      // Track document operation
      metricsService.recordDocumentOperation('join', documentId);

      // Join Socket.IO room
      await socket.join(`document:${documentId}`);

      // Get current users in document
      const users = ConnectionManager.getDocumentUserList(documentId);
      
      // Update collaborator metrics
      metricsService.setCollaboratorCount(documentId, users.length);

      // Get document state and metadata
      const documentState = await documentService.getDocumentState(documentId);
      const metadata = await documentService.getDocumentMetadata(documentId);
      const hasWriteAccess = await documentService.hasWriteAccess(documentId, socket.user.userId);

      // Notify user of successful join with document data
      socket.emit('document-joined', {
        documentId,
        users: users.filter(u => u.userId !== socket.user!.userId), // Exclude self
        documentState: documentState ? Array.from(documentState) : null,
        metadata,
        hasWriteAccess
      });
      
      metricsService.recordWebSocketMessage('document-joined', 'out');

      // Notify other users in the document
      socket.to(`document:${documentId}`).emit('user-joined', {
        userId: socket.user.userId,
        username: socket.user.username,
        role: socket.user.role
      });

      // Subscribe to document updates from the document service
      this.subscribeToDocumentUpdates(documentId, socket.id);

      logger.info('User joined document', {
        socketId: socket.id,
        userId: socket.user.userId,
        username: socket.user.username,
        documentId,
        userCount: users.length
      });

    } catch (error) {
      logger.error('Error joining document', {
        socketId: socket.id,
        documentId: data?.documentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      socket.emit('error', {
        message: 'Failed to join document',
        code: 'JOIN_DOCUMENT_ERROR',
        redisHealth: require('../config/database').RedisClient.isFallbackMode() ? 'fallback' : 'connected'
      });
    }
  }

  private async handleLeaveDocument(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      if (!socket.user) {
        return;
      }

      const { documentId } = data;
      const connection = ConnectionManager.getConnection(socket.id);
      
      if (!connection || !documentId) {
        return;
      }

      // Leave document room
      ConnectionManager.leaveDocument(socket.id, documentId);

      // Unsubscribe from document updates
      this.unsubscribeFromDocumentUpdates(documentId, socket.id);

      // Leave Socket.IO room
      await socket.leave(`document:${documentId}`);

      // Notify other users
      socket.to(`document:${documentId}`).emit('user-left', {
        userId: socket.user.userId,
        username: socket.user.username
      });

      socket.emit('document-left', { documentId });

      logger.info('User left document', {
        socketId: socket.id,
        userId: socket.user.userId,
        username: socket.user.username,
        documentId
      });

    } catch (error) {
      logger.error('Error leaving document', {
        socketId: socket.id,
        documentId: data?.documentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleDocumentUpdate(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      if (!socket.user) {
        socket.emit('error', { 
          message: 'Authentication required', 
          code: 'AUTH_REQUIRED' 
        });
        return;
      }

      const { documentId, update } = data;

      if (!documentId || !update) {
        socket.emit('error', { 
          message: 'Invalid update data', 
          code: 'INVALID_UPDATE_DATA' 
        });
        return;
      }

      // Convert update to Uint8Array if it's an array
      const updateBytes = Array.isArray(update) ? new Uint8Array(update) : update;

      // Apply update using document service
      const success = await documentService.applyUpdate(documentId, socket.user.userId, updateBytes);

      if (!success) {
        socket.emit('error', { 
          message: 'Failed to apply document update', 
          code: 'UPDATE_FAILED' 
        });
        return;
      }

      // Send acknowledgment back to the sender
      socket.emit('document-update-success', {
        documentId,
        timestamp: Date.now()
      });

      logger.debug('Document update processed', {
        socketId: socket.id,
        userId: socket.user.userId,
        documentId,
        updateSize: updateBytes.length
      });

    } catch (error) {
      logger.error('Error processing document update', {
        socketId: socket.id,
        documentId: data?.documentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      socket.emit('error', {
        message: 'Failed to process update',
        code: 'UPDATE_PROCESSING_ERROR'
      });
    }
  }

  private async handleCursorUpdate(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      if (!socket.user) {
        return;
      }

      const { documentId, cursor } = data;
      const connection = ConnectionManager.getConnection(socket.id);

      if (!connection || !documentId) {
        return;
      }

      // Broadcast cursor update to other users in the document (excluding sender)
      socket.to(`document:${documentId}`).emit('cursor-update', {
        userId: socket.user.userId,
        username: socket.user.username,
        cursor,
        timestamp: Date.now()
      });

    } catch (error) {
      logger.error('Error processing cursor update', {
        socketId: socket.id,
        documentId: data?.documentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private handleDisconnection(socket: AuthenticatedSocket, reason: string): void {
    logger.info('Socket disconnected', {
      socketId: socket.id,
      userId: socket.user?.userId,
      username: socket.user?.username,
      reason
    });

    if (socket.user) {
      const connection = ConnectionManager.getConnection(socket.id);
      
      // If user was in a document, notify others
      if (connection?.documentId) {
        socket.to(`document:${connection.documentId}`).emit('user-left', {
          userId: socket.user.userId,
          username: socket.user.username
        });
      }
    }

    // Clean up all subscriptions for this socket
    this.cleanupSocketSubscriptions(socket.id);

    // Remove from connection manager
    ConnectionManager.removeConnection(socket.id);
  }

  /**
   * Subscribe to document updates with proper subscription management
   */
  private subscribeToDocumentUpdates(documentId: string, socketId: string): void {
    try {
      // Check if we already have a subscription for this document
      if (!this.documentSubscriptions.has(documentId)) {
        // First subscriber for this document - create the subscription
        logger.debug('Creating new subscription for document', { documentId });
        
        const unsubscribe = documentService.onDocumentUpdate(documentId, (update) => {
          // Broadcast the update to all clients in the document's room
          this.io.to(`document:${documentId}`).emit('document-update', {
            documentId: update.documentId,
            update: Array.from(update.update), // Convert Uint8Array to regular array for JSON
            userId: update.userId,
            timestamp: update.timestamp
          });

          metricsService.recordWebSocketMessage('document-update', 'out');
          
          logger.debug('Broadcasted document update via WebSocket', {
            documentId: update.documentId,
            userId: update.userId,
            updateSize: update.update.length,
            subscriberCount: this.documentSubscriptions.get(documentId)?.size || 0
          });
        });

        // Store unsubscribe function
        if (!this.unsubscribeFunctions.has(documentId)) {
          this.unsubscribeFunctions.set(documentId, []);
        }
        this.unsubscribeFunctions.get(documentId)!.push(unsubscribe);
        
        // Initialize subscriber set
        this.documentSubscriptions.set(documentId, new Set());
      }

      // Add this socket to the document's subscriber list
      this.documentSubscriptions.get(documentId)!.add(socketId);
      
      // Track document subscriptions per socket for cleanup
      if (!this.socketSubscriptions.has(socketId)) {
        this.socketSubscriptions.set(socketId, new Set());
      }
      this.socketSubscriptions.get(socketId)!.add(documentId);
      
      logger.debug('Socket subscribed to document updates', {
        socketId,
        documentId,
        totalSubscribers: this.documentSubscriptions.get(documentId)!.size
      });

    } catch (error) {
      logger.error('Error subscribing to document updates', {
        documentId,
        socketId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Unsubscribe socket from document updates
   */
  private unsubscribeFromDocumentUpdates(documentId: string, socketId: string): void {
    try {
      // Remove socket from document subscribers
      const documentSubs = this.documentSubscriptions.get(documentId);
      if (documentSubs) {
        documentSubs.delete(socketId);
        
        // If no more subscribers, clean up the subscription
        if (documentSubs.size === 0) {
          logger.debug('No more subscribers, cleaning up document subscription', { documentId });
          
          // Call unsubscribe functions
          const unsubscribeFuncs = this.unsubscribeFunctions.get(documentId);
          if (unsubscribeFuncs) {
            unsubscribeFuncs.forEach(unsubscribe => {
              try {
                unsubscribe();
              } catch (error) {
                logger.error('Error calling unsubscribe function', { documentId, error });
              }
            });
            this.unsubscribeFunctions.delete(documentId);
          }
          
          this.documentSubscriptions.delete(documentId);
        }
      }
      
      // Remove document from socket's subscription list
      const socketSubs = this.socketSubscriptions.get(socketId);
      if (socketSubs) {
        socketSubs.delete(documentId);
        
        if (socketSubs.size === 0) {
          this.socketSubscriptions.delete(socketId);
        }
      }
      
      logger.debug('Socket unsubscribed from document updates', {
        socketId,
        documentId,
        remainingSubscribers: documentSubs?.size || 0
      });
      
    } catch (error) {
      logger.error('Error unsubscribing from document updates', {
        documentId,
        socketId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Clean up all subscriptions for a socket
   */
  private cleanupSocketSubscriptions(socketId: string): void {
    try {
      const socketSubs = this.socketSubscriptions.get(socketId);
      if (socketSubs) {
        // Unsubscribe from all documents this socket was subscribed to
        for (const documentId of socketSubs) {
          this.unsubscribeFromDocumentUpdates(documentId, socketId);
        }
      }
      
      logger.debug('Cleaned up all subscriptions for socket', {
        socketId,
        documentCount: socketSubs?.size || 0
      });
      
    } catch (error) {
      logger.error('Error cleaning up socket subscriptions', {
        socketId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Admin endpoints for monitoring
  getConnectionStats() {
    return {
      ...ConnectionManager.getConnectionStats(),
      socketRooms: this.io.sockets.adapter.rooms,
      subscriptions: {
        documentSubscriptions: Array.from(this.documentSubscriptions.entries()).map(([docId, sockets]) => ({
          documentId: docId,
          subscriberCount: sockets.size
        })),
        totalDocumentSubscriptions: this.documentSubscriptions.size,
        totalSocketSubscriptions: this.socketSubscriptions.size
      },
      redisHealth: {
        connected: require('../config/database').RedisClient.isClientConnected(),
        fallbackMode: require('../config/database').RedisClient.isFallbackMode(),
        healthStatus: require('../config/database').RedisClient.getHealthStatus()
      }
    };
  }

  /**
   * Get subscription statistics for debugging
   */
  getSubscriptionStats() {
    const stats = {
      documentSubscriptions: {} as Record<string, number>,
      socketSubscriptions: {} as Record<string, number>,
      totalDocuments: this.documentSubscriptions.size,
      totalSockets: this.socketSubscriptions.size,
      unsubscribeFunctions: this.unsubscribeFunctions.size
    };

    // Document subscription counts
    for (const [documentId, sockets] of this.documentSubscriptions.entries()) {
      stats.documentSubscriptions[documentId] = sockets.size;
    }

    // Socket subscription counts
    for (const [socketId, documents] of this.socketSubscriptions.entries()) {
      stats.socketSubscriptions[socketId] = documents.size;
    }

    return stats;
  }

  /**
   * Clean up all subscriptions (for shutdown)
   */
  cleanup(): void {
    logger.info('Cleaning up all WebSocket subscriptions');
    
    // Clean up all unsubscribe functions
    for (const [documentId, unsubscribeFuncs] of this.unsubscribeFunctions.entries()) {
      unsubscribeFuncs.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (error) {
          logger.error('Error during subscription cleanup', { documentId, error });
        }
      });
    }
    
    // Clear all tracking maps
    this.documentSubscriptions.clear();
    this.socketSubscriptions.clear();
    this.unsubscribeFunctions.clear();
    
    logger.info('WebSocket subscription cleanup complete');
  }

  getDocumentUsers(documentId: string) {
    return ConnectionManager.getDocumentUserList(documentId);
  }

  async disconnectUser(userId: string): Promise<boolean> {
    const connections = ConnectionManager.getUserConnections(userId);
    let disconnected = false;

    for (const connection of connections) {
      const socket = this.io.sockets.sockets.get(connection.socketId);
      if (socket) {
        socket.disconnect(true);
        disconnected = true;
      }
    }

    return disconnected;
  }
}