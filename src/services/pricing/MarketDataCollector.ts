import { 
  MarketAnalytics,
  SeasonalData,
  Transaction,
  ProductAttributes,
  Location,
  MarketConditions
} from '../../types';
import { logger } from '../../utils/logger';
import { getRedisClient, getMongoDb } from '../../config/database';

/**
 * Market data collection and analysis service
 * Aggregates pricing data from various sources and provides market intelligence
 */
export class MarketDataCollector {
  private cachePrefix = 'market_data:';
  private cacheTTL = 1800; // 30 minutes for market data
  private collectionInterval = 300000; // 5 minutes
  private isCollecting = false;

  constructor() {
    this.startPeriodicCollection();
  }

  /**
   * Start periodic market data collection
   */
  private startPeriodicCollection(): void {
    setInterval(async () => {
      if (!this.isCollecting) {
        await this.collectAllMarketData();
      }
    }, this.collectionInterval);
  }

  /**
   * Collect comprehensive market data for all categories
   */
  public async collectAllMarketData(): Promise<void> {
    if (this.isCollecting) {
      logger.debug('Market data collection already in progress');
      return;
    }

    this.isCollecting = true;
    const startTime = Date.now();

    try {
      logger.info('Starting comprehensive market data collection');

      // Get all active categories
      const categories = await this.getActiveCategories();
      
      // Collect data for each category
      const collectionPromises = categories.map(category => 
        this.collectCategoryMarketData(category)
      );

      await Promise.allSettled(collectionPromises);

      // Update global market indicators
      await this.updateGlobalMarketIndicators();

      // Clean up old data
      await this.cleanupOldData();

      const processingTime = Date.now() - startTime;
      logger.info(`Market data collection completed in ${processingTime}ms for ${categories.length} categories`);

    } catch (error) {
      logger.error('Market data collection failed:', error);
    } finally {
      this.isCollecting = false;
    }
  }

  /**
   * Collect market data for a specific category
   */
  public async collectCategoryMarketData(category: string): Promise<MarketAnalytics> {
    try {
      logger.debug(`Collecting market data for category: ${category}`);

      const db = getMongoDb();
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      // Collect transaction data
      const transactions = await this.collectTransactionData(category, thirtyDaysAgo);
      
      // Collect competitor data
      const competitors = await this.collectCompetitorData(category);
      
      // Calculate price statistics
      const priceStats = this.calculatePriceStatistics(transactions);
      
      // Analyze seasonal trends
      const seasonalTrends = await this.analyzeSeasonalTrends(category, oneYearAgo);
      
      // Determine demand level
      const demandLevel = this.calculateDemandLevel(transactions, seasonalTrends);
      
      // Get regional data
      const regionalData = await this.collectRegionalData(category);

      const marketAnalytics: MarketAnalytics = {
        productCategory: category,
        region: 'global', // Will be refined with regional analysis
        averagePrice: priceStats.average,
        priceRange: {
          min: priceStats.min,
          max: priceStats.max
        },
        transactionVolume: transactions.length,
        seasonalTrends,
        competitorCount: competitors.length,
        demandLevel,
        lastUpdated: now
      };

      // Store in database
      await db.collection('market_analytics').updateOne(
        { productCategory: category, region: 'global' },
        { $set: marketAnalytics },
        { upsert: true }
      );

      // Cache the result
      await this.cacheMarketAnalytics(category, marketAnalytics);

      logger.debug(`Market data collected for ${category}: ${transactions.length} transactions, ${competitors.length} competitors`);
      
      return marketAnalytics;

    } catch (error) {
      logger.error(`Failed to collect market data for category ${category}:`, error);
      throw error;
    }
  }

