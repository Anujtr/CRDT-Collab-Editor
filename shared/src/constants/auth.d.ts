import { UserRole, Permission } from '../types/auth';
export declare const ROLE_PERMISSIONS: Record<UserRole, Permission[]>;
export declare const ROLE_HIERARCHY: Record<UserRole, number>;
export declare const AUTH_ERRORS: {
    readonly INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS";
    readonly TOKEN_EXPIRED: "AUTH_TOKEN_EXPIRED";
    readonly TOKEN_INVALID: "AUTH_TOKEN_INVALID";
    readonly INSUFFICIENT_PERMISSIONS: "AUTH_INSUFFICIENT_PERMISSIONS";
    readonly USER_NOT_FOUND: "AUTH_USER_NOT_FOUND";
    readonly USER_ALREADY_EXISTS: "AUTH_USER_ALREADY_EXISTS";
    readonly INVALID_ROLE: "AUTH_INVALID_ROLE";
};
export declare const JWT_CONFIG: {
    ALGORITHM: "HS256";
    EXPIRATION: string;
    REFRESH_EXPIRATION: string;
};
export declare const PASSWORD_CONFIG: {
    MIN_LENGTH: number;
    SALT_ROUNDS: number;
};
export declare const RATE_LIMIT_CONFIG: {
    LOGIN_ATTEMPTS: number;
    LOGIN_WINDOW: number;
    REGISTER_ATTEMPTS: number;
    REGISTER_WINDOW: number;
};
//# sourceMappingURL=auth.d.ts.map