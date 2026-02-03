import { PriceAnalyzer } from '../../services/pricing/PriceAnalyzer';
import { PriceDiscoveryRequest, ProductAttributes, Location } from '../../types';
import { getRedisClient, getMongoDb } from '../../config/database';

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../utils/logger');

const mockRedis = {
  get: jest.fn(),
  setEx: jest.fn(),
  keys: jest.fn(),
  del: jest.fn()
};

const mockDb = {
  collection: jest.fn()
};

const mockCollection = {
  find: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
  aggregate: jest.fn(),
  countDocuments: jest.fn()
};

(getRedisClient as jest.Mock).mockReturnValue(mockRedis);
(getMongoDb as jest.Mock).mockReturnValue(mockDb);

describe('PriceAnalyzer', () => {
  let priceAnalyzer: PriceAnalyzer;
  let mockRequest: PriceDiscoveryRequest;

  beforeEach(() => {
    priceAnalyzer = new PriceAnalyzer();
    
    mockRequest = {
      productId: 'test-product-123',
      category: 'electronics',
      attributes: {
        quality: 'standard',
        quantity: 1,
        unit: 'piece',
        seasonality: 'medium',
        perishable: false
      } as ProductAttributes,
      vendorLocation: {
        latitude: 40.7128,
        longitude: -74.0060,
        city: 'New York',
        country: 'USA'
      } as Location
    };

    // Reset mocks
    jest.clearAllMocks();
    mockDb.collection.mockReturnValue(mockCollection);
  });

  describe('generateMLPriceRecommendation', () => {
    it('should generate ML price recommendation successfully', async () => {
      // Mock cache miss
      mockRedis.get.mockResolvedValue(null);
      
      // Mock historical data
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([
            { finalPrice: 100, timestamp: new Date(), attributes: { quality: 'standard' } },
            { finalPrice: 110, timestamp: new Date(), attributes: { quality: 'standard' } },
            { finalPrice: 95, timestamp: new Date(), attributes: { quality: 'standard' } }
          ])
        })
      });

      // Mock market conditions
      mockCollection.findOne.mockResolvedValue({
        category: 'electronics',
        supply: 'medium',
        demand: 'high',
        season: 'summer'
      });

      // Mock competitor data
      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { price: 105, name: 'Competitor A' },
          { price: 98, name: 'Competitor B' }
        ])
      });

      // Mock transactions
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([
            { finalPrice: 102, completedAt: new Date(), category: 'electronics' },
            { finalPrice: 108, completedAt: new Date(), category: 'electronics' }
          ])
        })
      });

      const result = await priceAnalyzer.generateMLPriceRecommendation(mockRequest);

      expect(result).toBeDefined();
      expect(result.suggestedPrice).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThanOrEqual(20);
      expect(result.confidence).toBeLessThanOrEqual(100);
      expect(result.priceRange.min).toBeLessThan(result.suggestedPrice);
      expect(result.priceRange.max).toBeGreaterThan(result.suggestedPrice);
      expect(result.factors).toBeInstanceOf(Array);
      expect(result.marketPosition).toMatch(/^(below|at|above|premium)$/);
      expect(result.lastUpdated).toBeInstanceOf(Date);
    });

    it('should return cached recommendation when available', async () => {
      const cachedRecommendation = {
        suggestedPrice: 105.50,
        priceRange: { min: 95.00, max: 116.00 },
        confidence: 85,
        factors: [],
        marketPosition: 'at' as const,
        lastUpdated: new Date()
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedRecommendation));

      const result = await priceAnalyzer.generateMLPriceRecommendation(mockRequest);

      expect(result).toEqual(cachedRecommendation);
      expect(mockDb.collection).not.toHaveBeenCalled();
    });

    it('should handle insufficient data gracefully', async () => {
      // Mock cache miss
      mockRedis.get.mockResolvedValue(null);
      
      // Mock empty data
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([])
        })
      });

      mockCollection.findOne.mockResolvedValue(null);
      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      const result = await priceAnalyzer.generateMLPriceRecommendation(mockRequest);

      expect(result).toBeDefined();
      expect(result.suggestedPrice).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(60); // Lower confidence with no data
    });

    it('should apply quality adjustments correctly', async () => {
      // Mock cache miss
      mockRedis.get.mockResolvedValue(null);
      
      // Mock basic data
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([
            { finalPrice: 100, timestamp: new Date(), attributes: { quality: 'standard' } }
          ])
        })
      });

      mockCollection.findOne.mockResolvedValue(null);
      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      // Test premium quality
      const premiumRequest = { ...mockRequest };
      premiumRequest.attributes.quality = 'premium';

      const premiumResult = await priceAnalyzer.generateMLPriceRecommendation(premiumRequest);

      // Test basic quality
      const basicRequest = { ...mockRequest };
      basicRequest.attributes.quality = 'basic';

      const basicResult = await priceAnalyzer.generateMLPriceRecommendation(basicRequest);

      // Premium should be more expensive than basic
      expect(premiumResult.suggestedPrice).toBeGreaterThan(basicResult.suggestedPrice);
    });

    it('should handle database errors gracefully', async () => {
      // Mock cache miss
      mockRedis.get.mockResolvedValue(null);
      
      // Mock database error
      mockCollection.find.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const result = await priceAnalyzer.generateMLPriceRecommendation(mockRequest);

      expect(result).toBeDefined();
      expect(result.suggestedPrice).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(50); // Lower confidence due to error
    });

    it('should cache successful recommendations', async () => {
      // Mock cache miss
      mockRedis.get.mockResolvedValue(null);
      
      // Mock minimal data for successful recommendation
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([
            { finalPrice: 100, timestamp: new Date(), attributes: { quality: 'standard' } }
          ])
        })
      });

      mockCollection.findOne.mockResolvedValue(null);
      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      await priceAnalyzer.generateMLPriceRecommendation(mockRequest);

      expect(mockRedis.setEx).toHaveBeenCalledWith(
        expect.any(String),
        600, // TTL
        expect.any(String)
      );
    });
  });

  describe('ML Feature Engineering', () => {
    it('should extract features correctly', async () => {
      // This tests the private extractMLFeatures method indirectly
      mockRedis.get.mockResolvedValue(null);
      
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([
            { finalPrice: 100, timestamp: new Date(), attributes: { quality: 'premium' } }
          ])
        })
      });

      mockCollection.findOne.mockResolvedValue({
        inflationRate: 2.5,
        gdpGrowth: 3.2,
        unemploymentRate: 4.1
      });

      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { price: 105, name: 'Competitor A' },
          { price: 98, name: 'Competitor B' }
        ])
      });

      const result = await priceAnalyzer.generateMLPriceRecommendation(mockRequest);

      expect(result).toBeDefined();
      expect(result.factors.length).toBeGreaterThan(0);
      
      // Should have quality factor for premium quality
      const qualityFactor = result.factors.find(f => f.name === 'Quality');
      expect(qualityFactor).toBeDefined();
    });
  });

  describe('Seasonal Integration', () => {
    it('should apply seasonal adjustments', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      // Mock seasonal data
      mockCollection.aggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          {
            _id: 'summer',
            averagePrice: 120,
            volume: 50,
            prices: [115, 120, 125]
          }
        ])
      });

      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([
            { finalPrice: 100, timestamp: new Date(), attributes: { quality: 'standard' } }
          ])
        })
      });

      mockCollection.findOne.mockResolvedValue(null);
      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      // Set seasonality to high for summer products
      const seasonalRequest = { ...mockRequest };
      seasonalRequest.attributes.seasonality = 'high';

      const result = await priceAnalyzer.generateMLPriceRecommendation(seasonalRequest);

      expect(result).toBeDefined();
      
      // Should have seasonal factor
      const seasonalFactor = result.factors.find(f => f.name.includes('Season'));
      expect(seasonalFactor).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis cache errors gracefully', async () => {
      // Mock Redis error
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));
      
      // Mock basic data
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([
            { finalPrice: 100, timestamp: new Date(), attributes: { quality: 'standard' } }
          ])
        })
      });

      mockCollection.findOne.mockResolvedValue(null);
      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      const result = await priceAnalyzer.generateMLPriceRecommendation(mockRequest);

      expect(result).toBeDefined();
      expect(result.suggestedPrice).toBeGreaterThan(0);
    });

    it('should handle cache storage errors gracefully', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setEx.mockRejectedValue(new Error('Cache storage failed'));
      
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([
            { finalPrice: 100, timestamp: new Date(), attributes: { quality: 'standard' } }
          ])
        })
      });

      mockCollection.findOne.mockResolvedValue(null);
      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      const result = await priceAnalyzer.generateMLPriceRecommendation(mockRequest);

      expect(result).toBeDefined();
      expect(result.suggestedPrice).toBeGreaterThan(0);
    });
  });

  describe('Market Position Analysis', () => {
    it('should determine market position correctly', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      // Mock competitor data with known prices
      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { price: 100, name: 'Competitor A' },
          { price: 110, name: 'Competitor B' },
          { price: 90, name: 'Competitor C' }
        ])
      });

      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([
            { finalPrice: 100, timestamp: new Date(), attributes: { quality: 'standard' } }
          ])
        })
      });

      mockCollection.findOne.mockResolvedValue(null);

      const result = await priceAnalyzer.generateMLPriceRecommendation(mockRequest);

      expect(result.marketPosition).toMatch(/^(below|at|above|premium)$/);
    });
  });
});