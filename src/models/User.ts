/**
 * User data model and database operations
 * Handles user CRUD operations with PostgreSQL
 */

import { Pool, PoolClient } from 'pg';
import { getPostgresPool } from '../config/database';
import { User, RegisterUserRequest, UpdateProfileRequest } from '../types';
import { logger } from '../utils/logger';

export class UserModel {
  private pool: Pool;

  constructor() {
    this.pool = getPostgresPool();
  }

  /**
   * Create a new user in the database
   */
  async create(userData: RegisterUserRequest & { passwordHash: string }): Promise<User> {
    const client: PoolClient = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const query = `
        INSERT INTO users (
          email, phone_number, password_hash, preferred_language, 
          supported_languages, location, profile, verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING user_id, email, phone_number, preferred_language, 
                 supported_languages, location, profile, verified, 
                 created_at, updated_at, last_active
      `;
      
      const values = [
        userData.email,
        userData.phoneNumber || null,
        userData.passwordHash,
        userData.preferredLanguage,
        userData.supportedLanguages,
        JSON.stringify(userData.location),
        JSON.stringify(userData.profile),
        false // New users start unverified
      ];
      
      const result = await client.query(query, values);
      await client.query('COMMIT');
      
      const row = result.rows[0];
      return this.mapRowToUser(row);
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating user:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find user by ID
   */
  async findById(userId: string): Promise<User | null> {
    try {
      const query = `
        SELECT user_id, email, phone_number, preferred_language, 
               supported_languages, location, profile, verified, 
               created_at, updated_at, last_active
        FROM users 
        WHERE user_id = $1
      `;
      
      const result = await this.pool.query(query, [userId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToUser(result.rows[0]);
      
    } catch (error) {
      logger.error('Error finding user by ID:', error);
      throw error;
    }
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      const query = `
        SELECT user_id, email, phone_number, preferred_language, 
               supported_languages, location, profile, verified, 
               created_at, updated_at, last_active
        FROM users 
        WHERE email = $1
      `;
      
      const result = await this.pool.query(query, [email]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToUser(result.rows[0]);
      
    } catch (error) {
      logger.error('Error finding user by email:', error);
      throw error;
    }
  }

  /**
   * Find user by email with password hash (for authentication)
   */
  async findByEmailWithPassword(email: string): Promise<(User & { passwordHash: string }) | null> {
    try {
      const query = `
        SELECT user_id, email, phone_number, password_hash, preferred_language, 
               supported_languages, location, profile, verified, 
               created_at, updated_at, last_active
        FROM users 
        WHERE email = $1
      `;
      
      const result = await this.pool.query(query, [email]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      const user = this.mapRowToUser(row);
      
      return {
        ...user,
        passwordHash: row.password_hash
      };
      
    } catch (error) {
      logger.error('Error finding user by email with password:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updates: UpdateProfileRequest): Promise<User | null> {
    const client: PoolClient = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const setParts: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      
      if (updates.profile) {
        setParts.push(`profile = $${paramIndex}`);
        values.push(JSON.stringify(updates.profile));
        paramIndex++;
      }
      
      if (updates.preferredLanguage) {
        setParts.push(`preferred_language = $${paramIndex}`);
        values.push(updates.preferredLanguage);
        paramIndex++;
      }
      
      if (updates.supportedLanguages) {
        setParts.push(`supported_languages = $${paramIndex}`);
        values.push(updates.supportedLanguages);
        paramIndex++;
      }
      
      if (updates.location) {
        setParts.push(`location = $${paramIndex}`);
        values.push(JSON.stringify(updates.location));
        paramIndex++;
      }
      
      if (updates.phoneNumber !== undefined) {
        setParts.push(`phone_number = $${paramIndex}`);
        values.push(updates.phoneNumber);
        paramIndex++;
      }
      
      if (setParts.length === 0) {
        await client.query('ROLLBACK');
        return await this.findById(userId);
      }
      
      setParts.push(`updated_at = NOW()`);
      values.push(userId);
      
      const query = `
        UPDATE users 
        SET ${setParts.join(', ')}
        WHERE user_id = $${paramIndex}
        RETURNING user_id, email, phone_number, preferred_language, 
                 supported_languages, location, profile, verified, 
                 created_at, updated_at, last_active
      `;
      
      const result = await client.query(query, values);
      await client.query('COMMIT');
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToUser(result.rows[0]);
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating user profile:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update user password
   */
  async updatePassword(userId: string, passwordHash: string): Promise<boolean> {
    try {
      const query = `
        UPDATE users 
        SET password_hash = $1, updated_at = NOW()
        WHERE user_id = $2
      `;
      
      const result = await this.pool.query(query, [passwordHash, userId]);
      return (result.rowCount ?? 0) > 0;
      
    } catch (error) {
      logger.error('Error updating user password:', error);
      throw error;
    }
  }

  /**
   * Mark user as verified
   */
  async markAsVerified(userId: string): Promise<boolean> {
    try {
      const query = `
        UPDATE users 
        SET verified = true, updated_at = NOW()
        WHERE user_id = $1
      `;
      
      const result = await this.pool.query(query, [userId]);
      return (result.rowCount ?? 0) > 0;
      
    } catch (error) {
      logger.error('Error marking user as verified:', error);
      throw error;
    }
  }

  /**
   * Update user's last active timestamp
   */
  async updateLastActive(userId: string): Promise<boolean> {
    try {
      const query = `
        UPDATE users 
        SET last_active = NOW()
        WHERE user_id = $1
      `;
      
      const result = await this.pool.query(query, [userId]);
      return (result.rowCount ?? 0) > 0;
      
    } catch (error) {
      logger.error('Error updating user last active:', error);
      throw error;
    }
  }

  /**
   * Delete user by ID
   */
  async delete(userId: string): Promise<boolean> {
    try {
      const query = 'DELETE FROM users WHERE user_id = $1';
      const result = await this.pool.query(query, [userId]);
      return (result.rowCount ?? 0) > 0;
      
    } catch (error) {
      logger.error('Error deleting user:', error);
      throw error;
    }
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string): Promise<boolean> {
    try {
      const query = 'SELECT 1 FROM users WHERE email = $1';
      const result = await this.pool.query(query, [email]);
      return result.rows.length > 0;
      
    } catch (error) {
      logger.error('Error checking email existence:', error);
      throw error;
    }
  }

  /**
   * Check if phone number exists
   */
  async phoneExists(phoneNumber: string): Promise<boolean> {
    try {
      const query = 'SELECT 1 FROM users WHERE phone_number = $1';
      const result = await this.pool.query(query, [phoneNumber]);
      return result.rows.length > 0;
      
    } catch (error) {
      logger.error('Error checking phone existence:', error);
      throw error;
    }
  }

  /**
   * Map database row to User object
   */
  private mapRowToUser(row: any): User {
    return {
      userId: row.user_id,
      email: row.email,
      phoneNumber: row.phone_number,
      preferredLanguage: row.preferred_language,
      supportedLanguages: row.supported_languages,
      location: typeof row.location === 'string' ? JSON.parse(row.location) : row.location,
      profile: typeof row.profile === 'string' ? JSON.parse(row.profile) : row.profile,
      verified: row.verified,
      createdAt: row.created_at,
      lastActive: row.last_active
    };
  }
}