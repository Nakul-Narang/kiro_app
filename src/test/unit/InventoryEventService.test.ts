/**
 * Unit tests for InventoryEventService
 * Tests event publishing, subscription, and cache invalidation
 */

import { InventoryEventService, InventoryUpdateEvent } from '../../services/inventory/InventoryEventService';
import { getRedisClient } from '../../config/database';
import { Product } from '../../types';

// Mock Redis client
jest.mock('../../config/database');
const mockRedisClient = {
  publish: jest.fn(),
  subscribe: jest.fn(),
  keys: jest.fn(),
  del: jest.fn(),
  duplicate: jest.fn(() => ({
    connect: jest.fn(),
    subscribe: jest.fn()
  }))
};
(getRedisClient as jest.Mock).mockReturnValue(mockRedisClient);

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('InventoryEventService', () => {
  let inventoryEventService: InventoryEventService;
  let mockProduct: Product;

  beforeEach(() => {
    jest.clearAllMocks();
    inventoryEventService = InventoryEventService.getInstance();
    
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

  describe('publishInventoryUpdate', () => {
    it('should publish inventory update event with generated ID and timestamp', async () => {
      const eventData = {
        eventType: 'product_created' as const,
        productId: mockProduct.productId,
        vendorId: mockProduct.vendorId,
        changes: [{
          field: 'product',
          oldValue: null,
          newValue: mockProduct
        }],
        product: mockProduct
      };

      await inventoryEventService.publishInventoryUpdate(eventData);

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'inventory:updates',
        expect.stringContaining('"eventType":"product_created"')
      );

      const publishedData = JSON.parse(mockRedisClient.publish.mock.calls[0][1]);
      expect(publishedData).toMatchObject({
        ...eventData,
        eventId: expect.stringMatching(/^inv_\d+_[a-z0-9]+$/),
        timestamp: expect.any(String)
      });
    });

    it('should handle different event types correctly', async () => {
      const eventTypes = ['product_updated', 'availability_changed', 'price_changed', 'product_deleted'] as const;

      for (const eventType of eventTypes) {
        await inventoryEventService.publishInventoryUpdate({
          eventType,
          productId: mockProduct.productId,
          vendorId: mockProduct.vendorId,
          changes: [{ field: 'test', oldValue: 'old', newValue: 'new' }],
          product: mockProduct
        });

        expect(mockRedisClient.publish).toHaveBeenCalledWith(
          'inventory:updates',
          expect.stringContaining(`"eventType":"${eventType}"`)
        );
      }
    });
  });

  describe('subscription management', () => {
    it('should register and manage subscribers', () => {
      const mockCallback = jest.fn();
      const subscriber = {
        subscriberId: 'test_subscriber',
        eventTypes: ['product_created', 'product_updated'],
        callback: mockCallback
      };

      inventoryEventService.subscribe(subscriber);
      
      const stats = inventoryEventService.getEventStats();
      expect(stats.subscriberCount).toBe(1);
      expect(stats.subscribers).toContain('test_subscriber');
    });

    it('should unsubscribe subscribers correctly', () => {
      const mockCallback = jest.fn();
      const subscriber = {
        subscriberId: 'test_subscriber',
        eventTypes: ['*'],
        callback: mockCallback
      };

      inventoryEventService.subscribe(subscriber);
      expect(inventoryEventService.getEventStats().subscriberCount).toBe(1);

      inventoryEventService.unsubscribe('test_subscriber');
      expect(inventoryEventService.getEventStats().subscriberCount).toBe(0);
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate relevant cache patterns for product creation', async () => {
      mockRedisClient.keys.mockResolvedValue(['cache:key1', 'cache:key2']);
      mockRedisClient.del.mockResolvedValue(2);

      const event: InventoryUpdateEvent = {
        eventId: 'test_event',
        eventType: 'product_created',
        productId: mockProduct.productId,
        vendorId: mockProduct.vendorId,
        timestamp: new Date(),
        changes: [{ field: 'product', oldValue: null, newValue: mockProduct }],
        product: mockProduct
      };

      // Simulate handling the event (this would normally be called internally)
      await inventoryEventService.publishInventoryUpdate({
        eventType: event.eventType,
        productId: event.productId,
        vendorId: event.vendorId,
        changes: event.changes,
        product: event.product
      });

      // Verify cache invalidation patterns were called
      expect(mockRedisClient.keys).toHaveBeenCalled();
    });

    it('should clear all caches when requested', async () => {
      mockRedisClient.keys.mockResolvedValue(['search:cache:key1', 'vendor:products:key2']);
      mockRedisClient.del.mockResolvedValue(2);

      await inventoryEventService.clearAllCaches();

      expect(mockRedisClient.keys).toHaveBeenCalledWith('search:cache:*');
      expect(mockRedisClient.keys).toHaveBeenCalledWith('vendor:products:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith(['search:cache:key1', 'vendor:products:key2']);
    });
  });

  describe('event ID generation', () => {
    it('should generate unique event IDs', async () => {
      const eventIds = new Set();
      
      for (let i = 0; i < 10; i++) {
        await inventoryEventService.publishInventoryUpdate({
          eventType: 'product_updated',
          productId: `prod_${i}`,
          vendorId: 'vendor_test',
          changes: [{ field: 'test', oldValue: 'old', newValue: 'new' }]
        });

        const publishedData = JSON.parse(mockRedisClient.publish.mock.calls[i][1]);
        eventIds.add(publishedData.eventId);
      }

      expect(eventIds.size).toBe(10); // All IDs should be unique
    });
  });

  describe('error handling', () => {
    it('should handle Redis publish errors gracefully', async () => {
      mockRedisClient.publish.mockRejectedValue(new Error('Redis connection failed'));

      await expect(inventoryEventService.publishInventoryUpdate({
        eventType: 'product_created',
        productId: mockProduct.productId,
        vendorId: mockProduct.vendorId,
        changes: [{ field: 'test', oldValue: null, newValue: mockProduct }]
      })).rejects.toThrow('Redis connection failed');
    });

    it('should handle cache invalidation errors gracefully', async () => {
      mockRedisClient.keys.mockRejectedValue(new Error('Cache error'));
      
      // Should not throw, but handle error internally
      await inventoryEventService.clearAllCaches();
      
      expect(mockRedisClient.keys).toHaveBeenCalled();
    });
  });

  describe('WebSocket integration', () => {
    it('should set WebSocket service correctly', () => {
      const mockWebSocketService = {
        sendToUser: jest.fn(),
        sendToSession: jest.fn()
      } as any;

      inventoryEventService.setWebSocketService(mockWebSocketService);
      
      // This would be tested through integration tests
      // as the WebSocket service interaction happens in private methods
    });
  });
});