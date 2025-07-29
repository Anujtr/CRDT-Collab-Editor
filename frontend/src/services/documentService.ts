import { API_BASE_URL } from '../utils/constants';
import { createAuthHeaders } from '../utils';
import { DocumentMetadata, CreateDocumentFormData } from '../types';

interface DocumentListResponse {
  documents: DocumentMetadata[];
  total: number;
  page: number;
  totalPages: number;
}

class DocumentService {
  private getAuthHeaders(): HeadersInit {
    return createAuthHeaders();
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Request failed';
      
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = errorText || `HTTP ${response.status}`;
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Create a new document
   */
  async createDocument(formData: CreateDocumentFormData): Promise<DocumentMetadata> {
    const response = await fetch(`${API_BASE_URL}/documents`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(formData)
    });

    return this.handleResponse<DocumentMetadata>(response);
  }

  /**
   * Get document by ID with content
   */
  async getDocument(documentId: string): Promise<{
    metadata: DocumentMetadata;
    state: number[] | null;
    hasWriteAccess: boolean;
  }> {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
      headers: this.getAuthHeaders()
    });

    return this.handleResponse<{
      metadata: DocumentMetadata;
      state: number[] | null;
      hasWriteAccess: boolean;
    }>(response);
  }

  /**
   * Update document metadata
   */
  async updateDocument(documentId: string, updates: Partial<DocumentMetadata>): Promise<DocumentMetadata> {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(updates)
    });

    return this.handleResponse<DocumentMetadata>(response);
  }

  /**
   * Delete document
   */
  async deleteDocument(documentId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders()
    });

    await this.handleResponse<void>(response);
  }

  /**
   * List user's documents
   */
  async listDocuments(page: number = 1, limit: number = 20): Promise<DocumentListResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });

    const response = await fetch(`${API_BASE_URL}/documents?${params}`, {
      headers: this.getAuthHeaders()
    });

    return this.handleResponse<DocumentListResponse>(response);
  }

  /**
   * Add collaborator to document
   */
  async addCollaborator(documentId: string, userId: string, permission: 'read' | 'write' = 'write'): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/collaborators`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ userId, permission })
    });

    await this.handleResponse<void>(response);
  }

  /**
   * Remove collaborator from document
   */
  async removeCollaborator(documentId: string, userId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/collaborators/${userId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders()
    });

    await this.handleResponse<void>(response);
  }

  /**
   * Get document statistics (admin only)
   */
  async getDocumentStats(): Promise<{
    totalDocuments: number;
    activeDocuments: number;
    totalUpdates: number;
  }> {
    const response = await fetch(`${API_BASE_URL}/documents/stats`, {
      headers: this.getAuthHeaders()
    });

    return this.handleResponse<{
      totalDocuments: number;
      activeDocuments: number;
      totalUpdates: number;
    }>(response);
  }

  /**
   * Search documents by title
   */
  async searchDocuments(query: string, page: number = 1, limit: number = 20): Promise<DocumentListResponse> {
    // This would need to be implemented on the backend
    // For now, we'll filter the results client-side
    const documents = await this.listDocuments(page, limit);
    
    if (!query.trim()) {
      return documents;
    }

    const filtered = documents.documents.filter(doc => 
      doc.title.toLowerCase().includes(query.toLowerCase())
    );

    return {
      ...documents,
      documents: filtered,
      total: filtered.length
    };
  }

  /**
   * Get recent documents
   */
  async getRecentDocuments(limit: number = 10): Promise<DocumentMetadata[]> {
    const response = await this.listDocuments(1, limit);
    return response.documents;
  }

  /**
   * Duplicate document
   */
  async duplicateDocument(documentId: string, newTitle?: string): Promise<DocumentMetadata> {
    // Get the original document
    const originalDoc = await this.getDocument(documentId);
    
    // Create a new document with similar properties
    const duplicateData: CreateDocumentFormData = {
      title: newTitle || `Copy of ${originalDoc.metadata.title}`,
      isPublic: originalDoc.metadata.isPublic
    };

    return this.createDocument(duplicateData);
  }
}

export const documentService = new DocumentService();
export default documentService;