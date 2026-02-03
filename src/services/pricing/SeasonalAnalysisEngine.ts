
import { 
  SeasonalData,
  Transaction,
  MarketConditions,
  Location
} from '../../types';
import { logger } from '../../utils/logger';
import { getRedisClient, getMongoDb } from '../../config/database';

/**
 * Seasonal analysis engine for pricing patterns and trend forecasting
 * Provides advanced seasonal insights and predictive analytics
 */
export class SeasonalAnalysisEngine {
  private cachePrefix = 'seasonal:';
  private cacheTTL = 3600; // 1 hour for seasonal data
  private analysisWindow = 3; // 3 years of historical data

  /**
   * Perform comprehensive seasonal analysis for a category
   */
  public async performSeasonalAnalysis(
    category: string, 
    location?: Location,
    timeframe: 'monthly' | 'quarterly' | 'seasonal' = 'seasonal'
  ): Promise<SeasonalData[]> {
    try {
      logger.info(`Performing seasonal analysis for category: ${category}`);

      // Check cache first
      const cacheKey = this.generateCacheKey(category, location, timeframe);
      const cached = await this.getCachedAnalysis(cacheKey);
      if (cached) {
        logger.debug(`Cache hit for seasonal analysis: ${category}`);
        return cached;
      }

      // Collect historical data
      const historicalData = await this.collectHistoricalData(category, location);
      
      // Perform seasonal decomposition
      const seasonalPatterns = await this.decomposeSeasonalPatterns(historicalData, timeframe);
      
      // Calculate seasonal indices
      const seasonalIndices = this.calculateSeasonalIndices(seasonalPatterns);
      
      // Detect anomalies and outliers
      const anomalies = this.detectSeasonalAnomalies(seasonalPatterns);
      
      // Generate forecasts
      const forecasts = await this.generateSeasonalForecasts(seasonalPatterns, seasonalIndices);
      
      // Create seasonal data with enhanced insights
      const seasonalData = this.createEnhancedSeasonalData(
        seasonalPatterns, 
        seasonalIndices, 
        anomalies, 
        forecasts
      );

      // Cache the results
      await this.cacheAnalysis(cacheKey, seasonalData);
      
      logger.info(`Seasonal analysis completed for ${category}: ${seasonalData.length} periods analyzed`);
      
      return seasonalData;

    } catch (error) {
      logger.error(`Seasonal analysis failed for category ${category}:`, error);
      return [];
    }
  }

  /**
   * Get seasonal price multipliers for current period
   */
  public async getSeasonalMultipliers(category: string, location?: Location): Promise<any> {
    try {
      const seasonalData = await this.performSeasonalAnalysis(category, location);
      const currentSeason = this.getCurrentSeason();
      const currentMonth = new Date().getMonth() + 1;
      
      // Find current season data
      const currentSeasonData = seasonalData.find(data => data.season === currentSeason);
      
      if (!currentSeasonData) {
        return {
          seasonal: 1.0,
          monthly: 1.0,
          trend: 1.0,
          confidence: 0.3
        };
      }

      // Calculate multipliers
      const seasonalMultiplier = this.calculateSeasonalMultiplier(currentSeasonData);
      const monthlyMultiplier = await this.getMonthlyMultiplier(category, currentMonth, location);
      const trendMultiplier = await this.getTrendMultiplier(category, location);
      
      return {
        seasonal: seasonalMultiplier,
        monthly: monthlyMultiplier,
        trend: trendMultiplier,
        confidence: this.calculateMultiplierConfidence(seasonalData),
        season: currentSeason,
        month: currentMonth
      };

    } catch (error) {
      logger.error(`Failed to get seasonal multipliers for ${category}:`, error);
      return { seasonal: 1.0, monthly: 1.0, trend: 1.0, confidence: 0.3 };
    }
  }

