/**
 * Vendor data model and database operations
 * Handles vendor CRUD operations with PostgreSQL
 */

import { Pool, PoolClient } from 'pg';
import { getPostgresPool } from '../config/database';
import { Vendor, RegisterVendorRequest, UpdateVendorProfileRequest } from '../types';
import { UserModel } from './User';
import { logger } from '../utils/logger';

export class VendorModel {
  private pool: Pool;
  private userModel: UserModel;

  constructor() {
    this.pool = getPostgresPool();
    this.userModel = new UserModel();
  }

  /**
   * Create a new vendor in the database
   */
  async create(vendorData: RegisterVendorRequest & { passwordHash: string }): Promise<Vendor> {
    const client: PoolClient = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // First create the user
      const userQuery = `
        INSERT INTO users (
          email, phone_number, password_hash, preferred_language, 
          supported_languages, location, profile, verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING user_id, email, phone_number, preferred_language, 
                 supported_languages, location, profile, verified, 
                 created_at, updated_at, last_active
      `;
      
      const userValues = [
        vendorData.email,
        vendorData.phoneNumber || null,
        vendorData.passwordHash,
        vendorData.preferredLanguage,
        vendorData.supportedLanguages,
        JSON.stringify(vendorData.location),
        JSON.stringify(vendorData.profile),
        false
      ];
      
      const userResult = await client.query(userQuery, userValues);
      const userData = userResult.rows[0];
      
      // Then create the vendor record
      const vendorQuery = `
        INSERT INTO vendors (
          vendor_id, business_name, business_type, business_hours, payment_methods
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING vendor_id, business_name, business_type, business_hours, 
                 payment_methods, average_rating, total_transactions, 
                 response_time, created_at, updated_at
      `;
      
      const vendorValues = [
        userData.user_id,
        vendorData.businessName,
        vendorData.businessType,
        JSON.stringify(vendorData.businessHours),
        vendorData.paymentMethods
      ];
      
      const vendorResult = await client.query(vendorQuery, vendorValues);
      await client.query('COMMIT');
      
      return this.mapRowsToVendor(userData, vendorResult.rows[0]);
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating vendor:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  /**
   * Find vendor by ID
   */
  async findById(vendorId: string): Promise<Vendor | null> {
    try {
      const query = `
        SELECT u.user_id, u.email, u.phone_number, u.preferred_language, 
               u.supported_languages, u.location, u.profile, u.verified, 
               u.created_at, u.updated_at, u.last_active,
               v.business_name, v.business_type, v.business_hours, 
               v.payment_methods, v.average_rating, v.total_transactions, 
               v.response_time
        FROM users u
        JOIN vendors v ON u.user_id = v.vendor_id
        WHERE v.vendor_id = $1
      `;
      
      const result = await this.pool.query(query, [vendorId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToVendor(result.rows[0]);
      
    } catch (error) {
      logger.error('Error finding vendor by ID:', error);
      throw error;
    }
  }

  /**
   * Find vendor by email
   */
  async findByEmail(email: string): Promise<Vendor | null> {
    try {
      const query = `
        SELECT u.user_id, u.email, u.phone_number, u.preferred_language, 
               u.supported_languages, u.location, u.profile, u.verified, 
               u.created_at, u.updated_at, u.last_active,
               v.business_name, v.business_type, v.business_hours, 
               v.payment_methods, v.average_rating, v.total_transactions, 
               v.response_time
        FROM users u
        JOIN vendors v ON u.user_id = v.vendor_id
        WHERE u.email = $1
      `;
      
      const result = await this.pool.query(query, [email]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToVendor(result.rows[0]);
      
    } catch (error) {
      logger.error('Error finding vendor by email:', error);
      throw error;
    }
  }

  /**
   * Find vendor by email with password hash (for authentication)
   */
  async findByEmailWithPassword(email: string): Promise<(Vendor & { passwordHash: string }) | null> {
    try {
      const query = `
        SELECT u.user_id, u.email, u.phone_number, u.password_hash, u.preferred_language, 
               u.supported_languages, u.location, u.profile, u.verified, 
               u.created_at, u.updated_at, u.last_active,
               v.business_name, v.business_type, v.business_hours, 
               v.payment_methods, v.average_rating, v.total_transactions, 
               v.response_time
        FROM users u
        JOIN vendors v ON u.user_id = v.vendor_id
        WHERE u.email = $1
      `;
      
      const result = await this.pool.query(query, [email]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      const vendor = this.mapRowToVendor(row);
      
      return {
        ...vendor,
        passwordHash: row.password_hash
      };
      
    } catch (error) {
      logger.error('Error finding vendor by email with password:', error);
      throw error;
    }
  }

  /**
   * Update vendor profile
   */
  async updateProfile(vendorId: string, updates: UpdateVendorProfileRequest): Promise<Vendor | null> {
    const client: PoolClient = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update user fields if provided
      const userUpdates: any = {};
      if (updates.profile) userUpdates.profile = updates.profile;
      if (updates.preferredLanguage) userUpdates.preferredLanguage = updates.preferredLanguage;
      if (updates.supportedLanguages) userUpdates.supportedLanguages = updates.supportedLanguages;
      if (updates.location) userUpdates.location = updates.location;
      if (updates.phoneNumber !== undefined) userUpdates.phoneNumber = updates.phoneNumber;
      
      if (Object.keys(userUpdates).length > 0) {
        await this.userModel.updateProfile(vendorId, userUpdates);
      }
      
      // Update vendor-specific fields
      const vendorSetParts: string[] = [];
      const vendorValues: any[] = [];
      let paramIndex = 1;
      
      if (updates.businessName) {
        vendorSetParts.push(`business_name = $${paramIndex}`);
        vendorValues.push(updates.businessName);
        paramIndex++;
      }
      
      if (updates.businessType) {
        vendorSetParts.push(`business_type = $${paramIndex}`);
        vendorValues.push(updates.businessType);
        paramIndex++;
      }
      
      if (updates.businessHours) {
        vendorSetParts.push(`business_hours = $${paramIndex}`);
        vendorValues.push(JSON.stringify(updates.businessHours));
        paramIndex++;
      }
      
      if (updates.paymentMethods) {
        vendorSetParts.push(`payment_methods = $${paramIndex}`);
        vendorValues.push(updates.paymentMethods);
        paramIndex++;
      }
      
      if (vendorSetParts.length > 0) {
        vendorSetParts.push(`updated_at = NOW()`);
        vendorValues.push(vendorId);
        
        const vendorQuery = `
          UPDATE vendors 
          SET ${vendorSetParts.join(', ')}
          WHERE vendor_id = $${paramIndex}
        `;
        
        await client.query(vendorQuery, vendorValues);
      }
      
      await client.query('COMMIT');
      
      return await this.findById(vendorId);
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating vendor profile:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if vendor exists by user ID
   */
  async exists(userId: string): Promise<boolean> {
    try {
      const query = 'SELECT 1 FROM vendors WHERE vendor_id = $1';
      const result = await this.pool.query(query, [userId]);
      return result.rows.length > 0;
      
    } catch (error) {
      logger.error('Error checking vendor existence:', error);
      throw error;
    }
  }

  /**
   * Map database rows to Vendor object
   */
  private mapRowsToVendor(userRow: any, vendorRow: any): Vendor {
    return {
      userId: userRow.user_id,
      email: userRow.email,
      phoneNumber: userRow.phone_number,
      preferredLanguage: userRow.preferred_language,
      supportedLanguages: userRow.supported_languages,
      location: typeof userRow.location === 'string' ? JSON.parse(userRow.location) : userRow.location,
      profile: typeof userRow.profile === 'string' ? JSON.parse(userRow.profile) : userRow.profile,
      verified: userRow.verified,
      createdAt: userRow.created_at,
      lastActive: userRow.last_active,
      businessName: vendorRow.business_name,
      businessType: vendorRow.business_type,
      businessHours: typeof vendorRow.business_hours === 'string' ? JSON.parse(vendorRow.business_hours) : vendorRow.business_hours,
      paymentMethods: vendorRow.payment_methods,
      averageRating: parseFloat(vendorRow.average_rating) || 0,
      totalTransactions: vendorRow.total_transactions || 0,
      responseTime: vendorRow.response_time || 0,
      products: [], // Will be populated separately if needed
      ratings: [] // Will be populated separately if needed
    };
  }

  /**
   * Map single database row to Vendor object
   */
  private mapRowToVendor(row: any): Vendor {
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
      lastActive: row.last_active,
      businessName: row.business_name,
      businessType: row.business_type,
      businessHours: typeof row.business_hours === 'string' ? JSON.parse(row.business_hours) : row.business_hours,
      paymentMethods: row.payment_methods,
      averageRating: parseFloat(row.average_rating) || 0,
      totalTransactions: row.total_transactions || 0,
      responseTime: row.response_time || 0,
      products: [], // Will be populated separately if needed
      ratings: [] // Will be populated separately if needed
    };
  }
}