import { Request, Response, NextFunction } from 'express';
import { metricsService } from '../services/metricsService';

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  // Override res.end to capture response time and status
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): Response {
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds
    const statusCode = res.statusCode;
    
    // Extract route pattern with full path
    let route = req.path;
    
    // If there's a route pattern, use it but preserve the mount path
    if (req.route?.path && req.baseUrl) {
      route = req.baseUrl + req.route.path;
    } else if (req.route?.path) {
      route = req.route.path;
    }
    
    const method = req.method;
    
    // Record HTTP metrics
    metricsService.recordHttpRequest(method, route, statusCode, duration);
    
    // Call original end method
    return originalEnd.call(this, chunk, encoding) as Response;
  };
  
  next();
};