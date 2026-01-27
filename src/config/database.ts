import { Pool } from 'pg';
import { MongoClient, Db } from 'mongodb';
import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

// PostgreSQL connection
let pgPool: Pool;

// MongoDB connection
let mongoClient: MongoClient;
let mongoDb: Db;

// Redis connection
let redisClient: RedisClientType;

/**
 * Initialize PostgreSQL connection pool
 */
async function connectPostgreSQL(): Promise<void> {
  try {
    pgPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'multilingual_mandi',
      user: process.env.POSTGRES_USER || 'mandi_user',
      password: process.env.POSTGRES_PASSWORD,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test the connection
    const client = await pgPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    logger.info('✅ PostgreSQL connected successfully');
  } catch (error) {
    logger.error('❌ PostgreSQL connection failed:', error);
    throw error;
  }
}

/**
 * Initialize MongoDB connection
 */
async function connectMongoDB(): Promise<void> {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/multilingual_mandi_analytics';
    
    mongoClient = new MongoClient(mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    await mongoClient.connect();
    
    // Test the connection
    await mongoClient.db().admin().ping();
    
    mongoDb = mongoClient.db();
    
    logger.info('✅ MongoDB connected successfully');
  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error);
    throw error;
  }
}

/**
 * Initialize Redis connection
 */
async function connectRedis(): Promise<void> {
  try {
    const redisConfig: any = {
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    };
    
    if (process.env.REDIS_PASSWORD) {
      redisConfig.password = process.env.REDIS_PASSWORD;
    }
    
    redisClient = createClient(redisConfig);

    redisClient.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('✅ Redis connected successfully');
    });

    redisClient.on('ready', () => {
      logger.info('✅ Redis ready for operations');
    });

    await redisClient.connect();
    
    // Test the connection
    await redisClient.ping();
    
  } catch (error) {
    logger.error('❌ Redis connection failed:', error);
    throw error;
  }
}

/**
 * Connect to all databases
 */
export async function connectDatabases(): Promise<void> {
  logger.info('🔌 Connecting to databases...');
  
  await Promise.all([
    connectPostgreSQL(),
    connectMongoDB(),
    connectRedis()
  ]);
  
  logger.info('🎉 All databases connected successfully');
}

/**
 * Get PostgreSQL pool instance
 */
export function getPostgresPool(): Pool {
  if (!pgPool) {
    throw new Error('PostgreSQL pool not initialized. Call connectDatabases() first.');
  }
  return pgPool;
}

/**
 * Get MongoDB database instance
 */
export function getMongoDb(): Db {
  if (!mongoDb) {
    throw new Error('MongoDB not initialized. Call connectDatabases() first.');
  }
  return mongoDb;
}

/**
 * Get Redis client instance
 */
export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectDatabases() first.');
  }
  return redisClient;
}

/**
 * Close all database connections gracefully
 */
export async function closeDatabases(): Promise<void> {
  logger.info('🔌 Closing database connections...');
  
  const closePromises: Promise<void>[] = [];
  
  if (pgPool) {
    closePromises.push(pgPool.end());
  }
  
  if (mongoClient) {
    closePromises.push(mongoClient.close());
  }
  
  if (redisClient) {
    closePromises.push(redisClient.quit().then(() => {}));
  }
  
  await Promise.all(closePromises);
  logger.info('✅ All database connections closed');
}