import axios, { AxiosInstance } from 'axios';
import { ITranslationProvider } from '../TranslationService';
import { TranslationRequest, TranslationResponse, ConversationContext } from '../../../types';
import { logger } from '../../../utils/logger';

/**
 * Azure Translator Text API provider as fallback service
 */
export class AzureTranslationProvider implements ITranslationProvider {
  private client: AxiosInstance;
  private subscriptionKey: string;
  private region: string;
  private endpoint: string;

  constructor(subscriptionKey?: string, region?: string, endpoint?: string) {
    this.subscriptionKey = subscriptionKey || process.env.AZURE_TRANSLATOR_KEY || '';
    this.region = region || process.env.AZURE_TRANSLATOR_REGION || 'global';
    this.endpoint = endpoint || process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com';

    this.client = axios.create({
      baseURL: this.endpoint,
      timeout: 10000,
      headers: {
        'Ocp-Apim-Subscription-Key': this.subscriptionKey,
        'Ocp-Apim-Subscription-Region': this.region,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Translate text using Azure Translator
   */
  public async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const startTime = Date.now();

    try {
      if (!this.subscriptionKey) {
        throw new Error('Azure Translator subscription key not configured');
      }

      // Prepare request body
      const requestBody = [{
        text: request.text
      }];

      // Prepare query parameters
      const params = new URLSearchParams({
        'api-version': '3.0',
        'from': request.sourceLang,
        'to': request.targetLang
      });

      // Add category for domain-specific translation if available
      if (request.domain === 'trade' || request.domain === 'negotiation') {
        params.append('category', 'general'); // Could be enhanced with custom categories
      }

      // Make translation request
      const response = await this.client.post(`/translate?${params.toString()}`, requestBody);

      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        throw new Error('Invalid response from Azure Translator');
      }

      const translationResult = response.data[0];
      const translations = translationResult.translations;

      if (!translations || translations.length === 0) {
        throw new Error('No translations returned from Azure Translator');
      }

      const primaryTranslation = translations[0];
      const translatedText = primaryTranslation.text;

      // Preserve numerical data
      const preservedTranslation = this.preserveNumericalData(request.text, translatedText);

      // Calculate confidence
      const confidence = this.calculateConfidence(
        request.text,
        preservedTranslation,
        request.context,
        translationResult
      );

      // Generate alternatives from multiple translation options
      const alternatives = translations.slice(1).map((t: any) => t.text);

      const processingTime = Date.now() - startTime;

      logger.debug(`Azure Translation completed: ${request.sourceLang} -> ${request.targetLang} in ${processingTime}ms`);

      return {
        translatedText: preservedTranslation,
        confidence,
        detectedLanguage: translationResult.detectedLanguage?.language || request.sourceLang,
        alternatives,
        processingTime
      };

    } catch (error) {
      logger.error('Azure Translation failed:', error);
      
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.error?.message || error.message;
        throw new Error(`Azure Translator API error (${status}): ${message}`);
      }
      
      throw new Error(`Azure Translation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect language using Azure Translator
   */
  public async detectLanguage(text: string): Promise<string> {
    try {
      if (!this.subscriptionKey) {
        throw new Error('Azure Translator subscription key not configured');
      }

      const requestBody = [{
        text: text
      }];

      const response = await this.client.post('/detect?api-version=3.0', requestBody);

      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        throw new Error('Invalid response from Azure language detection');
      }

      const detection = response.data[0];
      return detection.language || 'unknown';

    } catch (error) {
      logger.error('Azure language detection failed:', error);
      throw new Error(`Azure language detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get supported languages from Azure Translator
   */
  public async getSupportedLanguages(): Promise<string[]> {
    try {
      const response = await this.client.get('/languages?api-version=3.0&scope=translation');
      
      if (!response.data || !response.data.translation) {
        throw new Error('Invalid response from Azure languages endpoint');
      }

      return Object.keys(response.data.translation);

    } catch (error) {
      logger.error('Failed to get Azure supported languages:', error);
      // Return default supported languages as fallback
      return [
        'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko',
        'ar', 'hi', 'bn', 'ur', 'ta', 'te', 'mr', 'gu', 'kn', 'ml'
      ];
    }
  }

  /**
   * Calculate confidence score for Azure translations
   */
  private calculateConfidence(
    originalText: string,
    _translation: string,
    context?: ConversationContext,
    metadata?: any
  ): number {
    let confidence = 0.75; // Base confidence for Azure Translator (slightly lower than Google)

    // Adjust based on text length
    if (originalText.length > 100) {
      confidence += 0.05;
    } else if (originalText.length < 10) {
      confidence -= 0.1;
    }

    // Adjust based on context
    if (context && context.previousMessages.length > 0) {
      confidence += 0.03;
    }

    // Adjust based on detected confidence if available
    if (metadata && metadata.detectedLanguage && metadata.detectedLanguage.score) {
      const detectionConfidence = metadata.detectedLanguage.score;
      confidence = confidence * (0.7 + 0.3 * detectionConfidence);
    }

    // Adjust for trade context
    if (context && (context.productCategory === 'trade' || context.negotiationPhase)) {
      confidence += 0.02;
    }

    // Adjust based on special content
    const hasNumbers = /\d/.test(originalText);
    const hasSpecialChars = /[^\w\s]/.test(originalText);
    
    if (hasNumbers) {
      confidence += 0.02;
    }
    
    if (hasSpecialChars) {
      confidence -= 0.02;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Preserve numerical data in translations
   */
  private preserveNumericalData(originalText: string, translatedText: string): string {
    // Extract numbers, prices, and measurements
    // const numberRegex = /\b\d+(?:[.,]\d+)*\b/g;
    const currencyRegex = /[$€£¥₹]\s*\d+(?:[.,]\d+)*/g;
    const measurementRegex = /\d+(?:[.,]\d+)*\s*(?:kg|lb|g|oz|m|ft|cm|in|l|ml|gal)\b/gi;

    // const originalNumbers = originalText.match(numberRegex) || [];
    const originalCurrencies = originalText.match(currencyRegex) || [];
    const originalMeasurements = originalText.match(measurementRegex) || [];

    let preservedTranslation = translatedText;

    // Preserve currency values
    originalCurrencies.forEach(currency => {
      // Simple preservation - in production, you'd want more sophisticated handling
      if (!preservedTranslation.includes(currency)) {
        // Try to find and replace corrupted currency values
        const currencyValue = currency.match(/\d+(?:[.,]\d+)*/)?.[0];
        if (currencyValue) {
          const corruptedPattern = new RegExp(`\\b${currencyValue}\\b`);
          if (corruptedPattern.test(preservedTranslation)) {
            preservedTranslation = preservedTranslation.replace(corruptedPattern, currency);
          }
        }
      }
    });

    // Preserve measurements
    originalMeasurements.forEach(measurement => {
      if (!preservedTranslation.toLowerCase().includes(measurement.toLowerCase())) {
        // Try to preserve measurement units
        const parts = measurement.match(/(\d+(?:[.,]\d+)*)\s*([a-z]+)/i);
        if (parts) {
          const value = parts[1];
          // const unit = parts[2];
          const pattern = new RegExp(`${value}\\s*[a-z]+`, 'gi');
          preservedTranslation = preservedTranslation.replace(pattern, measurement);
        }
      }
    });

    return preservedTranslation;
  }
}