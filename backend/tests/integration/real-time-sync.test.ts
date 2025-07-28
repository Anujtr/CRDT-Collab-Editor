import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { UserModel } from '../../src/models/User';
import { UserRole, Permission } from '../../../shared/src/types/auth';
import { JWTUtils } from '../../src/utils/jwt';
import { ConnectionManager } from '../../src/websocket/connectionManager';
import { documentService } from '../../src/services/documentService';
import * as Y from 'yjs';

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
      keys: jest.fn().mockResolvedValue([]),
      multi: jest.fn(() => ({
        zRemRangeByScore: jest.fn().mockReturnThis(),
        zAdd: jest.fn().mockReturnThis(),
        zCard: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([null, null, 0, null])
      }))
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

// Mock metrics service
jest.mock('../../src/services/metricsService', () => ({
  metricsService: {
    recordWebSocketConnection: jest.fn(),
    recordWebSocketMessage: jest.fn(),
    recordWebSocketConnectionDuration: jest.fn(),
    recordDocumentOperation: jest.fn(),
    setCollaboratorCount: jest.fn(),
    incrementDocumentCreated: jest.fn(),
    incrementDocumentUpdate: jest.fn(),
    incrementDocumentDeleted: jest.fn(),
    getDocumentUpdateCount: jest.fn().mockReturnValue(0)
  }
}));

interface TestClient {
  socket: ClientSocket;
  id: string;
  updates: any[];
  cursorUpdates: any[];
  documentState: any;
}

interface MultiClientTestSetup {
  server: {
    httpServer: Server;
    io: SocketIOServer;
    port: number;
  };
  user: any;
  token: string;
  document: any;
  clients: TestClient[];
}

/**
 * Test utilities for multi-client real-time sync testing
 */
class MultiClientTestUtils {
  
