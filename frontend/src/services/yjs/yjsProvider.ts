import * as Y from 'yjs';
import { io, Socket } from 'socket.io-client';
import { storage } from '../../utils';

// Connection states for better state management
enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  AUTHENTICATING = 'authenticating',
  AUTHENTICATED = 'authenticated',
  JOINING_DOCUMENT = 'joining_document',
  READY = 'ready',
  ERROR = 'error'
}

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
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private options: YjsProviderOptions;
  private updateHandler: ((update: Uint8Array, origin: any) => void) | null = null;
  private isSynced = false;
  private connectionRetries = 0;
  private maxRetries = 3;
  private hasLocalChanges = false;
  private initialStateApplied = false;
  private isConnecting = false;
  private isDisconnecting = false;
  private connectionDebounceTimeout: NodeJS.Timeout | null = null;

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

      // Track that we have local changes
      if (!this.initialStateApplied) {
        this.hasLocalChanges = true;
        console.log('YjsProvider: Local changes detected before initial state');
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
    // Prevent multiple simultaneous connections
    if (this.isConnecting || this.socket) {
      console.log('YjsProvider: Connection already in progress or established');
      return;
    }

    // Prevent connection during disconnection
    if (this.isDisconnecting) {
      console.log('YjsProvider: Cannot connect while disconnecting');
      return;
    }

    // Clear any pending connection debounce
    if (this.connectionDebounceTimeout) {
      clearTimeout(this.connectionDebounceTimeout);
      this.connectionDebounceTimeout = null;
    }

    this.isConnecting = true;

    try {
      this.setStatus('connecting');
      this.connectionState = ConnectionState.CONNECTING;

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
      
      // Connect socket
      socket.connect();
      console.log('YjsProvider: Socket connection initiated');

      // Wait for connection to be established or fail
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 15000); // 15 second timeout

        const onConnect = () => {
          clearTimeout(timeout);
          socket.off('connect', onConnect);
          socket.off('connect_error', onError);
          resolve();
        };

        const onError = (error: any) => {
          clearTimeout(timeout);
          socket.off('connect', onConnect);
          socket.off('connect_error', onError);
          reject(error);
        };

        socket.on('connect', onConnect);
        socket.on('connect_error', onError);
      });

    } catch (error) {
      this.setStatus('error');
      this.connectionState = ConnectionState.ERROR;
      console.error('YjsProvider connection error:', error);
      
      // Clean up on error
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
      }
      
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  private setupSocketHandlers(socket?: any): void {
    const socketToUse = socket || this.socket;
    if (!socketToUse) return;

    socketToUse.on('connect', () => {
      console.log('YjsProvider: Socket connected');
      this.connectionState = ConnectionState.CONNECTED;
      this.connectionRetries = 0;
      
      // Get token and authenticate immediately
      const token = storage.get('crdt-auth-token');
      if (token) {
        this.connectionState = ConnectionState.AUTHENTICATING;
        socketToUse.emit('authenticate', { token });
      } else {
        this.setStatus('error');
        console.error('YjsProvider: No authentication token available');
      }
    });

    socketToUse.on('disconnect', (reason: any) => {
      console.log('YjsProvider: Socket disconnected:', reason);
      this.connectionState = ConnectionState.DISCONNECTED;
      this.setStatus('disconnected');
      this.isSynced = false;
      this.options.onSync?.(false);
      
      // Auto-reconnect unless it was an explicit disconnect
      if (reason !== 'io client disconnect' && this.connectionRetries < this.maxRetries) {
        this.connectionRetries++;
        console.log(`YjsProvider: Auto-reconnecting (attempt ${this.connectionRetries}/${this.maxRetries})`);
        setTimeout(() => {
          if (this.socket === socketToUse) { // Only reconnect if this is still the current socket
            this.reconnect();
          }
        }, 1000 * this.connectionRetries);
      }
    });

    socketToUse.on('connect_error', (error: any) => {
      console.error('YjsProvider: Socket connection error:', error);
      this.connectionState = ConnectionState.ERROR;
      this.setStatus('error');
      
      // Auto-retry connection errors
      if (this.connectionRetries < this.maxRetries) {
        this.connectionRetries++;
        console.log(`YjsProvider: Retrying after connection error (attempt ${this.connectionRetries}/${this.maxRetries})`);
        setTimeout(() => {
          this.reconnect();
        }, 2000 * this.connectionRetries);
      }
    });

    socketToUse.on('authenticated', () => {
      console.log('YjsProvider: Socket authenticated');
      this.connectionState = ConnectionState.AUTHENTICATED;
      this.setStatus('connected');
      
      // Join document immediately after authentication
      this.connectionState = ConnectionState.JOINING_DOCUMENT;
      socketToUse.emit('join-document', { documentId: this.documentId });
    });

    socketToUse.on('auth-error', (error: any) => {
      console.error('YjsProvider: Authentication error:', error);
      this.connectionState = ConnectionState.ERROR;
      this.setStatus('error');
      
      // Retry connection if we haven't exceeded max retries
      if (this.connectionRetries < this.maxRetries) {
        this.connectionRetries++;
        console.log(`YjsProvider: Retrying connection (attempt ${this.connectionRetries}/${this.maxRetries})`);
        setTimeout(() => {
          this.reconnect();
        }, 2000 * this.connectionRetries); // Exponential backoff
      }
    });

    socketToUse.on('document-joined', (data: any) => {
      console.log('Joined document:', data);
      this.connectionState = ConnectionState.READY;
      
      // Handle initial document state with conflict resolution
      this.handleInitialDocumentState(data);

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




  // Reconnect method for handling connection failures
  private async reconnect(): Promise<void> {
    console.log('YjsProvider: Attempting to reconnect...');
    
    // Clean up existing socket
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }
    
    this.socket = null;
    this.connectionState = ConnectionState.DISCONNECTED;
    this.isSynced = false;
    this.options.onSync?.(false);
    
    // Attempt to reconnect
    try {
      await this.connect();
    } catch (error) {
      console.error('YjsProvider: Reconnection failed:', error);
      this.setStatus('error');
    }
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
    console.log('YjsProvider: Explicit disconnect requested');
    
    // Prevent disconnect during connection
    if (this.isConnecting) {
      console.log('YjsProvider: Cannot disconnect while connecting, waiting...');
      // Wait a moment for connection to complete or fail
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.isDisconnecting = true;
    this.connectionRetries = this.maxRetries; // Prevent auto-reconnection
    
    // Clear any pending connection attempts
    if (this.connectionDebounceTimeout) {
      clearTimeout(this.connectionDebounceTimeout);
      this.connectionDebounceTimeout = null;
    }

    try {
      if (this.socket) {
        // Leave document room gracefully
        if (this.socket.connected) {
          this.socket.emit('leave-document', { 
            documentId: this.documentId 
          });
          
          // Give the server a moment to process the leave request
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Remove all listeners to prevent memory leaks
        this.socket.removeAllListeners();
        
        // Disconnect socket
        this.socket.disconnect();
        this.socket = null;
      }

      // Remove document update handler
      if (this.updateHandler) {
        this.doc.off('update', this.updateHandler);
        this.updateHandler = null;
      }

      // Reset state
      this.connectionState = ConnectionState.DISCONNECTED;
      this.setStatus('disconnected');
      this.isSynced = false;
      this.hasLocalChanges = false;
      this.initialStateApplied = false;
      this.options.onSync?.(false);
      
      console.log('YjsProvider: Disconnect completed');
    } catch (error) {
      console.error('YjsProvider: Error during disconnect:', error);
    } finally {
      this.isDisconnecting = false;
    }
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

  /**
   * Handle initial document state with conflict resolution
   */
  private handleInitialDocumentState(data: any): void {
    try {
      if (!data.documentState || data.documentState.length === 0) {
        console.log('YjsProvider: No initial document state to apply');
        this.initialStateApplied = true;
        return;
      }

      const remoteState = new Uint8Array(data.documentState);
      
      // Check if we have local changes that might conflict
      if (this.hasLocalChanges) {
        console.log('YjsProvider: Handling document state conflict');
        this.handleStateConflict(remoteState);
      } else {
        console.log('YjsProvider: Applying initial document state (no conflicts)');
        Y.applyUpdate(this.doc, remoteState, this);
      }
      
      this.initialStateApplied = true;
    } catch (error) {
      console.error('YjsProvider: Error handling initial document state:', error);
      this.initialStateApplied = true; // Mark as applied to prevent retry loops
    }
  }

  /**
   * Handle state conflicts between local and remote changes
   */
  private handleStateConflict(remoteState: Uint8Array): void {
    try {
      // Get current local state
      const localState = Y.encodeStateAsUpdate(this.doc);
      
      // Create a temporary document to see what the remote state contains
      const remoteDoc = new Y.Doc();
      Y.applyUpdate(remoteDoc, remoteState);
      
      // Check if documents are identical
      const localVector = Y.encodeStateVector(this.doc);
      const remoteVector = Y.encodeStateVector(remoteDoc);
      
      if (this.stateVectorsEqual(localVector, remoteVector)) {
        console.log('YjsProvider: Documents are already in sync');
        return;
      }
      
      console.log('YjsProvider: Merging conflicting document states');
      
      // Apply remote state - Yjs CRDT will handle the merging
      Y.applyUpdate(this.doc, remoteState, this);
      
      // Notify about the merge
      this.notifyStateConflictResolved();
      
    } catch (error) {
      console.error('YjsProvider: Error handling state conflict:', error);
      // Fallback: apply remote state anyway
      try {
        Y.applyUpdate(this.doc, remoteState, this);
      } catch (fallbackError) {
        console.error('YjsProvider: Fallback state application failed:', fallbackError);
      }
    }
  }

  /**
   * Check if two state vectors are equal
   */
  private stateVectorsEqual(vector1: Uint8Array, vector2: Uint8Array): boolean {
    if (vector1.length !== vector2.length) {
      return false;
    }
    
    for (let i = 0; i < vector1.length; i++) {
      if (vector1[i] !== vector2[i]) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Notify about state conflict resolution
   */
  private notifyStateConflictResolved(): void {
    console.log('YjsProvider: Document state conflict resolved through CRDT merge');
    
    // Could emit a custom event or call a callback if needed
    if (this.options.onStatusChange) {
      // For now, we don't have a specific status for conflict resolution
      // but we could add one if needed
    }
  }

  /**
   * Check if there are unsaved local changes
   */
  hasUnsavedChanges(): boolean {
    return this.hasLocalChanges && !this.initialStateApplied;
  }

  // Get document statistics
  getDocumentInfo(): {
    documentId: string;
    status: string;
    isSynced: boolean;
    clientId: number;
    hasLocalChanges: boolean;
    initialStateApplied: boolean;
  } {
    return {
      documentId: this.documentId,
      status: this.status,
      isSynced: this.isSynced,
      clientId: this.doc.clientID,
      hasLocalChanges: this.hasLocalChanges,
      initialStateApplied: this.initialStateApplied
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