/**
 * Authentication routes
 * Defines API endpoints for user authentication and registration
 */

import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate, requireVerified } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';

const router = Router();
const authController = new AuthController();

// Rate limiting for auth endpoints
const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 requests per window
});

const passwordResetRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3, // 3 password reset requests per hour
});

// Public routes (no authentication required)
router.post('/register/user', authRateLimit, authController.registerUser);
router.post('/register/vendor', authRateLimit, authController.registerVendor);
router.post('/login', authRateLimit, authController.login);
router.post('/refresh-token', authController.refreshToken);

// Email verification
router.post('/send-email-verification', authRateLimit, authController.sendEmailVerification);
router.post('/verify-email', authController.verifyEmail);

// Phone verification
router.post('/send-phone-verification', authRateLimit, authController.sendPhoneVerification);
router.post('/verify-phone', authController.verifyPhone);

// Password reset
router.post('/request-password-reset', passwordResetRateLimit, authController.requestPasswordReset);
router.post('/reset-password', authController.resetPassword);

// Protected routes (authentication required)
router.get('/profile', authenticate, authController.getProfile);
router.post('/change-password', authenticate, requireVerified, authController.changePassword);
router.post('/logout', authenticate, authController.logout);

export default router;