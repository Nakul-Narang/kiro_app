/**
 * Inventory Service
 * Enhanced product management with real-time inventory synchronization
 * Integrates with InventoryEventService for event publishing
 */

import { ProductModel, CreateProductRequest, UpdateProductRequest } from '../../models/Product';
import { Product } from '../../types';
import { InventoryEventService } from './InventoryEventService';
import { logger } from '../../utils/logger';

export class InventoryService {
  private productModel: ProductModel;
  private eventService: InventoryEventService;

  constructor() {
    this.productModel = new ProductModel();
    this.eventService = InventoryEventService.getInstance();
  }

  /**
   * Create a new product with event publishing
   */
  async createProduct(productData: CreateProductRequest): Promise<Product> {
    try {
      const product = await this.productModel.create(productData);

      // Publish inventory event
      await this.eventService.publishInventoryUpdate({
        eventType: 'product_created',
        productId: product.productId,
        vendorId: product.vendorId,
        changes: [{
          field: 'product',
          oldValue: null,
          newValue: product
        }],
        product
      });

      logger.info(`✅ Product created with inventory sync: ${product.productId}`);
      return product;
    } catch (error) {
      logger.error('❌ Error creating product with inventory sync:', error);
      throw error;
    }
  }

  /**
   * Update product with change tracking and event publishing
   */
  async updateProduct(productId: string, updates: UpdateProductRequest): Promise<Product | null> {
    try {
      // Get current product state for change tracking
      const currentProduct = await this.productModel.findById(productId);
      if (!currentProduct) {
        return null;
      }

      // Update the product
      const updatedProduct = await this.productModel.update(productId, updates);
      if (!updatedProduct) {
        return null;
      }

      // Track changes
      const changes = this.trackProductChanges(currentProduct, updatedProduct);
      
      if (changes.length > 0) {
        // Determine event type based on changes
        const eventType = this.determineEventType(changes);

        // Publish inventory event
        await this.eventService.publishInventoryUpdate({
          eventType,
          productId: updatedProduct.productId,
          vendorId: updatedProduct.vendorId,
          changes,
          product: updatedProduct
        });

        logger.info(`✅ Product updated with inventory sync: ${productId}, changes: ${changes.length}`);
      }

      return updatedProduct;
    } catch (error) {
      logger.error('❌ Error updating product with inventory sync:', error);
      throw error;
    }
  }

  /**
   * Update product availability with immediate event publishing
   */
  async updateAvailability(
    productId: string, 
    availability: 'available' | 'limited' | 'out_of_stock'
  ): Promise<boolean> {
    try {
      // Get current product for change tracking
      const currentProduct = await this.productModel.findById(productId);
      if (!currentProduct) {
        return false;
      }

      const oldAvailability = currentProduct.availability;
      
      // Update availability
      const success = await this.productModel.updateAvailability(productId, availability);
      
      if (success && oldAvailability !== availability) {
        // Get updated product
        const updatedProduct = await this.productModel.findById(productId);
        
        if (updatedProduct) {
          // Publish availability change event
          await this.eventService.publishInventoryUpdate({
            eventType: 'availability_changed',
            productId,
            vendorId: updatedProduct.vendorId,
            changes: [{
              field: 'availability',
              oldValue: oldAvailability,
              newValue: availability
            }],
            product: updatedProduct
          });

          logger.info(`✅ Product availability updated with inventory sync: ${productId} (${oldAvailability} → ${availability})`);
        }
      }

      return success;
    } catch (error) {
      logger.error('❌ Error updating availability with inventory sync:', error);
      throw error;
    }
  }

