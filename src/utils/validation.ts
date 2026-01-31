/**
 * Data validation utilities for the Multilingual Mandi platform
 * Provides validation functions for user, vendor, and product data models
 */

import { 
  User, 
  Vendor, 
  Product, 
  Location, 
  UserProfile, 
  BusinessHours, 
  ProductAttributes,
  VendorRating,
  TranslationRequest,
  PriceDiscoveryRequest,
  AuthCredentials,
  RegisterUserRequest,
  RegisterVendorRequest,
  PasswordResetRequest,
  PasswordResetConfirm,
  EmailVerificationRequest,
  EmailVerificationConfirm,
  PhoneVerificationRequest,
  PhoneVerificationConfirm,
  UpdateProfileRequest,
  UpdateVendorProfileRequest,
  ChangePasswordRequest
} from '../types';

// Supported languages for the platform
export const SUPPORTED_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 
  'ar', 'hi', 'bn', 'ur', 'ta', 'te', 'mr', 'gu', 'kn', 'ml'
];

// Supported currencies
export const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'BRL', 'RUB', 'KRW', 'MXN'
];

// Product categories
export const PRODUCT_CATEGORIES = [
  'fruits', 'vegetables', 'grains', 'dairy', 'meat', 'seafood', 
  'spices', 'textiles', 'handicrafts', 'electronics', 'tools', 'other'
];

// Validation error class
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Email validation regex - more strict, requires TLD
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Phone number validation regex (international format) - more strict
const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates email format
 */
export function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

/**
 * Validates phone number format
 */
export function validatePhoneNumber(phone: string): boolean {
  return PHONE_REGEX.test(phone);
}

/**
 * Validates UUID format
 */
export function validateUUID(uuid: string): boolean {
  return UUID_REGEX.test(uuid);
}

/**
 * Validates language code
 */
export function validateLanguage(language: string): boolean {
  return SUPPORTED_LANGUAGES.includes(language);
}

/**
 * Validates currency code
 */
export function validateCurrency(currency: string): boolean {
  return SUPPORTED_CURRENCIES.includes(currency);
}

/**
 * Validates product category
 */
export function validateProductCategory(category: string): boolean {
  return PRODUCT_CATEGORIES.includes(category);
}

/**
 * Validates location data
 */
export function validateLocation(location: Location): void {
  if (typeof location.latitude !== 'number' || location.latitude < -90 || location.latitude > 90) {
    throw new ValidationError('Invalid latitude: must be a number between -90 and 90', 'latitude');
  }
  
  if (typeof location.longitude !== 'number' || location.longitude < -180 || location.longitude > 180) {
    throw new ValidationError('Invalid longitude: must be a number between -180 and 180', 'longitude');
  }
  
  if (location.address && typeof location.address !== 'string') {
    throw new ValidationError('Address must be a string', 'address');
  }
  
  if (location.city && typeof location.city !== 'string') {
    throw new ValidationError('City must be a string', 'city');
  }
  
  if (location.country && typeof location.country !== 'string') {
    throw new ValidationError('Country must be a string', 'country');
  }
  
  if (location.postalCode && typeof location.postalCode !== 'string') {
    throw new ValidationError('Postal code must be a string', 'postalCode');
  }
}

/**
 * Validates user profile data
 */
export function validateUserProfile(profile: UserProfile): void {
  if (!profile.firstName || typeof profile.firstName !== 'string' || profile.firstName.trim().length === 0) {
    throw new ValidationError('First name is required and must be a non-empty string', 'firstName');
  }
  
  if (!profile.lastName || typeof profile.lastName !== 'string' || profile.lastName.trim().length === 0) {
    throw new ValidationError('Last name is required and must be a non-empty string', 'lastName');
  }
  
  if (profile.firstName.length > 50) {
    throw new ValidationError('First name must be 50 characters or less', 'firstName');
  }
  
  if (profile.lastName.length > 50) {
    throw new ValidationError('Last name must be 50 characters or less', 'lastName');
  }
  
  if (profile.avatar && typeof profile.avatar !== 'string') {
    throw new ValidationError('Avatar must be a string URL', 'avatar');
  }
  
  if (profile.bio && typeof profile.bio !== 'string') {
    throw new ValidationError('Bio must be a string', 'bio');
  }
  
  if (profile.bio && profile.bio.length > 500) {
    throw new ValidationError('Bio must be 500 characters or less', 'bio');
  }
  
  if (profile.timezone && typeof profile.timezone !== 'string') {
    throw new ValidationError('Timezone must be a string', 'timezone');
  }
}

