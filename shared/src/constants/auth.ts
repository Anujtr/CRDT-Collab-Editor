import { UserRole, Permission } from '../types/auth';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    Permission.DOCUMENT_READ,
    Permission.DOCUMENT_WRITE,
    Permission.DOCUMENT_DELETE,
    Permission.USER_MANAGE,
    Permission.ADMIN_ACCESS,
    Permission.SNAPSHOT_CREATE,
    Permission.SNAPSHOT_RESTORE
  ],
  [UserRole.EDITOR]: [
    Permission.DOCUMENT_READ,
    Permission.DOCUMENT_WRITE
  ],
  [UserRole.VIEWER]: [
    Permission.DOCUMENT_READ
  ],
  [UserRole.USER]: []
};

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.ADMIN]: 4,
  [UserRole.EDITOR]: 3,
  [UserRole.VIEWER]: 2,
  [UserRole.USER]: 1
};

export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  INSUFFICIENT_PERMISSIONS: 'AUTH_INSUFFICIENT_PERMISSIONS',
  USER_NOT_FOUND: 'AUTH_USER_NOT_FOUND',
  USER_ALREADY_EXISTS: 'AUTH_USER_ALREADY_EXISTS',
  INVALID_ROLE: 'AUTH_INVALID_ROLE'
} as const;

export const JWT_CONFIG = {
  ALGORITHM: 'HS256' as const,
  EXPIRATION: '24h',
  REFRESH_EXPIRATION: '7d'
};

export const PASSWORD_CONFIG = {
  MIN_LENGTH: 8,
  SALT_ROUNDS: 12
};

export const RATE_LIMIT_CONFIG = {
  LOGIN_ATTEMPTS: process.env.NODE_ENV === 'test' ? 100 : 5,
  LOGIN_WINDOW: process.env.NODE_ENV === 'test' ? 60 * 1000 : 15 * 60 * 1000, // 1 min for test, 15 min for prod
  REGISTER_ATTEMPTS: process.env.NODE_ENV === 'test' ? 100 : 3,
  REGISTER_WINDOW: process.env.NODE_ENV === 'test' ? 60 * 1000 : 60 * 60 * 1000 // 1 min for test, 1 hour for prod
};