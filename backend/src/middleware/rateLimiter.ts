import rateLimit from 'express-rate-limit';
import { redisClient } from '../config/database';
import { logger } from '../utils/logger';

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: any) => string;
}

/**
 * Create a rate limiter middleware using Redis as the store
 */
export const rateLimiter = (options: RateLimiterOptions) => {
  const {
    windowMs,
    max,
    message = 'Too many requests, please try again later',
    keyGenerator = (req) => req.ip
  } = options;

  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: message
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    store: {
      incr: async (key: string) => {
        try {
          const current = await redisClient.get(`ratelimit:${key}`);
          if (!current) {
            await redisClient.setex(`ratelimit:${key}`, Math.ceil(windowMs / 1000), '1');
            return { totalHits: 1, resetTime: new Date(Date.now() + windowMs) };
          }

          const totalHits = await redisClient.incr(`ratelimit:${key}`);
          const ttl = await redisClient.ttl(`ratelimit:${key}`);
          const resetTime = new Date(Date.now() + ttl * 1000);

          return { totalHits, resetTime };
        } catch (error) {
          logger.error('Redis rate limit error:', error);
          // Fallback to memory-based rate limiting if Redis fails
          return { totalHits: 1, resetTime: new Date(Date.now() + windowMs) };
        }
      },
      decrement: async (key: string) => {
        try {
          await redisClient.decr(`ratelimit:${key}`);
        } catch (error) {
          logger.error('Redis rate limit decrement error:', error);
        }
      },
      resetKey: async (key: string) => {
        try {
          await redisClient.del(`ratelimit:${key}`);
        } catch (error) {
          logger.error('Redis rate limit reset error:', error);
        }
      }
    },
    onLimitReached: (req, res, options) => {
      logger.warn(`Rate limit exceeded for ${keyGenerator(req)}: ${req.method} ${req.path}`);
    }
  });
};

// Predefined rate limiters for common use cases
export const authLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many authentication attempts, please try again later',
  keyGenerator: (req) => `auth:${req.ip}`
});

export const apiLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window
  message: 'Too many API requests, please try again later'
});

export const documentUpdateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 updates per minute per user
  message: 'Too many document updates, please slow down',
  keyGenerator: (req) => `doc_update:${req.user?.userId || req.ip}`
});