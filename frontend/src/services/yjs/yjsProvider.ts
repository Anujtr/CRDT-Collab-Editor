import * as Y from 'yjs';
import { io, Socket } from 'socket.io-client';
import { WS_URL } from '../../utils/constants';
import { storage } from '../../utils';

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

      // Create socket connection
      this.socket = io(WS_URL, {
        transports: ['websocket'],
        autoConnect: false
      });

      this.setupSocketHandlers();
      
      // Connect and authenticate
      this.socket.connect();

      // Wait for authentication
      await this.authenticateSocket(token);

      // Join document room
      await this.joinDocument();

      this.setStatus('connected');
    } catch (error) {
      this.setStatus('error');
      console.error('YjsProvider connection error:', error);
      throw error;
    }
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.setStatus('disconnected');
      this.isSynced = false;
      this.options.onSync?.(false);
    });

    this.socket.on('authenticated', () => {
      console.log('Socket authenticated');
    });

    this.socket.on('auth-error', (error) => {
      console.error('Authentication error:', error);
      this.setStatus('error');
    });

    this.socket.on('document-joined', (data) => {
      console.log('Joined document:', data);
      
      // Apply initial document state if provided
      if (data.documentState && data.documentState.length > 0) {
        const stateUpdate = new Uint8Array(data.documentState);
        Y.applyUpdate(this.doc, stateUpdate, this);
      }

      this.isSynced = true;
      this.options.onSync?.(true);
    });

    this.socket.on('document-update', (data) => {
      console.log('Received document update:', data);
      
      // Apply remote update to local document
      if (data.update && data.documentId === this.documentId) {
        const update = new Uint8Array(data.update);
        Y.applyUpdate(this.doc, update, this);
      }
    });

    this.socket.on('document-update-success', (data) => {
      console.log('Document update acknowledged:', data);
    });

    this.socket.on('user-joined', (user) => {
      console.log('User joined document:', user);
    });

    this.socket.on('user-left', (user) => {
      console.log('User left document:', user);
    });

    this.socket.on('cursor-update', (data) => {
      console.log('Cursor update:', data);
      // Handle cursor updates for user presence
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.setStatus('error');
    });
  }

  private async authenticateSocket(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 10000);

      this.socket.once('authenticated', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.socket.once('auth-error', (error) => {
        clearTimeout(timeout);
        reject(new Error(error.message || 'Authentication failed'));
      });

      this.socket.emit('authenticate', { token });
    });
  }

  private async joinDocument(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Join document timeout'));
      }, 10000);

      this.socket.once('document-joined', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.socket.once('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(error.message || 'Failed to join document'));
      });

      this.socket.emit('join-document', { 
        documentId: this.documentId 
      });
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