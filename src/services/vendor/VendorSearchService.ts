/**
 * Vendor Search Service
 * Implements location-based vendor discovery with proximity ranking,
 * filtering by price range, ratings, and supported languages
 */

import { Pool } from 'pg';
import { getPostgresPool } from '../../config/database';
import { Vendor, Location, Product } from '../../types';
import { TranslationService } from '../translation/TranslationService';
import { logger } from '../../utils/logger';

export interface VendorSearchFilters {
  location?: Location;
  radius?: number; // in kilometers
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  supportedLanguages?: string[];
  businessType?: string;
  availability?: 'available' | 'limited' | 'out_of_stock';
  paymentMethods?: string[];
  searchTerm?: string;
}

export interface VendorSearchOptions {
  page?: number;
  limit?: number;
  sortBy?: 'proximity' | 'rating' | 'price' | 'response_time' | 'transactions';
  sortOrder?: 'asc' | 'desc';
  includeProducts?: boolean;
  targetLanguage?: string;
}

export interface VendorSearchResult {
  vendors: VendorWithDistance[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  searchLocation?: Location;
}

export interface VendorWithDistance extends Vendor {
  distance?: number; // in kilometers
  translatedBusinessName?: string;
  translatedProducts?: Product[];
}

export class VendorSearchService {
  private pool: Pool;
  private translationService: TranslationService;

  constructor() {
    this.pool = getPostgresPool();
    this.translationService = new TranslationService();
  }

  /**
   * Search vendors with location-based proximity ranking and filtering
   */
  async searchVendors(
    filters: VendorSearchFilters = {},
    options: VendorSearchOptions = {}
  ): Promise<VendorSearchResult> {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = 'proximity',
        sortOrder = 'asc',
        includeProducts = false,
        targetLanguage = 'en'
      } = options;

      const offset = (page - 1) * limit;

      // Build the search query
      const { query, countQuery, values } = this.buildSearchQuery(filters, options);

      // Get total count
      const countResult = await this.pool.query(countQuery, values.slice(0, -2)); // Remove limit and offset
      const total = parseInt(countResult.rows[0].count);

      // Get vendors
      const result = await this.pool.query(query, values);
      
      // Map results to VendorWithDistance objects
      const vendors = await Promise.all(
        result.rows.map(async (row) => {
          const vendor = await this.mapRowToVendorWithDistance(row, targetLanguage, includeProducts);
          return vendor;
        })
      );