/**
 * Validates business hours data
 */
export function validateBusinessHours(hours: BusinessHours): void {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  
  for (const day of days) {
    const dayHours = hours[day as keyof BusinessHours];
    
    if (!dayHours) {
      throw new ValidationError(`Business hours for ${day} are required`, day);
    }
    
    if (dayHours.closed) {
      continue; // Skip validation for closed days
    }
    
    if (!timeRegex.test(dayHours.open)) {
      throw new ValidationError(`Invalid opening time format for ${day}. Use HH:MM format`, `${day}.open`);
    }
    
    if (!timeRegex.test(dayHours.close)) {
      throw new ValidationError(`Invalid closing time format for ${day}. Use HH:MM format`, `${day}.close`);
    }
    
    // Validate that opening time is before closing time
    const openTime = dayHours.open.split(':').map(Number);
    const closeTime = dayHours.close.split(':').map(Number);
    const openMinutes = openTime[0] * 60 + openTime[1];
    const closeMinutes = closeTime[0] * 60 + closeTime[1];
    
    if (openMinutes >= closeMinutes) {
      throw new ValidationError(`Opening time must be before closing time for ${day}`, `${day}.hours`);
    }
  }
}

/**
 * Validates product attributes
 */
export function validateProductAttributes(attributes: ProductAttributes): void {
  const validQualities = ['basic', 'standard', 'premium'];
  if (!validQualities.includes(attributes.quality)) {
    throw new ValidationError('Quality must be one of: basic, standard, premium', 'quality');
  }
  
  if (typeof attributes.quantity !== 'number' || attributes.quantity <= 0) {
    throw new ValidationError('Quantity must be a positive number', 'quantity');
  }
  
  if (!attributes.unit || typeof attributes.unit !== 'string' || attributes.unit.trim().length === 0) {
    throw new ValidationError('Unit is required and must be a non-empty string', 'unit');
  }
  
  if (attributes.seasonality) {
    const validSeasonality = ['high', 'medium', 'low'];
    if (!validSeasonality.includes(attributes.seasonality)) {
      throw new ValidationError('Seasonality must be one of: high, medium, low', 'seasonality');
    }
  }
  
  if (typeof attributes.perishable !== 'boolean') {
    throw new ValidationError('Perishable must be a boolean value', 'perishable');
  }
  
  if (attributes.weight !== undefined && (typeof attributes.weight !== 'number' || attributes.weight <= 0)) {
    throw new ValidationError('Weight must be a positive number', 'weight');
  }
  
  if (attributes.dimensions) {
    const { length, width, height } = attributes.dimensions;
    if (typeof length !== 'number' || length <= 0) {
      throw new ValidationError('Dimension length must be a positive number', 'dimensions.length');
    }
    if (typeof width !== 'number' || width <= 0) {
      throw new ValidationError('Dimension width must be a positive number', 'dimensions.width');
    }
    if (typeof height !== 'number' || height <= 0) {
      throw new ValidationError('Dimension height must be a positive number', 'dimensions.height');
    }
  }
}

/**
 * Validates user data
 */
export function validateUser(user: Partial<User>): void {
  if (user.userId && !validateUUID(user.userId)) {
    throw new ValidationError('Invalid user ID format', 'userId');
  }
  
  if (!user.email || !validateEmail(user.email)) {
    throw new ValidationError('Valid email address is required', 'email');
  }
  
  if (user.phoneNumber && !validatePhoneNumber(user.phoneNumber)) {
    throw new ValidationError('Invalid phone number format', 'phoneNumber');
  }
  
  if (!user.preferredLanguage || !validateLanguage(user.preferredLanguage)) {
    throw new ValidationError('Valid preferred language is required', 'preferredLanguage');
  }
  
  if (!user.supportedLanguages || !Array.isArray(user.supportedLanguages) || user.supportedLanguages.length === 0) {
    throw new ValidationError('At least one supported language is required', 'supportedLanguages');
  }
  
  for (const lang of user.supportedLanguages) {
    if (!validateLanguage(lang)) {
      throw new ValidationError(`Unsupported language: ${lang}`, 'supportedLanguages');
    }
  }
  
  if (!user.location) {
    throw new ValidationError('Location is required', 'location');
  }
  validateLocation(user.location);
  
  if (!user.profile) {
    throw new ValidationError('User profile is required', 'profile');
  }
  validateUserProfile(user.profile);
  
  if (user.verified !== undefined && typeof user.verified !== 'boolean') {
    throw new ValidationError('Verified must be a boolean value', 'verified');
  }
}

