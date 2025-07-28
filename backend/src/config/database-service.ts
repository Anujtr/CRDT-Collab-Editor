import { PrismaClient } from '../generated/prisma';
import logger from '../utils/logger';

export class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;
  private isConnected = false;
  private connectionRetries = 0;
  private maxRetries = 5;

  private constructor() {
    this.prisma = new PrismaClient({
      log: ['query', 'error', 'info', 'warn'],
    });

    // Set up logging for Prisma events
    this.setupLogging();
  }

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private setupLogging(): void {
    // Simple logging without events for now to avoid TypeScript issues
    logger.info('Database service initialized with logging');
  }

  async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      this.isConnected = true;
      this.connectionRetries = 0;
      logger.info('Database connection established successfully');
      
      // Test the connection
      await this.healthCheck();
    } catch (error) {
      this.isConnected = false;
      this.connectionRetries++;

      logger.error('Failed to connect to database', {
        error: error instanceof Error ? error.message : 'Unknown error',
        attempt: this.connectionRetries,
        maxRetries: this.maxRetries,
      });

      if (this.connectionRetries < this.maxRetries) {
        const delay = Math.min(this.connectionRetries * 2000, 10000);
        logger.info(`Retrying database connection in ${delay}ms...`);
        
        setTimeout(() => {
          this.connect().catch(() => {
            logger.error('Database retry connection failed');
          });
        }, delay);
      } else {
        logger.error('Max database connection retries reached');
        throw error;
      }
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      this.isConnected = false;
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error disconnecting from database', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('Database health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.isConnected = false;
      return false;
    }
  }

  getClient(): PrismaClient {
    if (!this.isConnected) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.prisma;
  }

  isClientConnected(): boolean {
    return this.isConnected;
  }

  async executeInTransaction<T>(
    operation: (prisma: any) => Promise<T>
  ): Promise<T> {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    return this.prisma.$transaction(operation);
  }

  /**
   * Get database connection statistics
   */
  getConnectionStats(): {
    connected: boolean;
    retries: number;
    maxRetries: number;
  } {
    return {
      connected: this.isConnected,
      retries: this.connectionRetries,
      maxRetries: this.maxRetries,
    };
  }
}

// Export singleton instance
export const databaseService = DatabaseService.getInstance();