/**
 * RedisLink Express Application
 * Enhanced with proper middleware chain and error handling
 */

const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');

const config = require('./config');
const routes = require('./routes/route.js');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { sanitizeInput } = require('./validators/urlValidator');
const databaseManager = require('./config/database');
const redisManager = require('./utils/redisClient');

const app = express();

// Trust proxy (for deployment behind reverse proxy)
app.set('trust proxy', 1);

// Security Middleware
if (config.server.env === 'production') {
  app.use(helmet()); // Security headers
}

// CORS
app.use(cors({
  origin: config.server.env === 'development' ? '*' : false,
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization
app.use(sanitizeInput);

// Logging Middleware
if (config.server.env === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  const dbStatus = databaseManager.getConnectionStatus();
  const redisStatus = redisManager.getConnectionStatus();
  
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.server.env,
    services: {
      database: {
        status: dbStatus.isConnected ? 'connected' : 'disconnected',
        readyState: dbStatus.readyState
      },
      redis: {
        status: redisStatus.isConnected ? 'connected' : 'disconnected',
        retryCount: redisStatus.retryCount
      }
    }
  });
});

// API Routes
app.use('/', routes);

// 404 Handler
app.use(notFound);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
