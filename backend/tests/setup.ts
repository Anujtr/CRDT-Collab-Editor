import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-that-is-long-enough-for-security-validation-12345';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Mock Redis client for tests
jest.mock('../src/config/database', () => ({
  RedisClient: {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    getClient: jest.fn().mockReturnValue({
      setEx: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      publish: jest.fn(),
      subscribe: jest.fn(),
      multi: jest.fn().mockReturnValue({
        zRemRangeByScore: jest.fn(),
        zAdd: jest.fn(),
        zCard: jest.fn(),
        expire: jest.fn(),
        exec: jest.fn().mockResolvedValue([null, null, 0, null])
      })
    }),
    isClientConnected: jest.fn().mockReturnValue(true)
  }
}));

// Global test timeout
jest.setTimeout(10000);

// Clean up intervals and timers after all tests
afterAll(() => {
  // Import and cleanup metrics service
  const { metricsService } = require('../src/services/metricsService');
  if (metricsService && metricsService.cleanup) {
    metricsService.cleanup();
  }
});