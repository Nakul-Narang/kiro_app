/**
 * Product controller for handling product-related HTTP requests
 * Provides CRUD operations and search functionality for products
 * Enhanced with real-time inventory synchronization
 */

import { Request, Response } from 'express';
import { ProductModel, CreateProductRequest, UpdateProductRequest, ProductSearchFilters, ProductSearchOptions } from '../models/Product';
import { VendorModel } from '../models/Vendor';
import { InventoryService } from '../services/inventory/InventoryService';
import { SearchCacheService } from '../services/inventory/SearchCacheService';
import { ApiResponse } from '../types';
import { logger } from '../utils/logger';
import { validateProductData, validateProductUpdate, validateSearchFilters } from '../utils/validation';

export class ProductController {
  private productModel: ProductModel;
  private vendorModel: VendorModel;
  private inventoryService: InventoryService;
  private searchCacheService: SearchCacheService;

  constructor() {
    this.productModel = new ProductModel();
    this.vendorModel = new VendorModel();
    this.inventoryService = new InventoryService();
    this.searchCacheService = SearchCacheService.getInstance();
  }

  /**
   * Create a new product
   * POST /api/products
   */
  createProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const vendorId = req.user?.userId;
      if (!vendorId) {
        res.status(401).json({
          success: false,
          error: { message: 'Authentication required' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Verify user is a vendor
      const isVendor = await this.vendorModel.exists(vendorId);
      if (!isVendor) {
        res.status(403).json({
          success: false,
          error: { message: 'Only vendors can create products' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Validate request data
      const validation = validateProductData(req.body);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: { 
            message: 'Invalid product data', 
            details: validation.errors 
          },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      const productData: CreateProductRequest = {
        vendorId,
        name: req.body.name,
        description: req.body.description,
        category: req.body.category,
        basePrice: req.body.basePrice,
        currency: req.body.currency || 'USD',
        attributes: req.body.attributes,
        images: req.body.images || []
      };

      // Use inventory service for real-time synchronization
      const product = await this.inventoryService.createProduct(productData);

      res.status(201).json({
        success: true,
        data: product,
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      logger.error('Error creating product:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Get product by ID
   * GET /api/products/:id
   */
  getProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const product = await this.productModel.findById(id);
      if (!product) {
        res.status(404).json({
          success: false,
          error: { message: 'Product not found' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: product,
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      logger.error('Error getting product:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Update product
   * PUT /api/products/:id
   */
  updateProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const vendorId = req.user?.userId;

      if (!vendorId) {
        res.status(401).json({
          success: false,
          error: { message: 'Authentication required' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Check if product exists and belongs to vendor
      const belongsToVendor = await this.inventoryService.checkOwnership(id, vendorId);
      if (!belongsToVendor) {
        res.status(404).json({
          success: false,
          error: { message: 'Product not found or access denied' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Validate update data
      const validation = validateProductUpdate(req.body);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: { 
            message: 'Invalid update data', 
            details: validation.errors 
          },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      const updates: UpdateProductRequest = req.body;
      // Use inventory service for real-time synchronization
      const product = await this.inventoryService.updateProduct(id, updates);

      if (!product) {
        res.status(404).json({
          success: false,
          error: { message: 'Product not found' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: product,
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      logger.error('Error updating product:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Delete product
   * DELETE /api/products/:id
   */
  deleteProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const vendorId = req.user?.userId;

      if (!vendorId) {
        res.status(401).json({
          success: false,
          error: { message: 'Authentication required' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Check if product exists and belongs to vendor
      const belongsToVendor = await this.inventoryService.checkOwnership(id, vendorId);
      if (!belongsToVendor) {
        res.status(404).json({
          success: false,
          error: { message: 'Product not found or access denied' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Use inventory service for real-time synchronization
      const deleted = await this.inventoryService.deleteProduct(id);
      if (!deleted) {
        res.status(404).json({
          success: false,
          error: { message: 'Product not found' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: { message: 'Product deleted successfully' },
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      logger.error('Error deleting product:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Search products
   * GET /api/products/search
   */
  searchProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      // Parse query parameters
      const filters: ProductSearchFilters = {};
      
      if (req.query.category) {
        filters.category = req.query.category as string;
      }
      if (req.query.minPrice) {
        filters.minPrice = parseFloat(req.query.minPrice as string);
      }
      if (req.query.maxPrice) {
        filters.maxPrice = parseFloat(req.query.maxPrice as string);
      }
      if (req.query.availability) {
        filters.availability = req.query.availability as 'available' | 'limited' | 'out_of_stock';
      }
      if (req.query.vendorId) {
        filters.vendorId = req.query.vendorId as string;
      }
      if (req.query.quality) {
        filters.quality = req.query.quality as 'basic' | 'standard' | 'premium';
      }
      if (req.query.perishable) {
        filters.perishable = req.query.perishable === 'true';
      }
      if (req.query.q) {
        filters.searchTerm = req.query.q as string;
      }

      const options: ProductSearchOptions = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: req.query.sortBy as 'price' | 'name' | 'updated' | 'rating' || 'updated',
        sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc'
      };

      // Validate filters
      const validation = validateSearchFilters(filters);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: { 
            message: 'Invalid search parameters', 
            details: validation.errors 
          },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Try to get from cache first
      let result = await this.searchCacheService.getCachedProductSearch(filters, options);
      
      if (!result) {
        // Cache miss, perform search
        result = await this.productModel.search(filters, options);
        
        // Cache the result
        await this.searchCacheService.cacheProductSearch(filters, options, result);
      }

      res.json({
        success: true,
        data: result.products,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        },
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      logger.error('Error searching products:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Get vendor's products
   * GET /api/vendors/:vendorId/products
   */
  getVendorProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const { vendorId } = req.params;

      // Verify vendor exists
      const vendor = await this.vendorModel.findById(vendorId);
      if (!vendor) {
        res.status(404).json({
          success: false,
          error: { message: 'Vendor not found' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      const options: ProductSearchOptions = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: req.query.sortBy as 'price' | 'name' | 'updated' || 'updated',
        sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc'
      };

      const result = await this.productModel.findByVendorId(vendorId, options);

      res.json({
        success: true,
        data: result.products,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        },
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      logger.error('Error getting vendor products:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Get my products (for authenticated vendor)
   * GET /api/products/my
   */
  getMyProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const vendorId = req.user?.userId;
      if (!vendorId) {
        res.status(401).json({
          success: false,
          error: { message: 'Authentication required' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Verify user is a vendor
      const isVendor = await this.vendorModel.exists(vendorId);
      if (!isVendor) {
        res.status(403).json({
          success: false,
          error: { message: 'Only vendors can access this endpoint' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      const options: ProductSearchOptions = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: req.query.sortBy as 'price' | 'name' | 'updated' || 'updated',
        sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc'
      };

      const result = await this.productModel.findByVendorId(vendorId, options);

      res.json({
        success: true,
        data: result.products,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        },
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      logger.error('Error getting my products:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Get product categories
   * GET /api/products/categories
   */
  getCategories = async (_req: Request, res: Response): Promise<void> => {
    try {
      const categories = await this.productModel.getCategories();

      res.json({
        success: true,
        data: categories,
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      logger.error('Error getting categories:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Update product availability
   * PATCH /api/products/:id/availability
   */
  updateAvailability = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { availability } = req.body;
      const vendorId = req.user?.userId;

      if (!vendorId) {
        res.status(401).json({
          success: false,
          error: { message: 'Authentication required' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      if (!availability || !['available', 'limited', 'out_of_stock'].includes(availability)) {
        res.status(400).json({
          success: false,
          error: { message: 'Invalid availability status' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Check if product exists and belongs to vendor
      const belongsToVendor = await this.inventoryService.checkOwnership(id, vendorId);
      if (!belongsToVendor) {
        res.status(404).json({
          success: false,
          error: { message: 'Product not found or access denied' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Use inventory service for real-time synchronization
      const updated = await this.inventoryService.updateAvailability(id, availability);
      if (!updated) {
        res.status(404).json({
          success: false,
          error: { message: 'Product not found' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: { message: 'Availability updated successfully' },
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      logger.error('Error updating availability:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Bulk update product availability
   * POST /api/products/bulk/availability
   */
  bulkUpdateAvailability = async (req: Request, res: Response): Promise<void> => {
    try {
      const vendorId = req.user?.userId;
      if (!vendorId) {
        res.status(401).json({
          success: false,
          error: { message: 'Authentication required' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      const { updates } = req.body;
      if (!Array.isArray(updates) || updates.length === 0) {
        res.status(400).json({
          success: false,
          error: { message: 'Updates array is required' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Validate each update
      for (const update of updates) {
        if (!update.productId || !update.availability) {
          res.status(400).json({
            success: false,
            error: { message: 'Each update must have productId and availability' },
            timestamp: new Date()
          } as ApiResponse);
          return;
        }

        if (!['available', 'limited', 'out_of_stock'].includes(update.availability)) {
          res.status(400).json({
            success: false,
            error: { message: 'Invalid availability status' },
            timestamp: new Date()
          } as ApiResponse);
          return;
        }

        // Check ownership
        const belongsToVendor = await this.inventoryService.checkOwnership(update.productId, vendorId);
        if (!belongsToVendor) {
          res.status(403).json({
            success: false,
            error: { message: `Access denied for product: ${update.productId}` },
            timestamp: new Date()
          } as ApiResponse);
          return;
        }
      }

      const result = await this.inventoryService.bulkUpdateAvailability(updates);

      res.json({
        success: true,
        data: result,
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      logger.error('Error bulk updating availability:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Get vendor inventory statistics
   * GET /api/products/inventory/stats
   */
  getInventoryStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const vendorId = req.user?.userId;
      if (!vendorId) {
        res.status(401).json({
          success: false,
          error: { message: 'Authentication required' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Verify user is a vendor
      const isVendor = await this.vendorModel.exists(vendorId);
      if (!isVendor) {
        res.status(403).json({
          success: false,
          error: { message: 'Only vendors can access inventory stats' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      const stats = await this.inventoryService.getVendorInventoryStats(vendorId);

      res.json({
        success: true,
        data: stats,
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      logger.error('Error getting inventory stats:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' },
        timestamp: new Date()
      } as ApiResponse);
    }
  };

  /**
   * Get cache statistics (admin endpoint)
   * GET /api/products/cache/stats
   */
  getCacheStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const vendorId = req.user?.userId;
      if (!vendorId) {
        res.status(401).json({
          success: false,
          error: { message: 'Authentication required' },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      const stats = await this.searchCacheService.getCacheStats();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      logger.error('Error getting cache stats:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' },
        timestamp: new Date()
      } as ApiResponse);
    }
  };
}