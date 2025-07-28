import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { Descendant, Editor } from 'slate';
import { useParams } from 'react-router-dom';
import { Document } from '../../types';
import { useCollaborativeEditor } from '../../hooks/useCollaborativeEditor';
import { useGlobalConnection } from '../../contexts/ConnectionContext';
import { API_BASE_URL } from '../../utils/constants';
import { storage } from '../../utils';

interface EditorContextValue {
  // Document state
  document: Document | null;
  isLoading: boolean;
  error: string | null;
  
  // Editor state
  editor: Editor;
  editorValue: Descendant[];
  setEditorValue: (value: Descendant[]) => void;
  
  // Collaboration state
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  isSynced: boolean;
  collaborators: any[];
  
  // Document operations
  saveDocument: () => Promise<void>;
  loadDocument: (documentId: string) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
  
  // Document metadata
  documentTitle: string;
  setDocumentTitle: (title: string) => void;
  hasUnsavedChanges: boolean;
  lastSaved: Date | null;
  
  // Auto-save functionality
  enableAutoSave: boolean;
  setEnableAutoSave: (enabled: boolean) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
}

interface EditorProviderProps {
  children: React.ReactNode;
  documentId?: string;
  autoSaveInterval?: number; // in milliseconds
}


export function EditorProvider({ 
  children, 
  documentId: propDocumentId,
  autoSaveInterval = 30000 // 30 seconds
}: EditorProviderProps) {
  const { documentId: routeDocumentId } = useParams<{ documentId: string }>();
  const documentId = propDocumentId || routeDocumentId;

  // Document state
  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Additional editor state
  const [documentTitle, setDocumentTitle] = useState('Untitled Document');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [enableAutoSave, setEnableAutoSave] = useState(true);
  
  // Get global connection context
  const { setExternalConnectionState } = useGlobalConnection();

  // Collaborative editor hook
  const {
    editor,
    value: editorValue,
    status: connectionStatus,
    isSynced,
    collaborators,
    isLoading: isConnecting,
    error: connectionError,
    connect,
    disconnect,
    setValue: setEditorValue,
    reconnect
  } = useCollaborativeEditor({
    documentId: documentId || '',
    onStatusChange: (status) => {
      console.log('Connection status changed:', status);
      if (status === 'error') {
        setError('Connection error - working offline');
      } else {
        setError(null);
      }
    },
    onSync: (synced) => {
      console.log('Sync status changed:', synced);
    },
    // Update global connection state with collaborative editor status
    onGlobalConnectionUpdate: (updates) => {
      console.log('EditorProvider: Updating global connection state:', updates);
      setExternalConnectionState(updates);
    }
  });

  // Handle editor value changes
  const handleEditorValueChange = useCallback((value: Descendant[]) => {
    setEditorValue(value);
    setHasUnsavedChanges(true);
  }, [setEditorValue]);

  // Load document from API
  const loadDocument = useCallback(async (docId: string) => {
    if (!docId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const token = storage.get('crdt-auth-token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${API_BASE_URL}/documents/${docId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load document');
      }

      const result = await response.json();
      const documentData = result.data;
      
      setDocument(documentData.metadata);
      setDocumentTitle(documentData.metadata.title);
      setHasUnsavedChanges(false);
      setLastSaved(new Date(documentData.metadata.updatedAt));
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save document metadata (content is auto-saved via CRDT)
  const saveDocument = useCallback(async () => {
    if (!document) return;
    
    try {
      setError(null);
      
      const token = storage.get('crdt-auth-token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${API_BASE_URL}/documents/${document.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: documentTitle,
          isPublic: document.isPublic
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save document');
      }

      const result = await response.json();
      setDocument(result.data);
      setHasUnsavedChanges(false);
      setLastSaved(new Date());
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save document');
      throw err;
    }
  }, [document, documentTitle]);

  // Auto-save effect
  useEffect(() => {
    if (!enableAutoSave || !hasUnsavedChanges) return;
    
    const autoSaveTimer = setTimeout(() => {
      saveDocument().catch(err => {
        console.error('Auto-save failed:', err);
      });
    }, autoSaveInterval);

    return () => clearTimeout(autoSaveTimer);
  }, [enableAutoSave, hasUnsavedChanges, saveDocument, autoSaveInterval]);

  // Load document on mount or when documentId changes
  useEffect(() => {
    if (documentId) {
      loadDocument(documentId);
    }
  }, [documentId, loadDocument]);

  // Keyboard shortcut for saving (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        saveDocument().catch(err => {
          console.error('Manual save failed:', err);
        });
      }
    };

    window.document.addEventListener('keydown', handleKeyDown);
    return () => window.document.removeEventListener('keydown', handleKeyDown);
  }, [saveDocument]);

  // Warn about unsaved changes before leaving
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return event.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const contextValue: EditorContextValue = {
    // Document state
    document,
    isLoading: isLoading || isConnecting,
    error: error || connectionError,
    
    // Editor state
    editor,
    editorValue,
    setEditorValue: handleEditorValueChange,
    
    // Collaboration state
    connectionStatus,
    isSynced,
    collaborators,
    
    // Document operations
    saveDocument,
    loadDocument,
    connect,
    disconnect,
    reconnect,
    
    // Document metadata
    documentTitle,
    setDocumentTitle,
    hasUnsavedChanges,
    lastSaved,
    
    // Auto-save functionality
    enableAutoSave,
    setEnableAutoSave,
  };

  return (
    <EditorContext.Provider value={contextValue}>
      {children}
    </EditorContext.Provider>
  );
}