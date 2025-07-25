import { Request, Response, NextFunction } from 'express';
import { JWTUtils } from '../utils/jwt';
import { UserModel } from '../models/User';
import { AuthTokenPayload, Permission, UserRole } from '../../../shared/src/types/auth';
import { AUTH_ERRORS, ROLE_HIERARCHY } from '../../../shared/src/constants/auth';

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = JWTUtils.extractTokenFromHeader(authHeader || '');

    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          message: 'Access token required',
          code: AUTH_ERRORS.TOKEN_INVALID,
          statusCode: 401
        },
        timestamp: new Date()
      });
      return;
    }

    const decoded = JWTUtils.verifyToken(token);
    
    // Verify user still exists
    const user = await UserModel.findById(decoded.userId);
    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          message: 'User not found',
          code: AUTH_ERRORS.USER_NOT_FOUND,
          statusCode: 401
        },
        timestamp: new Date()
      });
      return;
    }

    // Add user info to request
    req.user = decoded;
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token verification failed';
    const code = message.includes('expired') ? AUTH_ERRORS.TOKEN_EXPIRED : AUTH_ERRORS.TOKEN_INVALID;
    
    res.status(401).json({
      success: false,
      error: {
        message,
        code,
        statusCode: 401
      },
      timestamp: new Date()
    });
  }
};

export const requirePermission = (permission: Permission) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: AUTH_ERRORS.TOKEN_INVALID,
          statusCode: 401
        },
        timestamp: new Date()
      });
      return;
    }

    if (!req.user.permissions.includes(permission)) {
      res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient permissions',
          code: AUTH_ERRORS.INSUFFICIENT_PERMISSIONS,
          statusCode: 403,
          details: {
            required: permission,
            userPermissions: req.user.permissions
          }
        },
        timestamp: new Date()
      });
      return;
    }

    next();
  };
};

export const requireRole = (role: UserRole) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: AUTH_ERRORS.TOKEN_INVALID,
          statusCode: 401
        },
        timestamp: new Date()
      });
      return;
    }

    if (req.user.role !== role) {
      res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient role',
          code: AUTH_ERRORS.INSUFFICIENT_PERMISSIONS,
          statusCode: 403,
          details: {
            required: role,
            userRole: req.user.role
          }
        },
        timestamp: new Date()
      });
      return;
    }

    next();
  };
};

export const requireMinimumRole = (minimumRole: UserRole) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: AUTH_ERRORS.TOKEN_INVALID,
          statusCode: 401
        },
        timestamp: new Date()
      });
      return;
    }

    const userRoleLevel = ROLE_HIERARCHY[req.user.role];
    const minimumRoleLevel = ROLE_HIERARCHY[minimumRole];

    if (userRoleLevel < minimumRoleLevel) {
      res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient role level',
          code: AUTH_ERRORS.INSUFFICIENT_PERMISSIONS,
          statusCode: 403,
          details: {
            minimumRequired: minimumRole,
            userRole: req.user.role,
            minimumLevel: minimumRoleLevel,
            userLevel: userRoleLevel
          }
        },
        timestamp: new Date()
      });
      return;
    }

    next();
  };
};

export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = JWTUtils.extractTokenFromHeader(authHeader || '');

    if (token) {
      const decoded = JWTUtils.verifyToken(token);
      
      // Verify user still exists
      const user = await UserModel.findById(decoded.userId);
      if (user) {
        req.user = decoded;
      }
    }

    next();
  } catch (error) {
    // For optional auth, we don't return an error, just proceed without user
    next();
  }
};

export const adminOnly = [authenticateToken, requireRole(UserRole.ADMIN)];
export const editorOrAbove = [authenticateToken, requireMinimumRole(UserRole.EDITOR)];
export const viewerOrAbove = [authenticateToken, requireMinimumRole(UserRole.VIEWER)];