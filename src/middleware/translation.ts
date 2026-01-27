import { Request, Response, NextFunction } from 'express';
import { translationService } from '../services/translation/TranslationService';
import { languageDetector } from '../services/translation/LanguageDetector';
import { TranslationRequest as TranslationServiceRequest } from '../types';
import { logger } from '../utils/logger';

/**
 * Extended request interface with translation data
 */
interface TranslationMiddlewareRequest extends Request {
  translation?: {
    originalText: string;
    translatedText: string;
    sourceLang: string;
    targetLang: string;
    confidence: number;
  };
}

/**
 * Middleware options for automatic translation
 */
interface TranslationMiddlewareOptions {
  enabled?: boolean;
  autoDetect?: boolean;
  fallbackLanguage?: string;
  confidenceThreshold?: number;
  cacheResults?: boolean;
  skipFields?: string[];
  translateFields?: string[];
}

/**
 * Create automatic translation middleware
 */
export function createTranslationMiddleware(options: TranslationMiddlewareOptions = {}) {
  const {
    enabled = true,
    autoDetect = true,
    fallbackLanguage = 'en',
    confidenceThreshold = 0.3,
    cacheResults = true,
    skipFields = ['password', 'token', 'id'],
    translateFields = ['message', 'content', 'text', 'description', 'title']
  } = options;

  return async (req: TranslationMiddlewareRequest, _res: Response, next: NextFunction) => {
    try {
      // Skip if translation is disabled
      if (!enabled) {
        return next();
      }

      // Skip if no user or user language preferences
      if (!req.user || !req.user.preferredLanguage) {
        return next();
      }

      // Skip if no body or not a POST/PUT/PATCH request
      if (!req.body || !['POST', 'PUT', 'PATCH'].includes(req.method)) {
        return next();
      }

      const userPreferredLang = req.user.preferredLanguage;
      const userSupportedLangs = req.user.supportedLanguages || [userPreferredLang];

      // Process translation for specified fields
      await processTranslationFields(
        req.body,
        userPreferredLang,
        userSupportedLangs,
        {
          autoDetect,
          fallbackLanguage,
          confidenceThreshold,
          cacheResults,
          skipFields,
          translateFields
        }
      );

      next();
    } catch (error) {
      logger.error('Translation middleware error:', error);
      // Don't block the request if translation fails
      next();
    }
  };
}

/**
 * Middleware for translating response messages
 */
export function translateResponse(options: TranslationMiddlewareOptions = {}) {
  const {
    enabled = true,
    fallbackLanguage = 'en',
    translateFields = ['message', 'error.message', 'data.message']
  } = options;

  return async (req: TranslationMiddlewareRequest, res: Response, next: NextFunction) => {
    if (!enabled || !req.user?.preferredLanguage) {
      return next();
    }

    // Store original json method
    const originalJson = res.json;

    // Override json method to translate response
    res.json = function(body: any) {
      (async () => {
        try {
          const translatedBody = await translateResponseFields(
            body,
            req.user!.preferredLanguage,
            fallbackLanguage,
            translateFields
          );
          originalJson.call(this, translatedBody);
        } catch (error) {
          logger.error('Response translation error:', error);
          originalJson.call(this, body);
        }
      })();
      return this;
    };

    next();
  };
}

/**
 * Middleware for WebSocket message translation
 */
export function translateWebSocketMessage(
  message: any,
  senderLang: string,
  recipientLang: string,
  sessionId?: string
): Promise<any> {
  return new Promise(async (resolve) => {
    try {
      if (senderLang === recipientLang) {
        return resolve(message);
      }

      const translatedMessage = { ...message };

      // Translate message content
      if (message.content || message.text) {
        const textToTranslate = message.content || message.text;
        
        const translationRequest: TranslationServiceRequest = {
          text: textToTranslate,
          sourceLang: senderLang,
          targetLang: recipientLang,
          domain: 'trade' // Assume trade context for WebSocket messages
        };

        const result = await translationService.translateWithContext(
          translationRequest,
          sessionId
        );

        if (message.content) {
          translatedMessage.content = result.translatedText;
        } else {
          translatedMessage.text = result.translatedText;
        }

        // Add translation metadata
        translatedMessage.translation = {
          originalText: textToTranslate,
          originalLanguage: senderLang,
          targetLanguage: recipientLang,
          confidence: result.confidence,
          processingTime: result.processingTime
        };
      }

      resolve(translatedMessage);
    } catch (error) {
      logger.error('WebSocket message translation error:', error);
      resolve(message); // Return original message on error
    }
  });
}

