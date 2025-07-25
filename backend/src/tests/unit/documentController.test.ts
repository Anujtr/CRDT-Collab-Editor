import request from 'supertest';
import express from 'express';

// Mock Redis BEFORE importing any modules that use it
jest.mock('../../config/database', () => ({
  RedisClient: {
    // Connection management
    connect: jest.fn(),
    disconnect: jest.fn(),
    isClientConnected: () => false,
    healthCheck: jest.fn().mockResolvedValue(true),
    
    // Client getters
    getClient: jest.fn(() => ({
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      keys: jest.fn().mockResolvedValue([])
    })),
    getPublisher: jest.fn(() => ({
      publish: jest.fn()
    })),
    getSubscriber: jest.fn(() => ({
      subscribe: jest.fn(),
      on: jest.fn(),
      unsubscribe: jest.fn()
    })),
    
    // Cache methods
    setCache: jest.fn(),
    getCache: jest.fn(),
    deleteCache: jest.fn(),
    
    // Document-specific methods
    publishDocumentUpdate: jest.fn(),
    subscribeToDocument: jest.fn(),
    unsubscribeFromDocument: jest.fn(),
    
    // Session methods
    setSession: jest.fn(),
    getSession: jest.fn(),
    deleteSession: jest.fn(),
    
    // Rate limiting
    incrementRateLimit: jest.fn().mockResolvedValue({ count: 0, reset: Date.now() + 60000, exceeded: false })
  }
}));

import { createDocument, getDocument, deleteDocument, listDocuments } from '../../controllers/documentController';
import { documentService } from '../../services/documentService';
import { authenticateToken } from '../../middleware/auth';

// Mock the document service
jest.mock('../../services/documentService');

// Mock the auth middleware
jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = {
      userId: 'test-user-123',
      username: 'testuser',
      roles: ['editor'],
      permissions: ['document:read', 'document:write']
    };
    next();
  }
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }
}));

const app = express();
app.use(express.json());
// Don't use the middleware globally, we'll mock the auth in tests

// Set up routes
app.post('/documents', createDocument);
app.get('/documents/:documentId', getDocument);
app.delete('/documents/:documentId', deleteDocument);
app.get('/documents', listDocuments);

describe('DocumentController', () => {
  const mockDocumentService = documentService as jest.Mocked<typeof documentService>;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /documents', () => {
    it('should create a new document with valid data', async () => {
      const mockDocument = {
        id: 'doc-123',
        title: 'Test Document',
        ownerId: 'test-user-123',
        collaborators: ['test-user-123'],
        isPublic: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        version: 0
      };

      mockDocumentService.createDocument.mockResolvedValue(mockDocument);

      const response = await request(app)
        .post('/documents')
        .send({
          title: 'Test Document',
          isPublic: false
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockDocument);
      expect(mockDocumentService.createDocument).toHaveBeenCalledWith(
        'test-user-123',
        'Test Document',
        false
      );
    });

    it('should create a public document when specified', async () => {
      const mockDocument = {
        id: 'doc-123',
        title: 'Public Document',
        ownerId: 'test-user-123',
        collaborators: ['test-user-123'],
        isPublic: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        version: 0
      };

      mockDocumentService.createDocument.mockResolvedValue(mockDocument);

      const response = await request(app)
        .post('/documents')
        .send({
          title: 'Public Document',
          isPublic: true
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isPublic).toBe(true);
    });

    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/documents')
        .send({
          title: '', // Empty title should fail validation
          isPublic: false
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation error');
    });

    it('should handle service errors', async () => {
      mockDocumentService.createDocument.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .post('/documents')
        .send({
          title: 'Test Document',
          isPublic: false
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
    });
  });

  describe('GET /documents/:documentId', () => {
    it('should return document with read access', async () => {
      const mockMetadata = {
        id: 'doc-123',
        title: 'Test Document',
        ownerId: 'test-user-123',
        collaborators: ['test-user-123'],
        isPublic: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        version: 0
      };

      const mockState = new Uint8Array([1, 2, 3, 4, 5]);

      mockDocumentService.hasReadAccess.mockResolvedValue(true);
      mockDocumentService.getDocumentMetadata.mockResolvedValue(mockMetadata);
      mockDocumentService.getDocumentState.mockResolvedValue(mockState);
      mockDocumentService.hasWriteAccess.mockResolvedValue(true);

      const response = await request(app)
        .get('/documents/doc-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.metadata).toEqual(mockMetadata);
      expect(response.body.data.state).toEqual(Array.from(mockState));
      expect(response.body.data.hasWriteAccess).toBe(true);
    });

    it('should deny access to users without read permission', async () => {
      mockDocumentService.hasReadAccess.mockResolvedValue(false);

      const response = await request(app)
        .get('/documents/doc-123');

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access denied');
    });

    it('should return 404 for non-existent documents', async () => {
      mockDocumentService.hasReadAccess.mockResolvedValue(true);
      mockDocumentService.getDocumentMetadata.mockResolvedValue(null);

      const response = await request(app)
        .get('/documents/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Document not found');
    });
  });

  describe('DELETE /documents/:documentId', () => {
    it('should delete document successfully', async () => {
      mockDocumentService.deleteDocument.mockResolvedValue(true);

      const response = await request(app)
        .delete('/documents/doc-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Document deleted successfully');
      expect(mockDocumentService.deleteDocument).toHaveBeenCalledWith('doc-123', 'test-user-123');
    });

    it('should handle deletion failure', async () => {
      mockDocumentService.deleteDocument.mockResolvedValue(false);

      const response = await request(app)
        .delete('/documents/doc-123');

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Document not found or access denied');
    });
  });

  describe('GET /documents', () => {
    it('should return paginated list of documents', async () => {
      const mockDocuments = [
        {
          id: 'doc-1',
          title: 'Document 1',
          ownerId: 'test-user-123',
          collaborators: ['test-user-123'],
          isPublic: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          version: 0
        },
        {
          id: 'doc-2',
          title: 'Document 2',
          ownerId: 'test-user-123',
          collaborators: ['test-user-123'],
          isPublic: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          version: 0
        }
      ];

      const mockResult = {
        documents: mockDocuments,
        total: 2,
        page: 1,
        totalPages: 1
      };

      mockDocumentService.listDocuments.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/documents');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockResult);
      expect(mockDocumentService.listDocuments).toHaveBeenCalledWith('test-user-123', 1, 20);
    });

    it('should handle pagination parameters', async () => {
      const mockResult = {
        documents: [],
        total: 0,
        page: 2,
        totalPages: 0
      };

      mockDocumentService.listDocuments.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/documents?page=2&limit=10');

      expect(response.status).toBe(200);
      expect(response.body.data.page).toBe(2);
      expect(mockDocumentService.listDocuments).toHaveBeenCalledWith('test-user-123', 2, 10);
    });

    it('should handle invalid pagination parameters', async () => {
      const response = await request(app)
        .get('/documents?page=invalid&limit=-5');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid pagination parameters');
    });

    it('should return empty list when no documents exist', async () => {
      const mockResult = {
        documents: [],
        total: 0,
        page: 1,
        totalPages: 0
      };

      mockDocumentService.listDocuments.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/documents');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.documents).toHaveLength(0);
    });
  });

  describe('Error handling', () => {
    it('should handle service errors gracefully', async () => {
      mockDocumentService.listDocuments.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/documents');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
    });

    it('should validate request parameters', async () => {
      const response = await request(app)
        .post('/documents')
        .send({
          title: 'a'.repeat(101), // Too long title
          isPublic: 'not-boolean' // Invalid boolean
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation error');
    });
  });
});