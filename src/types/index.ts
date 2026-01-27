// Core domain types and interfaces for the Multilingual Mandi platform

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  country?: string;
  postalCode?: string;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  avatar?: string;
  bio?: string;
  timezone?: string;
}

export interface BusinessHours {
  monday: { open: string; close: string; closed?: boolean };
  tuesday: { open: string; close: string; closed?: boolean };
  wednesday: { open: string; close: string; closed?: boolean };
  thursday: { open: string; close: string; closed?: boolean };
  friday: { open: string; close: string; closed?: boolean };
  saturday: { open: string; close: string; closed?: boolean };
  sunday: { open: string; close: string; closed?: boolean };
}

export interface User {
  userId: string;
  email: string;
  phoneNumber?: string;
  preferredLanguage: string;
  supportedLanguages: string[];
  location: Location;
  profile: UserProfile;
  createdAt: Date;
  lastActive: Date;
  verified: boolean;
}

export interface VendorRating {
  ratingId: string;
  customerId: string;
  rating: number; // 1-5
  review?: string;
  createdAt: Date;
}

export interface ProductAttributes {
  quality: 'basic' | 'standard' | 'premium';
  quantity: number;
  unit: string;
  seasonality?: 'high' | 'medium' | 'low';
  perishable: boolean;
  weight?: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
}

export interface Product {
  productId: string;
  vendorId: string;
  name: string;
  description: string;
  category: string;
  basePrice: number;
  currency: string;
  attributes: ProductAttributes;
  images: string[];
  availability: 'available' | 'limited' | 'out_of_stock';
  lastUpdated: Date;
}

export interface Vendor extends User {
  businessName: string;
  businessType: string;
  products: Product[];
  ratings: VendorRating[];
  averageRating: number;
  totalTransactions: number;
  responseTime: number; // average in minutes
  businessHours: BusinessHours;
  paymentMethods: string[];
}

// Translation types
export interface ConversationContext {
  sessionId: string;
  previousMessages: Message[];
  productCategory?: string;
  negotiationPhase?: 'inquiry' | 'negotiation' | 'closing';
}

export interface TranslationRequest {
  text: string;
  sourceLang: string;
  targetLang: string;
  context?: ConversationContext;
  domain?: 'trade' | 'negotiation' | 'general';
}

export interface TranslationResponse {
  translatedText: string;
  confidence: number;
  detectedLanguage?: string;
  alternatives?: string[];
  processingTime: number;
}

// Price discovery types
export interface MarketConditions {
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  demand: 'low' | 'medium' | 'high';
  supply: 'low' | 'medium' | 'high';
  economicIndicators?: Record<string, number>;
}

export interface PricingFactor {
  name: string;
  impact: number; // -1 to 1
  description: string;
}

export interface PriceDiscoveryRequest {
  productId: string;
  category: string;
  attributes: ProductAttributes;
  vendorLocation: Location;
  marketConditions?: MarketConditions;
}

export interface PriceRecommendation {
  suggestedPrice: number;
  priceRange: {
    min: number;
    max: number;
  };
  confidence: number;
  factors: PricingFactor[];
  marketPosition: 'below' | 'at' | 'above' | 'premium';
  lastUpdated: Date;
}

// Negotiation types
export interface NegotiationRound {
  roundNumber: number;
  offeredBy: 'vendor' | 'customer';
  amount: number;
  message?: string;
  fairnessScore: number;
  timestamp: Date;
}

export interface NegotiationSession {
  sessionId: string;
  vendorId: string;
  customerId: string;
  productId: string;
  initialPrice: number;
  currentOffer: number;
  counterOffer?: number;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  rounds: NegotiationRound[];
  timeLimit: Date;
}

export interface FairnessIndicator {
  score: number; // 0-100
  factors: {
    marketComparison: number;
    historicalTrends: number;
    qualityAdjustment: number;
  };
  recommendation: 'accept' | 'counter' | 'reject';
}

