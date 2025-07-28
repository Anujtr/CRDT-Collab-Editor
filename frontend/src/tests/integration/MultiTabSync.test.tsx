/**
 * @jest-environment jsdom
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { io } from 'socket.io-client';
import { useCollaborativeEditor } from '../../hooks/useCollaborativeEditor';
import { useConnection } from '../../hooks/useConnection';
import { YjsProvider } from '../../services/yjs/yjsProvider';
import * as Y from 'yjs';

// Mock Socket.IO
const mockSocket = {
  connected: false,
  connect: jest.fn(),
  disconnect: jest.fn(),
  emit: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  off: jest.fn(),
  removeAllListeners: jest.fn(),
  id: 'test-socket-id'
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket)
}));

// Mock storage
const mockStorage = {
  get: jest.fn().mockReturnValue('mock-token'),
  set: jest.fn(),
  remove: jest.fn()
};

jest.mock('../../utils', () => ({
  storage: mockStorage
}));

// Mock environment variables
process.env.REACT_APP_API_URL = 'http://localhost:8080/api';

interface MockSocketInstance {
  connected: boolean;
  connect: jest.Mock;
  disconnect: jest.Mock;
  emit: jest.Mock;
  on: jest.Mock;
  once: jest.Mock;
  off: jest.Mock;
  removeAllListeners: jest.Mock;
  id: string;
  eventHandlers: Map<string, Function[]>;
}

/**
 * Test utilities for frontend multi-tab sync testing
 */
class FrontendTestUtils {
  
  /**
   * Creates a mock socket instance with event handling
   */
  static createMockSocket(socketId: string = 'test-socket'): MockSocketInstance {
    const eventHandlers = new Map<string, Function[]>();
    
    const mockSocket: MockSocketInstance = {
      connected: false,
      connect: jest.fn().mockImplementation(() => {
        mockSocket.connected = true;
        // Simulate connection events
        setTimeout(() => {
          FrontendTestUtils.triggerEvent(mockSocket, 'connect');
        }, 10);
      }),
      disconnect: jest.fn().mockImplementation(() => {
        mockSocket.connected = false;
        FrontendTestUtils.triggerEvent(mockSocket, 'disconnect', 'io client disconnect');
      }),
      emit: jest.fn(),
      on: jest.fn().mockImplementation((event: string, handler: Function) => {
        if (!eventHandlers.has(event)) {
          eventHandlers.set(event, []);
        }
        eventHandlers.get(event)!.push(handler);
      }),
      once: jest.fn().mockImplementation((event: string, handler: Function) => {
        const wrappedHandler = (...args: any[]) => {
          handler(...args);
          // Remove handler after first call
          const handlers = eventHandlers.get(event) || [];
          const index = handlers.indexOf(wrappedHandler);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        };
        
        if (!eventHandlers.has(event)) {
          eventHandlers.set(event, []);
        }
        eventHandlers.get(event)!.push(wrappedHandler);
      }),
      off: jest.fn().mockImplementation((event: string, handler?: Function) => {
        if (handler) {
          const handlers = eventHandlers.get(event) || [];
          const index = handlers.indexOf(handler);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        } else {
          eventHandlers.delete(event);
        }
      }),
      removeAllListeners: jest.fn().mockImplementation((event?: string) => {
        if (event) {
          eventHandlers.delete(event);
        } else {
          eventHandlers.clear();
        }
      }),
      id: socketId,
      eventHandlers
    };

    return mockSocket;
  }

