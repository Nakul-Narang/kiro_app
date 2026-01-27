import { 
  NegotiationSession, 
  NegotiationRound, 
  FairnessIndicator
} from '../../types';
import { logger } from '../../utils/logger';
import { getRedisClient, getPostgresPool } from '../../config/database';

/**
 * Negotiation service that manages price negotiations between vendors and customers
 */
export class NegotiationService {
  private cachePrefix = 'negotiation:';
  private sessionTTL = 86400; // 24 hours

  /**
   * Initialize a new negotiation session
   */
  public async initializeNegotiation(
    vendorId: string,
    customerId: string,
    productId: string,
    initialPrice: number,
    timeLimit?: Date
  ): Promise<NegotiationSession> {
    try {
      const sessionId = this.generateSessionId();
      const defaultTimeLimit = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      
      const session: NegotiationSession = {
        sessionId,
        vendorId,
        customerId,
        productId,
        initialPrice,
        currentOffer: initialPrice,
        status: 'active',
        rounds: [],
        timeLimit: timeLimit || defaultTimeLimit
      };

      // Store session in database
      await this.storeNegotiationSession(session);
      
      // Cache session for quick access
      await this.cacheSession(session);
      
      logger.info(`Negotiation session initialized: ${sessionId} for product ${productId}`);
      return session;
      
    } catch (error) {
      logger.error('Failed to initialize negotiation:', error);
      throw error;
    }
  }

  /**
   * Submit an offer in a negotiation
   */
  public async submitOffer(
    sessionId: string,
    offeredBy: 'vendor' | 'customer',
    amount: number,
    message?: string
  ): Promise<{ session: NegotiationSession; fairnessIndicator: FairnessIndicator }> {
    try {
      const session = await this.getNegotiationSession(sessionId);
      if (!session) {
        throw new Error(`Negotiation session not found: ${sessionId}`);
      }

      if (session.status !== 'active') {
        throw new Error(`Negotiation session is not active: ${session.status}`);
      }

      if (new Date() > session.timeLimit) {
        session.status = 'cancelled';
        await this.updateNegotiationSession(session);
        throw new Error('Negotiation session has expired');
      }

      // Calculate fairness indicator
      const fairnessIndicator = await this.calculateFairnessIndicator(session, amount);
      
      // Create new negotiation round
      const round: NegotiationRound = {
        roundNumber: session.rounds.length + 1,
        offeredBy,
        amount,
        fairnessScore: fairnessIndicator.score,
        timestamp: new Date()
      };
      
      if (message) {
        round.message = message;
      }

      // Update session
      session.rounds.push(round);
      session.currentOffer = amount;
      
      if (offeredBy === 'customer') {
        session.counterOffer = amount;
      }

      // Update in database and cache
      await this.updateNegotiationSession(session);
      await this.cacheSession(session);
      
      logger.info(`Offer submitted in session ${sessionId}: ${amount} by ${offeredBy}`);
      
      return { session, fairnessIndicator };
      
    } catch (error) {
      logger.error('Failed to submit offer:', error);
      throw error;
    }
  }

  /**
   * Accept an offer and complete negotiation
   */
  public async acceptOffer(sessionId: string, acceptedBy: 'vendor' | 'customer'): Promise<NegotiationSession> {
    try {
      const session = await this.getNegotiationSession(sessionId);
      if (!session) {
        throw new Error(`Negotiation session not found: ${sessionId}`);
      }

      if (session.status !== 'active') {
        throw new Error(`Negotiation session is not active: ${session.status}`);
      }

      session.status = 'completed';
      
      // Update in database and cache
      await this.updateNegotiationSession(session);
      await this.cacheSession(session);
      
      logger.info(`Offer accepted in session ${sessionId} by ${acceptedBy}. Final price: ${session.currentOffer}`);
      
      return session;
      
    } catch (error) {
      logger.error('Failed to accept offer:', error);
      throw error;
    }
  }

  /**
   * Suggest compromise solutions for impasses
   */
  public async suggestCompromise(sessionId: string): Promise<{ suggestedPrice: number; reasoning: string }> {
    try {
      const session = await this.getNegotiationSession(sessionId);
      if (!session) {
        throw new Error(`Negotiation session not found: ${sessionId}`);
      }

      if (session.rounds.length < 3) {
        throw new Error('Not enough negotiation rounds for compromise suggestion');
      }

      // Analyze negotiation pattern
      const vendorOffers = session.rounds.filter(r => r.offeredBy === 'vendor').map(r => r.amount);
      const customerOffers = session.rounds.filter(r => r.offeredBy === 'customer').map(r => r.amount);
      
      if (vendorOffers.length === 0 || customerOffers.length === 0) {
        throw new Error('Need offers from both parties for compromise');
      }

      // Calculate compromise price
      const latestVendorOffer = vendorOffers[vendorOffers.length - 1];
      const latestCustomerOffer = customerOffers[customerOffers.length - 1];
      
      // Simple midpoint compromise with slight bias toward fairness score
      const midpoint = (latestVendorOffer + latestCustomerOffer) / 2;
      
      // Get market-based fairness adjustment
      const fairnessIndicator = await this.calculateFairnessIndicator(session, midpoint);
      
      let suggestedPrice = midpoint;
      let reasoning = `Midpoint between latest offers (${latestVendorOffer} and ${latestCustomerOffer})`;
      
      // Adjust based on fairness
      if (fairnessIndicator.score < 40) {
        suggestedPrice = midpoint * 1.1; // Slightly higher if unfairly low
        reasoning += '. Adjusted upward for market fairness';
      } else if (fairnessIndicator.score > 80) {
        suggestedPrice = midpoint * 0.95; // Slightly lower if too high
        reasoning += '. Adjusted downward for competitive pricing';
      }

      suggestedPrice = Math.round(suggestedPrice * 100) / 100;
      
      logger.info(`Compromise suggested for session ${sessionId}: ${suggestedPrice}`);
      
      return { suggestedPrice, reasoning };
      
    } catch (error) {
      logger.error('Failed to suggest compromise:', error);
      throw error;
    }
  }

