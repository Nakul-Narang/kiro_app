import { 
  PriceDiscoveryRequest, 
  PriceRecommendation, 
  PricingFactor, 
  MarketConditions,
  ProductAttributes,
  MarketAnalytics,
  SeasonalData,
  Transaction
} from '../../types';
import { logger } from '../../utils/logger';
import { getRedisClient, getMongoDb } from '../../config/database';

/**
 * Advanced price analysis engine with machine learning integration
 * Provides intelligent pricing recommendations based on market data, trends, and ML models
 */
export class PriceAnalyzer {
  private cachePrefix = 'ml_price:';
  private cacheTTL = 600; // 10 minutes for ML predictions
  private modelCachePrefix = 'ml_model:';
  private modelCacheTTL = 3600; // 1 hour for model parameters

  /**
   * Generate advanced price recommendation using ML models
   */
  public async generateMLPriceRecommendation(request: PriceDiscoveryRequest): Promise<PriceRecommendation> {
    const startTime = Date.now();
    
    try {
      logger.info(`Generating ML price recommendation for product ${request.productId} in category ${request.category}`);
      
      // Check cache first
      const cacheKey = this.generateMLCacheKey(request);
      const cached = await this.getCachedMLRecommendation(cacheKey);
      if (cached) {
        logger.debug(`ML cache hit for price recommendation: ${request.productId}`);
        return cached;
      }

      // Collect comprehensive market data
      const marketData = await this.collectMarketData(request);
      
      // Perform seasonal and trend analysis
      const seasonalAnalysis = await this.performSeasonalAnalysis(request.category, request.vendorLocation);
      const trendAnalysis = await this.performTrendAnalysis(request.category, marketData);
      
      // Generate ML-based price prediction
      const mlPrediction = await this.generateMLPrediction(request, marketData, seasonalAnalysis, trendAnalysis);
      
      // Calculate advanced pricing factors
      const factors = await this.calculateAdvancedPricingFactors(request, marketData, seasonalAnalysis, trendAnalysis);
      
      // Apply ML adjustments
      const adjustedPrice = this.applyMLAdjustments(mlPrediction.basePrice, factors, mlPrediction.confidence);
      
      // Calculate dynamic price range
      const priceRange = this.calculateDynamicPriceRange(adjustedPrice, factors, mlPrediction.volatility);
      
      // Determine market position with ML insights
      const marketPosition = this.determineMLMarketPosition(adjustedPrice, marketData, mlPrediction);
      
      // Calculate comprehensive confidence score
      const confidence = this.calculateMLConfidence(marketData, factors, mlPrediction, seasonalAnalysis);
      
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

      // Cache the ML recommendation
      await this.cacheMLRecommendation(cacheKey, recommendation);
      
      const processingTime = Date.now() - startTime;
      logger.info(`ML price recommendation generated in ${processingTime}ms with confidence ${confidence}%`);
      
      return recommendation;
      
    } catch (error) {
      logger.error('ML price recommendation generation failed:', error);
      throw error;
    }
  }

