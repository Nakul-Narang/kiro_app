import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Mock external services for testing
jest.mock('../config/database', () => ({
  connectDatabases: jest.fn().mockResolvedValue(undefined),
  getPostgresPool: jest.fn().mockReturnValue({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn()
    }),
    end: jest.fn().mockResolvedValue(undefined)
  }),
  getMongoDb: jest.fn().mockReturnValue({
    collection: jest.fn().mockReturnValue({
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([])
          })
        }),
        toArray: jest.fn().mockResolvedValue([])
      }),
      findOne: jest.fn().mockResolvedValue(null),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      insertOne: jest.fn().mockResolvedValue({ acknowledged: true })
    })
  }),
  getRedisClient: jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setEx: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    ping: jest.fn().mockResolvedValue('PONG'),
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue('OK')
  }),
  closeDatabases: jest.fn().mockResolvedValue(undefined)
}));

// Global test timeout
jest.setTimeout(30000);

// Suppress console logs during tests unless explicitly needed
if (process.env.VERBOSE_TESTS !== 'true') {
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
}