  /**
   * Predict seasonal price trends for upcoming periods
   */
  public async predictSeasonalTrends(
    category: string, 
    periodsAhead: number = 4,
    location?: Location
  ): Promise<any[]> {
    try {
      const seasonalData = await this.performSeasonalAnalysis(category, location);
      const historicalData = await this.collectHistoricalData(category, location);
      
      if (seasonalData.length === 0 || historicalData.length === 0) {
        return [];
      }

      const predictions = [];
      const currentDate = new Date();
      
      for (let i = 1; i <= periodsAhead; i++) {
        const futureDate = new Date(currentDate);
        futureDate.setMonth(futureDate.getMonth() + (i * 3)); // Quarterly predictions
        
        const futureSeason = this.getSeasonForDate(futureDate);
        const seasonalPattern = seasonalData.find(data => data.season === futureSeason);
        
        if (seasonalPattern) {
          const prediction = await this.generatePeriodPrediction(
            seasonalPattern,
            historicalData,
            futureDate,
            i
          );
          
          predictions.push({
            period: i,
            date: futureDate,
            season: futureSeason,
            predictedPrice: prediction.price,
            confidence: prediction.confidence,
            priceRange: prediction.range,
            factors: prediction.factors
          });
        }
      }
      
      return predictions;

    } catch (error) {
      logger.error(`Failed to predict seasonal trends for ${category}:`, error);
      return [];
    }
  }

  /**
   * Analyze seasonal demand patterns
   */
  public async analyzeSeasonalDemand(category: string, location?: Location): Promise<any> {
    try {
      const db = getMongoDb();
      const region = location ? this.getRegionFromLocation(location) : 'global';
      
      // Get transaction volume by season over multiple years
      const pipeline = [
        {
          $match: {
            category,
            ...(region !== 'global' && { region }),
            status: 'completed',
            completedAt: { 
              $gte: new Date(Date.now() - this.analysisWindow * 365 * 24 * 60 * 60 * 1000) 
            }
          }
        },
        {
          $addFields: {
            year: { $year: '$completedAt' },
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
            _id: { season: '$season', year: '$year' },
            volume: { $sum: 1 },
            totalValue: { $sum: '$finalPrice' },
            averagePrice: { $avg: '$finalPrice' }
          }
        },
        {
          $group: {
            _id: '$_id.season',
            yearlyData: {
              $push: {
                year: '$_id.year',
                volume: '$volume',
                totalValue: '$totalValue',
                averagePrice: '$averagePrice'
              }
            },
            averageVolume: { $avg: '$volume' },
            totalVolume: { $sum: '$volume' }
          }
        }
      ];

      const demandData = await db.collection('transactions').aggregate(pipeline).toArray();
      
      // Calculate demand patterns and growth rates
      const demandAnalysis = demandData.map((season: any) => {
        const growthRate = this.calculateGrowthRate(season.yearlyData);
        const volatility = this.calculateDemandVolatility(season.yearlyData);
        const trend = this.determineDemandTrend(season.yearlyData);
        
        return {
          season: season._id,
          averageVolume: season.averageVolume,
          totalVolume: season.totalVolume,
          growthRate,
          volatility,
          trend,
          yearlyData: season.yearlyData
        };
      });

      return {
        category,
        region,
        demandPatterns: demandAnalysis,
        peakSeason: this.identifyPeakSeason(demandAnalysis),
        lowSeason: this.identifyLowSeason(demandAnalysis),
        demandStability: this.calculateDemandStability(demandAnalysis),
        lastUpdated: new Date()
      };

    } catch (error) {
      logger.error(`Failed to analyze seasonal demand for ${category}:`, error);
      return null;
    }
  }

  // Private helper methods