  /**
   * Collect comprehensive market data for ML analysis
   */
  private async collectMarketData(request: PriceDiscoveryRequest): Promise<any> {
    try {
      const db = getMongoDb();
      
      // Get extended historical pricing data (last 2 years)
      const historicalPrices = await db.collection('price_history')
        .find({ 
          category: request.category,
          timestamp: { $gte: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000) }
        })
        .sort({ timestamp: -1 })
        .limit(1000)
        .toArray();

      // Get transaction data for demand analysis
      const transactions = await db.collection('transactions')
        .find({ 
          category: request.category,
          status: 'completed',
          completedAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
        })
        .sort({ completedAt: -1 })
        .limit(500)
        .toArray();

      // Get competitor analysis data
      const competitors = await db.collection('competitor_prices')
        .find({ 
          category: request.category,
          region: this.getRegionFromLocation(request.vendorLocation),
          lastUpdated: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        })
        .toArray();

      // Get market conditions and economic indicators
      const marketConditions = await db.collection('market_conditions')
        .findOne({ category: request.category });

      // Get regional economic data
      const economicData = await db.collection('economic_indicators')
        .findOne({ 
          region: this.getRegionFromLocation(request.vendorLocation),
          date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        });

      return {
        historicalPrices,
        transactions,
        competitors,
        marketConditions: marketConditions || request.marketConditions,
        economicData,
        sampleSize: historicalPrices.length,
        transactionVolume: transactions.length
      };
    } catch (error) {
      logger.error('Failed to collect market data:', error);
      return {
        historicalPrices: [],
        transactions: [],
        competitors: [],
        marketConditions: request.marketConditions,
        economicData: null,
        sampleSize: 0,
        transactionVolume: 0
      };
    }
  }

  /**
   * Perform seasonal analysis for pricing patterns
   */
  private async performSeasonalAnalysis(category: string, location: any): Promise<SeasonalData[]> {
    try {
      const db = getMongoDb();
      const region = this.getRegionFromLocation(location);
      
      // Get seasonal pricing data for the last 3 years
      const seasonalData = await db.collection('seasonal_analytics')
        .find({ 
          category,
          region,
          year: { $gte: new Date().getFullYear() - 3 }
        })
        .toArray();

      if (seasonalData.length === 0) {
        // Generate seasonal analysis from historical data
        return await this.generateSeasonalAnalysis(category, region);
      }

      return seasonalData.map((data: any) => ({
        season: data.season,
        averagePrice: data.averagePrice,
        volume: data.volume,
        trend: data.trend
      }));
    } catch (error) {
      logger.error('Failed to perform seasonal analysis:', error);
      return [];
    }
  }

  /**
   * Generate seasonal analysis from historical transaction data
   */
  private async generateSeasonalAnalysis(category: string, region: string): Promise<SeasonalData[]> {
    try {
      const db = getMongoDb();
      
      // Aggregate seasonal data from transactions
      const pipeline = [
        {
          $match: {
            category,
            region,
            completedAt: { $gte: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000) },
            status: 'completed'
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
        // Calculate trend based on price variance
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
      logger.error('Failed to generate seasonal analysis:', error);
      return [];
    }
  }

  /**
   * Perform trend analysis using time series data
   */
  private async performTrendAnalysis(category: string, marketData: any): Promise<any> {
    try {
      if (marketData.historicalPrices.length < 10) {
        return { trend: 'stable', strength: 0, direction: 'neutral' };
      }

      // Sort prices by timestamp
      const sortedPrices = marketData.historicalPrices
        .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Calculate moving averages
      const shortTermMA = this.calculateMovingAverage(sortedPrices.slice(-30), 'finalPrice');
      const longTermMA = this.calculateMovingAverage(sortedPrices.slice(-90), 'finalPrice');

      // Calculate trend strength and direction
      const trendStrength = Math.abs(shortTermMA - longTermMA) / longTermMA;
      const direction = shortTermMA > longTermMA ? 'increasing' : 
                       shortTermMA < longTermMA ? 'decreasing' : 'stable';

      // Calculate volatility
      const prices = sortedPrices.map((p: any) => p.finalPrice);
      const volatility = this.calculateVolatility(prices);

      return {
        trend: direction,
        strength: trendStrength,
        direction,
        volatility,
        shortTermMA,
        longTermMA,
        dataPoints: sortedPrices.length
      };
    } catch (error) {
      logger.error('Failed to perform trend analysis:', error);
      return { trend: 'stable', strength: 0, direction: 'neutral', volatility: 0 };
    }
  }

  /**
   * Generate ML-based price prediction
   */
  private async generateMLPrediction(
    request: PriceDiscoveryRequest, 
    marketData: any, 
    seasonalAnalysis: SeasonalData[], 
    trendAnalysis: any
  ): Promise<any> {
    try {
      // Feature engineering for ML model
      const features = this.extractMLFeatures(request, marketData, seasonalAnalysis, trendAnalysis);
      
      // Get or train ML model
      const model = await this.getOrTrainMLModel(request.category);
      
      // Make prediction
      const prediction = this.predictPrice(model, features);
      
      return {
        basePrice: prediction.price,
        confidence: prediction.confidence,
        volatility: prediction.volatility,
        features,
        modelVersion: model.version
      };
    } catch (error) {
      logger.error('ML prediction failed, falling back to statistical model:', error);
      return this.fallbackStatisticalPrediction(request, marketData, trendAnalysis);
    }
  }

  /**
   * Extract features for ML model
   */
  private extractMLFeatures(
    request: PriceDiscoveryRequest, 
    marketData: any, 
    seasonalAnalysis: SeasonalData[], 
    trendAnalysis: any
  ): number[] {
    const features: number[] = [];
    
    // Product features
    features.push(this.encodeQuality(request.attributes.quality));
    features.push(request.attributes.quantity);
    features.push(request.attributes.perishable ? 1 : 0);
    features.push(this.encodeSeasonality(request.attributes.seasonality));
    
    // Market features
    features.push(marketData.sampleSize);
    features.push(marketData.transactionVolume);
    features.push(marketData.competitors.length);
    
    // Seasonal features
    const currentSeason = this.getCurrentSeason();
    const seasonalData = seasonalAnalysis.find(s => s.season === currentSeason);
    features.push(seasonalData?.averagePrice || 0);
    features.push(seasonalData?.volume || 0);
    features.push(this.encodeTrend(seasonalData?.trend));
    
    // Trend features
    features.push(trendAnalysis.strength);
    features.push(trendAnalysis.volatility);
    features.push(this.encodeTrend(trendAnalysis.direction));
    
    // Economic features
    if (marketData.economicData) {
      features.push(marketData.economicData.inflationRate || 0);
      features.push(marketData.economicData.gdpGrowth || 0);
      features.push(marketData.economicData.unemploymentRate || 0);
    } else {
      features.push(0, 0, 0);
    }
    
    return features;
  }

  /**
   * Get or train ML model for category
   */
  private async getOrTrainMLModel(category: string): Promise<any> {
    try {
      const redis = getRedisClient();
      const modelKey = `${this.modelCachePrefix}${category}`;
      
      // Try to get cached model
      const cachedModel = await redis.get(modelKey);
      if (cachedModel) {
        return JSON.parse(cachedModel);
      }
      
      // Train new model
      const model = await this.trainMLModel(category);
      
      // Cache the model
      await redis.setEx(modelKey, this.modelCacheTTL, JSON.stringify(model));
      
      return model;
    } catch (error) {
      logger.error('Failed to get/train ML model:', error);
      return this.getDefaultModel();
    }
  }

  /**
   * Train ML model using historical data
   */
  private async trainMLModel(category: string): Promise<any> {
    try {
      const db = getMongoDb();
      
      // Get training data
      const trainingData = await db.collection('ml_training_data')
        .find({ category })
        .limit(10000)
        .toArray();

      if (trainingData.length < 100) {
        logger.warn(`Insufficient training data for category ${category}, using default model`);
        return this.getDefaultModel();
      }

      // Simple linear regression model (in production, use more sophisticated ML libraries)
      const model = this.trainLinearRegression(trainingData);
      
      return {
        type: 'linear_regression',
        category,
        coefficients: model.coefficients,
        intercept: model.intercept,
        r2Score: model.r2Score,
        version: Date.now(),
        trainingSize: trainingData.length
      };
    } catch (error) {
      logger.error('Failed to train ML model:', error);
      return this.getDefaultModel();
    }
  }

  /**
   * Simple linear regression implementation
   */
  private trainLinearRegression(trainingData: any[]): any {
    // Extract features and targets
    const X = trainingData.map(d => d.features);
    const y = trainingData.map(d => d.price);
    
    // Simple implementation - in production use libraries like TensorFlow.js
    const n = X.length;
    const numFeatures = X[0].length;
    
    // Initialize coefficients
    const coefficients = new Array(numFeatures).fill(0);
    let intercept = 0;
    
    // Simple gradient descent
    const learningRate = 0.01;
    const iterations = 1000;
    
    for (let iter = 0; iter < iterations; iter++) {
      let totalError = 0;
      const gradients = new Array(numFeatures).fill(0);
      let interceptGradient = 0;
      
      for (let i = 0; i < n; i++) {
        let prediction = intercept;
        for (let j = 0; j < numFeatures; j++) {
          prediction += coefficients[j] * X[i][j];
        }
        
        const error = prediction - y[i];
        totalError += error * error;
        
        interceptGradient += error;
        for (let j = 0; j < numFeatures; j++) {
          gradients[j] += error * X[i][j];
        }
      }
      
      // Update parameters
      intercept -= learningRate * interceptGradient / n;
      for (let j = 0; j < numFeatures; j++) {
        coefficients[j] -= learningRate * gradients[j] / n;
      }
    }
    
    // Calculate R² score
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;
    let totalSumSquares = 0;
    let residualSumSquares = 0;
    
    for (let i = 0; i < n; i++) {
      let prediction = intercept;
      for (let j = 0; j < numFeatures; j++) {
        prediction += coefficients[j] * X[i][j];
      }
      
      totalSumSquares += (y[i] - meanY) ** 2;
      residualSumSquares += (y[i] - prediction) ** 2;
    }
    
    const r2Score = 1 - (residualSumSquares / totalSumSquares);
    
    return { coefficients, intercept, r2Score };
  }

  /**
   * Make price prediction using trained model
   */
  private predictPrice(model: any, features: number[]): any {
    try {
      let prediction = model.intercept;
      
      for (let i = 0; i < features.length && i < model.coefficients.length; i++) {
        prediction += model.coefficients[i] * features[i];
      }
      
      // Calculate confidence based on model quality
      const confidence = Math.min(95, Math.max(30, model.r2Score * 100));
      
      // Estimate volatility based on model uncertainty
      const volatility = Math.max(0.05, (1 - model.r2Score) * 0.3);
      
      return {
        price: Math.max(0.01, prediction),
        confidence,
        volatility
      };
    } catch (error) {
      logger.error('Price prediction failed:', error);
      return { price: 10, confidence: 30, volatility: 0.2 };
    }
  }

  /**
   * Calculate advanced pricing factors with ML insights
   */
  private async calculateAdvancedPricingFactors(
    request: PriceDiscoveryRequest, 
    marketData: any, 
    seasonalAnalysis: SeasonalData[], 
    trendAnalysis: any
  ): Promise<PricingFactor[]> {
    const factors: PricingFactor[] = [];

    // Quality factor with ML adjustment
    const qualityImpact = this.getAdvancedQualityImpact(request.attributes.quality, marketData);
    factors.push({
      name: 'Quality',
      impact: qualityImpact,
      description: `${request.attributes.quality} quality with market adjustment`
    });

    // Advanced seasonality factor
    const currentSeason = this.getCurrentSeason();
    const seasonalData = seasonalAnalysis.find(s => s.season === currentSeason);
    if (seasonalData) {
      const seasonalImpact = this.getAdvancedSeasonalImpact(seasonalData, marketData);
      factors.push({
        name: 'Seasonality',
        impact: seasonalImpact,
        description: `${currentSeason} seasonal adjustment based on ${seasonalData.volume} historical transactions`
      });
    }

    // Trend factor
    const trendImpact = this.getTrendImpact(trendAnalysis);
    factors.push({
      name: 'Market Trend',
      impact: trendImpact,
      description: `${trendAnalysis.direction} trend with ${(trendAnalysis.strength * 100).toFixed(1)}% strength`
    });

    // Supply/demand factor with ML insights
    if (marketData.marketConditions) {
      const supplyDemandImpact = this.getAdvancedSupplyDemandImpact(marketData.marketConditions, marketData);
      factors.push({
        name: 'Supply & Demand',
        impact: supplyDemandImpact,
        description: `Market supply: ${marketData.marketConditions.supply}, demand: ${marketData.marketConditions.demand}`
      });
    }

    // Competition factor with competitive intelligence
    const competitionImpact = this.getAdvancedCompetitionImpact(marketData.competitors, marketData);
    factors.push({
      name: 'Competition',
      impact: competitionImpact,
      description: `${marketData.competitors.length} active competitors with avg price variance ${this.calculateCompetitorVariance(marketData.competitors).toFixed(2)}%`
    });

    // Economic indicators factor
    if (marketData.economicData) {
      const economicImpact = this.getEconomicImpact(marketData.economicData);
      factors.push({
        name: 'Economic Conditions',
        impact: economicImpact,
        description: `Inflation: ${marketData.economicData.inflationRate}%, GDP growth: ${marketData.economicData.gdpGrowth}%`
      });
    }

    // Volatility factor
    const volatilityImpact = this.getVolatilityImpact(trendAnalysis.volatility);
    factors.push({
      name: 'Market Volatility',
      impact: volatilityImpact,
      description: `Market volatility: ${(trendAnalysis.volatility * 100).toFixed(1)}%`
    });

    return factors;
  }

  // Helper methods for advanced calculations
  private getAdvancedQualityImpact(quality: string, marketData: any): number {
    const baseImpact = this.getQualityImpact(quality);
    
    // Adjust based on market demand for quality
    const qualityDemand = this.calculateQualityDemand(quality, marketData);
    return baseImpact * (1 + qualityDemand);
  }

  private getAdvancedSeasonalImpact(seasonalData: SeasonalData, marketData: any): number {
    const baseImpact = seasonalData.trend === 'increasing' ? 0.15 : 
                      seasonalData.trend === 'decreasing' ? -0.1 : 0;
    
    // Adjust based on volume and market conditions
    const volumeAdjustment = Math.min(0.1, seasonalData.volume / 1000);
    return baseImpact + volumeAdjustment;
  }

  private getTrendImpact(trendAnalysis: any): number {
    const baseImpact = trendAnalysis.direction === 'increasing' ? 0.1 : 
                      trendAnalysis.direction === 'decreasing' ? -0.1 : 0;
    
    return baseImpact * trendAnalysis.strength;
  }

  private getAdvancedSupplyDemandImpact(conditions: MarketConditions, marketData: any): number {
    const baseImpact = this.getSupplyDemandImpact(conditions);
    
    // Adjust based on transaction volume trends
    const volumeTrend = this.calculateVolumeTrend(marketData.transactions);
    return baseImpact * (1 + volumeTrend);
  }

  private getAdvancedCompetitionImpact(competitors: any[], marketData: any): number {
    if (competitors.length === 0) return 0.1;
    
    const baseImpact = competitors.length > 5 ? -0.15 : -0.05;
    const priceVariance = this.calculateCompetitorVariance(competitors);
    
    // Higher variance means less price pressure
    const varianceAdjustment = Math.min(0.05, priceVariance / 100);
    return baseImpact + varianceAdjustment;
  }

  private getEconomicImpact(economicData: any): number {
    let impact = 0;
    
    // Inflation impact
    if (economicData.inflationRate > 3) impact += 0.05;
    else if (economicData.inflationRate < 1) impact -= 0.03;
    
    // GDP growth impact
    if (economicData.gdpGrowth > 3) impact += 0.03;
    else if (economicData.gdpGrowth < 0) impact -= 0.05;
    
    return Math.max(-0.1, Math.min(0.1, impact));
  }

  private getVolatilityImpact(volatility: number): number {
    // Higher volatility increases price uncertainty, slight negative impact
    return -Math.min(0.05, volatility * 0.1);
  }

  // Utility methods
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => (val - mean) ** 2);
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateMovingAverage(data: any[], field: string): number {
    if (data.length === 0) return 0;
    
    const sum = data.reduce((total, item) => total + (item[field] || 0), 0);
    return sum / data.length;
  }

  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }
    
    return Math.sqrt(this.calculateVariance(returns));
  }

  private calculateQualityDemand(quality: string, marketData: any): number {
    // Analyze transaction data to determine quality demand
    const qualityTransactions = marketData.transactions.filter((t: any) => 
      t.attributes && t.attributes.quality === quality
    );
    
    const totalTransactions = marketData.transactions.length;
    if (totalTransactions === 0) return 0;
    
    const qualityRatio = qualityTransactions.length / totalTransactions;
    return (qualityRatio - 0.33) * 0.3; // Adjust based on deviation from expected 33%
  }

  private calculateVolumeTrend(transactions: any[]): number {
    if (transactions.length < 10) return 0;
    
    // Compare recent vs older transaction volumes
    const recentTransactions = transactions.filter((t: any) => 
      new Date(t.completedAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );
    
    const olderTransactions = transactions.filter((t: any) => {
      const date = new Date(t.completedAt);
      return date <= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) &&
             date > new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    });
    
    if (olderTransactions.length === 0) return 0;
    
    const recentVolume = recentTransactions.length;
    const olderVolume = olderTransactions.length;
    
    return (recentVolume - olderVolume) / olderVolume;
  }

  private calculateCompetitorVariance(competitors: any[]): number {
    if (competitors.length === 0) return 0;
    
    const prices = competitors.map((c: any) => c.price);
    const variance = this.calculateVariance(prices);
    const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    
    return (variance / mean) * 100; // Return as percentage
  }

  private getCurrentSeason(): string {
    const month = new Date().getMonth() + 1;
    if (month >= 12 || month <= 2) return 'winter';
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    return 'autumn';
  }

  private encodeQuality(quality?: string): number {
    switch (quality) {
      case 'premium': return 3;
      case 'standard': return 2;
      case 'basic': return 1;
      default: return 2;
    }
  }

  private encodeSeasonality(seasonality?: string): number {
    switch (seasonality) {
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 2;
    }
  }

  private encodeTrend(trend?: string): number {
    switch (trend) {
      case 'increasing': return 1;
      case 'decreasing': return -1;
      case 'stable': return 0;
      default: return 0;
    }
  }

  private getQualityImpact(quality: string): number {
    switch (quality) {
      case 'premium': return 0.5;
      case 'standard': return 0.1;
      case 'basic': return -0.2;
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

  private applyMLAdjustments(basePrice: number, factors: PricingFactor[], confidence: number): number {
    let adjustedPrice = basePrice;
    
    // Apply factors with confidence weighting
    factors.forEach(factor => {
      const weightedImpact = factor.impact * (confidence / 100);
      adjustedPrice *= (1 + weightedImpact);
    });
    
    return Math.max(adjustedPrice, basePrice * 0.3); // Minimum 30% of base price
  }

  private calculateDynamicPriceRange(suggestedPrice: number, factors: PricingFactor[], volatility: number): { min: number; max: number } {
    // Calculate range based on factors and volatility
    const factorVolatility = factors.reduce((sum, factor) => sum + Math.abs(factor.impact), 0) / factors.length;
    const totalVolatility = Math.max(factorVolatility, volatility);
    
    const rangePercent = Math.min(0.4, Math.max(0.1, totalVolatility)); // 10-40% range
    
    return {
      min: suggestedPrice * (1 - rangePercent),
      max: suggestedPrice * (1 + rangePercent)
    };
  }

  private determineMLMarketPosition(price: number, marketData: any, mlPrediction: any): 'below' | 'at' | 'above' | 'premium' {
    if (marketData.competitors.length === 0) {
      return 'at';
    }

    const competitorPrices = marketData.competitors.map((c: any) => c.price);
    const avgCompetitorPrice = competitorPrices.reduce((sum: number, p: number) => sum + p, 0) / competitorPrices.length;
    
    const ratio = price / avgCompetitorPrice;
    
    // Adjust thresholds based on ML confidence
    const confidenceAdjustment = (mlPrediction.confidence - 50) / 100 * 0.1;
    
    if (ratio < (0.9 + confidenceAdjustment)) return 'below';
    if (ratio > (1.3 + confidenceAdjustment)) return 'premium';
    if (ratio > (1.1 + confidenceAdjustment)) return 'above';
    return 'at';
  }

  private calculateMLConfidence(marketData: any, factors: PricingFactor[], mlPrediction: any, seasonalAnalysis: SeasonalData[]): number {
    let confidence = mlPrediction.confidence; // Start with ML model confidence
    
    // Adjust based on data availability
    if (marketData.sampleSize > 50) confidence += 10;
    else if (marketData.sampleSize > 20) confidence += 5;
    else confidence -= 10;
    
    // Adjust based on seasonal data quality
    if (seasonalAnalysis.length >= 4) confidence += 5;
    
    // Adjust based on competitor data
    if (marketData.competitors.length > 5) confidence += 10;
    else if (marketData.competitors.length > 2) confidence += 5;
    
    // Adjust based on economic data availability
    if (marketData.economicData) confidence += 5;
    
    // Adjust based on transaction volume
    if (marketData.transactionVolume > 100) confidence += 5;
    
    return Math.min(100, Math.max(20, confidence));
  }

  private fallbackStatisticalPrediction(request: PriceDiscoveryRequest, marketData: any, trendAnalysis: any): any {
    // Simple statistical fallback when ML fails
    let basePrice = 10; // Default fallback
    
    if (marketData.historicalPrices.length > 0) {
      const prices = marketData.historicalPrices.map((p: any) => p.finalPrice);
      basePrice = prices.reduce((sum: number, p: number) => sum + p, 0) / prices.length;
    }
    
    // Apply trend adjustment
    if (trendAnalysis.direction === 'increasing') {
      basePrice *= (1 + trendAnalysis.strength * 0.1);
    } else if (trendAnalysis.direction === 'decreasing') {
      basePrice *= (1 - trendAnalysis.strength * 0.1);
    }
    
    return {
      basePrice,
      confidence: 40,
      volatility: trendAnalysis.volatility || 0.15,
      features: [],
      modelVersion: 'statistical_fallback'
    };
  }

  private getDefaultModel(): any {
    return {
      type: 'default',
      category: 'general',
      coefficients: [0.1, 0.05, 0.02, 0.03, 0.01, 0.01, 0.01, 0.02, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01],
      intercept: 10,
      r2Score: 0.3,
      version: Date.now(),
      trainingSize: 0
    };
  }

  private getRegionFromLocation(location: any): string {
    return location.city || location.country || 'unknown';
  }

  private generateMLCacheKey(request: PriceDiscoveryRequest): string {
    const keyData = {
      productId: request.productId,
      category: request.category,
      quality: request.attributes.quality,
      region: this.getRegionFromLocation(request.vendorLocation),
      season: this.getCurrentSeason()
    };
    
    return `${this.cachePrefix}${Buffer.from(JSON.stringify(keyData)).toString('base64')}`;
  }

  private async getCachedMLRecommendation(cacheKey: string): Promise<PriceRecommendation | null> {
    try {
      const redis = getRedisClient();
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached) as PriceRecommendation;
      }
      
      return null;
    } catch (error) {
      logger.warn('ML cache retrieval failed:', error);
      return null;
    }
  }

  private async cacheMLRecommendation(cacheKey: string, recommendation: PriceRecommendation): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.setEx(cacheKey, this.cacheTTL, JSON.stringify(recommendation));
    } catch (error) {
      logger.warn('ML cache storage failed:', error);
    }
  }
}

// Singleton instance
export const priceAnalyzer = new PriceAnalyzer();