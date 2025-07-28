import bcrypt from 'bcryptjs';
import { User, UserRole, Permission } from '../../../shared/src/types/auth';
import { ROLE_PERMISSIONS, PASSWORD_CONFIG } from '../../../shared/src/constants/auth';
import { databaseService } from '../config/database-service';
import { UserRole as PrismaUserRole, $Enums } from '../generated/prisma';
import logger from '../utils/logger';

export class UserDatabaseModel {
  private static mapToPrismaUserRole(role: UserRole): PrismaUserRole {
    // Map from shared UserRole to Prisma UserRole enum values
    const roleMap: Record<UserRole, PrismaUserRole> = {
      [UserRole.ADMIN]: $Enums.UserRole.ADMIN,
      [UserRole.EDITOR]: $Enums.UserRole.EDITOR,
      [UserRole.VIEWER]: $Enums.UserRole.VIEWER,
      [UserRole.USER]: $Enums.UserRole.USER
    };
    return roleMap[role];
  }

  private static validateUsername(username: string): void {
    if (!username || username.trim().length < 3) {
      throw new Error('Username must be at least 3 characters long');
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      throw new Error('Username can only contain letters, numbers, underscores, periods, and hyphens');
    }
    // Username cannot be only numbers
    if (/^\d+$/.test(username)) {
      throw new Error('Username cannot be only numbers');
    }
    // Username must start with a letter
    if (!/^[a-zA-Z]/.test(username)) {
      throw new Error('Username must start with a letter');
    }
  }

  private static validateEmail(email: string): void {
    if (!email || !email.includes('@')) {
      throw new Error('Invalid email format');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }
  }

