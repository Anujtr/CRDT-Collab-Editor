import request from 'supertest';
import { Express } from 'express';
import { UserModel } from '../../src/models/User';
import { UserRole } from '../../../shared/src/types/auth';
import { JWTUtils } from '../../src/utils/jwt';

// We'll need to import the server instance
let app: Express;
let server: any;

// Mock Redis for testing
jest.mock('../../src/config/database', () => ({
  RedisClient: {
    isClientConnected: () => false,
    healthCheck: () => false
  }
}));

describe('API Integration Tests', () => {
  beforeAll(async () => {
    // Import and initialize server
    const serverModule = await import('../../src/server');
    server = serverModule.default;
    
    // Get the Express app instance
    app = (server as any).app;

    // Initialize user model
    await UserModel.initialize();
  });

  afterAll(async () => {
    if (server && server.stop) {
      await server.stop();
    }
  });

  beforeEach(async () => {
    // Clear users before each test
    UserModel.clear();
    await UserModel.initialize();
  });

  describe('Root Endpoint', () => {
    it('should return API information', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: 'CRDT Collaborative Editor API',
          version: '1.0.0',
          status: 'running'
        }
      });
    });
  });

  describe('Health Check Endpoint', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('uptime');
      expect(response.body.data).toHaveProperty('version');
      expect(response.body.data).toHaveProperty('services');
      expect(response.body.data).toHaveProperty('system');
    });

    it('should include Redis service status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.data.services).toHaveProperty('redis');
      expect(response.body.data.services.redis).toHaveProperty('status');
      expect(response.body.data.services.redis).toHaveProperty('connected');
    });

    it('should include system information', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.data.system).toHaveProperty('memory');
      expect(response.body.data.system).toHaveProperty('platform');
      expect(response.body.data.system).toHaveProperty('nodeVersion');
    });
  });

  describe('Metrics Endpoint', () => {
    it('should return Prometheus metrics', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/plain/);
      expect(response.text).toContain('http_requests_total');
      expect(response.text).toContain('nodejs_version_info');
    });

    it('should include custom application metrics', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.text).toContain('websocket_connections_total');
      expect(response.text).toContain('documents_total');
      expect(response.text).toContain('memory_usage_bytes');
    });
  });

  describe('Authentication Endpoints', () => {
    describe('User Registration', () => {
      it('should register new user successfully', async () => {
        const userData = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'TestPassword123!',
          role: 'user'
        };

        const response = await request(app)
          .post('/api/auth/register')
          .send(userData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.user).toMatchObject({
          username: 'testuser',
          email: 'test@example.com',
          role: 'user'
        });
        expect(response.body.data.user).not.toHaveProperty('passwordHash');
        expect(response.body.data).toHaveProperty('accessToken');
        expect(response.body.data).toHaveProperty('refreshToken');
      });

      it('should validate required fields', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({})
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toHaveProperty('message');
      });

      it('should reject duplicate username', async () => {
        const userData = {
          username: 'duplicate',
          email: 'first@example.com',
          password: 'TestPassword123!'
        };

        // First registration
        await request(app)
          .post('/api/auth/register')
          .send(userData)
          .expect(201);

        // Duplicate registration
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            ...userData,
            email: 'second@example.com'
          })
          .expect(409);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Username already exists');
      });

      it('should reject duplicate email', async () => {
        const userData = {
          username: 'first',
          email: 'duplicate@example.com',
          password: 'TestPassword123!'
        };

        // First registration
        await request(app)
          .post('/api/auth/register')
          .send(userData)
          .expect(201);

        // Duplicate registration
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            ...userData,
            username: 'second'
          })
          .expect(409);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Email already exists');
      });
    });

    describe('User Login', () => {
      let testUser: any;

      beforeEach(async () => {
        testUser = await UserModel.create({
          username: 'loginuser',
          email: 'login@example.com',
          password: 'TestPassword123!',
          role: UserRole.EDITOR
        });
      });

      it('should login with valid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'loginuser',
            password: 'TestPassword123!'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.user).toMatchObject({
          username: 'loginuser',
          email: 'login@example.com',
          role: 'editor'
        });
        expect(response.body.data).toHaveProperty('accessToken');
        expect(response.body.data).toHaveProperty('refreshToken');
      });

      it('should login with email', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'login@example.com',
            password: 'TestPassword123!'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.user.username).toBe('loginuser');
      });

      it('should reject invalid username', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'nonexistent',
            password: 'TestPassword123!'
          })
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Invalid credentials');
      });

      it('should reject invalid password', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'loginuser',
            password: 'WrongPassword123!'
          })
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Invalid credentials');
      });

      it('should validate required fields', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({})
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('Current User Info', () => {
      let testUser: any;
      let accessToken: string;

      beforeEach(async () => {
        testUser = await UserModel.create({
          username: 'authuser',
          email: 'auth@example.com',
          password: 'TestPassword123!',
          role: UserRole.EDITOR
        });

        accessToken = JWTUtils.generateAccessToken(testUser);
      });

      it('should return current user info with valid token', async () => {
        const response = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.user).toMatchObject({
          username: 'authuser',
          email: 'auth@example.com',
          role: 'editor'
        });
      });

      it('should reject request without token', async () => {
        const response = await request(app)
          .get('/api/auth/me')
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Access token required');
      });

      it('should reject request with invalid token', async () => {
        const response = await request(app)
          .get('/api/auth/me')
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);

        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Admin Endpoints', () => {
    let adminUser: any;
    let adminToken: string;
    let regularUser: any;
    let regularToken: string;

    beforeEach(async () => {
      adminUser = await UserModel.create({
        username: 'apiadmin',
        email: 'apiadmin@example.com',
        password: 'TestPassword123!',
        role: UserRole.ADMIN
      });

      adminToken = JWTUtils.generateAccessToken(adminUser);

      regularUser = await UserModel.create({
        username: 'regular',
        email: 'regular@example.com',
        password: 'TestPassword123!',
        role: UserRole.USER
      });

      regularToken = JWTUtils.generateAccessToken(regularUser);
    });

    describe('Connection Stats', () => {
      it('should return connection statistics for admin', async () => {
        const response = await request(app)
          .get('/api/connections')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('websocketConnections');
        expect(response.body.data).toHaveProperty('activeDocuments');
        expect(response.body.data).toHaveProperty('connectedUsers');
        expect(response.body.data).toHaveProperty('timestamp');
      });

      it('should reject non-admin access', async () => {
        const response = await request(app)
          .get('/api/connections')
          .set('Authorization', `Bearer ${regularToken}`)
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Insufficient role');
      });

      it('should reject unauthenticated access', async () => {
        const response = await request(app)
          .get('/api/connections')
          .expect(401);

        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('API Documentation', () => {
    it('should return API documentation', async () => {
      const response = await request(app)
        .get('/api/')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('message');
      expect(response.body.data).toHaveProperty('endpoints');
      expect(response.body.data.endpoints).toHaveProperty('auth');
      expect(response.body.data.endpoints).toHaveProperty('system');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('message');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle large payloads', async () => {
      const largeData = {
        username: 'test',
        email: 'test@example.com',
        password: 'TestPassword123!',
        extraData: 'x'.repeat(20 * 1024 * 1024) // 20MB
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(largeData)
        .expect(413); // Payload too large

      expect(response.body.success).toBe(false);
    });
  });

  describe('CORS and Security Headers', () => {
    it('should include CORS headers', async () => {
      const response = await request(app)
        .options('/api/health')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });

    it('should include security headers', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on auth endpoints', async () => {
      const requests = [];
      
      // Make multiple rapid requests (test environment allows 100/min, so make 101)
      for (let i = 0; i < 101; i++) {
        requests.push(
          request(app)
            .post('/api/auth/login')
            .send({
              username: 'test',
              password: 'Test123!'
            })
        );
      }

      const responses = await Promise.all(requests);
      
      // At least some should be rate limited
      const rateLimited = responses.some(res => res.status === 429);
      expect(rateLimited).toBe(true);
    });
  });
});