/**
 * Validation Schemas and Middleware
 * Input validation for RedisLink API endpoints
 */

const { ValidationError } = require('../middleware/errorHandler');
const validUrl = require('valid-url');
const config = require('../config');

// URL validation schema
const urlValidationRules = {
  longUrl: {
    required: true,
    type: 'string',
    maxLength: config.url.maxLength,
    validate: (value) => {
      // Check if it's a valid web URI
      if (!validUrl.isWebUri(value)) {
        throw new ValidationError('Please provide a valid URL with http:// or https://');
      }

      // Check protocol
      const url = new URL(value);
      if (!config.url.protocols.includes(url.protocol)) {
        throw new ValidationError('URL must use HTTP or HTTPS protocol');
      }

      // Check for malicious patterns
      const maliciousPatterns = [
        /javascript:/i,
        /data:/i,
        /vbscript:/i,
        /<script/i,
        /on\w+=/i
      ];

      if (maliciousPatterns.some(pattern => pattern.test(value))) {
        throw new ValidationError('URL contains potentially malicious content');
      }

      return true;
    }
  }
};

// URL code validation schema
const urlCodeValidationRules = {
  urlCode: {
    required: true,
    type: 'string',
    minLength: 1,
    maxLength: 20,
    pattern: /^[a-zA-Z0-9_-]+$/,
    validate: (value) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
        throw new ValidationError('URL code contains invalid characters');
      }
      return true;
    }
  }
};

// Generic validator function
const validate = (data, rules) => {
  const errors = [];

  for (const [field, rule] of Object.entries(rules)) {
    const value = data[field];

    // Required field check
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      continue;
    }

    // Skip further validation if field is not required and not provided
    if (!rule.required && (value === undefined || value === null || value === '')) {
      continue;
    }

    // Type validation
    if (rule.type && typeof value !== rule.type) {
      errors.push(`${field} must be of type ${rule.type}`);
      continue;
    }

    // String validations
    if (rule.type === 'string') {
      if (rule.minLength && value.length < rule.minLength) {
        errors.push(`${field} must be at least ${rule.minLength} characters long`);
      }

      if (rule.maxLength && value.length > rule.maxLength) {
        errors.push(`${field} must be no more than ${rule.maxLength} characters long`);
      }

      if (rule.pattern && !rule.pattern.test(value)) {
        errors.push(`${field} format is invalid`);
      }
    }

    // Custom validation
    if (rule.validate) {
      try {
        rule.validate(value);
      } catch (error) {
        errors.push(error.message);
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors.join(', '));
  }

  return true;
};

// Middleware factories
const validateUrlCreation = (req, res, next) => {
  try {
    validate(req.body, urlValidationRules);
    next();
  } catch (error) {
    next(error);
  }
};

const validateUrlCode = (req, res, next) => {
  try {
    validate(req.params, urlCodeValidationRules);
    next();
  } catch (error) {
    next(error);
  }
};

// Request sanitization
const sanitizeInput = (req, res, next) => {
  // Sanitize request body
  if (req.body) {
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value === 'string') {
        // Trim whitespace
        req.body[key] = value.trim();
        
        // Basic XSS prevention
        req.body[key] = req.body[key]
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;');
      }
    }
  }

  // Sanitize URL parameters
  if (req.params) {
    for (const [key, value] of Object.entries(req.params)) {
      if (typeof value === 'string') {
        req.params[key] = value.trim();
      }
    }
  }

  next();
};

module.exports = {
  validateUrlCreation,
  validateUrlCode,
  sanitizeInput,
  validate,
  urlValidationRules,
  urlCodeValidationRules
};