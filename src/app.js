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

app.set('trust proxy', 1);
if (config.server.env === 'production') {
  app.use(helmet());
}

app.use(cors({
  origin: config.server.env === 'development' ? '*' : false,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(sanitizeInput);

if (config.server.env === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

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

app.use('/', routes);

app.use(notFound);

app.use(errorHandler);

module.exports = app;
