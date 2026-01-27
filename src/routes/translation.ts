import { Router } from 'express';
import { translationController } from '../controllers/TranslationController';
import { authenticate as auth } from '../middleware/auth';
import { 
  translateResponse, 
  translationErrorHandler,
  translationRateLimit 
} from '../middleware/translation';
import Joi from 'joi';

const router = Router();

// Validation middleware
const validateTranslation = (req: any, res: any, next: any) => {
  const schema = Joi.object({
    text: Joi.string().required().min(1).max(5000),
    sourceLang: Joi.string().optional().allow('auto'),
    targetLang: Joi.string().required(),
    sessionId: Joi.string().optional(),
    productCategory: Joi.string().optional(),
    domain: Joi.string().valid('trade', 'negotiation', 'general').optional()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid request data',
        details: error.details
      },
      timestamp: new Date()
    });
  }
  next();
};

const validateBatchTranslation = (req: any, res: any, next: any) => {
  const schema = Joi.object({
    requests: Joi.array().items(Joi.object({
      text: Joi.string().required().min(1).max(5000),
      sourceLang: Joi.string().optional().allow('auto'),
      targetLang: Joi.string().required(),
      domain: Joi.string().valid('trade', 'negotiation', 'general').optional()
    })).required().min(1).max(100)
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid batch request data',
        details: error.details
      },
      timestamp: new Date()
    });
  }
  next();
};

const validateLanguageDetection = (req: any, res: any, next: any) => {
  const schema = Joi.object({
    text: Joi.string().required().min(1).max(1000)
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid detection request data',
        details: error.details
      },
      timestamp: new Date()
    });
  }
  next();
};

// Apply rate limiting to all translation endpoints
router.use(translationRateLimit(100, 60000)); // 100 requests per minute

// Apply response translation middleware
router.use(translateResponse({
  enabled: true,
  translateFields: ['error.message', 'data.message']
}));

/**
 * POST /api/translation/translate
 * Translate text with context awareness
 */
router.post('/translate', 
  auth, 
  validateTranslation,
  translationController.translateText.bind(translationController)
);

/**
 * POST /api/translation/batch
 * Batch translate multiple texts
 */
router.post('/batch', 
  auth, 
  validateBatchTranslation,
  translationController.batchTranslate.bind(translationController)
);

/**
 * POST /api/translation/detect
 * Detect language of text
 */
router.post('/detect', 
  auth, 
  validateLanguageDetection,
  translationController.detectLanguage.bind(translationController)
);

/**
 * GET /api/translation/languages
 * Get supported languages
 */
router.get('/languages', 
  translationController.getSupportedLanguages.bind(translationController)
);

/**
 * GET /api/translation/health
 * Get translation service health status
 */
router.get('/health', 
  auth, 
  translationController.getServiceHealth.bind(translationController)
);

/**
 * POST /api/translation/cache/clear
 * Clear translation cache (admin only)
 */
router.post('/cache/clear', 
  auth, 
  translationController.clearCache.bind(translationController)
);

/**
 * POST /api/translation/queue/process
 * Process offline translation queue (admin only)
 */
router.post('/queue/process', 
  auth, 
  translationController.processOfflineQueue.bind(translationController)
);

// Apply translation error handler
router.use(translationErrorHandler);

export default router;