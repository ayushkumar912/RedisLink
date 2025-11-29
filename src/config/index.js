const dotenv = require('dotenv');

dotenv.config();

const config = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    baseUrl: process.env.BASE_URL || 'http://localhost:3000'
  },

  database: {
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/redislink',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    }
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    ttl: parseInt(process.env.CACHE_TTL) || 86400,
    retryAttempts: 3,
    retryDelayOnFailover: 100
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },

  url: {
    maxLength: 2048,
    codeLength: 8,
    protocols: ['http:', 'https:']
  },

  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  }
};

const requiredEnvVars = ['MONGO_URI'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error('Please check your .env file');
}

module.exports = config;