/**
 * Validates vendor data
 */
export function validateVendor(vendor: Partial<Vendor>): void {
  // First validate as user
  validateUser(vendor);
  
  if (!vendor.businessName || typeof vendor.businessName !== 'string' || vendor.businessName.trim().length === 0) {
    throw new ValidationError('Business name is required and must be a non-empty string', 'businessName');
  }
  
  if (vendor.businessName.length > 100) {
    throw new ValidationError('Business name must be 100 characters or less', 'businessName');
  }
  
  if (!vendor.businessType || typeof vendor.businessType !== 'string' || vendor.businessType.trim().length === 0) {
    throw new ValidationError('Business type is required and must be a non-empty string', 'businessType');
  }
  
  if (vendor.businessType.length > 50) {
    throw new ValidationError('Business type must be 50 characters or less', 'businessType');
  }
  
  if (!vendor.businessHours) {
    throw new ValidationError('Business hours are required', 'businessHours');
  }
  validateBusinessHours(vendor.businessHours);
  
  if (!vendor.paymentMethods || !Array.isArray(vendor.paymentMethods) || vendor.paymentMethods.length === 0) {
    throw new ValidationError('At least one payment method is required', 'paymentMethods');
  }
  
  if (vendor.averageRating !== undefined) {
    if (typeof vendor.averageRating !== 'number' || vendor.averageRating < 0 || vendor.averageRating > 5) {
      throw new ValidationError('Average rating must be a number between 0 and 5', 'averageRating');
    }
  }
  
  if (vendor.totalTransactions !== undefined) {
    if (typeof vendor.totalTransactions !== 'number' || vendor.totalTransactions < 0) {
      throw new ValidationError('Total transactions must be a non-negative number', 'totalTransactions');
    }
  }
  
  if (vendor.responseTime !== undefined) {
    if (typeof vendor.responseTime !== 'number' || vendor.responseTime < 0) {
      throw new ValidationError('Response time must be a non-negative number', 'responseTime');
    }
  }
  
  if (vendor.products) {
    if (!Array.isArray(vendor.products)) {
      throw new ValidationError('Products must be an array', 'products');
    }
    vendor.products.forEach((product, index) => {
      try {
        validateProduct(product);
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new ValidationError(`Product ${index}: ${error.message}`, `products[${index}].${error.field}`);
        }
        throw error;
      }
    });
  }
  
  if (vendor.ratings) {
    if (!Array.isArray(vendor.ratings)) {
      throw new ValidationError('Ratings must be an array', 'ratings');
    }
    vendor.ratings.forEach((rating, index) => {
      try {
        validateVendorRating(rating);
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new ValidationError(`Rating ${index}: ${error.message}`, `ratings[${index}].${error.field}`);
        }
        throw error;
      }
    });
  }
}

/**
 * Validates product data
 */
export function validateProduct(product: Partial<Product>): void {
  if (product.productId && !validateUUID(product.productId)) {
    throw new ValidationError('Invalid product ID format', 'productId');
  }
  
  if (!product.vendorId || !validateUUID(product.vendorId)) {
    throw new ValidationError('Valid vendor ID is required', 'vendorId');
  }
  
  if (!product.name || typeof product.name !== 'string' || product.name.trim().length === 0) {
    throw new ValidationError('Product name is required and must be a non-empty string', 'name');
  }
  
  if (product.name.length > 255) {
    throw new ValidationError('Product name must be 255 characters or less', 'name');
  }
  
  if (product.description && typeof product.description !== 'string') {
    throw new ValidationError('Description must be a string', 'description');
  }
  
  if (product.description && product.description.length > 1000) {
    throw new ValidationError('Description must be 1000 characters or less', 'description');
  }
  
  if (!product.category || !validateProductCategory(product.category)) {
    throw new ValidationError('Valid product category is required', 'category');
  }
  
  if (typeof product.basePrice !== 'number' || product.basePrice <= 0) {
    throw new ValidationError('Base price must be a positive number', 'basePrice');
  }
  
  if (!product.currency || !validateCurrency(product.currency)) {
    throw new ValidationError('Valid currency code is required', 'currency');
  }
  
  if (!product.attributes) {
    throw new ValidationError('Product attributes are required', 'attributes');
  }
  validateProductAttributes(product.attributes);
  
  if (product.images && !Array.isArray(product.images)) {
    throw new ValidationError('Images must be an array', 'images');
  }
  
  if (product.availability) {
    const validAvailability = ['available', 'limited', 'out_of_stock'];
    if (!validAvailability.includes(product.availability)) {
      throw new ValidationError('Availability must be one of: available, limited, out_of_stock', 'availability');
    }
  }
}

