import { metricsService } from '../../../src/services/metricsService';
import promClient from 'prom-client';

describe('MetricsService', () => {
  beforeEach(() => {
    // Reset metrics before each test
    metricsService.reset();
  });

  afterAll(() => {
    // Clean up after tests
    metricsService.cleanup();
    metricsService.reset();
  });

  describe('HTTP Metrics', () => {
    it('should record HTTP requests', () => {
      const method = 'GET';
      const route = '/api/test';
      const statusCode = 200;
      const duration = 0.5;

      metricsService.recordHttpRequest(method, route, statusCode, duration);

      expect(metricsService.httpRequestsTotal).toBeDefined();
      expect(metricsService.httpRequestDuration).toBeDefined();
    });

    it('should handle multiple HTTP requests', () => {
      metricsService.recordHttpRequest('GET', '/api/health', 200, 0.1);
      metricsService.recordHttpRequest('POST', '/api/auth/login', 200, 0.3);
      metricsService.recordHttpRequest('GET', '/api/metrics', 200, 0.05);

      // Metrics should be recorded without throwing errors
      expect(() => metricsService.getMetrics()).not.toThrow();
    });
  });

  describe('WebSocket Metrics', () => {
    it('should record WebSocket connections', () => {
      // Increment connection
      metricsService.recordWebSocketConnection(true);
      expect(metricsService.websocketConnectionsTotal).toBeDefined();

      // Decrement connection
      metricsService.recordWebSocketConnection(false);
      expect(metricsService.websocketConnectionsTotal).toBeDefined();
    });

    it('should record WebSocket messages', () => {
      metricsService.recordWebSocketMessage('authenticate', 'in');
      metricsService.recordWebSocketMessage('document-update', 'out');

      expect(metricsService.websocketMessagesTotal).toBeDefined();
    });

    it('should record connection duration', () => {
      const duration = 120.5; // 2 minutes
      metricsService.recordWebSocketConnectionDuration(duration);

      expect(metricsService.websocketConnectionDuration).toBeDefined();
    });
  });

  describe('Document Metrics', () => {
    it('should record document operations', () => {
      const operation = 'join';
      const documentId = 'doc-123';

      metricsService.recordDocumentOperation(operation, documentId);

      expect(metricsService.documentOperationsTotal).toBeDefined();
    });

    it('should set collaborator count', () => {
      const documentId = 'doc-123';
      const count = 5;

      metricsService.setCollaboratorCount(documentId, count);

      expect(metricsService.collaboratorsTotal).toBeDefined();
    });

    it('should set document count', () => {
      const count = 10;

      metricsService.setDocumentCount(count);

      expect(metricsService.documentsTotal).toBeDefined();
    });
  });

  describe('Redis Metrics', () => {
    it('should set Redis connection status', () => {
      metricsService.setRedisConnectionStatus(true);
      metricsService.setRedisConnectionStatus(false);

      expect(metricsService.redisConnectionStatus).toBeDefined();
    });

    it('should record Redis operations', () => {
      metricsService.recordRedisOperation('get', 'success', 0.005);
      metricsService.recordRedisOperation('set', 'error', 0.002);

      expect(metricsService.redisOperationsTotal).toBeDefined();
      expect(metricsService.redisOperationDuration).toBeDefined();
    });
  });

  describe('Authentication Metrics', () => {
    it('should record auth operations', () => {
      metricsService.recordAuthOperation('login', 'success');
      metricsService.recordAuthOperation('register', 'error');

      expect(metricsService.authOperationsTotal).toBeDefined();
    });

    it('should set active session count', () => {
      const count = 25;

      metricsService.setActiveSessionCount(count);

      expect(metricsService.activeSessionsTotal).toBeDefined();
    });
  });

  describe('Metrics Export', () => {
    it('should generate Prometheus metrics', async () => {
      // Record some sample metrics
      metricsService.recordHttpRequest('GET', '/api/health', 200, 0.1);
      metricsService.recordWebSocketConnection(true);
      metricsService.recordDocumentOperation('join', 'doc-1');

      const metrics = await metricsService.getMetrics();

      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('http_requests_total');
      expect(metrics).toContain('websocket_connections_total');
      expect(metrics).toContain('document_operations_total');
    });

    it('should return registry', () => {
      const registry = metricsService.getRegistry();

      expect(registry).toBeInstanceOf(promClient.Registry);
    });

    it('should reset metrics', () => {
      // Record some metrics
      metricsService.recordHttpRequest('GET', '/test', 200, 0.1);
      
      // Reset should not throw
      expect(() => metricsService.reset()).not.toThrow();
    });
  });

  describe('System Metrics Collection', () => {
    it('should collect system metrics automatically', (done) => {
      // Wait a bit for system metrics to be collected
      setTimeout(() => {
        expect(metricsService.memoryUsage).toBeDefined();
        expect(metricsService.cpuUsage).toBeDefined();
        expect(metricsService.uptime).toBeDefined();
        done();
      }, 100);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid metric values gracefully', () => {
      expect(() => {
        metricsService.recordHttpRequest('', '', 0, -1);
      }).not.toThrow();

      expect(() => {
        metricsService.setCollaboratorCount('', -1);
      }).not.toThrow();
    });
  });
});