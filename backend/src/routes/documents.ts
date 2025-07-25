import express from 'express';
import {
  createDocument,
  getDocument,
  updateDocument,
  deleteDocument,
  listDocuments,
  addCollaborator,
  removeCollaborator,
  getDocumentStats
} from '../controllers/documentController';
import { authenticateToken } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';

const router = express.Router();

// Apply authentication to all document routes
router.use(authenticateToken);

// Apply rate limiting for document creation
const createLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 documents per minute
  message: 'Too many documents created, please try again later'
});

// Document CRUD operations
router.post('/', createLimiter, createDocument);
router.get('/', listDocuments);
router.get('/stats', getDocumentStats);
router.get('/:documentId', getDocument);
router.put('/:documentId', updateDocument);
router.delete('/:documentId', deleteDocument);

// Collaboration management
router.post('/:documentId/collaborators', addCollaborator);
router.delete('/:documentId/collaborators/:userId', removeCollaborator);

export default router;