import { Request, Response } from 'express';
import { translationService } from '../services/translation/TranslationService';
import { contextManager } from '../services/translation/ContextManager';
import { languageDetector } from '../services/translation/LanguageDetector';
import { TranslationRequest, TranslationResponse, ApiResponse, Message } from '../types';
import { logger } from '../utils/logger';

/**
 * Controller for handling translation-related operations
 */
export class TranslationController {
  /**
   * Translate single text with context
   */
  public async translateText(req: Request, res: Response): Promise<void> {
    try {
      const { text, sourceLang, targetLang, sessionId, productCategory, domain } = req.body;
      const userId = (req as any).user.userId;

      // Auto-detect source language if needed
      let detectedSourceLang = sourceLang;
      if (!sourceLang || sourceLang === 'auto') {
        detectedSourceLang = await translationService.detectLanguage(text);
        logger.debug(`Auto-detected language: ${detectedSourceLang} for user ${userId}`);
      }

      // Validate language pair
      const validation = languageDetector.validateLanguagePair(detectedSourceLang, targetLang);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: {
            message: validation.error,
            code: 'INVALID_LANGUAGE_PAIR'
          },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Create translation request
      const translationRequest: TranslationRequest = {
        text,
        sourceLang: detectedSourceLang,
        targetLang,
        domain: domain || 'general'
      };

      // Create message for context if session provided
      let message: Message | undefined;
      if (sessionId) {
        message = {
          messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          senderId: userId,
          content: text,
          timestamp: new Date(),
          type: 'text'
        };
      }

      // Perform translation with context
      const result = await translationService.translateWithContext(
        translationRequest,
        sessionId,
        message,
        productCategory
      );

      // Log successful translation
      logger.info(`Translation completed for user ${userId}: ${detectedSourceLang} -> ${targetLang} (${result.processingTime}ms)`);

      res.json({
        success: true,
        data: {
          ...result,
          detectedSourceLanguage: detectedSourceLang,
          sessionId: sessionId || null
        },
        timestamp: new Date()
      } as ApiResponse<TranslationResponse & { detectedSourceLanguage: string; sessionId: string | null }>);

    } catch (error) {
      this.handleTranslationError(error, req, res, 'Single text translation failed');
    }
  }

  /**
   * Batch translate multiple texts
   */
  public async batchTranslate(req: Request, res: Response): Promise<void> {
    try {
      const { requests } = req.body;
      const userId = (req as any).user.userId;

      if (!Array.isArray(requests) || requests.length === 0) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Requests array is required and cannot be empty',
            code: 'INVALID_BATCH_REQUEST'
          },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      if (requests.length > 100) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Batch size cannot exceed 100 requests',
            code: 'BATCH_SIZE_EXCEEDED'
          },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Validate and prepare requests
      const validatedRequests: TranslationRequest[] = [];
      const validationErrors: Array<{ index: number; error: string }> = [];

      for (let i = 0; i < requests.length; i++) {
        const request = requests[i];
        
        try {
          // Auto-detect source language if needed
          let sourceLang = request.sourceLang;
          if (!sourceLang || sourceLang === 'auto') {
            sourceLang = await translationService.detectLanguage(request.text);
          }

          // Validate language pair
          const validation = languageDetector.validateLanguagePair(sourceLang, request.targetLang);
          if (!validation.valid) {
            validationErrors.push({ index: i, error: validation.error! });
            continue;
          }

          validatedRequests.push({
            text: request.text,
            sourceLang,
            targetLang: request.targetLang,
            domain: request.domain || 'general'
          });
        } catch (error) {
          validationErrors.push({ 
            index: i, 
            error: error instanceof Error ? error.message : 'Validation failed' 
          });
        }
      }

