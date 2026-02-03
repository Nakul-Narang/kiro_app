// Export all pricing services
export { PriceDiscoveryService, priceDiscoveryService } from './PriceDiscoveryService';
export { PriceAnalyzer, priceAnalyzer } from './PriceAnalyzer';
export { MarketDataCollector, marketDataCollector } from './MarketDataCollector';
export { SeasonalAnalysisEngine, seasonalAnalysisEngine } from './SeasonalAnalysisEngine';

// Enhanced pricing service that combines all components
import { PriceDiscoveryService } from './PriceDiscoveryService';
import { PriceAnalyzer } from './PriceAnalyzer';
import { MarketDataCollector } from './MarketDataCollector';
import { SeasonalAnalysisEngine } from './SeasonalAnalysisEngine';
import { 
  PriceDiscoveryRequest, 
  PriceRecommendation,
  MarketAnalytics,
  SeasonalData
} from '../../types';
import { logger } from '../../utils/logger';

/**
 * Enhanced pricing service that integrates ML analysis, market data collection,
 * and seasonal analysis for comprehensive price recommendations
 */
export class EnhancedPricingService {
  private priceDiscovery: PriceDiscoveryService;
  private priceAnalyzer: PriceAnalyzer;
  private marketDataCollector: MarketDataCollector;
  private seasonalAnalysisEngine: SeasonalAnalysisEngine;

  constructor() {
    this.priceDiscovery = new PriceDiscoveryService();
    this.priceAnalyzer = new PriceAnalyzer();
    this.marketDataCollector = new MarketDataCollector();
    this.seasonalAnalysisEngine = new SeasonalAnalysisEngine();
  }

  /**
   * Generate comprehensive price recommendation using all available analysis methods
   */
  public async generateComprehensivePriceRecommendation(
    request: PriceDiscoveryRequest
  ): Promise<PriceRecommendation> {
    try {
      logger.info(`Generating comprehensive price recommendation for product ${request.productId}`);

      // Run multiple analysis methods in parallel
      const [
        basicRecommendation,
        mlRecommendation,
        marketAnalytics,
        seasonalData
      ] = await Promise.allSettled([
        this.priceDiscovery.generatePriceRecommendation(request),
        this.priceAnalyzer.generateMLPriceRecommendation(request),
        this.marketDataCollector.getMarketAnalytics(request.category),
        this.seasonalAnalysisEngine.performSeasonalAnalysis(request.category, request.vendorLocation)
      ]);

      // Extract successful results
      const basic = basicRecommendation.status === 'fulfilled' ? basicRecommendation.value : null;
      const ml = mlRecommendation.status === 'fulfilled' ? mlRecommendation.value : null;
      const market = marketAnalytics.status === 'fulfilled' ? marketAnalytics.value : null;
      const seasonal = seasonalData.status === 'fulfilled' ? seasonalData.value : [];

      // Combine recommendations using weighted average
      const finalRecommendation = this.combineRecommendations(basic, ml, market, seasonal);

      logger.info(`Comprehensive price recommendation generated: $${finalRecommendation.suggestedPrice} with ${finalRecommendation.confidence}% confidence`);

      return finalRecommendation;

    } catch (error) {
      logger.error('Comprehensive price recommendation failed:', error);
      
      // Fallback to basic recommendation
      return await this.priceDiscovery.generatePriceRecommendation(request);
    }
  }

  /**
   * Get market analytics for a category
   */
  public async getMarketAnalytics(category: string, region?: string): Promise<MarketAnalytics | null> {
    return await this.marketDataCollector.getMarketAnalytics(category, region);
  }

  /**
   * Get seasonal analysis for a category
   */
  public async getSeasonalAnalysis(category: string, location?: any): Promise<SeasonalData[]> {
    return await this.seasonalAnalysisEngine.performSeasonalAnalysis(category, location);
  }

  /**
   * Get seasonal price multipliers
   */
  public async getSeasonalMultipliers(category: string, location?: any): Promise<any> {
    return await this.seasonalAnalysisEngine.getSeasonalMultipliers(category, location);
  }

  /**
   * Predict seasonal trends
   */
  public async predictSeasonalTrends(category: string, periodsAhead: number = 4, location?: any): Promise<any[]> {
    return await this.seasonalAnalysisEngine.predictSeasonalTrends(category, periodsAhead, location);
  }

