const URLModel = require('../models/urlModel');
const redisManager = require('../utils/redisClient');
const { checkValidUrl } = require('../utils/axiosValidation');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { getUrlCreationStrategy } = require('../factories/urlCreationStrategyFactory');

const createShortUrl = async (longUrl, customCode = null, expiresAt = null) => {
  const isValidUrl = await checkValidUrl(longUrl);
  if (!isValidUrl.isValid) {
    throw new ValidationError('URL is not accessible or invalid');
  }

  const strategy = getUrlCreationStrategy({ customCode });
  return strategy.create({ longUrl, customCode, expiresAt });
};

const getLongUrl = async (urlCode) => {
  const cachedUrl = await redisManager.get(urlCode);
  if (cachedUrl && cachedUrl.longUrl) {
    if (cachedUrl.expiresAt && new Date(cachedUrl.expiresAt) < new Date()) {
      await redisManager.del(urlCode);
      throw new NotFoundError('This short URL has expired');
    }
    return cachedUrl.longUrl;
  }

  const url = await URLModel.findOne({ urlCode });
  if (!url) {
    throw new NotFoundError('Short URL not found');
  }

  if (url.expiresAt && url.expiresAt < new Date()) {
    throw new NotFoundError('This short URL has expired');
  }

  await redisManager.set(urlCode, { longUrl: url.longUrl, expiresAt: url.expiresAt });
  return url.longUrl;
};

const incrementClicks = async (urlCode) => {
  try {
    await URLModel.updateOne({ urlCode }, { $inc: { clicks: 1 } });
  } catch (error) {
    console.error('Failed to increment clicks:', error.message);
  }
};

const getUrlStats = async (urlCode) => {
  const url = await URLModel.findOne({ urlCode });
  if (!url) {
    throw new NotFoundError('Short URL not found');
  }

  return {
    urlCode: url.urlCode,
    shortUrl: url.shortUrl,
    longUrl: url.longUrl,
    clicks: url.clicks,
    createdAt: url.createdAt,
    expiresAt: url.expiresAt
  };
};

const bulkCreateUrls = async (urls) => {
  const results = await Promise.allSettled(
    urls.map(({ longUrl, customCode, expiresAt }) =>
      createShortUrl(longUrl, customCode || null, expiresAt || null)
    )
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return {
        success: true,
        longUrl: urls[index].longUrl,
        data: result.value.data
      };
    }
    return {
      success: false,
      longUrl: urls[index].longUrl,
      error: result.reason.message
    };
  });
};

module.exports = {
  createShortUrl,
  getLongUrl,
  incrementClicks,
  getUrlStats,
  bulkCreateUrls
};