  /**
   * Delete product with event publishing
   */
  async deleteProduct(productId: string): Promise<boolean> {
    try {
      // Get product data before deletion for event
      const product = await this.productModel.findById(productId);
      if (!product) {
        return false;
      }

      // Delete the product
      const success = await this.productModel.delete(productId);
      
      if (success) {
        // Publish deletion event
        await this.eventService.publishInventoryUpdate({
          eventType: 'product_deleted',
          productId,
          vendorId: product.vendorId,
          changes: [{
            field: 'product',
            oldValue: product,
            newValue: null
          }]
        });

        logger.info(`✅ Product deleted with inventory sync: ${productId}`);
      }

      return success;
    } catch (error) {
      logger.error('❌ Error deleting product with inventory sync:', error);
      throw error;
    }
  }

  /**
   * Bulk update product availability (for batch operations)
   */
  async bulkUpdateAvailability(
    updates: Array<{ productId: string; availability: 'available' | 'limited' | 'out_of_stock' }>
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const update of updates) {
      try {
        const success = await this.updateAvailability(update.productId, update.availability);
        if (success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push(`Product not found: ${update.productId}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Error updating ${update.productId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    logger.info(`📊 Bulk availability update completed: ${results.success} success, ${results.failed} failed`);
    return results;
  }

  /**
   * Track changes between product versions
   */
  private trackProductChanges(oldProduct: Product, newProduct: Product): Array<{ field: string; oldValue: any; newValue: any }> {
    const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];

    // Track specific fields that matter for inventory
    const fieldsToTrack = [
      'name', 'description', 'category', 'basePrice', 'currency', 
      'availability', 'attributes', 'images'
    ];

    fieldsToTrack.forEach(field => {
      const oldValue = (oldProduct as any)[field];
      const newValue = (newProduct as any)[field];

      // Deep comparison for objects
      if (typeof oldValue === 'object' && typeof newValue === 'object') {
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          changes.push({ field, oldValue, newValue });
        }
      } else if (oldValue !== newValue) {
        changes.push({ field, oldValue, newValue });
      }
    });

    return changes;
  }

  /**
   * Determine event type based on changes
   */
  private determineEventType(changes: Array<{ field: string; oldValue: any; newValue: any }>): 
    'product_updated' | 'availability_changed' | 'price_changed' {
    
    // Check for availability changes
    if (changes.some(change => change.field === 'availability')) {
      return 'availability_changed';
    }

    // Check for price changes
    if (changes.some(change => change.field === 'basePrice')) {
      return 'price_changed';
    }

    // Default to general update
    return 'product_updated';
  }

  /**
   * Get product with caching (for read operations)
   */
  async getProduct(productId: string): Promise<Product | null> {
    try {
      return await this.productModel.findById(productId);
    } catch (error) {
      logger.error('❌ Error getting product:', error);
      throw error;
    }
  }

  /**
   * Check product ownership
   */
  async checkOwnership(productId: string, vendorId: string): Promise<boolean> {
    try {
      return await this.productModel.belongsToVendor(productId, vendorId);
    } catch (error) {
      logger.error('❌ Error checking product ownership:', error);
      throw error;
    }
  }

  /**
   * Get inventory statistics for a vendor
   */
  async getVendorInventoryStats(vendorId: string): Promise<{
    totalProducts: number;
    availableProducts: number;
    limitedProducts: number;
    outOfStockProducts: number;
    categories: string[];
  }> {
    try {
      const products = await this.productModel.findByVendorId(vendorId, { limit: 1000 });
      
      const stats = {
        totalProducts: products.total,
        availableProducts: 0,
        limitedProducts: 0,
        outOfStockProducts: 0,
        categories: [] as string[]
      };

      const categorySet = new Set<string>();

      products.products.forEach(product => {
        switch (product.availability) {
          case 'available':
            stats.availableProducts++;
            break;
          case 'limited':
            stats.limitedProducts++;
            break;
          case 'out_of_stock':
            stats.outOfStockProducts++;
            break;
        }
        categorySet.add(product.category);
      });

      stats.categories = Array.from(categorySet);

      return stats;
    } catch (error) {
      logger.error('❌ Error getting vendor inventory stats:', error);
      throw error;
    }
  }
}