      return {
        vendors,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        searchLocation: filters.location
      };

    } catch (error) {
      logger.error('Error searching vendors:', error);
      throw error;
    }
  }

  /**
   * Find vendors near a specific location
   */
  async findNearbyVendors(
    location: Location,
    radius: number = 10,
    options: VendorSearchOptions = {}
  ): Promise<VendorSearchResult> {
    return this.searchVendors(
      { location, radius },
      options
    );
  }

  /**
   * Search vendors by category with location filtering
   */
  async searchByCategory(
    category: string,
    location?: Location,
    radius?: number,
    options: VendorSearchOptions = {}
  ): Promise<VendorSearchResult> {
    return this.searchVendors(
      { category, location, radius },
      options
    );
  }

  /**
   * Get vendor recommendations based on user preferences
   */
  async getRecommendations(
    userLocation: Location,
    userLanguages: string[],
    preferredCategories?: string[],
    options: VendorSearchOptions = {}
  ): Promise<VendorSearchResult> {
    const filters: VendorSearchFilters = {
      location: userLocation,
      radius: 25, // Wider radius for recommendations
      supportedLanguages: userLanguages,
      minRating: 3.0 // Only recommend well-rated vendors
    };

    // If user has preferred categories, search within those
    if (preferredCategories && preferredCategories.length > 0) {
      // For now, search for the first preferred category
      // In a more advanced implementation, we could search across multiple categories
      filters.category = preferredCategories[0];
    }

    return this.searchVendors(filters, {
      ...options,
      sortBy: 'rating',
      sortOrder: 'desc'
    });
  }

  /**
   * Build the SQL query for vendor search
   */
  private buildSearchQuery(
    filters: VendorSearchFilters,
    options: VendorSearchOptions
  ): { query: string; countQuery: string; values: any[] } {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Base query with distance calculation if location is provided
    let selectClause = `
      SELECT DISTINCT
        u.user_id, u.email, u.phone_number, u.preferred_language, 
        u.supported_languages, u.location, u.profile, u.verified, 
        u.created_at, u.updated_at, u.last_active,
        v.business_name, v.business_type, v.business_hours, 
        v.payment_methods, v.average_rating, v.total_transactions, 
        v.response_time
    `;

    let fromClause = `
      FROM users u
      JOIN vendors v ON u.user_id = v.vendor_id
    `;

    // Add distance calculation if location is provided
    if (filters.location) {
      selectClause += `, 
        (6371 * acos(
          cos(radians($${paramIndex})) * 
          cos(radians((u.location->>'latitude')::float)) * 
          cos(radians((u.location->>'longitude')::float) - radians($${paramIndex + 1})) + 
          sin(radians($${paramIndex})) * 
          sin(radians((u.location->>'latitude')::float))
        )) AS distance`;
      
      values.push(filters.location.latitude, filters.location.longitude);
      paramIndex += 2;

      // Add radius filter if specified
      if (filters.radius) {
        conditions.push(`
          (6371 * acos(
            cos(radians($${paramIndex})) * 
            cos(radians((u.location->>'latitude')::float)) * 
            cos(radians((u.location->>'longitude')::float) - radians($${paramIndex + 1})) + 
            sin(radians($${paramIndex})) * 
            sin(radians((u.location->>'latitude')::float))
          )) <= $${paramIndex + 2}
        `);
        values.push(filters.location.latitude, filters.location.longitude, filters.radius);
        paramIndex += 3;
      }
    }

    // Add product join if filtering by product attributes
    if (filters.category || filters.minPrice || filters.maxPrice || filters.availability) {
      fromClause += ` LEFT JOIN products p ON v.vendor_id = p.vendor_id`;
    }

    // Category filter
    if (filters.category) {
      conditions.push(`p.category = $${paramIndex}`);
      values.push(filters.category);
      paramIndex++;
    }

    // Price range filters
    if (filters.minPrice !== undefined) {
      conditions.push(`p.base_price >= $${paramIndex}`);
      values.push(filters.minPrice);
      paramIndex++;
    }

    if (filters.maxPrice !== undefined) {
      conditions.push(`p.base_price <= $${paramIndex}`);
      values.push(filters.maxPrice);
      paramIndex++;
    }

    // Rating filter
    if (filters.minRating !== undefined) {
      conditions.push(`v.average_rating >= $${paramIndex}`);
      values.push(filters.minRating);
      paramIndex++;
    }

    // Supported languages filter
    if (filters.supportedLanguages && filters.supportedLanguages.length > 0) {
      conditions.push(`u.supported_languages && $${paramIndex}`);
      values.push(filters.supportedLanguages);
      paramIndex++;
    }

    // Business type filter
    if (filters.businessType) {
      conditions.push(`v.business_type = $${paramIndex}`);
      values.push(filters.businessType);
      paramIndex++;
    }

    // Product availability filter
    if (filters.availability) {
      conditions.push(`p.availability = $${paramIndex}`);
      values.push(filters.availability);
      paramIndex++;
    }

    // Payment methods filter
    if (filters.paymentMethods && filters.paymentMethods.length > 0) {
      conditions.push(`v.payment_methods && $${paramIndex}`);
      values.push(filters.paymentMethods);
      paramIndex++;
    }

    // Search term filter (business name, description)
    if (filters.searchTerm) {
      conditions.push(`(
        v.business_name ILIKE $${paramIndex} OR 
        (u.profile->>'bio') ILIKE $${paramIndex} OR
        EXISTS (
          SELECT 1 FROM products p2 
          WHERE p2.vendor_id = v.vendor_id 
          AND (p2.name ILIKE $${paramIndex} OR p2.description ILIKE $${paramIndex})
        )
      )`);
      values.push(`%${filters.searchTerm}%`);
      paramIndex++;
    }

    // Build WHERE clause
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Build ORDER BY clause
    let orderByClause = '';
    const { sortBy = 'proximity', sortOrder = 'asc' } = options;
    
    switch (sortBy) {
      case 'proximity':
        orderByClause = filters.location ? `ORDER BY distance ${sortOrder.toUpperCase()}` : 'ORDER BY v.average_rating DESC';
        break;
      case 'rating':
        orderByClause = `ORDER BY v.average_rating ${sortOrder.toUpperCase()}`;
        break;
      case 'price':
        orderByClause = `ORDER BY (
          SELECT MIN(p.base_price) FROM products p WHERE p.vendor_id = v.vendor_id
        ) ${sortOrder.toUpperCase()} NULLS LAST`;
        break;
      case 'response_time':
        orderByClause = `ORDER BY v.response_time ${sortOrder.toUpperCase()}`;
        break;
      case 'transactions':
        orderByClause = `ORDER BY v.total_transactions ${sortOrder.toUpperCase()}`;
        break;
      default:
        orderByClause = 'ORDER BY v.average_rating DESC';
    }

    // Add pagination
    const limitClause = `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(options.limit || 20, ((options.page || 1) - 1) * (options.limit || 20));

    // Build final queries
    const query = `${selectClause} ${fromClause} ${whereClause} ${orderByClause} ${limitClause}`;
    
    const countQuery = `
      SELECT COUNT(DISTINCT v.vendor_id) as count
      ${fromClause} 
      ${whereClause}
    `;

    return { query, countQuery, values };
  }

  /**
   * Map database row to VendorWithDistance object
   */
  private async mapRowToVendorWithDistance(
    row: any,
    targetLanguage: string,
    includeProducts: boolean
  ): Promise<VendorWithDistance> {
    const vendor: VendorWithDistance = {
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
      products: [],
      ratings: [],
      distance: row.distance ? parseFloat(row.distance) : undefined
    };

    // Translate business name if target language is different from vendor's preferred language
    if (targetLanguage !== vendor.preferredLanguage) {
      try {
        const translationResponse = await this.translationService.translate({
          text: vendor.businessName,
          sourceLang: vendor.preferredLanguage,
          targetLang: targetLanguage,
          domain: 'trade'
        });
        vendor.translatedBusinessName = translationResponse.translatedText;
      } catch (error) {
        logger.warn('Failed to translate business name:', error);
        vendor.translatedBusinessName = vendor.businessName;
      }
    }

    // Load and translate products if requested
    if (includeProducts) {
      vendor.products = await this.loadVendorProducts(vendor.userId, targetLanguage);
      vendor.translatedProducts = vendor.products;
    }

    return vendor;
  }

  /**
   * Load vendor products with translation
   */
  private async loadVendorProducts(vendorId: string, targetLanguage: string): Promise<Product[]> {
    try {
      const query = `
        SELECT product_id, vendor_id, name, description, category, 
               base_price, currency, attributes, images, availability, 
               last_updated
        FROM products 
        WHERE vendor_id = $1 AND availability != 'out_of_stock'
        ORDER BY last_updated DESC
        LIMIT 10
      `;

      const result = await this.pool.query(query, [vendorId]);
      
      const products = await Promise.all(
        result.rows.map(async (row) => {
          const product: Product = {
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

          // Translate product name and description if needed
          try {
            const nameTranslation = await this.translationService.translate({
              text: product.name,
              sourceLang: 'auto',
              targetLang: targetLanguage,
              domain: 'trade'
            });
            product.name = nameTranslation.translatedText;

            if (product.description) {
              const descTranslation = await this.translationService.translate({
                text: product.description,
                sourceLang: 'auto',
                targetLang: targetLanguage,
                domain: 'trade'
              });
              product.description = descTranslation.translatedText;
            }
          } catch (error) {
            logger.warn('Failed to translate product information:', error);
          }

          return product;
        })
      );

      return products;
    } catch (error) {
      logger.error('Error loading vendor products:', error);
      return [];
    }
  }

  /**
   * Get popular categories in a location
   */
  async getPopularCategories(location?: Location, radius?: number): Promise<Array<{ category: string; count: number }>> {
    try {
      let query = `
        SELECT p.category, COUNT(*) as count
        FROM products p
        JOIN vendors v ON p.vendor_id = v.vendor_id
        JOIN users u ON v.vendor_id = u.user_id
      `;

      const values: any[] = [];
      let paramIndex = 1;

      if (location && radius) {
        query += `
          WHERE (6371 * acos(
            cos(radians($${paramIndex})) * 
            cos(radians((u.location->>'latitude')::float)) * 
            cos(radians((u.location->>'longitude')::float) - radians($${paramIndex + 1})) + 
            sin(radians($${paramIndex})) * 
            sin(radians((u.location->>'latitude')::float))
          )) <= $${paramIndex + 2}
        `;
        values.push(location.latitude, location.longitude, radius);
      }

      query += `
        GROUP BY p.category
        ORDER BY count DESC
        LIMIT 20
      `;

      const result = await this.pool.query(query, values);
      return result.rows.map(row => ({
        category: row.category,
        count: parseInt(row.count)
      }));

    } catch (error) {
      logger.error('Error getting popular categories:', error);
      throw error;
    }
  }

  /**
   * Calculate distance between two locations using Haversine formula
   */
  private calculateDistance(loc1: Location, loc2: Location): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(loc2.latitude - loc1.latitude);
    const dLon = this.toRadians(loc2.longitude - loc1.longitude);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(loc1.latitude)) * Math.cos(this.toRadians(loc2.latitude)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}