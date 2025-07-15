import { Socket } from 'socket.io';
import { AuthTokenPayload, Permission } from '../../../shared/src/types/auth';
import logger from '../utils/logger';

export interface AuthenticatedSocket extends Socket {
  user?: AuthTokenPayload;
  documentId?: string;
}

export interface ConnectionInfo {
  socketId: string;
  userId: string;
  username: string;
  role: string;
  permissions: Permission[];
  documentId?: string;
  connectedAt: Date;
}

export class ConnectionManager {
  private static connections: Map<string, ConnectionInfo> = new Map();
  private static documentRooms: Map<string, Set<string>> = new Map();
  private static userSockets: Map<string, Set<string>> = new Map();

  static addConnection(socket: AuthenticatedSocket): void {
    if (!socket.user) {
      logger.error('Cannot add connection without user info', { socketId: socket.id });
      return;
    }

    const connectionInfo: ConnectionInfo = {
      socketId: socket.id,
      userId: socket.user.userId,
      username: socket.user.username,
      role: socket.user.role,
      permissions: socket.user.permissions,
      connectedAt: new Date()
    };

    this.connections.set(socket.id, connectionInfo);

    // Track user sockets
    if (!this.userSockets.has(socket.user.userId)) {
      this.userSockets.set(socket.user.userId, new Set());
    }
    this.userSockets.get(socket.user.userId)!.add(socket.id);

    logger.info('Connection added', {
      socketId: socket.id,
      userId: socket.user.userId,
      username: socket.user.username,
      role: socket.user.role
    });
  }

  static removeConnection(socketId: string): void {
    const connection = this.connections.get(socketId);
    if (!connection) {
      logger.warn('Connection not found for removal', { socketId });
      return;
    }

    // Remove from document room if joined
    if (connection.documentId) {
      this.leaveDocument(socketId, connection.documentId);
    }

    // Remove from user sockets
    const userSocketSet = this.userSockets.get(connection.userId);
    if (userSocketSet) {
      userSocketSet.delete(socketId);
      if (userSocketSet.size === 0) {
        this.userSockets.delete(connection.userId);
      }
    }

    this.connections.delete(socketId);

    logger.info('Connection removed', {
      socketId,
      userId: connection.userId,
      username: connection.username
    });
  }

  static joinDocument(socketId: string, documentId: string): boolean {
    const connection = this.connections.get(socketId);
    if (!connection) {
      logger.error('Connection not found for document join', { socketId, documentId });
      return false;
    }

    // Leave previous document if any
    if (connection.documentId) {
      this.leaveDocument(socketId, connection.documentId);
    }

    // Add to document room
    if (!this.documentRooms.has(documentId)) {
      this.documentRooms.set(documentId, new Set());
    }
    this.documentRooms.get(documentId)!.add(socketId);

    // Update connection info
    connection.documentId = documentId;
    this.connections.set(socketId, connection);

    logger.info('User joined document', {
      socketId,
      userId: connection.userId,
      username: connection.username,
      documentId,
      roomSize: this.documentRooms.get(documentId)!.size
    });

    return true;
  }

  static leaveDocument(socketId: string, documentId: string): boolean {
    const connection = this.connections.get(socketId);
    if (!connection) {
      logger.error('Connection not found for document leave', { socketId, documentId });
      return false;
    }

    // Remove from document room
    const documentRoom = this.documentRooms.get(documentId);
    if (documentRoom) {
      documentRoom.delete(socketId);
      if (documentRoom.size === 0) {
        this.documentRooms.delete(documentId);
      }
    }

    // Update connection info
    connection.documentId = undefined;
    this.connections.set(socketId, connection);

    logger.info('User left document', {
      socketId,
      userId: connection.userId,
      username: connection.username,
      documentId,
      roomSize: documentRoom ? documentRoom.size : 0
    });

    return true;
  }

  static getConnection(socketId: string): ConnectionInfo | undefined {
    return this.connections.get(socketId);
  }

  static getDocumentConnections(documentId: string): ConnectionInfo[] {
    const socketIds = this.documentRooms.get(documentId);
    if (!socketIds) return [];

    return Array.from(socketIds)
      .map(socketId => this.connections.get(socketId))
      .filter(connection => connection !== undefined) as ConnectionInfo[];
  }

  static getUserConnections(userId: string): ConnectionInfo[] {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds) return [];

    return Array.from(socketIds)
      .map(socketId => this.connections.get(socketId))
      .filter(connection => connection !== undefined) as ConnectionInfo[];
  }

  static getDocumentUserList(documentId: string): Array<{ userId: string; username: string; role: string }> {
    const connections = this.getDocumentConnections(documentId);
    const users = new Map<string, { userId: string; username: string; role: string }>();

    connections.forEach(connection => {
      if (!users.has(connection.userId)) {
        users.set(connection.userId, {
          userId: connection.userId,
          username: connection.username,
          role: connection.role
        });
      }
    });

    return Array.from(users.values());
  }

  static isUserInDocument(userId: string, documentId: string): boolean {
    const connections = this.getDocumentConnections(documentId);
    return connections.some(connection => connection.userId === userId);
  }

  static getActiveDocuments(): string[] {
    return Array.from(this.documentRooms.keys());
  }

  static getConnectionStats(): {
    totalConnections: number;
    activeDocuments: number;
    connectedUsers: number;
  } {
    return {
      totalConnections: this.connections.size,
      activeDocuments: this.documentRooms.size,
      connectedUsers: this.userSockets.size
    };
  }

  static hasPermissionForDocument(connection: ConnectionInfo, documentId: string, permission: Permission): boolean {
    // Check if the user has the required permission in their actual permissions array
    // This uses the permissions from the JWT token, not hardcoded role-based mapping
    return connection.permissions.includes(permission);
  }

  // Cleanup method for graceful shutdown
  static cleanup(): void {
    logger.info('Cleaning up connection manager', {
      totalConnections: this.connections.size,
      activeDocuments: this.documentRooms.size
    });

    this.connections.clear();
    this.documentRooms.clear();
    this.userSockets.clear();
  }
}