  /**
   * Creates a test setup with server, user, and document
   */
  static async createTestSetup(clientCount: number = 2): Promise<MultiClientTestSetup> {
    const testPort = 3001 + Math.floor(Math.random() * 1000);
    
    // Create HTTP server
    const httpServer = new Server();
    
    // Create Socket.IO server
    const io = new SocketIOServer(httpServer, {
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

    // Create test user
    const user = await UserModel.create({
      username: 'syncuser',
      email: 'sync@example.com',
      password: 'TestPassword123',
      role: UserRole.EDITOR
    });

    const token = JWTUtils.generateAccessToken(user);

    // Create test document
    const document = await documentService.createDocument(user.id, 'Multi-Tab Sync Test Document', false);

    // Create clients
    const clients: TestClient[] = [];
    for (let i = 0; i < clientCount; i++) {
      const client: TestClient = {
        socket: Client(`http://localhost:${testPort}`),
        id: `client-${i}`,
        updates: [],
        cursorUpdates: [],
        documentState: null
      };
      clients.push(client);
    }

    return {
      server: { httpServer, io, port: testPort },
      user,
      token,
      document,
      clients
    };
  }

  /**
   * Connects and authenticates a client
   */
  static async connectClient(client: TestClient, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Client ${client.id} connection timeout`));
      }, 10000);

      client.socket.on('connect', () => {
        client.socket.emit('authenticate', { token });
      });

      client.socket.on('authenticated', () => {
        clearTimeout(timeout);
        resolve();
      });

      client.socket.on('auth-error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Client ${client.id} auth failed: ${error.message}`));
      });

      client.socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Client ${client.id} connection failed: ${error.message}`));
      });
    });
  }

  /**
   * Joins a client to a document and sets up event listeners
   */
  static async joinClientToDocument(client: TestClient, documentId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Client ${client.id} join document timeout`));
      }, 10000);

      // Set up event listeners for tracking updates
      client.socket.on('document-update', (data) => {
        client.updates.push(data);
      });

      client.socket.on('cursor-update', (data) => {
        client.cursorUpdates.push(data);
      });

      client.socket.on('document-joined', (data) => {
        client.documentState = data;
        clearTimeout(timeout);
        resolve();
      });

      client.socket.emit('join-document', { documentId });
    });
  }

  /**
   * Sends a document update from a client
   */
  static async sendUpdate(client: TestClient, documentId: string, updateData: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Client ${client.id} update timeout`));
      }, 5000);

      client.socket.once('document-update-success', () => {
        clearTimeout(timeout);
        resolve();
      });

      client.socket.once('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Client ${client.id} update failed: ${error.message}`));
      });

      client.socket.emit('document-update', {
        documentId,
        update: updateData
      });
    });
  }

  /**
   * Waits for all clients to receive a specific number of updates
   */
  static async waitForUpdates(clients: TestClient[], expectedCount: number, timeoutMs: number = 5000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const allReceived = clients.every(client => client.updates.length >= expectedCount);
      if (allReceived) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Timeout waiting for updates. Expected: ${expectedCount}, Received: ${clients.map(c => c.updates.length)}`);
  }

  /**
   * Simulates network interruption for a client
   */
  static async simulateNetworkInterruption(client: TestClient, durationMs: number = 1000): Promise<void> {
    client.socket.disconnect();
    await new Promise(resolve => setTimeout(resolve, durationMs));
    client.socket.connect();
  }

  /**
   * Cleanup test setup
   */
  static async cleanup(setup: MultiClientTestSetup): Promise<void> {
    // Disconnect all clients
    for (const client of setup.clients) {
      if (client.socket.connected) {
        client.socket.disconnect();
      }
    }

    // Close server
    if (setup.server.io) {
      setup.server.io.close();
    }
    if (setup.server.httpServer) {
      setup.server.httpServer.close();
    }

    // Clean up models
    UserModel.clear();
    ConnectionManager.cleanup();
    documentService.clearForTesting();
  }

  /**
   * Creates a Yjs document update for testing
   */
  static createYjsUpdate(text: string): Uint8Array {
    const doc = new Y.Doc();
    const yText = doc.getText('content');
    yText.insert(0, text);
    return Y.encodeStateAsUpdate(doc);
  }

  /**
   * Verifies that all clients have consistent document state
   */
  static verifyDocumentConsistency(clients: TestClient[]): boolean {
    if (clients.length < 2) return true;

    const firstClientUpdates = clients[0].updates;
    return clients.every(client => {
      return client.updates.length === firstClientUpdates.length &&
             client.updates.every((update, index) => {
               const firstUpdate = firstClientUpdates[index];
               return update.documentId === firstUpdate.documentId &&
                      JSON.stringify(update.update) === JSON.stringify(firstUpdate.update);
             });
    });
  }
}

describe('Real-Time Multi-Tab Sync Integration Tests', () => {
  let testSetup: MultiClientTestSetup;

  beforeEach(async () => {
    // Clean up before each test
    UserModel.clear();
    ConnectionManager.cleanup();
    await UserModel.initialize();
  });

  afterEach(async () => {
    if (testSetup) {
      await MultiClientTestUtils.cleanup(testSetup);
    }
  });

  describe('Basic Multi-Tab Sync', () => {
    it('should sync simple text updates between two tabs', async () => {
      testSetup = await MultiClientTestUtils.createTestSetup(2);
      const [client1, client2] = testSetup.clients;

      // Connect and authenticate both clients
      await Promise.all([
        MultiClientTestUtils.connectClient(client1, testSetup.token),
        MultiClientTestUtils.connectClient(client2, testSetup.token)
      ]);

      // Join both clients to the same document
      await Promise.all([
        MultiClientTestUtils.joinClientToDocument(client1, testSetup.document.id),
        MultiClientTestUtils.joinClientToDocument(client2, testSetup.document.id)
      ]);

      // Client 1 sends an update
      const updateData = Array.from(MultiClientTestUtils.createYjsUpdate('Hello World'));
      await MultiClientTestUtils.sendUpdate(client1, testSetup.document.id, updateData);

      // Wait for client 2 to receive the update
      await MultiClientTestUtils.waitForUpdates([client2], 1);

      // Verify the update was received
      expect(client2.updates).toHaveLength(1);
      expect(client2.updates[0].documentId).toBe(testSetup.document.id);
      expect(client2.updates[0].userId).toBe(testSetup.user.id);
      expect(client2.updates[0].update).toEqual(updateData);
    }, 15000);

    it('should sync bidirectional updates between multiple tabs', async () => {
      testSetup = await MultiClientTestUtils.createTestSetup(3);
      const [client1, client2, client3] = testSetup.clients;

      // Connect all clients
      await Promise.all([
        MultiClientTestUtils.connectClient(client1, testSetup.token),
        MultiClientTestUtils.connectClient(client2, testSetup.token),
        MultiClientTestUtils.connectClient(client3, testSetup.token)
      ]);

      // Join all clients to the document
      await Promise.all([
        MultiClientTestUtils.joinClientToDocument(client1, testSetup.document.id),
        MultiClientTestUtils.joinClientToDocument(client2, testSetup.document.id),
        MultiClientTestUtils.joinClientToDocument(client3, testSetup.document.id)
      ]);

      // Send updates from different clients
      const update1 = Array.from(MultiClientTestUtils.createYjsUpdate('Update from client 1'));
      const update2 = Array.from(MultiClientTestUtils.createYjsUpdate('Update from client 2'));
      const update3 = Array.from(MultiClientTestUtils.createYjsUpdate('Update from client 3'));

      await MultiClientTestUtils.sendUpdate(client1, testSetup.document.id, update1);
      await MultiClientTestUtils.sendUpdate(client2, testSetup.document.id, update2);
      await MultiClientTestUtils.sendUpdate(client3, testSetup.document.id, update3);

      // Wait for all clients to receive all updates
      await MultiClientTestUtils.waitForUpdates(testSetup.clients, 2); // Each client should receive 2 updates from others

      // Verify all clients received updates from others
      expect(client1.updates).toHaveLength(2); // Should receive updates from client2 and client3
      expect(client2.updates).toHaveLength(2); // Should receive updates from client1 and client3
      expect(client3.updates).toHaveLength(2); // Should receive updates from client1 and client2

      // Verify update contents
      const client1UpdateData = client1.updates.map(u => u.update);
      expect(client1UpdateData).toContainEqual(update2);
      expect(client1UpdateData).toContainEqual(update3);
    }, 20000);

    it('should handle rapid sequential updates correctly', async () => {
      testSetup = await MultiClientTestUtils.createTestSetup(2);
      const [client1, client2] = testSetup.clients;

      await Promise.all([
        MultiClientTestUtils.connectClient(client1, testSetup.token),
        MultiClientTestUtils.connectClient(client2, testSetup.token)
      ]);

      await Promise.all([
        MultiClientTestUtils.joinClientToDocument(client1, testSetup.document.id),
        MultiClientTestUtils.joinClientToDocument(client2, testSetup.document.id)
      ]);

      // Send multiple rapid updates from client1
      const updates = [];
      for (let i = 0; i < 5; i++) {
        const update = Array.from(MultiClientTestUtils.createYjsUpdate(`Rapid update ${i}`));
        updates.push(update);
        await MultiClientTestUtils.sendUpdate(client1, testSetup.document.id, update);
      }

      // Wait for client2 to receive all updates
      await MultiClientTestUtils.waitForUpdates([client2], 5);

      // Verify all updates were received in order
      expect(client2.updates).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        expect(client2.updates[i].update).toEqual(updates[i]);
      }
    }, 15000);
  });

  describe('Connection Resilience', () => {
    it('should recover sync after network interruption', async () => {
      testSetup = await MultiClientTestUtils.createTestSetup(2);
      const [client1, client2] = testSetup.clients;

      await Promise.all([
        MultiClientTestUtils.connectClient(client1, testSetup.token),
        MultiClientTestUtils.connectClient(client2, testSetup.token)
      ]);

      await Promise.all([
        MultiClientTestUtils.joinClientToDocument(client1, testSetup.document.id),
        MultiClientTestUtils.joinClientToDocument(client2, testSetup.document.id)
      ]);

      // Send initial update
      const update1 = Array.from(MultiClientTestUtils.createYjsUpdate('Before interruption'));
      await MultiClientTestUtils.sendUpdate(client1, testSetup.document.id, update1);
      await MultiClientTestUtils.waitForUpdates([client2], 1);

      // Simulate network interruption for client2
      await MultiClientTestUtils.simulateNetworkInterruption(client2, 2000);

      // Wait for client2 to reconnect and re-authenticate
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Reconnect client2
      await MultiClientTestUtils.connectClient(client2, testSetup.token);
      await MultiClientTestUtils.joinClientToDocument(client2, testSetup.document.id);

      // Send another update after reconnection
      const update2 = Array.from(MultiClientTestUtils.createYjsUpdate('After reconnection'));
      await MultiClientTestUtils.sendUpdate(client1, testSetup.document.id, update2);

      // Wait for update to sync
      await MultiClientTestUtils.waitForUpdates([client2], 1, 10000);

      // Verify client2 received the post-reconnection update
      expect(client2.updates.length).toBeGreaterThan(0);
      const lastUpdate = client2.updates[client2.updates.length - 1];
      expect(lastUpdate.update).toEqual(update2);
    }, 30000);

    it('should handle authentication timeout gracefully', async () => {
      testSetup = await MultiClientTestUtils.createTestSetup(1);
      const [client1] = testSetup.clients;

      // Connect but don't authenticate immediately
      const connectPromise = new Promise((resolve, reject) => {
        client1.socket.on('connect', () => {
          // Don't send auth immediately - wait for timeout
        });

        client1.socket.on('error', (error) => {
          if (error.message === 'Authentication timeout') {
            resolve(error);
          } else {
            reject(error);
          }
        });

        client1.socket.on('disconnect', (reason) => {
          if (reason === 'io server disconnect') {
            resolve({ message: 'Authentication timeout' });
          }
        });
      });

      // Should timeout and disconnect
      await expect(connectPromise).resolves.toBeTruthy();
    }, 15000);
  });

  describe('Cursor Updates', () => {
    it('should sync cursor positions between tabs', async () => {
      testSetup = await MultiClientTestUtils.createTestSetup(2);
      const [client1, client2] = testSetup.clients;

      await Promise.all([
        MultiClientTestUtils.connectClient(client1, testSetup.token),
        MultiClientTestUtils.connectClient(client2, testSetup.token)
      ]);

      await Promise.all([
        MultiClientTestUtils.joinClientToDocument(client1, testSetup.document.id),
        MultiClientTestUtils.joinClientToDocument(client2, testSetup.document.id)
      ]);

      // Send cursor update from client1
      const cursorData = {
        selection: { start: 10, end: 15 },
        position: { line: 1, column: 10 }
      };

      client1.socket.emit('cursor-update', {
        documentId: testSetup.document.id,
        cursor: cursorData
      });

      // Wait for cursor update to be received by client2
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(client2.cursorUpdates).toHaveLength(1);
      expect(client2.cursorUpdates[0].cursor).toEqual(cursorData);
      expect(client2.cursorUpdates[0].userId).toBe(testSetup.user.id);
    }, 10000);

    it('should not echo cursor updates to sender', async () => {
      testSetup = await MultiClientTestUtils.createTestSetup(1);
      const [client1] = testSetup.clients;

      await MultiClientTestUtils.connectClient(client1, testSetup.token);
      await MultiClientTestUtils.joinClientToDocument(client1, testSetup.document.id);

      const cursorData = { selection: { start: 5, end: 10 } };

      client1.socket.emit('cursor-update', {
        documentId: testSetup.document.id,
        cursor: cursorData
      });

      // Wait to ensure no echo
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(client1.cursorUpdates).toHaveLength(0);
    }, 10000);
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed updates gracefully', async () => {
      testSetup = await MultiClientTestUtils.createTestSetup(1);
      const [client1] = testSetup.clients;

      await MultiClientTestUtils.connectClient(client1, testSetup.token);
      await MultiClientTestUtils.joinClientToDocument(client1, testSetup.document.id);

      // Send malformed update
      const errorPromise = new Promise(resolve => {
        client1.socket.once('error', resolve);
      });

      client1.socket.emit('document-update', {
        documentId: testSetup.document.id,
        update: 'invalid-update-data'
      });

      const error = await errorPromise;
      expect(error).toBeTruthy();
    }, 10000);

    it('should maintain connection after server errors', async () => {
      testSetup = await MultiClientTestUtils.createTestSetup(1);
      const [client1] = testSetup.clients;

      await MultiClientTestUtils.connectClient(client1, testSetup.token);
      await MultiClientTestUtils.joinClientToDocument(client1, testSetup.document.id);

      // Send invalid update to trigger server error
      client1.socket.emit('document-update', {
        documentId: 'non-existent-document',
        update: Array.from(MultiClientTestUtils.createYjsUpdate('test'))
      });

      // Wait for error
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Connection should still be active
      expect(client1.socket.connected).toBe(true);

      // Should still be able to send valid updates
      const validUpdate = Array.from(MultiClientTestUtils.createYjsUpdate('valid update'));
      await expect(
        MultiClientTestUtils.sendUpdate(client1, testSetup.document.id, validUpdate)
      ).resolves.not.toThrow();
    }, 10000);
  });

  describe('Performance and Load', () => {
    it('should handle multiple simultaneous clients efficiently', async () => {
      const clientCount = 5;
      testSetup = await MultiClientTestUtils.createTestSetup(clientCount);

      // Connect all clients
      await Promise.all(
        testSetup.clients.map(client => 
          MultiClientTestUtils.connectClient(client, testSetup.token)
        )
      );

      // Join all clients to document
      await Promise.all(
        testSetup.clients.map(client => 
          MultiClientTestUtils.joinClientToDocument(client, testSetup.document.id)
        )
      );

      // Send updates from all clients simultaneously
      const updatePromises = testSetup.clients.map((client, index) => {
        const update = Array.from(MultiClientTestUtils.createYjsUpdate(`Update from client ${index}`));
        return MultiClientTestUtils.sendUpdate(client, testSetup.document.id, update);
      });

      await Promise.all(updatePromises);

      // Each client should receive updates from all other clients
      await MultiClientTestUtils.waitForUpdates(testSetup.clients, clientCount - 1, 10000);

      // Verify all clients received all updates
      testSetup.clients.forEach(client => {
        expect(client.updates).toHaveLength(clientCount - 1);
      });
    }, 25000);

    it('should handle large document updates efficiently', async () => {
      testSetup = await MultiClientTestUtils.createTestSetup(2);
      const [client1, client2] = testSetup.clients;

      await Promise.all([
        MultiClientTestUtils.connectClient(client1, testSetup.token),
        MultiClientTestUtils.connectClient(client2, testSetup.token)
      ]);

      await Promise.all([
        MultiClientTestUtils.joinClientToDocument(client1, testSetup.document.id),
        MultiClientTestUtils.joinClientToDocument(client2, testSetup.document.id)
      ]);

      // Create large update (10KB of text)
      const largeText = 'A'.repeat(10000);
      const largeUpdate = Array.from(MultiClientTestUtils.createYjsUpdate(largeText));

      const startTime = Date.now();
      await MultiClientTestUtils.sendUpdate(client1, testSetup.document.id, largeUpdate);
      await MultiClientTestUtils.waitForUpdates([client2], 1);
      const endTime = Date.now();

      // Should complete within reasonable time (5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);
      expect(client2.updates[0].update).toEqual(largeUpdate);
    }, 15000);
  });
});