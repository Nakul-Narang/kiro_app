/**
 * Profile Controller
 * Handles HTTP requests for user and vendor profile management
 */

import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { VendorModel } from '../models/Vendor';
import { 
  validateUpdateProfileRequest,
  validateUpdateVendorProfileRequest,
  ValidationError,
  sanitizeUserInput
} from '../utils/validation';
import { 
  UpdateProfileRequest,
  UpdateVendorProfileRequest,
  ApiResponse
} from '../types';
import { logger } from '../utils/logger';

export class ProfileController {
  private userModel: UserModel;
  private vendorModel: VendorModel;

  constructor() {
    this.userModel = new UserModel();
    this.vendorModel = new VendorModel();
  }

  /**
   * Update user profile
   */
  updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.userId) {
        throw new ValidationError('Authentication required');
      }
      
      const updates: UpdateProfileRequest = sanitizeUserInput(req.body);
      
      // Validate request data
      validateUpdateProfileRequest(updates);
      
      // Update profile
      const updatedUser = await this.userModel.updateProfile(req.userId, updates);
      
      if (!updatedUser) {
        throw new ValidationError('User not found');
      }
      
      const response: ApiResponse = {
        success: true,
        data: updatedUser,
        timestamp: new Date()
      };
      
      res.status(200).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error updating profile');
    }
  };

  /**
   * Update vendor profile
   */
  updateVendorProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.userId) {
        throw new ValidationError('Authentication required');
      }
      
      if (req.userRole !== 'vendor') {
        throw new ValidationError('Vendor access required');
      }
      
      const updates: UpdateVendorProfileRequest = sanitizeUserInput(req.body);
      
      // Validate request data
      validateUpdateVendorProfileRequest(updates);
      
      // Update vendor profile
      const updatedVendor = await this.vendorModel.updateProfile(req.userId, updates);
      
      if (!updatedVendor) {
        throw new ValidationError('Vendor not found');
      }
      
      const response: ApiResponse = {
        success: true,
        data: updatedVendor,
        timestamp: new Date()
      };
      
      res.status(200).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error updating vendor profile');
    }
  };

  /**
   * Get user profile by ID (public endpoint)
   */
  getPublicProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        throw new ValidationError('User ID is required');
      }
      
      // Try to find as user first
      let user = await this.userModel.findById(userId);
      
      if (!user) {
        // Try to find as vendor
        const vendor = await this.vendorModel.findById(userId);
        if (vendor) {
          user = vendor;
        }
      }
      
      if (!user) {
        const response: ApiResponse = {
          success: false,
          error: {
            message: 'User not found',
            code: 'USER_NOT_FOUND'
          },
          timestamp: new Date()
        };
        
        res.status(404).json(response);
        return;
      }
      
      // Return public profile (exclude sensitive information)
      const publicProfile = {
        userId: user.userId,
        profile: user.profile,
        preferredLanguage: user.preferredLanguage,
        supportedLanguages: user.supportedLanguages,
        location: {
          city: user.location.city,
          country: user.location.country
        },
        verified: user.verified,
        createdAt: user.createdAt,
        // Include vendor-specific public info if applicable
        ...('businessName' in user && {
          businessName: (user as any).businessName,
          businessType: (user as any).businessType,
          averageRating: (user as any).averageRating,
          totalTransactions: (user as any).totalTransactions,
          responseTime: (user as any).responseTime,
          businessHours: (user as any).businessHours,
          paymentMethods: (user as any).paymentMethods
        })
      };
      
      const response: ApiResponse = {
        success: true,
        data: publicProfile,
        timestamp: new Date()
      };
      
      res.status(200).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error getting public profile');
    }
  };

  /**
   * Delete user account
   */
  deleteAccount = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.userId) {
        throw new ValidationError('Authentication required');
      }
      
      // Delete user account (cascades to vendor if applicable)
      const success = await this.userModel.delete(req.userId);
      
      if (!success) {
        throw new ValidationError('User not found');
      }
      
      const response: ApiResponse = {
        success: true,
        data: { message: 'Account deleted successfully' },
        timestamp: new Date()
      };
      
      res.status(200).json(response);
      
    } catch (error) {
      this.handleError(res, error, 'Error deleting account');
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