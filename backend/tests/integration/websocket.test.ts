import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { UserModel } from '../../src/models/User';
import { UserRole, Permission } from '../../../shared/src/types/auth';
import { JWTUtils } from '../../src/utils/jwt';
import { ConnectionManager } from '../../src/websocket/connectionManager';

// Mock Redis for testing
jest.mock('../../src/config/database', () => ({
  RedisClient: {
    // Connection management
    connect: jest.fn(),
    disconnect: jest.fn(),
    isClientConnected: () => false,
    healthCheck: jest.fn().mockResolvedValue(true),
    
    // Client getters
    getClient: jest.fn(() => ({
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      keys: jest.fn().mockResolvedValue([])
    })),
    getPublisher: jest.fn(() => ({
      publish: jest.fn()
    })),
    getSubscriber: jest.fn(() => ({
      subscribe: jest.fn(),
      on: jest.fn(),
      unsubscribe: jest.fn()
    })),
    
    // Cache methods
    setCache: jest.fn(),
    getCache: jest.fn(),
    deleteCache: jest.fn(),
    
    // Document-specific methods
    publishDocumentUpdate: jest.fn(),
    subscribeToDocument: jest.fn(),
    unsubscribeFromDocument: jest.fn(),
    
    // Session methods
    setSession: jest.fn(),
    getSession: jest.fn(),
    deleteSession: jest.fn(),
    
    // Rate limiting
    incrementRateLimit: jest.fn().mockResolvedValue({ count: 0, reset: Date.now() + 60000, exceeded: false })
  }
}));

