/**
 * Inventory Services Index
 * Exports and initializes all inventory-related services
 */

export { InventoryEventService } from './InventoryEventService';
export { InventoryService } from './InventoryService';
export { SearchCacheService } from './SearchCacheService';

// Re-export types for convenience
export type { InventoryUpdateEvent, InventorySubscriber } from './InventoryEventService';