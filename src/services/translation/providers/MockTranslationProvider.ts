import { TranslationRequest, TranslationResponse } from '../../../types/index';
import { ITranslationProvider } from '../TranslationService';
import { logger } from '../../../utils/logger';

/**
 * Mock translation provider for testing purposes
 * Simulates translation by prefixing text with target language
 */
export class MockTranslationProvider implements ITranslationProvider {
  private readonly name = 'mock';
  private readonly supportedLanguages = ['en', 'es', 'fr', 'de', 'hi', 'zh', 'ar', 'pt', 'ru', 'ja'];

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    logger.info(`Mock translation: ${request.sourceLang} -> ${request.targetLang}`);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const translatedText = `[${request.targetLang.toUpperCase()}] ${request.text}`;
    
    return {
      translatedText,
      confidence: 0.95,
      detectedLanguage: request.sourceLang,
      alternatives: [`[ALT-${request.targetLang.toUpperCase()}] ${request.text}`],
      processingTime: 100
    };
  }

  async detectLanguage(text: string): Promise<string> {
    logger.info(`Mock language detection for: ${text.substring(0, 50)}...`);
    
    // Simple heuristic for demo purposes
    if (text.includes('hola') || text.includes('gracias')) return 'es';
    if (text.includes('bonjour') || text.includes('merci')) return 'fr';
    if (text.includes('guten') || text.includes('danke')) return 'de';
    if (text.includes('namaste') || text.includes('dhanyawad')) return 'hi';
    
    return 'en'; // Default to English
  }

  async getSupportedLanguages(): Promise<string[]> {
    return [...this.supportedLanguages];
  }

  async isHealthy(): Promise<boolean> {
    return true; // Mock provider is always healthy
  }

  getName(): string {
    return this.name;
  }
}