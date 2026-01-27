/**
 * Unit tests for validation utilities
 */

import {
  validateEmail,
  validatePhoneNumber,
  validateUUID,
  validateLanguage,
  validateCurrency,
  validateProductCategory,
  validateLocation,
  validateUserProfile,
  validateBusinessHours,
  validateProductAttributes,
  validateUser,
  validateVendor,
  validateProduct,
  validateTranslationRequest,
  sanitizeString,
  sanitizeUserInput,
  ValidationError,
  SUPPORTED_LANGUAGES,
  SUPPORTED_CURRENCIES,
  PRODUCT_CATEGORIES
} from '../../utils/validation';

import {
  User,
  Vendor,
  Product,
  Location,
  UserProfile,
  BusinessHours,
  ProductAttributes,
  TranslationRequest
} from '../../types';

describe('Validation Utilities', () => {
  describe('Basic validation functions', () => {
    describe('validateEmail', () => {
      it('should validate correct email formats', () => {
        expect(validateEmail('user@example.com')).toBe(true);
        expect(validateEmail('test.email+tag@domain.co.uk')).toBe(true);
        expect(validateEmail('user123@test-domain.org')).toBe(true);
      });

      it('should reject invalid email formats', () => {
        expect(validateEmail('invalid-email')).toBe(false);
        expect(validateEmail('user@')).toBe(false);
        expect(validateEmail('@domain.com')).toBe(false);
        expect(validateEmail('user@domain')).toBe(false); // No TLD
      });
    });

    describe('validatePhoneNumber', () => {
      it('should validate correct phone number formats', () => {
        expect(validatePhoneNumber('+1234567890')).toBe(true);
        expect(validatePhoneNumber('1234567890')).toBe(true);
        expect(validatePhoneNumber('+919876543210')).toBe(true);
      });

      it('should reject invalid phone number formats', () => {
        expect(validatePhoneNumber('12345')).toBe(false); // Too short
        expect(validatePhoneNumber('+0123456789')).toBe(false);
        expect(validatePhoneNumber('abc123456789')).toBe(false);
        expect(validatePhoneNumber('')).toBe(false);
      });
    });

    describe('validateUUID', () => {
      it('should validate correct UUID formats', () => {
        expect(validateUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
        expect(validateUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      });

      it('should reject invalid UUID formats', () => {
        expect(validateUUID('invalid-uuid')).toBe(false);
        expect(validateUUID('123e4567-e89b-12d3-a456')).toBe(false);
        expect(validateUUID('')).toBe(false);
      });
    });

    describe('validateLanguage', () => {
      it('should validate supported languages', () => {
        expect(validateLanguage('en')).toBe(true);
        expect(validateLanguage('es')).toBe(true);
        expect(validateLanguage('hi')).toBe(true);
      });

      it('should reject unsupported languages', () => {
        expect(validateLanguage('xyz')).toBe(false);
        expect(validateLanguage('')).toBe(false);
      });
    });

    describe('validateCurrency', () => {
      it('should validate supported currencies', () => {
        expect(validateCurrency('USD')).toBe(true);
        expect(validateCurrency('EUR')).toBe(true);
        expect(validateCurrency('INR')).toBe(true);
      });

      it('should reject unsupported currencies', () => {
        expect(validateCurrency('XYZ')).toBe(false);
        expect(validateCurrency('')).toBe(false);
      });
    });

    describe('validateProductCategory', () => {
      it('should validate supported product categories', () => {
        expect(validateProductCategory('fruits')).toBe(true);
        expect(validateProductCategory('vegetables')).toBe(true);
        expect(validateProductCategory('electronics')).toBe(true);
      });

      it('should reject unsupported categories', () => {
        expect(validateProductCategory('invalid-category')).toBe(false);
        expect(validateProductCategory('')).toBe(false);
      });
    });
  });

  describe('Complex validation functions', () => {
    describe('validateLocation', () => {
      it('should validate correct location data', () => {
        const validLocation: Location = {
          latitude: 40.7128,
          longitude: -74.0060,
          address: '123 Main St',
          city: 'New York',
          country: 'USA',
          postalCode: '10001'
        };

        expect(() => validateLocation(validLocation)).not.toThrow();
      });

      it('should reject invalid latitude', () => {
        const invalidLocation: Location = {
          latitude: 91, // Invalid: > 90
          longitude: -74.0060
        };

        expect(() => validateLocation(invalidLocation)).toThrow(ValidationError);
        expect(() => validateLocation(invalidLocation)).toThrow('Invalid latitude');
      });

      it('should reject invalid longitude', () => {
        const invalidLocation: Location = {
          latitude: 40.7128,
          longitude: 181 // Invalid: > 180
        };

        expect(() => validateLocation(invalidLocation)).toThrow(ValidationError);
        expect(() => validateLocation(invalidLocation)).toThrow('Invalid longitude');
      });
    });

    describe('validateUserProfile', () => {
      it('should validate correct user profile', () => {
        const validProfile: UserProfile = {
          firstName: 'John',
          lastName: 'Doe',
          avatar: 'https://example.com/avatar.jpg',
          bio: 'A passionate trader',
          timezone: 'America/New_York'
        };

        expect(() => validateUserProfile(validProfile)).not.toThrow();
      });

      it('should reject empty first name', () => {
        const invalidProfile: UserProfile = {
          firstName: '',
          lastName: 'Doe'
        };

        expect(() => validateUserProfile(invalidProfile)).toThrow(ValidationError);
        expect(() => validateUserProfile(invalidProfile)).toThrow('First name is required');
      });

      it('should reject long bio', () => {
        const invalidProfile: UserProfile = {
          firstName: 'John',
          lastName: 'Doe',
          bio: 'A'.repeat(501) // Too long
        };

        expect(() => validateUserProfile(invalidProfile)).toThrow(ValidationError);
        expect(() => validateUserProfile(invalidProfile)).toThrow('Bio must be 500 characters or less');
      });
    });

    describe('validateBusinessHours', () => {
      it('should validate correct business hours', () => {
        const validHours: BusinessHours = {
          monday: { open: '09:00', close: '17:00' },
          tuesday: { open: '09:00', close: '17:00' },
          wednesday: { open: '09:00', close: '17:00' },
          thursday: { open: '09:00', close: '17:00' },
          friday: { open: '09:00', close: '17:00' },
          saturday: { open: '10:00', close: '16:00' },
          sunday: { open: '10:00', close: '16:00', closed: true }
        };

        expect(() => validateBusinessHours(validHours)).not.toThrow();
      });

      it('should reject invalid time format', () => {
        const invalidHours: BusinessHours = {
          monday: { open: '25:00', close: '17:00' }, // Invalid hour
          tuesday: { open: '09:00', close: '17:00' },
          wednesday: { open: '09:00', close: '17:00' },
          thursday: { open: '09:00', close: '17:00' },
          friday: { open: '09:00', close: '17:00' },
          saturday: { open: '10:00', close: '16:00' },
          sunday: { open: '10:00', close: '16:00' }
        };

        expect(() => validateBusinessHours(invalidHours)).toThrow(ValidationError);
        expect(() => validateBusinessHours(invalidHours)).toThrow('Invalid opening time format');
      });

      it('should reject opening time after closing time', () => {
        const invalidHours: BusinessHours = {
          monday: { open: '17:00', close: '09:00' }, // Open after close
          tuesday: { open: '09:00', close: '17:00' },
          wednesday: { open: '09:00', close: '17:00' },
          thursday: { open: '09:00', close: '17:00' },
          friday: { open: '09:00', close: '17:00' },
          saturday: { open: '10:00', close: '16:00' },
          sunday: { open: '10:00', close: '16:00' }
        };

        expect(() => validateBusinessHours(invalidHours)).toThrow(ValidationError);
        expect(() => validateBusinessHours(invalidHours)).toThrow('Opening time must be before closing time');
      });
    });

    describe('validateProductAttributes', () => {
      it('should validate correct product attributes', () => {
        const validAttributes: ProductAttributes = {
          quality: 'premium',
          quantity: 10,
          unit: 'kg',
          seasonality: 'high',
          perishable: true,
          weight: 5.5,
          dimensions: {
            length: 10,
            width: 5,
            height: 3
          }
        };

        expect(() => validateProductAttributes(validAttributes)).not.toThrow();
      });

      it('should reject invalid quality', () => {
        const invalidAttributes: ProductAttributes = {
          quality: 'invalid' as any,
          quantity: 10,
          unit: 'kg',
          perishable: true
        };

        expect(() => validateProductAttributes(invalidAttributes)).toThrow(ValidationError);
        expect(() => validateProductAttributes(invalidAttributes)).toThrow('Quality must be one of');
      });

      it('should reject negative quantity', () => {
        const invalidAttributes: ProductAttributes = {
          quality: 'standard',
          quantity: -5,
          unit: 'kg',
          perishable: true
        };

        expect(() => validateProductAttributes(invalidAttributes)).toThrow(ValidationError);
        expect(() => validateProductAttributes(invalidAttributes)).toThrow('Quantity must be a positive number');
      });
    });
  });

  describe('Entity validation functions', () => {
    describe('validateUser', () => {
      it('should validate correct user data', () => {
        const validUser: Partial<User> = {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          email: 'user@example.com',
          phoneNumber: '+1234567890',
          preferredLanguage: 'en',
          supportedLanguages: ['en', 'es'],
          location: {
            latitude: 40.7128,
            longitude: -74.0060,
            city: 'New York'
          },
          profile: {
            firstName: 'John',
            lastName: 'Doe'
          },
          verified: true
        };

        expect(() => validateUser(validUser)).not.toThrow();
      });

      it('should reject invalid email', () => {
        const invalidUser: Partial<User> = {
          email: 'invalid-email',
          preferredLanguage: 'en',
          supportedLanguages: ['en'],
          location: { latitude: 40.7128, longitude: -74.0060 },
          profile: { firstName: 'John', lastName: 'Doe' }
        };

        expect(() => validateUser(invalidUser)).toThrow(ValidationError);
        expect(() => validateUser(invalidUser)).toThrow('Valid email address is required');
      });

      it('should reject empty supported languages', () => {
        const invalidUser: Partial<User> = {
          email: 'user@example.com',
          preferredLanguage: 'en',
          supportedLanguages: [],
          location: { latitude: 40.7128, longitude: -74.0060 },
          profile: { firstName: 'John', lastName: 'Doe' }
        };

        expect(() => validateUser(invalidUser)).toThrow(ValidationError);
        expect(() => validateUser(invalidUser)).toThrow('At least one supported language is required');
      });
    });

    describe('validateVendor', () => {
      it('should validate correct vendor data', () => {
        const validVendor: Partial<Vendor> = {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          email: 'vendor@example.com',
          preferredLanguage: 'en',
          supportedLanguages: ['en', 'es'],
          location: { latitude: 40.7128, longitude: -74.0060 },
          profile: { firstName: 'Jane', lastName: 'Smith' },
          businessName: 'Fresh Produce Co',
          businessType: 'Agriculture',
          businessHours: {
            monday: { open: '09:00', close: '17:00' },
            tuesday: { open: '09:00', close: '17:00' },
            wednesday: { open: '09:00', close: '17:00' },
            thursday: { open: '09:00', close: '17:00' },
            friday: { open: '09:00', close: '17:00' },
            saturday: { open: '10:00', close: '16:00' },
            sunday: { open: '10:00', close: '16:00', closed: true }
          },
          paymentMethods: ['cash', 'card'],
          averageRating: 4.5,
          totalTransactions: 100,
          responseTime: 15
        };

        expect(() => validateVendor(validVendor)).not.toThrow();
      });

      it('should reject empty business name', () => {
        const invalidVendor: Partial<Vendor> = {
          email: 'vendor@example.com',
          preferredLanguage: 'en',
          supportedLanguages: ['en'],
          location: { latitude: 40.7128, longitude: -74.0060 },
          profile: { firstName: 'Jane', lastName: 'Smith' },
          businessName: '',
          businessType: 'Agriculture',
          businessHours: {
            monday: { open: '09:00', close: '17:00' },
            tuesday: { open: '09:00', close: '17:00' },
            wednesday: { open: '09:00', close: '17:00' },
            thursday: { open: '09:00', close: '17:00' },
            friday: { open: '09:00', close: '17:00' },
            saturday: { open: '10:00', close: '16:00' },
            sunday: { open: '10:00', close: '16:00' }
          },
          paymentMethods: ['cash']
        };

        expect(() => validateVendor(invalidVendor)).toThrow(ValidationError);
        expect(() => validateVendor(invalidVendor)).toThrow('Business name is required');
      });

      it('should reject invalid average rating', () => {
        const invalidVendor: Partial<Vendor> = {
          email: 'vendor@example.com',
          preferredLanguage: 'en',
          supportedLanguages: ['en'],
          location: { latitude: 40.7128, longitude: -74.0060 },
          profile: { firstName: 'Jane', lastName: 'Smith' },
          businessName: 'Fresh Produce Co',
          businessType: 'Agriculture',
          businessHours: {
            monday: { open: '09:00', close: '17:00' },
            tuesday: { open: '09:00', close: '17:00' },
            wednesday: { open: '09:00', close: '17:00' },
            thursday: { open: '09:00', close: '17:00' },
            friday: { open: '09:00', close: '17:00' },
            saturday: { open: '10:00', close: '16:00' },
            sunday: { open: '10:00', close: '16:00' }
          },
          paymentMethods: ['cash'],
          averageRating: 6 // Invalid: > 5
        };

        expect(() => validateVendor(invalidVendor)).toThrow(ValidationError);
        expect(() => validateVendor(invalidVendor)).toThrow('Average rating must be a number between 0 and 5');
      });
    });

    describe('validateProduct', () => {
      it('should validate correct product data', () => {
        const validProduct: Partial<Product> = {
          productId: '123e4567-e89b-12d3-a456-426614174000',
          vendorId: '456e7890-e89b-12d3-a456-426614174000',
          name: 'Fresh Apples',
          description: 'Crisp and sweet apples',
          category: 'fruits',
          basePrice: 2.99,
          currency: 'USD',
          attributes: {
            quality: 'premium',
            quantity: 50,
            unit: 'kg',
            perishable: true
          },
          images: ['apple1.jpg', 'apple2.jpg'],
          availability: 'available'
        };

        expect(() => validateProduct(validProduct)).not.toThrow();
      });

      it('should reject invalid product category', () => {
        const invalidProduct: Partial<Product> = {
          vendorId: '456e7890-e89b-12d3-a456-426614174000',
          name: 'Fresh Apples',
          category: 'invalid-category',
          basePrice: 2.99,
          currency: 'USD',
          attributes: {
            quality: 'premium',
            quantity: 50,
            unit: 'kg',
            perishable: true
          }
        };

        expect(() => validateProduct(invalidProduct)).toThrow(ValidationError);
        expect(() => validateProduct(invalidProduct)).toThrow('Valid product category is required');
      });

      it('should reject negative price', () => {
        const invalidProduct: Partial<Product> = {
          vendorId: '456e7890-e89b-12d3-a456-426614174000',
          name: 'Fresh Apples',
          category: 'fruits',
          basePrice: -2.99,
          currency: 'USD',
          attributes: {
            quality: 'premium',
            quantity: 50,
            unit: 'kg',
            perishable: true
          }
        };

        expect(() => validateProduct(invalidProduct)).toThrow(ValidationError);
        expect(() => validateProduct(invalidProduct)).toThrow('Base price must be a positive number');
      });
    });

    describe('validateTranslationRequest', () => {
      it('should validate correct translation request', () => {
        const validRequest: Partial<TranslationRequest> = {
          text: 'Hello, how much for the apples?',
          sourceLang: 'en',
          targetLang: 'es',
          domain: 'trade'
        };

        expect(() => validateTranslationRequest(validRequest)).not.toThrow();
      });

      it('should reject same source and target language', () => {
        const invalidRequest: Partial<TranslationRequest> = {
          text: 'Hello, how much for the apples?',
          sourceLang: 'en',
          targetLang: 'en'
        };

        expect(() => validateTranslationRequest(invalidRequest)).toThrow(ValidationError);
        expect(() => validateTranslationRequest(invalidRequest)).toThrow('Source and target languages must be different');
      });

      it('should reject empty text', () => {
        const invalidRequest: Partial<TranslationRequest> = {
          text: '',
          sourceLang: 'en',
          targetLang: 'es'
        };

        expect(() => validateTranslationRequest(invalidRequest)).toThrow(ValidationError);
        expect(() => validateTranslationRequest(invalidRequest)).toThrow('Text to translate is required');
      });
    });
  });

  describe('Sanitization functions', () => {
    describe('sanitizeString', () => {
      it('should trim whitespace and remove harmful characters', () => {
        expect(sanitizeString('  hello world  ')).toBe('hello world');
        expect(sanitizeString('hello<script>alert("xss")</script>world')).toBe('helloscriptalert("xss")/scriptworld');
        expect(sanitizeString('normal text')).toBe('normal text');
      });
    });

    describe('sanitizeUserInput', () => {
      it('should sanitize string values in object', () => {
        const input = {
          name: '  John Doe  ',
          email: 'john@example.com',
          bio: 'Hello <script>alert("xss")</script> world',
          age: 25,
          tags: ['  tag1  ', 'tag2<script>', 'tag3']
        };

        const result = sanitizeUserInput(input);

        expect(result.name).toBe('John Doe');
        expect(result.email).toBe('john@example.com');
        expect(result.bio).toBe('Hello scriptalert("xss")/script world');
        expect(result.age).toBe(25);
        expect(result.tags).toEqual(['tag1', 'tag2script', 'tag3']);
      });
    });
  });

  describe('Constants', () => {
    it('should have correct supported languages', () => {
      expect(SUPPORTED_LANGUAGES).toContain('en');
      expect(SUPPORTED_LANGUAGES).toContain('es');
      expect(SUPPORTED_LANGUAGES).toContain('hi');
      expect(SUPPORTED_LANGUAGES.length).toBeGreaterThan(10);
    });

    it('should have correct supported currencies', () => {
      expect(SUPPORTED_CURRENCIES).toContain('USD');
      expect(SUPPORTED_CURRENCIES).toContain('EUR');
      expect(SUPPORTED_CURRENCIES).toContain('INR');
    });

    it('should have correct product categories', () => {
      expect(PRODUCT_CATEGORIES).toContain('fruits');
      expect(PRODUCT_CATEGORIES).toContain('vegetables');
      expect(PRODUCT_CATEGORIES).toContain('electronics');
    });
  });
});