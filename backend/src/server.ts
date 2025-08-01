import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Load environment variables
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: '.env.test' });
} else {
  dotenv.config();
}

// Import and validate configuration
import { validateConfig, checkEnvironmentSetup } from './config/validation';

// Import middleware
import { errorHandler, notFoundHandler, gracefulShutdown } from './middleware/errorHandler';
import { 
  httpLogger, 
  correlationIdMiddleware, 
  responseTimeMiddleware,
  securityLoggerMiddleware 
} from './middleware/logging';
import { metricsMiddleware } from './middleware/metrics';

// Import routes
import apiRoutes from './routes/index';

// Import database
import { RedisClient } from './config/database';

// Import models
import { UserDatabaseModel } from './models/UserDatabase';
import { databaseService } from './config/database-service';

// Import WebSocket handlers
import { SocketHandlers } from './websocket/socketHandlers';

// Import logger
import logger from './utils/logger';
import { JWTUtils } from './utils/jwt';

class Server {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private port: number;
  private socketHandlers!: SocketHandlers;
  private config: any;

  constructor() {
    // Validate environment and configuration
    checkEnvironmentSetup();
    this.config = validateConfig();
    
    this.app = express();
    this.port = this.config.PORT;
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: this.config.CLIENT_URL,
        methods: ['GET', 'POST'],
        credentials: true
      },
      path: '/socket.io/'
    });

    // Add authentication middleware to handle auth from handshake
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token;
        logger.info('Socket handshake auth check', {
          socketId: socket.id,
          hasToken: !!token,
          authKeys: Object.keys(socket.handshake.auth || {})
        });
        
        if (token) {
          // Auto-authenticate if token is provided in handshake
          const decoded = JWTUtils.verifyToken(token);
          const user = await UserDatabaseModel.findById(decoded.userId);
          
          if (user) {
            (socket as any).user = decoded;
            logger.info('Socket auto-authenticated via handshake', {
              socketId: socket.id,
              userId: user.id,
              username: user.username
            });
          }
        }
        next();
      } catch (error) {
        logger.warn('Handshake authentication failed', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        next(); // Continue without auto-auth, allow manual auth later
      }
    });

    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
    this.initializeSocketIO();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"]
        }
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.config.CLIENT_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Correlation-ID']
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Custom middleware
    this.app.use(correlationIdMiddleware);
    this.app.use(responseTimeMiddleware);
    this.app.use(metricsMiddleware);
    this.app.use(securityLoggerMiddleware);
    this.app.use(httpLogger);

    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);
  }

  private initializeRoutes(): void {
    // API routes
    this.app.use('/api', apiRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        data: {
          message: 'CRDT Collaborative Editor API',
          version: '1.0.0',
          status: 'running',
          timestamp: new Date()
        }
      });
    });
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  private initializeSocketIO(): void {
    // Initialize socket handlers
    this.socketHandlers = new SocketHandlers(this.io);
    this.socketHandlers.setupHandlers();
    
    logger.info('WebSocket server initialized with handlers');
  }

  private async connectToDatabase(): Promise<void> {
    try {
      // Connect to PostgreSQL first
      await databaseService.connect();
      logger.info('PostgreSQL connection established successfully');
      
      // Then connect to Redis
      await RedisClient.connect();
      logger.info('Redis connection established successfully');
    } catch (error) {
      logger.error('Failed to connect to databases', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      // For PostgreSQL connection failures, we should not continue
      if (error instanceof Error && error.message.includes('Database')) {
        throw error;
      }
      
      // Continue in standalone mode for Redis failures
      logger.warn('Running with limited Redis features - some functionality may be disabled');
    }
  }

  private async initializeData(): Promise<void> {
    try {
      await UserDatabaseModel.initialize();
      logger.info('Data initialization completed');
    } catch (error) {
      logger.error('Failed to initialize data', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  public async start(): Promise<void> {
    try {
      // Connect to database
      await this.connectToDatabase();

      // Initialize data
      await this.initializeData();

      // Start server
      this.server.listen(this.port, () => {
        logger.info(`Server running on port ${this.port}`, {
          port: this.port,
          environment: process.env.NODE_ENV || 'development',
          processId: process.pid
        });
      });

      // Setup graceful shutdown
      gracefulShutdown(this.server);

    } catch (error) {
      logger.error('Failed to start server', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      await databaseService.disconnect();
      await RedisClient.disconnect();
      this.server.close();
      logger.info('Server stopped gracefully');
    } catch (error) {
      logger.error('Error stopping server', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
}

// Create and start server
const server = new Server();

if (require.main === module) {
  server.start().catch((error) => {
    logger.error('Failed to start application', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    process.exit(1);
  });
}

export default server;