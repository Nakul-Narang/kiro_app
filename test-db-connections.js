const { connectDatabases, closeDatabases, getPostgresPool, getMongoDb, getRedisClient } = require('./dist/config/database');

async function testDatabaseConnections() {
  console.log('🧪 Testing database connections...');
  
  try {
    // Connect to all databases
    await connectDatabases();
    
    // Test PostgreSQL
    console.log('🔍 Testing PostgreSQL...');
    const pgPool = getPostgresPool();
    const pgResult = await pgPool.query('SELECT version()');
    console.log('✅ PostgreSQL version:', pgResult.rows[0].version.substring(0, 50) + '...');
    
    // Test MongoDB
    console.log('🔍 Testing MongoDB...');
    const mongoDb = getMongoDb();
    const mongoResult = await mongoDb.admin().serverStatus();
    console.log('✅ MongoDB version:', mongoResult.version);
    
    // Test Redis
    console.log('🔍 Testing Redis...');
    const redisClient = getRedisClient();
    const redisResult = await redisClient.ping();
    console.log('✅ Redis ping result:', redisResult);
    
    console.log('🎉 All database connections working!');
    
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    process.exit(1);
  } finally {
    await closeDatabases();
    console.log('✅ Database connections closed');
  }
}

testDatabaseConnections();