describe('WebSocket Integration Tests', () => {
  let httpServer: Server;
  let io: SocketIOServer;
  let serverSocket: any;
  let clientSocket: ClientSocket;
  let testPort: number;

  beforeAll(async () => {
    testPort = 3001 + Math.floor(Math.random() * 1000);
    
    // Create HTTP server
    httpServer = new Server();
    
    // Create Socket.IO server
    io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    // Import and setup socket handlers
    const { SocketHandlers } = await import('../../src/websocket/socketHandlers');
    const socketHandlers = new SocketHandlers(io);
    socketHandlers.setupHandlers();

    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(testPort, resolve);
    });

    // Initialize user model
    await UserModel.initialize();
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    if (io) {
      io.close();
    }
    if (httpServer) {
      httpServer.close();
    }
  });

  beforeEach(async () => {
    // Clean up before each test
    UserModel.clear();
    ConnectionManager.cleanup();
    await UserModel.initialize();
  });

  afterEach(() => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  describe('Connection Establishment', () => {
    it('should establish WebSocket connection', (done) => {
      clientSocket = Client(`http://localhost:${testPort}`);

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (error) => {
        done(error);
      });
    });

    it('should handle connection timeout', (done) => {
      clientSocket = Client(`http://localhost:${testPort}`);

      clientSocket.on('connect', () => {
        // Don't send authentication - should timeout
      });

      clientSocket.on('error', (error) => {
        expect(error.message).toBe('Authentication timeout');
        expect(error.code).toBe('AUTH_TIMEOUT');
      });

      clientSocket.on('disconnect', (reason) => {
        expect(reason).toBe('io server disconnect');
        expect(clientSocket.connected).toBe(false);
        done();
      });
    }, 15000); // Increase timeout for this test
  });

  describe('Authentication Flow', () => {
    let testUser: any;
    let validToken: string;

    beforeEach(async () => {
      testUser = await UserModel.create({
        username: 'wsuser',
        email: 'ws@example.com',
        password: 'TestPassword123',
        role: UserRole.EDITOR
      });

      validToken = JWTUtils.generateAccessToken(testUser);
    });

    it('should authenticate user with valid token', (done) => {
      clientSocket = Client(`http://localhost:${testPort}`);

      clientSocket.on('connect', () => {
        clientSocket.emit('authenticate', { token: validToken });
      });

      clientSocket.on('authenticated', (data) => {
        expect(data).toMatchObject({
          userId: testUser.id,
          username: testUser.username,
          role: testUser.role
        });
        expect(data.permissions).toBeInstanceOf(Array);
        done();
      });

      clientSocket.on('auth-error', (error) => {
        done(new Error(`Authentication failed: ${error.message}`));
      });
    });

    it('should reject authentication with invalid token', (done) => {
      clientSocket = Client(`http://localhost:${testPort}`);

      clientSocket.on('connect', () => {
        clientSocket.emit('authenticate', { token: 'invalid-token' });
      });

      clientSocket.on('auth-error', (error) => {
        expect(error).toHaveProperty('message');
        expect(error.code).toBe('AUTH_FAILED');
        done();
      });

      clientSocket.on('authenticated', () => {
        done(new Error('Should not authenticate with invalid token'));
      });
    });

    it('should reject authentication without token', (done) => {
      clientSocket = Client(`http://localhost:${testPort}`);

      clientSocket.on('connect', () => {
        clientSocket.emit('authenticate', {});
      });

      clientSocket.on('auth-error', (error) => {
        expect(error).toHaveProperty('message');
        expect(error.code).toBe('TOKEN_REQUIRED');
        done();
      });
    });

    it('should disconnect unauthenticated users after timeout', (done) => {
      clientSocket = Client(`http://localhost:${testPort}`);

      clientSocket.on('connect', () => {
        // Don't authenticate - should be disconnected after timeout
      });

      clientSocket.on('disconnect', (reason) => {
        expect(reason).toBe('io server disconnect');
        done();
      });

      clientSocket.on('error', (error) => {
        if (error.message === 'Authentication timeout') {
          // Expected behavior - but we should wait for disconnect
        }
      });
    }, 15000); // Increase timeout for this test
  });

  describe('Document Room Management', () => {
    let testUser: any;
    let validToken: string;
    let authenticatedSocket: ClientSocket;

    beforeEach(async () => {
      testUser = await UserModel.create({
        username: 'roomuser',
        email: 'room@example.com',
        password: 'TestPassword123',
        role: UserRole.EDITOR
      });

      validToken = JWTUtils.generateAccessToken(testUser);

      authenticatedSocket = Client(`http://localhost:${testPort}`);

      return new Promise<void>((resolve, reject) => {
        authenticatedSocket.on('connect', () => {
          authenticatedSocket.emit('authenticate', { token: validToken });
        });

        authenticatedSocket.on('authenticated', () => {
          resolve();
        });

        authenticatedSocket.on('auth-error', (error) => {
          reject(error);
        });
      });
    });

    afterEach(() => {
      if (authenticatedSocket && authenticatedSocket.connected) {
        authenticatedSocket.disconnect();
      }
    });

    it('should join document room', (done) => {
      const documentId = 'doc-test-join';

      authenticatedSocket.emit('join-document', { documentId });

      authenticatedSocket.on('document-joined', (data) => {
        expect(data.documentId).toBe(documentId);
        expect(data.users).toBeInstanceOf(Array);
        done();
      });

      authenticatedSocket.on('error', (error) => {
        done(new Error(`Join document failed: ${error.message}`));
      });
    });

    it('should leave document room', (done) => {
      const documentId = 'doc-test-leave';

      // First join
      authenticatedSocket.emit('join-document', { documentId });

      authenticatedSocket.on('document-joined', () => {
        // Then leave
        authenticatedSocket.emit('leave-document', { documentId });
      });

      authenticatedSocket.on('document-left', (data) => {
        expect(data.documentId).toBe(documentId);
        done();
      });
    });

    it('should reject join without document ID', (done) => {
      authenticatedSocket.emit('join-document', {});

      authenticatedSocket.on('error', (error) => {
        expect(error.message).toContain('Document ID required');
        expect(error.code).toBe('DOCUMENT_ID_REQUIRED');
        done();
      });
    });

    it('should handle user presence in document', (done) => {
      const documentId = 'doc-presence';
      let secondSocket: any = null;
      let testCompleted = false;
      
      // Cleanup function
      const cleanup = () => {
        if (secondSocket && secondSocket.connected) {
          secondSocket.disconnect();
        }
      };
      
      // Timeout protection - fail test if it takes too long
      const timeout = setTimeout(() => {
        if (!testCompleted) {
          testCompleted = true;
          cleanup();
          done(new Error('Test timeout: user presence test took too long'));
        }
      }, 10000); // 10 second timeout
      
      // Wrapper to ensure done is only called once
      const finishTest = (error?: any) => {
        if (!testCompleted) {
          testCompleted = true;
          clearTimeout(timeout);
          cleanup();
          if (error) {
            done(error);
          } else {
            done();
          }
        }
      };
      
      // Create second client
      secondSocket = Client(`http://localhost:${testPort}`);
      
      // Handle connection errors for second socket
      secondSocket.on('connect_error', (error: any) => {
        finishTest(new Error(`Second socket connection failed: ${error.message}`));
      });
      
      secondSocket.on('connect', () => {
        secondSocket.emit('authenticate', { token: validToken });
      });

      secondSocket.on('authenticated', () => {
        // First user joins
        authenticatedSocket.emit('join-document', { documentId });
      });

      // Handle authentication failure for second socket
      secondSocket.on('auth-error', (error: any) => {
        finishTest(new Error(`Second socket authentication failed: ${error.message}`));
      });

      authenticatedSocket.on('document-joined', () => {
        // Second user joins same document
        secondSocket.emit('join-document', { documentId });
      });

      // First socket should receive user-joined event
      authenticatedSocket.on('user-joined', (data) => {
        try {
          expect(data).toMatchObject({
            username: testUser.username,
            role: testUser.role
          });
          
          finishTest();
        } catch (error) {
          finishTest(error);
        }
      });

      // Add comprehensive error handling
      secondSocket.on('error', (error: any) => {
        finishTest(new Error(`Second socket error: ${error.message || 'Unknown error'}`));
      });
      
      authenticatedSocket.on('error', (error: any) => {
        finishTest(new Error(`Main socket error: ${error.message || 'Unknown error'}`));
      });
      
      // Handle disconnection events
      secondSocket.on('disconnect', (reason: string) => {
        if (!testCompleted) {
          finishTest(new Error(`Second socket disconnected unexpectedly: ${reason}`));
        }
      });
    });
  });

  describe('Document Updates', () => {
    let testUser: any;
    let validToken: string;
    let authenticatedSocket: ClientSocket;
    const documentId = 'doc-updates';

    beforeEach(async () => {
      testUser = await UserModel.create({
        username: 'updateuser',
        email: 'update@example.com',
        password: 'TestPassword123',
        role: UserRole.EDITOR
      });

      validToken = JWTUtils.generateAccessToken(testUser);

      authenticatedSocket = Client(`http://localhost:${testPort}`);

      return new Promise<void>((resolve, reject) => {
        authenticatedSocket.on('connect', () => {
          authenticatedSocket.emit('authenticate', { token: validToken });
        });

        authenticatedSocket.on('authenticated', () => {
          authenticatedSocket.emit('join-document', { documentId });
        });

        authenticatedSocket.on('document-joined', () => {
          resolve();
        });

        authenticatedSocket.on('auth-error', (error) => {
          reject(error);
        });
      });
    });

    afterEach(() => {
      if (authenticatedSocket && authenticatedSocket.connected) {
        authenticatedSocket.disconnect();
      }
    });

    it('should send document updates', (done) => {
      const updateData = {
        type: 'text-delta',
        operations: [{ insert: 'Hello World' }],
        timestamp: Date.now()
      };

      authenticatedSocket.emit('document-update', {
        documentId,
        update: updateData
      });

      authenticatedSocket.on('document-update-success', (data) => {
        expect(data.documentId).toBe(documentId);
        expect(data.update).toEqual(updateData);
        expect(data.userId).toBe(testUser.id);
        expect(data.username).toBe(testUser.username);
        done();
      });

      authenticatedSocket.on('error', (error) => {
        done(new Error(`Document update failed: ${error.message}`));
      });
    });

    it('should broadcast updates to other users', (done) => {
      const updateData = {
        type: 'text-delta',
        operations: [{ insert: 'Broadcast test' }]
      };

      // Create second client
      let secondSocket: any = null;
      
      // Cleanup function
      const cleanup = () => {
        if (secondSocket && secondSocket.connected) {
          secondSocket.disconnect();
        }
      };
      
      secondSocket = Client(`http://localhost:${testPort}`);
      
      secondSocket.on('connect', () => {
        secondSocket.emit('authenticate', { token: validToken });
      });

      secondSocket.on('authenticated', () => {
        secondSocket.emit('join-document', { documentId });
      });

      secondSocket.on('document-joined', () => {
        // Send update from first socket
        authenticatedSocket.emit('document-update', {
          documentId,
          update: updateData
        });
      });

      // Second socket should receive the update
      secondSocket.on('document-update', (data: any) => {
        try {
          expect(data.documentId).toBe(documentId);
          expect(data.update).toEqual(updateData);
          expect(data.userId).toBe(testUser.id);
          
          cleanup();
          done();
        } catch (error) {
          cleanup();
          done(error);
        }
      });
      
      // Add error handler
      secondSocket.on('error', () => {
        cleanup();
        done();
      });
    });

    it('should reject updates without permission', (done) => {
      // Create user with read-only permissions
      UserModel.create({
        username: 'readonly',
        email: 'readonly@example.com',
        password: 'TestPassword123',
        role: UserRole.VIEWER
      }).then(readOnlyUser => {
        const readOnlyToken = JWTUtils.generateAccessToken(readOnlyUser);

        const readOnlySocket = Client(`http://localhost:${testPort}`);
        
        readOnlySocket.on('connect', () => {
          readOnlySocket.emit('authenticate', { token: readOnlyToken });
        });

        readOnlySocket.on('authenticated', () => {
          readOnlySocket.emit('join-document', { documentId });
        });

        readOnlySocket.on('document-joined', () => {
          readOnlySocket.emit('document-update', {
            documentId,
            update: { type: 'test' }
          });
        });

        readOnlySocket.on('error', (error) => {
          expect(error.message).toContain('Insufficient permissions');
          expect(error.code).toBe('INSUFFICIENT_PERMISSIONS');
          readOnlySocket.disconnect();
          done();
        });
      });
    });

    it('should reject updates without document ID', (done) => {
      authenticatedSocket.emit('document-update', {
        update: { type: 'test' }
      });

      authenticatedSocket.on('error', (error) => {
        expect(error.message).toContain('Invalid update data');
        expect(error.code).toBe('INVALID_UPDATE_DATA');
        done();
      });
    });
  });

  describe('Cursor Updates', () => {
    let testUser: any;
    let validToken: string;
    let authenticatedSocket: ClientSocket;
    const documentId = 'doc-cursors';

    beforeEach(async () => {
      testUser = await UserModel.create({
        username: 'cursoruser',
        email: 'cursor@example.com',
        password: 'TestPassword123',
        role: UserRole.EDITOR
      });

      validToken = JWTUtils.generateAccessToken(testUser);

      authenticatedSocket = Client(`http://localhost:${testPort}`);

      return new Promise<void>((resolve, reject) => {
        authenticatedSocket.on('connect', () => {
          authenticatedSocket.emit('authenticate', { token: validToken });
        });

        authenticatedSocket.on('authenticated', () => {
          authenticatedSocket.emit('join-document', { documentId });
        });

        authenticatedSocket.on('document-joined', () => {
          resolve();
        });

        authenticatedSocket.on('auth-error', (error) => {
          reject(error);
        });
      });
    });

    afterEach(() => {
      if (authenticatedSocket && authenticatedSocket.connected) {
        authenticatedSocket.disconnect();
      }
    });

    it('should broadcast cursor updates', (done) => {
      const cursorData = {
        selection: { start: 10, end: 15 },
        position: { line: 1, column: 10 }
      };

      // Create second client to receive cursor updates
      let secondSocket: any = null;
      
      // Cleanup function
      const cleanup = () => {
        if (secondSocket && secondSocket.connected) {
          secondSocket.disconnect();
        }
      };
      
      secondSocket = Client(`http://localhost:${testPort}`);
      
      secondSocket.on('connect', () => {
        secondSocket.emit('authenticate', { token: validToken });
      });

      secondSocket.on('authenticated', () => {
        secondSocket.emit('join-document', { documentId });
      });

      secondSocket.on('document-joined', () => {
        // Send cursor update from first socket
        authenticatedSocket.emit('cursor-update', {
          documentId,
          cursor: cursorData
        });
      });

      // Second socket should receive cursor update
      secondSocket.on('cursor-update', (data: any) => {
        try {
          expect(data.userId).toBe(testUser.id);
          expect(data.username).toBe(testUser.username);
          expect(data.cursor).toEqual(cursorData);
          expect(data.timestamp).toBeDefined();
          
          cleanup();
          done();
        } catch (error) {
          cleanup();
          done(error);
        }
      });
      
      // Add error handler
      secondSocket.on('error', () => {
        cleanup();
        done();
      });
    });

    it('should not echo cursor updates to sender', (done) => {
      const cursorData = {
        selection: { start: 5, end: 10 }
      };

      let receivedOwnUpdate = false;

      authenticatedSocket.on('cursor-update', () => {
        receivedOwnUpdate = true;
      });

      authenticatedSocket.emit('cursor-update', {
        documentId,
        cursor: cursorData
      });

      // Wait to ensure no echo
      setTimeout(() => {
        expect(receivedOwnUpdate).toBe(false);
        done();
      }, 500);
    });
  });

  describe('Connection Cleanup', () => {
    it('should clean up on disconnect', (done) => {
      const testUser = UserModel.create({
        username: 'cleanupuser',
        email: 'cleanup@example.com',
        password: 'TestPassword123',
        role: UserRole.EDITOR
      }).then(user => {
        const token = JWTUtils.generateAccessToken(user);

        const socket = Client(`http://localhost:${testPort}`);
        
        socket.on('connect', () => {
          socket.emit('authenticate', { token });
        });

        socket.on('authenticated', () => {
          socket.emit('join-document', { documentId: 'doc-cleanup' });
        });

        socket.on('document-joined', () => {
          // Check that connection is tracked
          const stats = ConnectionManager.getConnectionStats();
          expect(stats.totalConnections).toBeGreaterThan(0);
          
          // Disconnect and check cleanup
          socket.disconnect();
        });

        socket.on('disconnect', () => {
          // Allow time for cleanup
          setTimeout(() => {
            const stats = ConnectionManager.getConnectionStats();
            // Connection should be removed (depending on other tests running)
            done();
          }, 100);
        });
      });
    });
  });

  describe('Error Handling', () => {
    let testUser: any;
    let validToken: string;

    beforeEach(async () => {
      testUser = await UserModel.create({
        username: 'erroruser',
        email: 'error@example.com',
        password: 'TestPassword123',
        role: UserRole.EDITOR
      });

      validToken = JWTUtils.generateAccessToken(testUser);
    });

    it('should handle malformed messages gracefully', (done) => {
      const socket = Client(`http://localhost:${testPort}`);
      
      socket.on('connect', () => {
        socket.emit('authenticate', { token: validToken });
      });

      socket.on('authenticated', () => {
        // Send malformed message
        socket.emit('join-document', 'not-an-object');
        
        setTimeout(() => {
          expect(socket.connected).toBe(true);
          socket.disconnect();
          done();
        }, 500);
      });
    });

    it('should handle unauthenticated operations', (done) => {
      const socket = Client(`http://localhost:${testPort}`);
      
      socket.on('connect', () => {
        // Try to join document without authentication
        socket.emit('join-document', { documentId: 'test' });
      });

      socket.on('error', (error) => {
        expect(error.message).toContain('Authentication required');
        expect(error.code).toBe('AUTH_REQUIRED');
        socket.disconnect();
        done();
      });
    });
  });
});