import { TranslationRequest, TranslationResponse } from '../../types';
import { ITranslationProvider } from './TranslationService';
import { logger } from '../../utils/logger';
import { translationCache } from './TranslationCache';

/**
 * Circuit breaker states
 */
enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

/**
 * Provider health status
 */
interface ProviderHealth {
  isHealthy: boolean;
  lastFailure?: Date;
  consecutiveFailures: number;
  circuitState: CircuitState;
  lastSuccessfulCall?: Date;
  responseTimeMs: number;
}

/**
 * Fallback configuration
 */
interface FallbackConfig {
  maxRetries: number;
  retryDelayMs: number;
  circuitBreakerThreshold: number;
  circuitBreakerTimeoutMs: number;
  healthCheckIntervalMs: number;
  maxResponseTimeMs: number;
}

/**
 * Manages fallback mechanisms and circuit breakers for translation providers
 */
export class FallbackManager {
  private providers: Map<string, ITranslationProvider> = new Map();
  private providerHealth: Map<string, ProviderHealth> = new Map();
  private config: FallbackConfig;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(config?: Partial<FallbackConfig>) {
    this.config = {
      maxRetries: 3,
      retryDelayMs: 1000,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeoutMs: 60000, // 1 minute
      healthCheckIntervalMs: 30000, // 30 seconds
      maxResponseTimeMs: 10000, // 10 seconds
      ...config
    };

    this.startHealthChecks();
  }

  /**
   * Register a translation provider
   */
  public registerProvider(name: string, provider: ITranslationProvider, isPrimary = false): void {
    this.providers.set(name, provider);
    this.providerHealth.set(name, {
      isHealthy: true,
      consecutiveFailures: 0,
      circuitState: CircuitState.CLOSED,
      responseTimeMs: 0
    });

    if (isPrimary) {
      // Move primary provider to front
      const entries = Array.from(this.providers.entries());
      const primaryEntry = entries.find(([n]) => n === name);
      const otherEntries = entries.filter(([n]) => n !== name);
      
      if (primaryEntry) {
        this.providers.clear();
        this.providers.set(primaryEntry[0], primaryEntry[1]);
        otherEntries.forEach(([n, p]) => this.providers.set(n, p));
      }
    }

    logger.info(`Registered translation provider: ${name} (primary: ${isPrimary})`);
  }

