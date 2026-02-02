/**
 * Unit tests for VendorController
 * Tests vendor discovery and search API endpoints
 */

import { Request, Response } from 'express';
import { VendorController } from '../../controllers/VendorController';
import { VendorModel } from '../../models/Vendor';
import { VendorSearchService } from '../../services/vendor/VendorSearchService';
import { TranslationService } from '../../services/translation/TranslationService';
import { Vendor } from '../../types';

// Mock dependencies
jest.mock('../../models/Vendor');
jest.mock('../../services/vendor/VendorSearchService');
jest.mock('../../services/translation/TranslationService');

const mockVendorModel = {
  findById: jest.fn()
};

const mockVendorSearchService = {
  searchVendors: jest.fn(),
  findNearbyVendors: jest.fn(),
  searchByCategory: jest.fn(),
  getRecommendations: jest.fn(),
  getPopularCategories: jest.fn()
};

const mockTranslationService = {
  translate: jest.fn()
};

(VendorModel as jest.Mock).mockImplementation(() => mockVendorModel);
(VendorSearchService as jest.Mock).mockImplementation(() => mockVendorSearchService);
(TranslationService as jest.Mock).mockImplementation(() => mockTranslationService);

describe('VendorController', () => {
  let vendorController: VendorController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    vendorController = new VendorController();
    mockRequest = {};
    mockResponse = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('searchVendors', () => {
    it('should search vendors successfully', async () => {
      const mockSearchResult = {
        vendors: [
          {
            userId: 'vendor-1',
            businessName: 'Test Vendor',
            averageRating: 4.5,
            distance: 2.5
          }
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1
      };

      mockVendorSearchService.searchVendors.mockResolvedValueOnce(mockSearchResult);

      mockRequest.body = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 10,
        category: 'Electronics',
        page: 1,
        limit: 20
      };

      await vendorController.searchVendors(mockRequest as Request, mockResponse as Response);

      expect(mockVendorSearchService.searchVendors).toHaveBeenCalledWith(
        expect.objectContaining({
          location: { latitude: 40.7128, longitude: -74.0060 },
          radius: 10,
          category: 'Electronics'
        }),
        expect.objectContaining({
          page: 1,
          limit: 20
        })
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockSearchResult,
        timestamp: expect.any(Date),
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1
        }
      });
    });

    it('should handle invalid location format', async () => {
      mockRequest.body = {
        location: { invalid: 'location' }
      };

      await vendorController.searchVendors(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Invalid location format',
          code: 'INVALID_LOCATION'
        },
        timestamp: expect.any(Date)
      });
    });

    it('should handle invalid pagination parameters', async () => {
      mockRequest.body = {
        page: -1,
        limit: 0
      };

      await vendorController.searchVendors(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: expect.stringContaining('Invalid'),
          code: 'INVALID_PAGINATION'
        },
        timestamp: expect.any(Date)
      });
    });

    it('should handle search service errors', async () => {
      mockVendorSearchService.searchVendors.mockRejectedValueOnce(new Error('Search failed'));

      mockRequest.body = {
        category: 'Electronics'
      };

      await vendorController.searchVendors(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Failed to search vendors',
          code: 'SEARCH_ERROR'
        },
        timestamp: expect.any(Date)
      });
    });
  });

  describe('findNearbyVendors', () => {
    it('should find nearby vendors successfully', async () => {
      const mockResult = {
        vendors: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0
      };

      mockVendorSearchService.findNearbyVendors.mockResolvedValueOnce(mockResult);

      mockRequest.body = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 5
      };

      await vendorController.findNearbyVendors(mockRequest as Request, mockResponse as Response);

      expect(mockVendorSearchService.findNearbyVendors).toHaveBeenCalledWith(
        { latitude: 40.7128, longitude: -74.0060 },
        5,
        expect.any(Object)
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockResult,
        timestamp: expect.any(Date),
        pagination: expect.any(Object)
      });
    });

    it('should require valid location', async () => {
      mockRequest.body = {};

      await vendorController.findNearbyVendors(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Valid location is required',
          code: 'LOCATION_REQUIRED'
        },
        timestamp: expect.any(Date)
      });
    });
  });

  describe('searchByCategory', () => {
    it('should search vendors by category successfully', async () => {
      const mockResult = {
        vendors: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0
      };

      mockVendorSearchService.searchByCategory.mockResolvedValueOnce(mockResult);

      mockRequest.params = { category: 'Electronics' };
      mockRequest.query = {
        page: '1',
        limit: '20',
        sortBy: 'rating',
        sortOrder: 'desc'
      };

      await vendorController.searchByCategory(mockRequest as Request, mockResponse as Response);

      expect(mockVendorSearchService.searchByCategory).toHaveBeenCalledWith(
        'Electronics',
        undefined,
        undefined,
        expect.objectContaining({
          page: 1,
          limit: 20,
          sortBy: 'rating',
          sortOrder: 'desc'
        })
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockResult,
        timestamp: expect.any(Date),
        pagination: expect.any(Object)
      });
    });

    it('should handle location parameter in query', async () => {
      const mockResult = {
        vendors: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0
      };

      mockVendorSearchService.searchByCategory.mockResolvedValueOnce(mockResult);

      mockRequest.params = { category: 'Electronics' };
      mockRequest.query = {
        location: JSON.stringify({ latitude: 40.7128, longitude: -74.0060 }),
        radius: '10'
      };

      await vendorController.searchByCategory(mockRequest as Request, mockResponse as Response);

      expect(mockVendorSearchService.searchByCategory).toHaveBeenCalledWith(
        'Electronics',
        { latitude: 40.7128, longitude: -74.0060 },
        10,
        expect.any(Object)
      );
    });
  });

  describe('getRecommendations', () => {
    it('should get vendor recommendations successfully', async () => {
      const mockResult = {
        vendors: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0
      };

      mockVendorSearchService.getRecommendations.mockResolvedValueOnce(mockResult);

      mockRequest.body = {
        userLocation: { latitude: 40.7128, longitude: -74.0060 },
        userLanguages: ['en', 'es'],
        preferredCategories: ['Electronics']
      };

      await vendorController.getRecommendations(mockRequest as Request, mockResponse as Response);

      expect(mockVendorSearchService.getRecommendations).toHaveBeenCalledWith(
        { latitude: 40.7128, longitude: -74.0060 },
        ['en', 'es'],
        ['Electronics'],
        expect.objectContaining({
          page: 1,
          limit: 10,
          includeProducts: true
        })
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockResult,
        timestamp: expect.any(Date),
        pagination: expect.any(Object)
      });
    });

    it('should require valid user location', async () => {
      mockRequest.body = {
        userLanguages: ['en']
      };

      await vendorController.getRecommendations(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Valid user location is required',
          code: 'LOCATION_REQUIRED'
        },
        timestamp: expect.any(Date)
      });
    });

    it('should require user languages', async () => {
      mockRequest.body = {
        userLocation: { latitude: 40.7128, longitude: -74.0060 }
      };

      await vendorController.getRecommendations(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'User languages are required',
          code: 'LANGUAGES_REQUIRED'
        },
        timestamp: expect.any(Date)
      });
    });
  });

  describe('getVendorProfile', () => {
    const mockVendor: Vendor = {
      userId: 'vendor-1',
      email: 'vendor@example.com',
      phoneNumber: '+1234567890',
      preferredLanguage: 'en',
      supportedLanguages: ['en', 'es'],
      location: { latitude: 40.7128, longitude: -74.0060 },
      profile: { firstName: 'John', lastName: 'Doe', bio: 'Local vendor' },
      verified: true,
      createdAt: new Date(),
      lastActive: new Date(),
      businessName: 'John\'s Electronics',
      businessType: 'Electronics',
      businessHours: {
        monday: { open: '09:00', close: '17:00' },
        tuesday: { open: '09:00', close: '17:00' },
        wednesday: { open: '09:00', close: '17:00' },
        thursday: { open: '09:00', close: '17:00' },
        friday: { open: '09:00', close: '17:00' },
        saturday: { closed: true, open: '00:00', close: '00:00' },
        sunday: { closed: true, open: '00:00', close: '00:00' }
      },
      paymentMethods: ['cash', 'card'],
      averageRating: 4.5,
      totalTransactions: 100,
      responseTime: 15,
      products: [],
      ratings: []
    };

    it('should get vendor profile successfully', async () => {
      mockVendorModel.findById.mockResolvedValueOnce(mockVendor);

      mockRequest.params = { vendorId: 'vendor-1' };
      mockRequest.query = { targetLanguage: 'en', includeProducts: 'false' };

      await vendorController.getVendorProfile(mockRequest as Request, mockResponse as Response);

      expect(mockVendorModel.findById).toHaveBeenCalledWith('vendor-1');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockVendor,
        timestamp: expect.any(Date)
      });
    });

    it('should translate vendor profile when target language differs', async () => {
      mockVendorModel.findById.mockResolvedValueOnce(mockVendor);
      mockTranslationService.translate
        .mockResolvedValueOnce({ translatedText: 'Electrónicos de Juan', confidence: 0.95 })
        .mockResolvedValueOnce({ translatedText: 'Vendedor local', confidence: 0.95 });

      mockRequest.params = { vendorId: 'vendor-1' };
      mockRequest.query = { targetLanguage: 'es', includeProducts: 'false' };

      await vendorController.getVendorProfile(mockRequest as Request, mockResponse as Response);

      expect(mockTranslationService.translate).toHaveBeenCalledWith({
        text: 'John\'s Electronics',
        sourceLang: 'en',
        targetLang: 'es',
        domain: 'trade'
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith({
        text: 'Local vendor',
        sourceLang: 'en',
        targetLang: 'es',
        domain: 'general'
      });

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          businessName: 'Electrónicos de Juan',
          profile: expect.objectContaining({
            bio: 'Vendedor local'
          })
        }),
        timestamp: expect.any(Date)
      });
    });

    it('should handle vendor not found', async () => {
      mockVendorModel.findById.mockResolvedValueOnce(null);

      mockRequest.params = { vendorId: 'nonexistent' };

      await vendorController.getVendorProfile(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Vendor not found',
          code: 'VENDOR_NOT_FOUND'
        },
        timestamp: expect.any(Date)
      });
    });
  });

  describe('getPopularCategories', () => {
    it('should get popular categories successfully', async () => {
      const mockCategories = [
        { category: 'Electronics', count: 50 },
        { category: 'Clothing', count: 30 }
      ];

      mockVendorSearchService.getPopularCategories.mockResolvedValueOnce(mockCategories);

      mockRequest.body = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25
      };

      await vendorController.getPopularCategories(mockRequest as Request, mockResponse as Response);

      expect(mockVendorSearchService.getPopularCategories).toHaveBeenCalledWith(
        { latitude: 40.7128, longitude: -74.0060 },
        25
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockCategories,
        timestamp: expect.any(Date)
      });
    });

    it('should handle invalid location format', async () => {
      mockRequest.body = {
        location: { invalid: 'location' }
      };

      await vendorController.getPopularCategories(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Invalid location format',
          code: 'INVALID_LOCATION'
        },
        timestamp: expect.any(Date)
      });
    });
  });

  describe('getAllCategories', () => {
    it('should return all available categories', async () => {
      await vendorController.getAllCategories(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          'Electronics',
          'Clothing & Fashion',
          'Food & Beverages',
          'Home & Garden'
        ]),
        timestamp: expect.any(Date)
      });
    });
  });
});