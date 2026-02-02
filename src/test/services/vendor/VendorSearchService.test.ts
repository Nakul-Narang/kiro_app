/**
 * Unit tests for VendorSearchService
 * Tests vendor discovery and search functionality
 */

import { VendorSearchService, VendorSearchFilters, VendorSearchOptions } from '../../../services/vendor/VendorSearchService';
import { Location } from '../../../types';
import { getPostgresPool } from '../../../config/database';
import { TranslationService } from '../../../services/translation/TranslationService';

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('../../../services/translation/TranslationService');

const mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn()
};

const mockTranslationService = {
  translate: jest.fn()
};

(getPostgresPool as jest.Mock).mockReturnValue(mockPool);
(TranslationService as jest.Mock).mockImplementation(() => mockTranslationService);

describe('VendorSearchService', () => {
  let vendorSearchService: VendorSearchService;
  
  const mockVendorRow = {
      user_id: 'vendor-1',
      email: 'vendor@example.com',
      phone_number: '+1234567890',
      preferred_language: 'en',
      supported_languages: ['en', 'es'],
      location: JSON.stringify({ latitude: 40.7128, longitude: -74.0060 }),
      profile: JSON.stringify({ firstName: 'John', lastName: 'Doe', bio: 'Local vendor' }),
      verified: true,
      created_at: new Date(),
      last_active: new Date(),
      business_name: 'John\'s Electronics',
      business_type: 'Electronics',
      business_hours: JSON.stringify({
        monday: { open: '09:00', close: '17:00' },
        tuesday: { open: '09:00', close: '17:00' }
      }),
      payment_methods: ['cash', 'card'],
      average_rating: 4.5,
      total_transactions: 100,
      response_time: 15,
      distance: 2.5
    };

  beforeEach(() => {
    vendorSearchService = new VendorSearchService();
    jest.clearAllMocks();
  });

  describe('searchVendors', () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // Count query
        .mockResolvedValueOnce({ rows: [mockVendorRow] }); // Search query

      mockTranslationService.translate.mockResolvedValue({
        translatedText: 'John\'s Electronics',
        confidence: 0.95
      });

      const filters: VendorSearchFilters = {
        category: 'Electronics'
      };

      const options: VendorSearchOptions = {
        page: 1,
        limit: 20,
        sortBy: 'rating',
        sortOrder: 'desc'
      };

      const result = await vendorSearchService.searchVendors(filters, options);

      expect(result).toEqual({
        vendors: expect.arrayContaining([
          expect.objectContaining({
            userId: 'vendor-1',
            businessName: 'John\'s Electronics',
            averageRating: 4.5,
            totalTransactions: 100,
            distance: 2.5
          })
        ]),
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        searchLocation: undefined
      });

      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('should search vendors with location-based proximity ranking', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockVendorRow] });

      mockTranslationService.translate.mockResolvedValue({
        translatedText: 'John\'s Electronics',
        confidence: 0.95
      });

      const searchLocation: Location = {
        latitude: 40.7589,
        longitude: -73.9851
      };

      const filters: VendorSearchFilters = {
        location: searchLocation,
        radius: 10
      };

      const options: VendorSearchOptions = {
        sortBy: 'proximity',
        sortOrder: 'asc'
      };

      const result = await vendorSearchService.searchVendors(filters, options);

      expect(result.vendors[0].distance).toBeDefined();
      expect(result.searchLocation).toEqual(searchLocation);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('should filter vendors by price range', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockVendorRow] });

      mockTranslationService.translate.mockResolvedValue({
        translatedText: 'John\'s Electronics',
        confidence: 0.95
      });

      const filters: VendorSearchFilters = {
        minPrice: 10,
        maxPrice: 100,
        category: 'Electronics'
      };

      await vendorSearchService.searchVendors(filters);

      // Verify that the query includes price filters
      const queryCall = mockPool.query.mock.calls[1];
      expect(queryCall[0]).toContain('base_price >=');
      expect(queryCall[0]).toContain('base_price <=');
      expect(queryCall[1]).toContain(10);
      expect(queryCall[1]).toContain(100);
    });

    it('should filter vendors by rating', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockVendorRow] });

      mockTranslationService.translate.mockResolvedValue({
        translatedText: 'John\'s Electronics',
        confidence: 0.95
      });

      const filters: VendorSearchFilters = {
        minRating: 4.0
      };

      await vendorSearchService.searchVendors(filters);

      const queryCall = mockPool.query.mock.calls[1];
      expect(queryCall[0]).toContain('average_rating >=');
      expect(queryCall[1]).toContain(4.0);
    });

    it('should filter vendors by supported languages', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockVendorRow] });

      mockTranslationService.translate.mockResolvedValue({
        translatedText: 'John\'s Electronics',
        confidence: 0.95
      });

      const filters: VendorSearchFilters = {
        supportedLanguages: ['en', 'es']
      };

      await vendorSearchService.searchVendors(filters);

      const queryCall = mockPool.query.mock.calls[1];
      expect(queryCall[0]).toContain('supported_languages &&');
      expect(queryCall[1]).toContain(['en', 'es']);
    });

    it('should handle search term filtering', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockVendorRow] });

      mockTranslationService.translate.mockResolvedValue({
        translatedText: 'John\'s Electronics',
        confidence: 0.95
      });

      const filters: VendorSearchFilters = {
        searchTerm: 'electronics'
      };

      await vendorSearchService.searchVendors(filters);

      const queryCall = mockPool.query.mock.calls[1];
      expect(queryCall[0]).toContain('ILIKE');
      expect(queryCall[1]).toContain('%electronics%');
    });

    it('should translate vendor information to target language', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockVendorRow] });

      mockTranslationService.translate.mockResolvedValue({
        translatedText: 'Electrónicos de Juan',
        confidence: 0.95
      });

      const options: VendorSearchOptions = {
        targetLanguage: 'es'
      };

      const result = await vendorSearchService.searchVendors({}, options);

      expect(mockTranslationService.translate).toHaveBeenCalledWith({
        text: 'John\'s Electronics',
        sourceLang: 'en',
        targetLang: 'es',
        domain: 'trade'
      });

      expect(result.vendors[0].translatedBusinessName).toBe('Electrónicos de Juan');
    });

    it('should handle pagination correctly', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '25' }] })
        .mockResolvedValueOnce({ rows: [mockVendorRow] });

      mockTranslationService.translate.mockResolvedValue({
        translatedText: 'John\'s Electronics',
        confidence: 0.95
      });

      const options: VendorSearchOptions = {
        page: 2,
        limit: 10
      };

      const result = await vendorSearchService.searchVendors({}, options);

      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);

      // Verify offset calculation
      const queryCall = mockPool.query.mock.calls[1];
      expect(queryCall[1]).toContain(10); // limit
      expect(queryCall[1]).toContain(10); // offset (page 2 - 1) * limit
    });
  });

  describe('findNearbyVendors', () => {
    it('should find vendors near a specific location', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      mockTranslationService.translate.mockResolvedValue({
        translatedText: 'Test',
        confidence: 0.95
      });

      const location: Location = {
        latitude: 40.7128,
        longitude: -74.0060
      };

      const result = await vendorSearchService.findNearbyVendors(location, 5);

      expect(result.searchLocation).toEqual(location);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('searchByCategory', () => {
    it('should search vendors by category', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      mockTranslationService.translate.mockResolvedValue({
        translatedText: 'Test',
        confidence: 0.95
      });

      await vendorSearchService.searchByCategory('Electronics');

      const queryCall = mockPool.query.mock.calls[1];
      expect(queryCall[0]).toContain('category =');
      expect(queryCall[1]).toContain('Electronics');
    });
  });

  describe('getRecommendations', () => {
    it('should get vendor recommendations based on user preferences', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      mockTranslationService.translate.mockResolvedValue({
        translatedText: 'Test',
        confidence: 0.95
      });

      const userLocation: Location = {
        latitude: 40.7128,
        longitude: -74.0060
      };

      const userLanguages = ['en', 'es'];
      const preferredCategories = ['Electronics'];

      await vendorSearchService.getRecommendations(
        userLocation,
        userLanguages,
        preferredCategories
      );

      const queryCall = mockPool.query.mock.calls[1];
      expect(queryCall[0]).toContain('supported_languages &&');
      expect(queryCall[0]).toContain('average_rating >=');
      expect(queryCall[1]).toContain(userLanguages);
      expect(queryCall[1]).toContain(3.0); // minimum rating for recommendations
    });
  });

  describe('getPopularCategories', () => {
    it('should get popular categories without location filter', async () => {
      const mockCategories = [
        { category: 'Electronics', count: '50' },
        { category: 'Clothing', count: '30' },
        { category: 'Food', count: '25' }
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockCategories });

      const result = await vendorSearchService.getPopularCategories();

      expect(result).toEqual([
        { category: 'Electronics', count: 50 },
        { category: 'Clothing', count: 30 },
        { category: 'Food', count: 25 }
      ]);

      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should get popular categories with location filter', async () => {
      const mockCategories = [
        { category: 'Electronics', count: '20' }
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockCategories });

      const location: Location = {
        latitude: 40.7128,
        longitude: -74.0060
      };

      const result = await vendorSearchService.getPopularCategories(location, 10);

      expect(result).toEqual([
        { category: 'Electronics', count: 20 }
      ]);

      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).toContain('6371 * acos'); // Distance calculation
      expect(queryCall[1]).toContain(location.latitude);
      expect(queryCall[1]).toContain(location.longitude);
      expect(queryCall[1]).toContain(10); // radius
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(vendorSearchService.searchVendors()).rejects.toThrow('Database connection failed');
    });

    it('should handle translation errors gracefully', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [
          {
            ...mockVendorRow,
            preferred_language: 'fr'
          }
        ] });

      mockTranslationService.translate.mockRejectedValueOnce(new Error('Translation failed'));

      const options: VendorSearchOptions = {
        targetLanguage: 'en'
      };

      const result = await vendorSearchService.searchVendors({}, options);

      // Should still return results even if translation fails
      expect(result.vendors).toHaveLength(1);
      expect(result.vendors[0].translatedBusinessName).toBe('John\'s Electronics'); // Falls back to original
    });
  });
});