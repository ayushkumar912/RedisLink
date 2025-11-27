/**
 * Error Handling Middleware
 * Centralized error handling for the RedisLink application
 */

const config = require('../config');

// Custom Error Classes
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

class DatabaseError extends AppError {
  constructor(message) {
    super(message, 500, false);
    this.name = 'DatabaseError';
  }
}

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error('Error:', err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Invalid URL code format';
    error = new ValidationError(message);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'URL already exists';
    error = new ValidationError(message);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError' && err.errors) {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = new ValidationError(message);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new ValidationError(message);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new ValidationError(message);
  }

  // Send error response
  res.status(error.statusCode || 500).json({
    status: false,
    message: error.message || 'Internal server error',
    ...(config.server.env === 'development' && { 
      stack: err.stack,
      error: err 
    })
  });
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 404 handler
const notFound = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  DatabaseError,
  errorHandler,
  asyncHandler,
  notFound
};