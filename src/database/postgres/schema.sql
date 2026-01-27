-- PostgreSQL schema for Multilingual Mandi platform
-- This file contains the core transactional data structures

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    preferred_language VARCHAR(10) NOT NULL DEFAULT 'en',
    supported_languages TEXT[] NOT NULL DEFAULT ARRAY['en'],
    location JSONB NOT NULL,
    profile JSONB NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vendors table (extends users)
CREATE TABLE vendors (
    vendor_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    business_name VARCHAR(255) NOT NULL,
    business_type VARCHAR(100) NOT NULL,
    business_hours JSONB NOT NULL,
    payment_methods TEXT[] NOT NULL DEFAULT ARRAY['cash'],
    average_rating DECIMAL(3,2) DEFAULT 0.00,
    total_transactions INTEGER DEFAULT 0,
    response_time INTEGER DEFAULT 0, -- in minutes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products table
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    base_price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    attributes JSONB NOT NULL,
    images TEXT[] DEFAULT ARRAY[]::TEXT[],
    availability VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'limited', 'out_of_stock')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vendor ratings table
CREATE TABLE vendor_ratings (
    rating_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(vendor_id, customer_id) -- One rating per customer per vendor
);

-- Trade sessions table
CREATE TABLE trade_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'inquiry' CHECK (status IN ('inquiry', 'negotiating', 'agreed', 'completed', 'disputed')),
    final_terms JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
    message_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES trade_sessions(session_id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    original_text TEXT NOT NULL,
    original_language VARCHAR(10) NOT NULL,
    translations JSONB DEFAULT '{}',
    message_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'offer', 'system')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Negotiation sessions table
CREATE TABLE negotiation_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    initial_price DECIMAL(10,2) NOT NULL,
    current_offer DECIMAL(10,2) NOT NULL,
    counter_offer DECIMAL(10,2),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
    rounds JSONB NOT NULL DEFAULT '[]',
    time_limit TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions table
CREATE TABLE transactions (
    transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES trade_sessions(session_id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    final_price DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2) NOT NULL,
    negotiation_rounds INTEGER DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'disputed')),
    payment_method VARCHAR(50),
    delivery_status VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_location ON users USING GIN(location);
CREATE INDEX idx_vendors_business_name ON vendors(business_name);
CREATE INDEX idx_vendors_rating ON vendors(average_rating DESC);
CREATE INDEX idx_products_vendor ON products(vendor_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_availability ON products(availability);
CREATE INDEX idx_products_price ON products(base_price);
CREATE INDEX idx_products_updated ON products(last_updated DESC);
CREATE INDEX idx_trade_sessions_vendor ON trade_sessions(vendor_id);
CREATE INDEX idx_trade_sessions_customer ON trade_sessions(customer_id);
CREATE INDEX idx_trade_sessions_status ON trade_sessions(status);
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_negotiation_sessions_status ON negotiation_sessions(status);
CREATE INDEX idx_transactions_vendor ON transactions(vendor_id);
CREATE INDEX idx_transactions_customer ON transactions(customer_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_trade_sessions_updated_at BEFORE UPDATE ON trade_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_negotiation_sessions_updated_at BEFORE UPDATE ON negotiation_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update vendor average rating
CREATE OR REPLACE FUNCTION update_vendor_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE vendors 
    SET average_rating = (
        SELECT COALESCE(AVG(rating), 0)
        FROM vendor_ratings 
        WHERE vendor_id = COALESCE(NEW.vendor_id, OLD.vendor_id)
    )
    WHERE vendor_id = COALESCE(NEW.vendor_id, OLD.vendor_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

CREATE TRIGGER update_vendor_rating_trigger 
    AFTER INSERT OR UPDATE OR DELETE ON vendor_ratings 
    FOR EACH ROW EXECUTE FUNCTION update_vendor_rating();

-- Function to update vendor transaction count
CREATE OR REPLACE FUNCTION update_vendor_transaction_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        UPDATE vendors 
        SET total_transactions = total_transactions + 1
        WHERE vendor_id = NEW.vendor_id;
    ELSIF OLD.status = 'completed' AND NEW.status != 'completed' THEN
        UPDATE vendors 
        SET total_transactions = GREATEST(total_transactions - 1, 0)
        WHERE vendor_id = NEW.vendor_id;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_vendor_transaction_count_trigger 
    AFTER UPDATE ON transactions 
    FOR EACH ROW EXECUTE FUNCTION update_vendor_transaction_count();