/**
 * Validates vendor rating data
 */
export function validateVendorRating(rating: Partial<VendorRating>): void {
  if (rating.ratingId && !validateUUID(rating.ratingId)) {
    throw new ValidationError('Invalid rating ID format', 'ratingId');
  }
  
  if (!rating.customerId || !validateUUID(rating.customerId)) {
    throw new ValidationError('Valid customer ID is required', 'customerId');
  }
  
  if (typeof rating.rating !== 'number' || rating.rating < 1 || rating.rating > 5) {
    throw new ValidationError('Rating must be a number between 1 and 5', 'rating');
  }
  
  if (rating.review && typeof rating.review !== 'string') {
    throw new ValidationError('Review must be a string', 'review');
  }
  
  if (rating.review && rating.review.length > 500) {
    throw new ValidationError('Review must be 500 characters or less', 'review');
  }
}

/**
 * Validates translation request data
 */
export function validateTranslationRequest(request: Partial<TranslationRequest>): void {
  if (!request.text || typeof request.text !== 'string' || request.text.trim().length === 0) {
    throw new ValidationError('Text to translate is required and must be a non-empty string', 'text');
  }
  
  if (request.text.length > 5000) {
    throw new ValidationError('Text must be 5000 characters or less', 'text');
  }
  
  if (!request.sourceLang || !validateLanguage(request.sourceLang)) {
    throw new ValidationError('Valid source language is required', 'sourceLang');
  }
  
  if (!request.targetLang || !validateLanguage(request.targetLang)) {
    throw new ValidationError('Valid target language is required', 'targetLang');
  }
  
  if (request.sourceLang === request.targetLang) {
    throw new ValidationError('Source and target languages must be different', 'targetLang');
  }
  
  if (request.domain) {
    const validDomains = ['trade', 'negotiation', 'general'];
    if (!validDomains.includes(request.domain)) {
      throw new ValidationError('Domain must be one of: trade, negotiation, general', 'domain');
    }
  }
}

/**
 * Validates price discovery request data
 */
export function validatePriceDiscoveryRequest(request: Partial<PriceDiscoveryRequest>): void {
  if (!request.productId || !validateUUID(request.productId)) {
    throw new ValidationError('Valid product ID is required', 'productId');
  }
  
  if (!request.category || !validateProductCategory(request.category)) {
    throw new ValidationError('Valid product category is required', 'category');
  }
  
  if (!request.attributes) {
    throw new ValidationError('Product attributes are required', 'attributes');
  }
  validateProductAttributes(request.attributes);
  
  if (!request.vendorLocation) {
    throw new ValidationError('Vendor location is required', 'vendorLocation');
  }
  validateLocation(request.vendorLocation);
}

/**
 * Validates password strength
 */
export function validatePassword(password: string): void {
  if (!password || typeof password !== 'string') {
    throw new ValidationError('Password is required', 'password');
  }
  
  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters long', 'password');
  }
  
  if (password.length > 128) {
    throw new ValidationError('Password must be 128 characters or less', 'password');
  }
  
  // Check for at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    throw new ValidationError('Password must contain at least one lowercase letter', 'password');
  }
  
  // Check for at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    throw new ValidationError('Password must contain at least one uppercase letter', 'password');
  }
  
  // Check for at least one digit
  if (!/\d/.test(password)) {
    throw new ValidationError('Password must contain at least one digit', 'password');
  }
  
  // Check for at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    throw new ValidationError('Password must contain at least one special character', 'password');
  }
}

/**
 * Validates authentication credentials
 */
