import { Translate } from '@google-cloud/translate/build/src/v2';
import { ITranslationProvider } from '../TranslationService';
import { TranslationRequest, TranslationResponse, ConversationContext } from '../../../types';
import { logger } from '../../../utils/logger';

/**
 * Google Cloud Translation API provider with context awareness
 */
export class GoogleTranslationProvider implements ITranslationProvider {
  private googleTranslate: Translate;
  private tradeTerminology: Map<string, Map<string, string>> = new Map();

  constructor(apiKey?: string, projectId?: string) {
    // Initialize Google Translate client
    const config: any = {};
    
    if (apiKey) {
      config.key = apiKey;
    }
    
    if (projectId) {
      config.projectId = projectId;
    }

    this.googleTranslate = new Translate(config);
    this.initializeTradeTerminology();
  }

  /**
   * Initialize trade-specific terminology dictionary
   */
  private initializeTradeTerminology(): void {
    // English to Spanish trade terms
    const enToEs = new Map([
      ['price', 'precio'],
      ['quality', 'calidad'],
      ['quantity', 'cantidad'],
      ['delivery', 'entrega'],
      ['payment', 'pago'],
      ['discount', 'descuento'],
      ['wholesale', 'mayoreo'],
      ['retail', 'menudeo'],
      ['negotiation', 'negociación'],
      ['offer', 'oferta'],
      ['counteroffer', 'contraoferta'],
      ['agreement', 'acuerdo'],
      ['contract', 'contrato'],
      ['vendor', 'vendedor'],
      ['customer', 'cliente'],
      ['product', 'producto'],
      ['service', 'servicio'],
      ['market', 'mercado'],
      ['trade', 'comercio'],
      ['business', 'negocio']
    ]);

    // English to French trade terms
    const enToFr = new Map([
      ['price', 'prix'],
      ['quality', 'qualité'],
      ['quantity', 'quantité'],
      ['delivery', 'livraison'],
      ['payment', 'paiement'],
      ['discount', 'remise'],
      ['wholesale', 'gros'],
      ['retail', 'détail'],
      ['negotiation', 'négociation'],
      ['offer', 'offre'],
      ['counteroffer', 'contre-offre'],
      ['agreement', 'accord'],
      ['contract', 'contrat'],
      ['vendor', 'vendeur'],
      ['customer', 'client'],
      ['product', 'produit'],
      ['service', 'service'],
      ['market', 'marché'],
      ['trade', 'commerce'],
      ['business', 'affaires']
    ]);

    // English to Hindi trade terms
    const enToHi = new Map([
      ['price', 'कीमत'],
      ['quality', 'गुणवत्ता'],
      ['quantity', 'मात्रा'],
      ['delivery', 'डिलीवरी'],
      ['payment', 'भुगतान'],
      ['discount', 'छूट'],
      ['wholesale', 'थोक'],
      ['retail', 'खुदरा'],
      ['negotiation', 'बातचीत'],
      ['offer', 'प्रस्ताव'],
      ['counteroffer', 'जवाबी प्रस्ताव'],
      ['agreement', 'समझौता'],
      ['contract', 'अनुबंध'],
      ['vendor', 'विक्रेता'],
      ['customer', 'ग्राहक'],
      ['product', 'उत्पाद'],
      ['service', 'सेवा'],
      ['market', 'बाजार'],
      ['trade', 'व्यापार'],
      ['business', 'व्यवसाय']
    ]);

    this.tradeTerminology.set('en-es', enToEs);
    this.tradeTerminology.set('en-fr', enToFr);
    this.tradeTerminology.set('en-hi', enToHi);

    // Add reverse mappings
    this.addReverseMappings('es-en', enToEs);
    this.addReverseMappings('fr-en', enToFr);
    this.addReverseMappings('hi-en', enToHi);

    logger.info('Trade terminology dictionary initialized');
  }

  /**
   * Add reverse mappings for terminology
   */
  private addReverseMappings(languagePair: string, originalMap: Map<string, string>): void {
    const reverseMap = new Map<string, string>();
    for (const [key, value] of originalMap) {
      reverseMap.set(value, key);
    }
    this.tradeTerminology.set(languagePair, reverseMap);
  }

  /**
   * Translate text with context awareness and trade terminology
   */
  public async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const startTime = Date.now();

