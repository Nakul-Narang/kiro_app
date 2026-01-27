/**
 * Authentication Controller
 * Handles HTTP requests for user authentication and registration
 */

import { Request, Response } from 'express';
import { AuthService } from '../services/auth/AuthService';
import { 
  validateAuthCredentials,
  validateRegisterUserRequest,
  validateRegisterVendorRequest,
  validatePasswordResetRequest,
  validatePasswordResetConfirm,
  validateEmailVerificationRequest,
  validateEmailVerificationConfirm,
  validatePhoneVerificationRequest,
  validatePhoneVerificationConfirm,
  validateChangePasswordRequest,
  ValidationError,
  sanitizeUserInput
} from '../utils/validation';
import { 
  AuthCredentials,
  RegisterUserRequest,
  RegisterVendorRequest,
  PasswordResetRequest,
  PasswordResetConfirm,
  EmailVerificationRequest,
  EmailVerificationConfirm,
  PhoneVerificationRequest,
  PhoneVerificationConfirm,
  ChangePasswordRequest,
  ApiResponse
} from '../types';
import { logger } from '../utils/logger';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  /**
   * Register a new user
   */
  registerUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const userData = sanitizeUserInput(req.body) as RegisterUserRequest;
      
      // Validate request data
      validateRegisterUserRequest(userData);
      
      // Register user
      const result = await this.authService.registerUser(userData);
      
      const response: ApiResponse = {
        success: true,
        data: result,
        timestamp: new Date()
      };
      
      res.status(201).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error registering user');
    }
  };

  /**
   * Register a new vendor
   */
  registerVendor = async (req: Request, res: Response): Promise<void> => {
    try {
      const vendorData = sanitizeUserInput(req.body) as RegisterVendorRequest;
      
      // Validate request data
      validateRegisterVendorRequest(vendorData);
      
      // Register vendor
      const result = await this.authService.registerVendor(vendorData);
      
      const response: ApiResponse = {
        success: true,
        data: result,
        timestamp: new Date()
      };
      
      res.status(201).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error registering vendor');
    }
  };

  /**
   * Login user or vendor
   */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const credentials = sanitizeUserInput(req.body) as AuthCredentials;
      
      // Validate credentials
      validateAuthCredentials(credentials);
      
      // Login
      const result = await this.authService.login(credentials);
      
      const response: ApiResponse = {
        success: true,
        data: result,
        timestamp: new Date()
      };
      
      res.status(200).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error during login');
    }
  };

  /**
   * Refresh access token
   */
  refreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken || typeof refreshToken !== 'string') {
        throw new ValidationError('Refresh token is required', 'refreshToken');
      }
      
      // Refresh token
      const tokens = await this.authService.refreshToken(refreshToken);
      
      const response: ApiResponse = {
        success: true,
        data: tokens,
        timestamp: new Date()
      };
      
      res.status(200).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error refreshing token');
    }
  };

  /**
   * Send email verification
   */
  sendEmailVerification = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = sanitizeUserInput(req.body) as EmailVerificationRequest;
      
      // Validate request
      validateEmailVerificationRequest({ email });
      
      // Send verification email
      await this.authService.sendEmailVerification(email);
      
      const response: ApiResponse = {
        success: true,
        data: { message: 'Verification email sent successfully' },
        timestamp: new Date()
      };
      
      res.status(200).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error sending email verification');
    }
  };

  /**
   * Verify email with token
   */
  verifyEmail = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = sanitizeUserInput(req.body) as EmailVerificationConfirm;
      
      // Validate request
      validateEmailVerificationConfirm({ token });
      
      // Verify email
      const success = await this.authService.verifyEmail(token);
      
      const response: ApiResponse = {
        success: true,
        data: { verified: success },
        timestamp: new Date()
      };
      
      res.status(200).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error verifying email');
    }
  };

  /**
   * Send phone verification code
   */
  sendPhoneVerification = async (req: Request, res: Response): Promise<void> => {
    try {
      const { phoneNumber } = sanitizeUserInput(req.body) as PhoneVerificationRequest;
      
      // Validate request
      validatePhoneVerificationRequest({ phoneNumber });
      
      // Send verification code
      await this.authService.sendPhoneVerification(phoneNumber);
      
      const response: ApiResponse = {
        success: true,
        data: { message: 'Verification code sent successfully' },
        timestamp: new Date()
      };
      
      res.status(200).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error sending phone verification');
    }
  };

  /**
   * Verify phone with code
   */
  verifyPhone = async (req: Request, res: Response): Promise<void> => {
    try {
      const { phoneNumber, code } = sanitizeUserInput(req.body) as PhoneVerificationConfirm;
      
      // Validate request
      validatePhoneVerificationConfirm({ phoneNumber, code });
      
      // Verify phone
      const success = await this.authService.verifyPhone(phoneNumber, code);
      
      const response: ApiResponse = {
        success: true,
        data: { verified: success },
        timestamp: new Date()
      };
      
      res.status(200).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error verifying phone');
    }
  };
  /**
   * Request password reset
   */
  requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = sanitizeUserInput(req.body) as PasswordResetRequest;
      
      // Validate request
      validatePasswordResetRequest({ email });
      
      // Request password reset
      await this.authService.requestPasswordReset(email);
      
      const response: ApiResponse = {
        success: true,
        data: { message: 'Password reset email sent if account exists' },
        timestamp: new Date()
      };
      
      res.status(200).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error requesting password reset');
    }
  };

  /**
   * Reset password with token
   */
  resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, newPassword } = sanitizeUserInput(req.body) as PasswordResetConfirm;
      
      // Validate request
      validatePasswordResetConfirm({ token, newPassword });
      
      // Reset password
      const success = await this.authService.resetPassword(token, newPassword);
      
      const response: ApiResponse = {
        success: true,
        data: { reset: success },
        timestamp: new Date()
      };
      
      res.status(200).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error resetting password');
    }
  };

  /**
   * Change password for authenticated user
   */
  changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.userId) {
        throw new ValidationError('Authentication required');
      }
      
      const { currentPassword, newPassword } = sanitizeUserInput(req.body) as ChangePasswordRequest;
      
      // Validate request
      validateChangePasswordRequest({ currentPassword, newPassword });
      
      // Change password
      const success = await this.authService.changePassword(req.userId, currentPassword, newPassword);
      
      const response: ApiResponse = {
        success: true,
        data: { changed: success },
        timestamp: new Date()
      };
      
      res.status(200).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error changing password');
    }
  };

  /**
   * Get current user profile
   */
  getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('Authentication required');
      }
      
      const response: ApiResponse = {
        success: true,
        data: req.user,
        timestamp: new Date()
      };
      
      res.status(200).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error getting profile');
    }
  };

  /**
   * Logout user (client-side token removal)
   */
  logout = async (_req: Request, res: Response): Promise<void> => {
    try {
      // In a JWT-based system, logout is typically handled client-side
      // by removing the token. Server-side logout would require token blacklisting.
      
      const response: ApiResponse = {
        success: true,
        data: { message: 'Logged out successfully' },
        timestamp: new Date()
      };
      
      res.status(200).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error during logout');
    }
  };

  /**
   * Handle errors and send appropriate response
   */
  private handleError(res: Response, error: any, context: string): void {
    logger.error(context, error);
    
    if (error instanceof ValidationError) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: error.message,
          code: 'VALIDATION_ERROR',
          details: error.field ? { field: error.field } : undefined
        },
        timestamp: new Date()
      };
      
      res.status(400).json(response);
      return;
    }
    
    // Check for database constraint errors
    if (error.code === '23505') { // PostgreSQL unique constraint violation
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Email or phone number already exists',
          code: 'DUPLICATE_ENTRY'
        },
        timestamp: new Date()
      };
      
      res.status(409).json(response);
      return;
    }
    
    // Generic server error
    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      },
      timestamp: new Date()
    };
    
    res.status(500).json(response);
  }
}