# Multilingual Mandi Platform

A web-based multilingual trading platform that bridges language barriers in local marketplaces through real-time translation, AI-driven price discovery, and intelligent negotiation tools.

## Features

- **Real-time Multilingual Communication**: AI-powered translation supporting 20+ languages
- **AI-driven Price Discovery**: Intelligent pricing recommendations based on market data
- **Intelligent Negotiation Tools**: Structured negotiation workflows with fairness indicators
- **Vendor Management**: Comprehensive vendor discovery and management system
- **Trade Session Management**: Complete interaction tracking from inquiry to completion
- **Market Analytics**: Privacy-preserving analytics and market intelligence
- **Real-time Communication**: WebSocket-based instant messaging and notifications
- **Mobile-responsive Interface**: Optimized for all device types

## Technology Stack

### Backend
- **Node.js** with **Express.js** - REST API and server framework
- **TypeScript** - Type-safe development
- **Socket.IO** - Real-time WebSocket communication
- **PostgreSQL** - Primary database for transactional data
- **MongoDB** - Analytics and unstructured data storage
- **Redis** - Caching, session management, and pub/sub messaging

### Testing
- **Jest** - Unit testing framework
- **fast-check** - Property-based testing library
- **Supertest** - API testing utilities

### External Services
- **Google Cloud Translation API** - Primary translation service
- **Azure Translator** - Fallback translation service

## Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL 12+
- MongoDB 4.4+
- Redis 6+

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd multilingual-mandi
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials and API keys
   ```

4. **Set up databases**
   
   **PostgreSQL:**
   ```bash
   # Create database
   createdb multilingual_mandi
   
   # Run schema
   psql -d multilingual_mandi -f src/database/postgres/schema.sql
   ```
   
   **MongoDB:**
   ```bash
   # Connect to MongoDB and run setup
   mongosh multilingual_mandi_analytics src/database/mongodb/collections.js
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3000`

### API Endpoints

- **Health Check**: `GET /health`
- **API Info**: `GET /api/v1`

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:pbt` - Run property-based tests only
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues

### Project Structure

```
src/
├── config/           # Database and service configurations
├── database/         # Database schemas and migrations
├── middleware/       # Express middleware
├── services/         # Business logic services
│   ├── translation/  # Translation engine
│   ├── pricing/      # Price discovery system
│   ├── negotiation/  # Negotiation engine
│   └── realtime/     # WebSocket services
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
├── test/             # Test files
└── server.ts         # Main server entry point
```

### Testing

The project uses a dual testing approach:

**Unit Tests**: Test specific functionality and edge cases
```bash
npm test
```

**Property-Based Tests**: Test universal properties across random inputs
```bash
npm run test:pbt
```

Property-based tests validate correctness properties from the design document and run with 100+ iterations to ensure comprehensive coverage.

### Database Schema

**PostgreSQL** stores transactional data:
- Users and vendors
- Products and inventory
- Trade sessions and messages
- Negotiations and transactions

**MongoDB** stores analytics data:
- Market analytics and trends
- User behavior patterns
- Price history for ML training
- Translation cache

**Redis** handles:
- Session management
- Real-time messaging
- Caching layer
- Rate limiting

## Configuration

### Environment Variables

Key environment variables (see `.env.example` for complete list):

```bash
# Server
NODE_ENV=development
PORT=3000

# Databases
POSTGRES_HOST=localhost
POSTGRES_DB=multilingual_mandi
MONGODB_URI=mongodb://localhost:27017/multilingual_mandi_analytics
REDIS_HOST=localhost

# Translation Services
GOOGLE_TRANSLATE_API_KEY=your_api_key
AZURE_TRANSLATOR_KEY=your_api_key

# Security
JWT_SECRET=your_secret_key
BCRYPT_ROUNDS=12
```

### Database Connections

The application automatically connects to all databases on startup. Connection status is logged and health checks verify connectivity.

## API Documentation

### Health Check
```http
GET /health
```

Returns server status and uptime information.

### API Information
```http
GET /api/v1
```

Returns API version and available services.

## Real-time Communication

The platform uses Socket.IO for real-time features:

- **User presence tracking**
- **Instant messaging with translation**
- **Live negotiation updates**
- **Typing indicators**
- **Connection management**

### WebSocket Events

- `authenticate` - User authentication
- `join_session` - Join trade session
- `send_message` - Send message
- `send_offer` - Send negotiation offer
- `typing` - Typing indicator

## Services Architecture

### Translation Service
- Multi-provider support (Google, Azure)
- Context-aware translations
- Trade-specific terminology
- Caching and fallback mechanisms

### Price Discovery Service
- Market data analysis
- ML-based price recommendations
- Seasonal and trend analysis
- Confidence scoring

### Negotiation Service
- Structured negotiation workflows
- Fairness indicators
- Compromise suggestions
- Session management

### WebSocket Service
- Real-time communication
- User presence management
- Message routing
- Connection scaling

## Monitoring and Logging

- **Winston** for structured logging
- **Health checks** for service monitoring
- **Error tracking** with stack traces
- **Performance metrics** collection

## Security Features

- **JWT authentication** with refresh tokens
- **Rate limiting** with Redis
- **Input validation** with Joi
- **SQL injection protection**
- **CORS configuration**
- **Helmet security headers**

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For questions or issues, please check the documentation or create an issue in the repository.