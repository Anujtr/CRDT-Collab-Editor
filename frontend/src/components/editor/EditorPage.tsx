import React from 'react';
import { useParams } from 'react-router-dom';
import { EditorProvider, useEditor } from './EditorProvider';
import { SlateEditor } from './SlateEditor';
import { LoadingSpinner } from '../common/LoadingSpinner';

function EditorContent() {
  const {
    isLoading,
    error,
    editor,
    editorValue,
    setEditorValue,
    connectionStatus,
    isSynced,
    collaborators,
    documentTitle,
    setDocumentTitle,
    hasUnsavedChanges,
    lastSaved
  } = useEditor();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            Loading document...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
              Error loading document
            </h3>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Document Header */}
      <div className="flex items-center justify-between">
        <div>
          <input
            type="text"
            value={documentTitle}
            onChange={(e) => setDocumentTitle(e.target.value)}
            className="text-2xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
            placeholder="Untitled Document"
          />
          <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              connectionStatus === 'connected' 
                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                : connectionStatus === 'connecting'
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
            }`}>
              <div className={`w-2 h-2 rounded-full mr-1 ${
                connectionStatus === 'connected' ? 'bg-green-500' :
                connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
              }`} />
              {connectionStatus === 'connected' && isSynced ? 'Synced' : 
               connectionStatus === 'connecting' ? 'Connecting' : 
               connectionStatus === 'disconnected' ? 'Offline' : 'Error'}
            </span>
            
            {collaborators.length > 0 && (
              <span>{collaborators.length + 1} collaborator{collaborators.length > 0 ? 's' : ''}</span>
            )}
            
            {hasUnsavedChanges && (
              <span>Unsaved changes</span>
            )}
            
            {lastSaved && (
              <span>Last saved: {lastSaved.toLocaleTimeString()}</span>
            )}
          </div>
        </div>
      </div>

      {/* Editor */}
      <SlateEditor
        editor={editor}
        value={editorValue}
        onChange={setEditorValue}
        placeholder="Start typing..."
        autoFocus={true}
        showToolbar={true}
        className="min-h-[500px] shadow-sm"
      />
    </div>
  );
}

export function EditorPage() {
  const { documentId } = useParams<{ documentId: string }>();

  if (!documentId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">No document ID provided</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <EditorProvider documentId={documentId}>
        <EditorContent />
      </EditorProvider>
    </div>
  );
}