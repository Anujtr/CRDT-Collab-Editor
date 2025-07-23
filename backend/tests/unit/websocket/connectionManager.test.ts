import { ConnectionManager } from '../../../src/websocket/connectionManager';
import { UserRole, Permission } from '../../../../shared/src/types/auth';

// Mock Socket.IO socket
const createMockSocket = (id: string, user?: any) => ({
  id,
  user,
  handshake: { address: '127.0.0.1' },
  join: jest.fn(),
  leave: jest.fn(),
  emit: jest.fn(),
  to: jest.fn(() => ({ emit: jest.fn() })),
  // Add missing properties to satisfy AuthenticatedSocket interface
  nsp: { name: '/' },
  client: { id },
  recovered: false,
  data: {},
  acks: new Map(),
  connected: true,
  disconnected: false,
  rooms: new Set(),
  broadcast: {
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() }))
  },
  adapter: {},
  server: {},
  conn: {},
  request: {},
  timeout: jest.fn(),
  onAny: jest.fn(),
  prependAny: jest.fn(),
  offAny: jest.fn(),
  listenersAny: jest.fn(),
  onAnyOutgoing: jest.fn(),
  prependAnyOutgoing: jest.fn(),
  offAnyOutgoing: jest.fn(),
  listenersAnyOutgoing: jest.fn(),
  use: jest.fn(),
  send: jest.fn(),
  write: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
  eventNames: jest.fn(),
  listeners: jest.fn(),
  listenerCount: jest.fn(),
  compress: jest.fn(),
  volatile: { emit: jest.fn() },
  local: { emit: jest.fn() },
  flags: {},
  disconnect: jest.fn(),
  addListener: jest.fn(),
  off: jest.fn(),
  setMaxListeners: jest.fn(),
  getMaxListeners: jest.fn(),
  rawListeners: jest.fn(),
  prependListener: jest.fn(),
  prependOnceListener: jest.fn()
} as any);