  private async collectHistoricalData(category: string, location?: Location): Promise<Transaction[]> {
    try {
      const db = getMongoDb();
      const region = location ? this.getRegionFromLocation(location) : null;
      
      const query: any = {
        category,
        status: 'completed',
        completedAt: { 
          $gte: new Date(Date.now() - this.analysisWindow * 365 * 24 * 60 * 60 * 1000) 
        }
      };

      if (region) {
        query.region = region;
      }

      return await db.collection('transactions')
        .find(query)
        .sort({ completedAt: 1 })
        .limit(10000)
        .toArray();

    } catch (error) {
      logger.error(`Failed to collect historical data for ${category}:`, error);
      return [];
    }
  }

  private async decomposeSeasonalPatterns(data: Transaction[], timeframe: string): Promise<any[]> {
    if (data.length === 0) return [];

    // Group data by time periods
    const groupedData = this.groupDataByTimeframe(data, timeframe);
    
    // Calculate seasonal components
    const seasonalComponents = groupedData.map(group => {
      const prices = group.transactions.map((t: Transaction) => t.finalPrice);
      const volumes = group.transactions.length;
      
      return {
        period: group.period,
        season: group.season,
        averagePrice: prices.reduce((sum, p) => sum + p, 0) / prices.length,
        volume: volumes,
        priceVariance: this.calculateVariance(prices),
        transactions: group.transactions
      };
    });

    return seasonalComponents;
  }