export function validateAuthCredentials(credentials: Partial<AuthCredentials>): void {
  if (!credentials.email || !validateEmail(credentials.email)) {
    throw new ValidationError('Valid email address is required', 'email');
  }
  
  if (!credentials.password || typeof credentials.password !== 'string') {
    throw new ValidationError('Password is required', 'password');
  }
}

/**
 * Validates user registration request
 */
export function validateRegisterUserRequest(request: Partial<RegisterUserRequest>): void {
  if (!request.email || !validateEmail(request.email)) {
    throw new ValidationError('Valid email address is required', 'email');
  }
  
  validatePassword(request.password!);
  
  if (request.phoneNumber && !validatePhoneNumber(request.phoneNumber)) {
    throw new ValidationError('Invalid phone number format', 'phoneNumber');
  }
  
  if (!request.preferredLanguage || !validateLanguage(request.preferredLanguage)) {
    throw new ValidationError('Valid preferred language is required', 'preferredLanguage');
  }
  
  if (!request.supportedLanguages || !Array.isArray(request.supportedLanguages) || request.supportedLanguages.length === 0) {
    throw new ValidationError('At least one supported language is required', 'supportedLanguages');
  }
  
  for (const lang of request.supportedLanguages) {
    if (!validateLanguage(lang)) {
      throw new ValidationError(`Unsupported language: ${lang}`, 'supportedLanguages');
    }
  }
  
  if (!request.location) {
    throw new ValidationError('Location is required', 'location');
  }
  validateLocation(request.location);
  
  if (!request.profile) {
    throw new ValidationError('User profile is required', 'profile');
  }
  validateUserProfile(request.profile);
}

/**
 * Validates vendor registration request
 */
export function validateRegisterVendorRequest(request: Partial<RegisterVendorRequest>): void {
  // First validate as user registration
  validateRegisterUserRequest(request);
  
  if (!request.businessName || typeof request.businessName !== 'string' || request.businessName.trim().length === 0) {
    throw new ValidationError('Business name is required and must be a non-empty string', 'businessName');
  }
  
  if (request.businessName.length > 100) {
    throw new ValidationError('Business name must be 100 characters or less', 'businessName');
  }
  
  if (!request.businessType || typeof request.businessType !== 'string' || request.businessType.trim().length === 0) {
    throw new ValidationError('Business type is required and must be a non-empty string', 'businessType');
  }
  
  if (request.businessType.length > 50) {
    throw new ValidationError('Business type must be 50 characters or less', 'businessType');
  }
  
  if (!request.businessHours) {
    throw new ValidationError('Business hours are required', 'businessHours');
  }
  validateBusinessHours(request.businessHours);
  
  if (!request.paymentMethods || !Array.isArray(request.paymentMethods) || request.paymentMethods.length === 0) {
    throw new ValidationError('At least one payment method is required', 'paymentMethods');
  }
}

/**
 * Validates password reset request
 */
export function validatePasswordResetRequest(request: Partial<PasswordResetRequest>): void {
  if (!request.email || !validateEmail(request.email)) {
    throw new ValidationError('Valid email address is required', 'email');
  }
}

/**
 * Validates password reset confirmation
 */
export function validatePasswordResetConfirm(request: Partial<PasswordResetConfirm>): void {
  if (!request.token || typeof request.token !== 'string' || request.token.trim().length === 0) {
    throw new ValidationError('Reset token is required', 'token');
  }
  
  validatePassword(request.newPassword!);
}

/**
 * Validates email verification request
 */
export function validateEmailVerificationRequest(request: Partial<EmailVerificationRequest>): void {
  if (!request.email || !validateEmail(request.email)) {
    throw new ValidationError('Valid email address is required', 'email');
  }
}

/**
 * Validates email verification confirmation
 */
export function validateEmailVerificationConfirm(request: Partial<EmailVerificationConfirm>): void {
  if (!request.token || typeof request.token !== 'string' || request.token.trim().length === 0) {
    throw new ValidationError('Verification token is required', 'token');
  }
}

/**
 * Validates phone verification request
 */
export function validatePhoneVerificationRequest(request: Partial<PhoneVerificationRequest>): void {
  if (!request.phoneNumber || !validatePhoneNumber(request.phoneNumber)) {
    throw new ValidationError('Valid phone number is required', 'phoneNumber');
  }
}

/**
 * Validates phone verification confirmation
 */
