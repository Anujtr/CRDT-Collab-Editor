"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RATE_LIMIT_CONFIG = exports.PASSWORD_CONFIG = exports.JWT_CONFIG = exports.AUTH_ERRORS = exports.ROLE_HIERARCHY = exports.ROLE_PERMISSIONS = void 0;
const auth_1 = require("../types/auth");
exports.ROLE_PERMISSIONS = {
    [auth_1.UserRole.ADMIN]: [
        auth_1.Permission.DOCUMENT_READ,
        auth_1.Permission.DOCUMENT_WRITE,
        auth_1.Permission.DOCUMENT_DELETE,
        auth_1.Permission.USER_MANAGE,
        auth_1.Permission.ADMIN_ACCESS,
        auth_1.Permission.SNAPSHOT_CREATE,
        auth_1.Permission.SNAPSHOT_RESTORE
    ],
    [auth_1.UserRole.EDITOR]: [
        auth_1.Permission.DOCUMENT_READ,
        auth_1.Permission.DOCUMENT_WRITE
    ],
    [auth_1.UserRole.VIEWER]: [
        auth_1.Permission.DOCUMENT_READ
    ],
    [auth_1.UserRole.USER]: []
};
exports.ROLE_HIERARCHY = {
    [auth_1.UserRole.ADMIN]: 4,
    [auth_1.UserRole.EDITOR]: 3,
    [auth_1.UserRole.VIEWER]: 2,
    [auth_1.UserRole.USER]: 1
};
exports.AUTH_ERRORS = {
    INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
    TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
    TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
    INSUFFICIENT_PERMISSIONS: 'AUTH_INSUFFICIENT_PERMISSIONS',
    USER_NOT_FOUND: 'AUTH_USER_NOT_FOUND',
    USER_ALREADY_EXISTS: 'AUTH_USER_ALREADY_EXISTS',
    INVALID_ROLE: 'AUTH_INVALID_ROLE'
};
exports.JWT_CONFIG = {
    ALGORITHM: 'HS256',
    EXPIRATION: '24h',
    REFRESH_EXPIRATION: '7d'
};
exports.PASSWORD_CONFIG = {
    MIN_LENGTH: 8,
    SALT_ROUNDS: 12
};
exports.RATE_LIMIT_CONFIG = {
    LOGIN_ATTEMPTS: process.env.NODE_ENV === 'test' ? 100 : 5,
    LOGIN_WINDOW: process.env.NODE_ENV === 'test' ? 60 * 1000 : 15 * 60 * 1000,
    REGISTER_ATTEMPTS: process.env.NODE_ENV === 'test' ? 100 : 3,
    REGISTER_WINDOW: process.env.NODE_ENV === 'test' ? 60 * 1000 : 60 * 60 * 1000
};
//# sourceMappingURL=auth.js.map