import { logger } from '../../utils/logger';

/**
 * Language detection and validation utilities
 */
export class LanguageDetector {
  private supportedLanguages: Set<string> = new Set();
  private languagePatterns: Map<string, RegExp[]> = new Map();
  private commonWords: Map<string, string[]> = new Map();

  constructor() {
    this.initializeLanguageData();
  }

  /**
   * Initialize language detection patterns and common words
   */
  private initializeLanguageData(): void {
    // Supported languages
    const languages = [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko',
      'ar', 'hi', 'bn', 'ur', 'ta', 'te', 'mr', 'gu', 'kn', 'ml'
    ];
    
    languages.forEach(lang => this.supportedLanguages.add(lang));

    // Language-specific patterns (simplified for demonstration)
    this.languagePatterns.set('en', [
      /\b(?:the|and|or|but|in|on|at|to|for|of|with|by)\b/gi,
      /\b(?:hello|hi|yes|no|please|thank|you|good|bad|price|buy|sell)\b/gi
    ]);

    this.languagePatterns.set('es', [
      /\b(?:el|la|los|las|y|o|pero|en|con|de|para|por)\b/gi,
      /\b(?:hola|sí|no|por favor|gracias|bueno|malo|precio|comprar|vender)\b/gi
    ]);

    this.languagePatterns.set('fr', [
      /\b(?:le|la|les|et|ou|mais|dans|avec|de|pour|par)\b/gi,
      /\b(?:bonjour|oui|non|s'il vous plaît|merci|bon|mauvais|prix|acheter|vendre)\b/gi
    ]);

    this.languagePatterns.set('hi', [
      /[\u0900-\u097F]+/g, // Devanagari script
      /\b(?:और|या|लेकिन|में|के साथ|के लिए|से|का|की|के)\b/gi
    ]);

    this.languagePatterns.set('ar', [
      /[\u0600-\u06FF]+/g, // Arabic script
      /\b(?:في|من|إلى|مع|على|عن|هذا|ذلك|نعم|لا)\b/gi
    ]);

    this.languagePatterns.set('zh', [
      /[\u4e00-\u9fff]+/g, // Chinese characters
      /\b(?:的|和|或|但是|在|与|为|从|这|那|是|不是)\b/gi
    ]);

    // Common words for each language
    this.commonWords.set('en', [
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'hello', 'hi', 'yes', 'no', 'please', 'thank', 'you', 'good', 'bad', 'price'
    ]);

    this.commonWords.set('es', [
      'el', 'la', 'los', 'las', 'y', 'o', 'pero', 'en', 'con', 'de', 'para', 'por',
      'hola', 'sí', 'no', 'por favor', 'gracias', 'bueno', 'malo', 'precio'
    ]);

    this.commonWords.set('fr', [
      'le', 'la', 'les', 'et', 'ou', 'mais', 'dans', 'avec', 'de', 'pour', 'par',
      'bonjour', 'oui', 'non', 'merci', 'bon', 'mauvais', 'prix'
    ]);

    logger.info('Language detection patterns initialized');
  }

  /**
   * Detect language using pattern matching (fallback method)
   */
  public detectLanguageByPatterns(text: string): { language: string; confidence: number } {
    const scores: Map<string, number> = new Map();
    const normalizedText = text.toLowerCase();

    // Initialize scores
    for (const lang of this.supportedLanguages) {
      scores.set(lang, 0);
    }

    // Check patterns for each language
    for (const [language, patterns] of this.languagePatterns) {
      let languageScore = 0;
      
      for (const pattern of patterns) {
        const matches = normalizedText.match(pattern);
        if (matches) {
          languageScore += matches.length;
        }
      }
      
      scores.set(language, languageScore);
    }

    // Check common words
    for (const [language, words] of this.commonWords) {
      let wordScore = 0;
      
      for (const word of words) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        const matches = normalizedText.match(regex);
        if (matches) {
          wordScore += matches.length * 2; // Weight common words higher
        }
      }
      
      const currentScore = scores.get(language) || 0;
      scores.set(language, currentScore + wordScore);
    }

    // Find language with highest score
    let bestLanguage = 'en'; // Default to English
    let bestScore = 0;
    
    for (const [language, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestLanguage = language;
      }
    }

    // Calculate confidence based on score and text length
    const textWords = text.split(/\s+/).length;
    const confidence = Math.min(0.9, bestScore / Math.max(textWords, 1));

    return {
      language: bestLanguage,
      confidence: Math.max(0.1, confidence)
    };
  }

