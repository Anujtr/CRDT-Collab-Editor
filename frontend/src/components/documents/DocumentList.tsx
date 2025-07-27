import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, FileText, Clock, Users, MoreHorizontal, Share2, Edit, Trash2 } from 'lucide-react';
import { documentService } from '../../services/documentService';
import { DocumentMetadata } from '../../types';
import { formatRelativeTime, cn } from '../../utils';
import { LoadingSpinner } from '../common/LoadingSpinner';
import toast from 'react-hot-toast';

interface DocumentListProps {
  className?: string;
}

export function DocumentList({ className }: DocumentListProps) {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Load documents
  const loadDocuments = async (page: number = 1, search?: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const result = search 
        ? await documentService.searchDocuments(search, page, 20)
        : await documentService.listDocuments(page, 20);

      setDocuments(result.documents);
      setCurrentPage(result.page);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  };

  // Create new document
  const handleCreateDocument = async (title: string, isPublic: boolean = false) => {
    try {
      const newDoc = await documentService.createDocument({ title, isPublic });
      setDocuments(prev => [newDoc, ...prev]);
      setShowCreateModal(false);
      toast.success('Document created successfully!');
      
      // Navigate to the new document using React Router
      navigate(`/document/${newDoc.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create document');
    }
  };

  // Delete document
  const handleDeleteDocument = async (documentId: string) => {
    if (!window.confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      return;
    }

    try {
      await documentService.deleteDocument(documentId);
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      toast.success('Document deleted successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete document');
    }
  };

  // Duplicate document
  const handleDuplicateDocument = async (documentId: string, title: string) => {
    try {
      const duplicatedDoc = await documentService.duplicateDocument(documentId, `Copy of ${title}`);
      setDocuments(prev => [duplicatedDoc, ...prev]);
      toast.success('Document duplicated successfully!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to duplicate document');
    }
  };

  // Search documents
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
    loadDocuments(1, query);
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  if (isLoading && documents.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading documents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Documents</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Create, manage, and collaborate on your documents
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Document
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="input-field pl-10 w-full"
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 animate-slide-up">
          <p className="text-red-800 dark:text-red-200 flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
            {error}
          </p>
          <button
            onClick={() => loadDocuments()}
            className="mt-3 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Documents Grid */}
      {documents.length === 0 && !isLoading ? (
        <div className="text-center py-16 animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center">
            <FileText className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No documents found
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-sm mx-auto">
            {searchQuery ? 'Try a different search term or create a new document' : 'Create your first document to get started with collaborative editing'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create your first document
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {documents.map((document, index) => (
            <div 
              key={document.id}
              className="animate-slide-up"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <DocumentCard
                document={document}
                onDelete={() => handleDeleteDocument(document.id)}
                onDuplicate={() => handleDuplicateDocument(document.id, document.title)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => loadDocuments(currentPage - 1, searchQuery)}
            disabled={currentPage <= 1}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => loadDocuments(currentPage + 1, searchQuery)}
            disabled={currentPage >= totalPages}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Next
          </button>
        </div>
      )}

      {/* Create Document Modal */}
      {showCreateModal && (
        <CreateDocumentModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateDocument}
        />
      )}

      {/* Loading overlay */}
      {isLoading && documents.length > 0 && (
        <div className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      )}
    </div>
  );
}

interface DocumentCardProps {
  document: DocumentMetadata;
  onDelete: () => void;
  onDuplicate: () => void;
}

function DocumentCard({ document, onDelete, onDuplicate }: DocumentCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="relative group card-hover p-6 transform hover:scale-[1.02] transition-all duration-200">
      <Link to={`/document/${document.id}`} className="block">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/20 dark:to-primary-800/20 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                  {document.title}
                </h3>
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{formatRelativeTime(document.updatedAt)}</span>
              </div>
              {document.collaboratorCount > 1 && (
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  <span>{document.collaboratorCount}</span>
                </div>
              )}
              {document.isPublic && (
                <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full">
                  <Share2 className="w-3 h-3" />
                  <span>Public</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="text-sm text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-3">
          <span className="font-medium">Last activity:</span> {formatRelativeTime(document.lastActivity)}
        </div>
      </Link>

      {/* Menu */}
      <div className="absolute top-4 right-4">
        <button
          onClick={(e) => {
            e.preventDefault();
            setShowMenu(!showMenu);
          }}
          className="btn-ghost p-2 opacity-0 group-hover:opacity-100 transition-all duration-200"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {showMenu && (
          <div className="absolute right-0 top-10 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-10 animate-scale-in backdrop-blur-sm">
            <div className="p-2 space-y-1">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onDuplicate();
                  setShowMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg flex items-center transition-colors"
              >
                <Edit className="w-4 h-4 mr-3 text-gray-400" />
                <span>Duplicate</span>
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onDelete();
                  setShowMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg flex items-center transition-colors"
              >
                <Trash2 className="w-4 h-4 mr-3" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        )}
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
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsCreating(true);
    try {
      await onCreate(title.trim(), isPublic);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="card max-w-md w-full p-6 shadow-2xl animate-scale-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center">
            <Plus className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Create New Document
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
              Document Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter document title..."
              className="input-field w-full"
              autoFocus
              required
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isPublic"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded transition-colors"
            />
            <label htmlFor="isPublic" className="text-sm text-gray-700 dark:text-gray-300">
              Make document public
            </label>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isCreating}
              className="btn-primary flex-1"
            >
              {isCreating ? (
                <LoadingSpinner size="sm" className="mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Document
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}