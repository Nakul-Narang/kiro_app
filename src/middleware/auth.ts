/**
 * Authentication middleware
 * Handles JWT token verification and user authentication
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth/AuthService';
import { User, Vendor, JWTPayload } from '../types';
import { logger } from '../utils/logger';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: User | Vendor;
      userId?: string;
      userRole?: 'user' | 'vendor';
    }
  }
}

export class AuthMiddleware {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  /**
   * Middleware to authenticate JWT token
   */
  authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: {
            message: 'Access token required',
            code: 'MISSING_TOKEN'
          },
          timestamp: new Date()
        });
        return;
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Verify token
      const payload: JWTPayload = this.authService.verifyToken(token);

      // Get user details
      const user = await this.authService.getUserById(payload.userId);
      if (!user) {
        res.status(401).json({
          success: false,
          error: {
            message: 'User not found',
            code: 'USER_NOT_FOUND'
          },
          timestamp: new Date()
        });
        return;
      }

      // Validate session and update last active
      await this.authService.validateSession(payload.userId);

      // Attach user info to request
      req.user = user;
      req.userId = payload.userId;
      req.userRole = payload.role;

      next();

    } catch (error) {
      logger.error('Authentication error:', error);
      
      res.status(401).json({
        success: false,
        error: {
          message: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        },
        timestamp: new Date()
      });
    }
  };

  /**
   * Middleware to require verified email
   */
  requireVerified = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        },
        timestamp: new Date()
      });
      return;
    }

    if (!req.user.verified) {
      res.status(403).json({
        success: false,
        error: {
          message: 'Email verification required',
          code: 'EMAIL_NOT_VERIFIED'
        },
        timestamp: new Date()
      });
      return;
    }

    next();
  };

  /**
   * Middleware to require vendor role
   */
  requireVendor = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        },
        timestamp: new Date()
      });
      return;
    }

    if (req.userRole !== 'vendor') {
      res.status(403).json({
        success: false,
        error: {
          message: 'Vendor access required',
          code: 'VENDOR_REQUIRED'
        },
        timestamp: new Date()
      });
      return;
    }

    next();
  };

  /**
   * Middleware to require user role (not vendor)
   */
  requireUser = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        },
        timestamp: new Date()
      });
      return;
    }

    if (req.userRole !== 'user') {
      res.status(403).json({
        success: false,
        error: {
          message: 'User access required',
          code: 'USER_REQUIRED'
        },
        timestamp: new Date()
      });
      return;
    }

    next();
  };

  /**
   * Optional authentication - doesn't fail if no token provided
   */
  optionalAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next();
        return;
      }

      const token = authHeader.substring(7);
      const payload: JWTPayload = this.authService.verifyToken(token);
      const user = await this.authService.getUserById(payload.userId);

      if (user) {
        req.user = user;
        req.userId = payload.userId;
        req.userRole = payload.role;
        
        // Update last active
        await this.authService.validateSession(payload.userId);
      }

      next();

    } catch (error) {
      // Ignore authentication errors for optional auth
      next();
    }
  };
}

// Create singleton instance
const authMiddleware = new AuthMiddleware();

// Export middleware functions
export const authenticate = authMiddleware.authenticate;
export const requireVerified = authMiddleware.requireVerified;
export const requireVendor = authMiddleware.requireVendor;
export const requireUser = authMiddleware.requireUser;
export const optionalAuth = authMiddleware.optionalAuth;