export function validatePhoneVerificationConfirm(request: Partial<PhoneVerificationConfirm>): void {
  if (!request.phoneNumber || !validatePhoneNumber(request.phoneNumber)) {
    throw new ValidationError('Valid phone number is required', 'phoneNumber');
  }
  
  if (!request.code || typeof request.code !== 'string' || request.code.trim().length === 0) {
    throw new ValidationError('Verification code is required', 'code');
  }
  
  if (!/^\d{6}$/.test(request.code)) {
    throw new ValidationError('Verification code must be 6 digits', 'code');
  }
}

/**
 * Validates profile update request
 */
export function validateUpdateProfileRequest(request: Partial<UpdateProfileRequest>): void {
  if (request.profile) {
    validateUserProfile(request.profile as UserProfile);
  }
  
  if (request.preferredLanguage && !validateLanguage(request.preferredLanguage)) {
    throw new ValidationError('Invalid preferred language', 'preferredLanguage');
  }
  
  if (request.supportedLanguages) {
    if (!Array.isArray(request.supportedLanguages) || request.supportedLanguages.length === 0) {
      throw new ValidationError('At least one supported language is required', 'supportedLanguages');
    }
    
    for (const lang of request.supportedLanguages) {
      if (!validateLanguage(lang)) {
        throw new ValidationError(`Unsupported language: ${lang}`, 'supportedLanguages');
      }
    }
  }
  
  if (request.location) {
    validateLocation(request.location);
  }
  
  if (request.phoneNumber && !validatePhoneNumber(request.phoneNumber)) {
    throw new ValidationError('Invalid phone number format', 'phoneNumber');
  }
}

/**
 * Validates vendor profile update request
 */
export function validateUpdateVendorProfileRequest(request: Partial<UpdateVendorProfileRequest>): void {
  // First validate as regular profile update
  validateUpdateProfileRequest(request);
  
  if (request.businessName !== undefined) {
    if (!request.businessName || typeof request.businessName !== 'string' || request.businessName.trim().length === 0) {
      throw new ValidationError('Business name must be a non-empty string', 'businessName');
    }
    
    if (request.businessName.length > 100) {
      throw new ValidationError('Business name must be 100 characters or less', 'businessName');
    }
  }
  
  if (request.businessType !== undefined) {
    if (!request.businessType || typeof request.businessType !== 'string' || request.businessType.trim().length === 0) {
      throw new ValidationError('Business type must be a non-empty string', 'businessType');
    }
    
    if (request.businessType.length > 50) {
      throw new ValidationError('Business type must be 50 characters or less', 'businessType');
    }
  }
  
  if (request.businessHours) {
    validateBusinessHours(request.businessHours);
  }
  
  if (request.paymentMethods) {
    if (!Array.isArray(request.paymentMethods) || request.paymentMethods.length === 0) {
      throw new ValidationError('At least one payment method is required', 'paymentMethods');
    }
  }
}

/**
 * Validates change password request
 */
export function validateChangePasswordRequest(request: Partial<ChangePasswordRequest>): void {
  if (!request.currentPassword || typeof request.currentPassword !== 'string') {
    throw new ValidationError('Current password is required', 'currentPassword');
  }
  
  validatePassword(request.newPassword!);
  
  if (request.currentPassword === request.newPassword) {
    throw new ValidationError('New password must be different from current password', 'newPassword');
  }
}

/**
 * Validates verification token format
 */
export function validateVerificationToken(token: string): boolean {
  // Token should be a hex string of at least 32 characters
  return /^[a-f0-9]{32,}$/i.test(token);
}

/**
 * Sanitizes string input by trimming whitespace and removing potentially harmful characters
 */
export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

/**
 * Validates and sanitizes user input for database operations
 */
export function sanitizeUserInput(data: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'string' ? sanitizeString(item) : item
      );
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates product creation data
 */
