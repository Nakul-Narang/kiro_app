# Real-time Inventory Synchronization System

This document describes the implementation of the real-time inventory synchronization system for the Multilingual Mandi platform, which fulfills **Requirement 4.4**: "WHEN a vendor updates their inventory, THE Mandi_Platform SHALL reflect changes in search results within 1 minute."

## Architecture Overview

The inventory synchronization system consists of three main components:

1. **InventoryEventService** - Manages event publishing and subscription
2. **InventoryService** - Enhanced product operations with event integration
3. **SearchCacheService** - Intelligent cache management with automatic invalidation

## Components

### InventoryEventService

The core event management service that handles:

- **Event Publishing**: Publishes inventory events to Redis pub/sub
- **Subscription Management**: Manages event subscribers and notifications
- **Cache Invalidation**: Automatically invalidates relevant search caches
- **WebSocket Integration**: Sends real-time notifications to connected users

#### Key Features:

- **Event Types**: `product_created`, `product_updated`, `product_deleted`, `availability_changed`, `price_changed`
- **Automatic Cache Invalidation**: Intelligently invalidates cache patterns based on product changes
- **WebSocket Notifications**: Real-time notifications to vendors and interested users
- **Subscriber Management**: Flexible subscription system for different event types

#### Usage Example:

```typescript
import { InventoryEventService } from './InventoryEventService';

const eventService = InventoryEventService.getInstance();

// Subscribe to events
eventService.subscribe({
  subscriberId: 'my-service',
  eventTypes: ['availability_changed'],
  callback: async (event) => {
    console.log('Inventory updated:', event);
  }
});

// Publish an event
await eventService.publishInventoryUpdate({
  eventType: 'availability_changed',
  productId: 'prod_123',
  vendorId: 'vendor_456',
  changes: [{
    field: 'availability',
    oldValue: 'available',
    newValue: 'out_of_stock'
  }],
  product: updatedProduct
});
```

### InventoryService

Enhanced product service that integrates with the event system:

- **Change Tracking**: Automatically tracks changes between product versions
- **Event Publishing**: Publishes appropriate events for all product operations
- **Bulk Operations**: Supports bulk availability updates with event publishing

#### Key Methods:

- `createProduct()` - Creates product and publishes `product_created` event
- `updateProduct()` - Updates product with change tracking and event publishing
- `updateAvailability()` - Updates availability and publishes `availability_changed` event
- `deleteProduct()` - Deletes product and publishes `product_deleted` event
- `bulkUpdateAvailability()` - Bulk availability updates with individual event publishing

#### Usage Example:

```typescript
import { InventoryService } from './InventoryService';

const inventoryService = new InventoryService();

// Create product (automatically publishes event)
const product = await inventoryService.createProduct({
  vendorId: 'vendor_123',
  name: 'New Product',
  category: 'electronics',
  basePrice: 99.99,
  // ... other fields
});

// Update availability (automatically publishes event)
await inventoryService.updateAvailability('prod_123', 'out_of_stock');
```

### SearchCacheService

Intelligent caching service with automatic invalidation:

- **Smart Caching**: Caches search results with configurable TTL
- **Automatic Invalidation**: Invalidates relevant caches based on inventory events
- **Cache Key Generation**: Generates consistent cache keys for identical searches
- **Size Management**: Maintains cache size limits with LRU eviction

#### Key Features:

- **Vendor Search Caching**: Caches vendor search results
- **Product Search Caching**: Caches product search results
- **Intelligent Invalidation**: Invalidates caches based on product category, price ranges, and vendor
- **Statistics**: Provides cache hit rates and usage statistics

#### Usage Example:

```typescript
import { SearchCacheService } from './SearchCacheService';

const cacheService = SearchCacheService.getInstance();

// Try to get cached results
const cached = await cacheService.getCachedProductSearch(filters, options);
if (cached) {
  return cached;
}

// Perform search and cache results
const results = await performSearch(filters, options);
await cacheService.cacheProductSearch(filters, options, results);
```

## Event Flow

1. **Product Operation**: Vendor performs product operation (create, update, delete)
2. **Change Detection**: InventoryService detects changes and determines event type
3. **Event Publishing**: Event is published to Redis pub/sub channel
4. **Cache Invalidation**: Relevant cache patterns are automatically invalidated
5. **WebSocket Notifications**: Real-time notifications sent to connected users
6. **Subscriber Notifications**: Registered subscribers receive event callbacks

## Cache Invalidation Strategy

The system uses intelligent cache invalidation patterns:

### Vendor-Specific Invalidation
- Pattern: `vendor:products:${vendorId}:*`
- Triggered by: All events for that vendor's products

### Category-Based Invalidation
- Pattern: `search:cache:category:${category}:*`
- Triggered by: Product creation, deletion, or category changes

