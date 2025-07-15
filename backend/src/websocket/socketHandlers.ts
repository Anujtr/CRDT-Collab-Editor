import { Server, Socket } from 'socket.io';
import { JWTUtils } from '../utils/jwt';
import { UserModel } from '../models/User';
import { AuthenticatedSocket, ConnectionManager } from './connectionManager';
import { Permission } from '../../../shared/src/types/auth';
import { RedisClient } from '../config/database';
import logger from '../utils/logger';

export class SocketHandlers {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  setupHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info('New socket connection', { socketId: socket.id, ip: socket.handshake.address });

      // Set up authentication timeout
      const authTimeout = setTimeout(() => {
        if (!(socket as AuthenticatedSocket).user) {
          logger.warn('Socket authentication timeout', { socketId: socket.id });
          socket.emit('error', { 
            message: 'Authentication timeout', 
            code: 'AUTH_TIMEOUT' 
          });
          socket.disconnect();
        }
      }, 10000); // 10 second timeout

      // Handle authentication
      socket.on('authenticate', async (data) => {
        await this.handleAuthentication(socket as AuthenticatedSocket, data, authTimeout);
      });

      // Handle document operations (requires authentication)
      socket.on('join-document', async (data) => {
        await this.handleJoinDocument(socket as AuthenticatedSocket, data);
      });

      socket.on('leave-document', async (data) => {
        await this.handleLeaveDocument(socket as AuthenticatedSocket, data);
      });

      // Handle CRDT updates
      socket.on('document-update', async (data) => {
        await this.handleDocumentUpdate(socket as AuthenticatedSocket, data);
      });

      // Handle cursor/selection updates
      socket.on('cursor-update', async (data) => {
        await this.handleCursorUpdate(socket as AuthenticatedSocket, data);
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        clearTimeout(authTimeout);
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

  private async handleAuthentication(socket: AuthenticatedSocket, data: any, authTimeout: NodeJS.Timeout): Promise<void> {
    try {
      const { token } = data;

      if (!token) {
        socket.emit('auth-error', { 
          message: 'Token required', 
          code: 'TOKEN_REQUIRED' 
        });
        return;
      }

      // Verify JWT token
      const decoded = JWTUtils.verifyToken(token);
      
      // Verify user still exists and is active
      const user = await UserModel.findById(decoded.userId);
      if (!user) {
        socket.emit('auth-error', { 
          message: 'User not found', 
          code: 'USER_NOT_FOUND' 
        });
        return;
      }

      // Set user info on socket
      socket.user = decoded;

      // Add to connection manager
      ConnectionManager.addConnection(socket);

      // Clear auth timeout
      clearTimeout(authTimeout);

      // Send success response
      socket.emit('authenticated', {
        userId: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions
      });

      logger.info('Socket authenticated', {
        socketId: socket.id,
        userId: user.id,
        username: user.username,
        role: user.role
      });

    } catch (error) {
      logger.error('Socket authentication failed', {
        socketId: socket.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      socket.emit('auth-error', {
        message: 'Authentication failed',
        code: 'AUTH_FAILED'
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

      // Check permissions
      if (!ConnectionManager.hasPermissionForDocument(connection, documentId, Permission.DOCUMENT_READ)) {
        socket.emit('error', { 
          message: 'Insufficient permissions', 
          code: 'INSUFFICIENT_PERMISSIONS' 
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

      // Join Socket.IO room
      await socket.join(`document:${documentId}`);

      // Get current users in document
      const users = ConnectionManager.getDocumentUserList(documentId);

      // Notify user of successful join
      socket.emit('document-joined', {
        documentId,
        users: users.filter(u => u.userId !== socket.user!.userId) // Exclude self
      });

      // Notify other users in the document
      socket.to(`document:${documentId}`).emit('user-joined', {
        userId: socket.user.userId,
        username: socket.user.username,
        role: socket.user.role
      });

      // Subscribe to Redis pub/sub for this document
      await this.subscribeToDocumentUpdates(documentId);

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
        code: 'JOIN_DOCUMENT_ERROR'
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
      const connection = ConnectionManager.getConnection(socket.id);

      if (!connection || !documentId || !update) {
        socket.emit('error', { 
          message: 'Invalid update data', 
          code: 'INVALID_UPDATE_DATA' 
        });
        return;
      }

      // Check write permissions
      if (!ConnectionManager.hasPermissionForDocument(connection, documentId, Permission.DOCUMENT_WRITE)) {
        socket.emit('error', { 
          message: 'Insufficient permissions for writing', 
          code: 'INSUFFICIENT_PERMISSIONS' 
        });
        return;
      }

      // Broadcast update to other users in the document (excluding sender)
      socket.to(`document:${documentId}`).emit('document-update', {
        documentId,
        update,
        userId: socket.user.userId,
        username: socket.user.username,
        timestamp: Date.now()
      });

      // Send acknowledgment back to the sender
      socket.emit('document-update-success', {
        documentId,
        update,
        userId: socket.user.userId,
        username: socket.user.username,
        timestamp: Date.now()
      });


      // Publish to Redis for other server instances
      await RedisClient.publishDocumentUpdate(documentId, {
        update,
        userId: socket.user.userId,
        username: socket.user.username,
        socketId: socket.id, // To avoid echoing back to sender
        timestamp: Date.now()
      });

      logger.debug('Document update processed', {
        socketId: socket.id,
        userId: socket.user.userId,
        documentId,
        updateSize: JSON.stringify(update).length
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

    // Remove from connection manager
    ConnectionManager.removeConnection(socket.id);
  }

  private async subscribeToDocumentUpdates(documentId: string): Promise<void> {
    try {
      if (!RedisClient.isClientConnected()) {
        return;
      }

      await RedisClient.subscribeToDocument(documentId, (data) => {
        // Broadcast Redis updates to all connected clients except the sender
        this.io.to(`document:${documentId}`).except(data.socketId).emit('document-update', {
          documentId,
          update: data.update,
          userId: data.userId,
          username: data.username,
          timestamp: data.timestamp
        });
      });

    } catch (error) {
      logger.error('Error subscribing to document updates', {
        documentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Admin endpoints for monitoring
  getConnectionStats() {
    return {
      ...ConnectionManager.getConnectionStats(),
      socketRooms: this.io.sockets.adapter.rooms
    };
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