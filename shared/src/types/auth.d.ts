export declare enum UserRole {
    ADMIN = "admin",
    EDITOR = "editor",
    VIEWER = "viewer",
    USER = "user"
}
export declare enum Permission {
    DOCUMENT_READ = "document:read",
    DOCUMENT_WRITE = "document:write",
    DOCUMENT_DELETE = "document:delete",
    USER_MANAGE = "user:manage",
    ADMIN_ACCESS = "admin:access",
    SNAPSHOT_CREATE = "snapshot:create",
    SNAPSHOT_RESTORE = "snapshot:restore"
}
export interface User {
    id: string;
    username: string;
    email: string;
    password: string;
    role: UserRole;
    permissions: Permission[];
    createdAt: Date;
    updatedAt: Date;
}
export interface AuthTokenPayload {
    userId: string;
    username: string;
    role: UserRole;
    permissions: Permission[];
    iat: number;
    exp: number;
}
export interface LoginRequest {
    username: string;
    password: string;
}
export interface RegisterRequest {
    username: string;
    email: string;
    password: string;
    role?: UserRole;
}
export interface AuthResponse {
    token: string;
    user: Omit<User, 'password'>;
    expiresAt: Date;
}
export interface ApiError {
    message: string;
    code: string;
    statusCode: number;
    details?: any;
}
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: ApiError;
    timestamp: Date;
}
//# sourceMappingURL=auth.d.ts.map