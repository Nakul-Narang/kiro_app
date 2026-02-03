import { 
  PriceDiscoveryRequest, 
  PriceRecommendation, 
  PricingFactor, 
  MarketConditions,
  ProductAttributes 
} from '../../types';
import { logger } from '../../utils/logger';
import { getRedisClient, getMongoDb } from '../../config/database';
import { priceAnalyzer } from './PriceAnalyzer';
import { seasonalAnalysisEngine } from './SeasonalAnalysisEngine';

/**
 * Price discovery service that provides intelligent pricing recommendations
 */
export class PriceDiscoveryService {
  private cachePrefix = 'price:';
  private cacheTTL = 300; // 5 minutes for price data

  /**
   * Generate price recommendation for a product with ML enhancement
   */
  public async generatePriceRecommendation(request: PriceDiscoveryRequest): Promise<PriceRecommendation> {
    const startTime = Date.now();
    
    try {
      logger.info(`Generating price recommendation for product ${request.productId} in category ${request.category}`);
      
      // Try ML-enhanced recommendation first
      try {
        const mlRecommendation = await priceAnalyzer.generateMLPriceRecommendation(request);
        if (mlRecommendation.confidence > 50) {
          logger.info(`Using ML recommendation with ${mlRecommendation.confidence}% confidence`);
          return mlRecommendation;
        }
      } catch (error) {
        logger.warn('ML recommendation failed, falling back to traditional method:', error);
      }

      // Fallback to traditional recommendation
      return await this.generateTraditionalRecommendation(request);
      
    } catch (error) {
      logger.error('Price recommendation generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate traditional price recommendation (original implementation)
   */
  private async generateTraditionalRecommendation(request: PriceDiscoveryRequest): Promise<PriceRecommendation> {
    const startTime = Date.now();
    
    try {
      logger.info(`Generating price recommendation for product ${request.productId} in category ${request.category}`);
      
      // Check cache first
      const cacheKey = this.generateCacheKey(request);
      const cached = await this.getCachedRecommendation(cacheKey);
      if (cached) {
        logger.debug(`Cache hit for price recommendation: ${request.productId}`);
        return cached;
      }

      // Gather market data
      const marketData = await this.gatherMarketData(request);
      
      // Calculate base price using market analysis
      const basePrice = await this.calculateBasePrice(request, marketData);
      
      // Apply pricing factors
      const factors = await this.calculatePricingFactors(request, marketData);
      const adjustedPrice = this.applyPricingFactors(basePrice, factors);
      
      // Apply seasonal adjustments if available
      try {
        const seasonalMultipliers = await seasonalAnalysisEngine.getSeasonalMultipliers(
          request.category, 
          request.vendorLocation
        );
        
        if (seasonalMultipliers.confidence > 0.5) {
          adjustedPrice *= seasonalMultipliers.seasonal;
          factors.push({
            name: 'Seasonal Adjustment',
            impact: seasonalMultipliers.seasonal - 1,
            description: `${seasonalMultipliers.season} seasonal multiplier: ${seasonalMultipliers.seasonal.toFixed(2)}`
          });
        }
      } catch (error) {
        logger.warn('Seasonal adjustment failed:', error);
      }

      // Calculate price range for negotiation
      const priceRange = this.calculatePriceRange(adjustedPrice, factors);
      
      // Determine market position
      const marketPosition = this.determineMarketPosition(adjustedPrice, marketData);
      
      // Calculate confidence score
      const confidence = this.calculateConfidence(marketData, factors);
      
      const recommendation: PriceRecommendation = {
        suggestedPrice: Math.round(adjustedPrice * 100) / 100,
        priceRange: {
          min: Math.round(priceRange.min * 100) / 100,
          max: Math.round(priceRange.max * 100) / 100
        },
        confidence,
        factors,
        marketPosition,
        lastUpdated: new Date()
      };

      // Cache the recommendation
      await this.cacheRecommendation(cacheKey, recommendation);
      
      const processingTime = Date.now() - startTime;
      logger.info(`Price recommendation generated in ${processingTime}ms with confidence ${confidence}%`);
      
      return recommendation;
      
    } catch (error) {
      logger.error('Price recommendation generation failed:', error);
      throw error;
    }
  }

  /**
   * Update market conditions and refresh affected recommendations
   */
  public async updateMarketConditions(category: string, conditions: MarketConditions): Promise<void> {
    try {
      logger.info(`Updating market conditions for category: ${category}`);
      
      // Store market conditions in MongoDB
      const db = getMongoDb();
      await db.collection('market_conditions').updateOne(
        { category },
        { 
          $set: { 
            ...conditions, 
            lastUpdated: new Date() 
          } 
        },
        { upsert: true }
      );

      // Invalidate related cache entries
      await this.invalidateCategoryCache(category);
      
      logger.info(`Market conditions updated for category: ${category}`);
    } catch (error) {
      logger.error('Failed to update market conditions:', error);
      throw error;
    }
  }

  /**
   * Gather market data for price analysis
   */
  private async gatherMarketData(request: PriceDiscoveryRequest): Promise<any> {
    try {
      const db = getMongoDb();
      
      // Get historical pricing data
      const historicalPrices = await db.collection('price_history')
        .find({ 
          category: request.category,
          'attributes.quality': request.attributes.quality
        })
        .sort({ timestamp: -1 })
        .limit(100)
        .toArray();

      // Get current market conditions
      const marketConditions = await db.collection('market_conditions')
        .findOne({ category: request.category });

      // Get competitor data
      const competitors = await db.collection('competitor_prices')
        .find({ 
          category: request.category,
          region: this.getRegionFromLocation(request.vendorLocation)
        })
        .toArray();

      return {
        historicalPrices,
        marketConditions: marketConditions || request.marketConditions,
        competitors,
        sampleSize: historicalPrices.length
      };
    } catch (error) {
      logger.error('Failed to gather market data:', error);
      return {
        historicalPrices: [],
        marketConditions: request.marketConditions,
        competitors: [],
        sampleSize: 0
      };
    }
  }

  /**
   * Calculate base price from market data
   */
  private async calculateBasePrice(request: PriceDiscoveryRequest, marketData: any): Promise<number> {
    if (marketData.historicalPrices.length === 0) {
      // No historical data, use fallback pricing
      return this.getFallbackPrice(request);
    }

    // Calculate weighted average based on recency and quality match
    let totalWeight = 0;
    let weightedSum = 0;

    marketData.historicalPrices.forEach((price: any) => {
      const recencyWeight = this.calculateRecencyWeight(price.timestamp);
      const qualityWeight = this.calculateQualityWeight(price.attributes, request.attributes);
      const weight = recencyWeight * qualityWeight;
      
      totalWeight += weight;
      weightedSum += price.finalPrice * weight;
    });

    return totalWeight > 0 ? weightedSum / totalWeight : this.getFallbackPrice(request);
  }

  /**
   * Calculate pricing factors that affect the final price
   */
  private async calculatePricingFactors(request: PriceDiscoveryRequest, marketData: any): Promise<PricingFactor[]> {
    const factors: PricingFactor[] = [];

    // Quality factor
    const qualityImpact = this.getQualityImpact(request.attributes.quality);
    factors.push({
      name: 'Quality',
      impact: qualityImpact,
      description: `${request.attributes.quality} quality adjustment`
    });

    // Seasonality factor
    if (request.attributes.seasonality) {
      const seasonalImpact = this.getSeasonalImpact(request.attributes.seasonality, marketData.marketConditions);
      factors.push({
        name: 'Seasonality',
        impact: seasonalImpact,
        description: `${request.attributes.seasonality} seasonal demand`
      });
    }

    // Supply/demand factor
    if (marketData.marketConditions) {
      const supplyDemandImpact = this.getSupplyDemandImpact(marketData.marketConditions);
      factors.push({
        name: 'Supply & Demand',
        impact: supplyDemandImpact,
        description: `Market supply: ${marketData.marketConditions.supply}, demand: ${marketData.marketConditions.demand}`
      });
    }

    // Competition factor
    const competitionImpact = this.getCompetitionImpact(marketData.competitors);
    factors.push({
      name: 'Competition',
      impact: competitionImpact,
      description: `${marketData.competitors.length} competitors in region`
    });

    // Perishability factor
    if (request.attributes.perishable) {
      factors.push({
        name: 'Perishability',
        impact: -0.1,
        description: 'Perishable goods discount'
      });
    }

    return factors;
  }

  /**
   * Apply pricing factors to base price
   */
  private applyPricingFactors(basePrice: number, factors: PricingFactor[]): number {
    let adjustedPrice = basePrice;
    
    factors.forEach(factor => {
      adjustedPrice *= (1 + factor.impact);
    });
    
    return Math.max(adjustedPrice, basePrice * 0.5); // Minimum 50% of base price
  }

  /**
   * Calculate price range for negotiation
   */
  private calculatePriceRange(suggestedPrice: number, factors: PricingFactor[]): { min: number; max: number } {
    // Calculate volatility based on factors
    const volatility = factors.reduce((sum, factor) => sum + Math.abs(factor.impact), 0) / factors.length;
    
    const rangePercent = Math.min(0.3, Math.max(0.1, volatility)); // 10-30% range
    
    return {
      min: suggestedPrice * (1 - rangePercent),
      max: suggestedPrice * (1 + rangePercent)
    };
  }

  /**
   * Determine market position relative to competitors
   */
  private determineMarketPosition(price: number, marketData: any): 'below' | 'at' | 'above' | 'premium' {
    if (marketData.competitors.length === 0) {
      return 'at';
    }

    const competitorPrices = marketData.competitors.map((c: any) => c.price);
    const avgCompetitorPrice = competitorPrices.reduce((sum: number, p: number) => sum + p, 0) / competitorPrices.length;
    
    const ratio = price / avgCompetitorPrice;
    
    if (ratio < 0.9) return 'below';
    if (ratio > 1.3) return 'premium';
    if (ratio > 1.1) return 'above';
    return 'at';
  }

  /**
   * Calculate confidence score for the recommendation
   */
  private calculateConfidence(marketData: any, _factors: PricingFactor[]): number {
    let confidence = 50; // Base confidence
    
    // Increase confidence based on data availability
    if (marketData.sampleSize > 10) confidence += 20;
    else if (marketData.sampleSize > 5) confidence += 10;
    
    // Increase confidence if market conditions are available
    if (marketData.marketConditions) confidence += 15;
    
    // Increase confidence based on competitor data
    if (marketData.competitors.length > 3) confidence += 15;
    else if (marketData.competitors.length > 0) confidence += 10;
    
    return Math.min(100, confidence);
  }

  // Helper methods
  private getFallbackPrice(request: PriceDiscoveryRequest): number {
    // Simple fallback pricing based on category and quality
    const basePrices: Record<string, number> = {
      'food': 10,
      'clothing': 25,
      'electronics': 100,
      'home': 50,
      'services': 30
    };
    
    const basePrice = basePrices[request.category] || 20;
    const qualityMultiplier = request.attributes.quality === 'premium' ? 2 : 
                             request.attributes.quality === 'standard' ? 1.5 : 1;
    
    return basePrice * qualityMultiplier;
  }

  private getQualityImpact(quality: string): number {
    switch (quality) {
      case 'premium': return 0.5;
      case 'standard': return 0.1;
      case 'basic': return -0.2;
      default: return 0;
    }
  }

  private getSeasonalImpact(seasonality: string, conditions: any): number {
    if (!conditions) return 0;
    
    switch (seasonality) {
      case 'high': return 0.2;
      case 'medium': return 0.1;
      case 'low': return -0.1;
      default: return 0;
    }
  }

  private getSupplyDemandImpact(conditions: MarketConditions): number {
    const demandMultiplier = conditions.demand === 'high' ? 0.2 : 
                            conditions.demand === 'medium' ? 0 : -0.1;
    const supplyMultiplier = conditions.supply === 'low' ? 0.15 : 
                            conditions.supply === 'medium' ? 0 : -0.1;
    
    return demandMultiplier + supplyMultiplier;
  }

  private getCompetitionImpact(competitors: any[]): number {
    if (competitors.length === 0) return 0.1; // Premium for no competition
    if (competitors.length > 5) return -0.15; // Discount for high competition
    return -0.05; // Small discount for moderate competition
  }

  private calculateRecencyWeight(timestamp: Date): number {
    const daysSince = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24);
    return Math.exp(-daysSince / 30); // Exponential decay over 30 days
  }

  private calculateQualityWeight(priceAttributes: ProductAttributes, requestAttributes: ProductAttributes): number {
    return priceAttributes.quality === requestAttributes.quality ? 1 : 0.5;
  }

  private getRegionFromLocation(location: any): string {
    return location.city || location.country || 'unknown';
  }

  private generateCacheKey(request: PriceDiscoveryRequest): string {
    const keyData = {
      productId: request.productId,
      category: request.category,
      quality: request.attributes.quality,
      region: this.getRegionFromLocation(request.vendorLocation)
    };
    
    return `${this.cachePrefix}${Buffer.from(JSON.stringify(keyData)).toString('base64')}`;
  }

  private async getCachedRecommendation(cacheKey: string): Promise<PriceRecommendation | null> {
    try {
      const redis = getRedisClient();
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached) as PriceRecommendation;
      }
      
      return null;
    } catch (error) {
      logger.warn('Cache retrieval failed:', error);
      return null;
    }
  }

  private async cacheRecommendation(cacheKey: string, recommendation: PriceRecommendation): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.setEx(cacheKey, this.cacheTTL, JSON.stringify(recommendation));
    } catch (error) {
      logger.warn('Cache storage failed:', error);
    }
  }

  private async invalidateCategoryCache(category: string): Promise<void> {
    try {
      const redis = getRedisClient();
      const pattern = `${this.cachePrefix}*${Buffer.from(category).toString('base64')}*`;
      const keys = await redis.keys(pattern);
      
      if (keys.length > 0) {
        await redis.del(keys);
        logger.info(`Invalidated ${keys.length} cache entries for category: ${category}`);
      }
    } catch (error) {
      logger.error('Failed to invalidate category cache:', error);
    }
  }
}

// Singleton instance
export const priceDiscoveryService = new PriceDiscoveryService();