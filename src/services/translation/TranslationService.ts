import { TranslationRequest, TranslationResponse, Message } from '../../types';
import { logger } from '../../utils/logger';
import { getRedisClient } from '../../config/database';
import { GoogleTranslationProvider } from './providers/GoogleTranslationProvider';
import { AzureTranslationProvider } from './providers/AzureTranslationProvider';
import { contextManager } from './ContextManager';
import { languageDetector } from './LanguageDetector';
import { translationCache } from './TranslationCache';
import { fallbackManager } from './FallbackManager';

/**
 * Translation service interface for external translation providers
 */
export interface ITranslationProvider {
  translate(request: TranslationRequest): Promise<TranslationResponse>;
  detectLanguage(text: string): Promise<string>;
  getSupportedLanguages(): Promise<string[]>;
}

/**
 * Core translation service that manages multiple providers and caching
 */
export class TranslationService {
  private primaryProvider: ITranslationProvider | null = null;
  private supportedLanguages: Set<string> = new Set();
  private offlineQueue: TranslationRequest[] = [];
  private isOnline = true;

  constructor() {
    this.initializeSupportedLanguages();
    this.initializeProviders();
  }

  /**
   * Initialize translation providers
   */
  private initializeProviders(): void {
    try {
      // Initialize Google Cloud Translation as primary
      const googleProvider = new GoogleTranslationProvider(
        process.env.GOOGLE_TRANSLATE_API_KEY,
        process.env.GOOGLE_CLOUD_PROJECT_ID
      );

      // Initialize Azure Translator as fallback
      const azureProvider = new AzureTranslationProvider(
        process.env.AZURE_TRANSLATOR_KEY,
        process.env.AZURE_TRANSLATOR_REGION,
        process.env.AZURE_TRANSLATOR_ENDPOINT
      );

      // Register providers with fallback manager
      fallbackManager.registerProvider('google', googleProvider, true);
      fallbackManager.registerProvider('azure', azureProvider, false);

      // Set providers for backward compatibility
      this.setProviders(googleProvider, azureProvider);
      
      logger.info('Translation providers initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize translation providers:', error);
    }
  }

  /**
   * Initialize supported languages
   */
  private async initializeSupportedLanguages(): Promise<void> {
    // Default supported languages for local markets
    const defaultLanguages = [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko',
      'ar', 'hi', 'bn', 'ur', 'ta', 'te', 'mr', 'gu', 'kn', 'ml'
    ];
    
    defaultLanguages.forEach(lang => this.supportedLanguages.add(lang));
    logger.info(`Initialized ${this.supportedLanguages.size} supported languages`);
  }

  /**
   * Set translation providers (legacy method for backward compatibility)
   */
  public setProviders(primary: ITranslationProvider, _fallback?: ITranslationProvider): void {
    this.primaryProvider = primary;
    // Fallback is now handled by FallbackManager
    logger.info('Translation providers configured (legacy method)');
  }

  /**
   * Translate text with context awareness and enhanced error handling
   */
  public async translateWithContext(
    request: TranslationRequest,
    sessionId?: string,
    message?: Message,
    productCategory?: string
  ): Promise<TranslationResponse> {
    try {
      // Enhance request with context if session provided
      let enhancedRequest = request;
      if (sessionId) {
        enhancedRequest = contextManager.enhanceTranslationRequest(
          request,
          sessionId,
          message,
          productCategory
        );
      }

      // Validate language pair
      const validation = languageDetector.validateLanguagePair(
        enhancedRequest.sourceLang,
        enhancedRequest.targetLang
      );

      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Auto-detect source language if not specified or uncertain
      if (!enhancedRequest.sourceLang || enhancedRequest.sourceLang === 'auto') {
        const detection = await this.detectLanguage(enhancedRequest.text);
        enhancedRequest.sourceLang = detection;
      }

      // Perform translation
      return await this.translate(enhancedRequest);

    } catch (error) {
      logger.error('Context-aware translation failed:', error);
      
      // If online translation fails, queue for offline processing
      if (!this.isOnline) {
        this.queueOfflineTranslation(request);
        throw new Error('Translation service temporarily unavailable. Request queued for processing.');
      }
      
      throw error;
    }
  }

  /**
   * Translate text with caching and fallback support
   */
  public async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const startTime = Date.now();
    