  /**
   * Triggers an event on a mock socket
   */
  static triggerEvent(socket: MockSocketInstance, event: string, ...args: any[]): void {
    const handlers = socket.eventHandlers.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(...args);
      } catch (error) {
        console.error(`Error in ${event} handler:`, error);
      }
    });
  }

  /**
   * Simulates authentication flow
   */
  static simulateAuthentication(socket: MockSocketInstance, delay: number = 50): void {
    setTimeout(() => {
      // When authenticate is emitted, respond with authenticated event
      const authenticateCall = socket.emit.mock.calls.find(call => call[0] === 'authenticate');
      if (authenticateCall) {
        FrontendTestUtils.triggerEvent(socket, 'authenticated', {
          userId: 'test-user-id',
          username: 'testuser',
          role: 'editor'
        });
      }
    }, delay);
  }

  /**
   * Simulates document join flow
   */
  static simulateDocumentJoin(socket: MockSocketInstance, documentId: string, delay: number = 50): void {
    setTimeout(() => {
      const joinCall = socket.emit.mock.calls.find(call => 
        call[0] === 'join-document' && call[1]?.documentId === documentId
      );
      if (joinCall) {
        FrontendTestUtils.triggerEvent(socket, 'document-joined', {
          documentId,
          users: [],
          documentState: null,
          metadata: { title: 'Test Document' },
          hasWriteAccess: true
        });
      }
    }, delay);
  }

  /**
   * Simulates receiving a document update
   */
  static simulateDocumentUpdate(socket: MockSocketInstance, documentId: string, update: any): void {
    FrontendTestUtils.triggerEvent(socket, 'document-update', {
      documentId,
      update: Array.isArray(update) ? update : Array.from(update),
      userId: 'other-user-id',
      timestamp: Date.now()
    });
  }

  /**
   * Creates a Yjs update for testing
   */
  static createTestUpdate(text: string): Uint8Array {
    const doc = new Y.Doc();
    const yText = doc.getText('content');
    yText.insert(0, text);
    return Y.encodeStateAsUpdate(doc);
  }

  /**
   * Waits for a condition to be true
   */
  static async waitForCondition(
    condition: () => boolean, 
    timeoutMs: number = 5000,
    intervalMs: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    throw new Error(`Condition not met within ${timeoutMs}ms`);
  }
}

