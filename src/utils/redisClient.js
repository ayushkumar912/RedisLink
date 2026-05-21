const { createClient } = require('redis');
const { promisify } = require('util');
const config = require('../config');
const redisPackage = require('redis/package.json');

const isRedisV3 = redisPackage.version.startsWith('3.');

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
      const clientOptions = isRedisV3
        ? {
            host: config.redis.host,
            port: config.redis.port,
            retry_strategy: (options) => {
              if (options.attempt >= this.maxRetries) {
                console.log('Application will continue without Redis caching');
                return undefined;
              }
              this.retryCount = options.attempt;
              console.log(`Retrying Redis connection (${options.attempt}/${this.maxRetries})`);
              return Math.min(options.attempt * 100, 3000);
            }
          }
        : {
            socket: {
              host: config.redis.host,
              port: config.redis.port,
              reconnectStrategy: (retries) => {
                if (retries >= this.maxRetries) {
                  console.log('Application will continue without Redis caching');
                  return false;
                }
                this.retryCount = retries;
                console.log(`Retrying Redis connection (${retries}/${this.maxRetries})`);
                return Math.min(retries * 100, 3000);
              }
            }
          };

      if (config.redis.password) {
        clientOptions.password = config.redis.password;
      }

      this.client = createClient(clientOptions);

      this.client.on('connect', () => {
        console.log('Redis connected successfully');
        this.isConnected = true;
        this.retryCount = 0;
      });

      this.client.on('error', (err) => {
        console.error('Redis connection error:', err.message);
        this.isConnected = false;
      });

      this.client.on('end', () => {
        console.log('Redis connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        console.log('Reconnecting to Redis...');
      });

      if (this.client.connect) {
        await this.client.connect();
      } else {
        this.promisifiedClient = {
          set: promisify(this.client.set).bind(this.client),
          get: promisify(this.client.get).bind(this.client),
          del: promisify(this.client.del).bind(this.client),
          exists: promisify(this.client.exists).bind(this.client),
          incr: promisify(this.client.incr).bind(this.client),
          expire: promisify(this.client.expire).bind(this.client),
          quit: promisify(this.client.quit).bind(this.client)
        };
        this.isConnected = true;
      }

      return this.client;
    } catch (error) {
      console.error('Failed to initialize Redis client:', error.message);
      this.connectionPromise = null;
      throw error;
    }
  }

  async set(key, value, ttl = config.redis.ttl) {
    try {
      if (!this.isConnected || !this.client) return null;
      if (isRedisV3) {
        return await this.promisifiedClient.set(key, JSON.stringify(value), 'EX', ttl);
      }
      return await this.client.set(key, JSON.stringify(value), { EX: ttl });
    } catch (error) {
      console.error('Redis SET error:', error.message);
      return null;
    }
  }

  async get(key) {
    try {
      if (!this.isConnected || !this.client) return null;
      const result = isRedisV3
        ? await this.promisifiedClient.get(key)
        : await this.client.get(key);
      return result ? JSON.parse(result) : null;
    } catch (error) {
      console.error('Redis GET error:', error.message);
      return null;
    }
  }

  async del(key) {
    try {
      if (!this.isConnected || !this.client) return null;
      return isRedisV3
        ? await this.promisifiedClient.del(key)
        : await this.client.del(key);
    } catch (error) {
      console.error('Redis DELETE error:', error.message);
      return null;
    }
  }

  async exists(key) {
    try {
      if (!this.isConnected || !this.client) return false;
      return isRedisV3
        ? await this.promisifiedClient.exists(key)
        : await this.client.exists(key);
    } catch (error) {
      console.error('Redis EXISTS error:', error.message);
      return false;
    }
  }

  async incr(key) {
    try {
      if (!this.isConnected || !this.client) return null;
      return isRedisV3
        ? await this.promisifiedClient.incr(key)
        : await this.client.incr(key);
    } catch (error) {
      console.error('Redis INCR error:', error.message);
      return null;
    }
  }

  async expire(key, seconds) {
    try {
      if (!this.isConnected || !this.client) return null;
      return isRedisV3
        ? await this.promisifiedClient.expire(key, seconds)
        : await this.client.expire(key, seconds);
    } catch (error) {
      console.error('Redis EXPIRE error:', error.message);
      return null;
    }
  }

  async disconnect() {
    try {
      if (this.client && this.isConnected) {
        if (isRedisV3) {
          await this.promisifiedClient.quit();
        } else {
          await this.client.quit();
        }
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
