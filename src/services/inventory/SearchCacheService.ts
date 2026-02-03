/**
 * Search Cache Service
 * Manages intelligent caching of search results with automatic invalidation
 * Integrates with inventory events for real-time cache updates
 */

import { getRedisClient } from '../../config/database';
import { VendorSearchResult, VendorSearchFilters, VendorSearchOptions } from '../vendor/VendorSearchService';
import { ProductSearchResult, ProductSearchFilters, ProductSearchOptions } from '../../models/Product';
import { InventoryEventService, InventoryUpdateEvent } from './InventoryEventService';
import { logger } from '../../utils/logger';

export interface CacheKey {
  type: 'vendor_search' | 'product_search' | 'vendor_products';
  filters: any;
  options: any;
  hash: string;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: Date;
  ttl: number;
  key: CacheKey;
}

export class SearchCacheService {
  private static instance: SearchCacheService;
  private readonly CACHE_PREFIX = 'search:cache:';
  private readonly DEFAULT_TTL = 300; // 5 minutes
  private readonly MAX_CACHE_SIZE = 10000;

  private constructor() {
    this.setupInventoryEventSubscription();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): SearchCacheService {
    if (!SearchCacheService.instance) {
      SearchCacheService.instance = new SearchCacheService();
    }
    return SearchCacheService.instance;
  }

  /**
   * Setup subscription to inventory events for cache invalidation
   */
  private setupInventoryEventSubscription(): void {
    const eventService = InventoryEventService.getInstance();
    
    eventService.subscribe({
      subscriberId: 'search-cache-service',
      eventTypes: ['*'], // Subscribe to all events
      callback: this.handleInventoryEvent.bind(this)
    });

    logger.info('✅ Search cache service subscribed to inventory events');
  }

  /**
   * Handle inventory events for cache invalidation
   */
  private async handleInventoryEvent(event: InventoryUpdateEvent): Promise<void> {
    try {
      await this.invalidateCacheForEvent(event);
    } catch (error) {
      logger.error('❌ Error handling inventory event in search cache:', error);
    }
  }

  /**
   * Get cached vendor search results
   */
  async getCachedVendorSearch(
    filters: VendorSearchFilters,
    options: VendorSearchOptions
  ): Promise<VendorSearchResult | null> {
    try {
      const cacheKey = this.generateCacheKey('vendor_search', filters, options);
      const cached = await this.getFromCache<VendorSearchResult>(cacheKey);
      
      if (cached) {
        logger.debug(`🎯 Cache hit for vendor search: ${cacheKey.hash}`);
        return cached.data;
      }
      
      return null;
    } catch (error) {
      logger.error('❌ Error getting cached vendor search:', error);
      return null;
    }
  }

