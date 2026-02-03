import { Router } from 'express';
import { pricingController } from '../controllers/PricingController';
import { authenticateToken } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * @route POST /api/pricing/recommend
 * @desc Generate comprehensive price recommendation
 * @access Private
 */
router.post('/recommend', 
  authenticateToken,
  rateLimiter,
  pricingController.generatePriceRecommendation.bind(pricingController)
);

/**
 * @route GET /api/pricing/analytics/:category
 * @desc Get market analytics for a category
 * @access Private
 */
router.get('/analytics/:category',
  authenticateToken,
  rateLimiter,
  pricingController.getMarketAnalytics.bind(pricingController)
);

/**
 * @route POST /api/pricing/seasonal/:category
 * @desc Get seasonal analysis for a category
 * @access Private
 */
router.post('/seasonal/:category',
  authenticateToken,
  rateLimiter,
  pricingController.getSeasonalAnalysis.bind(pricingController)
);

/**
 * @route POST /api/pricing/seasonal/:category/multipliers
 * @desc Get seasonal multipliers for current period
 * @access Private
 */
router.post('/seasonal/:category/multipliers',
  authenticateToken,
  rateLimiter,
  pricingController.getSeasonalMultipliers.bind(pricingController)
);

/**
 * @route POST /api/pricing/seasonal/:category/predict
 * @desc Predict seasonal trends
 * @access Private
 */
router.post('/seasonal/:category/predict',
  authenticateToken,
  rateLimiter,
  pricingController.predictSeasonalTrends.bind(pricingController)
);

/**
 * @route GET /api/pricing/trends/:category
 * @desc Analyze price trends for a category
 * @access Private
 */
router.get('/trends/:category',
  authenticateToken,
  rateLimiter,
  pricingController.analyzePriceTrends.bind(pricingController)
);

/**
 * @route GET /api/pricing/competitive/:category
 * @desc Get competitive intelligence for a category
 * @access Private
 */
router.get('/competitive/:category',
  authenticateToken,
  rateLimiter,
  pricingController.getCompetitiveIntelligence.bind(pricingController)
);

/**
 * @route POST /api/pricing/collect-data
 * @desc Trigger market data collection
 * @access Private (Admin only)
 */
router.post('/collect-data',
  authenticateToken,
  rateLimiter,
  pricingController.collectMarketData.bind(pricingController)
);

export default router;