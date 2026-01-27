// MongoDB collections setup for analytics and unstructured data
// Run this script to create collections with proper indexes

// Market analytics collection
db.createCollection("market_analytics", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["productCategory", "region", "averagePrice", "lastUpdated"],
      properties: {
        productCategory: {
          bsonType: "string",
          description: "Product category for market analysis"
        },
        region: {
          bsonType: "string",
          description: "Geographic region for the market data"
        },
        averagePrice: {
          bsonType: "number",
          minimum: 0,
          description: "Average price in the market"
        },
        priceRange: {
          bsonType: "object",
          properties: {
            min: { bsonType: "number", minimum: 0 },
            max: { bsonType: "number", minimum: 0 }
          }
        },
        transactionVolume: {
          bsonType: "int",
          minimum: 0,
          description: "Number of transactions in the period"
        },
        seasonalTrends: {
          bsonType: "array",
          items: {
            bsonType: "object",
            properties: {
              season: { bsonType: "string" },
              averagePrice: { bsonType: "number" },
              volume: { bsonType: "int" },
              trend: { bsonType: "string", enum: ["increasing", "decreasing", "stable"] }
            }
          }
        },
        competitorCount: {
          bsonType: "int",
          minimum: 0
        },
        demandLevel: {
          bsonType: "string",
          enum: ["low", "medium", "high"]
        },
        lastUpdated: {
          bsonType: "date",
          description: "When this data was last updated"
        }
      }
    }
  }
});

// User behavior analytics collection
db.createCollection("user_behavior_analytics", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "lastUpdated"],
      properties: {
        userId: {
          bsonType: "string",
          description: "User identifier"
        },
        sessionDuration: {
          bsonType: "number",
          minimum: 0,
          description: "Average session duration in minutes"
        },
        messagesPerSession: {
          bsonType: "number",
          minimum: 0,
          description: "Average messages per trading session"
        },
        negotiationSuccessRate: {
          bsonType: "number",
          minimum: 0,
          maximum: 1,
          description: "Success rate of negotiations (0-1)"
        },
        preferredCategories: {
          bsonType: "array",
          items: { bsonType: "string" },
          description: "Most frequently browsed/purchased categories"
        },
        averageTransactionValue: {
          bsonType: "number",
          minimum: 0,
          description: "Average value of completed transactions"
        },
        languageUsagePatterns: {
          bsonType: "object",
          description: "Language usage frequency map"
        },
        lastUpdated: {
          bsonType: "date",
          description: "When this analytics data was last updated"
        }
      }
    }
  }
});

// Price history collection for ML training
db.createCollection("price_history", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["productId", "category", "finalPrice", "timestamp"],
      properties: {
        productId: {
          bsonType: "string",
          description: "Product identifier"
        },
        vendorId: {
          bsonType: "string",
          description: "Vendor identifier"
        },
        category: {
          bsonType: "string",
          description: "Product category"
        },
        initialPrice: {
          bsonType: "number",
          minimum: 0,
          description: "Initial asking price"
        },
        finalPrice: {
          bsonType: "number",
          minimum: 0,
          description: "Final agreed price"
        },
        attributes: {
          bsonType: "object",
          properties: {
            quality: { bsonType: "string", enum: ["basic", "standard", "premium"] },
            quantity: { bsonType: "number", minimum: 0 },
            unit: { bsonType: "string" },
            seasonality: { bsonType: "string", enum: ["high", "medium", "low"] },
            perishable: { bsonType: "bool" }
          }
        },
        location: {
          bsonType: "object",
          properties: {
            latitude: { bsonType: "number" },
            longitude: { bsonType: "number" },
            city: { bsonType: "string" },
            country: { bsonType: "string" }
          }
        },
        negotiationRounds: {
          bsonType: "int",
          minimum: 0,
          description: "Number of negotiation rounds"
        },
        marketConditions: {
          bsonType: "object",
          properties: {
            season: { bsonType: "string", enum: ["spring", "summer", "autumn", "winter"] },
            demand: { bsonType: "string", enum: ["low", "medium", "high"] },
            supply: { bsonType: "string", enum: ["low", "medium", "high"] }
          }
        },
        timestamp: {
          bsonType: "date",
          description: "When the transaction was completed"
        }
      }
    }
  }
});