/**
 * Process translation for specified fields in an object
 */
async function processTranslationFields(
  obj: any,
  targetLang: string,
  supportedLangs: string[],
  options: {
    autoDetect: boolean;
    fallbackLanguage: string;
    confidenceThreshold: number;
    cacheResults: boolean;
    skipFields: string[];
    translateFields: string[];
  }
): Promise<void> {
  if (!obj || typeof obj !== 'object') {
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    // Skip specified fields
    if (options.skipFields.includes(key)) {
      continue;
    }

    // Process nested objects
    if (typeof value === 'object' && value !== null) {
      await processTranslationFields(value, targetLang, supportedLangs, options);
      continue;
    }

    // Translate specified text fields
    if (typeof value === 'string' && options.translateFields.includes(key)) {
      try {
        // Detect source language
        let sourceLang = options.fallbackLanguage;
        if (options.autoDetect) {
          const detection = languageDetector.detectLanguageByPatterns(value);
          if (detection.confidence >= options.confidenceThreshold) {
            sourceLang = detection.language;
          }
        }

        // Skip if already in target language
        if (sourceLang === targetLang) {
          continue;
        }

        // Skip if user doesn't support the detected language
        if (!supportedLangs.includes(sourceLang) && !supportedLangs.includes(targetLang)) {
          continue;
        }

        // Translate the text
        const translationRequest: TranslationServiceRequest = {
          text: value,
          sourceLang,
          targetLang,
          domain: 'general'
        };

        const result = await translationService.translate(translationRequest);
        
        // Update the field with translated text
        obj[key] = result.translatedText;

        // Add translation metadata
        if (!obj._translations) {
          obj._translations = {};
        }
        obj._translations[key] = {
          originalText: value,
          sourceLang,
          targetLang,
          confidence: result.confidence
        };

      } catch (error) {
        logger.warn(`Failed to translate field ${key}:`, error);
        // Keep original value on translation failure
      }
    }
  }
}

/**
 * Translate specified fields in response body
 */
async function translateResponseFields(
  body: any,
  targetLang: string,
  fallbackLang: string,
  translateFields: string[]
): Promise<any> {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const translatedBody = { ...body };

  for (const fieldPath of translateFields) {
    try {
      const value = getNestedValue(translatedBody, fieldPath);
      
      if (typeof value === 'string' && value.length > 0) {
        // Detect source language
        const detection = languageDetector.detectLanguageByPatterns(value);
        const sourceLang = detection.confidence >= 0.3 ? detection.language : fallbackLang;

        // Skip if already in target language
        if (sourceLang === targetLang) {
          continue;
        }

        // Translate the text
        const translationRequest: TranslationServiceRequest = {
          text: value,
          sourceLang,
          targetLang,
          domain: 'general'
        };

        const result = await translationService.translate(translationRequest);
        
        // Update the nested field
        setNestedValue(translatedBody, fieldPath, result.translatedText);
      }
    } catch (error) {
      logger.warn(`Failed to translate response field ${fieldPath}:`, error);
    }
  }

  return translatedBody;
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Set nested value in object using dot notation
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  
  const target = keys.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    return current[key];
  }, obj);
  
  target[lastKey] = value;
}

/**
 * Middleware for handling translation errors gracefully
 */
export function translationErrorHandler(
  error: Error,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (error.message.includes('translation') || error.message.includes('language')) {
    logger.error('Translation error:', error);
    
    res.status(500).json({
      success: false,
      error: {
        message: 'Translation service temporarily unavailable',
        code: 'TRANSLATION_ERROR'
      },
      timestamp: new Date()
    });
    return;
  }
  
  next(error);
}

/**
 * Rate limiting middleware for translation requests
 */
export function translationRateLimit(maxRequests: number = 100, windowMs: number = 60000) {
  const requestCounts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return next();
    }

    const now = Date.now();
    const userKey = `translation:${userId}`;
    const userRequests = requestCounts.get(userKey);

    if (!userRequests || now > userRequests.resetTime) {
      // Reset or initialize counter
      requestCounts.set(userKey, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }

    if (userRequests.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: {
          message: 'Translation rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((userRequests.resetTime - now) / 1000)
        },
        timestamp: new Date()
      });
    }

    userRequests.count++;
    next();
  };
}