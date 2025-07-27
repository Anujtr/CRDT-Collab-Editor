import * as Y from 'yjs';
import { io, Socket } from 'socket.io-client';
import { storage } from '../../utils';

// Utility function to wait until a condition is met with detailed logging
const waitUntil = (
  condition: () => boolean, 
  timeout: number = 5000, 
  description: string = 'condition'
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let attempts = 0;
    
    const check = () => {
      attempts++;
      const elapsed = Date.now() - startTime;
      
      console.log(`waitUntil: Checking ${description} (attempt ${attempts}, elapsed: ${elapsed}ms)`);
      
      if (condition()) {
        console.log(`waitUntil: ${description} satisfied after ${elapsed}ms`);
        resolve();
      } else if (elapsed > timeout) {
        console.error(`waitUntil: ${description} timeout after ${timeout}ms (${attempts} attempts)`);
        reject(new Error(`waitUntil timeout after ${timeout}ms checking: ${description}`));
      } else {
        // Exponential backoff with max 200ms
        const delay = Math.min(50 + Math.floor(attempts * 10), 200);
        setTimeout(check, delay);
      }
    };
    
    check();
  });
};

interface YjsProviderOptions {
  documentId: string;
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  onUpdate?: (update: Uint8Array, origin: any) => void;
  onSync?: (isSynced: boolean) => void;
}

export class YjsProvider {
  private socket: Socket | null = null;
  private doc: Y.Doc;
  private documentId: string;
  private status: 'connecting' | 'connected' | 'disconnected' | 'error' = 'disconnected';
  private authStatus: 'pending' | 'authenticated' | 'failed' = 'pending';
  private options: YjsProviderOptions;
  private updateHandler: ((update: Uint8Array, origin: any) => void) | null = null;
  private isSynced = false;

  constructor(doc: Y.Doc, options: YjsProviderOptions) {
    this.doc = doc;
    this.documentId = options.documentId;
    this.options = options;

    this.setupDocumentHandlers();
  }

  private setupDocumentHandlers(): void {
    // Listen for local document updates
    this.updateHandler = (update: Uint8Array, origin: any) => {
      // Don't send updates back to the server if they originated from the server
      if (origin === this) {
        return;
      }

      // Send update to server via WebSocket
      if (this.socket && this.status === 'connected') {
        this.socket.emit('document-update', {
          documentId: this.documentId,
          update: Array.from(update)
        });
      }

      // Notify options callback
      this.options.onUpdate?.(update, origin);
    };

    this.doc.on('update', this.updateHandler);
  }

