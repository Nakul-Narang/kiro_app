import { Request, Response } from 'express';
import { enhancedPricingService } from '../services/pricing';
import { PriceDiscoveryRequest, ApiResponse } from '../types';
import { logger } from '../utils/logger';
import { validatePriceDiscoveryRequest } from '../utils/validation';

/**
 * Controller for pricing-related endpoints
 */
export class PricingController {
  /**
   * Generate comprehensive price recommendation
   */
  public async generatePriceRecommendation(req: Request, res: Response): Promise<void> {
    try {
      const request: PriceDiscoveryRequest = req.body;
      
      // Validate request
      try {
        validatePriceDiscoveryRequest(request);
      } catch (error: any) {
        const response: ApiResponse = {
          success: false,
          error: {
            message: 'Invalid price discovery request',
            details: error.message
          },
          timestamp: new Date()
        };
        res.status(400).json(response);
        return;
      }

      const recommendation = await enhancedPricingService.generateComprehensivePriceRecommendation(request);

      const response: ApiResponse = {
        success: true,
        data: recommendation,
        timestamp: new Date()
      };

      res.status(200).json(response);
      logger.info(`Price recommendation generated for product ${request.productId}: $${recommendation.suggestedPrice}`);

    } catch (error) {
      logger.error('Price recommendation generation failed:', error);
      
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Failed to generate price recommendation',
          code: 'PRICE_GENERATION_ERROR'
        },
        timestamp: new Date()
      };

