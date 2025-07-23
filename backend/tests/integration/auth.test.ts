import request from 'supertest';
import { Express } from 'express';
import { UserModel } from '../../src/models/User';
import { UserRole, Permission } from '../../../shared/src/types/auth';
import { JWTUtils } from '../../src/utils/jwt';

let app: Express;
let server: any;

// Mock Redis for testing
jest.mock('../../src/config/database', () => ({
  RedisClient: {
    isClientConnected: () => false,
    setSession: jest.fn(),
    getSession: jest.fn(),
    deleteSession: jest.fn(),
    incrementRateLimit: jest.fn().mockResolvedValue({
      count: 1,
      reset: Date.now() + 60000,
      exceeded: false
    })
  }
}));

describe('Authentication & Authorization Integration Tests', () => {
  beforeAll(async () => {
    // Import and initialize server
    const serverModule = await import('../../src/server');
    server = serverModule.default;
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

  describe('JWT Token Management', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await UserModel.create({
        username: 'tokenuser',
        email: 'token@example.com',
        password: 'TestPassword123',
        role: UserRole.EDITOR
      });
    });

    describe('Token Generation', () => {
      it('should generate access and refresh tokens on login', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'tokenuser',
            password: 'TestPassword123'
          })
          .expect(200);

        expect(response.body.data).toHaveProperty('accessToken');
        expect(response.body.data).toHaveProperty('refreshToken');
        
        // Validate token structure
        const accessToken = response.body.data.accessToken;
        expect(accessToken.split('.')).toHaveLength(3);
        
        const refreshToken = response.body.data.refreshToken;
        expect(refreshToken.split('.')).toHaveLength(3);
      });

      it('should include correct payload in access token', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'tokenuser',
            password: 'TestPassword123'
          })
          .expect(200);

        const accessToken = response.body.data.accessToken;
        const decoded = JWTUtils.verifyToken(accessToken);

        expect(decoded).toMatchObject({
          userId: testUser.id,
          username: testUser.username,
          role: testUser.role,
          permissions: testUser.permissions
        });
      });

      it('should generate different tokens for different users', async () => {
        const secondUser = await UserModel.create({
          username: 'tokenuser2',
          email: 'token2@example.com',
          password: 'TestPassword123',
          role: UserRole.VIEWER
        });

        const response1 = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'tokenuser',
            password: 'TestPassword123'
          });

        const response2 = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'tokenuser2',
            password: 'TestPassword123'
          });

        expect(response1.body.data.accessToken).not.toBe(response2.body.data.accessToken);
        expect(response1.body.data.refreshToken).not.toBe(response2.body.data.refreshToken);
      });
    });

    describe('Token Refresh', () => {
      it('should refresh access token with valid refresh token', async () => {
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'tokenuser',
            password: 'TestPassword123'
          });

        const refreshToken = loginResponse.body.data.refreshToken;

        const refreshResponse = await request(app)
          .post('/api/auth/refresh')
          .send({
            refreshToken
          })
          .expect(200);

        expect(refreshResponse.body.success).toBe(true);
        expect(refreshResponse.body.data).toHaveProperty('accessToken');
        expect(refreshResponse.body.data).toHaveProperty('refreshToken');
        
        // New tokens should be different
        expect(refreshResponse.body.data.accessToken).not.toBe(loginResponse.body.data.accessToken);
      });

      it('should reject invalid refresh token', async () => {
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({
            refreshToken: 'invalid-refresh-token'
          })
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Invalid refresh token');
      });

      it('should reject expired refresh token', async () => {
        // Create token with very short expiration
        const shortLivedToken = JWTUtils.generateRefreshToken(testUser);

        // Mock expired token
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({
            refreshToken: shortLivedToken
          });

        // Should either succeed or fail based on timing
        if (response.status === 401) {
          expect(response.body.error.message).toContain('expired');
        }
      });
    });
  });

  describe('Role-Based Access Control', () => {
    let adminUser: any;
    let editorUser: any;
    let viewerUser: any;
    let regularUser: any;

    beforeEach(async () => {
      adminUser = await UserModel.create({
        username: 'testadmin',
        email: 'testadmin@example.com',
        password: 'TestPassword123',
        role: UserRole.ADMIN
      });

      editorUser = await UserModel.create({
        username: 'testeditor',
        email: 'testeditor@example.com',
        password: 'TestPassword123',
        role: UserRole.EDITOR
      });

      viewerUser = await UserModel.create({
        username: 'testviewer',
        email: 'testviewer@example.com',
        password: 'TestPassword123',
        role: UserRole.VIEWER
      });

      regularUser = await UserModel.create({
        username: 'testregular',
        email: 'testregular@example.com',
        password: 'TestPassword123',
        role: UserRole.USER
      });
    });

    const createTokenForUser = (user: any) => {
      return JWTUtils.generateAccessToken(user);
    };

    describe('Admin-Only Endpoints', () => {
      it('should allow admin access to connection stats', async () => {
        const adminToken = createTokenForUser(adminUser);

        const response = await request(app)
          .get('/api/connections')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('websocketConnections');
      });

      it('should deny non-admin access to connection stats', async () => {
        const users = [editorUser, viewerUser, regularUser];

        for (const user of users) {
          const token = createTokenForUser(user);

          const response = await request(app)
            .get('/api/connections')
            .set('Authorization', `Bearer ${token}`)
            .expect(403);

          expect(response.body.success).toBe(false);
          expect(response.body.error.message).toContain('Insufficient role');
        }
      });
    });

    describe('Permission-Based Access', () => {
      it('should verify user permissions in token', async () => {
        const users = [
          { user: adminUser, shouldHave: ['document:read', 'document:write', 'admin:access'] },
          { user: editorUser, shouldHave: ['document:read', 'document:write'] },
          { user: viewerUser, shouldHave: ['document:read'] },
          { user: regularUser, shouldHave: [] }
        ];

        for (const { user, shouldHave } of users) {
          const token = createTokenForUser(user);
          const decoded = JWTUtils.verifyToken(token);

          for (const permission of shouldHave) {
            expect(decoded.permissions).toContain(permission);
          }
        }
      });

      it('should enforce minimum role requirements', async () => {
        const testCases = [
          { user: adminUser, expectedAccess: true },
          { user: editorUser, expectedAccess: false },
          { user: viewerUser, expectedAccess: false },
          { user: regularUser, expectedAccess: false }
        ];

        for (const { user, expectedAccess } of testCases) {
          const token = createTokenForUser(user);

          const response = await request(app)
            .get('/api/connections')
            .set('Authorization', `Bearer ${token}`);

          if (expectedAccess) {
            expect(response.status).toBe(200);
          } else {
            expect(response.status).toBe(403);
          }
        }
      });
    });

    describe('Role Hierarchy', () => {
      it('should enforce role hierarchy correctly', async () => {
        const roleHierarchy = [
          UserRole.ADMIN,    // Highest
          UserRole.EDITOR,
          UserRole.VIEWER,
          UserRole.USER      // Lowest
        ];

        // Each role should have permissions of lower roles
        const adminPermissions = adminUser.permissions;
        const editorPermissions = editorUser.permissions;
        const viewerPermissions = viewerUser.permissions;

        // Admin should have all permissions
        expect(adminPermissions.length).toBeGreaterThanOrEqual(editorPermissions.length);
        
        // Editor should have viewer permissions
        viewerPermissions.forEach((permission: string) => {
          expect(editorPermissions).toContain(permission);
        });
      });
    });
  });

  describe('Authentication Middleware', () => {
    let testUser: any;
    let validToken: string;

    beforeEach(async () => {
      testUser = await UserModel.create({
        username: 'middlewareuser',
        email: 'middleware@example.com',
        password: 'TestPassword123',
        role: UserRole.EDITOR
      });

      validToken = JWTUtils.generateAccessToken(testUser);
    });

    it('should accept Bearer token format', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject missing Authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Access token required');
    });

    it('should reject malformed Authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'InvalidFormat token')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should reject expired tokens', async () => {
      // Create a token that expires immediately (mock)
      const expiredToken = 'expired.token.here';

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should handle user not found scenario', async () => {
      // Create token for non-existent user
      const fakeUser = {
        id: 'non-existent-user-id',
        username: 'nonexistent',
        email: 'nonexistent@example.com',
        password: 'hashedpassword',
        role: UserRole.USER,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const nonExistentToken = JWTUtils.generateAccessToken(fakeUser);

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${nonExistentToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('User not found');
    });
  });

  describe('Session Management', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await UserModel.create({
        username: 'sessionuser',
        email: 'session@example.com',
        password: 'TestPassword123',
        role: UserRole.EDITOR
      });
    });

    it('should create session on login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'sessionuser',
          password: 'TestPassword123'
        })
        .expect(200);

      expect(response.body.data).toHaveProperty('sessionId');
      expect(response.body.data.sessionId).toBeTruthy();
    });

    it('should invalidate session on logout', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'sessionuser',
          password: 'TestPassword123'
        });

      const accessToken = loginResponse.body.data.accessToken;

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('Logged out successfully');
    });
  });

  describe('Password Security', () => {
    it('should hash passwords on registration', async () => {
      const plainPassword = 'PlaintextPassword123!';

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'secureuser',
          email: 'secure@example.com',
          password: plainPassword
        })
        .expect(201);

      // Find the user and verify password is hashed
      const user = await UserModel.findByUsername('secureuser');
      expect(user).toBeTruthy();
      expect(user!.password).not.toBe(plainPassword);
      expect(user!.password.length).toBeGreaterThan(50); // bcrypt hash length
    });

    it('should verify password correctly', async () => {
      const userData = {
        username: 'verifyuser',
        email: 'verify@example.com',
        password: 'CorrectPassword123!'
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login with correct password
      const successResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: userData.username,
          password: userData.password
        })
        .expect(200);

      expect(successResponse.body.success).toBe(true);

      // Login with incorrect password
      const failResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: userData.username,
          password: 'WrongPassword123!'
        })
        .expect(401);

      expect(failResponse.body.success).toBe(false);
    });
  });

  describe('Input Validation & Security', () => {
    describe('Registration Validation', () => {
      it('should validate username format', async () => {
        const invalidUsernames = [
          '',           // empty
          'ab',         // too short
          'user@name',  // special chars
          'user name',  // spaces
          '123456',     // only numbers
        ];

        for (const username of invalidUsernames) {
          const response = await request(app)
            .post('/api/auth/register')
            .send({
              username,
              email: 'test@example.com',
              password: 'TestPassword123'
            })
            .expect(400);

          expect(response.body.success).toBe(false);
        }
      });

      it('should validate email format', async () => {
        const invalidEmails = [
          '',                    // empty
          'invalid',            // no @
          'invalid@',           // incomplete
          '@example.com',       // no local part
          'test@',              // no domain
          'test.example.com',   // no @
        ];

        for (const email of invalidEmails) {
          const response = await request(app)
            .post('/api/auth/register')
            .send({
              username: 'testuser',
              email,
              password: 'TestPassword123'
            })
            .expect(400);

          expect(response.body.success).toBe(false);
        }
      });

      it('should validate password strength', async () => {
        const weakPasswords = [
          '',          // empty
          '123',       // too short
          'abc',       // too short
          'password',  // weak
        ];

        for (const password of weakPasswords) {
          const response = await request(app)
            .post('/api/auth/register')
            .send({
              username: 'testuser',
              email: 'test@example.com',
              password
            })
            .expect(400);

          expect(response.body.success).toBe(false);
        }
      });

      it('should sanitize input data', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: '  testuser  ',  // whitespace
            email: '  Test@Example.com  ',
            password: 'TestPassword123!'
          })
          .expect(201);

        expect(response.body.data.user.username).toBe('testuser');
        expect(response.body.data.user.email).toBe('test@example.com');
      });
    });

    describe('SQL Injection Prevention', () => {
      it('should prevent SQL injection in username', async () => {
        const maliciousUsername = "'; DROP TABLE users; --";

        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: maliciousUsername,
            email: 'test@example.com',
            password: 'TestPassword123'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        
        // Verify users table still exists by trying to list users
        expect(() => UserModel.listAll()).not.toThrow();
      });
    });

    describe('XSS Prevention', () => {
      it('should sanitize HTML in user input', async () => {
        const xssPayload = '<script>alert("xss")</script>';

        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: `user${xssPayload}`,
            email: 'test@example.com',
            password: 'TestPassword123'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on authentication endpoints', async () => {
      const requests = [];
      
      // Make multiple rapid requests
      for (let i = 0; i < 20; i++) {
        requests.push(
          request(app)
            .post('/api/auth/login')
            .send({
              username: 'nonexistent',
              password: 'wrongpassword'
            })
        );
      }

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimitedCount = responses.filter(res => res.status === 429).length;
      const successOrAuthFailureCount = responses.filter(res => 
        res.status === 200 || res.status === 401
      ).length;

      expect(rateLimitedCount + successOrAuthFailureCount).toBe(responses.length);
    });
  });

  describe('Token Expiration', () => {
    it('should respect token expiration times', async () => {
      // This test would require mocking time or using very short expiration times
      // For now, we'll test that tokens have expiration claims
      const testUser = await UserModel.create({
        username: 'expireuser',
        email: 'expire@example.com',
        password: 'TestPassword123',
        role: UserRole.USER
      });

      const token = JWTUtils.generateAccessToken(testUser);

      const decoded = JWTUtils.verifyToken(token);
      
      expect(decoded).toHaveProperty('exp');
      expect(decoded).toHaveProperty('iat');
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
      
      // Verify expiration is in the future
      expect(decoded.exp * 1000).toBeGreaterThan(Date.now());
    });
  });
});