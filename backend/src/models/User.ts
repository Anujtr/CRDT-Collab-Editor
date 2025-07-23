import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole, Permission } from '../../../shared/src/types/auth';
import { ROLE_PERMISSIONS, PASSWORD_CONFIG } from '../../../shared/src/constants/auth';

export class UserModel {
  private static users: Map<string, User> = new Map();
  private static usersByUsername: Map<string, User> = new Map();
  private static usersByEmail: Map<string, User> = new Map();

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

  static async create(userData: {
    username: string;
    email: string;
    password: string;
    role?: UserRole;
  }): Promise<User> {
    // Validate input data
    this.validateUsername(userData.username);
    this.validateEmail(userData.email);
    this.validatePasswordStrength(userData.password);

    const existingByUsername = this.usersByUsername.get(userData.username);
    const existingByEmail = this.usersByEmail.get(userData.email);

    if (existingByUsername) {
      throw new Error('Username already exists');
    }

    if (existingByEmail) {
      throw new Error('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(userData.password, PASSWORD_CONFIG.SALT_ROUNDS);
    const role = userData.role || UserRole.USER;
    const permissions = ROLE_PERMISSIONS[role];

    const user: User = {
      id: uuidv4(),
      username: userData.username,
      email: userData.email,
      password: hashedPassword,
      role,
      permissions,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.users.set(user.id, user);
    this.usersByUsername.set(user.username, user);
    this.usersByEmail.set(user.email, user);

    return user;
  }

  static async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  static async findByUsername(username: string): Promise<User | null> {
    return this.usersByUsername.get(username) || null;
  }

  static async findByEmail(email: string): Promise<User | null> {
    return this.usersByEmail.get(email) || null;
  }

  static async findByUsernameOrEmail(identifier: string): Promise<User | null> {
    const userByUsername = await this.findByUsername(identifier);
    if (userByUsername) {
      return userByUsername;
    }
    return await this.findByEmail(identifier);
  }

  static async updateById(id: string, updates: Partial<User>): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) {
      return null;
    }

    const updatedUser = {
      ...user,
      ...updates,
      updatedAt: new Date()
    };

    // Update password if provided
    if (updates.password) {
      updatedUser.password = await bcrypt.hash(updates.password, PASSWORD_CONFIG.SALT_ROUNDS);
    }

    // Update permissions if role changed
    if (updates.role && updates.role !== user.role) {
      updatedUser.permissions = ROLE_PERMISSIONS[updates.role];
    }

    this.users.set(id, updatedUser);
    
    // Update indexes if username or email changed
    if (updates.username && updates.username !== user.username) {
      this.usersByUsername.delete(user.username);
      this.usersByUsername.set(updates.username, updatedUser);
    }
    
    if (updates.email && updates.email !== user.email) {
      this.usersByEmail.delete(user.email);
      this.usersByEmail.set(updates.email, updatedUser);
    }

    return updatedUser;
  }

  static async deleteById(id: string): Promise<boolean> {
    const user = this.users.get(id);
    if (!user) {
      return false;
    }

    this.users.delete(id);
    this.usersByUsername.delete(user.username);
    this.usersByEmail.delete(user.email);

    return true;
  }

  static async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password);
  }

  static async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  static async getUserCount(): Promise<number> {
    return this.users.size;
  }

  static sanitizeUser(user: User): Omit<User, 'password'> {
    const { password, ...sanitized } = user;
    return sanitized;
  }

  // Test utility methods
  static listAll(): User[] {
    return Array.from(this.users.values());
  }

  static clear(): void {
    this.users.clear();
    this.usersByUsername.clear();
    this.usersByEmail.clear();
  }

  // Initialize with default admin user
  static async initialize(): Promise<void> {
    const adminExists = await this.findByUsername('admin');
    if (!adminExists) {
      await this.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'AdminPassword123',
        role: UserRole.ADMIN
      });
    }
  }
}