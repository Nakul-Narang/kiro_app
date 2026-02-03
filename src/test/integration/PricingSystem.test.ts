import { EnhancedPricingService } from '../../services/pricing';
import { PriceDiscoveryRequest, ProductAttributes, Location } from '../../types';
import { getRedisClient, getMongoDb } from '../../config/database';

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../utils/logger');

describe('Pricing System Integration Tests', () => {
  let enhancedPricingService: EnhancedPricingService;
  let mockRedis: any;
  let mockDb: any;
  let mockCollection: any;

  beforeEach(() => {
    // Setup mocks
    mockRedis = {
      get: jest.fn(),
      setEx: jest.fn(),
      keys: jest.fn(),
      del: jest.fn()
    };

    mockCollection = {
      find: jest.fn(),
      findOne: jest.fn(),
      updateOne: jest.fn(),
      aggregate: jest.fn(),
      countDocuments: jest.fn(),
      distinct: jest.fn(),
      deleteMany: jest.fn()
    };

    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection)
    };

    (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
    (getMongoDb as jest.Mock).mockReturnValue(mockDb);

    enhancedPricingService = new EnhancedPricingService();
    
    jest.clearAllMocks();
  });

  describe('End-to-End Price Recommendation Flow', () => {
    it('should generate comprehensive price recommendations with all components', async () => {
      const request: PriceDiscoveryRequest = {
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

      // Mock cache misses to force fresh calculations
      mockRedis.get.mockResolvedValue(null);

      // Mock historical pricing data
      mockCollection.find.mockImplementation((query: any) => {
        if (query.category === 'electronics') {
          return {
            sort: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([
                { 
                  finalPrice: 100, 
                  timestamp: new Date('2024-01-15'), 
                  attributes: { quality: 'standard' },
                  completedAt: new Date('2024-01-15'),
                  status: 'completed'
                },
                { 
                  finalPrice: 110, 
                  timestamp: new Date('2024-02-15'), 
                  attributes: { quality: 'standard' },
                  completedAt: new Date('2024-02-15'),
                  status: 'completed'
                },
                { 
                  finalPrice: 95, 
                  timestamp: new Date('2024-03-15'), 
                  attributes: { quality: 'standard' },
                  completedAt: new Date('2024-03-15'),
                  status: 'completed'
                }
              ])
            }),
            toArray: jest.fn().mockResolvedValue([
              { price: 105, name: 'Competitor A', region: 'New York' },
              { price: 98, name: 'Competitor B', region: 'New York' }
            ])
          };
        }
        return {
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          }),
          toArray: jest.fn().mockResolvedValue([])
        };
      });

      // Mock market conditions
      mockCollection.findOne.mockImplementation((query: any) => {
        if (query.category === 'electronics') {
          return {
            category: 'electronics',
            supply: 'medium',
            demand: 'high',
            season: 'summer',
            lastUpdated: new Date()
          };
        }
        if (query.region === 'New York') {
          return {
            inflationRate: 2.5,
            gdpGrowth: 3.2,
            unemploymentRate: 4.1,
            region: 'New York',
            date: new Date()
          };
        }
        return null;
      });

      // Mock seasonal aggregation
      mockCollection.aggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          {
            _id: 'summer',
            averagePrice: 108,
            volume: 25,
            prices: [105, 108, 112]
          },
          {
            _id: 'winter',
            averagePrice: 95,
            volume: 15,
            prices: [92, 95, 98]
          }
        ])
      });

      // Mock market analytics collection
      mockCollection.distinct.mockResolvedValue(['electronics', 'food', 'clothing']);
      mockCollection.countDocuments.mockResolvedValue(150);

      const recommendation = await enhancedPricingService.generateComprehensivePriceRecommendation(request);

      // Verify comprehensive recommendation structure
      expect(recommendation).toBeDefined();
      expect(typeof recommendation.suggestedPrice).toBe('number');
      expect(recommendation.suggestedPrice).toBeGreaterThan(0);
      
      // Should have price range
      expect(recommendation.priceRange).toBeDefined();
      expect(recommendation.priceRange.min).toBeLessThan(recommendation.suggestedPrice);
      expect(recommendation.priceRange.max).toBeGreaterThan(recommendation.suggestedPrice);
      
      // Should have reasonable confidence
      expect(recommendation.confidence).toBeGreaterThanOrEqual(30);
      expect(recommendation.confidence).toBeLessThanOrEqual(100);
      
      // Should have multiple factors considered
      expect(recommendation.factors).toBeInstanceOf(Array);
      expect(recommendation.factors.length).toBeGreaterThan(0);
      
      // Should determine market position
      expect(['below', 'at', 'above', 'premium']).toContain(recommendation.marketPosition);
      
      // Should have recent timestamp
      expect(recommendation.lastUpdated).toBeInstanceOf(Date);
      expect(Date.now() - recommendation.lastUpdated.getTime()).toBeLessThan(5000);
    });

    it('should handle fallback when ML analysis fails', async () => {
      const request: PriceDiscoveryRequest = {
        productId: 'test-product-456',
        category: 'food',
        attributes: {
          quality: 'premium',
          quantity: 5,
          unit: 'kg',
          perishable: true
        } as ProductAttributes,
        vendorLocation: {
          latitude: 34.0522,
          longitude: -118.2437,
          city: 'Los Angeles',
          country: 'USA'
        } as Location
      };

      // Mock cache miss
      mockRedis.get.mockResolvedValue(null);

      // Mock database error for ML analysis
      mockCollection.find.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      // Mock basic pricing data still works
      mockCollection.findOne.mockResolvedValue(null);

      const recommendation = await enhancedPricingService.generateComprehensivePriceRecommendation(request);

      // Should still generate a recommendation despite ML failure
      expect(recommendation).toBeDefined();
      expect(recommendation.suggestedPrice).toBeGreaterThan(0);
      expect(recommendation.confidence).toBeGreaterThan(0);
      
      // Confidence should be lower due to fallback
      expect(recommendation.confidence).toBeLessThan(70);
    });
  });

  describe('Market Data Collection Integration', () => {
    it('should collect and analyze market data across categories', async () => {
      // Mock active categories
      mockCollection.distinct.mockResolvedValue(['electronics', 'food', 'clothing']);

      // Mock transaction data for each category
      mockCollection.find.mockImplementation((query: any) => {
        const mockTransactions = [
          { 
            finalPrice: 100, 
            completedAt: new Date('2024-01-15'), 
            category: query.category,
            status: 'completed' 
          },
          { 
            finalPrice: 110, 
            completedAt: new Date('2024-02-15'), 
            category: query.category,
            status: 'completed' 
          }
        ];

        return {
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(mockTransactions)
          })
        };
      });

      // Mock competitor data
      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { price: 105, name: 'Competitor A' },
          { price: 98, name: 'Competitor B' }
        ])
      });

      // Mock seasonal aggregation
      mockCollection.aggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          {
            _id: 'summer',
            averagePrice: 105,
            volume: 20,
            prices: [100, 105, 110]
          }
        ])
      });

      // Mock global indicators
      mockCollection.countDocuments.mockResolvedValue(500);

      await enhancedPricingService.collectMarketData();

      // Verify market data collection calls
      expect(mockCollection.distinct).toHaveBeenCalled();
      expect(mockCollection.updateOne).toHaveBeenCalled();
      expect(mockDb.collection).toHaveBeenCalledWith('market_analytics');
      expect(mockDb.collection).toHaveBeenCalledWith('global_market_indicators');
    });

    it('should provide market analytics for specific categories', async () => {
      const category = 'electronics';
      
      // Mock cached analytics
      mockRedis.get.mockResolvedValue(JSON.stringify({
        productCategory: category,
        region: 'global',
        averagePrice: 105.50,
        priceRange: { min: 85.00, max: 125.00 },
        transactionVolume: 150,
        seasonalTrends: [
          { season: 'summer', averagePrice: 108, volume: 40, trend: 'stable' }
        ],
        competitorCount: 5,
        demandLevel: 'medium',
        lastUpdated: new Date()
      }));

      const analytics = await enhancedPricingService.getMarketAnalytics(category);

      expect(analytics).toBeDefined();
      expect(analytics!.productCategory).toBe(category);
      expect(analytics!.averagePrice).toBeGreaterThan(0);
      expect(analytics!.transactionVolume).toBeGreaterThanOrEqual(0);
      expect(analytics!.seasonalTrends).toBeInstanceOf(Array);
    });
  });

  describe('Seasonal Analysis Integration', () => {
    it('should perform comprehensive seasonal analysis', async () => {
      const category = 'food';
      const location = {
        latitude: 41.8781,
        longitude: -87.6298,
        city: 'Chicago',
        country: 'USA'
      };

      // Mock cache miss
      mockRedis.get.mockResolvedValue(null);

      // Mock historical transaction data
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([
            { 
              finalPrice: 50, 
              completedAt: new Date('2023-06-15'), 
              category,
              status: 'completed' 
            },
            { 
              finalPrice: 45, 
              completedAt: new Date('2023-12-15'), 
              category,
              status: 'completed' 
            },
            { 
              finalPrice: 55, 
              completedAt: new Date('2024-06-15'), 
              category,
              status: 'completed' 
            }
          ])
        })
      });

      const seasonalData = await enhancedPricingService.getSeasonalAnalysis(category, location);

      expect(seasonalData).toBeInstanceOf(Array);
      
      if (seasonalData.length > 0) {
        seasonalData.forEach(data => {
          expect(data.season).toMatch(/^(spring|summer|autumn|winter)$/);
          expect(typeof data.averagePrice).toBe('number');
          expect(data.averagePrice).toBeGreaterThanOrEqual(0);
          expect(typeof data.volume).toBe('number');
          expect(data.volume).toBeGreaterThanOrEqual(0);
          expect(data.trend).toMatch(/^(increasing|decreasing|stable)$/);
        });
      }
    });

    it('should provide seasonal multipliers for current period', async () => {
      const category = 'clothing';
      const location = {
        latitude: 25.7617,
        longitude: -80.1918,
        city: 'Miami',
        country: 'USA'
      };

      // Mock seasonal analysis cache
      mockRedis.get.mockResolvedValue(JSON.stringify([
        {
          season: 'summer',
          averagePrice: 75,
          volume: 100,
          trend: 'stable',
          seasonalIndex: 1.1
        },
        {
          season: 'winter',
          averagePrice: 85,
          volume: 120,
          trend: 'increasing',
          seasonalIndex: 1.2
        }
      ]));

      // Mock monthly data
      mockCollection.find.mockReturnValue({
        limit: jest.fn().mockResolvedValue([
          { finalPrice: 80, completedAt: new Date() }
        ])
      });

      const multipliers = await enhancedPricingService.getSeasonalMultipliers(category, location);

      expect(multipliers).toBeDefined();
      expect(typeof multipliers.seasonal).toBe('number');
      expect(typeof multipliers.monthly).toBe('number');
      expect(typeof multipliers.trend).toBe('number');
      expect(typeof multipliers.confidence).toBe('number');
      expect(multipliers.confidence).toBeGreaterThanOrEqual(0);
      expect(multipliers.confidence).toBeLessThanOrEqual(1);
      expect(multipliers.season).toMatch(/^(spring|summer|autumn|winter)$/);
      expect(typeof multipliers.month).toBe('number');
      expect(multipliers.month).toBeGreaterThanOrEqual(1);
      expect(multipliers.month).toBeLessThanOrEqual(12);
    });
  });

  describe('Price Trend Analysis Integration', () => {
    it('should analyze price trends across different timeframes', async () => {
      const category = 'electronics';
      const timeframes: ('week' | 'month' | 'quarter' | 'year')[] = ['week', 'month', 'quarter', 'year'];

      for (const timeframe of timeframes) {
        // Mock aggregation results
        mockCollection.aggregate.mockReturnValue({
          toArray: jest.fn().mockResolvedValue([
            {
              _id: '2024-01',
              averagePrice: 100,
              minPrice: 85,
              maxPrice: 115,
              volume: 25,
              totalValue: 2500
            },
            {
              _id: '2024-02',
              averagePrice: 105,
              minPrice: 90,
              maxPrice: 120,
              volume: 30,
              totalValue: 3150
            }
          ])
        });

        const trendAnalysis = await enhancedPricingService.analyzePriceTrends(category, timeframe);

        expect(trendAnalysis).toBeDefined();
        expect(trendAnalysis.category).toBe(category);
        expect(trendAnalysis.timeframe).toBe(timeframe);
        expect(trendAnalysis.trends).toBeInstanceOf(Array);
        expect(trendAnalysis.analysis).toBeDefined();
        expect(trendAnalysis.analysis.direction).toMatch(/^(increasing|decreasing|stable)$/);
        expect(typeof trendAnalysis.analysis.strength).toBe('number');
        expect(trendAnalysis.lastUpdated).toBeInstanceOf(Date);
      }
    });
  });

  describe('Competitive Intelligence Integration', () => {
    it('should provide competitive intelligence analysis', async () => {
      const category = 'electronics';
      const region = 'California';

      // Mock competitor data
      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { 
            price: 100, 
            name: 'TechCorp', 
            region,
            lastUpdated: new Date(),
            priceCategory: 'mid'
          },
          { 
            price: 120, 
            name: 'PremiumTech', 
            region,
            lastUpdated: new Date(),
            priceCategory: 'premium'
          },
          { 
            price: 85, 
            name: 'BudgetElectronics', 
            region,
            lastUpdated: new Date(),
            priceCategory: 'budget'
          }
        ])
      });

      const competitiveIntel = await enhancedPricingService.getCompetitiveIntelligence(category, region);

      expect(competitiveIntel).toBeDefined();
      expect(competitiveIntel.category).toBe(category);
      expect(competitiveIntel.region).toBe(region);
      expect(competitiveIntel.competitorCount).toBeGreaterThan(0);
      expect(competitiveIntel.priceAnalysis).toBeDefined();
      expect(competitiveIntel.priceAnalysis.average).toBeGreaterThan(0);
      expect(competitiveIntel.priceAnalysis.min).toBeLessThanOrEqual(competitiveIntel.priceAnalysis.average);
      expect(competitiveIntel.priceAnalysis.max).toBeGreaterThanOrEqual(competitiveIntel.priceAnalysis.average);
      expect(competitiveIntel.competitors).toBeInstanceOf(Array);
      expect(competitiveIntel.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle database connection failures gracefully', async () => {
      const request: PriceDiscoveryRequest = {
        productId: 'test-product-error',
        category: 'electronics',
        attributes: {
          quality: 'standard',
          quantity: 1,
          unit: 'piece',
          perishable: false
        } as ProductAttributes,
        vendorLocation: {
          latitude: 40.7128,
          longitude: -74.0060,
          city: 'New York',
          country: 'USA'
        } as Location
      };

      // Mock database failure
      mockDb.collection.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const recommendation = await enhancedPricingService.generateComprehensivePriceRecommendation(request);

      // Should still provide a recommendation despite database errors
      expect(recommendation).toBeDefined();
      expect(recommendation.suggestedPrice).toBeGreaterThan(0);
      expect(recommendation.confidence).toBeGreaterThan(0);
    });

    it('should handle Redis cache failures gracefully', async () => {
      const request: PriceDiscoveryRequest = {
        productId: 'test-product-cache-error',
        category: 'food',
        attributes: {
          quality: 'premium',
          quantity: 2,
          unit: 'kg',
          perishable: true
        } as ProductAttributes,
        vendorLocation: {
          latitude: 34.0522,
          longitude: -118.2437,
          city: 'Los Angeles',
          country: 'USA'
        } as Location
      };

      // Mock Redis failure
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));
      mockRedis.setEx.mockRejectedValue(new Error('Redis storage failed'));

      // Mock successful database operations
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([
            { finalPrice: 25, timestamp: new Date(), attributes: { quality: 'premium' } }
          ])
        }),
        toArray: jest.fn().mockResolvedValue([])
      });

      mockCollection.findOne.mockResolvedValue(null);

      const recommendation = await enhancedPricingService.generateComprehensivePriceRecommendation(request);

      // Should work despite cache failures
      expect(recommendation).toBeDefined();
      expect(recommendation.suggestedPrice).toBeGreaterThan(0);
    });
  });

  describe('Performance and Scalability', () => {
    it('should complete price recommendations within acceptable time limits', async () => {
      const request: PriceDiscoveryRequest = {
        productId: 'test-product-performance',
        category: 'electronics',
        attributes: {
          quality: 'standard',
          quantity: 1,
          unit: 'piece',
          perishable: false
        } as ProductAttributes,
        vendorLocation: {
          latitude: 40.7128,
          longitude: -74.0060,
          city: 'New York',
          country: 'USA'
        } as Location
      };

      // Mock realistic data volumes
      const largeDataSet = Array.from({ length: 1000 }, (_, i) => ({
        finalPrice: 100 + (i % 50),
        timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        attributes: { quality: 'standard' },
        completedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        status: 'completed'
      }));

      mockRedis.get.mockResolvedValue(null);
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(largeDataSet.slice(0, 100))
        }),
        toArray: jest.fn().mockResolvedValue([])
      });

      mockCollection.findOne.mockResolvedValue(null);

      const startTime = Date.now();
      const recommendation = await enhancedPricingService.generateComprehensivePriceRecommendation(request);
      const processingTime = Date.now() - startTime;

      // Should complete within 5 seconds as per requirements
      expect(processingTime).toBeLessThan(5000);
      expect(recommendation).toBeDefined();
      expect(recommendation.suggestedPrice).toBeGreaterThan(0);
    });
  });
});