    try {
      // Pre-process text with trade terminology if applicable
      let processedText = this.preprocessTradeTerms(
        request.text, 
        request.sourceLang, 
        request.targetLang,
        request.context
      );

      // Prepare translation options
      const options: any = {
        from: request.sourceLang,
        to: request.targetLang,
        format: 'text'
      };

      // Add context-specific model if available
      if (request.domain === 'trade' || request.domain === 'negotiation') {
        // Use specialized model for business/trade content if available
        options.model = 'base'; // Could be enhanced with custom models
      }

      // Perform translation
      const [translation, metadata] = await this.googleTranslate.translate(processedText, options);
      
      // Post-process translation with trade terminology
      const finalTranslation = this.postprocessTradeTerms(
        Array.isArray(translation) ? translation[0] : translation,
        request.sourceLang,
        request.targetLang,
        request.context
      );

      // Calculate confidence based on various factors
      const confidence = this.calculateConfidence(
        request.text,
        finalTranslation,
        request.context,
        metadata
      );

      // Generate alternatives if needed
      const alternatives = await this.generateAlternatives(
        request.text,
        request.sourceLang,
        request.targetLang,
        finalTranslation
      );

      const processingTime = Date.now() - startTime;

      logger.debug(`Google Translation completed: ${request.sourceLang} -> ${request.targetLang} in ${processingTime}ms`);

      return {
        translatedText: finalTranslation,
        confidence,
        detectedLanguage: request.sourceLang,
        alternatives,
        processingTime
      };

    } catch (error) {
      logger.error('Google Translation failed:', error);
      throw new Error(`Google Translation API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect language of input text
   */
  public async detectLanguage(text: string): Promise<string> {
    try {
      const [detection] = await this.googleTranslate.detect(text);
      const detections = Array.isArray(detection) ? detection : [detection];
      
      if (detections.length > 0) {
        return detections[0].language || 'unknown';
      }
      
      return 'unknown';
    } catch (error) {
      logger.error('Google language detection failed:', error);
      throw new Error(`Language detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get supported languages from Google Translate
   */
  public async getSupportedLanguages(): Promise<string[]> {
    try {
      const [languages] = await this.googleTranslate.getLanguages();
      return languages.map(lang => lang.code);
    } catch (error) {
      logger.error('Failed to get supported languages:', error);
      // Return default supported languages as fallback
      return [
        'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko',
        'ar', 'hi', 'bn', 'ur', 'ta', 'te', 'mr', 'gu', 'kn', 'ml'
      ];
    }
  }

  /**
   * Pre-process text to handle trade-specific terminology
   */
  private preprocessTradeTerms(
    text: string, 
    sourceLang: string, 
    targetLang: string,
    context?: ConversationContext
  ): string {
    // If not trade-related context, return original text
    if (!context || (context.productCategory !== 'trade' && !context.negotiationPhase)) {
      return text;
    }

    const languagePair = `${sourceLang}-${targetLang}`;
    const terminology = this.tradeTerminology.get(languagePair);
    
    if (!terminology) {
      return text;
    }

    let processedText = text;
    
    // Replace trade terms with standardized versions for better translation
    for (const [term, _] of terminology) {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      if (regex.test(processedText)) {
        // Mark trade terms for special handling
        processedText = processedText.replace(regex, `[TRADE_TERM:${term}]`);
      }
    }

    return processedText;
  }

  /**
   * Post-process translation to apply trade terminology
   */
  private postprocessTradeTerms(
    translation: string,
    sourceLang: string,
    targetLang: string,
    context?: ConversationContext
  ): string {
    // If not trade-related context, return original translation
    if (!context || (context.productCategory !== 'trade' && !context.negotiationPhase)) {
      return translation;
    }

    const languagePair = `${sourceLang}-${targetLang}`;
    const terminology = this.tradeTerminology.get(languagePair);
    
    if (!terminology) {
      return translation;
    }

    let processedTranslation = translation;

    // Replace marked trade terms with proper translations
    const tradeTermRegex = /\[TRADE_TERM:([^\]]+)\]/g;
    processedTranslation = processedTranslation.replace(tradeTermRegex, (_match, term) => {
      const translatedTerm = terminology.get(term.toLowerCase());
      return translatedTerm || term;
    });

    return processedTranslation;
  }

  /**
   * Calculate confidence score based on various factors
   */
  private calculateConfidence(
    originalText: string,
    _translation: string,
    context?: ConversationContext,
    _metadata?: any
  ): number {
    let confidence = 0.8; // Base confidence for Google Translate

    // Adjust based on text length (longer texts generally more reliable)
    if (originalText.length > 100) {
      confidence += 0.05;
    } else if (originalText.length < 10) {
      confidence -= 0.1;
    }

    // Adjust based on context availability
    if (context && context.previousMessages.length > 0) {
      confidence += 0.05; // Context helps accuracy
    }

    // Adjust based on trade terminology usage
    if (context && (context.productCategory === 'trade' || context.negotiationPhase)) {
      confidence += 0.05; // Our terminology handling helps
    }

    // Adjust based on special characters or numbers
    const hasNumbers = /\d/.test(originalText);
    const hasSpecialChars = /[^\w\s]/.test(originalText);
    
    if (hasNumbers) {
      confidence += 0.02; // Numbers are usually preserved well
    }
    
    if (hasSpecialChars) {
      confidence -= 0.02; // Special characters can cause issues
    }

    // Ensure confidence is within valid range
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Generate alternative translations for better options
   */
  private async generateAlternatives(
    text: string,
    _sourceLang: string,
    _targetLang: string,
    _primaryTranslation: string
  ): Promise<string[]> {
    try {
      // For short texts, try to generate alternatives using different approaches
      if (text.length < 50) {
        // Could implement alternative translation strategies here
        // For now, return empty array as Google Translate v2 doesn't provide alternatives
        return [];
      }
      
      return [];
    } catch (error) {
      logger.warn('Failed to generate translation alternatives:', error);
      return [];
    }
  }
}