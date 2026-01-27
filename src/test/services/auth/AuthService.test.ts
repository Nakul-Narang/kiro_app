/**
 * AuthService unit tests
 * Tests authentication functionality including registration, login, and token management
 */

import { AuthService } from '../../../services/auth/AuthService';
import { UserModel } from '../../../models/User';
import { VendorModel } from '../../../models/Vendor';
import { VerificationTokenModel } from '../../../models/VerificationToken';
import { ValidationError } from '../../../utils/validation';
import { RegisterUserRequest, RegisterVendorRequest, AuthCredentials } from '../../../types';

// Mock the models
jest.mock('../../../models/User');
jest.mock('../../../models/Vendor');
jest.mock('../../../models/VerificationToken');
jest.mock('../../../utils/notifications');

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashedpassword'),
  compare: jest.fn().mockResolvedValue(true)
}));

describe('AuthService', () => {
  let authService: AuthService;
  let mockUserModel: jest.Mocked<UserModel>;
  let mockVendorModel: jest.Mocked<VendorModel>;
  let mockTokenModel: jest.Mocked<VerificationTokenModel>;

  beforeEach(() => {
    // Clear all mocks first
    jest.clearAllMocks();
    
    // Create the service which will create mocked instances
    authService = new AuthService();
    
    // Get the mocked instances
    mockUserModel = (authService as any).userModel;
    mockVendorModel = (authService as any).vendorModel;
    mockTokenModel = (authService as any).tokenModel;
  });

  describe('registerUser', () => {
    const validUserData: RegisterUserRequest = {
      email: 'test@example.com',
      password: 'SecurePass123!',
      preferredLanguage: 'en',
      supportedLanguages: ['en', 'es'],
      location: {
        latitude: 40.7128,
        longitude: -74.0060,
        city: 'New York',
        country: 'USA'
      },
      profile: {
        firstName: 'John',
        lastName: 'Doe'
      }
    };

    it('should register a new user successfully', async () => {
      const mockUser = {
        userId: 'user-123',
        email: validUserData.email,
        phoneNumber: validUserData.phoneNumber,
        preferredLanguage: validUserData.preferredLanguage,
        supportedLanguages: validUserData.supportedLanguages,
        location: validUserData.location,
        profile: validUserData.profile,
        verified: false,
        createdAt: new Date(),
        lastActive: new Date()
      };

      // Mock the calls in order
      mockUserModel.findByEmail
        .mockResolvedValueOnce(null) // First call in registerUser
        .mockResolvedValueOnce(mockUser as any); // Second call in sendEmailVerification
      mockUserModel.phoneExists.mockResolvedValue(false);
      mockUserModel.create.mockResolvedValue(mockUser as any);
      mockTokenModel.deleteUserTokens.mockResolvedValue();
      mockTokenModel.create.mockResolvedValue('verification-token');

      const result = await authService.registerUser(validUserData);

      expect(result.user).toEqual(mockUser);
      expect(result.tokens).toBeDefined();
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(mockUserModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: validUserData.email,
          passwordHash: expect.any(String)
        })
      );
    });

    it('should throw error if email already exists', async () => {
      mockUserModel.findByEmail.mockResolvedValue({} as any);

      await expect(authService.registerUser(validUserData))
        .rejects
        .toThrow(ValidationError);
      
      expect(mockUserModel.create).not.toHaveBeenCalled();
    });

    it('should throw error if phone number already exists', async () => {
      const userDataWithPhone = { ...validUserData, phoneNumber: '+1234567890' };
      
      mockUserModel.findByEmail.mockResolvedValue(null);
      mockUserModel.phoneExists.mockResolvedValue(true);

      await expect(authService.registerUser(userDataWithPhone))
        .rejects
        .toThrow(ValidationError);
      
      expect(mockUserModel.create).not.toHaveBeenCalled();
    });
  });

  describe('registerVendor', () => {
    const validVendorData: RegisterVendorRequest = {
      email: 'vendor@example.com',
      password: 'SecurePass123!',
      preferredLanguage: 'en',
      supportedLanguages: ['en', 'es'],
      location: {
        latitude: 40.7128,
        longitude: -74.0060,
        city: 'New York',
        country: 'USA'
      },
      profile: {
        firstName: 'Jane',
        lastName: 'Smith'
      },
      businessName: 'Test Business',
      businessType: 'retail',
      businessHours: {
        monday: { open: '09:00', close: '17:00' },
        tuesday: { open: '09:00', close: '17:00' },
        wednesday: { open: '09:00', close: '17:00' },
        thursday: { open: '09:00', close: '17:00' },
        friday: { open: '09:00', close: '17:00' },
        saturday: { closed: true, open: '00:00', close: '00:00' },
        sunday: { closed: true, open: '00:00', close: '00:00' }
      },
      paymentMethods: ['cash', 'card']
    };

    it('should register a new vendor successfully', async () => {
      const mockVendor = {
        userId: 'vendor-123',
        email: validVendorData.email,
        phoneNumber: validVendorData.phoneNumber,
        preferredLanguage: validVendorData.preferredLanguage,
        supportedLanguages: validVendorData.supportedLanguages,
        location: validVendorData.location,
        profile: validVendorData.profile,
        businessName: validVendorData.businessName,
        businessType: validVendorData.businessType,
        businessHours: validVendorData.businessHours,
        paymentMethods: validVendorData.paymentMethods,
        verified: false,
        products: [],
        ratings: [],
        averageRating: 0,
        totalTransactions: 0,
        responseTime: 0,
        createdAt: new Date(),
        lastActive: new Date()
      };

      // Mock the calls in order
      mockUserModel.findByEmail
        .mockResolvedValueOnce(null) // First call in registerVendor
        .mockResolvedValueOnce(mockVendor as any); // Second call in sendEmailVerification
      mockUserModel.phoneExists.mockResolvedValue(false);
      mockVendorModel.create.mockResolvedValue(mockVendor as any);
      mockTokenModel.deleteUserTokens.mockResolvedValue();
      mockTokenModel.create.mockResolvedValue('verification-token');

      const result = await authService.registerVendor(validVendorData);

      expect(result.user).toEqual(mockVendor);
      expect(result.tokens).toBeDefined();
      expect(mockVendorModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: validVendorData.email,
          passwordHash: expect.any(String)
        })
      );
    });
  });

  describe('login', () => {
    const validCredentials: AuthCredentials = {
      email: 'test@example.com',
      password: 'SecurePass123!'
    };

    it('should login user successfully', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        passwordHash: '$2a$12$hashedpassword',
        verified: true,
        preferredLanguage: 'en',
        supportedLanguages: ['en'],
        location: { latitude: 0, longitude: 0 },
        profile: { firstName: 'Test', lastName: 'User' },
        createdAt: new Date(),
        lastActive: new Date()
      };

      mockUserModel.findByEmailWithPassword.mockResolvedValue(mockUser as any);
      mockUserModel.updateLastActive.mockResolvedValue(true);

      // Mock bcrypt.compare to return true
      const bcrypt = require('bcryptjs');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      const result = await authService.login(validCredentials);

      expect(result.user).toBeDefined();
      expect(result.tokens).toBeDefined();
      expect(mockUserModel.updateLastActive).toHaveBeenCalledWith('user-123');
    });

    it('should throw error for invalid credentials', async () => {
      mockUserModel.findByEmailWithPassword.mockResolvedValue(null);
      mockVendorModel.findByEmailWithPassword.mockResolvedValue(null);

      await expect(authService.login(validCredentials))
        .rejects
        .toThrow(ValidationError);
    });
  });

  describe('verifyEmail', () => {
    it('should verify email successfully', async () => {
      const mockTokenData = {
        token: 'valid-token',
        userId: 'user-123',
        type: 'email' as const,
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date()
      };

      mockTokenModel.verify.mockResolvedValue(mockTokenData);
      mockUserModel.markAsVerified.mockResolvedValue(true);

      const result = await authService.verifyEmail('valid-token');

      expect(result).toBe(true);
      expect(mockUserModel.markAsVerified).toHaveBeenCalledWith('user-123');
    });

    it('should throw error for invalid token', async () => {
      mockTokenModel.verify.mockResolvedValue(null);

      await expect(authService.verifyEmail('invalid-token'))
        .rejects
        .toThrow(ValidationError);
    });
  });

  describe('requestPasswordReset', () => {
    it('should create password reset token for existing user', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com'
      };

      mockUserModel.findByEmail.mockResolvedValue(mockUser as any);
      mockTokenModel.deleteUserTokens.mockResolvedValue();
      mockTokenModel.create.mockResolvedValue('reset-token');

      await authService.requestPasswordReset('test@example.com');

      expect(mockTokenModel.deleteUserTokens).toHaveBeenCalledWith('user-123', 'password_reset');
      expect(mockTokenModel.create).toHaveBeenCalledWith('user-123', 'password_reset', 60);
    });

    it('should not throw error for non-existent email (security)', async () => {
      mockUserModel.findByEmail.mockResolvedValue(null);

      await expect(authService.requestPasswordReset('nonexistent@example.com'))
        .resolves
        .not.toThrow();
    });
  });

  describe('resetPassword', () => {
    it('should reset password successfully', async () => {
      const mockTokenData = {
        token: 'reset-token',
        userId: 'user-123',
        type: 'password_reset' as const,
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date()
      };

      mockTokenModel.verify.mockResolvedValue(mockTokenData);
      mockUserModel.updatePassword.mockResolvedValue(true);

      const result = await authService.resetPassword('reset-token', 'NewSecurePass123!');

      expect(result).toBe(true);
      expect(mockUserModel.updatePassword).toHaveBeenCalledWith(
        'user-123',
        expect.any(String)
      );
    });

    it('should throw error for invalid reset token', async () => {
      mockTokenModel.verify.mockResolvedValue(null);

      await expect(authService.resetPassword('invalid-token', 'NewSecurePass123!'))
        .rejects
        .toThrow(ValidationError);
    });
  });
});