  /**
   * Get market analytics for a category
   */
  public async getMarketAnalytics(category: string, region?: string): Promise<MarketAnalytics | null> {
    try {
      // Check cache first
      const cacheKey = `${this.cachePrefix}analytics:${category}:${region || 'global'}`;
      const cached = await this.getCachedData(cacheKey);
      if (cached) {
        return cached as MarketAnalytics;
      }

      // Get from database
      const db = getMongoDb();
      const analytics = await db.collection('market_analytics').findOne({
        productCategory: category,
        region: region || 'global'
      });

      if (analytics) {
        // Cache the result
        await this.cacheData(cacheKey, analytics);
        return analytics as MarketAnalytics;
      }

      // If not found, trigger collection
      logger.info(`Market analytics not found for ${category}, triggering collection`);
      return await this.collectCategoryMarketData(category);

    } catch (error) {
      logger.error(`Failed to get market analytics for ${category}:`, error);
      return null;
    }
  }

  /**
   * Update market conditions for a category
   */
  public async updateMarketConditions(category: string, conditions: MarketConditions): Promise<void> {
    try {
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

      // Invalidate related cache
      await this.invalidateCategoryCache(category);
      
      logger.info(`Market conditions updated for category: ${category}`);
    } catch (error) {
      logger.error('Failed to update market conditions:', error);
      throw error;
    }
  }

  /**
   * Collect external market data from APIs
   */
  public async collectExternalMarketData(): Promise<void> {
    try {
      logger.info('Collecting external market data');

      // Collect economic indicators
      await this.collectEconomicIndicators();
      
      // Collect competitor pricing data
      await this.collectCompetitorPricing();
      
      // Collect industry trends
      await this.collectIndustryTrends();

      logger.info('External market data collection completed');
    } catch (error) {
      logger.error('Failed to collect external market data:', error);
    }
  }

