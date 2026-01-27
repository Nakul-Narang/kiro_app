/**
 * Authentication Service
 * Handles user authentication, JWT tokens, and multi-factor authentication
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { UserModel } from '../../models/User';
import { VendorModel } from '../../models/Vendor';
import { VerificationTokenModel } from '../../models/VerificationToken';
import { emailService } from '../../utils/notifications';
import { 
  User, 
  Vendor, 
  AuthCredentials, 
  AuthTokens, 
  AuthResponse, 
  JWTPayload,
  RegisterUserRequest,
  RegisterVendorRequest
} from '../../types';
import { logger } from '../../utils/logger';
import { ValidationError } from '../../utils/validation';

export class AuthService {
  private userModel: UserModel;
  private vendorModel: VendorModel;
  private tokenModel: VerificationTokenModel;
  private jwtSecret: string;
  private jwtRefreshSecret: string;
  private accessTokenExpiry: string;
  private refreshTokenExpiry: string;

  constructor() {
    this.userModel = new UserModel();
    this.vendorModel = new VendorModel();
    this.tokenModel = new VerificationTokenModel();
    
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';
    
    if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
      logger.warn('JWT secrets not set in environment variables. Using default values.');
    }
  }

  /**
   * Hash password using bcrypt
   */
  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password against hash
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT tokens
   */
  private generateTokens(user: User | Vendor): AuthTokens {
    const isVendor = 'businessName' in user;
    
    const payload: JWTPayload = {
      userId: user.userId,
      email: user.email,
      role: isVendor ? 'vendor' : 'user'
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.accessTokenExpiry
    } as jwt.SignOptions);

    const refreshToken = jwt.sign(payload, this.jwtRefreshSecret, {
      expiresIn: this.refreshTokenExpiry
    } as jwt.SignOptions);

    // Calculate expiry time in seconds
    const decoded = jwt.decode(accessToken) as any;
    const expiresIn = decoded.exp - decoded.iat;

    return {
      accessToken,
      refreshToken,
      expiresIn
    };
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string, isRefreshToken: boolean = false): JWTPayload {
    try {
      const secret = isRefreshToken ? this.jwtRefreshSecret : this.jwtSecret;
      return jwt.verify(token, secret) as JWTPayload;
    } catch (error) {
      throw new ValidationError('Invalid or expired token');
    }
  }

  /**
   * Register a new user
   */
  async registerUser(userData: RegisterUserRequest): Promise<AuthResponse> {
    try {
      // Check if email already exists
      const existingUser = await this.userModel.findByEmail(userData.email);
      if (existingUser) {
        throw new ValidationError('Email already registered', 'email');
      }

      // Check if phone number already exists (if provided)
      if (userData.phoneNumber) {
        const existingPhone = await this.userModel.phoneExists(userData.phoneNumber);
        if (existingPhone) {
          throw new ValidationError('Phone number already registered', 'phoneNumber');
        }
      }

      // Hash password
      const passwordHash = await this.hashPassword(userData.password);

      // Create user
      const user = await this.userModel.create({
        ...userData,
        passwordHash
      });

      // Generate tokens
      const tokens = this.generateTokens(user);

      // Send email verification if email is provided
      await this.sendEmailVerification(user.email);

      logger.info(`User registered successfully: ${user.email}`);

      return {
        user,
        tokens
      };

    } catch (error) {
      logger.error('Error registering user:', error);
      throw error;
    }
  }

  /**
   * Register a new vendor
   */
  async registerVendor(vendorData: RegisterVendorRequest): Promise<AuthResponse> {
    try {
      // Check if email already exists
      const existingUser = await this.userModel.findByEmail(vendorData.email);
      if (existingUser) {
        throw new ValidationError('Email already registered', 'email');
      }

      // Check if phone number already exists (if provided)
      if (vendorData.phoneNumber) {
        const existingPhone = await this.userModel.phoneExists(vendorData.phoneNumber);
        if (existingPhone) {
          throw new ValidationError('Phone number already registered', 'phoneNumber');
        }
      }

      // Hash password
      const passwordHash = await this.hashPassword(vendorData.password);

      // Create vendor
      const vendor = await this.vendorModel.create({
        ...vendorData,
        passwordHash
      });

      // Generate tokens
      const tokens = this.generateTokens(vendor);

      // Send email verification
      await this.sendEmailVerification(vendor.email);

      logger.info(`Vendor registered successfully: ${vendor.email}`);

      return {
        user: vendor,
        tokens
      };

    } catch (error) {
      logger.error('Error registering vendor:', error);
      throw error;
    }
  }
  /**
   * Login user or vendor
   */
  async login(credentials: AuthCredentials): Promise<AuthResponse> {
    try {
      // Try to find user first
      let user = await this.userModel.findByEmailWithPassword(credentials.email);

      // If not found as user, try as vendor
      if (!user) {
        const vendor = await this.vendorModel.findByEmailWithPassword(credentials.email);
        if (vendor) {
          user = vendor;
        }
      }

      if (!user) {
        throw new ValidationError('Invalid email or password', 'credentials');
      }

      // Verify password
      const isValidPassword = await this.verifyPassword(credentials.password, user.passwordHash);
      if (!isValidPassword) {
        throw new ValidationError('Invalid email or password', 'credentials');
      }

      // Update last active
      await this.userModel.updateLastActive(user.userId);

      // Remove password hash from response
      const { passwordHash, ...userWithoutPassword } = user;

      // Generate tokens
      const tokens = this.generateTokens(userWithoutPassword);

      logger.info(`User logged in successfully: ${user.email}`);

      return {
        user: userWithoutPassword,
        tokens
      };

    } catch (error) {
      logger.error('Error during login:', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      // Verify refresh token
      const payload = this.verifyToken(refreshToken, true);

      // Find user to ensure they still exist
      const user = await this.userModel.findById(payload.userId);
      if (!user) {
        // Check if it's a vendor
        const vendor = await this.vendorModel.findById(payload.userId);
        if (!vendor) {
          throw new ValidationError('User not found');
        }
        return this.generateTokens(vendor);
      }

      return this.generateTokens(user);

    } catch (error) {
      logger.error('Error refreshing token:', error);
      throw error;
    }
  }

  /**
   * Send email verification
   */
  async sendEmailVerification(email: string): Promise<void> {
    try {
      const user = await this.userModel.findByEmail(email);
      if (!user) {
        throw new ValidationError('User not found', 'email');
      }

      if (user.verified) {
        throw new ValidationError('Email already verified', 'email');
      }

      // Delete any existing email verification tokens
      await this.tokenModel.deleteUserTokens(user.userId, 'email');

      // Create new verification token (expires in 24 hours)
      const token = await this.tokenModel.create(user.userId, 'email', 24 * 60);

      // TODO: Send email with verification link
      // For now, just log the token (in production, send via email service)
      logger.info(`Email verification token for ${email}: ${token}`);
      
      // Send verification email
      await emailService.sendEmailVerification(email, token);

    } catch (error) {
      logger.error('Error sending email verification:', error);
      throw error;
    }
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<boolean> {
    try {
      const tokenData = await this.tokenModel.verify(token);
      if (!tokenData || tokenData.type !== 'email') {
        throw new ValidationError('Invalid or expired verification token');
      }

      // Mark user as verified
      const success = await this.userModel.markAsVerified(tokenData.userId);
      if (success) {
        logger.info(`Email verified for user: ${tokenData.userId}`);
      }

      return success;

    } catch (error) {
      logger.error('Error verifying email:', error);
      throw error;
    }
  }

  /**
   * Send phone verification code
   */
  async sendPhoneVerification(phoneNumber: string): Promise<void> {
    try {
      // Find user by phone number
      // This is a simplified implementation - in practice, you'd need to find the user
      // For now, we'll assume the phone number belongs to an authenticated user

      // Generate 6-digit verification code
      const code = crypto.randomInt(100000, 999999).toString();

      // Store the code in Redis with 10-minute expiry
      await this.tokenModel.create('temp', 'phone', 10); // Simplified for demo

      // TODO: Send SMS with verification code
      // For now, just log the code (in production, send via SMS service)
      logger.info(`Phone verification code for ${phoneNumber}: ${code}`);

    } catch (error) {
      logger.error('Error sending phone verification:', error);
      throw error;
    }
  }

  /**
   * Verify phone with code
   */
  async verifyPhone(phoneNumber: string, code: string): Promise<boolean> {
    try {
      // This is a simplified implementation
      // In practice, you'd verify the code against what was sent
      
      // TODO: Implement proper phone verification logic
      logger.info(`Phone verification attempted for ${phoneNumber} with code ${code}`);
      
      return true; // Simplified for demo

    } catch (error) {
      logger.error('Error verifying phone:', error);
      throw error;
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<void> {
    try {
      const user = await this.userModel.findByEmail(email);
      if (!user) {
        // Don't reveal if email exists or not for security
        logger.info(`Password reset requested for non-existent email: ${email}`);
        return;
      }

      // Delete any existing password reset tokens
      await this.tokenModel.deleteUserTokens(user.userId, 'password_reset');

      // Create new password reset token (expires in 1 hour)
      const token = await this.tokenModel.create(user.userId, 'password_reset', 60);

      // TODO: Send email with password reset link
      // For now, just log the token (in production, send via email service)
      logger.info(`Password reset token for ${email}: ${token}`);
      
      // Send password reset email
      await emailService.sendPasswordReset(email, token);

    } catch (error) {
      logger.error('Error requesting password reset:', error);
      throw error;
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    try {
      const tokenData = await this.tokenModel.verify(token);
      if (!tokenData || tokenData.type !== 'password_reset') {
        throw new ValidationError('Invalid or expired reset token');
      }

      // Hash new password
      const passwordHash = await this.hashPassword(newPassword);

      // Update user password
      const success = await this.userModel.updatePassword(tokenData.userId, passwordHash);
      if (success) {
        logger.info(`Password reset successfully for user: ${tokenData.userId}`);
      }

      return success;

    } catch (error) {
      logger.error('Error resetting password:', error);
      throw error;
    }
  }

  /**
   * Change password for authenticated user
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    try {
      // Get user with password hash
      const user = await this.userModel.findByEmailWithPassword(''); // Need to modify this method
      if (!user) {
        throw new ValidationError('User not found');
      }

      // Verify current password
      const isValidPassword = await this.verifyPassword(currentPassword, user.passwordHash);
      if (!isValidPassword) {
        throw new ValidationError('Current password is incorrect', 'currentPassword');
      }

      // Hash new password
      const passwordHash = await this.hashPassword(newPassword);

      // Update password
      const success = await this.userModel.updatePassword(userId, passwordHash);
      if (success) {
        logger.info(`Password changed successfully for user: ${userId}`);
      }

      return success;

    } catch (error) {
      logger.error('Error changing password:', error);
      throw error;
    }
  }

  /**
   * Get user by ID (for middleware)
   */
  async getUserById(userId: string): Promise<User | Vendor | null> {
    try {
      // Try to find as user first
      let user = await this.userModel.findById(userId);
      if (user) {
        return user;
      }

      // Try to find as vendor
      const vendor = await this.vendorModel.findById(userId);
      return vendor;

    } catch (error) {
      logger.error('Error getting user by ID:', error);
      throw error;
    }
  }

  /**
   * Validate user session and update last active
   */
  async validateSession(userId: string): Promise<boolean> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        return false;
      }

      // Update last active timestamp
      await this.userModel.updateLastActive(userId);
      return true;

    } catch (error) {
      logger.error('Error validating session:', error);
      return false;
    }
  }
}