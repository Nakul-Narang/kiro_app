/**
 * Unit tests for Product model
 * Tests CRUD operations and search functionality
 */

import { ProductModel, CreateProductRequest, UpdateProductRequest, ProductSearchFilters } from '../../models/Product';
import { ProductAttributes } from '../../types';
import { getPostgresPool } from '../../config/database';

// Mock the database connection
jest.mock('../../config/database');
const mockPool = {
  connect: jest.fn(),
  query: jest.fn(),
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

(getPostgresPool as jest.Mock).mockReturnValue(mockPool);

describe('ProductModel', () => {
  let productModel: ProductModel;

  beforeEach(() => {
    productModel = new ProductModel();
    jest.clearAllMocks();
    mockPool.connect.mockResolvedValue(mockClient);
  });

  const sampleProductAttributes: ProductAttributes = {
    quality: 'standard',
    quantity: 10,
    unit: 'kg',
    seasonality: 'medium',
    perishable: true,
    weight: 10.5,
    dimensions: {
      length: 30,
      width: 20,
      height: 15
    }
  };

  const sampleCreateRequest: CreateProductRequest = {
    vendorId: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Fresh Apples',
    description: 'Crisp red apples from local orchard',
    category: 'fruits',
    basePrice: 5.99,
    currency: 'USD',
    attributes: sampleProductAttributes,
    images: ['apple1.jpg', 'apple2.jpg']
  };

  const sampleProductRow = {
    product_id: '123e4567-e89b-12d3-a456-426614174001',
    vendor_id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Fresh Apples',
    description: 'Crisp red apples from local orchard',
    category: 'fruits',
    base_price: '5.99',
    currency: 'USD',
    attributes: JSON.stringify(sampleProductAttributes),
    images: ['apple1.jpg', 'apple2.jpg'],
    availability: 'available' as const,
    created_at: new Date(),
    updated_at: new Date(),
    last_updated: new Date()
  };

  describe('create', () => {
    it('should create a new product successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [sampleProductRow] }) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await productModel.create(sampleCreateRequest);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result).toEqual({
        productId: sampleProductRow.product_id,
        vendorId: sampleProductRow.vendor_id,
        name: sampleProductRow.name,
        description: sampleProductRow.description,
        category: sampleProductRow.category,
        basePrice: 5.99,
        currency: sampleProductRow.currency,
        attributes: sampleProductAttributes,
        images: sampleProductRow.images,
        availability: sampleProductRow.availability,
        lastUpdated: sampleProductRow.last_updated
      });
    });

    it('should rollback transaction on error', async () => {
      const error = new Error('Database error');
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(error); // INSERT fails

      await expect(productModel.create(sampleCreateRequest)).rejects.toThrow(error);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('findById', () => {
    it('should find product by ID successfully', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [sampleProductRow] });

      const result = await productModel.findById(sampleProductRow.product_id);

      expect(result).toEqual({
        productId: sampleProductRow.product_id,
        vendorId: sampleProductRow.vendor_id,
        name: sampleProductRow.name,
        description: sampleProductRow.description,
        category: sampleProductRow.category,
        basePrice: 5.99,
        currency: sampleProductRow.currency,
        attributes: sampleProductAttributes,
        images: sampleProductRow.images,
        availability: sampleProductRow.availability,
        lastUpdated: sampleProductRow.last_updated
      });
    });

    it('should return null when product not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await productModel.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('search', () => {
    it('should search products with filters successfully', async () => {
      const filters: ProductSearchFilters = {
        category: 'fruits',
        minPrice: 5.0,
        maxPrice: 10.0,
        availability: 'available'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // COUNT query
        .mockResolvedValueOnce({ rows: [sampleProductRow] }); // SELECT query

      const result = await productModel.search(filters, { page: 1, limit: 20 });

      expect(result).toEqual({
        products: [{
          productId: sampleProductRow.product_id,
          vendorId: sampleProductRow.vendor_id,
          name: sampleProductRow.name,
          description: sampleProductRow.description,
          category: sampleProductRow.category,
          basePrice: 5.99,
          currency: sampleProductRow.currency,
          attributes: sampleProductAttributes,
          images: sampleProductRow.images,
          availability: sampleProductRow.availability,
          lastUpdated: sampleProductRow.last_updated
        }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1
      });
    });

    it('should search with text search term', async () => {
      const filters: ProductSearchFilters = {
        searchTerm: 'apple'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [sampleProductRow] });

      const result = await productModel.search(filters);

      expect(result.products).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should handle empty search results', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await productModel.search({});

      expect(result).toEqual({
        products: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0
      });
    });
  });

  describe('update', () => {
    it('should update product successfully', async () => {
      const updates: UpdateProductRequest = {
        name: 'Updated Apple Name',
        basePrice: 6.99,
        availability: 'limited'
      };

      const updatedRow = {
        ...sampleProductRow,
        name: 'Updated Apple Name',
        base_price: '6.99',
        availability: 'limited'
      };

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [updatedRow] }) // UPDATE
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await productModel.update(sampleProductRow.product_id, updates);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result?.name).toBe('Updated Apple Name');
      expect(result?.basePrice).toBe(6.99);
      expect(result?.availability).toBe('limited');
    });

    it('should return null when product not found for update', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE returns no rows
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await productModel.update('nonexistent-id', { name: 'New Name' });

      expect(result).toBeNull();
    });

    it('should return existing product when no updates provided', async () => {
      mockClient.query.mockResolvedValueOnce(undefined); // ROLLBACK

      // Mock findById to return existing product
      const findByIdSpy = jest.spyOn(productModel, 'findById').mockResolvedValueOnce({
        productId: sampleProductRow.product_id,
        vendorId: sampleProductRow.vendor_id,
        name: sampleProductRow.name,
        description: sampleProductRow.description,
        category: sampleProductRow.category,
        basePrice: 5.99,
        currency: sampleProductRow.currency,
        attributes: sampleProductAttributes,
        images: sampleProductRow.images,
        availability: sampleProductRow.availability,
        lastUpdated: sampleProductRow.last_updated
      });

      const result = await productModel.update(sampleProductRow.product_id, {});

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(findByIdSpy).toHaveBeenCalledWith(sampleProductRow.product_id);
      expect(result?.productId).toBe(sampleProductRow.product_id);

      findByIdSpy.mockRestore();
    });
  });

  describe('delete', () => {
    it('should delete product successfully', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await productModel.delete(sampleProductRow.product_id);

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM products WHERE product_id = $1',
        [sampleProductRow.product_id]
      );
    });

    it('should return false when product not found for deletion', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await productModel.delete('nonexistent-id');

      expect(result).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true when product exists', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });

      const result = await productModel.exists(sampleProductRow.product_id);

      expect(result).toBe(true);
    });

    it('should return false when product does not exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await productModel.exists('nonexistent-id');

      expect(result).toBe(false);
    });
  });

  describe('belongsToVendor', () => {
    it('should return true when product belongs to vendor', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });

      const result = await productModel.belongsToVendor(
        sampleProductRow.product_id,
        sampleProductRow.vendor_id
      );

      expect(result).toBe(true);
    });

    it('should return false when product does not belong to vendor', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await productModel.belongsToVendor(
        sampleProductRow.product_id,
        'different-vendor-id'
      );

      expect(result).toBe(false);
    });
  });

  describe('getCategories', () => {
    it('should return list of product categories', async () => {
      const categories = [
        { category: 'fruits' },
        { category: 'vegetables' },
        { category: 'grains' }
      ];
      mockPool.query.mockResolvedValueOnce({ rows: categories });

      const result = await productModel.getCategories();

      expect(result).toEqual(['fruits', 'vegetables', 'grains']);
    });
  });

  describe('updateAvailability', () => {
    it('should update product availability successfully', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await productModel.updateAvailability(
        sampleProductRow.product_id,
        'out_of_stock'
      );

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE products'),
        ['out_of_stock', sampleProductRow.product_id]
      );
    });

    it('should return false when product not found for availability update', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await productModel.updateAvailability('nonexistent-id', 'available');

      expect(result).toBe(false);
    });
  });

  describe('findByVendorId', () => {
    it('should find products by vendor ID with pagination', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // COUNT query
        .mockResolvedValueOnce({ rows: [sampleProductRow, sampleProductRow] }); // SELECT query

      const result = await productModel.findByVendorId(sampleProductRow.vendor_id, {
        page: 1,
        limit: 10,
        sortBy: 'name',
        sortOrder: 'asc'
      });

      expect(result).toEqual({
        products: expect.arrayContaining([
          expect.objectContaining({
            productId: sampleProductRow.product_id,
            vendorId: sampleProductRow.vendor_id
          })
        ]),
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1
      });
    });
  });
});