  private groupDataByTimeframe(data: Transaction[], timeframe: string): any[] {
    const groups: { [key: string]: Transaction[] } = {};

    data.forEach(transaction => {
      const date = new Date(transaction.completedAt!);
      let key: string;
      let season: string;

      switch (timeframe) {
        case 'monthly':
          key = `${date.getFullYear()}-${date.getMonth() + 1}`;
          season = this.getMonthName(date.getMonth());
          break;
        case 'quarterly':
          const quarter = Math.floor(date.getMonth() / 3) + 1;
          key = `${date.getFullYear()}-Q${quarter}`;
          season = `Q${quarter}`;
          break;
        case 'seasonal':
        default:
          key = `${date.getFullYear()}-${this.getSeasonForDate(date)}`;
          season = this.getSeasonForDate(date);
          break;
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(transaction);
    });

    return Object.entries(groups).map(([period, transactions]) => ({
      period,
      season: period.split('-')[1],
      transactions
    }));
  }

  private calculateSeasonalIndices(patterns: any[]): any {
    if (patterns.length === 0) return {};

    const overallAverage = patterns.reduce((sum, p) => sum + p.averagePrice, 0) / patterns.length;
    const indices: { [key: string]: number } = {};

    // Group by season and calculate average index
    const seasonGroups: { [key: string]: number[] } = {};
    
    patterns.forEach(pattern => {
      if (!seasonGroups[pattern.season]) {
        seasonGroups[pattern.season] = [];
      }
      seasonGroups[pattern.season].push(pattern.averagePrice / overallAverage);
    });

    // Calculate average index for each season
    Object.entries(seasonGroups).forEach(([season, values]) => {
      indices[season] = values.reduce((sum, v) => sum + v, 0) / values.length;
    });

    return indices;
  }

  private detectSeasonalAnomalies(patterns: any[]): any[] {
    const anomalies: any[] = [];
    
    if (patterns.length < 4) return anomalies;

    // Calculate z-scores for price and volume
    const prices = patterns.map(p => p.averagePrice);
    const volumes = patterns.map(p => p.volume);
    
    const priceStats = this.calculateStatistics(prices);
    const volumeStats = this.calculateStatistics(volumes);

    patterns.forEach((pattern, index) => {
      const priceZScore = Math.abs((pattern.averagePrice - priceStats.mean) / priceStats.stdDev);
      const volumeZScore = Math.abs((pattern.volume - volumeStats.mean) / volumeStats.stdDev);
      
      if (priceZScore > 2 || volumeZScore > 2) {
        anomalies.push({
          period: pattern.period,
          season: pattern.season,
          type: priceZScore > 2 ? 'price' : 'volume',
          severity: Math.max(priceZScore, volumeZScore) > 3 ? 'high' : 'medium',
          value: priceZScore > 2 ? pattern.averagePrice : pattern.volume,
          zScore: Math.max(priceZScore, volumeZScore)
        });
      }
    });

    return anomalies;
  }

  private async generateSeasonalForecasts(patterns: any[], indices: any): Promise<any[]> {
    const forecasts: any[] = [];
    
    if (patterns.length === 0) return forecasts;

    // Calculate trend component
    const trend = this.calculateTrendComponent(patterns);
    
    // Generate forecasts for each season
    Object.entries(indices).forEach(([season, index]) => {
      const seasonalIndex = index as number;
      const basePrice = patterns[patterns.length - 1]?.averagePrice || 0;
      
      const forecast = {
        season,
        forecastPrice: basePrice * seasonalIndex * (1 + trend),
        confidence: this.calculateForecastConfidence(patterns, season),
        seasonalIndex,
        trend
      };
      
      forecasts.push(forecast);
    });

    return forecasts;
  }

  private createEnhancedSeasonalData(
    patterns: any[], 
    indices: any, 
    anomalies: any[], 
    forecasts: any[]
  ): SeasonalData[] {
    const seasonalData: SeasonalData[] = [];
    
    // Group patterns by season
    const seasonGroups: { [key: string]: any[] } = {};
    patterns.forEach(pattern => {
      if (!seasonGroups[pattern.season]) {
        seasonGroups[pattern.season] = [];
      }
      seasonGroups[pattern.season].push(pattern);
    });

    // Create enhanced seasonal data
    Object.entries(seasonGroups).forEach(([season, seasonPatterns]) => {
      const averagePrice = seasonPatterns.reduce((sum, p) => sum + p.averagePrice, 0) / seasonPatterns.length;
      const totalVolume = seasonPatterns.reduce((sum, p) => sum + p.volume, 0);
      
      // Determine trend
      const prices = seasonPatterns.map(p => p.averagePrice);
      const trend = this.determineTrend(prices);
      
      // Find forecast for this season
      const forecast = forecasts.find(f => f.season === season);
      
      seasonalData.push({
        season,
        averagePrice,
        volume: totalVolume,
        trend,
        seasonalIndex: indices[season] || 1.0,
        forecast: forecast?.forecastPrice,
        confidence: forecast?.confidence || 0.5,
        anomalies: anomalies.filter(a => a.season === season)
      } as SeasonalData);
    });

    return seasonalData;
  }

  private calculateSeasonalMultiplier(seasonData: SeasonalData): number {
    return (seasonData as any).seasonalIndex || 1.0;
  }

  private async getMonthlyMultiplier(category: string, month: number, location?: Location): Promise<number> {
    try {
      const db = getMongoDb();
      const region = location ? this.getRegionFromLocation(location) : null;
      
      const query: any = {
        category,
        status: 'completed',
        $expr: { $eq: [{ $month: '$completedAt' }, month] }
      };

      if (region) {
        query.region = region;
      }

      const monthlyData = await db.collection('transactions')
        .find(query)
        .limit(1000)
        .toArray();

      if (monthlyData.length === 0) return 1.0;

      const monthlyAverage = monthlyData.reduce((sum, t) => sum + t.finalPrice, 0) / monthlyData.length;
      
      // Get overall average for comparison
      const overallData = await db.collection('transactions')
        .find({ category, status: 'completed' })
        .limit(1000)
        .toArray();

      if (overallData.length === 0) return 1.0;

      const overallAverage = overallData.reduce((sum, t) => sum + t.finalPrice, 0) / overallData.length;
      
      return monthlyAverage / overallAverage;

    } catch (error) {
      logger.error(`Failed to get monthly multiplier for ${category}:`, error);
      return 1.0;
    }
  }

  private async getTrendMultiplier(category: string, location?: Location): Promise<number> {
    try {
      const historicalData = await this.collectHistoricalData(category, location);
      
      if (historicalData.length < 10) return 1.0;

      // Calculate 6-month trend
      const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
      const recentData = historicalData.filter(t => new Date(t.completedAt!) > sixMonthsAgo);
      const olderData = historicalData.filter(t => new Date(t.completedAt!) <= sixMonthsAgo);

      if (recentData.length === 0 || olderData.length === 0) return 1.0;

      const recentAverage = recentData.reduce((sum, t) => sum + t.finalPrice, 0) / recentData.length;
      const olderAverage = olderData.reduce((sum, t) => sum + t.finalPrice, 0) / olderData.length;

      return recentAverage / olderAverage;

    } catch (error) {
      logger.error(`Failed to get trend multiplier for ${category}:`, error);
      return 1.0;
    }
  }

  private calculateMultiplierConfidence(seasonalData: SeasonalData[]): number {
    if (seasonalData.length === 0) return 0.3;
    
    const avgConfidence = seasonalData.reduce((sum, data) => sum + ((data as any).confidence || 0.5), 0) / seasonalData.length;
    return Math.min(0.95, Math.max(0.3, avgConfidence));
  }

  private async generatePeriodPrediction(
    seasonalPattern: SeasonalData,
    historicalData: Transaction[],
    futureDate: Date,
    periodsAhead: number
  ): Promise<any> {
    const basePrice = seasonalPattern.averagePrice;
    const seasonalMultiplier = (seasonalPattern as any).seasonalIndex || 1.0;
    
    // Apply trend decay (predictions become less certain further out)
    const trendDecay = Math.pow(0.9, periodsAhead - 1);
    const trendMultiplier = seasonalPattern.trend === 'increasing' ? 1.05 : 
                           seasonalPattern.trend === 'decreasing' ? 0.95 : 1.0;
    
    const predictedPrice = basePrice * seasonalMultiplier * (trendMultiplier * trendDecay);
    
    // Calculate confidence (decreases with distance)
    const baseConfidence = (seasonalPattern as any).confidence || 0.5;
    const confidence = baseConfidence * Math.pow(0.85, periodsAhead - 1);
    
    // Calculate price range
    const uncertainty = (1 - confidence) * 0.3;
    const range = {
      min: predictedPrice * (1 - uncertainty),
      max: predictedPrice * (1 + uncertainty)
    };

    return {
      price: predictedPrice,
      confidence,
      range,
      factors: {
        seasonal: seasonalMultiplier,
        trend: trendMultiplier * trendDecay,
        base: basePrice
      }
    };
  }

  // Utility methods

  private getCurrentSeason(): string {
    const month = new Date().getMonth() + 1;
    if (month >= 12 || month <= 2) return 'winter';
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    return 'autumn';
  }

  private getSeasonForDate(date: Date): string {
    const month = date.getMonth() + 1;
    if (month >= 12 || month <= 2) return 'winter';
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    return 'autumn';
  }

  private getMonthName(monthIndex: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthIndex] || 'Unknown';
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => (val - mean) ** 2);
    
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateStatistics(values: number[]): any {
    if (values.length === 0) return { mean: 0, stdDev: 0 };
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = this.calculateVariance(values);
    const stdDev = Math.sqrt(variance);
    
    return { mean, stdDev, variance };
  }