  async connect(): Promise<void> {
    if (this.socket) {
      return;
    }

    try {
      this.setStatus('connecting');

      // Get authentication token
      const token = storage.get('crdt-auth-token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // Create socket connection - use same config as main app
      const socketUrl = process.env.REACT_APP_API_URL?.replace(/\/api$/, '') || 'http://localhost:8080';
      console.log('YjsProvider: Creating socket to:', socketUrl);
      
      const socket = io(socketUrl, {
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        auth: {
          token
        },
        autoConnect: false,
        forceNew: true,
        timeout: 10000,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
      });

      if (!socket) {
        throw new Error('Failed to create socket instance');
      }

      this.socket = socket;
      console.log('YjsProvider: Socket created, setting up handlers...');
      this.setupSocketHandlers(socket);
      
      // Add delay before connecting to ensure backend is ready
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Connect first, then authenticate (use local reference in case this.socket was cleared)
      console.log('YjsProvider: Connecting to socket...');
      console.log('YjsProvider: Socket status:', socket ? 'exists' : 'null');
      if (!socket) {
        throw new Error('Socket is null before connect');
      }
      socket.connect();

      // Wait for connection, then authenticate
      await this.waitForConnection(socket);
      console.log('YjsProvider: Connection established, authenticating...');
      await this.authenticateSocket(token, socket);

      this.setStatus('connected');
    } catch (error) {
      this.setStatus('error');
      console.error('YjsProvider connection error:', error);
      throw error;
    }
  }

  private setupSocketHandlers(socket?: any): void {
    const socketToUse = socket || this.socket;
    if (!socketToUse) return;

    socketToUse.on('connect', () => {
      console.log('YjsProvider: Socket connected');
    });

    socketToUse.on('disconnect', (reason: any) => {
      console.log('YjsProvider: Socket disconnected:', reason);
      this.authStatus = 'pending'; // Reset auth status on disconnect
      this.setStatus('disconnected');
      this.isSynced = false;
      this.options.onSync?.(false);
      // Don't set socket to null here - only do it in explicit disconnect()
    });

    socketToUse.on('connect_error', (error: any) => {
      console.error('YjsProvider: Socket connection error:', error);
      this.setStatus('error');
    });

    socketToUse.on('authenticated', async () => {
      console.log('YjsProvider: Socket authenticated');
      this.authStatus = 'authenticated';
      
      try {
        // Wait for socket to be fully ready before joining document
        console.log('YjsProvider: Waiting for socket readiness...');
        console.log('YjsProvider: Current socket state:', {
          connected: socketToUse?.connected,
          disconnected: socketToUse?.disconnected,
          id: socketToUse?.id,
          active: (socketToUse as any)?.active
        });
        
        await waitUntil(() => {
          if (!socketToUse) return false;
          
          const isConnected = socketToUse.connected === true;
          const isNotDisconnected = socketToUse.disconnected !== true;
          const hasId = !!socketToUse.id;
          const isActive = (socketToUse as any).active !== false;
          
          console.log('YjsProvider: Socket readiness check:', {
            connected: isConnected,
            notDisconnected: isNotDisconnected,
            hasId: hasId,
            active: isActive,
            overall: isConnected && isNotDisconnected && hasId && isActive
          });
          
          return isConnected && isNotDisconnected && hasId && isActive;
        }, 5000, 'socket fully ready');
        
        // Add small delay to ensure transport is fully ready
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Test if socket can emit before attempting join
        try {
          console.log('YjsProvider: Testing socket emit capability...');
          if (!socketToUse) {
            throw new Error('Socket is null during emit test');
          }
          socketToUse.emit('ping'); // Test emit
          console.log('YjsProvider: Socket emit test successful');
        } catch (emitError) {
          console.error('YjsProvider: Socket emit test failed:', emitError);
          throw new Error(`Socket not ready for emit: ${emitError}`);
        }
        
        console.log('YjsProvider: Socket ready, joining document...');
        await this.joinDocument(socketToUse);
        
        console.log('YjsProvider: Successfully joined document');
      } catch (error) {
        console.error('YjsProvider: Join document failed after auth:', error);
        this.setStatus('error');
      }
    });

    socketToUse.on('auth-error', (error: any) => {
      console.error('YjsProvider: Authentication error:', error);
      this.authStatus = 'failed';
      this.setStatus('error');
    });

    socketToUse.on('document-joined', (data: any) => {
      console.log('Joined document:', data);
      
      // Apply initial document state if provided
      if (data.documentState && data.documentState.length > 0) {
        const stateUpdate = new Uint8Array(data.documentState);
        Y.applyUpdate(this.doc, stateUpdate, this);
      }

      this.isSynced = true;
      this.options.onSync?.(true);
    });

    socketToUse.on('document-update', (data: any) => {
      console.log('Received document update:', data);
      
      // Apply remote update to local document
      if (data.update && data.documentId === this.documentId) {
        const update = new Uint8Array(data.update);
        Y.applyUpdate(this.doc, update, this);
      }
    });

    socketToUse.on('document-update-success', (data: any) => {
      console.log('Document update acknowledged:', data);
    });

    socketToUse.on('user-joined', (user: any) => {
      console.log('User joined document:', user);
    });

    socketToUse.on('user-left', (user: any) => {
      console.log('User left document:', user);
    });

    socketToUse.on('cursor-update', (data: any) => {
      console.log('Cursor update:', data);
      // Handle cursor updates for user presence
    });

    socketToUse.on('error', (error: any) => {
      console.error('Socket error:', error);
      this.setStatus('error');
    });
  }

  private async waitForConnection(socket?: any): Promise<void> {
    const socketToUse = socket || this.socket;
    return new Promise((resolve, reject) => {
      if (!socketToUse) {
        reject(new Error('Socket not initialized'));
        return;
      }

      if (socketToUse.connected) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      socketToUse.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      socketToUse.once('connect_error', (error: any) => {
        clearTimeout(timeout);
        reject(new Error(error.message || 'Connection failed'));
      });
    });
  }


  private async authenticateSocket(token: string, socket?: any): Promise<void> {
    const socketToUse = socket || this.socket;
    return new Promise((resolve, reject) => {
      if (!socketToUse) {
        reject(new Error('Socket not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 10000);

      socketToUse.once('authenticated', () => {
        clearTimeout(timeout);
        resolve();
      });

      socketToUse.once('auth-error', (error: any) => {
        clearTimeout(timeout);
        reject(new Error(error.message || 'Authentication failed'));
      });

      socketToUse.emit('authenticate', { token });
    });
  }

  private async joinDocument(socket?: any): Promise<void> {
    const socketToUse = socket || this.socket;
    return new Promise((resolve, reject) => {
      console.log('YjsProvider: joinDocument called');
      console.log('YjsProvider: Detailed socket state:', {
        exists: !!socketToUse,
        connected: socketToUse?.connected,
        disconnected: socketToUse?.disconnected,
        id: socketToUse?.id,
        active: (socketToUse as any)?.active,
        authStatus: this.authStatus,
        documentId: this.documentId
      });

      if (!socketToUse) {
        reject(new Error('Socket not connected'));
        return;
      }

      if (!socketToUse.connected) {
        reject(new Error(`Socket not in connected state. Current state: connected=${socketToUse.connected}, disconnected=${socketToUse.disconnected}`));
        return;
      }

      if (this.authStatus !== 'authenticated') {
        reject(new Error(`Socket not authenticated. Auth status: ${this.authStatus}`));
        return;
      }

      // Double-check socket readiness
      try {
        // Test if socket can actually emit by checking its internal state
        if (!socketToUse.emit) {
          reject(new Error('Socket emit method not available'));
          return;
        }
        
        // Check if socket has been destroyed or is in an invalid state
        if ((socketToUse as any).destroyed) {
          reject(new Error('Socket has been destroyed'));
          return;
        }
      } catch (e) {
        reject(new Error(`Socket not ready for operations: ${e}`));
        return;
      }

      const timeout = setTimeout(() => {
        console.error('YjsProvider: Join document timeout - socket state at timeout:', {
          connected: socketToUse?.connected,
          disconnected: socketToUse?.disconnected,
          id: socketToUse?.id
        });
        reject(new Error('Join document timeout'));
      }, 10000);

      const onDocumentJoined = () => {
        clearTimeout(timeout);
        resolve();
      };

      const onError = (error: any) => {
        clearTimeout(timeout);
        reject(new Error(error.message || 'Failed to join document'));
      };

      socketToUse.once('document-joined', onDocumentJoined);
      socketToUse.once('error', onError);

      console.log('YjsProvider: Emitting join-document for:', this.documentId);
      try {
        socketToUse.emit('join-document', { 
          documentId: this.documentId 
        });
        console.log('YjsProvider: join-document emit completed successfully');
      } catch (emitError) {
        clearTimeout(timeout);
        console.error('YjsProvider: Socket emit failed:', emitError);
        reject(new Error(`Socket emit failed: ${emitError}`));
      }
    });
  }

  private setStatus(status: 'connecting' | 'connected' | 'disconnected' | 'error'): void {
    this.status = status;
    this.options.onStatusChange?.(status);
  }

  getStatus(): 'connecting' | 'connected' | 'disconnected' | 'error' {
    return this.status;
  }

  isSynchronized(): boolean {
    return this.isSynced;
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      // Leave document room
      this.socket.emit('leave-document', { 
        documentId: this.documentId 
      });

      // Disconnect socket
      this.socket.disconnect();
      this.socket = null;
    }

    // Remove document update handler
    if (this.updateHandler) {
      this.doc.off('update', this.updateHandler);
      this.updateHandler = null;
    }

    // Reset authentication status
    this.authStatus = 'pending';
    this.setStatus('disconnected');
    this.isSynced = false;
    this.options.onSync?.(false);
  }

  // Send cursor/selection updates
  sendCursorUpdate(cursor: any): void {
    if (this.socket && this.status === 'connected') {
      this.socket.emit('cursor-update', {
        documentId: this.documentId,
        cursor
      });
    }
  }

  // Get document statistics
  getDocumentInfo(): {
    documentId: string;
    status: string;
    isSynced: boolean;
    clientId: number;
  } {
    return {
      documentId: this.documentId,
      status: this.status,
      isSynced: this.isSynced,
      clientId: this.doc.clientID
    };
  }
}

// Factory function to create a YjsProvider
export function createYjsProvider(
  documentId: string,
  options?: Partial<YjsProviderOptions>
): { doc: Y.Doc; provider: YjsProvider } {
  const doc = new Y.Doc();
  
  const provider = new YjsProvider(doc, {
    documentId,
    ...options
  });

  return { doc, provider };
}