### Price-Based Invalidation
- Pattern: `search:cache:price:${priceRange}:*`
- Triggered by: Price changes within overlapping price brackets

### General Invalidation
- Pattern: `search:cache:*`
- Triggered by: Major events like product creation/deletion

## WebSocket Integration

The system integrates with WebSocket service for real-time notifications:

### Subscription Types
- **Vendor Subscriptions**: `inventory:vendor:${vendorId}`
- **Category Subscriptions**: `inventory:category:${category}`
- **General Subscriptions**: `inventory:general`

### Notification Events
- `inventory_notification` - Sent to relevant subscribers
- `inventory_subscription_confirmed` - Confirms subscription
- `inventory_unsubscription_confirmed` - Confirms unsubscription

## Performance Considerations

### Event Publishing
- **Asynchronous**: All event publishing is asynchronous
- **Error Handling**: Robust error handling prevents service disruption
- **Batching**: Bulk operations publish events efficiently

### Cache Management
- **TTL**: Default 5-minute TTL for search results
- **Size Limits**: Maximum 10,000 cache entries with LRU eviction
- **Selective Invalidation**: Only invalidates relevant cache patterns

### WebSocket Scaling
- **Room-based Broadcasting**: Efficient targeting of notifications
- **Connection Management**: Automatic cleanup on disconnection
- **Subscription Statistics**: Monitoring and optimization support

## Testing

The system includes comprehensive testing:

### Unit Tests
- **InventoryEventService**: Event publishing, subscription management
- **InventoryService**: Product operations with event integration
- **SearchCacheService**: Cache operations and invalidation

### Integration Tests
- **End-to-End Flow**: Complete synchronization from product update to notification
- **Error Handling**: Resilience testing with Redis failures
- **Performance**: Bulk operation testing

### Property-Based Tests
- **Event Uniqueness**: All events have unique IDs
- **Data Integrity**: Event data is preserved during publishing
- **Cache Consistency**: Cache keys are consistent for identical searches

## Configuration

### Environment Variables
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional_password
```

### Service Configuration
```typescript
// Default TTL for cache entries (seconds)
DEFAULT_TTL = 300

// Maximum cache size (entries)
MAX_CACHE_SIZE = 10000

// Event channel name
INVENTORY_CHANNEL = 'inventory:updates'
```

## Monitoring and Observability

### Metrics Available
- Event publishing rate and success rate
- Cache hit/miss ratios
- WebSocket subscription counts
- Error rates and types

### Logging
- Structured logging with correlation IDs
- Event publishing and processing logs
- Cache invalidation logs
- Error and warning logs

## Error Handling

### Redis Failures
- **Event Publishing**: Throws error for critical operations
- **Cache Operations**: Graceful degradation, continues without cache
- **Subscription**: Automatic reconnection attempts

### WebSocket Failures
- **Notification Delivery**: Logs warnings, continues processing
- **Connection Issues**: Automatic cleanup and reconnection

### Database Failures
- **Product Operations**: Transactions with rollback
- **Consistency**: No events published if database operation fails

## Future Enhancements

1. **Event Replay**: Ability to replay events for recovery
2. **Event Sourcing**: Complete event history for audit trails
3. **Cross-Region Replication**: Multi-region event synchronization
4. **Advanced Analytics**: Real-time inventory analytics and insights
5. **Machine Learning**: Predictive cache warming based on usage patterns

## API Reference

### InventoryEventService

#### Methods
- `getInstance()` - Get singleton instance
- `publishInventoryUpdate(event)` - Publish inventory event
- `subscribe(subscriber)` - Subscribe to events
- `unsubscribe(subscriberId)` - Unsubscribe from events
- `setWebSocketService(service)` - Set WebSocket service
- `getEventStats()` - Get subscription statistics
- `clearAllCaches()` - Clear all caches (admin)

### InventoryService

#### Methods
- `createProduct(data)` - Create product with event
- `updateProduct(id, updates)` - Update product with event
- `updateAvailability(id, availability)` - Update availability with event
- `deleteProduct(id)` - Delete product with event
- `bulkUpdateAvailability(updates)` - Bulk availability updates
- `getVendorInventoryStats(vendorId)` - Get inventory statistics

### SearchCacheService

#### Methods
- `getInstance()` - Get singleton instance
- `getCachedVendorSearch(filters, options)` - Get cached vendor search
- `cacheVendorSearch(filters, options, result)` - Cache vendor search
- `getCachedProductSearch(filters, options)` - Get cached product search
- `cacheProductSearch(filters, options, result)` - Cache product search
- `getCacheStats()` - Get cache statistics
- `clearAllCaches()` - Clear all caches

This implementation ensures that inventory changes are reflected in search results within the required 1-minute timeframe through real-time event publishing, intelligent cache invalidation, and WebSocket notifications.