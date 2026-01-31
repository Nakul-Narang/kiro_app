/**
 * Product data model and database operations
 * Handles product CRUD operations with PostgreSQL
 */

import { Pool, PoolClient } from 'pg';
import { getPostgresPool } from '../config/database';
import { Product, ProductAttributes } from '../types';
import { logger } from '../utils/logger';

export interface CreateProductRequest {
  vendorId: string;
  name: string;
  description: string;
  category: string;
  basePrice: number;
  currency: string;
  attributes: ProductAttributes;
  images?: string[];
}

export interface UpdateProductRequest {
  name?: string;
  description?: string;
  category?: string;
  basePrice?: number;
  currency?: string;
  attributes?: ProductAttributes;
  images?: string[];
  availability?: 'available' | 'limited' | 'out_of_stock';
}

export interface ProductSearchFilters {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  availability?: 'available' | 'limited' | 'out_of_stock';
  vendorId?: string;
  quality?: 'basic' | 'standard' | 'premium';
  perishable?: boolean;
  searchTerm?: string;
}

export interface ProductSearchOptions {
  page?: number;
  limit?: number;
  sortBy?: 'price' | 'name' | 'updated' | 'rating';
  sortOrder?: 'asc' | 'desc';
}

export interface ProductSearchResult {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class ProductModel {
  private pool: Pool;

  constructor() {
    this.pool = getPostgresPool();
  }

