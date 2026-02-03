/**
 * Integration tests for inventory synchronization
 * Tests the complete flow from product updates to WebSocket notifications
 */

import { InventoryService } from '../../services/inventory/InventoryService';
import { InventoryEventService } from '../../services/inventory/InventoryEventService';
import { SearchCacheService } from '../../services/inventory/SearchCacheService';
import { WebSocketService } from '../../services/realtime/WebSocketService';
import { ProductModel } from '../../models/Product';
import { Product } from '../../types';

// Mock external dependencies
jest.mock('../../config/database');
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Inventory Synchronization Integration', () => {
  let inventoryService: InventoryService;
  let eventService: InventoryEventService;
  let cacheService: SearchCacheService;
  let webSocketService: jest.Mocked<WebSocketService>;
  let mockProduct: Product;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create service instances
    inventoryService = new InventoryService();
    eventService = InventoryEventService.getInstance();
    cacheService = SearchCacheService.getInstance();
    
    // Mock WebSocket service
    webSocketService = {
      sendToUser: jest.fn().mockResolvedValue(true),
      sendToSession: jest.fn().mockResolvedValue(undefined),
      broadcastInventoryUpdate: jest.fn().mockResolvedValue(undefined),
      sendInventoryNotification: jest.fn().mockResolvedValue(true)
    } as any;

    // Set up WebSocket service in event service
    eventService.setWebSocketService(webSocketService);

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

  describe('Product Creation Flow', () => {
    it('should complete full synchronization flow for product creation', async () => {
      // Mock database operations
      const mockProductModel = ProductModel.prototype as jest.Mocked<ProductModel>;
      mockProductModel.create = jest.fn().mockResolvedValue(mockProduct);

      // Mock Redis operations for event publishing
      const mockRedis = require('../../config/database').getRedisClient();
      mockRedis.publish = jest.fn().mockResolvedValue(1);
      mockRedis.keys = jest.fn().mockResolvedValue(['cache:key1', 'cache:key2']);
      mockRedis.del = jest.fn().mockResolvedValue(2);

      // Create product through inventory service
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

      const result = await inventoryService.createProduct(createRequest);

      // Verify product was created
      expect(result).toEqual(mockProduct);
      expect(mockProductModel.create).toHaveBeenCalledWith(createRequest);

      // Verify event was published
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'inventory:updates',
        expect.stringContaining('"eventType":"product_created"')
      );

      // Verify cache invalidation was triggered
      expect(mockRedis.keys).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('Availability Update Flow', () => {
    it('should handle availability updates with real-time notifications', async () => {
      // Mock database operations
      const mockProductModel = ProductModel.prototype as jest.Mocked<ProductModel>;
      mockProductModel.findById = jest.fn()
        .mockResolvedValueOnce(mockProduct)
        .mockResolvedValueOnce({ ...mockProduct, availability: 'out_of_stock' });
      mockProductModel.updateAvailability = jest.fn().mockResolvedValue(true);

      // Mock Redis operations
      const mockRedis = require('../../config/database').getRedisClient();
      mockRedis.publish = jest.fn().mockResolvedValue(1);
      mockRedis.keys = jest.fn().mockResolvedValue(['search:cache:electronics', 'vendor:products:vendor_456']);
      mockRedis.del = jest.fn().mockResolvedValue(2);

      // Update availability
      const success = await inventoryService.updateAvailability(mockProduct.productId, 'out_of_stock');

      expect(success).toBe(true);

      // Verify database update
      expect(mockProductModel.updateAvailability).toHaveBeenCalledWith(
        mockProduct.productId,
        'out_of_stock'
      );

      // Verify event publishing
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'inventory:updates',
        expect.stringContaining('"eventType":"availability_changed"')
      );

      // Verify cache invalidation
      expect(mockRedis.keys).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalledWith(['search:cache:electronics', 'vendor:products:vendor_456']);
    });
  });

  describe('Event Subscription and Notification', () => {
    it('should notify subscribers of inventory events', async () => {
      const mockCallback = jest.fn().mockResolvedValue(undefined);
      
      // Subscribe to events
      eventService.subscribe({
        subscriberId: 'test_subscriber',
        eventTypes: ['availability_changed'],
        callback: mockCallback
      });

      // Mock Redis for event publishing
      const mockRedis = require('../../config/database').getRedisClient();
      mockRedis.publish = jest.fn().mockResolvedValue(1);
      mockRedis.keys = jest.fn().mockResolvedValue([]);
      mockRedis.del = jest.fn().mockResolvedValue(0);

      // Publish an event
      await eventService.publishInventoryUpdate({
        eventType: 'availability_changed',
        productId: mockProduct.productId,
        vendorId: mockProduct.vendorId,
        changes: [{
          field: 'availability',
          oldValue: 'available',
          newValue: 'out_of_stock'
        }],
        product: { ...mockProduct, availability: 'out_of_stock' }
      });

      // Verify subscriber was notified
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'availability_changed',
          productId: mockProduct.productId,
          vendorId: mockProduct.vendorId
        })
      );
    });
  });

  describe('Cache Integration', () => {
    it('should invalidate search caches based on product changes', async () => {
      const mockRedis = require('../../config/database').getRedisClient();
      
      // Mock cache keys that should be invalidated
      mockRedis.keys = jest.fn()
        .mockResolvedValueOnce(['search:cache:category:electronics:page1'])
        .mockResolvedValueOnce(['search:cache:price:80-250:page1'])
        .mockResolvedValueOnce(['vendor:products:vendor_456:page1']);
      
      mockRedis.del = jest.fn().mockResolvedValue(1);

      // Simulate a price change event
      await eventService.publishInventoryUpdate({
        eventType: 'price_changed',
        productId: mockProduct.productId,
        vendorId: mockProduct.vendorId,
        changes: [{
          field: 'basePrice',
          oldValue: 99.99,
          newValue: 149.99
        }],
        product: { ...mockProduct, basePrice: 149.99 }
      });

      // Verify cache invalidation patterns were used
      expect(mockRedis.keys).toHaveBeenCalledWith(
        expect.stringContaining('vendor:products:vendor_456')
      );
    });

    it('should handle cache service integration for search results', async () => {
      const mockRedis = require('../../config/database').getRedisClient();
      mockRedis.get = jest.fn().mockResolvedValue(null); // Cache miss
      mockRedis.setEx = jest.fn().mockResolvedValue('OK');

      const filters = { category: 'electronics' };
      const options = { page: 1, limit: 20 };

      // Try to get from cache (should miss)
      const cachedResult = await cacheService.getCachedProductSearch(filters, options);
      expect(cachedResult).toBeNull();

      // Mock search result
      const searchResult = {
        products: [mockProduct],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1
      };

      // Cache the result
      await cacheService.cacheProductSearch(filters, options, searchResult);

      expect(mockRedis.setEx).toHaveBeenCalledWith(
        expect.stringMatching(/^search:cache:/),
        300, // TTL
        expect.stringContaining('"products"')
      );
    });
  });

  describe('WebSocket Integration', () => {
    it('should send WebSocket notifications for inventory updates', async () => {
      const mockRedis = require('../../config/database').getRedisClient();
      mockRedis.publish = jest.fn().mockResolvedValue(1);
      mockRedis.keys = jest.fn().mockResolvedValue([]);
      mockRedis.del = jest.fn().mockResolvedValue(0);

      // Publish inventory update
      await eventService.publishInventoryUpdate({
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

      // Verify WebSocket notification was sent to vendor
      expect(webSocketService.sendToUser).toHaveBeenCalledWith(
        mockProduct.vendorId,
        'inventory_notification',
        expect.objectContaining({
          type: 'inventory_update',
          eventType: 'product_created',
          productId: mockProduct.productId
        })
      );
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle Redis failures gracefully', async () => {
      const mockRedis = require('../../config/database').getRedisClient();
      mockRedis.publish = jest.fn().mockRejectedValue(new Error('Redis connection failed'));

      // Should throw error for critical operations
      await expect(eventService.publishInventoryUpdate({
        eventType: 'product_created',
        productId: mockProduct.productId,
        vendorId: mockProduct.vendorId,
        changes: []
      })).rejects.toThrow('Redis connection failed');
    });

    it('should handle subscriber callback errors without affecting other subscribers', async () => {
      const workingCallback = jest.fn().mockResolvedValue(undefined);
      const failingCallback = jest.fn().mockRejectedValue(new Error('Callback failed'));

      // Subscribe multiple subscribers
      eventService.subscribe({
        subscriberId: 'working_subscriber',
        eventTypes: ['*'],
        callback: workingCallback
      });

      eventService.subscribe({
        subscriberId: 'failing_subscriber',
        eventTypes: ['*'],
        callback: failingCallback
      });

      const mockRedis = require('../../config/database').getRedisClient();
      mockRedis.publish = jest.fn().mockResolvedValue(1);
      mockRedis.keys = jest.fn().mockResolvedValue([]);
      mockRedis.del = jest.fn().mockResolvedValue(0);

      // Publish event
      await eventService.publishInventoryUpdate({
        eventType: 'product_updated',
        productId: mockProduct.productId,
        vendorId: mockProduct.vendorId,
        changes: []
      });

      // Both callbacks should have been called
      expect(workingCallback).toHaveBeenCalled();
      expect(failingCallback).toHaveBeenCalled();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle bulk operations efficiently', async () => {
      const mockProductModel = ProductModel.prototype as jest.Mocked<ProductModel>;
      const mockRedis = require('../../config/database').getRedisClient();
      
      // Mock multiple products
      const products = Array.from({ length: 10 }, (_, i) => ({
        ...mockProduct,
        productId: `prod_${i}`,
        availability: 'available' as const
      }));

      mockProductModel.findById = jest.fn()
        .mockImplementation((id: string) => {
          const product = products.find(p => p.productId === id);
          return Promise.resolve(product || null);
        });

      mockProductModel.updateAvailability = jest.fn().mockResolvedValue(true);
      mockRedis.publish = jest.fn().mockResolvedValue(1);
      mockRedis.keys = jest.fn().mockResolvedValue([]);
      mockRedis.del = jest.fn().mockResolvedValue(0);

      // Bulk update
      const updates = products.map(p => ({
        productId: p.productId,
        availability: 'limited' as const
      }));

      const result = await inventoryService.bulkUpdateAvailability(updates);

      expect(result.success).toBe(10);
      expect(result.failed).toBe(0);

      // Verify all events were published
      expect(mockRedis.publish).toHaveBeenCalledTimes(10);
    });
  });
});