  /**
   * Trigger market data collection
   */
  public async collectMarketData(): Promise<void> {
    await this.marketDataCollector.collectAllMarketData();
  }

  /**
   * Analyze price trends
   */
  public async analyzePriceTrends(
    category: string, 
    timeframe: 'week' | 'month' | 'quarter' | 'year' = 'month'
  ): Promise<any> {
    return await this.marketDataCollector.analyzePriceTrends(category, timeframe);
  }

  /**
   * Get competitive intelligence
   */
  public async getCompetitiveIntelligence(category: string, region?: string): Promise<any> {
    return await this.marketDataCollector.getCompetitiveIntelligence(category, region);
  }

  // Private helper methods

  private combineRecommendations(
    basic: PriceRecommendation | null,
    ml: PriceRecommendation | null,
    market: MarketAnalytics | null,
    seasonal: SeasonalData[]
  ): PriceRecommendation {
    // If no recommendations available, return default
    if (!basic && !ml) {
      return {
        suggestedPrice: 10,
        priceRange: { min: 8, max: 12 },
        confidence: 30,
        factors: [],
        marketPosition: 'at',
        lastUpdated: new Date()
      };
    }

    // Use ML recommendation if available and confident, otherwise use basic
    const primaryRecommendation = (ml && ml.confidence > 60) ? ml : basic!;
    
    // Calculate weighted average if both are available
    let finalPrice = primaryRecommendation.suggestedPrice;
    let finalConfidence = primaryRecommendation.confidence;

    if (basic && ml) {
      const basicWeight = basic.confidence / 100;
      const mlWeight = ml.confidence / 100;
      const totalWeight = basicWeight + mlWeight;

      if (totalWeight > 0) {
        finalPrice = (basic.suggestedPrice * basicWeight + ml.suggestedPrice * mlWeight) / totalWeight;
        finalConfidence = Math.min(95, (basic.confidence + ml.confidence) / 2 + 10); // Bonus for having both
      }
    }

    // Apply seasonal adjustments if available
    if (seasonal.length > 0) {
      const currentSeason = this.getCurrentSeason();
      const seasonalData = seasonal.find(s => s.season === currentSeason);
      
      if (seasonalData && (seasonalData as any).seasonalIndex) {
        const seasonalMultiplier = (seasonalData as any).seasonalIndex;
        finalPrice *= seasonalMultiplier;
        
        // Add seasonal factor
        primaryRecommendation.factors.push({
          name: 'Seasonal Adjustment',
          impact: seasonalMultiplier - 1,
          description: `${currentSeason} seasonal multiplier: ${seasonalMultiplier.toFixed(2)}`
        });
      }
    }

    // Apply market position adjustments if market data is available
    if (market) {
      const marketMultiplier = this.calculateMarketPositionMultiplier(finalPrice, market);
      finalPrice *= marketMultiplier;
      
      if (marketMultiplier !== 1.0) {
        primaryRecommendation.factors.push({
          name: 'Market Position',
          impact: marketMultiplier - 1,
          description: `Market adjustment based on ${market.competitorCount} competitors`
        });
      }
    }

    // Calculate final price range
    const rangePercent = Math.max(0.1, Math.min(0.3, (100 - finalConfidence) / 200));
    const priceRange = {
      min: finalPrice * (1 - rangePercent),
      max: finalPrice * (1 + rangePercent)
    };

    return {
      suggestedPrice: Math.round(finalPrice * 100) / 100,
      priceRange: {
        min: Math.round(priceRange.min * 100) / 100,
        max: Math.round(priceRange.max * 100) / 100
      },
      confidence: Math.round(finalConfidence),
      factors: primaryRecommendation.factors,
      marketPosition: primaryRecommendation.marketPosition,
      lastUpdated: new Date()
    };
  }

  private getCurrentSeason(): string {
    const month = new Date().getMonth() + 1;
    if (month >= 12 || month <= 2) return 'winter';
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    return 'autumn';
  }

  private calculateMarketPositionMultiplier(price: number, market: MarketAnalytics): number {
    if (market.competitorCount === 0) return 1.0;

    const ratio = price / market.averagePrice;
    
    // Adjust based on market position
    if (ratio > 1.3) return 0.95; // Premium pricing, slight discount
    if (ratio < 0.8) return 1.05; // Below market, slight premium
    
    return 1.0; // At market price
  }
}

// Singleton instance
export const enhancedPricingService = new EnhancedPricingService();