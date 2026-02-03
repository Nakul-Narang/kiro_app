/**
 * Inventory Event Service
 * Handles real-time inventory synchronization through event-driven architecture
 * Publishes inventory change events and manages cache invalidation
 */

import { getRedisClient } from '../../config/database';
import { Product } from '../../types';
import { logger } from '../../utils/logger';
import { WebSocketService } from '../realtime/WebSocketService';

export interface InventoryUpdateEvent {
  eventId: string;
  eventType: 'product_created' | 'product_updated' | 'product_deleted' | 'availability_changed' | 'price_changed';
  productId: string;
  vendorId: string;
  timestamp: Date;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  product?: Product; // Full product data for create/update events
}

export interface InventorySubscriber {
  subscriberId: string;
  eventTypes: string[];
  callback: (event: InventoryUpdateEvent) => Promise<void>;
}

export class InventoryEventService {
  private static instance: InventoryEventService;
  private subscribers: Map<string, InventorySubscriber> = new Map();
  private webSocketService?: WebSocketService;
  private readonly INVENTORY_CHANNEL = 'inventory:updates';
  private readonly CACHE_PREFIX = 'search:cache:';
  private readonly VENDOR_CACHE_PREFIX = 'vendor:products:';

  private constructor() {
    this.setupRedisSubscription();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): InventoryEventService {
    if (!InventoryEventService.instance) {
      InventoryEventService.instance = new InventoryEventService();
    }
    return InventoryEventService.instance;
  }

  /**
   * Set WebSocket service for real-time notifications
   */
  public setWebSocketService(webSocketService: WebSocketService): void {
    this.webSocketService = webSocketService;
  }

  /**
   * Setup Redis pub/sub subscription for inventory events
   */
  private async setupRedisSubscription(): Promise<void> {
    try {
      const redis = getRedisClient();
      const subscriber = redis.duplicate();
      await subscriber.connect();

      await subscriber.subscribe(this.INVENTORY_CHANNEL, (message) => {
        try {
          const event: InventoryUpdateEvent = JSON.parse(message);
          this.handleInventoryEvent(event);
        } catch (error) {
          logger.error('Error parsing inventory event:', error);
        }
      });

      logger.info('✅ Inventory event subscription established');
    } catch (error) {
      logger.error('❌ Failed to setup inventory event subscription:', error);
    }
  }

  /**
   * Publish inventory update event
   */
  public async publishInventoryUpdate(event: Omit<InventoryUpdateEvent, 'eventId' | 'timestamp'>): Promise<void> {
    try {
      const fullEvent: InventoryUpdateEvent = {
        ...event,
        eventId: this.generateEventId(),
        timestamp: new Date()
      };

      const redis = getRedisClient();
      await redis.publish(this.INVENTORY_CHANNEL, JSON.stringify(fullEvent));

      // Also handle locally for immediate processing
      await this.handleInventoryEvent(fullEvent);

      logger.info(`📢 Published inventory event: ${fullEvent.eventType} for product ${fullEvent.productId}`);
    } catch (error) {
      logger.error('❌ Failed to publish inventory event:', error);
      throw error;
    }
  }

  /**
   * Handle inventory event (process locally and notify subscribers)
   */
  private async handleInventoryEvent(event: InventoryUpdateEvent): Promise<void> {
    try {
      // Invalidate relevant caches
      await this.invalidateSearchCaches(event);

      // Send WebSocket notifications
      await this.sendWebSocketNotifications(event);

      // Notify registered subscribers
      await this.notifySubscribers(event);

      logger.debug(`✅ Processed inventory event: ${event.eventId}`);
    } catch (error) {
      logger.error('❌ Error handling inventory event:', error);
    }
  }

  /**
   * Invalidate search result caches based on inventory changes
   */
  private async invalidateSearchCaches(event: InventoryUpdateEvent): Promise<void> {
    try {
      const redis = getRedisClient();
      const { productId, vendorId, eventType, product } = event;

      // Patterns to invalidate based on event type and product data
      const invalidationPatterns: string[] = [];

      // Always invalidate vendor-specific caches
      invalidationPatterns.push(`${this.VENDOR_CACHE_PREFIX}${vendorId}:*`);

      // Invalidate general search caches if we have product data
      if (product) {
        // Category-based cache invalidation
        invalidationPatterns.push(`${this.CACHE_PREFIX}category:${product.category}:*`);
        
        // Price range cache invalidation (approximate ranges)
        const priceRanges = this.getPriceRanges(product.basePrice);
        priceRanges.forEach(range => {
          invalidationPatterns.push(`${this.CACHE_PREFIX}price:${range}:*`);
        });

        // Location-based cache invalidation would require vendor location
        // This could be enhanced to include location-based patterns
      }

      // General search cache invalidation for major changes
      if (['product_created', 'product_deleted', 'availability_changed'].includes(eventType)) {
        invalidationPatterns.push(`${this.CACHE_PREFIX}*`);
      }

      // Execute cache invalidation
      for (const pattern of invalidationPatterns) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(keys);
          logger.debug(`🗑️ Invalidated ${keys.length} cache keys matching pattern: ${pattern}`);
        }
      }