// Trade session types
export interface Message {
  messageId: string;
  senderId: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'offer' | 'system';
}

export interface TranslatedMessage {
  messageId: string;
  senderId: string;
  originalText: string;
  originalLanguage: string;
  translations: Map<string, string>;
  timestamp: Date;
  messageType: 'text' | 'offer' | 'system';
}

export interface AgreementTerms {
  finalPrice: number;
  quantity: number;
  deliveryTerms: string;
  paymentMethod: string;
  agreedAt: Date;
  vendorSignature: string;
  customerSignature: string;
}

export interface TradeSession {
  sessionId: string;
  vendorId: string;
  customerId: string;
  productId: string;
  status: 'inquiry' | 'negotiating' | 'agreed' | 'completed' | 'disputed';
  messages: TranslatedMessage[];
  negotiation?: NegotiationSession;
  finalTerms?: AgreementTerms;
  createdAt: Date;
  updatedAt: Date;
}

// WebSocket types
export interface WebSocketMessage {
  type: 'message' | 'offer' | 'system' | 'notification';
  sessionId: string;
  senderId: string;
  recipientId: string;
  payload: any;
  timestamp: Date;
  requiresTranslation: boolean;
}

export interface UserPresence {
  userId: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: Date;
  activeSessionIds: string[];
  preferredLanguage: string;
}

// Transaction types
export interface Transaction {
  transactionId: string;
  sessionId: string;
  vendorId: string;
  customerId: string;
  productId: string;
  finalPrice: number;
  originalPrice: number;
  negotiationRounds: number;
  currency: string;
  status: 'pending' | 'completed' | 'cancelled' | 'disputed';
  completedAt?: Date;
  paymentMethod: string;
  deliveryStatus: string;
}

// Analytics types
export interface SeasonalData {
  season: string;
  averagePrice: number;
  volume: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface MarketAnalytics {
  productCategory: string;
  region: string;
  averagePrice: number;
  priceRange: { min: number; max: number };
  transactionVolume: number;
  seasonalTrends: SeasonalData[];
  competitorCount: number;
  demandLevel: 'low' | 'medium' | 'high';
  lastUpdated: Date;
}

export interface UserBehaviorAnalytics {
  userId: string;
  sessionDuration: number;
  messagesPerSession: number;
  negotiationSuccessRate: number;
  preferredCategories: string[];
  averageTransactionValue: number;
  languageUsagePatterns: Map<string, number>;
}

// Authentication types
export interface AuthCredentials {
  email: string;
  password: string;
}

export interface RegisterUserRequest {
  email: string;
  password: string;
  phoneNumber?: string;
  preferredLanguage: string;
  supportedLanguages: string[];
  location: Location;
  profile: UserProfile;
}

export interface RegisterVendorRequest extends RegisterUserRequest {
  businessName: string;
  businessType: string;
  businessHours: BusinessHours;
  paymentMethods: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: User | Vendor;
  tokens: AuthTokens;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}

export interface EmailVerificationRequest {
  email: string;
}

export interface EmailVerificationConfirm {
  token: string;
}

export interface PhoneVerificationRequest {
  phoneNumber: string;
}

export interface PhoneVerificationConfirm {
  phoneNumber: string;
  code: string;
}

export interface UpdateProfileRequest {
  profile?: Partial<UserProfile>;
  preferredLanguage?: string;
  supportedLanguages?: string[];
  location?: Location;
  phoneNumber?: string;
}

export interface UpdateVendorProfileRequest extends UpdateProfileRequest {
  businessName?: string;
  businessType?: string;
  businessHours?: BusinessHours;
  paymentMethods?: string[];
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// JWT Payload interface
export interface JWTPayload {
  userId: string;
  email: string;
  role: 'user' | 'vendor';
  iat?: number;
  exp?: number;
}

// Verification token interface
export interface VerificationToken {
  token: string;
  userId: string;
  type: 'email' | 'phone' | 'password_reset';
  expiresAt: Date;
  createdAt: Date;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  timestamp: Date;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}