/**
 * Vendor Controller
 * Handles vendor discovery, search, and profile management endpoints
 */

import { Request, Response } from 'express';
import { VendorModel } from '../models/Vendor';
import { VendorSearchService, VendorSearchFilters, VendorSearchOptions } from '../services/vendor/VendorSearchService';
import { TranslationService } from '../services/translation/TranslationService';
import { ApiResponse, Location } from '../types';
import { logger } from '../utils/logger';
import { validateLocation, validatePagination } from '../utils/validation';

export class VendorController {
  private vendorModel: VendorModel;
  private vendorSearchService: VendorSearchService;
  private translationService: TranslationService;

  constructor() {
    this.vendorModel = new VendorModel();
    this.vendorSearchService = new VendorSearchService();
    this.translationService = new TranslationService();
  }

  /**
   * Search vendors with location-based proximity ranking and filtering
   * POST /api/vendors/search
   */
  searchVendors = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        location,
        radius = 10,
        category,
        minPrice,
        maxPrice,
        minRating,
        supportedLanguages,
        businessType,
        availability,
        paymentMethods,
        searchTerm,
        page = 1,
        limit = 20,
        sortBy = 'proximity',
        sortOrder = 'asc',
        includeProducts = false,
        targetLanguage = 'en'
      } = req.body;

      // Validate location if provided
      if (location && !validateLocation(location)) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Invalid location format',
            code: 'INVALID_LOCATION'
          },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Validate pagination
      const paginationError = validatePagination(page, limit);
      if (paginationError) {
        res.status(400).json({
          success: false,
          error: {
            message: paginationError,
            code: 'INVALID_PAGINATION'
          },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      const filters: VendorSearchFilters = {
        location,
        radius: radius ? parseFloat(radius) : undefined,
        category,
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        minRating: minRating ? parseFloat(minRating) : undefined,
        supportedLanguages,
        businessType,
        availability,
        paymentMethods,
        searchTerm
      };

      const options: VendorSearchOptions = {
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder,
        includeProducts: Boolean(includeProducts),
        targetLanguage
      };

      const result = await this.vendorSearchService.searchVendors(filters, options);

      res.json({
        success: true,
        data: result,
        timestamp: new Date(),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      } as ApiResponse);

    } catch (error) {
      logger.error('Error searching vendors:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to search vendors',
          code: 'SEARCH_ERROR'
        },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Find vendors near a specific location
   * POST /api/vendors/nearby
   */
  findNearbyVendors = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        location,
        radius = 10,
        page = 1,
        limit = 20,
        sortBy = 'proximity',
        sortOrder = 'asc',
        includeProducts = false,
        targetLanguage = 'en'
      } = req.body;

      if (!location || !validateLocation(location)) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Valid location is required',
            code: 'LOCATION_REQUIRED'
          },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      const options: VendorSearchOptions = {
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder,
        includeProducts: Boolean(includeProducts),
        targetLanguage
      };

      const result = await this.vendorSearchService.findNearbyVendors(
        location,
        parseFloat(radius),
        options
      );

      res.json({
        success: true,
        data: result,
        timestamp: new Date(),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      } as ApiResponse);

    } catch (error) {
      logger.error('Error finding nearby vendors:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to find nearby vendors',
          code: 'NEARBY_SEARCH_ERROR'
        },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Search vendors by category
   * GET /api/vendors/category/:category
   */
  searchByCategory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { category } = req.params;
      const {
        location,
        radius,
        page = 1,
        limit = 20,
        sortBy = 'rating',
        sortOrder = 'desc',
        includeProducts = false,
        targetLanguage = 'en'
      } = req.query;

      const options: VendorSearchOptions = {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        sortBy: sortBy as any,
        sortOrder: sortOrder as any,
        includeProducts: Boolean(includeProducts),
        targetLanguage: targetLanguage as string
      };

      let searchLocation: Location | undefined;
      if (location) {
        try {
          searchLocation = JSON.parse(location as string);
          if (!validateLocation(searchLocation)) {
            searchLocation = undefined;
          }
        } catch (error) {
          logger.warn('Invalid location format in query:', error);
        }
      }

      const result = await this.vendorSearchService.searchByCategory(
        category,
        searchLocation,
        radius ? parseFloat(radius as string) : undefined,
        options
      );

      res.json({
        success: true,
        data: result,
        timestamp: new Date(),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      } as ApiResponse);

    } catch (error) {
      logger.error('Error searching vendors by category:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to search vendors by category',
          code: 'CATEGORY_SEARCH_ERROR'
        },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Get vendor recommendations for a user
   * POST /api/vendors/recommendations
   */
  getRecommendations = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        userLocation,
        userLanguages,
        preferredCategories,
        page = 1,
        limit = 10,
        targetLanguage = 'en'
      } = req.body;

      if (!userLocation || !validateLocation(userLocation)) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Valid user location is required',
            code: 'LOCATION_REQUIRED'
          },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      if (!userLanguages || !Array.isArray(userLanguages) || userLanguages.length === 0) {
        res.status(400).json({
          success: false,
          error: {
            message: 'User languages are required',
            code: 'LANGUAGES_REQUIRED'
          },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      const options: VendorSearchOptions = {
        page: parseInt(page),
        limit: parseInt(limit),
        includeProducts: true,
        targetLanguage
      };

      const result = await this.vendorSearchService.getRecommendations(
        userLocation,
        userLanguages,
        preferredCategories,
        options
      );

      res.json({
        success: true,
        data: result,
        timestamp: new Date(),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      } as ApiResponse);

    } catch (error) {
      logger.error('Error getting vendor recommendations:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get vendor recommendations',
          code: 'RECOMMENDATIONS_ERROR'
        },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Get vendor profile with translated information
   * GET /api/vendors/:vendorId
   */
  getVendorProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const { vendorId } = req.params;
      const { targetLanguage = 'en', includeProducts = true } = req.query;

      const vendor = await this.vendorModel.findById(vendorId);
      if (!vendor) {
        res.status(404).json({
          success: false,
          error: {
            message: 'Vendor not found',
            code: 'VENDOR_NOT_FOUND'
          },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Translate vendor information if needed
      let translatedVendor = { ...vendor };
      if (targetLanguage !== vendor.preferredLanguage) {
        try {
          // Translate business name
          const businessNameTranslation = await this.translationService.translate({
            text: vendor.businessName,
            sourceLang: vendor.preferredLanguage,
            targetLang: targetLanguage as string,
            domain: 'trade'
          });
          translatedVendor.businessName = businessNameTranslation.translatedText;

          // Translate bio if available
          if (vendor.profile.bio) {
            const bioTranslation = await this.translationService.translate({
              text: vendor.profile.bio,
              sourceLang: vendor.preferredLanguage,
              targetLang: targetLanguage as string,
              domain: 'general'
            });
            translatedVendor.profile = {
              ...translatedVendor.profile,
              bio: bioTranslation.translatedText
            };
          }
        } catch (error) {
          logger.warn('Failed to translate vendor profile:', error);
        }
      }

      // Load products if requested
      if (includeProducts === 'true') {
        // This would typically load from ProductModel, but for now we'll use the search service
        const searchResult = await this.vendorSearchService.searchVendors(
          { vendorId },
          { limit: 50, includeProducts: true, targetLanguage: targetLanguage as string }
        );
        
        if (searchResult.vendors.length > 0) {
          translatedVendor.products = searchResult.vendors[0].products;
        }
      }

      res.json({
        success: true,
        data: translatedVendor,
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      logger.error('Error getting vendor profile:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get vendor profile',
          code: 'PROFILE_ERROR'
        },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Get popular categories in a location
   * POST /api/vendors/categories/popular
   */
  getPopularCategories = async (req: Request, res: Response): Promise<void> => {
    try {
      const { location, radius = 25 } = req.body;

      let searchLocation: Location | undefined;
      if (location) {
        if (!validateLocation(location)) {
          res.status(400).json({
            success: false,
            error: {
              message: 'Invalid location format',
              code: 'INVALID_LOCATION'
            },
            timestamp: new Date()
          } as ApiResponse);
          return;
        }
        searchLocation = location;
      }

      const categories = await this.vendorSearchService.getPopularCategories(
        searchLocation,
        radius ? parseFloat(radius) : undefined
      );

      res.json({
        success: true,
        data: categories,
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      logger.error('Error getting popular categories:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get popular categories',
          code: 'CATEGORIES_ERROR'
        },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Get all vendor categories
   * GET /api/vendors/categories
   */
  getAllCategories = async (req: Request, res: Response): Promise<void> => {
    try {
      // This would typically come from a categories service or database
      // For now, we'll return common marketplace categories
      const categories = [
        'Electronics',
        'Clothing & Fashion',
        'Food & Beverages',
        'Home & Garden',
        'Health & Beauty',
        'Sports & Recreation',
        'Books & Media',
        'Automotive',
        'Jewelry & Accessories',
        'Toys & Games',
        'Art & Crafts',
        'Services',
        'Agriculture',
        'Construction',
        'Education',
        'Other'
      ];

      res.json({
        success: true,
        data: categories,
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      logger.error('Error getting categories:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get categories',
          code: 'CATEGORIES_ERROR'
        },
        timestamp: new Date()
      } as ApiResponse);
    }
  };
}