/**
 * RedisLink Server Entry Point
 * Enhanced with proper error handling and graceful shutdown
 */

const app = require('./app');
const config = require('./config');
const databaseManager = require('./config/database');
const redisManager = require('./utils/redisClient');

class Server {
  constructor() {
    this.server = null;
    this.isShuttingDown = false;
  }

  async start() {
    try {
      console.log('Starting RedisLink server...');
      
      // Initialize database connection
      await databaseManager.connect();
      
      // Initialize Redis connection (non-blocking)
      redisManager.connect().catch(err => {
        console.warn('Redis connection failed, continuing without cache:', err.message);
      });
      
      // Start HTTP server
      this.server = app.listen(config.server.port, () => {
        console.log(`RedisLink server running on port ${config.server.port}`);
        console.log(`Environment: ${config.server.env}`);
        console.log(`Health check: ${config.server.baseUrl}/health`);
      });

      // Setup graceful shutdown handlers
      this.setupGracefulShutdown();
      
    } catch (error) {
      console.error('Failed to start server:', error.message);
      process.exit(1);
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      
      console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
      this.isShuttingDown = true;

      try {
        // Close HTTP server
        if (this.server) {
          await new Promise((resolve) => {
            this.server.close(resolve);
          });
          console.log('HTTP server closed');
        }

        // Close database connection
        await databaseManager.disconnect();
        
        // Close Redis connection
        await redisManager.disconnect();
        
        console.log('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error.message);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('UNHANDLED_REJECTION');
    });
  }
}

// Start the server
const server = new Server();
server.start();