/**
 * Unit tests for InventoryService
 * Tests product operations with real-time inventory synchronization
 */

import { InventoryService } from '../../services/inventory/InventoryService';
import { ProductModel } from '../../models/Product';
import { InventoryEventService } from '../../services/inventory/InventoryEventService';
import { Product } from '../../types';

// Mock dependencies
jest.mock('../../models/Product');
jest.mock('../../services/inventory/InventoryEventService');
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('InventoryService', () => {
  let inventoryService: InventoryService;
  let mockProductModel: jest.Mocked<ProductModel>;
  let mockEventService: jest.Mocked<InventoryEventService>;
  let mockProduct: Product;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockProductModel = new ProductModel() as jest.Mocked<ProductModel>;
    mockEventService = InventoryEventService.getInstance() as jest.Mocked<InventoryEventService>;
    
    inventoryService = new InventoryService();
    
    mockProduct = {
      productId: 'prod_123',
      vendorId: 'vendor_456',
      name: 'Test Product',
      description: 'A test product',
      category: 'electronics',
      basePrice: 99.99,
      currency: 'USD',
      attributes: {
        quality: 'standard',
        quantity: 10,
        unit: 'piece',
        perishable: false
      },
      images: [],
      availability: 'available',
      lastUpdated: new Date()
    };
  });

  describe('createProduct', () => {
    it('should create product and publish inventory event', async () => {
      const createRequest = {
        vendorId: mockProduct.vendorId,
        name: mockProduct.name,
        description: mockProduct.description,
        category: mockProduct.category,
        basePrice: mockProduct.basePrice,
        currency: mockProduct.currency,
        attributes: mockProduct.attributes,
        images: mockProduct.images
      };

      mockProductModel.create.mockResolvedValue(mockProduct);
      mockEventService.publishInventoryUpdate.mockResolvedValue();

      const result = await inventoryService.createProduct(createRequest);

      expect(mockProductModel.create).toHaveBeenCalledWith(createRequest);
      expect(mockEventService.publishInventoryUpdate).toHaveBeenCalledWith({
        eventType: 'product_created',
        productId: mockProduct.productId,
        vendorId: mockProduct.vendorId,
        changes: [{
          field: 'product',
          oldValue: null,
          newValue: mockProduct
        }],
        product: mockProduct
      });
      expect(result).toEqual(mockProduct);
    });

    it('should handle creation errors', async () => {
      const createRequest = {
        vendorId: 'vendor_456',
        name: 'Test Product',
        description: 'A test product',
        category: 'electronics',
        basePrice: 99.99,
        currency: 'USD',
        attributes: mockProduct.attributes,
        images: []
      };

      mockProductModel.create.mockRejectedValue(new Error('Database error'));

      await expect(inventoryService.createProduct(createRequest)).rejects.toThrow('Database error');
      expect(mockEventService.publishInventoryUpdate).not.toHaveBeenCalled();
    });
  });

  describe('updateProduct', () => {
    it('should update product and publish event with tracked changes', async () => {
      const updates = {
        name: 'Updated Product Name',
        basePrice: 149.99
      };

      const updatedProduct = {
        ...mockProduct,
        ...updates,
        lastUpdated: new Date()
      };

      mockProductModel.findById.mockResolvedValue(mockProduct);
      mockProductModel.update.mockResolvedValue(updatedProduct);
      mockEventService.publishInventoryUpdate.mockResolvedValue();

      const result = await inventoryService.updateProduct(mockProduct.productId, updates);

      expect(mockProductModel.findById).toHaveBeenCalledWith(mockProduct.productId);
      expect(mockProductModel.update).toHaveBeenCalledWith(mockProduct.productId, updates);
      expect(mockEventService.publishInventoryUpdate).toHaveBeenCalledWith({
        eventType: 'price_changed', // Should detect price change
        productId: mockProduct.productId,
        vendorId: mockProduct.vendorId,
        changes: [
          { field: 'name', oldValue: mockProduct.name, newValue: updates.name },
          { field: 'basePrice', oldValue: mockProduct.basePrice, newValue: updates.basePrice }
        ],
        product: updatedProduct
      });
      expect(result).toEqual(updatedProduct);
    });

    it('should handle availability changes specifically', async () => {
      const updates = { availability: 'limited' as const };
      const updatedProduct = { ...mockProduct, ...updates };

      mockProductModel.findById.mockResolvedValue(mockProduct);
      mockProductModel.update.mockResolvedValue(updatedProduct);
      mockEventService.publishInventoryUpdate.mockResolvedValue();

      await inventoryService.updateProduct(mockProduct.productId, updates);

      expect(mockEventService.publishInventoryUpdate).toHaveBeenCalledWith({
        eventType: 'availability_changed',
        productId: mockProduct.productId,
        vendorId: mockProduct.vendorId,
        changes: [{ field: 'availability', oldValue: 'available', newValue: 'limited' }],
        product: updatedProduct
      });
    });

    it('should return null for non-existent product', async () => {
      mockProductModel.findById.mockResolvedValue(null);

      const result = await inventoryService.updateProduct('non_existent', { name: 'New Name' });

      expect(result).toBeNull();
      expect(mockEventService.publishInventoryUpdate).not.toHaveBeenCalled();
    });

    it('should not publish event if no changes detected', async () => {
      const updates = { name: mockProduct.name }; // Same name, no change

      mockProductModel.findById.mockResolvedValue(mockProduct);
      mockProductModel.update.mockResolvedValue(mockProduct);

      await inventoryService.updateProduct(mockProduct.productId, updates);

      expect(mockEventService.publishInventoryUpdate).not.toHaveBeenCalled();
    });
  });

  describe('updateAvailability', () => {
    it('should update availability and publish event', async () => {
      const newAvailability = 'out_of_stock';
      const updatedProduct = { ...mockProduct, availability: newAvailability };

      mockProductModel.findById.mockResolvedValueOnce(mockProduct)
        .mockResolvedValueOnce(updatedProduct);
      mockProductModel.updateAvailability.mockResolvedValue(true);
      mockEventService.publishInventoryUpdate.mockResolvedValue();

      const result = await inventoryService.updateAvailability(mockProduct.productId, newAvailability);

      expect(mockProductModel.updateAvailability).toHaveBeenCalledWith(mockProduct.productId, newAvailability);
      expect(mockEventService.publishInventoryUpdate).toHaveBeenCalledWith({
        eventType: 'availability_changed',
        productId: mockProduct.productId,
        vendorId: mockProduct.vendorId,
        changes: [{
          field: 'availability',
          oldValue: 'available',
          newValue: newAvailability
        }],
        product: updatedProduct
      });
      expect(result).toBe(true);
    });

    it('should not publish event if availability unchanged', async () => {
      mockProductModel.findById.mockResolvedValue(mockProduct);
      mockProductModel.updateAvailability.mockResolvedValue(true);

      await inventoryService.updateAvailability(mockProduct.productId, 'available');

      expect(mockEventService.publishInventoryUpdate).not.toHaveBeenCalled();
    });
  });

  describe('deleteProduct', () => {
    it('should delete product and publish event', async () => {
      mockProductModel.findById.mockResolvedValue(mockProduct);
      mockProductModel.delete.mockResolvedValue(true);
      mockEventService.publishInventoryUpdate.mockResolvedValue();

      const result = await inventoryService.deleteProduct(mockProduct.productId);

      expect(mockProductModel.delete).toHaveBeenCalledWith(mockProduct.productId);
      expect(mockEventService.publishInventoryUpdate).toHaveBeenCalledWith({
        eventType: 'product_deleted',
        productId: mockProduct.productId,
        vendorId: mockProduct.vendorId,
        changes: [{
          field: 'product',
          oldValue: mockProduct,
          newValue: null
        }]
      });
      expect(result).toBe(true);
    });

    it('should return false for non-existent product', async () => {
      mockProductModel.findById.mockResolvedValue(null);

      const result = await inventoryService.deleteProduct('non_existent');

      expect(result).toBe(false);
      expect(mockEventService.publishInventoryUpdate).not.toHaveBeenCalled();
    });
  });

  describe('bulkUpdateAvailability', () => {
    it('should handle bulk availability updates', async () => {
      const updates = [
        { productId: 'prod_1', availability: 'limited' as const },
        { productId: 'prod_2', availability: 'out_of_stock' as const }
      ];

      const product1 = { ...mockProduct, productId: 'prod_1' };
      const product2 = { ...mockProduct, productId: 'prod_2' };

      mockProductModel.findById
        .mockResolvedValueOnce(product1)
        .mockResolvedValueOnce({ ...product1, availability: 'limited' })
        .mockResolvedValueOnce(product2)
        .mockResolvedValueOnce({ ...product2, availability: 'out_of_stock' });

      mockProductModel.updateAvailability.mockResolvedValue(true);
      mockEventService.publishInventoryUpdate.mockResolvedValue();

      const result = await inventoryService.bulkUpdateAvailability(updates);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockEventService.publishInventoryUpdate).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures in bulk updates', async () => {
      const updates = [
        { productId: 'prod_1', availability: 'limited' as const },
        { productId: 'non_existent', availability: 'out_of_stock' as const }
      ];

      const product1 = { ...mockProduct, productId: 'prod_1' };

      mockProductModel.findById
        .mockResolvedValueOnce(product1)
        .mockResolvedValueOnce({ ...product1, availability: 'limited' })
        .mockResolvedValueOnce(null);

      mockProductModel.updateAvailability.mockResolvedValue(true);
      mockEventService.publishInventoryUpdate.mockResolvedValue();

      const result = await inventoryService.bulkUpdateAvailability(updates);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toContain('Product not found: non_existent');
    });
  });

  describe('getVendorInventoryStats', () => {
    it('should return inventory statistics for vendor', async () => {
      const products = [
        { ...mockProduct, productId: 'prod_1', availability: 'available', category: 'electronics' },
        { ...mockProduct, productId: 'prod_2', availability: 'limited', category: 'electronics' },
        { ...mockProduct, productId: 'prod_3', availability: 'out_of_stock', category: 'books' }
      ];

      mockProductModel.findByVendorId.mockResolvedValue({
        products: products as Product[],
        total: 3,
        page: 1,
        limit: 1000,
        totalPages: 1
      });

      const stats = await inventoryService.getVendorInventoryStats(mockProduct.vendorId);

      expect(stats).toEqual({
        totalProducts: 3,
        availableProducts: 1,
        limitedProducts: 1,
        outOfStockProducts: 1,
        categories: ['electronics', 'books']
      });
    });
  });
});