export function validateProductData(data: any): ValidationResult {
  const errors: string[] = [];
  
  try {
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.push('Product name is required and must be a non-empty string');
    } else if (data.name.length > 255) {
      errors.push('Product name must be 255 characters or less');
    }
    
    if (data.description && typeof data.description !== 'string') {
      errors.push('Description must be a string');
    } else if (data.description && data.description.length > 1000) {
      errors.push('Description must be 1000 characters or less');
    }
    
    if (!data.category || !validateProductCategory(data.category)) {
      errors.push('Valid product category is required');
    }
    
    if (typeof data.basePrice !== 'number' || data.basePrice <= 0) {
      errors.push('Base price must be a positive number');
    }
    
    if (data.currency && !validateCurrency(data.currency)) {
      errors.push('Invalid currency code');
    }
    
    if (!data.attributes) {
      errors.push('Product attributes are required');
    } else {
      try {
        validateProductAttributes(data.attributes);
      } catch (error) {
        if (error instanceof ValidationError) {
          errors.push(`Attributes: ${error.message}`);
        }
      }
    }
    
    if (data.images && !Array.isArray(data.images)) {
      errors.push('Images must be an array');
    }
    
  } catch (error) {
    if (error instanceof ValidationError) {
      errors.push(error.message);
    } else {
      errors.push('Validation error occurred');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates product update data
 */
export function validateProductUpdate(data: any): ValidationResult {
  const errors: string[] = [];
  
  try {
    if (data.name !== undefined) {
      if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
        errors.push('Product name must be a non-empty string');
      } else if (data.name.length > 255) {
        errors.push('Product name must be 255 characters or less');
      }
    }
    
    if (data.description !== undefined && typeof data.description !== 'string') {
      errors.push('Description must be a string');
    } else if (data.description && data.description.length > 1000) {
      errors.push('Description must be 1000 characters or less');
    }
    
    if (data.category !== undefined && !validateProductCategory(data.category)) {
      errors.push('Invalid product category');
    }
    
    if (data.basePrice !== undefined && (typeof data.basePrice !== 'number' || data.basePrice <= 0)) {
      errors.push('Base price must be a positive number');
    }
    
    if (data.currency !== undefined && !validateCurrency(data.currency)) {
      errors.push('Invalid currency code');
    }
    
    if (data.attributes !== undefined) {
      try {
        validateProductAttributes(data.attributes);
      } catch (error) {
        if (error instanceof ValidationError) {
          errors.push(`Attributes: ${error.message}`);
        }
      }
    }
    
    if (data.images !== undefined && !Array.isArray(data.images)) {
      errors.push('Images must be an array');
    }
    
    if (data.availability !== undefined) {
      const validAvailability = ['available', 'limited', 'out_of_stock'];
      if (!validAvailability.includes(data.availability)) {
        errors.push('Availability must be one of: available, limited, out_of_stock');
      }
    }
    
  } catch (error) {
    if (error instanceof ValidationError) {
      errors.push(error.message);
    } else {
      errors.push('Validation error occurred');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates product search filters
 */
export function validateSearchFilters(filters: any): ValidationResult {
  const errors: string[] = [];
  
  try {
    if (filters.category !== undefined && !validateProductCategory(filters.category)) {
      errors.push('Invalid product category');
    }
    
    if (filters.minPrice !== undefined && (typeof filters.minPrice !== 'number' || filters.minPrice < 0)) {
      errors.push('Minimum price must be a non-negative number');
    }
    
    if (filters.maxPrice !== undefined && (typeof filters.maxPrice !== 'number' || filters.maxPrice < 0)) {
      errors.push('Maximum price must be a non-negative number');
    }
    
    if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) {
      errors.push('Minimum price cannot be greater than maximum price');
    }
    
    if (filters.availability !== undefined) {
      const validAvailability = ['available', 'limited', 'out_of_stock'];
      if (!validAvailability.includes(filters.availability)) {
        errors.push('Availability must be one of: available, limited, out_of_stock');
      }
    }
    
    if (filters.vendorId !== undefined && !validateUUID(filters.vendorId)) {
      errors.push('Invalid vendor ID format');
    }
    
    if (filters.quality !== undefined) {
      const validQualities = ['basic', 'standard', 'premium'];
      if (!validQualities.includes(filters.quality)) {
        errors.push('Quality must be one of: basic, standard, premium');
      }
    }
    
    if (filters.perishable !== undefined && typeof filters.perishable !== 'boolean') {
      errors.push('Perishable must be a boolean value');
    }
    
    if (filters.searchTerm !== undefined && typeof filters.searchTerm !== 'string') {
      errors.push('Search term must be a string');
    }
    
  } catch (error) {
    if (error instanceof ValidationError) {
      errors.push(error.message);
    } else {
      errors.push('Validation error occurred');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}