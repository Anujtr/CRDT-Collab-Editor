import winston from 'winston';
import path from 'path';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// Define log colors
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue'
};

winston.addColors(logColors);

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'crdt-collab-editor-backend' },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} [${level}]: ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
          }`;
        })
      )
    }),
    
    // Write error logs to file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    
    // Write all logs to file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log')
    })
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log')
    })
  ]
});

// Create a stream for Morgan HTTP logging
export const logStream = {
  write: (message: string) => {
    logger.info(message.trim());
  }
};

// Authentication-specific logging
export const authLogger = {
  loginSuccess: (userId: string, username: string, ip: string) => {
    logger.info('User login successful', {
      event: 'LOGIN_SUCCESS',
      userId,
      username,
      ip,
      timestamp: new Date()
    });
  },
  
  loginFailure: (username: string, ip: string, reason: string) => {
    logger.warn('User login failed', {
      event: 'LOGIN_FAILURE',
      username,
      ip,
      reason,
      timestamp: new Date()
    });
  },
  
  registerSuccess: (userId: string, username: string, role: string, ip: string) => {
    logger.info('User registration successful', {
      event: 'REGISTER_SUCCESS',
      userId,
      username,
      role,
      ip,
      timestamp: new Date()
    });
  },
  
  registerFailure: (username: string, email: string, ip: string, reason: string) => {
    logger.warn('User registration failed', {
      event: 'REGISTER_FAILURE',
      username,
      email,
      ip,
      reason,
      timestamp: new Date()
    });
  },
  
  tokenValidationFailure: (token: string, ip: string, reason: string) => {
    logger.warn('Token validation failed', {
      event: 'TOKEN_VALIDATION_FAILURE',
      token: token.substring(0, 20) + '...',
      ip,
      reason,
      timestamp: new Date()
    });
  },
  
  accessDenied: (userId: string, resource: string, ip: string, reason: string) => {
    logger.warn('Access denied', {
      event: 'ACCESS_DENIED',
      userId,
      resource,
      ip,
      reason,
      timestamp: new Date()
    });
  }
};

// Security logging
export const securityLogger = {
  rateLimitExceeded: (ip: string, endpoint: string, attempts: number) => {
    logger.warn('Rate limit exceeded', {
      event: 'RATE_LIMIT_EXCEEDED',
      ip,
      endpoint,
      attempts,
      timestamp: new Date()
    });
  },
  
  suspiciousActivity: (ip: string, userAgent: string, activity: string) => {
    logger.error('Suspicious activity detected', {
      event: 'SUSPICIOUS_ACTIVITY',
      ip,
      userAgent,
      activity,
      timestamp: new Date()
    });
  }
};

export default logger;