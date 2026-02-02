/**
 * Unit tests for ProductController
 * Tests HTTP request handling and API endpoints
 */

import { Request, Response } from 'express';
import { ProductController } from '../../controllers/ProductController';
import { ProductModel } from '../../models/Product';
import { VendorModel } from '../../models/Vendor';
import { ProductAttributes } from '../../types';

// Mock the models
jest.mock('../../models/Product');
jest.mock('../../models/Vendor');

const MockProductModel = ProductModel as jest.MockedClass<typeof ProductModel>;
const MockVendorModel = VendorModel as jest.MockedClass<typeof VendorModel>;

describe('ProductController', () => {
  let productController: ProductController;
  let mockProductModel: jest.Mocked<ProductModel>;
  let mockVendorModel: jest.Mocked<VendorModel>;
  let mockRequest: Partial<Request> & { 
    user?: { 
      userId: string;
      email?: string;
      role?: string;
    } 
  };
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockProductModel = new MockProductModel() as jest.Mocked<ProductModel>;
    mockVendorModel = new MockVendorModel() as jest.Mocked<VendorModel>;
    productController = new ProductController();
    
    // Replace the models with mocks
    (productController as any).productModel = mockProductModel;
    (productController as any).vendorModel = mockVendorModel;

    mockRequest = {
      user: { userId: 'vendor-123' } as any,
      params: {},
      query: {},
      body: {}
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    jest.clearAllMocks();
  });

  const sampleProductAttributes: ProductAttributes = {
    quality: 'standard',
    quantity: 10,
    unit: 'kg',
    seasonality: 'medium',
    perishable: true
  };

  const sampleProduct = {
    productId: 'product-123',
    vendorId: 'vendor-123',
    name: 'Fresh Apples',
    description: 'Crisp red apples',
    category: 'fruits',
    basePrice: 5.99,
    currency: 'USD',
    attributes: sampleProductAttributes,
    images: ['apple1.jpg'],
    availability: 'available' as const,
    lastUpdated: new Date()
  };

  describe('createProduct', () => {
    beforeEach(() => {
      mockRequest.body = {
        name: 'Fresh Apples',
        description: 'Crisp red apples',
        category: 'fruits',
        basePrice: 5.99,
        currency: 'USD',
        attributes: sampleProductAttributes,
        images: ['apple1.jpg']
      };
    });

    it('should create product successfully for authenticated vendor', async () => {
      mockVendorModel.exists.mockResolvedValueOnce(true);
      mockProductModel.create.mockResolvedValueOnce(sampleProduct);

      await productController.createProduct(mockRequest as Request, mockResponse as Response);

      expect(mockVendorModel.exists).toHaveBeenCalledWith('vendor-123');
      expect(mockProductModel.create).toHaveBeenCalledWith({
        vendorId: 'vendor-123',
        name: 'Fresh Apples',
        description: 'Crisp red apples',
        category: 'fruits',
        basePrice: 5.99,
        currency: 'USD',
        attributes: sampleProductAttributes,
        images: ['apple1.jpg']
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: sampleProduct,
        timestamp: expect.any(Date)
      });
    });

    it('should return 401 when user not authenticated', async () => {
      (mockRequest as any).user = undefined;

      await productController.createProduct(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Authentication required' },
        timestamp: expect.any(Date)
      });
    });

    it('should return 403 when user is not a vendor', async () => {
      mockVendorModel.exists.mockResolvedValueOnce(false);

      await productController.createProduct(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Only vendors can create products' },
        timestamp: expect.any(Date)
      });
    });

    it('should return 400 when validation fails', async () => {
      mockRequest.body = { name: '' }; // Invalid data
      mockVendorModel.exists.mockResolvedValueOnce(true);

      await productController.createProduct(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: { 
          message: 'Invalid product data',
          details: expect.any(Array)
        },
        timestamp: expect.any(Date)
      });
    });

    it('should handle database errors', async () => {
      mockVendorModel.exists.mockResolvedValueOnce(true);
      mockProductModel.create.mockRejectedValueOnce(new Error('Database error'));

      await productController.createProduct(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Internal server error' },
        timestamp: expect.any(Date)
      });
    });
  });

  describe('getProduct', () => {
    it('should get product by ID successfully', async () => {
      mockRequest.params = { id: 'product-123' };
      mockProductModel.findById.mockResolvedValueOnce(sampleProduct);

      await productController.getProduct(mockRequest as Request, mockResponse as Response);

      expect(mockProductModel.findById).toHaveBeenCalledWith('product-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: sampleProduct,
        timestamp: expect.any(Date)
      });
    });

    it('should return 404 when product not found', async () => {
      mockRequest.params = { id: 'nonexistent' };
      mockProductModel.findById.mockResolvedValueOnce(null);

      await productController.getProduct(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Product not found' },
        timestamp: expect.any(Date)
      });
    });
  });

  describe('updateProduct', () => {
    beforeEach(() => {
      mockRequest.params = { id: 'product-123' };
      mockRequest.body = { name: 'Updated Apple Name', basePrice: 6.99 };
    });

    it('should update product successfully', async () => {
      const updatedProduct = { ...sampleProduct, name: 'Updated Apple Name', basePrice: 6.99 };
      mockProductModel.belongsToVendor.mockResolvedValueOnce(true);
      mockProductModel.update.mockResolvedValueOnce(updatedProduct);

      await productController.updateProduct(mockRequest as Request, mockResponse as Response);

      expect(mockProductModel.belongsToVendor).toHaveBeenCalledWith('product-123', 'vendor-123');
      expect(mockProductModel.update).toHaveBeenCalledWith('product-123', {
        name: 'Updated Apple Name',
        basePrice: 6.99
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: updatedProduct,
        timestamp: expect.any(Date)
      });
    });

    it('should return 401 when user not authenticated', async () => {
      (mockRequest as any).user = undefined;

      await productController.updateProduct(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should return 404 when product does not belong to vendor', async () => {
      mockProductModel.belongsToVendor.mockResolvedValueOnce(false);

      await productController.updateProduct(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Product not found or access denied' },
        timestamp: expect.any(Date)
      });
    });
  });

  describe('deleteProduct', () => {
    beforeEach(() => {
      mockRequest.params = { id: 'product-123' };
    });

    it('should delete product successfully', async () => {
      mockProductModel.belongsToVendor.mockResolvedValueOnce(true);
      mockProductModel.delete.mockResolvedValueOnce(true);

      await productController.deleteProduct(mockRequest as Request, mockResponse as Response);

      expect(mockProductModel.delete).toHaveBeenCalledWith('product-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Product deleted successfully' },
        timestamp: expect.any(Date)
      });
    });

    it('should return 404 when product not found for deletion', async () => {
      mockProductModel.belongsToVendor.mockResolvedValueOnce(true);
      mockProductModel.delete.mockResolvedValueOnce(false);

      await productController.deleteProduct(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });
  });

  describe('searchProducts', () => {
    it('should search products successfully', async () => {
      mockRequest.query = {
        category: 'fruits',
        minPrice: '5.0',
        maxPrice: '10.0',
        q: 'apple',
        page: '1',
        limit: '20'
      };

      const searchResult = {
        products: [sampleProduct],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1
      };

      mockProductModel.search.mockResolvedValueOnce(searchResult);

      await productController.searchProducts(mockRequest as Request, mockResponse as Response);

      expect(mockProductModel.search).toHaveBeenCalledWith(
        {
          category: 'fruits',
          minPrice: 5.0,
          maxPrice: 10.0,
          searchTerm: 'apple'
        },
        {
          page: 1,
          limit: 20,
          sortBy: 'updated',
          sortOrder: 'desc'
        }
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: [sampleProduct],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1
        },
        timestamp: expect.any(Date)
      });
    });

    it('should handle empty search results', async () => {
      mockRequest.query = {};
      const emptyResult = {
        products: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0
      };

      mockProductModel.search.mockResolvedValueOnce(emptyResult);

      await productController.searchProducts(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0
        },
        timestamp: expect.any(Date)
      });
    });
  });

  describe('getVendorProducts', () => {
    it('should get vendor products successfully', async () => {
      mockRequest.params = { vendorId: 'vendor-123' };
      mockVendorModel.findById.mockResolvedValueOnce({} as any); // Vendor exists
      
      const vendorProducts = {
        products: [sampleProduct],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1
      };

      mockProductModel.findByVendorId.mockResolvedValueOnce(vendorProducts);

      await productController.getVendorProducts(mockRequest as Request, mockResponse as Response);

      expect(mockVendorModel.findById).toHaveBeenCalledWith('vendor-123');
      expect(mockProductModel.findByVendorId).toHaveBeenCalledWith('vendor-123', {
        page: 1,
        limit: 20,
        sortBy: 'updated',
        sortOrder: 'desc'
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: [sampleProduct],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1
        },
        timestamp: expect.any(Date)
      });
    });

    it('should return 404 when vendor not found', async () => {
      mockRequest.params = { vendorId: 'nonexistent' };
      mockVendorModel.findById.mockResolvedValueOnce(null);

      await productController.getVendorProducts(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Vendor not found' },
        timestamp: expect.any(Date)
      });
    });
  });

  describe('getMyProducts', () => {
    it('should get authenticated vendor products successfully', async () => {
      mockVendorModel.exists.mockResolvedValueOnce(true);
      
      const myProducts = {
        products: [sampleProduct],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1
      };

      mockProductModel.findByVendorId.mockResolvedValueOnce(myProducts);

      await productController.getMyProducts(mockRequest as Request, mockResponse as Response);

      expect(mockVendorModel.exists).toHaveBeenCalledWith('vendor-123');
      expect(mockProductModel.findByVendorId).toHaveBeenCalledWith('vendor-123', {
        page: 1,
        limit: 20,
        sortBy: 'updated',
        sortOrder: 'desc'
      });
    });

    it('should return 403 when user is not a vendor', async () => {
      mockVendorModel.exists.mockResolvedValueOnce(false);

      await productController.getMyProducts(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });

  describe('getCategories', () => {
    it('should get product categories successfully', async () => {
      const categories = ['fruits', 'vegetables', 'grains'];
      mockProductModel.getCategories.mockResolvedValueOnce(categories);

      await productController.getCategories(mockRequest as Request, mockResponse as Response);

      expect(mockProductModel.getCategories).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: categories,
        timestamp: expect.any(Date)
      });
    });
  });

  describe('updateAvailability', () => {
    beforeEach(() => {
      mockRequest.params = { id: 'product-123' };
      mockRequest.body = { availability: 'out_of_stock' };
    });

    it('should update availability successfully', async () => {
      mockProductModel.belongsToVendor.mockResolvedValueOnce(true);
      mockProductModel.updateAvailability.mockResolvedValueOnce(true);

      await productController.updateAvailability(mockRequest as Request, mockResponse as Response);

      expect(mockProductModel.updateAvailability).toHaveBeenCalledWith('product-123', 'out_of_stock');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Availability updated successfully' },
        timestamp: expect.any(Date)
      });
    });

    it('should return 400 for invalid availability status', async () => {
      mockRequest.body = { availability: 'invalid_status' };

      await productController.updateAvailability(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Invalid availability status' },
        timestamp: expect.any(Date)
      });
    });
  });
});