  /**
   * Analyze price trends for a category
   */
  public async analyzePriceTrends(category: string, timeframe: 'week' | 'month' | 'quarter' | 'year' = 'month'): Promise<any> {
    try {
      const db = getMongoDb();
      const timeframeDays = this.getTimeframeDays(timeframe);
      const startDate = new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000);

      const pipeline = [
        {
          $match: {
            category,
            completedAt: { $gte: startDate },
            status: 'completed'
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: timeframe === 'week' ? '%Y-%U' : 
                       timeframe === 'month' ? '%Y-%m' : 
                       timeframe === 'quarter' ? '%Y-Q%q' : '%Y',
                date: '$completedAt'
              }
            },
            averagePrice: { $avg: '$finalPrice' },
            minPrice: { $min: '$finalPrice' },
            maxPrice: { $max: '$finalPrice' },
            volume: { $sum: 1 },
            totalValue: { $sum: '$finalPrice' }
          }
        },
        {
          $sort: { '_id': 1 }
        }
      ];

      const trends = await db.collection('transactions').aggregate(pipeline).toArray();
      
      // Calculate trend direction and strength
      const trendAnalysis = this.calculateTrendAnalysis(trends);

      return {
        category,
        timeframe,
        trends,
        analysis: trendAnalysis,
        lastUpdated: new Date()
      };

    } catch (error) {
      logger.error(`Failed to analyze price trends for ${category}:`, error);
      return null;
    }
  }

  /**
   * Get competitive intelligence for a category
   */
  public async getCompetitiveIntelligence(category: string, region?: string): Promise<any> {
    try {
      const db = getMongoDb();
      
      const competitors = await db.collection('competitor_prices').find({
        category,
        ...(region && { region }),
        lastUpdated: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }).toArray();

      if (competitors.length === 0) {
        return {
          category,
          region: region || 'global',
          competitorCount: 0,
          priceAnalysis: null,
          marketShare: null,
          lastUpdated: new Date()
        };
      }

      // Analyze competitor pricing
      const prices = competitors.map(c => c.price);
      const priceAnalysis = {
        average: prices.reduce((sum, p) => sum + p, 0) / prices.length,
        min: Math.min(...prices),
        max: Math.max(...prices),
        median: this.calculateMedian(prices),
        standardDeviation: this.calculateStandardDeviation(prices)
      };

      // Calculate market share estimates
      const marketShare = this.calculateMarketShare(competitors);

      return {
        category,
        region: region || 'global',
        competitorCount: competitors.length,
        priceAnalysis,
        marketShare,
        competitors: competitors.map(c => ({
          name: c.name,
          price: c.price,
          marketPosition: this.determineMarketPosition(c.price, priceAnalysis.average),
          lastUpdated: c.lastUpdated
        })),
        lastUpdated: new Date()
      };

    } catch (error) {
      logger.error(`Failed to get competitive intelligence for ${category}:`, error);
      return null;
    }
  }

  // Private helper methods

  private async getActiveCategories(): Promise<string[]> {
    try {
      const db = getMongoDb();
      
      // Get categories from recent transactions
      const categories = await db.collection('transactions')
        .distinct('category', {
          completedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        });

      return categories.filter(cat => cat && typeof cat === 'string');
    } catch (error) {
      logger.error('Failed to get active categories:', error);
      return [];
    }
  }

  private async collectTransactionData(category: string, since: Date): Promise<Transaction[]> {
    try {
      const db = getMongoDb();
      
      return await db.collection('transactions')
        .find({
          category,
          status: 'completed',
          completedAt: { $gte: since }
        })
        .sort({ completedAt: -1 })
        .limit(1000)
        .toArray();
    } catch (error) {
      logger.error(`Failed to collect transaction data for ${category}:`, error);
      return [];
    }
  }

  private async collectCompetitorData(category: string): Promise<any[]> {
    try {
      const db = getMongoDb();
      
      return await db.collection('competitor_prices')
        .find({
          category,
          lastUpdated: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        })
        .toArray();
    } catch (error) {
      logger.error(`Failed to collect competitor data for ${category}:`, error);
      return [];
    }
  }

  private calculatePriceStatistics(transactions: Transaction[]): any {
    if (transactions.length === 0) {
      return { average: 0, min: 0, max: 0, median: 0, standardDeviation: 0 };
    }

    const prices = transactions.map(t => t.finalPrice);
    const sum = prices.reduce((total, price) => total + price, 0);
    const average = sum / prices.length;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const median = this.calculateMedian(prices);
    const standardDeviation = this.calculateStandardDeviation(prices);

    return { average, min, max, median, standardDeviation };
  }

  private async analyzeSeasonalTrends(category: string, since: Date): Promise<SeasonalData[]> {
    try {
      const db = getMongoDb();
      
      const pipeline = [
        {
          $match: {
            category,
            status: 'completed',
            completedAt: { $gte: since }
          }
        },
        {
          $addFields: {
            month: { $month: '$completedAt' },
            season: {
              $switch: {
                branches: [
                  { case: { $in: ['$month', [12, 1, 2]] }, then: 'winter' },
                  { case: { $in: ['$month', [3, 4, 5]] }, then: 'spring' },
                  { case: { $in: ['$month', [6, 7, 8]] }, then: 'summer' },
                  { case: { $in: ['$month', [9, 10, 11]] }, then: 'autumn' }
                ],
                default: 'unknown'
              }
            }
          }
        },
        {
          $group: {
            _id: '$season',
            averagePrice: { $avg: '$finalPrice' },
            volume: { $sum: 1 },
            prices: { $push: '$finalPrice' }
          }
        }
      ];

      const results = await db.collection('transactions').aggregate(pipeline).toArray();
      
      return results.map((result: any) => {
        const prices = result.prices;
        const variance = this.calculateVariance(prices);
        const trend = variance > result.averagePrice * 0.1 ? 'increasing' : 
                     variance < result.averagePrice * 0.05 ? 'decreasing' : 'stable';

        return {
          season: result._id,
          averagePrice: result.averagePrice,
          volume: result.volume,
          trend
        };
      });
    } catch (error) {
      logger.error(`Failed to analyze seasonal trends for ${category}:`, error);
      return [];
    }
  }

  private calculateDemandLevel(transactions: Transaction[], seasonalTrends: SeasonalData[]): 'low' | 'medium' | 'high' {
    if (transactions.length === 0) return 'low';

    // Calculate recent transaction volume
    const recentTransactions = transactions.filter(t => 
      new Date(t.completedAt!) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    const weeklyVolume = recentTransactions.length;
    const totalVolume = seasonalTrends.reduce((sum, trend) => sum + trend.volume, 0);
    const averageSeasonalVolume = totalVolume / Math.max(1, seasonalTrends.length);

    // Determine demand level based on recent activity vs seasonal average
    const demandRatio = weeklyVolume / Math.max(1, averageSeasonalVolume / 52); // Weekly average

    if (demandRatio > 1.5) return 'high';
    if (demandRatio > 0.8) return 'medium';
    return 'low';
  }

  private async collectRegionalData(category: string): Promise<any> {
    try {
      const db = getMongoDb();
      
      const pipeline = [
        {
          $match: {
            category,
            status: 'completed',
            completedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: '$region',
            averagePrice: { $avg: '$finalPrice' },
            volume: { $sum: 1 }
          }
        },
        {
          $sort: { volume: -1 }
        }
      ];

      return await db.collection('transactions').aggregate(pipeline).toArray();
    } catch (error) {
      logger.error(`Failed to collect regional data for ${category}:`, error);
      return [];
    }
  }

  private async updateGlobalMarketIndicators(): Promise<void> {
    try {
      const db = getMongoDb();
      
      // Calculate global market health indicators
      const totalTransactions = await db.collection('transactions').countDocuments({
        completedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        status: 'completed'
      });

      const averageTransactionValue = await db.collection('transactions').aggregate([
        {
          $match: {
            completedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            status: 'completed'
          }
        },
        {
          $group: {
            _id: null,
            averageValue: { $avg: '$finalPrice' }
          }
        }
      ]).toArray();

      const indicators = {
        totalTransactions,
        averageTransactionValue: averageTransactionValue[0]?.averageValue || 0,
        marketHealth: this.calculateMarketHealth(totalTransactions),
        lastUpdated: new Date()
      };

      await db.collection('global_market_indicators').updateOne(
        { _id: 'global' },
        { $set: indicators },
        { upsert: true }
      );

      logger.debug('Global market indicators updated');
    } catch (error) {
      logger.error('Failed to update global market indicators:', error);
    }
  }

  private async cleanupOldData(): Promise<void> {
    try {
      const db = getMongoDb();
      const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
      
      // Clean up old market analytics
      await db.collection('market_analytics').deleteMany({
        lastUpdated: { $lt: sixMonthsAgo }
      });

      // Clean up old competitor data
      await db.collection('competitor_prices').deleteMany({
        lastUpdated: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      });

      logger.debug('Old market data cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup old data:', error);
    }
  }

  private async collectEconomicIndicators(): Promise<void> {
    try {
      // In a real implementation, this would call external APIs
      // For now, we'll simulate with placeholder data
      const db = getMongoDb();
      
      const indicators = {
        inflationRate: 2.5,
        gdpGrowth: 3.2,
        unemploymentRate: 4.1,
        consumerConfidence: 85.3,
        region: 'global',
        date: new Date(),
        source: 'simulated'
      };

      await db.collection('economic_indicators').updateOne(
        { region: 'global', date: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        { $set: indicators },
        { upsert: true }
      );

      logger.debug('Economic indicators collected');
    } catch (error) {
      logger.error('Failed to collect economic indicators:', error);
    }
  }

  private async collectCompetitorPricing(): Promise<void> {
    try {
      // In a real implementation, this would scrape competitor websites or call APIs
      // For now, we'll simulate with placeholder data
      logger.debug('Competitor pricing collection simulated');
    } catch (error) {
      logger.error('Failed to collect competitor pricing:', error);
    }
  }

  private async collectIndustryTrends(): Promise<void> {
    try {
      // In a real implementation, this would analyze industry reports and news
      // For now, we'll simulate with placeholder data
      logger.debug('Industry trends collection simulated');
    } catch (error) {
      logger.error('Failed to collect industry trends:', error);
    }
  }

  private getTimeframeDays(timeframe: string): number {
    switch (timeframe) {
      case 'week': return 7;
      case 'month': return 30;
      case 'quarter': return 90;
      case 'year': return 365;
      default: return 30;
    }
  }

  private calculateTrendAnalysis(trends: any[]): any {
    if (trends.length < 2) {
      return { direction: 'stable', strength: 0, confidence: 'low' };
    }

    const prices = trends.map(t => t.averagePrice);
    const firstHalf = prices.slice(0, Math.floor(prices.length / 2));
    const secondHalf = prices.slice(Math.floor(prices.length / 2));

    const firstAvg = firstHalf.reduce((sum, p) => sum + p, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, p) => sum + p, 0) / secondHalf.length;

    const change = (secondAvg - firstAvg) / firstAvg;
    const strength = Math.abs(change);

    let direction = 'stable';
    if (change > 0.05) direction = 'increasing';
    else if (change < -0.05) direction = 'decreasing';

    let confidence = 'low';
    if (trends.length > 10) confidence = 'high';
    else if (trends.length > 5) confidence = 'medium';

    return { direction, strength, confidence, change };
  }

  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => (val - mean) ** 2);
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    
    return Math.sqrt(variance);
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => (val - mean) ** 2);
    
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateMarketShare(competitors: any[]): any {
    // Simplified market share calculation based on pricing position
    const totalCompetitors = competitors.length;
    if (totalCompetitors === 0) return null;

    const priceRanges = {
      budget: competitors.filter(c => c.priceCategory === 'budget').length,
      mid: competitors.filter(c => c.priceCategory === 'mid').length,
      premium: competitors.filter(c => c.priceCategory === 'premium').length
    };

    return {
      budget: (priceRanges.budget / totalCompetitors) * 100,
      mid: (priceRanges.mid / totalCompetitors) * 100,
      premium: (priceRanges.premium / totalCompetitors) * 100
    };
  }

  private determineMarketPosition(price: number, averagePrice: number): string {
    const ratio = price / averagePrice;
    
    if (ratio < 0.8) return 'budget';
    if (ratio > 1.3) return 'premium';
    return 'mid-market';
  }

  private calculateMarketHealth(transactionCount: number): 'poor' | 'fair' | 'good' | 'excellent' {
    if (transactionCount > 10000) return 'excellent';
    if (transactionCount > 5000) return 'good';
    if (transactionCount > 1000) return 'fair';
    return 'poor';
  }

  private async cacheMarketAnalytics(category: string, analytics: MarketAnalytics): Promise<void> {
    const cacheKey = `${this.cachePrefix}analytics:${category}:global`;
    await this.cacheData(cacheKey, analytics);
  }

  private async cacheData(key: string, data: any): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.setEx(key, this.cacheTTL, JSON.stringify(data));
    } catch (error) {
      logger.warn('Failed to cache data:', error);
    }
  }

  private async getCachedData(key: string): Promise<any | null> {
    try {
      const redis = getRedisClient();
      const cached = await redis.get(key);
      
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('Failed to get cached data:', error);
      return null;
    }
  }

  private async invalidateCategoryCache(category: string): Promise<void> {
    try {
      const redis = getRedisClient();
      const pattern = `${this.cachePrefix}*${category}*`;
      const keys = await redis.keys(pattern);
      
      if (keys.length > 0) {
        await redis.del(keys);
        logger.debug(`Invalidated ${keys.length} cache entries for category: ${category}`);
      }
    } catch (error) {
      logger.error('Failed to invalidate category cache:', error);
    }
  }
}

// Singleton instance
export const marketDataCollector = new MarketDataCollector();