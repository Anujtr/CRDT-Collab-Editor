import promClient from 'prom-client';
import logger from '../utils/logger';

class MetricsService {
  private register: promClient.Registry;
  private systemMetricsInterval?: NodeJS.Timeout;

  // HTTP Metrics
  public httpRequestsTotal!: promClient.Counter<string>;
  public httpRequestDuration!: promClient.Histogram<string>;

  // WebSocket Metrics  
  public websocketConnectionsTotal!: promClient.Gauge;
  public websocketMessagesTotal!: promClient.Counter<string>;
  public websocketConnectionDuration!: promClient.Histogram;

  // Document Metrics
  public documentsTotal!: promClient.Gauge;
  public documentOperationsTotal!: promClient.Counter<string>;
  public collaboratorsTotal!: promClient.Gauge<string>;

  // System Metrics
  public memoryUsage!: promClient.Gauge<string>;
  public cpuUsage!: promClient.Gauge;
  public uptime!: promClient.Gauge;

  // Redis Metrics
  public redisConnectionStatus!: promClient.Gauge;
  public redisOperationsTotal!: promClient.Counter<string>;
  public redisOperationDuration!: promClient.Histogram<string>;

  // Authentication Metrics
  public authOperationsTotal!: promClient.Counter<string>;
  public activeSessionsTotal!: promClient.Gauge;

  constructor() {
    this.register = new promClient.Registry();
    
    // Set default labels
    this.register.setDefaultLabels({
      app: 'crdt-collab-editor',
      version: '1.0.0'
    });

    this.initializeMetrics();
    this.collectDefaultMetrics();
    
    // Don't start system metrics collection in test environment
    if (process.env.NODE_ENV !== 'test') {
      this.startSystemMetricsCollection();
    }
  }

