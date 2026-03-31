const { ValidationError } = require('../middleware/errorHandler');
const validUrl = require('valid-url');
const config = require('../config');

const urlValidationRules = {
  longUrl: {
    required: true,
    type: 'string',
    maxLength: config.url.maxLength,
    validate: (value) => {
      if (!validUrl.isWebUri(value)) {
        throw new ValidationError('Please provide a valid URL with http:// or https://');
      }

      const url = new URL(value);
      if (!config.url.protocols.includes(url.protocol)) {
        throw new ValidationError('URL must use HTTP or HTTPS protocol');
      }

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
  },
  customCode: {
    required: false,
    type: 'string',
    minLength: 3,
    maxLength: 20,
    validate: (value) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
        throw new ValidationError('customCode must contain only letters, numbers, hyphens, and underscores');
      }
      return true;
    }
  },
  expiresAt: {
    required: false,
    type: 'string',
    validate: (value) => {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new ValidationError('expiresAt must be a valid ISO date string');
      }
      if (date <= new Date()) {
        throw new ValidationError('expiresAt must be a future date');
      }
      return true;
    }
  }
};

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

const validate = (data, rules) => {
  const errors = [];

  for (const [field, rule] of Object.entries(rules)) {
    const value = data[field];

    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      continue;
    }

    if (!rule.required && (value === undefined || value === null || value === '')) {
      continue;
    }

    if (rule.type && typeof value !== rule.type) {
      errors.push(`${field} must be of type ${rule.type}`);
      continue;
    }

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

const validateBulkCreation = (req, res, next) => {
  try {
    const { urls } = req.body;
    if (!Array.isArray(urls)) {
      throw new ValidationError('urls must be an array');
    }
    if (urls.length === 0) {
      throw new ValidationError('urls array cannot be empty');
    }
    if (urls.length > 10) {
      throw new ValidationError('Maximum 10 URLs per bulk request');
    }
    urls.forEach((item, index) => {
      if (!item || !item.longUrl) {
        throw new ValidationError(`urls[${index}].longUrl is required`);
      }
      validate(
        { longUrl: item.longUrl, customCode: item.customCode, expiresAt: item.expiresAt },
        urlValidationRules
      );
    });
    next();
  } catch (error) {
    next(error);
  }
};

const sanitizeInput = (req, res, next) => {
  if (req.body) {
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value === 'string') {
        req.body[key] = value.trim();
        
        req.body[key] = req.body[key]
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;');
      }
    }
  }

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
  validateBulkCreation,
  sanitizeInput,
  validate,
  urlValidationRules,
  urlCodeValidationRules
};