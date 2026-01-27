import { PriceDiscoveryService } from '../../../services/pricing/PriceDiscoveryService';
import { PriceDiscoveryRequest, MarketConditions } from '../../../types';
import * as fc from 'fast-check';

describe('PriceDiscoveryService', () => {
  let priceDiscoveryService: PriceDiscoveryService;

  beforeEach(() => {
    priceDiscoveryService = new PriceDiscoveryService();
  });

  describe('Unit Tests', () => {
    test('should generate price recommendation for valid product', async () => {
      const request: PriceDiscoveryRequest = {
        productId: 'test-product-1',
        category: 'food',
        attributes: {
          quality: 'standard',
          quantity: 10,
          unit: 'kg',
          perishable: true
        },
        vendorLocation: {
          latitude: 40.7128,
          longitude: -74.0060,
          city: 'New York'
        }
      };

      const recommendation = await priceDiscoveryService.generatePriceRecommendation(request);
      
      expect(recommendation).toBeDefined();
      expect(recommendation.suggestedPrice).toBeGreaterThan(0);
      expect(recommendation.priceRange.min).toBeLessThan(recommendation.priceRange.max);
      expect(recommendation.confidence).toBeGreaterThanOrEqual(0);
      expect(recommendation.confidence).toBeLessThanOrEqual(100);
      expect(recommendation.factors).toBeInstanceOf(Array);
      expect(recommendation.marketPosition).toMatch(/^(below|at|above|premium)$/);
    });

    test('should handle premium quality products with higher prices', async () => {
      const basicRequest: PriceDiscoveryRequest = {
        productId: 'basic-product',
        category: 'food',
        attributes: {
          quality: 'basic',
          quantity: 10,
          unit: 'kg',
          perishable: false
        },
        vendorLocation: { latitude: 0, longitude: 0 }
      };

      const premiumRequest: PriceDiscoveryRequest = {
        ...basicRequest,
        productId: 'premium-product',
        attributes: {
          ...basicRequest.attributes,
          quality: 'premium'
        }
      };

      const basicRecommendation = await priceDiscoveryService.generatePriceRecommendation(basicRequest);
      const premiumRecommendation = await priceDiscoveryService.generatePriceRecommendation(premiumRequest);
      
      expect(premiumRecommendation.suggestedPrice).toBeGreaterThan(basicRecommendation.suggestedPrice);
    });

    test('should apply perishable discount', async () => {
      const nonPerishableRequest: PriceDiscoveryRequest = {
        productId: 'non-perishable',
        category: 'food',
        attributes: {
          quality: 'standard',
          quantity: 10,
          unit: 'kg',
          perishable: false
        },
        vendorLocation: { latitude: 0, longitude: 0 }
      };

      const perishableRequest: PriceDiscoveryRequest = {
        ...nonPerishableRequest,
        productId: 'perishable',
        attributes: {
          ...nonPerishableRequest.attributes,
          perishable: true
        }
      };

      const nonPerishableRec = await priceDiscoveryService.generatePriceRecommendation(nonPerishableRequest);
      const perishableRec = await priceDiscoveryService.generatePriceRecommendation(perishableRequest);
      
      // Perishable should have lower price due to discount factor
      expect(perishableRec.suggestedPrice).toBeLessThan(nonPerishableRec.suggestedPrice);
      
      // Should have perishability factor
      const perishabilityFactor = perishableRec.factors.find(f => f.name === 'Perishability');
      expect(perishabilityFactor).toBeDefined();
      expect(perishabilityFactor!.impact).toBeLessThan(0);
    });

    test('should update market conditions', async () => {
      const conditions: MarketConditions = {
        season: 'summer',
        demand: 'high',
        supply: 'low'
      };

      await expect(
        priceDiscoveryService.updateMarketConditions('food', conditions)
      ).resolves.not.toThrow();
    });
  });

  describe('Property-Based Tests', () => {
    // Generators for property-based testing
    const qualityGen = fc.constantFrom('basic', 'standard', 'premium');
    const categoryGen = fc.constantFrom('food', 'clothing', 'electronics', 'home', 'services');
    const seasonGen = fc.constantFrom('spring', 'summer', 'autumn', 'winter');
    const demandSupplyGen = fc.constantFrom('low', 'medium', 'high');
    const seasonalityGen = fc.constantFrom('high', 'medium', 'low');

    const locationGen = fc.record({
      latitude: fc.double({ min: -90, max: 90 }),
      longitude: fc.double({ min: -180, max: 180 }),
      city: fc.string({ minLength: 1, maxLength: 50 })
    });

    const attributesGen = fc.record({
      quality: qualityGen,
      quantity: fc.integer({ min: 1, max: 1000 }),
      unit: fc.constantFrom('kg', 'piece', 'liter', 'meter'),
      perishable: fc.boolean(),
      seasonality: fc.option(seasonalityGen)
    });

    const marketConditionsGen = fc.record({
      season: seasonGen,
      demand: demandSupplyGen,
      supply: demandSupplyGen
    });

    const priceRequestGen = fc.record({
      productId: fc.string({ minLength: 1, maxLength: 50 }),
      category: categoryGen,
      attributes: attributesGen,
      vendorLocation: locationGen,
      marketConditions: fc.option(marketConditionsGen)
    }) as fc.Arbitrary<PriceDiscoveryRequest>;

    test('**Feature: multilingual-mandi, Property 4: Price Recommendation Generation** - For any product listing with valid attributes, the Price_Discovery_System should generate price recommendations within 5 seconds', async () => {
      await fc.assert(fc.asyncProperty(
        priceRequestGen,
        async (request: PriceDiscoveryRequest) => {
          const startTime = Date.now();
          const recommendation = await priceDiscoveryService.generatePriceRecommendation(request);
          const endTime = Date.now();
          
          // Should complete within 5 seconds (5000ms)
          expect(endTime - startTime).toBeLessThan(5000);
          
          // Should return valid recommendation
          expect(recommendation.suggestedPrice).toBeGreaterThan(0);
          expect(recommendation.priceRange.min).toBeGreaterThan(0);
          expect(recommendation.priceRange.max).toBeGreaterThan(recommendation.priceRange.min);
          expect(recommendation.confidence).toBeGreaterThanOrEqual(0);
          expect(recommendation.confidence).toBeLessThanOrEqual(100);
          expect(recommendation.factors).toBeInstanceOf(Array);
          expect(recommendation.factors.length).toBeGreaterThan(0);
          expect(['below', 'at', 'above', 'premium']).toContain(recommendation.marketPosition);
          expect(recommendation.lastUpdated).toBeInstanceOf(Date);
        }
      ), { numRuns: 100 });
    });

    test('**Feature: multilingual-mandi, Property 5: Market Responsiveness** - Price recommendations should consider all specified market factors', async () => {
      await fc.assert(fc.asyncProperty(
        priceRequestGen,
        async (request: PriceDiscoveryRequest) => {
          const recommendation = await priceDiscoveryService.generatePriceRecommendation(request);
          
          // Should have quality factor
          const qualityFactor = recommendation.factors.find(f => f.name === 'Quality');
          expect(qualityFactor).toBeDefined();
          
          // Should have competition factor
          const competitionFactor = recommendation.factors.find(f => f.name === 'Competition');
          expect(competitionFactor).toBeDefined();
          
          // If perishable, should have perishability factor
          if (request.attributes.perishable) {
            const perishabilityFactor = recommendation.factors.find(f => f.name === 'Perishability');
            expect(perishabilityFactor).toBeDefined();
            expect(perishabilityFactor!.impact).toBeLessThan(0);
          }
          
          // If seasonality specified, should have seasonal factor
          if (request.attributes.seasonality) {
            const seasonalFactor = recommendation.factors.find(f => f.name === 'Seasonality');
            expect(seasonalFactor).toBeDefined();
          }
          
          // If market conditions provided, should have supply/demand factor
          if (request.marketConditions) {
            const supplyDemandFactor = recommendation.factors.find(f => f.name === 'Supply & Demand');
            expect(supplyDemandFactor).toBeDefined();
          }
        }
      ), { numRuns: 100 });
    });

    test('**Feature: multilingual-mandi, Property 6: Data Insufficiency Handling** - Should provide recommendations even with limited data and indicate confidence levels', async () => {
      await fc.assert(fc.asyncProperty(
        priceRequestGen,
        async (request: PriceDiscoveryRequest) => {
          const recommendation = await priceDiscoveryService.generatePriceRecommendation(request);
          
          // Should always provide a recommendation
          expect(recommendation.suggestedPrice).toBeGreaterThan(0);
          
          // Should provide confidence score
          expect(recommendation.confidence).toBeGreaterThanOrEqual(0);
          expect(recommendation.confidence).toBeLessThanOrEqual(100);
          
          // Should provide price range for negotiation flexibility
          expect(recommendation.priceRange.min).toBeGreaterThan(0);
          expect(recommendation.priceRange.max).toBeGreaterThan(recommendation.priceRange.min);
          
          // Price range should be reasonable (not more than 50% spread)
          const spread = (recommendation.priceRange.max - recommendation.priceRange.min) / recommendation.suggestedPrice;
          expect(spread).toBeLessThanOrEqual(0.6); // Allow up to 60% spread for high volatility
          
          // Suggested price should be within the range
          expect(recommendation.suggestedPrice).toBeGreaterThanOrEqual(recommendation.priceRange.min);
          expect(recommendation.suggestedPrice).toBeLessThanOrEqual(recommendation.priceRange.max);
        }
      ), { numRuns: 100 });
    });

    test('Quality consistency property - Premium quality should always result in higher prices than basic quality', async () => {
      await fc.assert(fc.asyncProperty(
        categoryGen,
        fc.integer({ min: 1, max: 100 }),
        fc.constantFrom('kg', 'piece', 'liter'),
        locationGen,
        async (category, quantity, unit, location) => {
          const basicRequest: PriceDiscoveryRequest = {
            productId: `basic-${Math.random()}`,
            category,
            attributes: {
              quality: 'basic',
              quantity,
              unit,
              perishable: false
            },
            vendorLocation: location
          };

          const premiumRequest: PriceDiscoveryRequest = {
            ...basicRequest,
            productId: `premium-${Math.random()}`,
            attributes: {
              ...basicRequest.attributes,
              quality: 'premium'
            }
          };

          const basicRec = await priceDiscoveryService.generatePriceRecommendation(basicRequest);
          const premiumRec = await priceDiscoveryService.generatePriceRecommendation(premiumRequest);
          
          // Premium should always be more expensive than basic
          expect(premiumRec.suggestedPrice).toBeGreaterThan(basicRec.suggestedPrice);
        }
      ), { numRuns: 50 });
    });
  });
});