// Market conditions collection
db.createCollection("market_conditions", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["category", "lastUpdated"],
      properties: {
        category: {
          bsonType: "string",
          description: "Product category"
        },
        season: {
          bsonType: "string",
          enum: ["spring", "summer", "autumn", "winter"],
          description: "Current season"
        },
        demand: {
          bsonType: "string",
          enum: ["low", "medium", "high"],
          description: "Current demand level"
        },
        supply: {
          bsonType: "string",
          enum: ["low", "medium", "high"],
          description: "Current supply level"
        },
        economicIndicators: {
          bsonType: "object",
          description: "Various economic indicators affecting the market"
        },
        region: {
          bsonType: "string",
          description: "Geographic region"
        },
        lastUpdated: {
          bsonType: "date",
          description: "When conditions were last updated"
        }
      }
    }
  }
});

// Competitor prices collection
db.createCollection("competitor_prices", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["category", "price", "region", "timestamp"],
      properties: {
        category: {
          bsonType: "string",
          description: "Product category"
        },
        productName: {
          bsonType: "string",
          description: "Product name or description"
        },
        price: {
          bsonType: "number",
          minimum: 0,
          description: "Competitor price"
        },
        currency: {
          bsonType: "string",
          description: "Price currency"
        },
        quality: {
          bsonType: "string",
          enum: ["basic", "standard", "premium"],
          description: "Product quality level"
        },
        source: {
          bsonType: "string",
          description: "Data source (competitor name or platform)"
        },
        region: {
          bsonType: "string",
          description: "Geographic region"
        },
        timestamp: {
          bsonType: "date",
          description: "When the price was recorded"
        }
      }
    }
  }
});

// Translation cache collection (for frequently used translations)
db.createCollection("translation_cache", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["sourceText", "sourceLang", "targetLang", "translatedText", "createdAt"],
      properties: {
        sourceText: {
          bsonType: "string",
          description: "Original text to translate"
        },
        sourceLang: {
          bsonType: "string",
          description: "Source language code"
        },
        targetLang: {
          bsonType: "string",
          description: "Target language code"
        },
        translatedText: {
          bsonType: "string",
          description: "Translated text"
        },
        confidence: {
          bsonType: "number",
          minimum: 0,
          maximum: 1,
          description: "Translation confidence score"
        },
        context: {
          bsonType: "string",
          description: "Translation context (trade, negotiation, general)"
        },
        usageCount: {
          bsonType: "int",
          minimum: 0,
          description: "How many times this translation was used"
        },
        createdAt: {
          bsonType: "date",
          description: "When the translation was cached"
        },
        lastUsed: {
          bsonType: "date",
          description: "When the translation was last used"
        }
      }
    }
  }
});

// Create indexes for performance

// Market analytics indexes
db.market_analytics.createIndex({ "productCategory": 1, "region": 1 });
db.market_analytics.createIndex({ "lastUpdated": -1 });
db.market_analytics.createIndex({ "averagePrice": 1 });

// User behavior analytics indexes
db.user_behavior_analytics.createIndex({ "userId": 1 }, { unique: true });
db.user_behavior_analytics.createIndex({ "lastUpdated": -1 });
db.user_behavior_analytics.createIndex({ "preferredCategories": 1 });

// Price history indexes
db.price_history.createIndex({ "category": 1, "timestamp": -1 });
db.price_history.createIndex({ "productId": 1 });
db.price_history.createIndex({ "vendorId": 1 });
db.price_history.createIndex({ "attributes.quality": 1 });
db.price_history.createIndex({ "location.city": 1 });
db.price_history.createIndex({ "finalPrice": 1 });

// Market conditions indexes
db.market_conditions.createIndex({ "category": 1 }, { unique: true });
db.market_conditions.createIndex({ "lastUpdated": -1 });
db.market_conditions.createIndex({ "region": 1 });

// Competitor prices indexes
db.competitor_prices.createIndex({ "category": 1, "region": 1 });
db.competitor_prices.createIndex({ "timestamp": -1 });
db.competitor_prices.createIndex({ "price": 1 });
db.competitor_prices.createIndex({ "quality": 1 });

// Translation cache indexes
db.translation_cache.createIndex({ 
  "sourceText": "text", 
  "sourceLang": 1, 
  "targetLang": 1 
}, { unique: true });
db.translation_cache.createIndex({ "usageCount": -1 });
db.translation_cache.createIndex({ "lastUsed": -1 });
db.translation_cache.createIndex({ "createdAt": 1 }, { expireAfterSeconds: 2592000 }); // 30 days TTL

print("MongoDB collections and indexes created successfully!");
print("Collections created:");
print("- market_analytics");
print("- user_behavior_analytics");
print("- price_history");
print("- market_conditions");
print("- competitor_prices");
print("- translation_cache");
print("");
print("All collections have appropriate indexes for optimal query performance.");