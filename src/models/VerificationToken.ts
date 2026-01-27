/**
 * Verification Token data model and database operations
 * Handles email, phone, and password reset tokens with Redis
 */

import { RedisClientType } from 'redis';
import { getRedisClient } from '../config/database';
import { VerificationToken } from '../types';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export class VerificationTokenModel {
  private redis: RedisClientType;

  constructor() {
    this.redis = getRedisClient();
  }

  /**
   * Generate a secure random token
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create a verification token
   */
  async create(
    userId: string, 
    type: 'email' | 'phone' | 'password_reset',
    expirationMinutes: number = 60
  ): Promise<string> {
    try {
      const token = this.generateToken();
      const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);
      
      const tokenData: VerificationToken = {
        token,
        userId,
        type,
        expiresAt,
        createdAt: new Date()
      };
      
      const key = `verification_token:${token}`;
      const ttlSeconds = expirationMinutes * 60;
      
      await this.redis.setEx(key, ttlSeconds, JSON.stringify(tokenData));
      
      // Also store by user ID for cleanup/lookup
      const userKey = `user_tokens:${userId}:${type}`;
      await this.redis.setEx(userKey, ttlSeconds, token);
      
      logger.info(`Created ${type} verification token for user ${userId}`);
      return token;
      
    } catch (error) {
      logger.error('Error creating verification token:', error);
      throw error;
    }
  }

  /**
   * Verify and consume a token
   */
  async verify(token: string): Promise<VerificationToken | null> {
    try {
      const key = `verification_token:${token}`;
      const tokenDataStr = await this.redis.get(key);
      
      if (!tokenDataStr) {
        return null;
      }
      
      const tokenData: VerificationToken = JSON.parse(tokenDataStr);
      
      // Check if token has expired
      if (new Date() > new Date(tokenData.expiresAt)) {
        await this.delete(token);
        return null;
      }
      
      // Token is valid, delete it (one-time use)
      await this.delete(token);
      
      logger.info(`Verified and consumed ${tokenData.type} token for user ${tokenData.userId}`);
      return tokenData;
      
    } catch (error) {
      logger.error('Error verifying token:', error);
      throw error;
    }
  }

  /**
   * Check if token exists without consuming it
   */
  async exists(token: string): Promise<boolean> {
    try {
      const key = `verification_token:${token}`;
      const exists = await this.redis.exists(key);
      return exists === 1;
      
    } catch (error) {
      logger.error('Error checking token existence:', error);
      throw error;
    }
  }

  /**
   * Delete a token
   */
  async delete(token: string): Promise<boolean> {
    try {
      const key = `verification_token:${token}`;
      const deleted = await this.redis.del(key);
      return deleted === 1;
      
    } catch (error) {
      logger.error('Error deleting token:', error);
      throw error;
    }
  }

  /**
   * Delete all tokens for a user of a specific type
   */
  async deleteUserTokens(userId: string, type: 'email' | 'phone' | 'password_reset'): Promise<void> {
    try {
      const userKey = `user_tokens:${userId}:${type}`;
      const existingToken = await this.redis.get(userKey);
      
      if (existingToken) {
        await this.delete(existingToken);
        await this.redis.del(userKey);
      }
      
    } catch (error) {
      logger.error('Error deleting user tokens:', error);
      throw error;
    }
  }

  /**
   * Clean up expired tokens (called periodically)
   */
  async cleanupExpired(): Promise<number> {
    try {
      // Redis automatically handles TTL expiration, so this is mainly for logging
      logger.info('Token cleanup completed (Redis handles TTL automatically)');
      return 0;
      
    } catch (error) {
      logger.error('Error during token cleanup:', error);
      throw error;
    }
  }
}