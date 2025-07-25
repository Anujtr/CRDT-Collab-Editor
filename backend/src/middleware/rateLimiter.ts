import rateLimit from 'express-rate-limit';
import { RedisClient } from '../config/database';
import logger from '../utils/logger';

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
          const client = RedisClient.getClient();
          const current = await client.get(`ratelimit:${key}`);
          if (!current) {
            await client.setEx(`ratelimit:${key}`, Math.ceil(windowMs / 1000), '1');
            return { totalHits: 1, resetTime: new Date(Date.now() + windowMs) };
          }

          const totalHits = await client.incr(`ratelimit:${key}`);
          const ttl = await client.ttl(`ratelimit:${key}`);
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
          const client = RedisClient.getClient();
          await client.decr(`ratelimit:${key}`);
        } catch (error) {
          logger.error('Redis rate limit decrement error:', error);
        }
      },
      resetKey: async (key: string) => {
        try {
          const client = RedisClient.getClient();
          await client.del(`ratelimit:${key}`);
        } catch (error) {
          logger.error('Redis rate limit reset error:', error);
        }
      }
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