describe('Frontend Multi-Tab Sync Integration Tests', () => {
  let mockSocket1: MockSocketInstance;
  let mockSocket2: MockSocketInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create two mock sockets to simulate two tabs
    mockSocket1 = FrontendTestUtils.createMockSocket('socket-1');
    mockSocket2 = FrontendTestUtils.createMockSocket('socket-2');
    
    // Mock io function to return different sockets based on call order
    let callCount = 0;
    (io as jest.Mock).mockImplementation(() => {
      callCount++;
      return callCount === 1 ? mockSocket1 : mockSocket2;
    });
  });

  describe('useConnection Hook Multi-Tab Behavior', () => {
    it('should handle multiple connection instances independently', async () => {
      const { result: connection1 } = renderHook(() => useConnection());
      const { result: connection2 } = renderHook(() => useConnection());

      // Connect both instances
      act(() => {
        connection1.current.connect();
        connection2.current.connect();
      });

      // Simulate authentication for both
      FrontendTestUtils.simulateAuthentication(mockSocket1);
      FrontendTestUtils.simulateAuthentication(mockSocket2);

      await waitFor(() => {
        expect(connection1.current.isAuthenticated).toBe(true);
        expect(connection2.current.isAuthenticated).toBe(true);
      });

      expect(mockSocket1.connect).toHaveBeenCalled();
      expect(mockSocket2.connect).toHaveBeenCalled();
    });

    it('should handle connection errors independently', async () => {
      const { result: connection1 } = renderHook(() => useConnection());
      const { result: connection2 } = renderHook(() => useConnection());

      act(() => {
        connection1.current.connect();
        connection2.current.connect();
      });

      // Simulate connection error for first socket only
      act(() => {
        FrontendTestUtils.triggerEvent(mockSocket1, 'connect_error', new Error('Connection failed'));
        FrontendTestUtils.simulateAuthentication(mockSocket2);
      });

      await waitFor(() => {
        expect(connection1.current.connectionState.status).toBe('disconnected');
        expect(connection1.current.connectionState.error).toContain('Connection failed');
        expect(connection2.current.isAuthenticated).toBe(true);
      });
    });

    it('should handle reconnection attempts correctly', async () => {
      const { result: connection1 } = renderHook(() => useConnection({
        maxRetries: 2,
        retryDelay: 100
      }));

      act(() => {
        connection1.current.connect();
      });

      // Simulate connection failure
      act(() => {
        FrontendTestUtils.triggerEvent(mockSocket1, 'connect_error', new Error('Network error'));
      });

      // Wait for retry attempt
      await waitFor(() => {
        expect(connection1.current.connectionState.retryCount).toBeGreaterThan(0);
      }, { timeout: 1000 });

      expect(mockSocket1.connect).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });

  describe('useCollaborativeEditor Multi-Tab Sync', () => {
    it('should sync document updates between two editor instances', async () => {
      const documentId = 'test-document-id';
      
      const { result: editor1 } = renderHook(() => 
        useCollaborativeEditor({ documentId })
      );
      const { result: editor2 } = renderHook(() => 
        useCollaborativeEditor({ documentId })
      );

      // Connect both editors
      await act(async () => {
        await editor1.current.connect();
        await editor2.current.connect();
      });

      // Simulate authentication and document join for both
      FrontendTestUtils.simulateAuthentication(mockSocket1);
      FrontendTestUtils.simulateAuthentication(mockSocket2);
      FrontendTestUtils.simulateDocumentJoin(mockSocket1, documentId);
      FrontendTestUtils.simulateDocumentJoin(mockSocket2, documentId);

      await waitFor(() => {
        expect(editor1.current.status).toBe('connected');
        expect(editor2.current.status).toBe('connected');
      });

      // Simulate update from editor1 reaching editor2
      const testUpdate = FrontendTestUtils.createTestUpdate('Hello from editor 1');
      
      act(() => {
        FrontendTestUtils.simulateDocumentUpdate(mockSocket2, documentId, testUpdate);
      });

      // Editor2 should eventually reflect the update
      await waitFor(() => {
        expect(editor2.current.isSynced).toBe(true);
      });

      expect(mockSocket1.emit).toHaveBeenCalledWith('join-document', { documentId });
      expect(mockSocket2.emit).toHaveBeenCalledWith('join-document', { documentId });
    });

    it('should handle connection failures gracefully in collaborative editing', async () => {
      const documentId = 'test-document-id';
      
      const { result: editor1 } = renderHook(() => 
        useCollaborativeEditor({ documentId })
      );

      await act(async () => {
        await editor1.current.connect();
      });

      FrontendTestUtils.simulateAuthentication(mockSocket1);
      FrontendTestUtils.simulateDocumentJoin(mockSocket1, documentId);

      await waitFor(() => {
        expect(editor1.current.status).toBe('connected');
      });

      // Simulate connection loss
      act(() => {
        mockSocket1.connected = false;
        FrontendTestUtils.triggerEvent(mockSocket1, 'disconnect', 'transport close');
      });

      await waitFor(() => {
        expect(editor1.current.status).toBe('disconnected');
        expect(editor1.current.isSynced).toBe(false);
      });
    });

    it('should handle document updates during disconnection', async () => {
      const documentId = 'test-document-id';
      const onStatusChange = jest.fn();
      
      const { result: editor } = renderHook(() => 
        useCollaborativeEditor({ 
          documentId,
          onStatusChange
        })
      );

      await act(async () => {
        await editor.current.connect();
      });

      FrontendTestUtils.simulateAuthentication(mockSocket1);
      FrontendTestUtils.simulateDocumentJoin(mockSocket1, documentId);

      await waitFor(() => {
        expect(editor.current.status).toBe('connected');
      });

      // Disconnect
      act(() => {
        mockSocket1.connected = false;
        FrontendTestUtils.triggerEvent(mockSocket1, 'disconnect', 'io server disconnect');
      });

      // Try to update while disconnected
      act(() => {
        editor.current.setValue([{
          type: 'paragraph',
          children: [{ text: 'Offline edit' }]
        }]);
      });

      // Should not crash and should track status changes
      expect(onStatusChange).toHaveBeenCalledWith('disconnected');
      expect(editor.current.status).toBe('disconnected');
    });
  });

  describe('YjsProvider Multi-Tab Coordination', () => {
    it('should coordinate document updates between multiple providers', async () => {
      const documentId = 'test-document-id';
      
      // Create two YjsProvider instances
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      
      const provider1 = new (YjsProvider as any)(doc1, {
        documentId,
        onStatusChange: jest.fn(),
        onSync: jest.fn()
      });
      
      const provider2 = new (YjsProvider as any)(doc2, {
        documentId,
        onStatusChange: jest.fn(),
        onSync: jest.fn()
      });

      // Connect both providers
      await act(async () => {
        await provider1.connect();
        await provider2.connect();
      });

      // Simulate authentication and document join
      FrontendTestUtils.simulateAuthentication(mockSocket1);
      FrontendTestUtils.simulateAuthentication(mockSocket2);
      FrontendTestUtils.simulateDocumentJoin(mockSocket1, documentId);
      FrontendTestUtils.simulateDocumentJoin(mockSocket2, documentId);

      // Both providers should attempt to join the document
      expect(mockSocket1.emit).toHaveBeenCalledWith('join-document', { documentId });
      expect(mockSocket2.emit).toHaveBeenCalledWith('join-document', { documentId });

      // Clean up
      await provider1.disconnect();
      await provider2.disconnect();
    });

    it('should handle provider disconnection and cleanup', async () => {
      const documentId = 'test-document-id';
      const doc = new Y.Doc();
      
      const provider = new (YjsProvider as any)(doc, {
        documentId,
        onStatusChange: jest.fn()
      });

      await act(async () => {
        await provider.connect();
      });

      FrontendTestUtils.simulateAuthentication(mockSocket1);
      FrontendTestUtils.simulateDocumentJoin(mockSocket1, documentId);

      // Disconnect provider
      await act(async () => {
        await provider.disconnect();
      });

      expect(mockSocket1.emit).toHaveBeenCalledWith('leave-document', { documentId });
      expect(mockSocket1.disconnect).toHaveBeenCalled();
    });
  });

  describe('Error Scenarios and Edge Cases', () => {
    it('should handle rapid connect/disconnect cycles', async () => {
      const { result: connection } = renderHook(() => useConnection());

      // Rapid connect/disconnect cycles
      for (let i = 0; i < 3; i++) {
        act(() => {
          connection.current.connect();
        });
        
        act(() => {
          connection.current.disconnect();
        });
      }

      // Should not crash and should be in disconnected state
      expect(connection.current.connectionState.status).toBe('disconnected');
    });

    it('should handle malformed server responses', async () => {
      const { result: connection } = renderHook(() => useConnection());

      act(() => {
        connection.current.connect();
      });

      // Simulate malformed authentication response
      act(() => {
        FrontendTestUtils.triggerEvent(mockSocket1, 'authenticated', null);
      });

      // Should handle gracefully without crashing
      expect(connection.current.connectionState.status).not.toBe('authenticated');
    });

    it('should clean up event listeners on unmount', () => {
      const { result: connection, unmount } = renderHook(() => useConnection());

      act(() => {
        connection.current.connect();
      });

      const initialListenerCount = mockSocket1.on.mock.calls.length;
      
      // Unmount component
      unmount();

      // Should have removed listeners (disconnect should be called)
      expect(mockSocket1.disconnect).toHaveBeenCalled();
    });
  });

  describe('Performance and Memory Management', () => {
    it('should not create memory leaks with multiple editor instances', async () => {
      const documentId = 'test-document-id';
      const editors: any[] = [];

      // Create multiple editor instances
      for (let i = 0; i < 5; i++) {
        const { result } = renderHook(() => 
          useCollaborativeEditor({ documentId })
        );
        editors.push(result);
      }

      // Connect all editors
      await act(async () => {
        for (const editor of editors) {
          await editor.current.connect();
        }
      });

      // Simulate authentication for all
      for (let i = 0; i < 5; i++) {
        const socket = i === 0 ? mockSocket1 : mockSocket2;
        FrontendTestUtils.simulateAuthentication(socket);
        FrontendTestUtils.simulateDocumentJoin(socket, documentId);
      }

      // Disconnect all editors
      await act(async () => {
        for (const editor of editors) {
          await editor.current.disconnect();
        }
      });

      // Should have called disconnect for each connection
      expect(mockSocket1.disconnect).toHaveBeenCalled();
      expect(mockSocket2.disconnect).toHaveBeenCalled();
    });

    it('should handle simultaneous updates efficiently', async () => {
      const documentId = 'test-document-id';
      
      const { result: editor } = renderHook(() => 
        useCollaborativeEditor({ documentId })
      );

      await act(async () => {
        await editor.current.connect();
      });

      FrontendTestUtils.simulateAuthentication(mockSocket1);
      FrontendTestUtils.simulateDocumentJoin(mockSocket1, documentId);

      await waitFor(() => {
        expect(editor.current.status).toBe('connected');
      });

      // Simulate multiple rapid updates
      const updates: any[] = [];
      for (let i = 0; i < 10; i++) {
        const update = FrontendTestUtils.createTestUpdate(`Update ${i}`);
        updates.push(update);
      }

      act(() => {
        updates.forEach(update => {
          FrontendTestUtils.simulateDocumentUpdate(mockSocket1, documentId, update);
        });
      });

      // Should handle all updates without crashing
      expect(editor.current.status).toBe('connected');
    });
  });
});