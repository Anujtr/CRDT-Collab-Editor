import React from 'react';
import { useParams } from 'react-router-dom';
import { LoadingSpinner } from '../common/LoadingSpinner';

export function EditorPage() {
  const { documentId } = useParams<{ documentId: string }>();

  // Placeholder component for the editor
  // This will be fully implemented in Phase 2.1 with Slate.js
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Document Editor
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Document ID: {documentId}
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
        <div className="p-6 text-center">
          <div className="mb-4">
            <LoadingSpinner size="lg" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Editor Coming Soon
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            The collaborative text editor with Slate.js and Yjs will be implemented in Phase 2.1.
          </p>
        </div>
      </div>
    </div>
  );
}