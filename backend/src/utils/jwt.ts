import jwt from 'jsonwebtoken';
import { AuthTokenPayload, User } from '../../../shared/src/types/auth';
import { JWT_CONFIG } from '../../../shared/src/constants/auth';

export class JWTUtils {
  private static secret: string = process.env.JWT_SECRET || 'your-super-secret-jwt-key-here';

  static generateToken(user: User): string {
    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions,
      jti: `${user.id}-${Date.now()}-${Math.random()}`
    };

    return jwt.sign(payload, this.secret, {
      expiresIn: '24h',
      algorithm: 'HS256'
    });
  }

  // Alias for test compatibility
  static generateAccessToken(user: User): string {
    return this.generateToken(user);
  }

  static generateRefreshToken(user: User): string {
    const payload = {
      userId: user.id,
      type: 'refresh'
    };

    return jwt.sign(payload, this.secret, {
      expiresIn: '7d',
      algorithm: 'HS256'
    });
  }

  static verifyToken(token: string): AuthTokenPayload {
    try {
      const decoded = jwt.verify(token, this.secret) as AuthTokenPayload;
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      } else {
        throw new Error('Token verification failed');
      }
    }
  }

  static verifyRefreshToken(token: string): { userId: string; type: string } {
    try {
      const decoded = jwt.verify(token, this.secret) as { userId: string; type: string };
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      } else {
        throw new Error('Refresh token verification failed');
      }
    }
  }

  static decodeToken(token: string): AuthTokenPayload | null {
    try {
      return jwt.decode(token) as AuthTokenPayload;
    } catch (error) {
      return null;
    }
  }

  static getTokenExpiration(token: string): Date | null {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return null;
    }
    return new Date(decoded.exp * 1000);
  }

  static isTokenExpired(token: string): boolean {
    const expiration = this.getTokenExpiration(token);
    if (!expiration) {
      return true;
    }
    return new Date() > expiration;
  }

  static extractTokenFromHeader(authHeader: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  static createAuthResponse(user: User, token: string) {
    const expiration = this.getTokenExpiration(token);
    
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      expiresAt: expiration || new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours fallback
    };
  }
}