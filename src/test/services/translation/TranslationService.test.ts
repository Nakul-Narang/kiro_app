import { TranslationService, ITranslationProvider } from '../../../services/translation/TranslationService';
import { TranslationRequest, TranslationResponse } from '../../../types';
import * as fc from 'fast-check';

// Mock translation provider for testing
class MockTranslationProvider implements ITranslationProvider {
  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    // Add small delay to simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1));
    
    return {
      translatedText: `Translated: ${request.text}`,
      confidence: 0.95,
      detectedLanguage: request.sourceLang,
      alternatives: [`Alt: ${request.text}`],
      processingTime: 100
    };
  }

  async detectLanguage(_text: string): Promise<string> {
    return 'en';
  }

  async getSupportedLanguages(): Promise<string[]> {
    return ['en', 'es', 'fr', 'de'];
  }
}

class FailingTranslationProvider implements ITranslationProvider {
  async translate(_request: TranslationRequest): Promise<TranslationResponse> {
    throw new Error('Translation service unavailable');
  }

  async detectLanguage(_text: string): Promise<string> {
    throw new Error('Language detection failed');
  }

  async getSupportedLanguages(): Promise<string[]> {
    return [];
  }
}

describe('TranslationService', () => {
  let translationService: TranslationService;
  let mockProvider: MockTranslationProvider;
  let failingProvider: FailingTranslationProvider;

  beforeEach(() => {
    translationService = new TranslationService();
    mockProvider = new MockTranslationProvider();
    failingProvider = new FailingTranslationProvider();
  });

  describe('Unit Tests', () => {
    test('should initialize with supported languages', () => {
      const supportedLanguages = translationService.getSupportedLanguages();
      expect(supportedLanguages).toContain('en');
      expect(supportedLanguages).toContain('es');
      expect(supportedLanguages.length).toBeGreaterThan(10);
    });

    test('should set translation providers', () => {
      expect(() => {
        translationService.setProviders(mockProvider, failingProvider);
      }).not.toThrow();
    });

    test('should translate text successfully', async () => {
      translationService.setProviders(mockProvider);
      
      const request: TranslationRequest = {
        text: 'Hello world',
        sourceLang: 'en',
        targetLang: 'es'
      };

      const result = await translationService.translate(request);
      
      expect(result.translatedText).toBe('Translated: Hello world');
      expect(result.confidence).toBe(0.95);
      expect(result.processingTime).toBeGreaterThan(0);
    });

    test('should fallback to secondary provider on primary failure', async () => {
      translationService.setProviders(failingProvider, mockProvider);
      
      const request: TranslationRequest = {
        text: 'Hello world',
        sourceLang: 'en',
        targetLang: 'es'
      };

      const result = await translationService.translate(request);
      
      expect(result.translatedText).toBe('Translated: Hello world');
    });

    test('should throw error for unsupported language', async () => {
      translationService.setProviders(mockProvider);
      
      const request: TranslationRequest = {
        text: 'Hello world',
        sourceLang: 'unsupported',
        targetLang: 'es'
      };

      await expect(translationService.translate(request)).rejects.toThrow('Unsupported language pair');
    });

    test('should detect language', async () => {
      translationService.setProviders(mockProvider);
      
      const result = await translationService.detectLanguage('Hello world');
      expect(result).toBe('en');
    });

    test('should check language support', () => {
      expect(translationService.isLanguageSupported('en')).toBe(true);
      expect(translationService.isLanguageSupported('unsupported')).toBe(false);
    });

    test('should batch translate multiple texts', async () => {
      translationService.setProviders(mockProvider);
      
      const requests: TranslationRequest[] = [
        { text: 'Hello', sourceLang: 'en', targetLang: 'es' },
        { text: 'World', sourceLang: 'en', targetLang: 'fr' }
      ];

      const results = await translationService.batchTranslate(requests);
      
      expect(results).toHaveLength(2);
      expect(results[0].translatedText).toBe('Translated: Hello');
      expect(results[1].translatedText).toBe('Translated: World');
    });
  });

  describe('Property-Based Tests', () => {
    beforeEach(() => {
      translationService.setProviders(mockProvider);
    });

    test('**Feature: multilingual-mandi, Property 1: Translation Performance and Accuracy** - For any valid message in a supported source language, the Translation_Engine should produce a translated result in the target language within 2 seconds', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 1000 }),
        fc.constantFrom('en', 'es', 'fr', 'de'),
        fc.constantFrom('en', 'es', 'fr', 'de'),
        async (text, sourceLang, targetLang) => {
          fc.pre(sourceLang !== targetLang); // Skip same language translations
          
          const request: TranslationRequest = {
            text,
            sourceLang,
            targetLang
          };

          const startTime = Date.now();
          const result = await translationService.translate(request);
          const endTime = Date.now();
          
          // Should complete within 2 seconds (2000ms)
          expect(endTime - startTime).toBeLessThan(2000);
          
          // Should return valid translation response
          expect(result.translatedText).toBeDefined();
          expect(typeof result.translatedText).toBe('string');
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);
          expect(result.processingTime).toBeGreaterThan(0);
        }
      ), { numRuns: 100 });
    });

    test('**Feature: multilingual-mandi, Property 2: Translation Error Handling** - For any translation request that cannot be completed, the Translation_Engine should notify both parties', async () => {
      // Set up failing provider
      translationService.setProviders(failingProvider);
      
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.constantFrom('en', 'es', 'fr'),
        fc.constantFrom('en', 'es', 'fr'),
        async (text, sourceLang, targetLang) => {
          fc.pre(sourceLang !== targetLang);
          
          const request: TranslationRequest = {
            text,
            sourceLang,
            targetLang
          };

          // Should throw an error when translation fails
          await expect(translationService.translate(request)).rejects.toThrow();
        }
      ), { numRuns: 50 });
    });

    test('**Feature: multilingual-mandi, Property 3: Language Support Coverage** - For any message in supported languages, the Translation_Engine should successfully process it', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.constantFrom(...translationService.getSupportedLanguages().slice(0, 5)), // Test subset for performance
        fc.constantFrom(...translationService.getSupportedLanguages().slice(0, 5)),
        async (text, sourceLang, targetLang) => {
          fc.pre(sourceLang !== targetLang);
          fc.pre(translationService.isLanguageSupported(sourceLang));
          fc.pre(translationService.isLanguageSupported(targetLang));
          
          const request: TranslationRequest = {
            text,
            sourceLang,
            targetLang
          };

          const result = await translationService.translate(request);
          
          // Should successfully translate supported languages
          expect(result).toBeDefined();
          expect(result.translatedText).toBeDefined();
          expect(typeof result.translatedText).toBe('string');
        }
      ), { numRuns: 100 });
    });
  });
});