  private initializeMetrics(): void {
    // HTTP Metrics
    this.httpRequestsTotal = new promClient.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register]
    });

    this.httpRequestDuration = new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.5, 1, 2, 5],
      registers: [this.register]
    });

    // WebSocket Metrics
    this.websocketConnectionsTotal = new promClient.Gauge({
      name: 'websocket_connections_total',
      help: 'Current number of active WebSocket connections',
      registers: [this.register]
    });

    this.websocketMessagesTotal = new promClient.Counter({
      name: 'websocket_messages_total',
      help: 'Total number of WebSocket messages',
      labelNames: ['type', 'direction'],
      registers: [this.register]
    });

    this.websocketConnectionDuration = new promClient.Histogram({
      name: 'websocket_connection_duration_seconds',
      help: 'WebSocket connection duration in seconds',
      buckets: [1, 10, 60, 300, 1800, 3600],
      registers: [this.register]
    });

    // Document Metrics
    this.documentsTotal = new promClient.Gauge({
      name: 'documents_total',
      help: 'Current number of active documents',
      registers: [this.register]
    });

    this.documentOperationsTotal = new promClient.Counter({
      name: 'document_operations_total',
      help: 'Total number of document operations',
      labelNames: ['operation', 'document_id'],
      registers: [this.register]
    });

    this.collaboratorsTotal = new promClient.Gauge({
      name: 'collaborators_total',
      help: 'Current number of collaborators per document',
      labelNames: ['document_id'],
      registers: [this.register]
    });

    // System Metrics
    this.memoryUsage = new promClient.Gauge({
      name: 'memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type'],
      registers: [this.register]
    });

    this.cpuUsage = new promClient.Gauge({
      name: 'cpu_usage_percent',
      help: 'CPU usage percentage',
      registers: [this.register]
    });

    this.uptime = new promClient.Gauge({
      name: 'uptime_seconds',
      help: 'Process uptime in seconds',
      registers: [this.register]
    });

    // Redis Metrics
    this.redisConnectionStatus = new promClient.Gauge({
      name: 'redis_connection_status',
      help: 'Redis connection status (1 = connected, 0 = disconnected)',
      registers: [this.register]
    });

    this.redisOperationsTotal = new promClient.Counter({
      name: 'redis_operations_total',
      help: 'Total number of Redis operations',
      labelNames: ['operation', 'status'],
      registers: [this.register]
    });

    this.redisOperationDuration = new promClient.Histogram({
      name: 'redis_operation_duration_seconds',
      help: 'Redis operation duration in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.01, 0.1, 0.5, 1],
      registers: [this.register]
    });

    // Authentication Metrics
    this.authOperationsTotal = new promClient.Counter({
      name: 'auth_operations_total',
      help: 'Total number of authentication operations',
      labelNames: ['operation', 'status'],
      registers: [this.register]
    });

    this.activeSessionsTotal = new promClient.Gauge({
      name: 'active_sessions_total',
      help: 'Current number of active user sessions',
      registers: [this.register]
    });
  }

  private collectDefaultMetrics(): void {
    // Collect default Node.js metrics
    promClient.collectDefaultMetrics({
      register: this.register,
      prefix: 'nodejs_'
    });
  }

  private startSystemMetricsCollection(): void {
    // Update system metrics every 30 seconds
    this.systemMetricsInterval = setInterval(() => {
      this.updateSystemMetrics();
    }, 30000);

    // Initial update
    this.updateSystemMetrics();
  }

  private updateSystemMetrics(): void {
    try {
      // Memory usage
      const memoryUsage = process.memoryUsage();
      this.memoryUsage.set({ type: 'rss' }, memoryUsage.rss);
      this.memoryUsage.set({ type: 'heap_used' }, memoryUsage.heapUsed);
      this.memoryUsage.set({ type: 'heap_total' }, memoryUsage.heapTotal);
      this.memoryUsage.set({ type: 'external' }, memoryUsage.external);

      // CPU usage (approximate)
      const cpuUsage = process.cpuUsage();
      const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
      this.cpuUsage.set(totalUsage);

      // Uptime
      this.uptime.set(process.uptime());

    } catch (error) {
      logger.error('Error updating system metrics', { error });
    }
  }

  // Metric helper methods
  public recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode.toString() });
    this.httpRequestDuration.observe({ method, route, status_code: statusCode.toString() }, duration);
  }

  public recordWebSocketConnection(increment: boolean = true): void {
    if (increment) {
      this.websocketConnectionsTotal.inc();
    } else {
      this.websocketConnectionsTotal.dec();
    }
  }

  public recordWebSocketMessage(type: string, direction: 'in' | 'out'): void {
    this.websocketMessagesTotal.inc({ type, direction });
  }

  public recordWebSocketConnectionDuration(duration: number): void {
    this.websocketConnectionDuration.observe(duration);
  }

  public recordDocumentOperation(operation: string, documentId: string): void {
    this.documentOperationsTotal.inc({ operation, document_id: documentId });
  }

  public setCollaboratorCount(documentId: string, count: number): void {
    this.collaboratorsTotal.set({ document_id: documentId }, count);
  }

  public setRedisConnectionStatus(connected: boolean): void {
    this.redisConnectionStatus.set(connected ? 1 : 0);
  }

  public recordRedisOperation(operation: string, status: 'success' | 'error', duration: number): void {
    this.redisOperationsTotal.inc({ operation, status });
    this.redisOperationDuration.observe({ operation }, duration);
  }

  public recordAuthOperation(operation: string, status: 'success' | 'error'): void {
    this.authOperationsTotal.inc({ operation, status });
  }

  public setActiveSessionCount(count: number): void {
    this.activeSessionsTotal.set(count);
  }

  public setDocumentCount(count: number): void {
    this.documentsTotal.set(count);
  }

  public incrementDocumentOperation(operation: string, documentId: string): void {
    this.documentOperationsTotal.inc({ operation, document_id: documentId });
  }

  public incrementDocumentCreated(): void {
    this.incrementDocumentOperation('create', 'unknown');
  }

  public incrementDocumentUpdate(): void {
    this.incrementDocumentOperation('update', 'unknown');
  }

  public incrementDocumentDeleted(): void {
    this.incrementDocumentOperation('delete', 'unknown');
  }

  public getDocumentUpdateCount(): number {
    // This is a simplified approach - in production you'd want more sophisticated tracking
    return 0; // Placeholder
  }

  public getMetrics(): Promise<string> {
    return this.register.metrics();
  }

  public getRegistry(): promClient.Registry {
    return this.register;
  }

  public reset(): void {
    this.register.resetMetrics();
  }

  public cleanup(): void {
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
      this.systemMetricsInterval = undefined;
    }
  }
}

// Export singleton instance
export const metricsService = new MetricsService();
export default metricsService;