  private calculateTrendComponent(patterns: any[]): number {
    if (patterns.length < 2) return 0;
    
    const prices = patterns.map(p => p.averagePrice);
    const firstHalf = prices.slice(0, Math.floor(prices.length / 2));
    const secondHalf = prices.slice(Math.floor(prices.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, p) => sum + p, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, p) => sum + p, 0) / secondHalf.length;
    
    return (secondAvg - firstAvg) / firstAvg;
  }

  private calculateForecastConfidence(patterns: any[], season: string): number {
    const seasonPatterns = patterns.filter(p => p.season === season);
    
    if (seasonPatterns.length === 0) return 0.3;
    if (seasonPatterns.length === 1) return 0.5;
    
    // Calculate consistency of seasonal patterns
    const prices = seasonPatterns.map(p => p.averagePrice);
    const variance = this.calculateVariance(prices);
    const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const cv = Math.sqrt(variance) / mean; // Coefficient of variation
    
    // Higher consistency = higher confidence
    const confidence = Math.max(0.3, Math.min(0.9, 1 - cv));
    
    return confidence;
  }

  private determineTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable';
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, v) => sum + v, 0) / secondHalf.length;
    
    const change = (secondAvg - firstAvg) / firstAvg;
    
    if (change > 0.05) return 'increasing';
    if (change < -0.05) return 'decreasing';
    return 'stable';
  }

  private calculateGrowthRate(yearlyData: any[]): number {
    if (yearlyData.length < 2) return 0;
    
    const sortedData = yearlyData.sort((a, b) => a.year - b.year);
    const firstYear = sortedData[0];
    const lastYear = sortedData[sortedData.length - 1];
    
    const years = lastYear.year - firstYear.year;
    if (years === 0) return 0;
    
    return Math.pow(lastYear.volume / firstYear.volume, 1 / years) - 1;
  }

  private calculateDemandVolatility(yearlyData: any[]): number {
    if (yearlyData.length === 0) return 0;
    
    const volumes = yearlyData.map(d => d.volume);
    const mean = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    const variance = this.calculateVariance(volumes);
    
    return Math.sqrt(variance) / mean; // Coefficient of variation
  }

  private determineDemandTrend(yearlyData: any[]): 'increasing' | 'decreasing' | 'stable' {
    if (yearlyData.length < 2) return 'stable';
    
    const sortedData = yearlyData.sort((a, b) => a.year - b.year);
    const volumes = sortedData.map(d => d.volume);
    
    return this.determineTrend(volumes);
  }

  private identifyPeakSeason(demandAnalysis: any[]): string {
    if (demandAnalysis.length === 0) return 'unknown';
    
    return demandAnalysis.reduce((peak, current) => 
      current.averageVolume > peak.averageVolume ? current : peak
    ).season;
  }

  private identifyLowSeason(demandAnalysis: any[]): string {
    if (demandAnalysis.length === 0) return 'unknown';
    
    return demandAnalysis.reduce((low, current) => 
      current.averageVolume < low.averageVolume ? current : low
    ).season;
  }

  private calculateDemandStability(demandAnalysis: any[]): 'stable' | 'volatile' | 'highly_volatile' {
    if (demandAnalysis.length === 0) return 'stable';
    
    const avgVolatility = demandAnalysis.reduce((sum, d) => sum + d.volatility, 0) / demandAnalysis.length;
    
    if (avgVolatility > 0.5) return 'highly_volatile';
    if (avgVolatility > 0.2) return 'volatile';
    return 'stable';
  }

  private getRegionFromLocation(location: Location): string {
    return location.city || location.country || 'unknown';
  }

  private generateCacheKey(category: string, location?: Location, timeframe?: string): string {
    const keyData = {
      category,
      region: location ? this.getRegionFromLocation(location) : 'global',
      timeframe: timeframe || 'seasonal'
    };
    
    return `${this.cachePrefix}${Buffer.from(JSON.stringify(keyData)).toString('base64')}`;
  }

  private async getCachedAnalysis(cacheKey: string): Promise<SeasonalData[] | null> {
    try {
      const redis = getRedisClient();
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached) as SeasonalData[];
      }
      
      return null;
    } catch (error) {
      logger.warn('Seasonal analysis cache retrieval failed:', error);
      return null;
    }
  }

  private async cacheAnalysis(cacheKey: string, data: SeasonalData[]): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.setEx(cacheKey, this.cacheTTL, JSON.stringify(data));
    } catch (error) {
      logger.warn('Seasonal analysis cache storage failed:', error);
    }
  }
}

// Singleton instance
export const seasonalAnalysisEngine = new SeasonalAnalysisEngine();