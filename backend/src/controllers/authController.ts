import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { JWTUtils } from '../utils/jwt';
import { LoginRequest, RegisterRequest, UserRole } from '../../../shared/src/types/auth';
import { AUTH_ERRORS } from '../../../shared/src/constants/auth';
import { AuthenticatedRequest } from '../middleware/auth';

export class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { username, email, password, role }: RegisterRequest = req.body;

      // Validate role if provided
      if (role && !Object.values(UserRole).includes(role)) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Invalid role specified',
            code: AUTH_ERRORS.INVALID_ROLE,
            statusCode: 400,
            details: {
              validRoles: Object.values(UserRole)
            }
          },
          timestamp: new Date()
        });
        return;
      }

      // Create user
      const user = await UserModel.create({
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
        role: role || UserRole.USER
      });

      // Generate JWT tokens
      const accessToken = JWTUtils.generateToken(user);
      const refreshToken = JWTUtils.generateRefreshToken(user);
      
      const authResponse = {
        ...JWTUtils.createAuthResponse(user, accessToken),
        accessToken,
        refreshToken,
        sessionId: `session-${user.id}-${Date.now()}`
      };

      res.status(201).json({
        success: true,
        data: authResponse,
        timestamp: new Date()
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Username already exists')) {
          res.status(409).json({
            success: false,
            error: {
              message: 'Username already exists',
              code: AUTH_ERRORS.USER_ALREADY_EXISTS,
              statusCode: 409
            },
            timestamp: new Date()
          });
          return;
        }
        
        if (error.message.includes('Email already exists')) {
          res.status(409).json({
            success: false,
            error: {
              message: 'Email already exists',
              code: AUTH_ERRORS.USER_ALREADY_EXISTS,
              statusCode: 409
            },
            timestamp: new Date()
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: {
          message: 'Internal server error during registration',
          code: 'INTERNAL_SERVER_ERROR',
          statusCode: 500
        },
        timestamp: new Date()
      });
    }
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { username, password }: LoginRequest = req.body;

      // Find user by username or email
      const user = await UserModel.findByUsernameOrEmail(username.trim());
      
      if (!user) {
        res.status(401).json({
          success: false,
          error: {
            message: 'Invalid credentials',
            code: AUTH_ERRORS.INVALID_CREDENTIALS,
            statusCode: 401
          },
          timestamp: new Date()
        });
        return;
      }

      // Validate password
      const isValidPassword = await UserModel.validatePassword(user, password);
      
      if (!isValidPassword) {
        res.status(401).json({
          success: false,
          error: {
            message: 'Invalid credentials',
            code: AUTH_ERRORS.INVALID_CREDENTIALS,
            statusCode: 401
          },
          timestamp: new Date()
        });
        return;
      }

      // Generate JWT tokens
      const accessToken = JWTUtils.generateToken(user);
      const refreshToken = JWTUtils.generateRefreshToken(user);
      
      const authResponse = {
        ...JWTUtils.createAuthResponse(user, accessToken),
        accessToken,
        refreshToken,
        sessionId: `session-${user.id}-${Date.now()}`
      };

      res.status(200).json({
        success: true,
        data: authResponse,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          message: 'Internal server error during login',
          code: 'INTERNAL_SERVER_ERROR',
          statusCode: 500
        },
        timestamp: new Date()
      });
    }
  }

  static async getCurrentUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
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

      // Get fresh user data from database
      const user = await UserModel.findById(req.user.userId);
      
      if (!user) {
        res.status(404).json({
          success: false,
          error: {
            message: 'User not found',
            code: AUTH_ERRORS.USER_NOT_FOUND,
            statusCode: 404
          },
          timestamp: new Date()
        });
        return;
      }

      const sanitizedUser = UserModel.sanitizeUser(user);

      res.status(200).json({
        success: true,
        data: {
          user: sanitizedUser,
          tokenInfo: {
            userId: req.user.userId,
            role: req.user.role,
            permissions: req.user.permissions,
            issuedAt: new Date(req.user.iat * 1000),
            expiresAt: new Date(req.user.exp * 1000)
          }
        },
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_SERVER_ERROR',
          statusCode: 500
        },
        timestamp: new Date()
      });
    }
  }

  static async refreshToken(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Refresh token required',
            code: AUTH_ERRORS.TOKEN_INVALID,
            statusCode: 400
          },
          timestamp: new Date()
        });
        return;
      }

      const decoded = JWTUtils.verifyRefreshToken(refreshToken);
      const user = await UserModel.findById(decoded.userId);

      if (!user) {
        res.status(404).json({
          success: false,
          error: {
            message: 'User not found',
            code: AUTH_ERRORS.USER_NOT_FOUND,
            statusCode: 404
          },
          timestamp: new Date()
        });
        return;
      }

      // Generate new tokens
      const newAccessToken = JWTUtils.generateToken(user);
      const newRefreshToken = JWTUtils.generateRefreshToken(user);
      const authResponse = JWTUtils.createAuthResponse(user, newAccessToken);

      res.status(200).json({
        success: true,
        data: {
          ...authResponse,
          accessToken: newAccessToken,
          refreshToken: newRefreshToken
        },
        timestamp: new Date()
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('expired')) {
          res.status(401).json({
            success: false,
            error: {
              message: 'Refresh token expired',
              code: AUTH_ERRORS.TOKEN_EXPIRED,
              statusCode: 401
            },
            timestamp: new Date()
          });
          return;
        }
        
        if (error.message.includes('Invalid')) {
          res.status(401).json({
            success: false,
            error: {
              message: 'Invalid refresh token',
              code: AUTH_ERRORS.TOKEN_INVALID,
              statusCode: 401
            },
            timestamp: new Date()
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: {
          message: 'Internal server error during token refresh',
          code: 'INTERNAL_SERVER_ERROR',
          statusCode: 500
        },
        timestamp: new Date()
      });
    }
  }

  static async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // In a real application, you would invalidate the token here
      // For now, we'll just return a success message
      res.status(200).json({
        success: true,
        data: {
          message: 'Logged out successfully'
        },
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          message: 'Internal server error during logout',
          code: 'INTERNAL_SERVER_ERROR',
          statusCode: 500
        },
        timestamp: new Date()
      });
    }
  }
}