      // Return validation errors if any
      if (validationErrors.length > 0) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Some requests failed validation',
            code: 'BATCH_VALIDATION_FAILED',
            details: validationErrors
          },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Perform batch translation
      const startTime = Date.now();
      const results = await translationService.batchTranslate(validatedRequests);
      const totalTime = Date.now() - startTime;

      // Calculate statistics
      const successfulTranslations = results.filter(r => r.confidence > 0).length;
      const averageConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
      const averageProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;

      logger.info(`Batch translation completed for user ${userId}: ${requests.length} requests in ${totalTime}ms`);

      res.json({
        success: true,
        data: {
          results,
          statistics: {
            totalRequests: requests.length,
            successfulTranslations,
            failedTranslations: requests.length - successfulTranslations,
            averageConfidence: Math.round(averageConfidence * 100) / 100,
            averageProcessingTime: Math.round(averageProcessingTime * 100) / 100,
            totalProcessingTime: totalTime
          }
        },
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      this.handleTranslationError(error, req, res, 'Batch translation failed');
    }
  }

  /**
   * Detect language of text
   */
  public async detectLanguage(req: Request, res: Response): Promise<void> {
    try {
      const { text } = req.body;
      const userId = (req as any).user.userId;

      if (!text || typeof text !== 'string') {
        res.status(400).json({
          success: false,
          error: {
            message: 'Text is required and must be a string',
            code: 'INVALID_TEXT'
          },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      // Perform language detection using multiple methods
      const providerDetection = await translationService.detectLanguage(text);
      const patternDetection = languageDetector.detectLanguageByPatterns(text);
      const mixedLanguages = languageDetector.detectMixedLanguages(text);

      // Determine most reliable detection
      const finalDetection = patternDetection.confidence >= 0.5 ? 
        patternDetection.language : 
        providerDetection;

      logger.debug(`Language detection for user ${userId}: ${finalDetection} (confidence: ${patternDetection.confidence})`);

      res.json({
        success: true,
        data: {
          detectedLanguage: finalDetection,
          confidence: patternDetection.confidence,
          languageName: languageDetector.getLanguageName(finalDetection),
          methods: {
            provider: providerDetection,
            pattern: patternDetection.language,
            patternConfidence: patternDetection.confidence
          },
          mixedLanguages: mixedLanguages.isMixed ? {
            detected: true,
            languages: mixedLanguages.languages
          } : {
            detected: false,
            languages: []
          }
        },
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      this.handleTranslationError(error, req, res, 'Language detection failed');
    }
  }

  /**
   * Get supported languages
   */
  public async getSupportedLanguages(req: Request, res: Response): Promise<void> {
    try {
      const supportedLanguages = translationService.getSupportedLanguages();
      
      const languagesWithDetails = supportedLanguages.map(code => ({
        code,
        name: languageDetector.getLanguageName(code),
        supported: true
      }));

      // Sort by name for better UX
      languagesWithDetails.sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        success: true,
        data: {
          languages: languagesWithDetails,
          totalSupported: supportedLanguages.length,
          lastUpdated: new Date()
        },
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      this.handleTranslationError(error, req, res, 'Failed to get supported languages');
    }
  }

  /**
   * Get translation service health and statistics
   */
  public async getServiceHealth(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.userId;

      // Get comprehensive health information
      const [health, cacheStats, fallbackStats, queueStatus] = await Promise.all([
        translationService.checkHealth(),
        translationService.getCacheStats(),
        translationService.getFallbackStats(),
        translationService.getOfflineQueueStatus()
      ]);

      // Get context manager statistics
      const contextStats = contextManager.getContextStats();

      logger.debug(`Health check requested by user ${userId}`);

      res.json({
        success: true,
        data: {
          service: health,
          cache: cacheStats,
          fallback: fallbackStats,
          queue: queueStatus,
          context: contextStats,
          timestamp: new Date()
        },
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      this.handleTranslationError(error, req, res, 'Failed to get service health');
    }
  }

  /**
   * Clear translation cache (admin only)
   */
  public async clearCache(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;

      // Check admin permissions
      if (user.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            message: 'Admin access required',
            code: 'INSUFFICIENT_PERMISSIONS'
          },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      await translationService.clearCache();

      logger.info(`Translation cache cleared by admin user ${user.userId}`);

      res.json({
        success: true,
        data: {
          message: 'Translation cache cleared successfully',
          clearedAt: new Date()
        },
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      this.handleTranslationError(error, req, res, 'Failed to clear cache');
    }
  }

  /**
   * Process offline translation queue (admin only)
   */
  public async processOfflineQueue(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;

      // Check admin permissions
      if (user.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            message: 'Admin access required',
            code: 'INSUFFICIENT_PERMISSIONS'
          },
          timestamp: new Date()
        } as ApiResponse);
        return;
      }

      const result = await translationService.processOfflineQueue();

      logger.info(`Offline queue processed by admin user ${user.userId}: ${result.processed} processed, ${result.failed} failed`);

      res.json({
        success: true,
        data: {
          ...result,
          processedAt: new Date()
        },
        timestamp: new Date()
      } as ApiResponse);

    } catch (error) {
      this.handleTranslationError(error, req, res, 'Failed to process offline queue');
    }
  }

  /**
   * Handle translation errors consistently
   */
  private handleTranslationError(error: unknown, req: Request, res: Response, context: string): void {
    const userId = (req as any).user?.userId || 'unknown';
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.error(`${context} for user ${userId}:`, error);

    // Determine appropriate status code based on error type
    let statusCode = 500;
    let errorCode = 'TRANSLATION_ERROR';

    if (errorMessage.includes('rate limit')) {
      statusCode = 429;
      errorCode = 'RATE_LIMIT_EXCEEDED';
    } else if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
    } else if (errorMessage.includes('unauthorized') || errorMessage.includes('permission')) {
      statusCode = 403;
      errorCode = 'PERMISSION_DENIED';
    } else if (errorMessage.includes('not found')) {
      statusCode = 404;
      errorCode = 'NOT_FOUND';
    }

    res.status(statusCode).json({
      success: false,
      error: {
        message: context,
        code: errorCode,
        details: errorMessage
      },
      timestamp: new Date()
    } as ApiResponse);
  }
}

// Export singleton instance
export const translationController = new TranslationController();