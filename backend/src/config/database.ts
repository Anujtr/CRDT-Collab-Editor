import { createClient, RedisClientType } from 'redis';
import logger from '../utils/logger';

export class RedisClient {
  private static client: RedisClientType;
  private static subscriber: RedisClientType;
  private static publisher: RedisClientType;
  private static isConnected = false;
  private static connectionRetries = 0;
  private static maxRetries = 5;

  static async connect(): Promise<void> {
    try {
      // Main Redis client
      this.client = createClient({
        url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
        password: process.env.REDIS_PASSWORD || undefined,
        database: parseInt(process.env.REDIS_DB || '0'),
        socket: {
          connectTimeout: 5000
        }
      });

      // Dedicated publisher client for pub/sub
      this.publisher = this.client.duplicate();
      
      // Dedicated subscriber client for pub/sub
      this.subscriber = this.client.duplicate();

      // Set up event handlers
      this.setupEventHandlers();

      // Connect all clients
      await Promise.all([
        this.client.connect(),
        this.publisher.connect(),
        this.subscriber.connect()
      ]);

      this.isConnected = true;
      this.connectionRetries = 0;
      logger.info('Redis connection established successfully');

    } catch (error) {
      this.isConnected = false;
      this.connectionRetries++;

      logger.error('Failed to connect to Redis', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        attempt: this.connectionRetries,
        maxRetries: this.maxRetries
      });

      if (this.connectionRetries < this.maxRetries) {
        const delay = Math.min(this.connectionRetries * 1000, 5000);
        logger.info(`Retrying Redis connection in ${delay}ms...`);
        
        setTimeout(() => {
          this.connect().catch(() => {
            logger.error('Redis retry connection failed');
          });
        }, delay);
      } else {
        logger.error('Max Redis connection retries reached, running in standalone mode');
      }

      throw error;
    }
  }

  private static setupEventHandlers(): void {
    // Main client events
    this.client.on('error', (err) => {
      logger.error('Redis Client Error', { error: err.message });
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      logger.info('Redis Client Connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis Client Ready');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      logger.warn('Redis Client Disconnected');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis Client Reconnecting...');
    });

    // Publisher events
    this.publisher.on('error', (err) => {
      logger.error('Redis Publisher Error', { error: err.message });
    });

    // Subscriber events
    this.subscriber.on('error', (err) => {
      logger.error('Redis Subscriber Error', { error: err.message });
    });
  }

  static async disconnect(): Promise<void> {
    try {
      if (this.client) await this.client.disconnect();
      if (this.publisher) await this.publisher.disconnect();
      if (this.subscriber) await this.subscriber.disconnect();
      
      this.isConnected = false;
      logger.info('Redis connections closed');
    } catch (error) {
      logger.error('Error disconnecting from Redis', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  static getClient(): RedisClientType {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client not connected');
    }
    return this.client;
  }

  static getPublisher(): RedisClientType {
    if (!this.publisher || !this.isConnected) {
      throw new Error('Redis publisher not connected');
    }
    return this.publisher;
  }

  static getSubscriber(): RedisClientType {
    if (!this.subscriber || !this.isConnected) {
      throw new Error('Redis subscriber not connected');
    }
    return this.subscriber;
  }

  static isClientConnected(): boolean {
    return this.isConnected;
  }

  // Session management methods
  static async setSession(sessionId: string, data: any, ttl: number = 3600): Promise<void> {
    try {
      if (!this.isConnected) {
        logger.debug('Session set operation skipped - Redis not connected', { sessionId });
        return;
      }
      
      await this.client.setEx(`session:${sessionId}`, ttl, JSON.stringify(data));
      logger.debug('Session stored successfully', { sessionId, ttl });
    } catch (error) {
      logger.error('Error setting session', { 
        sessionId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  static async getSession(sessionId: string): Promise<any | null> {
    try {
      if (!this.isConnected) {
        logger.debug('Session get operation skipped - Redis not connected', { sessionId });
        return null;
      }

      const data = await this.client.get(`session:${sessionId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Error getting session', { 
        sessionId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  static async deleteSession(sessionId: string): Promise<void> {
    try {
      if (!this.isConnected) {
        logger.debug('Session delete operation skipped - Redis not connected', { sessionId });
        return;
      }

      await this.client.del(`session:${sessionId}`);
      logger.debug('Session deleted successfully', { sessionId });
    } catch (error) {
      logger.error('Error deleting session', { 
        sessionId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  // Rate limiting methods
  static async incrementRateLimit(key: string, window: number, limit: number): Promise<{ count: number; reset: number; exceeded: boolean }> {
    try {
      if (!this.isConnected) {
        logger.debug('Rate limit check skipped - Redis not connected', { key });
        return { count: 0, reset: Date.now() + window, exceeded: false };
      }

      const now = Date.now();
      const windowStart = now - window;

      const pipeline = this.client.multi();
      pipeline.zRemRangeByScore(key, 0, windowStart);
      pipeline.zAdd(key, { score: now, value: now.toString() });
      pipeline.zCard(key);
      pipeline.expire(key, Math.ceil(window / 1000));

      const results = await pipeline.exec();
      const count = results[2] as number;
      const reset = now + window;

      return {
        count,
        reset,
        exceeded: count > limit
      };
    } catch (error) {
      logger.error('Error checking rate limit', { 
        key, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return { count: 0, reset: Date.now() + window, exceeded: false };
    }
  }

  // Document synchronization methods (Pub/Sub)
  static async publishDocumentUpdate(documentId: string, update: any): Promise<void> {
    try {
      if (!this.isConnected) {
        logger.debug('Document publish skipped - Redis not connected', { documentId });
        return;
      }

      const message = JSON.stringify({
        documentId,
        update,
        timestamp: Date.now()
      });

      await this.publisher.publish(`document:${documentId}`, message);
      logger.debug('Document update published', { documentId });
    } catch (error) {
      logger.error('Error publishing document update', { 
        documentId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  static async subscribeToDocument(documentId: string, callback: (update: any) => void): Promise<void> {
    try {
      if (!this.isConnected) {
        logger.debug('Document subscribe skipped - Redis not connected', { documentId });
        return;
      }

      await this.subscriber.subscribe(`document:${documentId}`, (message) => {
        try {
          const data = JSON.parse(message);
          callback(data);
          logger.debug('Document update received', { documentId });
        } catch (error) {
          logger.error('Error parsing document update', { 
            documentId, 
            message, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      });

      logger.debug('Subscribed to document updates', { documentId });
    } catch (error) {
      logger.error('Error subscribing to document', { 
        documentId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  static async unsubscribeFromDocument(documentId: string): Promise<void> {
    try {
      if (!this.isConnected) {
        logger.debug('Document unsubscribe skipped - Redis not connected', { documentId });
        return;
      }

      await this.subscriber.unsubscribe(`document:${documentId}`);
      logger.debug('Unsubscribed from document updates', { documentId });
    } catch (error) {
      logger.error('Error unsubscribing from document', { 
        documentId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  // Cache methods
  static async setCache(key: string, data: any, ttl: number = 3600): Promise<void> {
    try {
      if (!this.isConnected) {
        logger.debug('Cache set operation skipped - Redis not connected', { key });
        return;
      }

      await this.client.setEx(`cache:${key}`, ttl, JSON.stringify(data));
      logger.debug('Cache stored successfully', { key, ttl });
    } catch (error) {
      logger.error('Error setting cache', { 
        key, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  static async getCache(key: string): Promise<any | null> {
    try {
      if (!this.isConnected) {
        logger.debug('Cache get operation skipped - Redis not connected', { key });
        return null;
      }

      const data = await this.client.get(`cache:${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Error getting cache', { 
        key, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  static async deleteCache(key: string): Promise<void> {
    try {
      if (!this.isConnected) {
        logger.debug('Cache delete operation skipped - Redis not connected', { key });
        return;
      }

      await this.client.del(`cache:${key}`);
      logger.debug('Cache deleted successfully', { key });
    } catch (error) {
      logger.error('Error deleting cache', { 
        key, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  // Connection health check
  static async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected) return false;
      
      const response = await this.client.ping();
      return response === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return false;
    }
  }
}