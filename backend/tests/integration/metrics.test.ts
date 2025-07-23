import request from 'supertest';
import { Express } from 'express';
import { metricsService } from '../../src/services/metricsService';
import { UserModel } from '../../src/models/User';
import { UserRole } from '../../../shared/src/types/auth';
import { JWTUtils } from '../../src/utils/jwt';

let app: Express;
let server: any;

// Mock Redis for testing
jest.mock('../../src/config/database', () => ({
  RedisClient: {
    isClientConnected: () => true,
    healthCheck: () => true
  }
}));

describe('Metrics and Monitoring Integration Tests', () => {
  beforeAll(async () => {
    // Import and initialize server
    const serverModule = await import('../../src/server');
    server = serverModule.default;
    app = (server as any).app;

    // Initialize user model
    await UserModel.initialize();
  });

  afterAll(async () => {
    if (server && server.stop) {
      await server.stop();
    }
  });

  beforeEach(async () => {
    // Clear users and reset metrics before each test
    UserModel.clear();
    await UserModel.initialize();
    metricsService.reset();
  });

  describe('Metrics Collection', () => {
    it('should collect HTTP request metrics automatically', async () => {
      // Make several HTTP requests to generate metrics
      await request(app).get('/api/health').expect(200);
      await request(app).get('/api/health').expect(200);
      await request(app).get('/').expect(200);

      // Check that metrics endpoint includes HTTP metrics
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.text).toContain('http_requests_total');
      expect(response.text).toContain('http_request_duration_seconds');
    });

    it('should track different HTTP methods and status codes', async () => {
      // Generate different types of requests
      await request(app).get('/api/health').expect(200);
      await request(app).get('/api/nonexistent').expect(404);
      await request(app).post('/api/auth/login').send({}).expect(400);

      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      // Should contain different method labels
      expect(response.text).toMatch(/method="GET"/);
      expect(response.text).toMatch(/method="POST"/);
      
      // Should contain different status codes
      expect(response.text).toMatch(/status_code="200"/);
      expect(response.text).toMatch(/status_code="404"/);
      expect(response.text).toMatch(/status_code="400"/);
    });

    it('should include system metrics', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      // Node.js default metrics
      expect(response.text).toContain('nodejs_version_info');
      expect(response.text).toContain('process_cpu_seconds_total');
      expect(response.text).toContain('process_resident_memory_bytes');
      
      // Custom system metrics
      expect(response.text).toContain('memory_usage_bytes');
      expect(response.text).toContain('uptime_seconds');
    });

    it('should track WebSocket connection metrics', async () => {
      // Simulate WebSocket connections
      metricsService.recordWebSocketConnection(true);
      metricsService.recordWebSocketConnection(true);
      metricsService.recordWebSocketMessage('authenticate', 'in');
      metricsService.recordWebSocketMessage('document-update', 'out');
      metricsService.recordWebSocketConnectionDuration(120.5);

      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.text).toContain('websocket_connections_total');
      expect(response.text).toContain('websocket_messages_total');
      expect(response.text).toContain('websocket_connection_duration_seconds');
    });

    it('should track document metrics', async () => {
      // Simulate document operations
      metricsService.recordDocumentOperation('join', 'doc-1');
      metricsService.recordDocumentOperation('update', 'doc-1');
      metricsService.setCollaboratorCount('doc-1', 3);
      metricsService.setDocumentCount(5);

      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.text).toContain('document_operations_total');
      expect(response.text).toContain('collaborators_total');
      expect(response.text).toContain('documents_total');
    });

    it('should track authentication metrics', async () => {
      // Simulate auth operations
      metricsService.recordAuthOperation('login', 'success');
      metricsService.recordAuthOperation('register', 'success');
      metricsService.recordAuthOperation('login', 'error');
      metricsService.setActiveSessionCount(10);

      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.text).toContain('auth_operations_total');
      expect(response.text).toContain('active_sessions_total');
    });

    it('should track Redis metrics', async () => {
      // Simulate Redis operations
      metricsService.setRedisConnectionStatus(true);
      metricsService.recordRedisOperation('get', 'success', 0.005);
      metricsService.recordRedisOperation('set', 'success', 0.003);
      metricsService.recordRedisOperation('get', 'error', 0.1);

      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.text).toContain('redis_connection_status');
      expect(response.text).toContain('redis_operations_total');
      expect(response.text).toContain('redis_operation_duration_seconds');
    });
  });

  describe('Prometheus Format Compliance', () => {
    it('should return metrics in Prometheus format', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/plain/);
      
      // Check Prometheus format structure
      const lines = response.text.split('\n');
      const helpLines = lines.filter(line => line.startsWith('# HELP'));
      const typeLines = lines.filter(line => line.startsWith('# TYPE'));
      const metricLines = lines.filter(line => line.match(/^[a-zA-Z_][a-zA-Z0-9_]*(\{.*\})?\s+[\d\.]+/));

      expect(helpLines.length).toBeGreaterThan(0);
      expect(typeLines.length).toBeGreaterThan(0);
      expect(metricLines.length).toBeGreaterThan(0);
    });

    it('should include proper metric metadata', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      // Check for HELP and TYPE declarations
      expect(response.text).toMatch(/# HELP http_requests_total Total number of HTTP requests/);
      expect(response.text).toMatch(/# TYPE http_requests_total counter/);
      
      expect(response.text).toMatch(/# HELP websocket_connections_total Current number of active WebSocket connections/);
      expect(response.text).toMatch(/# TYPE websocket_connections_total gauge/);
    });

    it('should handle metric labels correctly', async () => {
      // Generate some requests with different parameters
      await request(app).get('/api/health').expect(200);
      await request(app).post('/api/auth/login').send({}).expect(400);

      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      // Check label format
      expect(response.text).toMatch(/http_requests_total\{method="GET",route="\/api\/health",status_code="200"\}/);
      expect(response.text).toMatch(/method="POST"/);
      expect(response.text).toMatch(/status_code="400"/);
    });
  });

  describe('Health Check Integration', () => {
    it('should include comprehensive health information', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('uptime');
      expect(response.body.data).toHaveProperty('services');
      expect(response.body.data).toHaveProperty('system');
      
      // Services health
      expect(response.body.data.services).toHaveProperty('redis');
      expect(response.body.data.services.redis).toHaveProperty('status');
      expect(response.body.data.services.redis).toHaveProperty('connected');
      
      // System health
      expect(response.body.data.system).toHaveProperty('memory');
      expect(response.body.data.system).toHaveProperty('platform');
      expect(response.body.data.system).toHaveProperty('nodeVersion');
    });

    it('should return healthy status when services are up', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.data.status).toBe('healthy');
      expect(response.body.success).toBe(true);
    });

    it('should include memory usage information', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      const memory = response.body.data.system.memory;
      expect(memory).toHaveProperty('rss');
      expect(memory).toHaveProperty('heapUsed');
      expect(memory).toHaveProperty('heapTotal');
      
      // Values should be strings with MB units
      expect(memory.rss).toMatch(/\d+ MB/);
      expect(memory.heapUsed).toMatch(/\d+ MB/);
      expect(memory.heapTotal).toMatch(/\d+ MB/);
    });
  });

  describe('Connection Statistics', () => {
    let adminUser: any;
    let adminToken: string;

    beforeEach(async () => {
      adminUser = await UserModel.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: UserRole.ADMIN
      });

      adminToken = JWTUtils.generateAccessToken({
        userId: adminUser.id,
        username: adminUser.username,
        email: adminUser.email,
        role: adminUser.role,
        permissions: adminUser.permissions
      });
    });

    it('should provide connection statistics', async () => {
      const response = await request(app)
        .get('/api/connections')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('websocketConnections');
      expect(response.body.data).toHaveProperty('activeDocuments');
      expect(response.body.data).toHaveProperty('connectedUsers');
      expect(response.body.data).toHaveProperty('timestamp');
      
      // Values should be numbers
      expect(typeof response.body.data.websocketConnections).toBe('number');
      expect(typeof response.body.data.activeDocuments).toBe('number');
      expect(typeof response.body.data.connectedUsers).toBe('number');
    });

    it('should calculate average users per document', async () => {
      const response = await request(app)
        .get('/api/connections')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toHaveProperty('averageUsersPerDocument');
      
      const avg = response.body.data.averageUsersPerDocument;
      expect(typeof avg === 'number' || typeof avg === 'string').toBe(true);
    });
  });

  describe('Metrics Middleware Integration', () => {
    it('should automatically track all HTTP requests', async () => {
      // Make various requests
      const endpoints = [
        { method: 'GET', path: '/api/health', expectedStatus: 200 },
        { method: 'GET', path: '/', expectedStatus: 200 },
        { method: 'GET', path: '/api/', expectedStatus: 200 },
        { method: 'GET', path: '/api/nonexistent', expectedStatus: 404 }
      ];

      for (const endpoint of endpoints) {
        await request(app)[endpoint.method.toLowerCase()](endpoint.path);
      }

      // Check that all requests are tracked
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      // Should contain metrics for all the endpoints we hit
      expect(response.text).toContain('route="/api/health"');
      expect(response.text).toContain('route="/"');
      expect(response.text).toContain('route="/api/"');
    });

    it('should track request duration', async () => {
      // Make a request
      await request(app).get('/api/health').expect(200);

      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      // Should contain duration histogram
      expect(response.text).toContain('http_request_duration_seconds_bucket');
      expect(response.text).toContain('http_request_duration_seconds_sum');
      expect(response.text).toContain('http_request_duration_seconds_count');
    });
  });

  describe('Error Handling in Metrics', () => {
    it('should handle metrics generation errors gracefully', async () => {
      // This test ensures the metrics endpoint doesn't crash
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.text).toBeTruthy();
      expect(response.headers['content-type']).toMatch(/text\/plain/);
    });

    it('should continue collecting metrics after errors', async () => {
      // Generate some requests
      await request(app).get('/api/health');
      
      // Force an error condition (if possible)
      try {
        metricsService.recordHttpRequest('INVALID', '', -1, -1);
      } catch (error) {
        // Expected to handle gracefully
      }

      // Should still be able to get metrics
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.text).toContain('http_requests_total');
    });
  });

  describe('Performance', () => {
    it('should handle multiple concurrent metric requests', async () => {
      const requests = [];
      
      // Make multiple concurrent requests to metrics endpoint
      for (let i = 0; i < 10; i++) {
        requests.push(request(app).get('/api/metrics'));
      }

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.text).toContain('http_requests_total');
      });
    });

    it('should not significantly impact request performance', async () => {
      const startTime = Date.now();
      
      // Make multiple requests to generate metrics
      for (let i = 0; i < 20; i++) {
        await request(app).get('/api/health');
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should complete reasonably quickly (this is a rough check)
      expect(totalTime).toBeLessThan(5000); // 5 seconds for 20 requests
    });
  });

  describe('Custom Application Metrics', () => {
    it('should expose application-specific metrics', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      // Application-specific metrics should be present
      const expectedMetrics = [
        'websocket_connections_total',
        'documents_total',
        'collaborators_total',
        'document_operations_total',
        'auth_operations_total',
        'redis_connection_status'
      ];

      for (const metric of expectedMetrics) {
        expect(response.text).toContain(metric);
      }
    });

    it('should include proper labels for application metrics', async () => {
      // Generate some application events
      metricsService.recordDocumentOperation('join', 'test-doc');
      metricsService.recordAuthOperation('login', 'success');
      metricsService.recordWebSocketMessage('authenticate', 'in');

      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      // Check for proper labels
      expect(response.text).toMatch(/operation="join"/);
      expect(response.text).toMatch(/document_id="test-doc"/);
      expect(response.text).toMatch(/operation="login"/);
      expect(response.text).toMatch(/status="success"/);
      expect(response.text).toMatch(/type="authenticate"/);
      expect(response.text).toMatch(/direction="in"/);
    });
  });
});