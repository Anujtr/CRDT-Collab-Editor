import { Router } from 'express';
import authRoutes from './auth';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    }
  });
});

// Authentication routes
router.use('/auth', authRoutes);

// API documentation endpoint
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      message: 'CRDT Collaborative Editor API',
      version: '1.0.0',
      endpoints: {
        auth: {
          'POST /api/auth/register': 'Register a new user',
          'POST /api/auth/login': 'Login user',
          'GET /api/auth/me': 'Get current user info',
          'POST /api/auth/refresh': 'Refresh access token',
          'POST /api/auth/logout': 'Logout user'
        },
        system: {
          'GET /api/health': 'Health check endpoint'
        }
      }
    },
    timestamp: new Date()
  });
});

export default router;