  /**
   * Cache vendor search results
   */
  async cacheVendorSearch(
    filters: VendorSearchFilters,
    options: VendorSearchOptions,
    result: VendorSearchResult,
    ttl?: number
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey('vendor_search', filters, options);
      await this.setCache(cacheKey, result, ttl);
      
      logger.debug(`💾 Cached vendor search: ${cacheKey.hash}`);
    } catch (error) {
      logger.error('❌ Error caching vendor search:', error);
    }
  }

  /**
   * Get cached product search results
   */
  async getCachedProductSearch(
    filters: ProductSearchFilters,
    options: ProductSearchOptions
  ): Promise<ProductSearchResult | null> {
    try {
      const cacheKey = this.generateCacheKey('product_search', filters, options);
      const cached = await this.getFromCache<ProductSearchResult>(cacheKey);
      
      if (cached) {
        logger.debug(`🎯 Cache hit for product search: ${cacheKey.hash}`);
        return cached.data;
      }
      
      return null;
    } catch (error) {
      logger.error('❌ Error getting cached product search:', error);
      return null;
    }
  }

  /**
   * Cache product search results
   */
  async cacheProductSearch(
    filters: ProductSearchFilters,
    options: ProductSearchOptions,
    result: ProductSearchResult,
    ttl?: number
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey('product_search', filters, options);
      await this.setCache(cacheKey, result, ttl);
      
      logger.debug(`💾 Cached product search: ${cacheKey.hash}`);
    } catch (error) {
      logger.error('❌ Error caching product search:', error);
    }
  }

  /**
   * Get cached vendor products
   */
  async getCachedVendorProducts(
    vendorId: string,
    options: ProductSearchOptions
  ): Promise<ProductSearchResult | null> {
    try {
      const cacheKey = this.generateCacheKey('vendor_products', { vendorId }, options);
      const cached = await this.getFromCache<ProductSearchResult>(cacheKey);
      
      if (cached) {
        logger.debug(`🎯 Cache hit for vendor products: ${vendorId}`);
        return cached.data;
      }
      
      return null;
    } catch (error) {
      logger.error('❌ Error getting cached vendor products:', error);
      return null;
    }
  }

  /**
   * Cache vendor products
   */
  async cacheVendorProducts(
    vendorId: string,
    options: ProductSearchOptions,
    result: ProductSearchResult,
    ttl?: number
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey('vendor_products', { vendorId }, options);
      await this.setCache(cacheKey, result, ttl);
      
      logger.debug(`💾 Cached vendor products: ${vendorId}`);
    } catch (error) {
      logger.error('❌ Error caching vendor products:', error);
    }
  }

  /**
   * Generate cache key from filters and options
   */
  private generateCacheKey(type: CacheKey['type'], filters: any, options: any): CacheKey {
    // Create a normalized string representation
    const normalizedFilters = this.normalizeObject(filters);
    const normalizedOptions = this.normalizeObject(options);
    
    const keyString = `${type}:${JSON.stringify(normalizedFilters)}:${JSON.stringify(normalizedOptions)}`;
    const hash = this.hashString(keyString);
    
    return {
      type,
      filters: normalizedFilters,
      options: normalizedOptions,
      hash
    };
  }

  /**
   * Normalize object for consistent caching
   */
  private normalizeObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return {};
    }
    
    // Remove undefined values and sort keys
    const normalized: any = {};
    Object.keys(obj)
      .filter(key => obj[key] !== undefined)
      .sort()
      .forEach(key => {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          normalized[key] = this.normalizeObject(obj[key]);
        } else {
          normalized[key] = obj[key];
        }
      });
    
    return normalized;
  }

  /**
   * Simple hash function for cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get data from cache
   */
  private async getFromCache<T>(cacheKey: CacheKey): Promise<CacheEntry<T> | null> {
    try {
      const redis = getRedisClient();
      const key = `${this.CACHE_PREFIX}${cacheKey.hash}`;
      
      const cached = await redis.get(key);
      if (!cached) {
        return null;
      }
      
      const entry: CacheEntry<T> = JSON.parse(cached);
      
      // Check if entry has expired
      const now = new Date();
      const entryTime = new Date(entry.timestamp);
      const ageInSeconds = (now.getTime() - entryTime.getTime()) / 1000;
      
      if (ageInSeconds > entry.ttl) {
        // Entry expired, remove it
        await redis.del(key);
        return null;
      }
      
      return entry;
    } catch (error) {
      logger.error('❌ Error getting from cache:', error);
      return null;
    }
  }

  /**
   * Set data in cache
   */
  private async setCache<T>(cacheKey: CacheKey, data: T, ttl?: number): Promise<void> {
    try {
      const redis = getRedisClient();
      const key = `${this.CACHE_PREFIX}${cacheKey.hash}`;
      const cacheTtl = ttl || this.DEFAULT_TTL;
      
      const entry: CacheEntry<T> = {
        data,
        timestamp: new Date(),
        ttl: cacheTtl,
        key: cacheKey
      };
      
      await redis.setEx(key, cacheTtl, JSON.stringify(entry));
      
      // Maintain cache size by removing old entries if needed
      await this.maintainCacheSize();
    } catch (error) {
      logger.error('❌ Error setting cache:', error);
    }
  }

  /**
   * Invalidate cache based on inventory event
   */
  private async invalidateCacheForEvent(event: InventoryUpdateEvent): Promise<void> {
    try {
      const redis = getRedisClient();
      const patterns: string[] = [];
      
      // Always invalidate vendor-specific caches
      patterns.push(`${this.CACHE_PREFIX}*vendor_products*${event.vendorId}*`);
      
      // Invalidate based on event type and product data
      if (event.product) {
        const { category, basePrice } = event.product;
        
        // Category-based invalidation
        patterns.push(`${this.CACHE_PREFIX}*category*${category}*`);
        
        // Price-based invalidation (approximate)
        const priceRanges = this.getPriceRangePatterns(basePrice);
        priceRanges.forEach(range => {
          patterns.push(`${this.CACHE_PREFIX}*price*${range}*`);
        });
      }
      
      // For major changes, invalidate broader caches
      if (['product_created', 'product_deleted', 'availability_changed'].includes(event.eventType)) {
        patterns.push(`${this.CACHE_PREFIX}*vendor_search*`);
        patterns.push(`${this.CACHE_PREFIX}*product_search*`);
      }
      
      // Execute invalidation
      let totalInvalidated = 0;
      for (const pattern of patterns) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(keys);
          totalInvalidated += keys.length;
        }
      }
      
      if (totalInvalidated > 0) {
        logger.info(`🗑️ Invalidated ${totalInvalidated} cache entries for event: ${event.eventId}`);
      }
    } catch (error) {
      logger.error('❌ Error invalidating cache for event:', error);
    }
  }

  /**
   * Get price range patterns for cache invalidation
   */
  private getPriceRangePatterns(price: number): string[] {
    const ranges: string[] = [];
    
    // Define overlapping price ranges for better cache invalidation
    const brackets = [
      { min: 0, max: 10, pattern: '0-10' },
      { min: 5, max: 25, pattern: '5-25' },
      { min: 20, max: 50, pattern: '20-50' },
      { min: 40, max: 100, pattern: '40-100' },
      { min: 80, max: 250, pattern: '80-250' },
      { min: 200, max: 500, pattern: '200-500' },
      { min: 400, max: 1000, pattern: '400-1000' },
      { min: 800, max: Infinity, pattern: '800-max' }
    ];

    brackets.forEach(bracket => {
      if (price >= bracket.min && price < bracket.max) {
        ranges.push(bracket.pattern);
      }
    });

    return ranges;
  }

  /**
   * Maintain cache size by removing oldest entries
   */
  private async maintainCacheSize(): Promise<void> {
    try {
      const redis = getRedisClient();
      const keys = await redis.keys(`${this.CACHE_PREFIX}*`);
      
      if (keys.length > this.MAX_CACHE_SIZE) {
        // Get timestamps and sort by age
        const keyTimestamps: Array<{ key: string; timestamp: number }> = [];
        
        for (const key of keys) {
          try {
            const cached = await redis.get(key);
            if (cached) {
              const entry = JSON.parse(cached);
              keyTimestamps.push({
                key,
                timestamp: new Date(entry.timestamp).getTime()
              });
            }
          } catch (error) {
            // Invalid entry, mark for deletion
            keyTimestamps.push({ key, timestamp: 0 });
          }
        }
        
        // Sort by timestamp (oldest first)
        keyTimestamps.sort((a, b) => a.timestamp - b.timestamp);
        
        // Remove oldest entries
        const toRemove = keyTimestamps.slice(0, keys.length - this.MAX_CACHE_SIZE);
        const keysToRemove = toRemove.map(item => item.key);
        
        if (keysToRemove.length > 0) {
          await redis.del(keysToRemove);
          logger.info(`🧹 Removed ${keysToRemove.length} old cache entries to maintain size limit`);
        }
      }
    } catch (error) {
      logger.error('❌ Error maintaining cache size:', error);
    }
  }

  /**
   * Clear all search caches
   */
  async clearAllCaches(): Promise<number> {
    try {
      const redis = getRedisClient();
      const keys = await redis.keys(`${this.CACHE_PREFIX}*`);
      
      if (keys.length > 0) {
        await redis.del(keys);
        logger.info(`🗑️ Cleared ${keys.length} search cache entries`);
      }
      
      return keys.length;
    } catch (error) {
      logger.error('❌ Error clearing all caches:', error);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalEntries: number;
    cacheHitRate: number;
    averageAge: number;
    sizeByType: Record<string, number>;
  }> {
    try {
      const redis = getRedisClient();
      const keys = await redis.keys(`${this.CACHE_PREFIX}*`);
      
      const stats = {
        totalEntries: keys.length,
        cacheHitRate: 0, // Would need to track hits/misses
        averageAge: 0,
        sizeByType: {} as Record<string, number>
      };
      
      let totalAge = 0;
      const now = Date.now();
      
      for (const key of keys) {
        try {
          const cached = await redis.get(key);
          if (cached) {
            const entry = JSON.parse(cached);
            const age = now - new Date(entry.timestamp).getTime();
            totalAge += age;
            
            const type = entry.key?.type || 'unknown';
            stats.sizeByType[type] = (stats.sizeByType[type] || 0) + 1;
          }
        } catch (error) {
          // Skip invalid entries
        }
      }
      
      if (keys.length > 0) {
        stats.averageAge = totalAge / keys.length / 1000; // Convert to seconds
      }
      
      return stats;
    } catch (error) {
      logger.error('❌ Error getting cache stats:', error);
      throw error;
    }
  }
}