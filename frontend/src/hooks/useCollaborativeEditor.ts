import { useEffect, useState, useCallback, useRef } from 'react';
import { createEditor, Descendant, Editor } from 'slate';
import { withReact, ReactEditor } from 'slate-react';
import { withHistory } from 'slate-history';
import * as Y from 'yjs';
import { createYjsProvider, YjsProvider } from '../services/yjs/yjsProvider';
import { connectSlateWithYjs, SlateYjsBinding } from '../services/yjs/slateBinding';
import { withCustomPlugins } from '../components/editor/plugins/withCustomPlugins';

interface UseCollaborativeEditorOptions {
  documentId: string;
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  onSync?: (isSynced: boolean) => void;
  onCollaboratorJoin?: (user: any) => void;
  onCollaboratorLeave?: (user: any) => void;
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
  const bindingRef = useRef<SlateYjsBinding | null>(null);
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
      return; // Already connected
    }

    try {
      setIsLoading(true);
      setError(null);

      // Create Yjs provider
      const { doc, provider } = createYjsProvider(options.documentId, {
        onStatusChange: (newStatus) => {
          setStatus(newStatus);
          options.onStatusChange?.(newStatus);
        },
        onSync: (synced) => {
          setIsSynced(synced);
          options.onSync?.(synced);
        }
      });

      // Store references
      docRef.current = doc;
      providerRef.current = provider;

      // Connect to WebSocket
      await provider.connect();

      // Create Slate-Yjs binding
      const binding = connectSlateWithYjs(editor, doc, 'content');
      bindingRef.current = binding;

      // Get the shared text content
      const yText = doc.getText('content');
      
      // Set up text observer for Slate updates
      const updateSlateContent = () => {
        try {
          const text = yText.toString();
          if (text) {
            // Convert plain text to Slate value
            const newValue: Descendant[] = text.split('\n').map(line => ({
              type: 'paragraph',
              children: [{ text: line }]
            }));
            setValue(newValue);
          }
        } catch (err) {
          console.error('Error updating Slate content:', err);
        }
      };

      // Initial content load
      updateSlateContent();

      // Listen for document updates
      yText.observe(updateSlateContent);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setStatus('error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [options, editor]);

  // Disconnect from collaborative editing
  const disconnect = useCallback(async () => {
    try {
      // Clean up binding
      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }

      // Disconnect provider
      if (providerRef.current) {
        await providerRef.current.disconnect();
        providerRef.current = null;
      }

      // Clean up document
      if (docRef.current) {
        docRef.current.destroy();
        docRef.current = null;
      }

      setStatus('disconnected');
      setIsSynced(false);
      setCollaborators([]);
      setError(null);
    } catch (err) {
      console.error('Error disconnecting:', err);
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

  // Custom setValue that works with Yjs
  const setValueWrapper = useCallback((newValue: Descendant[]) => {
    if (bindingRef.current && docRef.current) {
      try {
        // Convert Slate value to plain text
        const text = newValue.map(node => {
          if ('children' in node) {
            return node.children.map((child: any) => child.text || '').join('');
          }
          return '';
        }).join('\n');

        // Update Yjs text
        const yText = docRef.current.getText('content');
        yText.delete(0, yText.length);
        yText.insert(0, text);
      } catch (err) {
        console.error('Error setting value:', err);
      }
    }
    setValue(newValue);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Auto-connect when component mounts
  useEffect(() => {
    if (options.documentId && status === 'disconnected' && !isLoading) {
      connect().catch(err => {
        console.error('Auto-connect failed:', err);
      });
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