describe('ConnectionManager', () => {
  beforeEach(() => {
    // Clean up connections before each test
    ConnectionManager.cleanup();
  });

  afterEach(() => {
    ConnectionManager.cleanup();
  });

  describe('Connection Management', () => {
    it('should add authenticated connection', () => {
      const mockUser = {
        userId: 'user-123',
        username: 'testuser',
        role: UserRole.EDITOR,
        permissions: [Permission.DOCUMENT_READ, Permission.DOCUMENT_WRITE]
      };

      const socket = createMockSocket('socket-123', mockUser) as any;

      ConnectionManager.addConnection(socket);

      const connection = ConnectionManager.getConnection('socket-123');
      expect(connection).toMatchObject({
        socketId: 'socket-123',
        userId: 'user-123',
        username: 'testuser',
        role: UserRole.EDITOR,
        permissions: [Permission.DOCUMENT_READ, Permission.DOCUMENT_WRITE]
      });
      expect(connection?.connectedAt).toBeInstanceOf(Date);
    });

    it('should not add connection without user info', () => {
      const socket = createMockSocket('socket-123') as any;

      ConnectionManager.addConnection(socket);

      const connection = ConnectionManager.getConnection('socket-123');
      expect(connection).toBeUndefined();
    });

    it('should remove connection', () => {
      const mockUser = {
        userId: 'user-123',
        username: 'testuser',
        role: UserRole.EDITOR,
        permissions: [Permission.DOCUMENT_READ]
      };

      const socket = createMockSocket('socket-123', mockUser) as any;

      ConnectionManager.addConnection(socket);
      expect(ConnectionManager.getConnection('socket-123')).toBeDefined();

      ConnectionManager.removeConnection('socket-123');
      expect(ConnectionManager.getConnection('socket-123')).toBeUndefined();
    });

    it('should handle removing non-existent connection', () => {
      expect(() => {
        ConnectionManager.removeConnection('non-existent');
      }).not.toThrow();
    });
  });

  describe('Document Room Management', () => {
    let socket: any;
    const documentId = 'doc-123';

    beforeEach(() => {
      const mockUser = {
        userId: 'user-123',
        username: 'testuser',
        role: UserRole.EDITOR,
        permissions: [Permission.DOCUMENT_READ, Permission.DOCUMENT_WRITE]
      };

      socket = createMockSocket('socket-123', mockUser);
      ConnectionManager.addConnection(socket);
    });

    it('should join document', () => {
      const success = ConnectionManager.joinDocument('socket-123', documentId);

      expect(success).toBe(true);

      const connection = ConnectionManager.getConnection('socket-123');
      expect(connection?.documentId).toBe(documentId);

      const documentConnections = ConnectionManager.getDocumentConnections(documentId);
      expect(documentConnections).toHaveLength(1);
      expect(documentConnections[0]?.socketId).toBe('socket-123');
    });

    it('should leave document', () => {
      ConnectionManager.joinDocument('socket-123', documentId);
      
      const success = ConnectionManager.leaveDocument('socket-123', documentId);
      expect(success).toBe(true);

      const connection = ConnectionManager.getConnection('socket-123');
      expect(connection?.documentId).toBeUndefined();

      const documentConnections = ConnectionManager.getDocumentConnections(documentId);
      expect(documentConnections).toHaveLength(0);
    });

    it('should switch between documents', () => {
      const firstDoc = 'doc-1';
      const secondDoc = 'doc-2';

      // Join first document
      ConnectionManager.joinDocument('socket-123', firstDoc);
      expect(ConnectionManager.getDocumentConnections(firstDoc)).toHaveLength(1);

      // Join second document (should leave first automatically)
      ConnectionManager.joinDocument('socket-123', secondDoc);
      expect(ConnectionManager.getDocumentConnections(firstDoc)).toHaveLength(0);
      expect(ConnectionManager.getDocumentConnections(secondDoc)).toHaveLength(1);

      const connection = ConnectionManager.getConnection('socket-123');
      expect(connection?.documentId).toBe(secondDoc);
    });

    it('should handle joining document with non-existent connection', () => {
      const success = ConnectionManager.joinDocument('non-existent', documentId);
      expect(success).toBe(false);
    });

    it('should handle leaving document with non-existent connection', () => {
      const success = ConnectionManager.leaveDocument('non-existent', documentId);
      expect(success).toBe(false);
    });
  });

  describe('Multi-User Document Scenarios', () => {
    const documentId = 'doc-multi';

    beforeEach(() => {
      // Add multiple users
      const users = [
        { id: 'socket-1', userId: 'user-1', username: 'user1', role: UserRole.EDITOR },
        { id: 'socket-2', userId: 'user-2', username: 'user2', role: UserRole.VIEWER },
        { id: 'socket-3', userId: 'user-1', username: 'user1', role: UserRole.EDITOR }, // Same user, different socket
      ];

      users.forEach(user => {
        const socket = createMockSocket(user.id, {
          userId: user.userId,
          username: user.username,
          role: user.role,
          permissions: [Permission.DOCUMENT_READ]
        });
        ConnectionManager.addConnection(socket);
        ConnectionManager.joinDocument(user.id, documentId);
      });
    });

    it('should track multiple users in document', () => {
      const connections = ConnectionManager.getDocumentConnections(documentId);
      expect(connections).toHaveLength(3);

      const userIds = connections.map(c => c.userId);
      expect(userIds).toContain('user-1');
      expect(userIds).toContain('user-2');
    });

    it('should get unique user list for document', () => {
      const userList = ConnectionManager.getDocumentUserList(documentId);
      expect(userList).toHaveLength(2); // Only unique users

      const usernames = userList.map(u => u.username);
      expect(usernames).toContain('user1');
      expect(usernames).toContain('user2');
    });

    it('should check if user is in document', () => {
      expect(ConnectionManager.isUserInDocument('user-1', documentId)).toBe(true);
      expect(ConnectionManager.isUserInDocument('user-2', documentId)).toBe(true);
      expect(ConnectionManager.isUserInDocument('user-3', documentId)).toBe(false);
    });

    it('should get user connections', () => {
      const user1Connections = ConnectionManager.getUserConnections('user-1');
      expect(user1Connections).toHaveLength(2); // Two sockets for same user

      const user2Connections = ConnectionManager.getUserConnections('user-2');
      expect(user2Connections).toHaveLength(1);

      const user3Connections = ConnectionManager.getUserConnections('user-3');
      expect(user3Connections).toHaveLength(0);
    });
  });

  describe('Permission Checking', () => {
    let connection: any;

    beforeEach(() => {
      const mockUser = {
        userId: 'user-123',
        username: 'testuser',
        role: UserRole.EDITOR,
        permissions: [Permission.DOCUMENT_READ, Permission.DOCUMENT_WRITE]
      };

      const socket = createMockSocket('socket-123', mockUser);
      ConnectionManager.addConnection(socket);
      connection = ConnectionManager.getConnection('socket-123');
    });

    it('should grant permission when user has it', () => {
      const hasRead = ConnectionManager.hasPermissionForDocument(
        connection, 'doc-123', Permission.DOCUMENT_READ
      );
      const hasWrite = ConnectionManager.hasPermissionForDocument(
        connection, 'doc-123', Permission.DOCUMENT_WRITE
      );

      expect(hasRead).toBe(true);
      expect(hasWrite).toBe(true);
    });

    it('should deny permission when user lacks it', () => {
      // Create user with limited permissions
      const limitedUser = {
        userId: 'user-456',
        username: 'viewer',
        role: UserRole.VIEWER,
        permissions: [Permission.DOCUMENT_READ] // Only read permission
      };

      const socket = createMockSocket('socket-456', limitedUser);
      ConnectionManager.addConnection(socket);
      const limitedConnection = ConnectionManager.getConnection('socket-456');

      const hasRead = ConnectionManager.hasPermissionForDocument(
        limitedConnection!, 'doc-123', Permission.DOCUMENT_READ
      );
      const hasWrite = ConnectionManager.hasPermissionForDocument(
        limitedConnection!, 'doc-123', Permission.DOCUMENT_WRITE
      );

      expect(hasRead).toBe(true);
      expect(hasWrite).toBe(false);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      // Create test scenario with multiple users and documents
      const testData = [
        { socketId: 'socket-1', userId: 'user-1', documentId: 'doc-1' },
        { socketId: 'socket-2', userId: 'user-2', documentId: 'doc-1' },
        { socketId: 'socket-3', userId: 'user-1', documentId: 'doc-2' },
        { socketId: 'socket-4', userId: 'user-3', documentId: null }
      ];

      testData.forEach(data => {
        const socket = createMockSocket(data.socketId, {
          userId: data.userId,
          username: `user${data.userId.slice(-1)}`,
          role: UserRole.EDITOR,
          permissions: [Permission.DOCUMENT_READ]
        });

        ConnectionManager.addConnection(socket);
        if (data.documentId) {
          ConnectionManager.joinDocument(data.socketId, data.documentId);
        }
      });
    });

    it('should provide connection statistics', () => {
      const stats = ConnectionManager.getConnectionStats();

      expect(stats).toMatchObject({
        totalConnections: 4,
        activeDocuments: 2,
        connectedUsers: 3
      });
    });

    it('should list active documents', () => {
      const activeDocuments = ConnectionManager.getActiveDocuments();

      expect(activeDocuments).toHaveLength(2);
      expect(activeDocuments).toContain('doc-1');
      expect(activeDocuments).toContain('doc-2');
    });
  });

  describe('Connection Cleanup', () => {
    it('should clean up document rooms when last user leaves', () => {
      const mockUser = {
        userId: 'user-123',
        username: 'testuser',
        role: UserRole.EDITOR,
        permissions: [Permission.DOCUMENT_READ]
      };

      const socket = createMockSocket('socket-123', mockUser);
      ConnectionManager.addConnection(socket);
      ConnectionManager.joinDocument('socket-123', 'doc-cleanup');

      expect(ConnectionManager.getActiveDocuments()).toContain('doc-cleanup');

      ConnectionManager.removeConnection('socket-123');

      expect(ConnectionManager.getActiveDocuments()).not.toContain('doc-cleanup');
    });

    it('should clean up user socket tracking', () => {
      const mockUser = {
        userId: 'user-123',
        username: 'testuser',
        role: UserRole.EDITOR,
        permissions: [Permission.DOCUMENT_READ]
      };

      const socket = createMockSocket('socket-123', mockUser);
      ConnectionManager.addConnection(socket);

      expect(ConnectionManager.getUserConnections('user-123')).toHaveLength(1);

      ConnectionManager.removeConnection('socket-123');

      expect(ConnectionManager.getUserConnections('user-123')).toHaveLength(0);
    });

    it('should handle cleanup of all connections', () => {
      // Add multiple connections
      for (let i = 1; i <= 3; i++) {
        const socket = createMockSocket(`socket-${i}`, {
          userId: `user-${i}`,
          username: `user${i}`,
          role: UserRole.EDITOR,
          permissions: [Permission.DOCUMENT_READ]
        });
        ConnectionManager.addConnection(socket);
        ConnectionManager.joinDocument(`socket-${i}`, `doc-${i}`);
      }

      expect(ConnectionManager.getConnectionStats().totalConnections).toBe(3);

      ConnectionManager.cleanup();

      const stats = ConnectionManager.getConnectionStats();
      expect(stats.totalConnections).toBe(0);
      expect(stats.activeDocuments).toBe(0);
      expect(stats.connectedUsers).toBe(0);
    });
  });
});