      res.status(500).json(response);
    }
  }

  /**
   * Get market analytics for a category
   */
  public async getMarketAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { category } = req.params;
      const { region } = req.query;

      if (!category) {
        const response: ApiResponse = {
          success: false,
          error: {
            message: 'Category parameter is required'
          },
          timestamp: new Date()
        };
        res.status(400).json(response);
        return;
      }

      const analytics = await enhancedPricingService.getMarketAnalytics(
        category, 
        region as string
      );

      const response: ApiResponse = {
        success: true,
        data: analytics,
        timestamp: new Date()
      };

      res.status(200).json(response);

    } catch (error) {
      logger.error('Market analytics retrieval failed:', error);
      
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Failed to retrieve market analytics',
          code: 'ANALYTICS_ERROR'
        },
        timestamp: new Date()
      };

      res.status(500).json(response);
    }
  }

  /**
   * Get seasonal analysis for a category
   */
  public async getSeasonalAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { category } = req.params;
      const location = req.body.location;

      if (!category) {
        const response: ApiResponse = {
          success: false,
          error: {
            message: 'Category parameter is required'
          },
          timestamp: new Date()
        };
        res.status(400).json(response);
        return;
      }

      const seasonalData = await enhancedPricingService.getSeasonalAnalysis(category, location);

      const response: ApiResponse = {
        success: true,
        data: seasonalData,
        timestamp: new Date()
      };

      res.status(200).json(response);

    } catch (error) {
      logger.error('Seasonal analysis retrieval failed:', error);
      
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Failed to retrieve seasonal analysis',
          code: 'SEASONAL_ANALYSIS_ERROR'
        },
        timestamp: new Date()
      };

      res.status(500).json(response);
    }
  }

  /**
   * Get seasonal multipliers for current period
   */
  public async getSeasonalMultipliers(req: Request, res: Response): Promise<void> {
    try {
      const { category } = req.params;
      const location = req.body.location;

      if (!category) {
        const response: ApiResponse = {
          success: false,
          error: {
            message: 'Category parameter is required'
          },
          timestamp: new Date()
        };
        res.status(400).json(response);
        return;
      }

      const multipliers = await enhancedPricingService.getSeasonalMultipliers(category, location);

      const response: ApiResponse = {
        success: true,
        data: multipliers,
        timestamp: new Date()
      };

      res.status(200).json(response);

    } catch (error) {
      logger.error('Seasonal multipliers retrieval failed:', error);
      
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Failed to retrieve seasonal multipliers',
          code: 'SEASONAL_MULTIPLIERS_ERROR'
        },
        timestamp: new Date()
      };

      res.status(500).json(response);
    }
  }

  /**
   * Predict seasonal trends
   */
  public async predictSeasonalTrends(req: Request, res: Response): Promise<void> {
    try {
      const { category } = req.params;
      const { periodsAhead = 4 } = req.query;
      const location = req.body.location;

      if (!category) {
        const response: ApiResponse = {
          success: false,
          error: {
            message: 'Category parameter is required'
          },
          timestamp: new Date()
        };
        res.status(400).json(response);
        return;
      }

      const periods = parseInt(periodsAhead as string) || 4;
      const predictions = await enhancedPricingService.predictSeasonalTrends(
        category, 
        periods, 
        location
      );

      const response: ApiResponse = {
        success: true,
        data: predictions,
        timestamp: new Date()
      };

      res.status(200).json(response);

    } catch (error) {
      logger.error('Seasonal trend prediction failed:', error);
      
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Failed to predict seasonal trends',
          code: 'TREND_PREDICTION_ERROR'
        },
        timestamp: new Date()
      };

      res.status(500).json(response);
    }
  }

  /**
   * Analyze price trends
   */
  public async analyzePriceTrends(req: Request, res: Response): Promise<void> {
    try {
      const { category } = req.params;
      const { timeframe = 'month' } = req.query;

      if (!category) {
        const response: ApiResponse = {
          success: false,
          error: {
            message: 'Category parameter is required'
          },
          timestamp: new Date()
        };
        res.status(400).json(response);
        return;
      }

      const validTimeframes = ['week', 'month', 'quarter', 'year'];
      if (!validTimeframes.includes(timeframe as string)) {
        const response: ApiResponse = {
          success: false,
          error: {
            message: 'Invalid timeframe. Must be one of: week, month, quarter, year'
          },
          timestamp: new Date()
        };
        res.status(400).json(response);
        return;
      }

      const trendAnalysis = await enhancedPricingService.analyzePriceTrends(
        category, 
        timeframe as 'week' | 'month' | 'quarter' | 'year'
      );

      const response: ApiResponse = {
        success: true,
        data: trendAnalysis,
        timestamp: new Date()
      };

      res.status(200).json(response);

    } catch (error) {
      logger.error('Price trend analysis failed:', error);
      
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Failed to analyze price trends',
          code: 'TREND_ANALYSIS_ERROR'
        },
        timestamp: new Date()
      };

      res.status(500).json(response);
    }
  }

  /**
   * Get competitive intelligence
   */
  public async getCompetitiveIntelligence(req: Request, res: Response): Promise<void> {
    try {
      const { category } = req.params;
      const { region } = req.query;

      if (!category) {
        const response: ApiResponse = {
          success: false,
          error: {
            message: 'Category parameter is required'
          },
          timestamp: new Date()
        };
        res.status(400).json(response);
        return;
      }

      const competitiveIntel = await enhancedPricingService.getCompetitiveIntelligence(
        category, 
        region as string
      );

      const response: ApiResponse = {
        success: true,
        data: competitiveIntel,
        timestamp: new Date()
      };

      res.status(200).json(response);

    } catch (error) {
      logger.error('Competitive intelligence retrieval failed:', error);
      
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Failed to retrieve competitive intelligence',
          code: 'COMPETITIVE_INTEL_ERROR'
        },
        timestamp: new Date()
      };

      res.status(500).json(response);
    }
  }

  /**
   * Trigger market data collection
   */
  public async collectMarketData(req: Request, res: Response): Promise<void> {
    try {
      await enhancedPricingService.collectMarketData();

      const response: ApiResponse = {
        success: true,
        data: { message: 'Market data collection initiated successfully' },
        timestamp: new Date()
      };

      res.status(200).json(response);
      logger.info('Market data collection initiated via API');

    } catch (error) {
      logger.error('Market data collection failed:', error);
      
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Failed to initiate market data collection',
          code: 'DATA_COLLECTION_ERROR'
        },
        timestamp: new Date()
      };

      res.status(500).json(response);
    }
  }
}

// Export singleton instance
export const pricingController = new PricingController();