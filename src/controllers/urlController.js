/**
 * URL Controller
 * Refactored with proper error handling and service separation
 */

const URLModel = require('../models/urlModel');
const shortId = require('shortid');
const redisManager = require('../utils/redisClient');
const { checkValidUrl } = require('../utils/axiosValidation');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const config = require('../config');

const createUrl = asyncHandler(async (req, res) => {
  const { longUrl } = req.body;

  // Additional URL validation (beyond middleware)
  const isValidUrl = await checkValidUrl(longUrl);
  if (!isValidUrl.isValid) {
    throw new ValidationError('URL is not accessible or invalid');
  }

  // Check cache first
  const cachedUrl = await redisManager.get(longUrl);
  if (cachedUrl) {
    return res.status(200).json({
      status: true,
      message: 'URL retrieved from cache',
      data: cachedUrl
    });
  }

  // Check database for existing URL
  let url = await URLModel.findOne({ longUrl });
  
  if (url) {
    // Cache the existing URL
    await redisManager.set(longUrl, {
      urlCode: url.urlCode,
      shortUrl: url.shortUrl,
      longUrl: url.longUrl
    });

    return res.status(200).json({
      status: true,
      message: 'Short URL already exists',
      data: {
        urlCode: url.urlCode,
        shortUrl: url.shortUrl,
        longUrl: url.longUrl
      }
    });
  }

  // Generate new short URL
  const urlCode = shortId.generate();
  const shortUrl = `${config.server.baseUrl}/${urlCode}`;

  // Create new URL entry
  url = await URLModel.create({
    urlCode,
    longUrl,
    shortUrl
  });

  // Cache the new URL
  await redisManager.set(longUrl, {
    urlCode: url.urlCode,
    shortUrl: url.shortUrl,
    longUrl: url.longUrl
  });

  // Also cache by urlCode for faster retrieval
  await redisManager.set(urlCode, {
    longUrl: url.longUrl
  });

  res.status(201).json({
    status: true,
    message: 'Short URL created successfully',
    data: {
      urlCode: url.urlCode,
      shortUrl: url.shortUrl,
      longUrl: url.longUrl
    }
  });
});

const getUrl = asyncHandler(async (req, res) => {
  const { urlCode } = req.params;

  // Check cache first
  const cachedUrl = await redisManager.get(urlCode);
  if (cachedUrl && cachedUrl.longUrl) {
    return res.status(302).redirect(cachedUrl.longUrl);
  }

  // Check database
  const url = await URLModel.findOne({ urlCode });
  if (!url) {
    throw new NotFoundError('Short URL not found');
  }

  // Cache the URL for future requests
  await redisManager.set(urlCode, {
    longUrl: url.longUrl
  });

  res.status(302).redirect(url.longUrl);
});

module.exports = {
    createUrl,
    getUrl
}