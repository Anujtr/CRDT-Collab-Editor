import { useEffect, useCallback, useRef } from 'react';
import { useConnection } from './useConnection';
import { toast } from 'react-hot-toast';

export interface DocumentUser {
  userId: string;
  username: string;
  role: string;
  cursor?: {
    anchor: number;
    focus: number;
  };
}

export interface DocumentUpdate {
  documentId: string;
  update: any;
  userId: string;
  username: string;
  timestamp: number;
}

export interface CursorUpdate {
  userId: string;
  username: string;
  cursor: {
    anchor: number;
    focus: number;
  };
  timestamp: number;
}

interface DocumentSocketCallbacks {
  onDocumentJoined?: (data: { documentId: string; users: DocumentUser[] }) => void;
  onDocumentLeft?: (data: { documentId: string }) => void;
  onUserJoined?: (user: DocumentUser) => void;
  onUserLeft?: (user: { userId: string; username: string }) => void;
  onDocumentUpdate?: (update: DocumentUpdate) => void;
  onCursorUpdate?: (cursor: CursorUpdate) => void;
  onError?: (error: { message: string; code: string }) => void;
}

export function useDocumentSocket(documentId: string | null, callbacks: DocumentSocketCallbacks = {}) {
  const { send, on, off, isAuthenticated } = useConnection();
  const currentDocumentRef = useRef<string | null>(null);
  const cleanupFunctionsRef = useRef<(() => void)[]>([]);

  // Clean up event listeners
  const cleanup = useCallback(() => {
    cleanupFunctionsRef.current.forEach(fn => fn());
    cleanupFunctionsRef.current = [];
  }, []);

  // Join a document room
  const joinDocument = useCallback((docId: string) => {
    if (!isAuthenticated) {
      toast.error('Must be authenticated to join document');
      return false;
    }

    const success = send('join-document', { documentId: docId });
    if (success) {
      currentDocumentRef.current = docId;
    }
    return success;
  }, [send, isAuthenticated]);

  // Leave current document room
  const leaveDocument = useCallback(() => {
    if (currentDocumentRef.current) {
      send('leave-document', { documentId: currentDocumentRef.current });
      currentDocumentRef.current = null;
    }
  }, [send]);

  // Send document update
  const sendDocumentUpdate = useCallback((update: any) => {
    if (!currentDocumentRef.current) {
      return false;
    }

    return send('document-update', {
      documentId: currentDocumentRef.current,
      update
    });
  }, [send]);

  // Send cursor update
  const sendCursorUpdate = useCallback((cursor: { anchor: number; focus: number }) => {
    if (!currentDocumentRef.current) {
      return false;
    }

    return send('cursor-update', {
      documentId: currentDocumentRef.current,
      cursor
    });
  }, [send]);

  // Set up event listeners
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    cleanup();

    // Document joined
    const onDocumentJoined = (data: { documentId: string; users: DocumentUser[] }) => {
      callbacks.onDocumentJoined?.(data);
      toast.success(`Joined document: ${data.documentId}`);
    };

    // Document left
    const onDocumentLeft = (data: { documentId: string }) => {
      callbacks.onDocumentLeft?.(data);
      currentDocumentRef.current = null;
    };

    // User joined
    const onUserJoined = (user: DocumentUser) => {
      callbacks.onUserJoined?.(user);
      toast.success(`${user.username} joined the document`);
    };

    // User left
    const onUserLeft = (user: { userId: string; username: string }) => {
      callbacks.onUserLeft?.(user);
      toast(`${user.username} left the document`);
    };

    // Document update
    const onDocumentUpdate = (update: DocumentUpdate) => {
      callbacks.onDocumentUpdate?.(update);
    };

    // Document update success (acknowledgment)
    const onDocumentUpdateSuccess = (data: DocumentUpdate) => {
      // Handle successful update acknowledgment if needed
      console.debug('Document update acknowledged:', data);
    };

    // Cursor update
    const onCursorUpdate = (cursor: CursorUpdate) => {
      callbacks.onCursorUpdate?.(cursor);
    };

    // Error handling
    const onError = (error: { message: string; code: string }) => {
      callbacks.onError?.(error);
      
      // Show user-friendly error messages
      switch (error.code) {
        case 'AUTH_REQUIRED':
          toast.error('Authentication required');
          break;
        case 'DOCUMENT_ID_REQUIRED':
          toast.error('Document ID is required');
          break;
        case 'INSUFFICIENT_PERMISSIONS':
          toast.error('You don\'t have permission to access this document');
          break;
        case 'JOIN_FAILED':
          toast.error('Failed to join document');
          break;
        case 'INVALID_UPDATE_DATA':
          toast.error('Invalid document update');
          break;
        case 'UPDATE_PROCESSING_ERROR':
          toast.error('Failed to process document update');
          break;
        default:
          toast.error(error.message || 'An error occurred');
      }
    };

    // Register event listeners and store cleanup functions
    cleanupFunctionsRef.current = [
      on('document-joined', onDocumentJoined),
      on('document-left', onDocumentLeft),
      on('user-joined', onUserJoined),
      on('user-left', onUserLeft),
      on('document-update', onDocumentUpdate),
      on('document-update-success', onDocumentUpdateSuccess),
      on('cursor-update', onCursorUpdate),
      on('error', onError)
    ];

    return cleanup;
  }, [isAuthenticated, callbacks, on, cleanup]);

  // Auto-join/leave documents based on documentId prop
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // Leave current document if we're switching to a different one
    if (currentDocumentRef.current && documentId !== currentDocumentRef.current) {
      leaveDocument();
    }

    // Join new document
    if (documentId && documentId !== currentDocumentRef.current) {
      const timer = setTimeout(() => {
        joinDocument(documentId);
      }, 100); // Small delay to ensure we've left the previous document

      return () => clearTimeout(timer);
    }

    // Leave document if documentId becomes null
    if (!documentId && currentDocumentRef.current) {
      leaveDocument();
    }
  }, [documentId, isAuthenticated, joinDocument, leaveDocument]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      if (currentDocumentRef.current) {
        leaveDocument();
      }
    };
  }, [cleanup, leaveDocument]);

  return {
    currentDocument: currentDocumentRef.current,
    joinDocument,
    leaveDocument,
    sendDocumentUpdate,
    sendCursorUpdate,
    isInDocument: !!currentDocumentRef.current,
  };
}