  /**
   * Validate if a language code is supported
   */
  public isLanguageSupported(languageCode: string): boolean {
    return this.supportedLanguages.has(languageCode);
  }

  /**
   * Get list of supported languages
   */
  public getSupportedLanguages(): string[] {
    return Array.from(this.supportedLanguages);
  }

  /**
   * Validate language pair for translation
   */
  public validateLanguagePair(sourceLang: string, targetLang: string): {
    valid: boolean;
    error?: string;
  } {
    if (!this.isLanguageSupported(sourceLang)) {
      return {
        valid: false,
        error: `Source language '${sourceLang}' is not supported`
      };
    }

    if (!this.isLanguageSupported(targetLang)) {
      return {
        valid: false,
        error: `Target language '${targetLang}' is not supported`
      };
    }

    if (sourceLang === targetLang) {
      return {
        valid: false,
        error: 'Source and target languages cannot be the same'
      };
    }

    return { valid: true };
  }

  /**
   * Normalize language code (handle variations)
   */
  public normalizeLanguageCode(languageCode: string): string {
    const normalized = languageCode.toLowerCase().split('-')[0]; // Take primary language code
    
    // Handle common variations
    const variations: Record<string, string> = {
      'zh-cn': 'zh',
      'zh-tw': 'zh',
      'pt-br': 'pt',
      'pt-pt': 'pt',
      'en-us': 'en',
      'en-gb': 'en',
      'es-es': 'es',
      'es-mx': 'es',
      'fr-fr': 'fr',
      'fr-ca': 'fr'
    };

    return variations[languageCode.toLowerCase()] || normalized;
  }

  /**
   * Get language name from code
   */
  public getLanguageName(languageCode: string): string {
    const languageNames: Record<string, string> = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'bn': 'Bengali',
      'ur': 'Urdu',
      'ta': 'Tamil',
      'te': 'Telugu',
      'mr': 'Marathi',
      'gu': 'Gujarati',
      'kn': 'Kannada',
      'ml': 'Malayalam'
    };

    return languageNames[languageCode] || languageCode.toUpperCase();
  }

  /**
   * Detect if text contains mixed languages
   */
  public detectMixedLanguages(text: string): {
    isMixed: boolean;
    languages: Array<{ language: string; confidence: number; portion: string }>;
  } {
    // Split text into sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length <= 1) {
      const detection = this.detectLanguageByPatterns(text);
      return {
        isMixed: false,
        languages: [{
          language: detection.language,
          confidence: detection.confidence,
          portion: text
        }]
      };
    }

    const detections: Array<{ language: string; confidence: number; portion: string }> = [];
    const languageSet = new Set<string>();

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 0) {
        const detection = this.detectLanguageByPatterns(trimmed);
        detections.push({
          language: detection.language,
          confidence: detection.confidence,
          portion: trimmed
        });
        languageSet.add(detection.language);
      }
    }

    return {
      isMixed: languageSet.size > 1,
      languages: detections
    };
  }

  /**
   * Get confidence threshold for language detection
   */
  public getConfidenceThreshold(): number {
    return 0.3; // Minimum confidence to trust detection
  }

  /**
   * Check if text is likely to be in a specific language
   */
  public isLikelyLanguage(text: string, expectedLanguage: string): boolean {
    const detection = this.detectLanguageByPatterns(text);
    return detection.language === expectedLanguage && 
           detection.confidence >= this.getConfidenceThreshold();
  }
}

// Singleton instance
export const languageDetector = new LanguageDetector();