  /**
   * Translate with automatic fallback and circuit breaker
   */
  public async translateWithFallback(request: TranslationRequest): Promise<TranslationResponse> {
    const errors: Array<{ provider: string; error: Error }> = [];
    
    // Try each provider in order
    for (const [providerName, provider] of this.providers) {
      const health = this.providerHealth.get(providerName);
      
      if (!health) {
        continue;
      }

      // Skip if circuit breaker is open
      if (health.circuitState === CircuitState.OPEN) {
        if (this.shouldTryHalfOpen(health)) {
          health.circuitState = CircuitState.HALF_OPEN;
          logger.info(`Circuit breaker half-open for provider: ${providerName}`);
        } else {
          logger.debug(`Skipping provider ${providerName} - circuit breaker open`);
          continue;
        }
      }

      try {
        const result = await this.executeWithTimeout(provider, request, providerName);
        
        // Success - update health and return result
        this.recordSuccess(providerName, result.processingTime);
        
        // Cache successful translation
        const cacheKey = translationCache.generateCacheKey(request);
        await translationCache.cacheTranslation(cacheKey, result, request);
        
        return result;
        
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ provider: providerName, error: err });
        
        this.recordFailure(providerName, err);
        
        logger.warn(`Provider ${providerName} failed:`, err.message);
        
        // If this was a half-open attempt, close the circuit
        if (health.circuitState === CircuitState.HALF_OPEN) {
          health.circuitState = CircuitState.OPEN;
          health.lastFailure = new Date();
        }
        
        // Continue to next provider
        continue;
      }
    }

    // All providers failed
    const errorMessage = `All translation providers failed: ${errors.map(e => `${e.provider}: ${e.error.message}`).join(', ')}`;
    logger.error(errorMessage);
    
    // Try to return cached result as last resort
    const cacheKey = translationCache.generateCacheKey(request);
    const cachedResult = await translationCache.getCachedTranslation(cacheKey);
    
    if (cachedResult) {
      logger.info('Returning cached translation as fallback');
      return {
        ...cachedResult,
        processingTime: 0 // Indicate this was from cache
      };
    }
    
    throw new Error(errorMessage);
  }

  /**
   * Execute translation with timeout
   */
  private async executeWithTimeout(
    provider: ITranslationProvider,
    request: TranslationRequest,
    _providerName: string
  ): Promise<TranslationResponse> {
    const startTime = Date.now();
    
    return new Promise<TranslationResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Translation timeout after ${this.config.maxResponseTimeMs}ms`));
      }, this.config.maxResponseTimeMs);

      provider.translate(request)
        .then(result => {
          clearTimeout(timeout);
          result.processingTime = Date.now() - startTime;
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Record successful translation
   */
  private recordSuccess(providerName: string, responseTime: number): void {
    const health = this.providerHealth.get(providerName);
    if (!health) return;

    health.isHealthy = true;
    health.consecutiveFailures = 0;
    health.circuitState = CircuitState.CLOSED;
    health.lastSuccessfulCall = new Date();
    health.responseTimeMs = responseTime;

    logger.debug(`Provider ${providerName} success - response time: ${responseTime}ms`);
  }

  /**
   * Record failed translation
   */
  private recordFailure(providerName: string, error: Error): void {
    const health = this.providerHealth.get(providerName);
    if (!health) return;

    health.consecutiveFailures++;
    health.lastFailure = new Date();

    // Open circuit breaker if threshold reached
    if (health.consecutiveFailures >= this.config.circuitBreakerThreshold) {
      health.circuitState = CircuitState.OPEN;
      health.isHealthy = false;
      logger.warn(`Circuit breaker opened for provider ${providerName} after ${health.consecutiveFailures} failures`);
    }

    logger.debug(`Provider ${providerName} failure #${health.consecutiveFailures}: ${error.message}`);
  }

  /**
   * Check if circuit breaker should try half-open state
   */
  private shouldTryHalfOpen(health: ProviderHealth): boolean {
    if (health.circuitState !== CircuitState.OPEN || !health.lastFailure) {
      return false;
    }

    const timeSinceLastFailure = Date.now() - health.lastFailure.getTime();
    return timeSinceLastFailure >= this.config.circuitBreakerTimeoutMs;
  }

  /**
   * Get provider health status
   */
  public getProviderHealth(): Map<string, ProviderHealth> {
    return new Map(this.providerHealth);
  }

  /**
   * Get healthy providers
   */
  public getHealthyProviders(): string[] {
    const healthy: string[] = [];
    
    for (const [name, health] of this.providerHealth) {
      if (health.isHealthy && health.circuitState === CircuitState.CLOSED) {
        healthy.push(name);
      }
    }
    
    return healthy;
  }

  /**
   * Force reset circuit breaker for a provider
   */
  public resetCircuitBreaker(providerName: string): boolean {
    const health = this.providerHealth.get(providerName);
    if (!health) {
      return false;
    }

    health.circuitState = CircuitState.CLOSED;
    health.consecutiveFailures = 0;
    health.isHealthy = true;
    delete health.lastFailure;

    logger.info(`Circuit breaker reset for provider: ${providerName}`);
    return true;
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckIntervalMs);

    logger.info('Started translation provider health checks');
  }

  /**
   * Perform health checks on all providers
   */
  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.providers.entries()).map(
      async ([name, provider]) => {
        try {
          const startTime = Date.now();
          await provider.detectLanguage('health check');
          const responseTime = Date.now() - startTime;
          
          const health = this.providerHealth.get(name);
          if (health && !health.isHealthy) {
            // Provider recovered
            health.isHealthy = true;
            health.consecutiveFailures = 0;
            health.circuitState = CircuitState.CLOSED;
            health.responseTimeMs = responseTime;
            logger.info(`Provider ${name} recovered - health check passed`);
          }
        } catch (error) {
          const health = this.providerHealth.get(name);
          if (health && health.isHealthy) {
            // Provider became unhealthy
            this.recordFailure(name, error instanceof Error ? error : new Error(String(error)));
            logger.warn(`Provider ${name} failed health check:`, error);
          }
        }
      }
    );

    await Promise.allSettled(healthCheckPromises);
  }

  /**
   * Stop health checks
   */
  public stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      delete (this as any).healthCheckInterval;
      logger.info('Stopped translation provider health checks');
    }
  }

  /**
   * Get fallback statistics
   */
  public getStats(): {
    totalProviders: number;
    healthyProviders: number;
    openCircuits: number;
    averageResponseTime: number;
  } {
    const totalProviders = this.providers.size;
    let healthyProviders = 0;
    let openCircuits = 0;
    let totalResponseTime = 0;
    let responseTimeCount = 0;

    for (const health of this.providerHealth.values()) {
      if (health.isHealthy) {
        healthyProviders++;
      }
      
      if (health.circuitState === CircuitState.OPEN) {
        openCircuits++;
      }
      
      if (health.responseTimeMs > 0) {
        totalResponseTime += health.responseTimeMs;
        responseTimeCount++;
      }
    }

    const averageResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0;

    return {
      totalProviders,
      healthyProviders,
      openCircuits,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100
    };
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stopHealthChecks();
    this.providers.clear();
    this.providerHealth.clear();
  }
}

// Singleton instance
export const fallbackManager = new FallbackManager();