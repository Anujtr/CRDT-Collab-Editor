import { UserModel } from '../../../src/models/User';
import { UserRole } from '../../../../shared/src/types/auth';
import bcrypt from 'bcryptjs';

describe('UserModel', () => {
  beforeEach(() => {
    // Clear all users before each test
    UserModel.clear();
  });

  afterEach(() => {
    // Clear all users after each test
    UserModel.clear();
  });

  describe('User Creation', () => {
    it('should create a new user with default role', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword123!'
      };

      const user = await UserModel.create(userData);

      expect(user).toMatchObject({
        username: 'testuser',
        email: 'test@example.com',
        role: UserRole.USER // default role
      });
      expect(user.id).toBeDefined();
      expect(user.password).toBeDefined();
      expect(user.password).not.toBe('TestPassword123'); // should be hashed
      expect(user.permissions).toBeInstanceOf(Array);
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a user with specified role', async () => {
      const userData = {
        username: 'editor',
        email: 'editor@example.com',
        password: 'TestPassword123!',
        role: UserRole.EDITOR
      };

      const user = await UserModel.create(userData);

      expect(user.role).toBe(UserRole.EDITOR);
      expect(user.permissions).toContain('document:read');
      expect(user.permissions).toContain('document:write');
    });

    it('should create admin user with all permissions', async () => {
      const userData = {
        username: 'testadmin',
        email: 'testadmin@example.com',
        password: 'TestPassword123!',
        role: UserRole.ADMIN
      };

      const user = await UserModel.create(userData);

      expect(user.role).toBe(UserRole.ADMIN);
      expect(user.permissions.length).toBeGreaterThan(0);
    });

    it('should hash password correctly', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'PlaintextPassword123!'
      };

      const user = await UserModel.create(userData);

      // Verify password is hashed
      expect(user.password).not.toBe('PlaintextPassword123!');
      
      // Verify hash can be verified
      const isValid = await bcrypt.compare('PlaintextPassword123!', user.password);
      expect(isValid).toBe(true);
    });

    it('should generate unique IDs', async () => {
      const user1 = await UserModel.create({
        username: 'user1',
        email: 'user1@example.com',
        password: 'TestPassword123!'
      });

      const user2 = await UserModel.create({
        username: 'user2',
        email: 'user2@example.com',
        password: 'TestPassword123!'
      });

      expect(user1.id).not.toBe(user2.id);
    });
  });

  describe('User Validation', () => {
    it('should reject duplicate username', async () => {
      await UserModel.create({
        username: 'duplicate',
        email: 'first@example.com',
        password: 'TestPassword123!'
      });

      await expect(UserModel.create({
        username: 'duplicate',
        email: 'second@example.com',
        password: 'TestPassword123!'
      })).rejects.toThrow('Username already exists');
    });

    it('should reject duplicate email', async () => {
      await UserModel.create({
        username: 'first',
        email: 'duplicate@example.com',
        password: 'TestPassword123!'
      });

      await expect(UserModel.create({
        username: 'second',
        email: 'duplicate@example.com',
        password: 'TestPassword123!'
      })).rejects.toThrow('Email already exists');
    });

    it('should validate username format', async () => {
      const invalidUsernames = ['', 'a', 'ab', 'user@name', 'user name', '123'];

      for (const username of invalidUsernames) {
        await expect(UserModel.create({
          username,
          email: 'test@example.com',
          password: 'TestPassword123!'
        })).rejects.toThrow();
      }
    });

    it('should validate email format', async () => {
      const invalidEmails = ['', 'invalid', 'invalid@', '@example.com', 'test@'];

      for (const email of invalidEmails) {
        await expect(UserModel.create({
          username: 'testuser',
          email,
          password: 'TestPassword123!'
        })).rejects.toThrow();
      }
    });

    it('should validate password strength', async () => {
      const weakPasswords = ['', '123', 'abc', 'short', 'noupper1', 'NOLOWER1', 'nonumbers'];

      for (const password of weakPasswords) {
        await expect(UserModel.create({
          username: `testuser${Math.random()}`, // Unique username for each test
          email: `test${Math.random()}@example.com`, // Unique email for each test
          password
        })).rejects.toThrow();
      }
    });
  });

  describe('User Retrieval', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await UserModel.create({
        username: 'findme',
        email: 'findme@example.com',
        password: 'TestPassword123!',
        role: UserRole.EDITOR
      });
    });

    it('should find user by ID', async () => {
      const found = await UserModel.findById(testUser.id);

      expect(found).toMatchObject({
        id: testUser.id,
        username: 'findme',
        email: 'findme@example.com',
        role: UserRole.EDITOR
      });
    });

    it('should find user by username', async () => {
      const found = await UserModel.findByUsername('findme');

      expect(found).toMatchObject({
        id: testUser.id,
        username: 'findme',
        email: 'findme@example.com'
      });
    });

    it('should find user by email', async () => {
      const found = await UserModel.findByEmail('findme@example.com');

      expect(found).toMatchObject({
        id: testUser.id,
        username: 'findme',
        email: 'findme@example.com'
      });
    });

    it('should return null for non-existent user', async () => {
      const found = await UserModel.findById('non-existent-id');
      expect(found).toBeNull();
    });

    it('should return null for non-existent username', async () => {
      const found = await UserModel.findByUsername('non-existent');
      expect(found).toBeNull();
    });

    it('should return null for non-existent email', async () => {
      const found = await UserModel.findByEmail('non-existent@example.com');
      expect(found).toBeNull();
    });
  });

  describe('Password Verification', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await UserModel.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'CorrectPassword123!'
      });
    });

    it('should verify correct password', async () => {
      const isValid = await UserModel.validatePassword(testUser, 'CorrectPassword123!');
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const isValid = await UserModel.validatePassword(testUser, 'WrongPassword123!');
      expect(isValid).toBe(false);
    });

    it('should handle non-existent user', async () => {
      const nonExistentUser = { id: 'fake', username: 'fake', email: 'fake@test.com', password: 'fake', role: UserRole.USER, permissions: [], createdAt: new Date(), updatedAt: new Date() };
      const isValid = await UserModel.validatePassword(nonExistentUser, 'any-password');
      expect(isValid).toBe(false);
    });
  });

  describe('User Updates', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await UserModel.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword123!',
        role: UserRole.USER
      });
    });

    it('should update user role', async () => {
      // Add small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const updated = await UserModel.updateById(testUser.id, { role: UserRole.EDITOR });

      expect(updated).not.toBeNull();
      expect(updated!.role).toBe(UserRole.EDITOR);
      expect(updated!.permissions).toContain('document:read');
      expect(updated!.permissions).toContain('document:write');
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(testUser.updatedAt.getTime());
    });

    it('should handle non-existent user update', async () => {
      const updated = await UserModel.updateById('non-existent-id', { role: UserRole.EDITOR });
      expect(updated).toBeNull();
    });
  });

  describe('User Listing', () => {
    beforeEach(async () => {
      await UserModel.create({
        username: 'user1',
        email: 'user1@example.com',
        password: 'TestPassword123!',
        role: UserRole.USER
      });

      await UserModel.create({
        username: 'admin1',
        email: 'admin1@example.com',
        password: 'TestPassword123!',
        role: UserRole.ADMIN
      });

      await UserModel.create({
        username: 'editor1',
        email: 'editor1@example.com',
        password: 'TestPassword123!',
        role: UserRole.EDITOR
      });
    });

    it('should list all users', () => {
      const users = UserModel.listAll();

      expect(users).toHaveLength(3); // Only the 3 users we created (no default admin in beforeEach)
      expect(users.map(u => u.username)).toEqual(
        expect.arrayContaining(['user1', 'admin1', 'editor1'])
      );
    });

    it('should exclude password hashes from listing', () => {
      const users = UserModel.listAll();

      users.forEach(user => {
        expect(user).not.toHaveProperty('passwordHash');
      });
    });
  });

  describe('Cleanup', () => {
    it('should clear all users', async () => {
      await UserModel.create({
        username: 'user1',
        email: 'user1@example.com',
        password: 'TestPassword123!'
      });

      await UserModel.create({
        username: 'user2',
        email: 'user2@example.com',
        password: 'TestPassword123!'
      });

      expect(UserModel.listAll()).toHaveLength(2); // Only the 2 users we created

      UserModel.clear();

      expect(UserModel.listAll()).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty initialization', async () => {
      UserModel.clear();
      await UserModel.initialize();

      expect(UserModel.listAll()).toHaveLength(1); // Should create default admin
      expect(UserModel.listAll()[0]?.username).toBe('admin');
    });

    it('should handle multiple initializations', async () => {
      await UserModel.initialize();
      await UserModel.initialize();
      await UserModel.initialize();

      // Should not throw or create duplicate users
      expect(() => UserModel.listAll()).not.toThrow();
    });
  });
});