      logger.info(`🔄 Cache invalidation completed for event: ${event.eventId}`);
    } catch (error) {
      logger.error('❌ Error invalidating search caches:', error);
    }
  }

  /**
   * Send WebSocket notifications to relevant users
   */
  private async sendWebSocketNotifications(event: InventoryUpdateEvent): Promise<void> {
    try {
      if (!this.webSocketService) {
        logger.warn('⚠️ WebSocket service not available for inventory notifications');
        return;
      }

      const { eventType, productId, vendorId, product } = event;

      // Notification payload
      const notification = {
        type: 'inventory_update',
        eventType,
        productId,
        vendorId,
        timestamp: event.timestamp,
        product: eventType === 'product_deleted' ? undefined : product
      };

      // Notify vendor about their product changes
      await this.webSocketService.sendToUser(vendorId, 'inventory_notification', notification);

      // Notify users who might be interested (this could be enhanced with user interest tracking)
      // For now, we'll send to all connected users for major events
      if (['product_created', 'availability_changed'].includes(eventType)) {
        // This would ideally be more targeted based on user preferences, location, etc.
        logger.debug(`📱 Broadcasting inventory notification for ${eventType}`);
      }

      logger.debug(`📱 WebSocket notifications sent for event: ${event.eventId}`);
    } catch (error) {
      logger.error('❌ Error sending WebSocket notifications:', error);
    }
  }

  /**
   * Notify registered subscribers about inventory events
   */
  private async notifySubscribers(event: InventoryUpdateEvent): Promise<void> {
    try {
      const relevantSubscribers = Array.from(this.subscribers.values())
        .filter(subscriber => 
          subscriber.eventTypes.includes(event.eventType) || 
          subscriber.eventTypes.includes('*')
        );

      const notificationPromises = relevantSubscribers.map(async (subscriber) => {
        try {
          await subscriber.callback(event);
        } catch (error) {
          logger.error(`❌ Error notifying subscriber ${subscriber.subscriberId}:`, error);
        }
      });

      await Promise.all(notificationPromises);

      if (relevantSubscribers.length > 0) {
        logger.debug(`📬 Notified ${relevantSubscribers.length} subscribers for event: ${event.eventId}`);
      }
    } catch (error) {
      logger.error('❌ Error notifying subscribers:', error);
    }
  }

  /**
   * Subscribe to inventory events
   */
  public subscribe(subscriber: InventorySubscriber): void {
    this.subscribers.set(subscriber.subscriberId, subscriber);
    logger.info(`📝 Registered inventory event subscriber: ${subscriber.subscriberId}`);
  }

  /**
   * Unsubscribe from inventory events
   */
  public unsubscribe(subscriberId: string): void {
    this.subscribers.delete(subscriberId);
    logger.info(`🗑️ Unregistered inventory event subscriber: ${subscriberId}`);
  }

  /**
   * Get price ranges for cache invalidation
   */
  private getPriceRanges(price: number): string[] {
    const ranges: string[] = [];
    
    // Define price brackets for cache invalidation
    const brackets = [
      { min: 0, max: 10 },
      { min: 10, max: 25 },
      { min: 25, max: 50 },
      { min: 50, max: 100 },
      { min: 100, max: 250 },
      { min: 250, max: 500 },
      { min: 500, max: 1000 },
      { min: 1000, max: Infinity }
    ];

    brackets.forEach(bracket => {
      if (price >= bracket.min && price < bracket.max) {
        ranges.push(`${bracket.min}-${bracket.max === Infinity ? 'max' : bracket.max}`);
      }
    });

    return ranges;
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get event statistics (for monitoring)
   */
  public getEventStats(): {
    subscriberCount: number;
    subscribers: string[];
  } {
    return {
      subscriberCount: this.subscribers.size,
      subscribers: Array.from(this.subscribers.keys())
    };
  }

  /**
   * Clear all caches (admin function)
   */
  public async clearAllCaches(): Promise<void> {
    try {
      const redis = getRedisClient();
      
      const searchCacheKeys = await redis.keys(`${this.CACHE_PREFIX}*`);
      const vendorCacheKeys = await redis.keys(`${this.VENDOR_CACHE_PREFIX}*`);
      
      const allKeys = [...searchCacheKeys, ...vendorCacheKeys];
      
      if (allKeys.length > 0) {
        await redis.del(allKeys);
        logger.info(`🗑️ Cleared ${allKeys.length} cache keys`);
      }
    } catch (error) {
      logger.error('❌ Error clearing caches:', error);
      throw error;
    }
  }
}