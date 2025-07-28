import { useEffect, useState, useCallback, useRef } from 'react';
import { createEditor, Descendant, Editor } from 'slate';
import { withReact, ReactEditor } from 'slate-react';
import { withHistory } from 'slate-history';
import * as Y from 'yjs';
import { createYjsProvider, YjsProvider } from '../services/yjs/yjsProvider';
import { connectSlateWithYjs, SimpleSlateYjsBinding } from '../services/yjs/simpleSlateBinding';
import { withCustomPlugins } from '../components/editor/plugins/withCustomPlugins';

interface UseCollaborativeEditorOptions {
  documentId: string;
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  onSync?: (isSynced: boolean) => void;
  onCollaboratorJoin?: (user: any) => void;
  onCollaboratorLeave?: (user: any) => void;
  onGlobalConnectionUpdate?: (updates: { status: 'connecting' | 'connected' | 'authenticated' | 'disconnected' | 'error'; [key: string]: any }) => void;
  readOnly?: boolean;
}

interface CollaborativeEditorState {
  editor: Editor;
  value: Descendant[];
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  isSynced: boolean;
  collaborators: any[];
  isLoading: boolean;
  error: string | null;
}

export function useCollaborativeEditor(options: UseCollaborativeEditorOptions): CollaborativeEditorState & {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setValue: (value: Descendant[]) => void;
  sendCursorUpdate: (selection: any) => void;
  reconnect: () => Promise<void>;
} {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [isSynced, setIsSynced] = useState(false);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<Descendant[]>([{
    type: 'paragraph',
    children: [{ text: '' }]
  }]);

  // Refs to store instances
  const editorRef = useRef<Editor | null>(null);
  const providerRef = useRef<YjsProvider | null>(null);
  const bindingRef = useRef<SimpleSlateYjsBinding | null>(null);
  const docRef = useRef<Y.Doc | null>(null);

  // Create editor instance (only once)
  const editor = useRef<Editor>(
    withCustomPlugins(
      withHistory(
        withReact(createEditor())
      ),
      { readOnly: options.readOnly }
    )
  ).current;

  editorRef.current = editor;

  // Initialize collaborative editor
  const connect = useCallback(async () => {
    if (providerRef.current) {
      console.log('useCollaborativeEditor: Already connected, skipping');
      return; // Already connected
    }

    if (isLoading) {
      console.log('useCollaborativeEditor: Connection already in progress, skipping');
      return; // Connection already in progress
    }

    try {
      setIsLoading(true);
      setError(null);
      console.log('useCollaborativeEditor: Starting connection...');

      // Create Yjs provider
      const { doc, provider } = createYjsProvider(options.documentId, {
        onStatusChange: (newStatus) => {
          console.log('useCollaborativeEditor: Status changed to:', newStatus);
          setStatus(newStatus);
          options.onStatusChange?.(newStatus);
          
          // Update global connection state if callback provided
          if (options.onGlobalConnectionUpdate) {
            let globalStatus: 'connecting' | 'connected' | 'authenticated' | 'disconnected' | 'error';
            
            // Map Yjs provider status to global connection status
            switch (newStatus) {
              case 'connecting':
                globalStatus = 'connecting';
                break;
              case 'connected':
                globalStatus = 'authenticated'; // When Yjs connects, it's fully authenticated
                break;
              case 'disconnected':
                globalStatus = 'disconnected';
                break;
              case 'error':
                globalStatus = 'error';
                break;
              default:
                globalStatus = 'disconnected';
            }
            
            options.onGlobalConnectionUpdate({
              status: globalStatus,
              lastConnected: newStatus === 'connected' ? Date.now() : undefined,
              authenticatedAt: newStatus === 'connected' ? Date.now() : undefined,
              error: newStatus === 'error' ? 'Collaborative editing connection failed' : undefined
            });
          }
        },
        onSync: (synced) => {
          console.log('useCollaborativeEditor: Sync status changed to:', synced);
          setIsSynced(synced);
          options.onSync?.(synced);
        }
      });

      // Store references
      docRef.current = doc;
      providerRef.current = provider;

      // Connect to WebSocket with timeout
      console.log('useCollaborativeEditor: Connecting to WebSocket...');
      await Promise.race([
        provider.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 30000)
        )
      ]);

      // Create simplified Slate-Yjs binding
      console.log('useCollaborativeEditor: Creating Slate-Yjs binding...');
      const binding = connectSlateWithYjs(editor, doc, 'content');
      bindingRef.current = binding;

      // Set initial value from the editor after binding is established
      setValue(editor.children);

      // Set up a listener to keep our local value state in sync with editor changes
      const syncValueState = () => {
        const currentValue = editor.children;
        setValue(currentValue);
      };

      // Listen for editor changes to keep value state in sync
      // This is a simple approach - in production you might want more sophisticated tracking
      const syncInterval = setInterval(syncValueState, 100);

      // Store the interval ID for cleanup
      (bindingRef.current as any)._syncInterval = syncInterval;

      console.log('useCollaborativeEditor: Connection completed successfully');

    } catch (err) {
      console.error('useCollaborativeEditor: Connection failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setStatus('error');
      
      // Clean up on error
      if (providerRef.current) {
        try {
          await providerRef.current.disconnect();
        } catch (disconnectError) {
          console.error('Error cleaning up after connection failure:', disconnectError);
        }
        providerRef.current = null;
      }
      
      if (docRef.current) {
        docRef.current.destroy();
        docRef.current = null;
      }
      
      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
      
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [options, editor, isLoading]);

  // Disconnect from collaborative editing
  const disconnect = useCallback(async () => {
    console.log('useCollaborativeEditor: Starting disconnect...');
    
    try {
      // Clean up binding first
      if (bindingRef.current) {
        console.log('useCollaborativeEditor: Destroying binding...');
        
        // Clean up sync interval if it exists
        const syncInterval = (bindingRef.current as any)._syncInterval;
        if (syncInterval) {
          clearInterval(syncInterval);
        }
        
        bindingRef.current.destroy();
        bindingRef.current = null;
      }

      // Disconnect provider
      if (providerRef.current) {
        console.log('useCollaborativeEditor: Disconnecting provider...');
        await providerRef.current.disconnect();
        providerRef.current = null;
      }

      // Clean up document last
      if (docRef.current) {
        console.log('useCollaborativeEditor: Destroying document...');
        docRef.current.destroy();
        docRef.current = null;
      }

      setStatus('disconnected');
      setIsSynced(false);
      setCollaborators([]);
      setError(null);
      
      console.log('useCollaborativeEditor: Disconnect completed');
    } catch (err) {
      console.error('useCollaborativeEditor: Error during disconnect:', err);
    }
  }, []);

  // Reconnect
  const reconnect = useCallback(async () => {
    await disconnect();
    await connect();
  }, [disconnect, connect]);

  // Send cursor updates
  const sendCursorUpdate = useCallback((selection: any) => {
    if (providerRef.current && status === 'connected') {
      providerRef.current.sendCursorUpdate(selection);
    }
  }, [status]);

  // Custom setValue that works with the simplified binding
  const setValueWrapper = useCallback((newValue: Descendant[]) => {
    try {
      // The simplified binding will handle syncing to Yjs automatically
      // Just update the local state
      setValue(newValue);
      
      // If we have a binding, let it handle the sync
      // No need to manually manipulate Yjs here
    } catch (err) {
      console.error('Error setting value:', err);
    }
  }, []);

  // Handle selection changes for cursor sharing
  useEffect(() => {
    const handleSelectionChange = () => {
      if (editor.selection && status === 'connected') {
        sendCursorUpdate(editor.selection);
      }
    };

    // Listen for selection changes
    const handleChange = () => {
      handleSelectionChange();
    };

    // Add event listener (this is a simplified approach)
    if (ReactEditor.isFocused(editor)) {
      document.addEventListener('selectionchange', handleChange);
    }

    return () => {
      document.removeEventListener('selectionchange', handleChange);
    };
  }, [editor, status, sendCursorUpdate]);

  // Cleanup on unmount - handle React StrictMode
  useEffect(() => {
    return () => {
      // Use a small delay to handle React StrictMode double-mounting
      const cleanup = async () => {
        // Wait a tick to see if component remounts (React StrictMode)
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Only disconnect if we're still unmounted
        if (!providerRef.current) {
          return; // Already cleaned up
        }
        
        console.log('useCollaborativeEditor: Component unmounting, cleaning up...');
        await disconnect();
      };
      
      cleanup().catch(err => {
        console.error('Error during cleanup:', err);
      });
    };
  }, [disconnect]);

  // Auto-connect when component mounts (with debouncing)
  useEffect(() => {
    if (options.documentId && status === 'disconnected' && !isLoading && !providerRef.current) {
      // Add a small delay to handle rapid mount/unmount cycles
      const connectTimeout = setTimeout(() => {
        connect().catch(err => {
          console.error('Auto-connect failed:', err);
        });
      }, 100);
      
      return () => clearTimeout(connectTimeout);
    }
  }, [options.documentId, status, isLoading, connect]);

  return {
    editor,
    value,
    status,
    isSynced,
    collaborators,
    isLoading,
    error,
    connect,
    disconnect,
    setValue: setValueWrapper,
    sendCursorUpdate,
    reconnect
  };
}