  /**
   * Create a new product in the database
   */
  async create(productData: CreateProductRequest): Promise<Product> {
    const client: PoolClient = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const query = `
        INSERT INTO products (
          vendor_id, name, description, category, base_price, currency, 
          attributes, images, availability
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING product_id, vendor_id, name, description, category, 
                 base_price, currency, attributes, images, availability, 
                 created_at, updated_at, last_updated
      `;
      
      const values = [
        productData.vendorId,
        productData.name,
        productData.description,
        productData.category,
        productData.basePrice,
        productData.currency,
        JSON.stringify(productData.attributes),
        productData.images || [],
        'available'
      ];
      
      const result = await client.query(query, values);
      await client.query('COMMIT');
      
      return this.mapRowToProduct(result.rows[0]);
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating product:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find product by ID
   */
  async findById(productId: string): Promise<Product | null> {
    try {
      const query = `
        SELECT product_id, vendor_id, name, description, category, 
               base_price, currency, attributes, images, availability, 
               created_at, updated_at, last_updated
        FROM products 
        WHERE product_id = $1
      `;
      
      const result = await this.pool.query(query, [productId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToProduct(result.rows[0]);
      
    } catch (error) {
      logger.error('Error finding product by ID:', error);
      throw error;
    }
  }

  /**
   * Find products by vendor ID
   */
  async findByVendorId(vendorId: string, options: ProductSearchOptions = {}): Promise<ProductSearchResult> {
    try {
      const { page = 1, limit = 20, sortBy = 'updated', sortOrder = 'desc' } = options;
      const offset = (page - 1) * limit;
      
      // Build sort clause
      let sortClause = 'last_updated DESC';
      switch (sortBy) {
        case 'price':
          sortClause = `base_price ${sortOrder.toUpperCase()}`;
          break;
        case 'name':
          sortClause = `name ${sortOrder.toUpperCase()}`;
          break;
        case 'updated':
          sortClause = `last_updated ${sortOrder.toUpperCase()}`;
          break;
      }
      
      // Get total count
      const countQuery = 'SELECT COUNT(*) FROM products WHERE vendor_id = $1';
      const countResult = await this.pool.query(countQuery, [vendorId]);
      const total = parseInt(countResult.rows[0].count);
      
      // Get products
      const query = `
        SELECT product_id, vendor_id, name, description, category, 
               base_price, currency, attributes, images, availability, 
               created_at, updated_at, last_updated
        FROM products 
        WHERE vendor_id = $1
        ORDER BY ${sortClause}
        LIMIT $2 OFFSET $3
      `;
      
      const result = await this.pool.query(query, [vendorId, limit, offset]);
      const products = result.rows.map(row => this.mapRowToProduct(row));
      
      return {
        products,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
      
    } catch (error) {
      logger.error('Error finding products by vendor ID:', error);
      throw error;
    }
  }

  /**
   * Search products with filters
   */
  async search(filters: ProductSearchFilters = {}, options: ProductSearchOptions = {}): Promise<ProductSearchResult> {
    try {
      const { page = 1, limit = 20, sortBy = 'updated', sortOrder = 'desc' } = options;
      const offset = (page - 1) * limit;
      
      // Build WHERE clause
      const conditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      
      if (filters.category) {
        conditions.push(`category = $${paramIndex}`);
        values.push(filters.category);
        paramIndex++;
      }
      
      if (filters.minPrice !== undefined) {
        conditions.push(`base_price >= $${paramIndex}`);
        values.push(filters.minPrice);
        paramIndex++;
      }
      
      if (filters.maxPrice !== undefined) {
        conditions.push(`base_price <= $${paramIndex}`);
        values.push(filters.maxPrice);
        paramIndex++;
      }
      
      if (filters.availability) {
        conditions.push(`availability = $${paramIndex}`);
        values.push(filters.availability);
        paramIndex++;
      }
      
      if (filters.vendorId) {
        conditions.push(`vendor_id = $${paramIndex}`);
        values.push(filters.vendorId);
        paramIndex++;
      }
      
      if (filters.quality) {
        conditions.push(`attributes->>'quality' = $${paramIndex}`);
        values.push(filters.quality);
        paramIndex++;
      }
      
      if (filters.perishable !== undefined) {
        conditions.push(`(attributes->>'perishable')::boolean = $${paramIndex}`);
        values.push(filters.perishable);
        paramIndex++;
      }
      
      if (filters.searchTerm) {
        conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
        values.push(`%${filters.searchTerm}%`);
        paramIndex++;
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      // Build sort clause
      let sortClause = 'last_updated DESC';
      switch (sortBy) {
        case 'price':
          sortClause = `base_price ${sortOrder.toUpperCase()}`;
          break;
        case 'name':
          sortClause = `name ${sortOrder.toUpperCase()}`;
          break;
        case 'updated':
          sortClause = `last_updated ${sortOrder.toUpperCase()}`;
          break;
      }
      
      // Get total count
      const countQuery = `SELECT COUNT(*) FROM products ${whereClause}`;
      const countResult = await this.pool.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);
      
      // Get products
      const query = `
        SELECT product_id, vendor_id, name, description, category, 
               base_price, currency, attributes, images, availability, 
               created_at, updated_at, last_updated
        FROM products 
        ${whereClause}
        ORDER BY ${sortClause}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      values.push(limit, offset);
      const result = await this.pool.query(query, values);
      const products = result.rows.map(row => this.mapRowToProduct(row));
      
      return {
        products,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
      
    } catch (error) {
      logger.error('Error searching products:', error);
      throw error;
    }
  }

  /**
   * Update product
   */
  async update(productId: string, updates: UpdateProductRequest): Promise<Product | null> {
    const client: PoolClient = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const setParts: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      
      if (updates.name) {
        setParts.push(`name = $${paramIndex}`);
        values.push(updates.name);
        paramIndex++;
      }
      
      if (updates.description !== undefined) {
        setParts.push(`description = $${paramIndex}`);
        values.push(updates.description);
        paramIndex++;
      }
      
      if (updates.category) {
        setParts.push(`category = $${paramIndex}`);
        values.push(updates.category);
        paramIndex++;
      }
      
      if (updates.basePrice !== undefined) {
        setParts.push(`base_price = $${paramIndex}`);
        values.push(updates.basePrice);
        paramIndex++;
      }
      
      if (updates.currency) {
        setParts.push(`currency = $${paramIndex}`);
        values.push(updates.currency);
        paramIndex++;
      }
      
      if (updates.attributes) {
        setParts.push(`attributes = $${paramIndex}`);
        values.push(JSON.stringify(updates.attributes));
        paramIndex++;
      }
      
      if (updates.images !== undefined) {
        setParts.push(`images = $${paramIndex}`);
        values.push(updates.images);
        paramIndex++;
      }
      
      if (updates.availability) {
        setParts.push(`availability = $${paramIndex}`);
        values.push(updates.availability);
        paramIndex++;
      }
      
      if (setParts.length === 0) {
        await client.query('ROLLBACK');
        return await this.findById(productId);
      }
      
      setParts.push(`updated_at = NOW()`, `last_updated = NOW()`);
      values.push(productId);
      
      const query = `
        UPDATE products 
        SET ${setParts.join(', ')}
        WHERE product_id = $${paramIndex}
        RETURNING product_id, vendor_id, name, description, category, 
                 base_price, currency, attributes, images, availability, 
                 created_at, updated_at, last_updated
      `;
      
      const result = await client.query(query, values);
      await client.query('COMMIT');
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToProduct(result.rows[0]);
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating product:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete product by ID
   */
  async delete(productId: string): Promise<boolean> {
    try {
      const query = 'DELETE FROM products WHERE product_id = $1';
      const result = await this.pool.query(query, [productId]);
      return (result.rowCount ?? 0) > 0;
      
    } catch (error) {
      logger.error('Error deleting product:', error);
      throw error;
    }
  }

  /**
   * Check if product exists
   */
  async exists(productId: string): Promise<boolean> {
    try {
      const query = 'SELECT 1 FROM products WHERE product_id = $1';
      const result = await this.pool.query(query, [productId]);
      return result.rows.length > 0;
      
    } catch (error) {
      logger.error('Error checking product existence:', error);
      throw error;
    }
  }

  /**
   * Check if product belongs to vendor
   */
  async belongsToVendor(productId: string, vendorId: string): Promise<boolean> {
    try {
      const query = 'SELECT 1 FROM products WHERE product_id = $1 AND vendor_id = $2';
      const result = await this.pool.query(query, [productId, vendorId]);
      return result.rows.length > 0;
      
    } catch (error) {
      logger.error('Error checking product ownership:', error);
      throw error;
    }
  }

  /**
   * Get product categories
   */
  async getCategories(): Promise<string[]> {
    try {
      const query = 'SELECT DISTINCT category FROM products ORDER BY category';
      const result = await this.pool.query(query);
      return result.rows.map(row => row.category);
      
    } catch (error) {
      logger.error('Error getting product categories:', error);
      throw error;
    }
  }

  /**
   * Update product availability
   */
  async updateAvailability(productId: string, availability: 'available' | 'limited' | 'out_of_stock'): Promise<boolean> {
    try {
      const query = `
        UPDATE products 
        SET availability = $1, updated_at = NOW(), last_updated = NOW()
        WHERE product_id = $2
      `;
      
      const result = await this.pool.query(query, [availability, productId]);
      return (result.rowCount ?? 0) > 0;
      
    } catch (error) {
      logger.error('Error updating product availability:', error);
      throw error;
    }
  }

  /**
   * Map database row to Product object
   */
  private mapRowToProduct(row: any): Product {
    return {
      productId: row.product_id,
      vendorId: row.vendor_id,
      name: row.name,
      description: row.description,
      category: row.category,
      basePrice: parseFloat(row.base_price),
      currency: row.currency,
      attributes: typeof row.attributes === 'string' ? JSON.parse(row.attributes) : row.attributes,
      images: row.images || [],
      availability: row.availability,
      lastUpdated: row.last_updated
    };
  }
}