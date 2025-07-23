import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  FileText, 
  Calendar, 
  Users, 
  MoreVertical,
  Edit,
  Trash2,
  Share,
  Copy
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DocumentMetadata } from '../../types';
import { LoadingSpinner, LoadingSkeleton } from './LoadingSpinner';
import { formatRelativeTime, cn } from '../../utils';
import { toast } from 'react-hot-toast';

export function DashboardPage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate loading
      
      // Mock data for now
      const mockDocuments: DocumentMetadata[] = [
        {
          id: '1',
          title: 'Project Planning Document',
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          ownerId: 'user1',
          ownerName: 'John Doe',
          collaboratorCount: 3,
          isPublic: false,
          lastActivity: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        },
        {
          id: '2',
          title: 'Meeting Notes - Q4 Review',
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          ownerId: 'user2',
          ownerName: 'Jane Smith',
          collaboratorCount: 1,
          isPublic: true,
          lastActivity: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        },
        {
          id: '3',
          title: 'Technical Specification',
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          ownerId: 'user1',
          ownerName: 'John Doe',
          collaboratorCount: 5,
          isPublic: false,
          lastActivity: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        },
      ];
      
      setDocuments(mockDocuments);
    } catch (error) {
      toast.error('Failed to load documents');
      console.error('Error loading documents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createNewDocument = async (title: string, isPublic: boolean = false) => {
    try {
      // TODO: Replace with actual API call
      const newDoc: DocumentMetadata = {
        id: Date.now().toString(),
        title,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ownerId: 'current-user',
        ownerName: 'Current User',
        collaboratorCount: 1,
        isPublic,
        lastActivity: new Date().toISOString(),
      };

      setDocuments([newDoc, ...documents]);
      setShowCreateModal(false);
      navigate(`/document/${newDoc.id}`);
      toast.success('Document created successfully!');
    } catch (error) {
      toast.error('Failed to create document');
      console.error('Error creating document:', error);
    }
  };

  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Your Documents
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Create, edit, and collaborate on documents in real-time
        </p>
      </div>

      {/* Actions bar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Document
        </button>
      </div>

      {/* Documents grid */}
      {isLoading ? (
        <DocumentListSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocuments.map((document) => (
            <DocumentCard
              key={document.id}
              document={document}
              onOpen={() => navigate(`/document/${document.id}`)}
            />
          ))}
          
          {filteredDocuments.length === 0 && !isLoading && (
            <div className="col-span-full text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {searchQuery ? 'No documents found' : 'No documents yet'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {searchQuery 
                  ? 'Try adjusting your search terms'
                  : 'Get started by creating your first document'
                }
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create Document
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create document modal */}
      {showCreateModal && (
        <CreateDocumentModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createNewDocument}
        />
      )}
    </div>
  );
}

interface DocumentCardProps {
  document: DocumentMetadata;
  onOpen: () => void;
}

function DocumentCard({ document, onOpen }: DocumentCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/document/${document.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy link');
    }
    setShowMenu(false);
  };

  return (
    <div className="document-card group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3
            className="text-lg font-medium text-gray-900 dark:text-white truncate cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            onClick={onOpen}
          >
            {document.title}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            by {document.ownerName}
          </p>
        </div>
        
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-10">
              <button
                onClick={onOpen}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Edit className="h-4 w-4" />
                Open
              </button>
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Copy className="h-4 w-4" />
                Copy Link
              </button>
              <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700">
                <Share className="h-4 w-4" />
                Share
              </button>
              <hr className="border-gray-200 dark:border-gray-700" />
              <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mb-4">
        <div className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatRelativeTime(document.lastActivity)}
        </div>
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {document.collaboratorCount} collaborator{document.collaboratorCount !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {document.isPublic && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
              Public
            </span>
          )}
        </div>
        
        <button
          onClick={onOpen}
          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium"
        >
          Open →
        </button>
      </div>
    </div>
  );
}

interface CreateDocumentModalProps {
  onClose: () => void;
  onCreate: (title: string, isPublic: boolean) => void;
}

function CreateDocumentModal({ onClose, onCreate }: CreateDocumentModalProps) {
  const [title, setTitle] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onCreate(title.trim(), isPublic);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        <form onSubmit={handleSubmit} className="p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Create New Document
          </h2>
          
          <div className="mb-4">
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Document Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter document title..."
              autoFocus
              required
            />
          </div>

          <div className="mb-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Make this document public
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DocumentListSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <LoadingSkeleton className="h-6 w-3/4 mb-2" />
          <LoadingSkeleton className="h-4 w-1/2 mb-4" />
          <div className="flex gap-4 mb-4">
            <LoadingSkeleton className="h-3 w-20" />
            <LoadingSkeleton className="h-3 w-24" />
          </div>
          <div className="flex justify-between items-center">
            <LoadingSkeleton className="h-6 w-16" />
            <LoadingSkeleton className="h-4 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}