    try {
      // Validate languages using language detector
      const validation = languageDetector.validateLanguagePair(request.sourceLang, request.targetLang);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Check cache first using enhanced caching system
      const cacheKey = translationCache.generateCacheKey(request);
      const cached = await translationCache.getCachedTranslation(cacheKey);
      if (cached) {
        logger.debug(`Cache hit for translation: ${request.sourceLang} -> ${request.targetLang}`);
        return {
          ...cached,
          processingTime: Date.now() - startTime
        };
      }

      // Use fallback manager for translation with circuit breaker
      const result = await fallbackManager.translateWithFallback(request);
      
      result.processingTime = Date.now() - startTime;
      
      logger.info(`Translation completed: ${request.sourceLang} -> ${request.targetLang} in ${result.processingTime}ms`);
      return result;
      
    } catch (error) {
      logger.error('Translation failed:', error);
      
      // If all providers fail, try to get from cache as last resort
      const cacheKey = translationCache.generateCacheKey(request);
      const cachedFallback = await translationCache.getCachedTranslation(cacheKey);
      
      if (cachedFallback) {
        logger.info('Using cached translation as emergency fallback');
        return {
          ...cachedFallback,
          processingTime: Date.now() - startTime
        };
      }
      
      // Queue for offline processing
      this.queueOfflineTranslation(request);
      throw error;
    }
  }

  /**
   * Detect language of text with fallback to pattern matching
   */
  public async detectLanguage(text: string): Promise<string> {
    try {
      if (!this.primaryProvider) {
        // Use pattern-based detection as fallback
        const detection = languageDetector.detectLanguageByPatterns(text);
        return detection.language;
      }
      
      try {
        return await this.primaryProvider.detectLanguage(text);
      } catch (error) {
        logger.warn('Primary provider language detection failed, using pattern matching:', error);
        const detection = languageDetector.detectLanguageByPatterns(text);
        return detection.language;
      }
    } catch (error) {
      logger.error('Language detection failed:', error);
      return 'en'; // Default to English
    }
  }

  /**
   * Queue translation request for offline processing
   */
  private queueOfflineTranslation(request: TranslationRequest): void {
    this.offlineQueue.push(request);
    logger.info(`Queued translation request for offline processing. Queue size: ${this.offlineQueue.length}`);
    
    // Limit queue size to prevent memory issues
    if (this.offlineQueue.length > 1000) {
      this.offlineQueue = this.offlineQueue.slice(-1000);
      logger.warn('Offline translation queue trimmed to prevent memory issues');
    }
  }

  /**
   * Process offline translation queue
   */
  public async processOfflineQueue(): Promise<{ processed: number; failed: number }> {
    if (this.offlineQueue.length === 0) {
      return { processed: 0, failed: 0 };
    }

    logger.info(`Processing ${this.offlineQueue.length} queued translation requests`);
    
    let processed = 0;
    let failed = 0;
    const queueCopy = [...this.offlineQueue];
    this.offlineQueue = [];

    for (const request of queueCopy) {
      try {
        await this.translate(request);
        processed++;
      } catch (error) {
        logger.error('Failed to process queued translation:', error);
        failed++;
        // Re-queue failed requests
        this.offlineQueue.push(request);
      }
    }

    logger.info(`Offline queue processing completed: ${processed} processed, ${failed} failed`);
    return { processed, failed };
  }

  /**
   * Get offline queue status
   */
  public getOfflineQueueStatus(): { queueSize: number; isOnline: boolean } {
    return {
      queueSize: this.offlineQueue.length,
      isOnline: this.isOnline
    };
  }

  /**
   * Check service health with enhanced monitoring
   */
  public async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    providers: Record<string, boolean>;
    cacheAvailable: boolean;
    queueSize: number;
    fallbackStats: any;
  }> {
    const health = {
      status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
      providers: {} as Record<string, boolean>,
      cacheAvailable: false,
      queueSize: this.offlineQueue.length,
      fallbackStats: fallbackManager.getStats()
    };

    // Get provider health from fallback manager
    const providerHealth = fallbackManager.getProviderHealth();
    for (const [name, healthInfo] of providerHealth) {
      health.providers[name] = healthInfo.isHealthy;
    }

    // Test cache
    try {
      const redis = getRedisClient();
      await redis.ping();
      health.cacheAvailable = true;
    } catch (error) {
      logger.warn('Cache health check failed:', error);
    }

    // Determine overall status
    const healthyProviders = Object.values(health.providers).filter(Boolean).length;
    const totalProviders = Object.keys(health.providers).length;

    if (healthyProviders === 0) {
      health.status = 'unhealthy';
    } else if (healthyProviders < totalProviders || !health.cacheAvailable) {
      health.status = 'degraded';
    }

    return health;
  }

  /**
   * Check if language is supported
   */
  public isLanguageSupported(languageCode: string): boolean {
    return languageDetector.isLanguageSupported(languageCode);
  }

  /**
   * Get list of supported languages
   */
  public getSupportedLanguages(): string[] {
    return languageDetector.getSupportedLanguages();
  }

  /**
   * Batch translate multiple texts with enhanced caching
   */
  public async batchTranslate(requests: TranslationRequest[]): Promise<TranslationResponse[]> {
    const results: TranslationResponse[] = [];
    
    // Check cache for all requests first
    const cachePromises = requests.map(async (request, index) => {
      const cacheKey = translationCache.generateCacheKey(request);
      const cached = await translationCache.getCachedTranslation(cacheKey);
      return { index, cached, request };
    });
    
    const cacheResults = await Promise.all(cachePromises);
    const uncachedRequests: Array<{ index: number; request: TranslationRequest }> = [];
    
    // Separate cached and uncached requests
    cacheResults.forEach(({ index, cached, request }) => {
      if (cached) {
        results[index] = cached;
      } else {
        uncachedRequests.push({ index, request });
      }
    });
    
    // Process uncached requests in parallel with concurrency limit
    const concurrencyLimit = 5;
    for (let i = 0; i < uncachedRequests.length; i += concurrencyLimit) {
      const batch = uncachedRequests.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(
        batch.map(async ({ index, request }) => {
          try {
            const result = await this.translate(request);
            return { index, result };
          } catch (error) {
            logger.error(`Batch translation failed for request ${index}:`, error);
            // Return error as result
            return {
              index,
              result: {
                translatedText: request.text, // Return original text as fallback
                confidence: 0,
                processingTime: 0
              } as TranslationResponse
            };
          }
        })
      );
      
      // Assign results to correct positions
      batchResults.forEach(({ index, result }) => {
        results[index] = result;
      });
    }
    
    return results;
  }

  /**
   * Clear translation cache
   */
  public async clearCache(): Promise<void> {
    await translationCache.clearCache();
  }

  /**
   * Get cache statistics
   */
  public async getCacheStats() {
    return await translationCache.getCacheStats();
  }

  /**
   * Get fallback manager statistics
   */
  public getFallbackStats() {
    return fallbackManager.getStats();
  }

}

// Singleton instance
export const translationService = new TranslationService();