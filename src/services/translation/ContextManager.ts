import { ConversationContext, Message, TranslationRequest } from '../../types';
import { logger } from '../../utils/logger';

/**
 * Manages conversation context for improved translation accuracy
 */
export class ContextManager {
  private contextCache: Map<string, ConversationContext> = new Map();
  private maxContextMessages = 10;
  private contextTTL = 3600000; // 1 hour in milliseconds

  /**
   * Update context with new message
   */
  public updateContext(sessionId: string, message: Message, productCategory?: string): ConversationContext {
    let context = this.contextCache.get(sessionId);
    
    if (!context) {
      const newContext: ConversationContext = {
        sessionId,
        previousMessages: [],
        negotiationPhase: this.detectNegotiationPhase([message])
      };
      
      if (productCategory) {
        newContext.productCategory = productCategory;
      }
      
      context = newContext;
    }

    // Add new message to context
    context.previousMessages.push(message);
    
    // Keep only recent messages to avoid context bloat
    if (context.previousMessages.length > this.maxContextMessages) {
      context.previousMessages = context.previousMessages.slice(-this.maxContextMessages);
    }

    // Update negotiation phase based on message content
    context.negotiationPhase = this.detectNegotiationPhase(context.previousMessages);
    
    // Update product category if provided
    if (productCategory) {
      context.productCategory = productCategory;
    }

    // Cache the updated context
    this.contextCache.set(sessionId, context);
    
    // Schedule context cleanup
    this.scheduleContextCleanup(sessionId);

    logger.debug(`Updated context for session ${sessionId}, phase: ${context.negotiationPhase || 'inquiry'}`);
    
    return context;
  }

  /**
   * Get context for a session
   */
  public getContext(sessionId: string): ConversationContext | undefined {
    return this.contextCache.get(sessionId);
  }

  /**
   * Enhance translation request with context
   */
  public enhanceTranslationRequest(
    request: TranslationRequest, 
    sessionId: string,
    message?: Message,
    productCategory?: string
  ): TranslationRequest {
    let context = this.contextCache.get(sessionId);
    
    // Update context if message is provided
    if (message) {
      context = this.updateContext(sessionId, message, productCategory);
    }

    // Determine domain based on context
    let domain: 'trade' | 'negotiation' | 'general' = 'general';
    
    if (context) {
      if (context.negotiationPhase && context.negotiationPhase !== 'inquiry') {
        domain = 'negotiation';
      } else if (context.productCategory || this.containsTradeTerms(request.text)) {
        domain = 'trade';
      }
    }

    const enhancedRequest: TranslationRequest = {
      ...request,
      domain
    };

    if (context) {
      enhancedRequest.context = context;
    }

    return enhancedRequest;
  }

  /**
   * Detect negotiation phase based on message content
   */
  private detectNegotiationPhase(messages: Message[]): 'inquiry' | 'negotiation' | 'closing' {
    if (messages.length === 0) {
      return 'inquiry';
    }

    const recentMessages = messages.slice(-3); // Look at last 3 messages
    const combinedText = recentMessages.map(m => m.content.toLowerCase()).join(' ');

    // Keywords for different phases
    const negotiationKeywords = [
      'price', 'cost', 'offer', 'discount', 'negotiate', 'deal', 'cheaper', 'expensive',
      'counteroffer', 'counter offer', 'bid', 'quote', 'estimate', 'budget'
    ];

    const closingKeywords = [
      'agree', 'agreed', 'accept', 'deal', 'final', 'confirm', 'confirmed', 'yes',
      'ok', 'okay', 'good', 'perfect', 'done', 'sold', 'buy', 'purchase', 'order'
    ];

    const inquiryKeywords = [
      'hello', 'hi', 'interested', 'available', 'tell me', 'information', 'details',
      'what', 'how', 'when', 'where', 'can you', 'do you have', 'looking for'
    ];

    // Count keyword matches
    const negotiationScore = this.countKeywordMatches(combinedText, negotiationKeywords);
    const closingScore = this.countKeywordMatches(combinedText, closingKeywords);
    const inquiryScore = this.countKeywordMatches(combinedText, inquiryKeywords);

    // Determine phase based on highest score
    if (closingScore > negotiationScore && closingScore > inquiryScore) {
      return 'closing';
    } else if (negotiationScore > inquiryScore) {
      return 'negotiation';
    } else {
      return 'inquiry';
    }
  }

  /**
   * Count keyword matches in text
   */
  private countKeywordMatches(text: string, keywords: string[]): number {
    let count = 0;
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) {
        count += matches.length;
      }
    }
    return count;
  }

  /**
   * Check if text contains trade-specific terms
   */
  private containsTradeTerms(text: string): boolean {
    const tradeTerms = [
      'price', 'cost', 'sell', 'buy', 'product', 'service', 'quality', 'quantity',
      'delivery', 'shipping', 'payment', 'wholesale', 'retail', 'discount',
      'vendor', 'supplier', 'customer', 'client', 'market', 'trade', 'business',
      'order', 'purchase', 'sale', 'inventory', 'stock'
    ];

    const lowerText = text.toLowerCase();
    return tradeTerms.some(term => lowerText.includes(term));
  }

  /**
   * Schedule context cleanup to prevent memory leaks
   */
  private scheduleContextCleanup(sessionId: string): void {
    setTimeout(() => {
      this.contextCache.delete(sessionId);
      logger.debug(`Cleaned up context for session ${sessionId}`);
    }, this.contextTTL);
  }

  /**
   * Clear all contexts (useful for testing)
   */
  public clearAllContexts(): void {
    this.contextCache.clear();
    logger.info('Cleared all conversation contexts');
  }

  /**
   * Get context statistics
   */
  public getContextStats(): { totalSessions: number; averageMessages: number } {
    const totalSessions = this.contextCache.size;
    let totalMessages = 0;

    for (const context of this.contextCache.values()) {
      totalMessages += context.previousMessages.length;
    }

    const averageMessages = totalSessions > 0 ? totalMessages / totalSessions : 0;

    return {
      totalSessions,
      averageMessages: Math.round(averageMessages * 100) / 100
    };
  }

  /**
   * Extract product information from context
   */
  public extractProductInfo(context: ConversationContext): {
    category?: string;
    keywords: string[];
    priceRange?: { min: number; max: number };
  } {
    const keywords: string[] = [];
    let priceRange: { min: number; max: number } | undefined;

    // Extract keywords from recent messages
    const recentText = context.previousMessages
      .slice(-5)
      .map(m => m.content)
      .join(' ')
      .toLowerCase();

    // Extract product-related keywords
    const productKeywords = recentText.match(/\b(?:fresh|organic|premium|quality|new|used|handmade|imported|local)\b/g);
    if (productKeywords) {
      keywords.push(...productKeywords);
    }

    // Extract price information
    const priceMatches = recentText.match(/\$?\d+(?:[.,]\d+)?/g);
    if (priceMatches) {
      const prices = priceMatches.map(p => parseFloat(p.replace(/[$,]/g, ''))).filter(p => !isNaN(p));
      if (prices.length > 0) {
        priceRange = {
          min: Math.min(...prices),
          max: Math.max(...prices)
        };
      }
    }

    const result: {
      category?: string;
      keywords: string[];
      priceRange?: { min: number; max: number };
    } = {
      keywords: [...new Set(keywords)] // Remove duplicates
    };

    if (context.productCategory) {
      result.category = context.productCategory;
    }

    if (priceRange) {
      result.priceRange = priceRange;
    }

    return result;
  }
}

// Singleton instance
export const contextManager = new ContextManager();