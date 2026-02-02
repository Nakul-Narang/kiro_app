/**
 * Vendor routes
 * Handles vendor discovery, search, and profile management endpoints
 */

import { Router } from 'express';
import { VendorController } from '../controllers/VendorController';
import { authMiddleware } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';

const router = Router();
const vendorController = new VendorController();

// Public routes (no authentication required)

/**
 * Search vendors with filters and location-based ranking
 * POST /api/vendors/search
 * Body: {
 *   location?: { latitude: number, longitude: number, address?: string },
 *   radius?: number,
 *   category?: string,
 *   minPrice?: number,
 *   maxPrice?: number,
 *   minRating?: number,
 *   supportedLanguages?: string[],
 *   businessType?: string,
 *   availability?: 'available' | 'limited' | 'out_of_stock',
 *   paymentMethods?: string[],
 *   searchTerm?: string,
 *   page?: number,
 *   limit?: number,
 *   sortBy?: 'proximity' | 'rating' | 'price' | 'response_time' | 'transactions',
 *   sortOrder?: 'asc' | 'desc',
 *   includeProducts?: boolean,
 *   targetLanguage?: string
 * }
 */
router.post('/search', rateLimiter, vendorController.searchVendors);

/**
 * Find vendors near a specific location
 * POST /api/vendors/nearby
 * Body: {
 *   location: { latitude: number, longitude: number, address?: string },
 *   radius?: number,
 *   page?: number,
 *   limit?: number,
 *   sortBy?: 'proximity' | 'rating' | 'price' | 'response_time' | 'transactions',
 *   sortOrder?: 'asc' | 'desc',
 *   includeProducts?: boolean,
 *   targetLanguage?: string
 * }
 */
router.post('/nearby', rateLimiter, vendorController.findNearbyVendors);

/**
 * Search vendors by category
 * GET /api/vendors/category/:category
 * Query params: location, radius, page, limit, sortBy, sortOrder, includeProducts, targetLanguage
 */
router.get('/category/:category', rateLimiter, vendorController.searchByCategory);

/**
 * Get vendor profile with translated information
 * GET /api/vendors/:vendorId
 * Query params: targetLanguage, includeProducts
 */
router.get('/:vendorId', rateLimiter, vendorController.getVendorProfile);

/**
 * Get popular categories in a location
 * POST /api/vendors/categories/popular
 * Body: {
 *   location?: { latitude: number, longitude: number },
 *   radius?: number
 * }
 */
router.post('/categories/popular', rateLimiter, vendorController.getPopularCategories);

/**
 * Get all available categories
 * GET /api/vendors/categories
 */
router.get('/categories', rateLimiter, vendorController.getAllCategories);

// Protected routes (authentication required)

/**
 * Get personalized vendor recommendations
 * POST /api/vendors/recommendations
 * Requires authentication to access user preferences
 * Body: {
 *   userLocation: { latitude: number, longitude: number },
 *   userLanguages: string[],
 *   preferredCategories?: string[],
 *   page?: number,
 *   limit?: number,
 *   targetLanguage?: string
 * }
 */
router.post('/recommendations', authMiddleware, rateLimiter, vendorController.getRecommendations);

export default router;