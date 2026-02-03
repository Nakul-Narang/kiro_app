/**
 * Product routes
 * Handles all product-related API endpoints
 * Enhanced with real-time inventory synchronization
 */

import { Router } from 'express';
import { ProductController } from '../controllers/ProductController';
import { authenticate, requireVendor, optionalAuth } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';

const router = Router();
const productController = new ProductController();

// Apply rate limiting to all product routes
router.use(rateLimiter);

// Public routes (no authentication required)
router.get('/search', productController.searchProducts);
router.get('/categories', productController.getCategories);
router.get('/:id', productController.getProduct);

// Vendor-specific routes (require vendor authentication)
router.post('/', authenticate, requireVendor, productController.createProduct);
router.get('/my/products', authenticate, requireVendor, productController.getMyProducts);
router.put('/:id', authenticate, requireVendor, productController.updateProduct);
router.delete('/:id', authenticate, requireVendor, productController.deleteProduct);
router.patch('/:id/availability', authenticate, requireVendor, productController.updateAvailability);

// New inventory management routes
router.post('/bulk/availability', authenticate, requireVendor, productController.bulkUpdateAvailability);
router.get('/inventory/stats', authenticate, requireVendor, productController.getInventoryStats);
router.get('/cache/stats', authenticate, productController.getCacheStats);

// Vendor products (public access)
router.get('/vendors/:vendorId/products', productController.getVendorProducts);

export default router;