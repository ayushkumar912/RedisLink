const redis = require('redis');
const { promisify } = require('util');
const config = require('../config');

class RedisManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.connectionPromise = null;
    this.retryCount = 0;
    this.maxRetries = config.redis.retryAttempts;
  }

  async connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._connect();
    return this.connectionPromise;
  }

  async _connect() {
    try {
      this.client = redis.createClient({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        retry_unfulfilled_commands: true,
        retry_delay_on_failover: config.redis.retryDelayOnFailover,
        max_attempts: this.maxRetries
      });

      this.client.on('connect', () => {
        console.log('Redis connected successfully');
        this.isConnected = true;
        this.retryCount = 0;
      });

      this.client.on('error', (err) => {
        console.error('Redis connection error:', err.message);
        this.isConnected = false;
        
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          console.log(`Retrying Redis connection (${this.retryCount}/${this.maxRetries})`);
        } else {
          console.log('Application will continue without Redis caching');
        }
      });

      this.client.on('end', () => {
        console.log('Redis connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        console.log('Reconnecting to Redis...');
      });

      return this.client;
    } catch (error) {
      console.error('Failed to initialize Redis client:', error.message);
      this.connectionPromise = null;
      throw error;
    }
  }

  async set(key, value, ttl = config.redis.ttl) {
    try {
      if (!this.isConnected) {
        console.log('Redis not connected, skipping SET operation');
        return null;
      }

      const setAsync = promisify(this.client.setex).bind(this.client);
      const result = await setAsync(key, ttl, JSON.stringify(value));
      return result;
    } catch (error) {
      console.error('Redis SET error:', error.message);
      return null;
    }
  }

  async get(key) {
    try {
      if (!this.isConnected) {
        console.log('Redis not connected, skipping GET operation');
        return null;
      }

      const getAsync = promisify(this.client.get).bind(this.client);
      const result = await getAsync(key);
      
      if (result) {
        return JSON.parse(result);
      }
      return null;
    } catch (error) {
      console.error('Redis GET error:', error.message);
      return null;
    }
  }

  async del(key) {
    try {
      if (!this.isConnected) {
        console.log('Redis not connected, skipping DELETE operation');
        return null;
      }

      const delAsync = promisify(this.client.del).bind(this.client);
      return await delAsync(key);
    } catch (error) {
      console.error('Redis DELETE error:', error.message);
      return null;
    }
  }

  async exists(key) {
    try {
      if (!this.isConnected) {
        return false;
      }

      const existsAsync = promisify(this.client.exists).bind(this.client);
      return await existsAsync(key);
    } catch (error) {
      console.error('Redis EXISTS error:', error.message);
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.quit();
        console.log('Redis connection closed gracefully');
      }
    } catch (error) {
      console.error('Error closing Redis connection:', error.message);
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      host: config.redis.host,
      port: config.redis.port
    };
  }
}

const redisManager = new RedisManager();

redisManager.connect().catch(err => {
  console.error('Failed to initialize Redis:', err.message);
});

process.on('SIGINT', async () => {
  await redisManager.disconnect();
});

module.exports = redisManager;