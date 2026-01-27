import { getRedisClient } from '../../config/database';
import { TranslationRequest, TranslationResponse } from '../../types';
import { logger } from '../../utils/logger';

/**
 * Advanced translation caching system with Redis
 */
export class TranslationCache {
  private cachePrefix = 'translation:';
  private frequentCachePrefix = 'translation:frequent:';
  private contextCachePrefix = 'translation:context:';
  private defaultTTL = 3600; // 1 hour
  private frequentTTL = 86400; // 24 hours for frequent translations
  private contextTTL = 7200; // 2 hours for context-aware translations
  private maxCacheSize = 100000; // Maximum number of cached translations

  /**
   * Generate cache key for translation request
   */
  public generateCacheKey(request: TranslationRequest): string {
    const contextHash = request.context ? 
      this.hashContext(request.context) : 
      'no-context';
    
    const domainSuffix = request.domain ? `:${request.domain}` : '';
    const textHash = this.hashText(request.text);
    
    return `${this.cachePrefix}${request.sourceLang}:${request.targetLang}:${contextHash}:${textHash}${domainSuffix}`;
  }

  /**
   * Get cached translation
   */
  public async getCachedTranslation(cacheKey: string): Promise<TranslationResponse | null> {
    try {
      const redis = getRedisClient();
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        const translation = JSON.parse(cached) as TranslationResponse;
        
        // Update access count for frequency tracking
        await this.updateAccessCount(cacheKey);
        
        logger.debug(`Cache hit for key: ${cacheKey}`);
        return translation;
      }
      
      return null;
    } catch (error) {
      logger.warn('Cache retrieval failed:', error);
      return null;
    }
  }

  /**
   * Cache translation result with intelligent TTL
   */
  public async cacheTranslation(
    cacheKey: string, 
    result: TranslationResponse,
    request?: TranslationRequest
  ): Promise<void> {
    try {
      const redis = getRedisClient();
      
      // Check cache size and clean if necessary
      await this.manageCacheSize();
      
      // Determine TTL based on content type and frequency
      const ttl = await this.calculateTTL(cacheKey, request);
      
      // Store translation
      await redis.setEx(cacheKey, ttl, JSON.stringify(result));
      
      // Store metadata for analytics
      await this.storeCacheMetadata(cacheKey, result, request);
      
      logger.debug(`Cached translation with TTL ${ttl}s: ${cacheKey}`);
    } catch (error) {
      logger.warn('Cache storage failed:', error);
    }
  }

  /**
   * Cache frequent translations with longer TTL
   */
  public async cacheFrequentTranslation(
    request: TranslationRequest,
    result: TranslationResponse
  ): Promise<void> {
    try {
      const redis = getRedisClient();
      const frequentKey = `${this.frequentCachePrefix}${this.generateCacheKey(request)}`;
      
      await redis.setEx(frequentKey, this.frequentTTL, JSON.stringify(result));
      
      // Add to frequent translations set
      await redis.sAdd('translation:frequent:set', frequentKey);
      
      logger.debug(`Cached frequent translation: ${frequentKey}`);
    } catch (error) {
      logger.warn('Frequent translation caching failed:', error);
    }
  }

  /**
   * Get translation from frequent cache
   */
  public async getFrequentTranslation(request: TranslationRequest): Promise<TranslationResponse | null> {
    try {
      const redis = getRedisClient();
      const frequentKey = `${this.frequentCachePrefix}${this.generateCacheKey(request)}`;
      
      const cached = await redis.get(frequentKey);
      if (cached) {
        logger.debug(`Frequent cache hit: ${frequentKey}`);
        return JSON.parse(cached) as TranslationResponse;
      }
      
      return null;
    } catch (error) {
      logger.warn('Frequent cache retrieval failed:', error);
      return null;
    }
  }

  /**
   * Cache context-aware translation
   */
  public async cacheContextTranslation(
    sessionId: string,
    request: TranslationRequest,
    result: TranslationResponse
  ): Promise<void> {
    try {
      const redis = getRedisClient();
      const contextKey = `${this.contextCachePrefix}${sessionId}:${this.generateCacheKey(request)}`;
      
      await redis.setEx(contextKey, this.contextTTL, JSON.stringify(result));
      
      // Add to session context set
      await redis.sAdd(`translation:context:session:${sessionId}`, contextKey);
      
      logger.debug(`Cached context translation: ${contextKey}`);
    } catch (error) {
      logger.warn('Context translation caching failed:', error);
    }
  }

  /**
   * Get context-aware translation
   */
  public async getContextTranslation(
    sessionId: string,
    request: TranslationRequest
  ): Promise<TranslationResponse | null> {
    try {
      const redis = getRedisClient();
      const contextKey = `${this.contextCachePrefix}${sessionId}:${this.generateCacheKey(request)}`;
      
      const cached = await redis.get(contextKey);
      if (cached) {
        logger.debug(`Context cache hit: ${contextKey}`);
        return JSON.parse(cached) as TranslationResponse;
      }
      
      return null;
    } catch (error) {
      logger.warn('Context cache retrieval failed:', error);
      return null;
    }
  }

  /**
   * Invalidate cache for specific language pair
   */
  public async invalidateLanguagePair(sourceLang: string, targetLang: string): Promise<number> {
    try {
      const redis = getRedisClient();
      const pattern = `${this.cachePrefix}${sourceLang}:${targetLang}:*`;
      const keys = await redis.keys(pattern);
      
      if (keys.length > 0) {
        await redis.del(keys);
        logger.info(`Invalidated ${keys.length} cache entries for ${sourceLang}->${targetLang}`);
        return keys.length;
      }
      
      return 0;
    } catch (error) {
      logger.error('Cache invalidation failed:', error);
      return 0;
    }
  }

  /**
   * Clear all translation cache
   */
  public async clearCache(): Promise<void> {
    try {
      const redis = getRedisClient();
      const patterns = [
        `${this.cachePrefix}*`,
        `${this.frequentCachePrefix}*`,
        `${this.contextCachePrefix}*`
      ];
      
      let totalCleared = 0;
      for (const pattern of patterns) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(keys);
          totalCleared += keys.length;
        }
      }
      
      // Clear metadata
      await redis.del('translation:frequent:set');
      await redis.del('translation:cache:stats');
      
      logger.info(`Cleared ${totalCleared} translation cache entries`);
    } catch (error) {
      logger.error('Failed to clear translation cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  public async getCacheStats(): Promise<{
    totalEntries: number;
    frequentEntries: number;
    contextEntries: number;
    hitRate: number;
    averageResponseTime: number;
  }> {
    try {
      const redis = getRedisClient();
      
      // Count entries by pattern
      const totalKeys = await redis.keys(`${this.cachePrefix}*`);
      const frequentKeys = await redis.keys(`${this.frequentCachePrefix}*`);
      const contextKeys = await redis.keys(`${this.contextCachePrefix}*`);
      
      // Get hit rate from metadata
      const stats = await redis.hGetAll('translation:cache:stats');
      const hits = parseInt(stats.hits || '0');
      const misses = parseInt(stats.misses || '0');
      const totalRequests = hits + misses;
      const hitRate = totalRequests > 0 ? hits / totalRequests : 0;
      
      const averageResponseTime = parseFloat(stats.averageResponseTime || '0');
      
      return {
        totalEntries: totalKeys.length,
        frequentEntries: frequentKeys.length,
        contextEntries: contextKeys.length,
        hitRate: Math.round(hitRate * 100) / 100,
        averageResponseTime: Math.round(averageResponseTime * 100) / 100
      };
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      return {
        totalEntries: 0,
        frequentEntries: 0,
        contextEntries: 0,
        hitRate: 0,
        averageResponseTime: 0
      };
    }
  }

  /**
   * Preload common translations
   */
  public async preloadCommonTranslations(): Promise<void> {
    const commonPhrases = [
      { text: 'Hello', sourceLang: 'en', targetLang: 'es' },
      { text: 'Thank you', sourceLang: 'en', targetLang: 'es' },
      { text: 'How much?', sourceLang: 'en', targetLang: 'es' },
      { text: 'Good quality', sourceLang: 'en', targetLang: 'es' },
      { text: 'Best price', sourceLang: 'en', targetLang: 'es' },
      { text: 'I agree', sourceLang: 'en', targetLang: 'es' },
      { text: 'No deal', sourceLang: 'en', targetLang: 'es' },
      // Add more common phrases for other language pairs
    ];

    logger.info('Preloading common translations...');
    
    for (const phrase of commonPhrases) {
      const cacheKey = this.generateCacheKey(phrase);
      const exists = await this.getCachedTranslation(cacheKey);
      
      if (!exists) {
        // This would typically be populated by actual translations
        // For now, we'll just mark these as preload candidates
        logger.debug(`Marked for preload: ${phrase.text} (${phrase.sourceLang}->${phrase.targetLang})`);
      }
    }
  }

  /**
   * Hash text for cache key generation
   */
  private hashText(text: string): string {
    // Simple hash function for cache keys
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Hash context for cache key generation
   */
  private hashContext(context: any): string {
    const contextStr = JSON.stringify({
      productCategory: context.productCategory,
      negotiationPhase: context.negotiationPhase,
      // Don't include full message history in hash for better cache hits
      messageCount: context.previousMessages?.length || 0
    });
    return this.hashText(contextStr);
  }

  /**
   * Calculate TTL based on content and frequency
   */
  private async calculateTTL(cacheKey: string, request?: TranslationRequest): Promise<number> {
    try {
      const redis = getRedisClient();
      
      // Check access frequency
      const accessCount = await redis.get(`${cacheKey}:count`);
      const count = parseInt(accessCount || '0');
      
      // Longer TTL for frequently accessed translations
      if (count > 10) {
        return this.frequentTTL;
      }
      
      // Longer TTL for context-aware translations
      if (request?.context) {
        return this.contextTTL;
      }
      
      return this.defaultTTL;
    } catch (error) {
      return this.defaultTTL;
    }
  }

  /**
   * Update access count for frequency tracking
   */
  private async updateAccessCount(cacheKey: string): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.incr(`${cacheKey}:count`);
      await redis.expire(`${cacheKey}:count`, this.frequentTTL);
    } catch (error) {
      logger.warn('Failed to update access count:', error);
    }
  }

  /**
   * Store cache metadata for analytics
   */
  private async storeCacheMetadata(
    _cacheKey: string,
    result: TranslationResponse,
    _request?: TranslationRequest
  ): Promise<void> {
    try {
      const redis = getRedisClient();
      
      // Update cache statistics
      await redis.hIncrBy('translation:cache:stats', 'total_cached', 1);
      
      // Store response time for analytics
      if (result.processingTime) {
        const currentAvg = await redis.hGet('translation:cache:stats', 'averageResponseTime');
        const currentCount = await redis.hGet('translation:cache:stats', 'total_cached');
        
        if (currentAvg && currentCount) {
          const avg = parseFloat(currentAvg);
          const count = parseInt(currentCount);
          const newAvg = (avg * (count - 1) + result.processingTime) / count;
          await redis.hSet('translation:cache:stats', 'averageResponseTime', newAvg.toString());
        } else {
          await redis.hSet('translation:cache:stats', 'averageResponseTime', result.processingTime.toString());
        }
      }
    } catch (error) {
      logger.warn('Failed to store cache metadata:', error);
    }
  }

  /**
   * Manage cache size to prevent memory issues
   */
  private async manageCacheSize(): Promise<void> {
    try {
      const redis = getRedisClient();
      const totalKeys = await redis.keys(`${this.cachePrefix}*`);
      
      if (totalKeys.length > this.maxCacheSize) {
        // Remove oldest entries (simple LRU approximation)
        const keysToRemove = totalKeys.slice(0, Math.floor(this.maxCacheSize * 0.1));
        if (keysToRemove.length > 0) {
          await redis.del(keysToRemove);
          logger.info(`Removed ${keysToRemove.length} old cache entries to manage size`);
        }
      }
    } catch (error) {
      logger.warn('Cache size management failed:', error);
    }
  }
}

// Singleton instance
export const translationCache = new TranslationCache();