  private static validatePasswordStrength(password: string): void {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      throw new Error('Password must contain at least one uppercase letter, one lowercase letter, and one number');
    }
  }

  private static mapDatabaseUserToUser(dbUser: any): User {
    return {
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
      password: dbUser.passwordHash,
      role: dbUser.role as UserRole,
      permissions: Array.isArray(dbUser.permissions) ? dbUser.permissions : ROLE_PERMISSIONS[dbUser.role as UserRole],
      createdAt: dbUser.createdAt,
      updatedAt: dbUser.updatedAt
    };
  }

  static async create(userData: {
    username: string;
    email: string;
    password: string;
    role?: UserRole;
  }): Promise<User> {
    logger.info('Creating user in database', { username: userData.username, email: userData.email });
    
    // Validate input data
    this.validateUsername(userData.username);
    this.validateEmail(userData.email);
    this.validatePasswordStrength(userData.password);

    const prisma = databaseService.getClient();
    const hashedPassword = await bcrypt.hash(userData.password, PASSWORD_CONFIG.SALT_ROUNDS);
    const role = userData.role || UserRole.USER;
    const permissions = ROLE_PERMISSIONS[role];

    try {
      const dbUser = await prisma.user.create({
        data: {
          username: userData.username.trim(),
          email: userData.email.trim().toLowerCase(),
          passwordHash: hashedPassword,
          role: this.mapToPrismaUserRole(role),
          permissions: permissions
        }
      });

      logger.info(`User created in database: ${dbUser.id}`, { username: userData.username });
      return this.mapDatabaseUserToUser(dbUser);
    } catch (error: any) {
      logger.error('Failed to create user in database', { 
        error: error.message, 
        username: userData.username 
      });
      
      // Handle unique constraint violations
      if (error.code === 'P2002') {
        const target = error.meta?.target;
        if (target?.includes('username')) {
          throw new Error('Username already exists');
        }
        if (target?.includes('email')) {
          throw new Error('Email already exists');
        }
      }
      
      throw error;
    }
  }

  static async findById(id: string): Promise<User | null> {
    try {
      const prisma = databaseService.getClient();
      const dbUser = await prisma.user.findUnique({
        where: { id }
      });

      if (!dbUser) {
        return null;
      }

      return this.mapDatabaseUserToUser(dbUser);
    } catch (error) {
      logger.error('Failed to find user by ID', { error, id });
      return null;
    }
  }

  static async findByUsername(username: string): Promise<User | null> {
    try {
      const prisma = databaseService.getClient();
      const dbUser = await prisma.user.findUnique({
        where: { username: username.trim() }
      });

      if (!dbUser) {
        return null;
      }

      return this.mapDatabaseUserToUser(dbUser);
    } catch (error) {
      logger.error('Failed to find user by username', { error, username });
      return null;
    }
  }

  static async findByEmail(email: string): Promise<User | null> {
    try {
      const prisma = databaseService.getClient();
      const dbUser = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() }
      });

      if (!dbUser) {
        return null;
      }

      return this.mapDatabaseUserToUser(dbUser);
    } catch (error) {
      logger.error('Failed to find user by email', { error, email });
      return null;
    }
  }

  static async findByUsernameOrEmail(identifier: string): Promise<User | null> {
    const userByUsername = await this.findByUsername(identifier);
    if (userByUsername) {
      return userByUsername;
    }
    return await this.findByEmail(identifier);
  }

  static async updateById(id: string, updates: Partial<User>): Promise<User | null> {
    try {
      const prisma = databaseService.getClient();
      
      // Prepare update data
      const updateData: any = {};
      
      if (updates.username) {
        this.validateUsername(updates.username);
        updateData.username = updates.username.trim();
      }
      
      if (updates.email) {
        this.validateEmail(updates.email);
        updateData.email = updates.email.trim().toLowerCase();
      }
      
      if (updates.password) {
        this.validatePasswordStrength(updates.password);
        updateData.passwordHash = await bcrypt.hash(updates.password, PASSWORD_CONFIG.SALT_ROUNDS);
      }
      
      if (updates.role && updates.role !== updates.role) {
        updateData.role = updates.role;
        updateData.permissions = JSON.stringify(ROLE_PERMISSIONS[updates.role]);
      }

      const dbUser = await prisma.user.update({
        where: { id },
        data: updateData
      });

      logger.info(`User updated in database: ${id}`, { updates: Object.keys(updateData) });
      return this.mapDatabaseUserToUser(dbUser);
    } catch (error: any) {
      logger.error('Failed to update user', { error: error.message, id });
      
      if (error.code === 'P2025') {
        return null; // User not found
      }
      
      // Handle unique constraint violations
      if (error.code === 'P2002') {
        const target = error.meta?.target;
        if (target?.includes('username')) {
          throw new Error('Username already exists');
        }
        if (target?.includes('email')) {
          throw new Error('Email already exists');
        }
      }
      
      throw error;
    }
  }

  static async deleteById(id: string): Promise<boolean> {
    try {
      const prisma = databaseService.getClient();
      await prisma.user.delete({
        where: { id }
      });

      logger.info(`User deleted from database: ${id}`);
      return true;
    } catch (error: any) {
      logger.error('Failed to delete user', { error: error.message, id });
      
      if (error.code === 'P2025') {
        return false; // User not found
      }
      
      throw error;
    }
  }

  static async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password);
  }

  static async getAllUsers(): Promise<User[]> {
    try {
      const prisma = databaseService.getClient();
      const dbUsers = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' }
      });

      return dbUsers.map(dbUser => this.mapDatabaseUserToUser(dbUser));
    } catch (error) {
      logger.error('Failed to get all users', { error });
      return [];
    }
  }

  static async getUserCount(): Promise<number> {
    try {
      const prisma = databaseService.getClient();
      return await prisma.user.count();
    } catch (error) {
      logger.error('Failed to get user count', { error });
      return 0;
    }
  }

  static sanitizeUser(user: User): Omit<User, 'password'> {
    const { password, ...sanitized } = user;
    return sanitized;
  }

  /**
   * Initialize with default admin user
   */
  static async initialize(): Promise<void> {
    try {
      const adminExists = await this.findByUsername('admin');
      if (!adminExists) {
        await this.create({
          username: 'admin',
          email: 'admin@example.com',
          password: 'AdminPassword123',
          role: UserRole.ADMIN
        });
        logger.info('Default admin user created');
      } else {
        logger.info('Default admin user already exists');
      }
    } catch (error) {
      logger.error('Failed to initialize default admin user', { error });
      throw error;
    }
  }

  /**
   * Clean up method for testing
   */
  static async clear(): Promise<void> {
    try {
      const prisma = databaseService.getClient();
      await prisma.user.deleteMany({});
      logger.info('All users cleared from database');
    } catch (error) {
      logger.error('Failed to clear users from database', { error });
      throw error;
    }
  }

  /**
   * Get users with pagination
   */
  static async getPaginatedUsers(page: number = 1, limit: number = 20): Promise<{
    users: User[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const prisma = databaseService.getClient();
      const skip = (page - 1) * limit;

      const [dbUsers, total] = await Promise.all([
        prisma.user.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.user.count()
      ]);

      const users = dbUsers.map(dbUser => this.mapDatabaseUserToUser(dbUser));
      const totalPages = Math.ceil(total / limit);

      return {
        users,
        total,
        page,
        totalPages
      };
    } catch (error) {
      logger.error('Failed to get paginated users', { error, page, limit });
      return {
        users: [],
        total: 0,
        page,
        totalPages: 0
      };
    }
  }
}