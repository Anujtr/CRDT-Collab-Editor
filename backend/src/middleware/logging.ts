import { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import { logStream, authLogger, securityLogger } from '../utils/logger';

// Create custom token for response time
morgan.token('response-time', (req: Request, res: Response) => {
  const responseTime = res.get('X-Response-Time');
  return responseTime ? `${responseTime}ms` : '-';
});

// Create custom token for user ID
morgan.token('user-id', (req: any) => {
  return req.user ? req.user.userId : 'anonymous';
});

// Create custom token for correlation ID
morgan.token('correlation-id', (req: any) => {
  return req.correlationId || '-';
});

// HTTP request logging middleware
export const httpLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms :user-id :correlation-id',
  {
    stream: logStream,
    skip: (req: Request, res: Response) => {
      // Skip health check logs in production
      if (process.env.NODE_ENV === 'production' && req.path === '/api/health') {
        return true;
      }
      return false;
    }
  }
);

// Enhanced HTTP logger with more details
export const detailedHttpLogger = morgan(
  ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :user-id :correlation-id',
  {
    stream: logStream
  }
);

// Correlation ID middleware
export const correlationIdMiddleware = (req: any, res: Response, next: NextFunction) => {
  const correlationId = req.headers['x-correlation-id'] || 
                       req.headers['x-request-id'] || 
                       `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  
  next();
};

// Response time middleware
export const responseTimeMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Set header before response finishes
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any, cb?: any) {
    const duration = Date.now() - startTime;
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', duration);
    }
    return originalEnd.call(this, chunk, encoding, cb);
  };
  
  next();
};

// Authentication event logging middleware
export const authEventLogger = {
  logLoginAttempt: (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(body) {
      const response = JSON.parse(body);
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      
      if (response.success) {
        authLogger.loginSuccess(
          response.data.user.id,
          response.data.user.username,
          ip
        );
      } else {
        authLogger.loginFailure(
          req.body.username,
          ip,
          response.error?.message || 'Unknown error'
        );
      }
      
      return originalSend.call(this, body);
    };
    
    next();
  },

  logRegistrationAttempt: (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(body) {
      const response = JSON.parse(body);
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      
      if (response.success) {
        authLogger.registerSuccess(
          response.data.user.id,
          response.data.user.username,
          response.data.user.role,
          ip
        );
      } else {
        authLogger.registerFailure(
          req.body.username,
          req.body.email,
          ip,
          response.error?.message || 'Unknown error'
        );
      }
      
      return originalSend.call(this, body);
    };
    
    next();
  }
};

// Security logging middleware
export const securityLoggerMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  
  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\.\/|\.\.\\/, // Directory traversal
    /<script|javascript:|vbscript:|onload=|onerror=/i, // XSS attempts
    /union\s+select|drop\s+table|insert\s+into/i, // SQL injection
    /etc\/passwd|\/bin\/sh|cmd\.exe/i, // System file access
  ];
  
  const requestString = `${req.method} ${req.url} ${JSON.stringify(req.body)} ${JSON.stringify(req.query)}`;
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(requestString)) {
      securityLogger.suspiciousActivity(ip, userAgent, `Suspicious pattern detected: ${pattern.toString()}`);
      break;
    }
  }
  
  next();
};