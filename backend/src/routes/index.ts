import { Router } from 'express';
import authRoutes from './auth';
import { metricsService } from '../services/metricsService';
import { RedisClient } from '../config/database';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '../../../shared/src/types/auth';

const router = Router();

// Health check endpoint with comprehensive status
router.get('/health', async (_req, res) => {
  const healthData: any = {
    status: 'healthy',
    timestamp: new Date(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    services: {}
  };

  // Check Redis connection
  try {
    const isConnected = RedisClient.isClientConnected();
    const redisStatus = isConnected ? 'connected' : 'disconnected';
    healthData.services.redis = {
      status: redisStatus,
      connected: isConnected
    };
  } catch (error) {
    healthData.services.redis = {
      status: 'error',
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    healthData.status = 'degraded';
  }

  // Memory usage
  const memoryUsage = process.memoryUsage();
  healthData.system = {
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`
    },
    loadAverage: process.platform === 'linux' ? require('os').loadavg() : null,
    platform: process.platform,
    nodeVersion: process.version
  };

  const statusCode = healthData.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json({
    success: healthData.status === 'healthy',
    data: healthData
  });
});

// Metrics endpoint (Prometheus format)
router.get('/metrics', async (_req, res) => {
  try {
    const metrics = await metricsService.getMetrics();
    res.set('Content-Type', metricsService.getRegistry().contentType);
    res.send(metrics);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Connection stats endpoint (admin only)
router.get('/connections', authenticateToken, requireRole(UserRole.ADMIN), async (_req, res) => {
  try {
    // Import connection manager dynamically to avoid circular dependencies
    const { ConnectionManager } = await import('../websocket/connectionManager');
    const stats = ConnectionManager.getConnectionStats();
    
    res.json({
      success: true,
      data: {
        websocketConnections: stats.totalConnections,
        activeDocuments: stats.activeDocuments,
        connectedUsers: stats.connectedUsers,
        averageUsersPerDocument: stats.activeDocuments > 0 ? 
          (stats.connectedUsers / stats.activeDocuments).toFixed(2) : 0,
        timestamp: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get connection stats',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Authentication routes
router.use('/auth', authRoutes);

// API documentation endpoint
router.get('/', (_req, res) => {
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
          'GET /api/health': 'Health check endpoint',
          'GET /api/metrics': 'Prometheus metrics endpoint',
          'GET /api/connections': 'Connection statistics (admin only)'
        }
      }
    },
    timestamp: new Date()
  });
});

export default router;