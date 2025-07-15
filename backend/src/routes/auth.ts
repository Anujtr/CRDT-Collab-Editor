import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';
import { validateRequest, validationSchemas } from '../utils/validation';
import rateLimit from 'express-rate-limit';
import { RATE_LIMIT_CONFIG } from '../../../shared/src/constants/auth';

const router = Router();

// Rate limiting for authentication endpoints
const loginLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.LOGIN_WINDOW,
  max: RATE_LIMIT_CONFIG.LOGIN_ATTEMPTS,
  message: {
    success: false,
    error: {
      message: 'Too many login attempts, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
      statusCode: 429
    },
    timestamp: new Date()
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for successful requests
    return false;
  }
});

const registerLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.REGISTER_WINDOW,
  max: RATE_LIMIT_CONFIG.REGISTER_ATTEMPTS,
  message: {
    success: false,
    error: {
      message: 'Too many registration attempts, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
      statusCode: 429
    },
    timestamp: new Date()
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Public routes
router.post(
  '/register',
  registerLimiter,
  validateRequest(validationSchemas.register),
  AuthController.register
);

router.post(
  '/login',
  loginLimiter,
  validateRequest(validationSchemas.login),
  AuthController.login
);

// Protected routes
router.get('/me', authenticateToken, AuthController.getCurrentUser);

router.post('/refresh', AuthController.refreshToken);

router.post('/logout', authenticateToken, AuthController.logout);

export default router;