  /**
   * Get negotiation session by ID
   */
  public async getNegotiationSession(sessionId: string): Promise<NegotiationSession | null> {
    try {
      // Try cache first
      const cached = await this.getCachedSession(sessionId);
      if (cached) {
        return cached;
      }

      // Fallback to database
      const pool = getPostgresPool();
      const result = await pool.query(
        'SELECT * FROM negotiation_sessions WHERE session_id = $1',
        [sessionId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const session = this.mapRowToSession(result.rows[0]);
      
      // Cache for future requests
      await this.cacheSession(session);
      
      return session;
      
    } catch (error) {
      logger.error('Failed to get negotiation session:', error);
      throw error;
    }
  }

  /**
   * Calculate fairness indicator for an offer
   */
  private async calculateFairnessIndicator(session: NegotiationSession, offerAmount: number): Promise<FairnessIndicator> {
    try {
      // This would typically integrate with the price discovery service
      // For now, we'll use a simplified calculation
      
      const initialPrice = session.initialPrice;
      const priceRatio = offerAmount / initialPrice;
      
      // Simple fairness calculation based on deviation from initial price
      let marketComparison = 50;
      if (priceRatio >= 0.8 && priceRatio <= 1.2) {
        marketComparison = 80;
      } else if (priceRatio >= 0.6 && priceRatio <= 1.4) {
        marketComparison = 60;
      } else {
        marketComparison = 30;
      }

      // Historical trends (simplified)
      const historicalTrends = 70; // Would be calculated from actual data
      
      // Quality adjustment (simplified)
      const qualityAdjustment = 75; // Would be based on product attributes
      
      const overallScore = (marketComparison + historicalTrends + qualityAdjustment) / 3;
      
      let recommendation: 'accept' | 'counter' | 'reject';
      if (overallScore >= 70) {
        recommendation = 'accept';
      } else if (overallScore >= 40) {
        recommendation = 'counter';
      } else {
        recommendation = 'reject';
      }

      return {
        score: Math.round(overallScore),
        factors: {
          marketComparison,
          historicalTrends,
          qualityAdjustment
        },
        recommendation
      };
      
    } catch (error) {
      logger.error('Failed to calculate fairness indicator:', error);
      
      // Return neutral fairness indicator on error
      return {
        score: 50,
        factors: {
          marketComparison: 50,
          historicalTrends: 50,
          qualityAdjustment: 50
        },
        recommendation: 'counter'
      };
    }
  }

  /**
   * Store negotiation session in database
   */
  private async storeNegotiationSession(session: NegotiationSession): Promise<void> {
    const pool = getPostgresPool();
    
    await pool.query(`
      INSERT INTO negotiation_sessions (
        session_id, vendor_id, customer_id, product_id, initial_price,
        current_offer, counter_offer, status, rounds, time_limit, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
    `, [
      session.sessionId,
      session.vendorId,
      session.customerId,
      session.productId,
      session.initialPrice,
      session.currentOffer,
      session.counterOffer,
      session.status,
      JSON.stringify(session.rounds),
      session.timeLimit
    ]);
  }

  /**
   * Update negotiation session in database
   */
  private async updateNegotiationSession(session: NegotiationSession): Promise<void> {
    const pool = getPostgresPool();
    
    await pool.query(`
      UPDATE negotiation_sessions SET
        current_offer = $2,
        counter_offer = $3,
        status = $4,
        rounds = $5,
        updated_at = NOW()
      WHERE session_id = $1
    `, [
      session.sessionId,
      session.currentOffer,
      session.counterOffer,
      session.status,
      JSON.stringify(session.rounds)
    ]);
  }

  /**
   * Cache session in Redis
   */
  private async cacheSession(session: NegotiationSession): Promise<void> {
    try {
      const redis = getRedisClient();
      const cacheKey = `${this.cachePrefix}${session.sessionId}`;
      await redis.setEx(cacheKey, this.sessionTTL, JSON.stringify(session));
    } catch (error) {
      logger.warn('Failed to cache negotiation session:', error);
    }
  }

  /**
   * Get cached session from Redis
   */
  private async getCachedSession(sessionId: string): Promise<NegotiationSession | null> {
    try {
      const redis = getRedisClient();
      const cacheKey = `${this.cachePrefix}${sessionId}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached) as NegotiationSession;
      }
      
      return null;
    } catch (error) {
      logger.warn('Failed to get cached negotiation session:', error);
      return null;
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `neg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Map database row to NegotiationSession object
   */
  private mapRowToSession(row: any): NegotiationSession {
    const session: NegotiationSession = {
      sessionId: row.session_id,
      vendorId: row.vendor_id,
      customerId: row.customer_id,
      productId: row.product_id,
      initialPrice: parseFloat(row.initial_price),
      currentOffer: parseFloat(row.current_offer),
      status: row.status,
      rounds: JSON.parse(row.rounds || '[]'),
      timeLimit: new Date(row.time_limit)
    };
    
    if (row.counter_offer) {
      session.counterOffer = parseFloat(row.counter_offer);
    }
    
    return session;
  }
}

// Singleton instance
export const negotiationService = new NegotiationService();