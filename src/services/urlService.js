const { customAlphabet } = require('nanoid');
const URLModel = require('../models/urlModel');
const redisManager = require('../utils/redisClient');
const { checkValidUrl } = require('../utils/axiosValidation');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const config = require('../config');

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 9);

const createShortUrl = async (longUrl, customCode = null, expiresAt = null) => {
  const isValidUrl = await checkValidUrl(longUrl);
  if (!isValidUrl.isValid) {
    throw new ValidationError('URL is not accessible or invalid');
  }

  // If a custom code is requested, skip the cache/existing-URL check — always create a new entry
  if (!customCode) {
    const cachedUrl = await redisManager.get(longUrl);
    if (cachedUrl) {
      return { data: cachedUrl, created: false };
    }

    const existingUrl = await URLModel.findOne({ longUrl });
    if (existingUrl) {
      const urlData = {
        urlCode: existingUrl.urlCode,
        shortUrl: existingUrl.shortUrl,
        longUrl: existingUrl.longUrl
      };
      await redisManager.set(longUrl, urlData);
      return { data: urlData, created: false };
    }
  } else {
    const taken = await URLModel.findOne({ urlCode: customCode.toLowerCase() });
    if (taken) {
      throw new ValidationError(`Custom code "${customCode}" is already taken`);
    }
  }

  const urlCode = customCode ? customCode.toLowerCase() : nanoid();
  const shortUrl = `${config.server.baseUrl}/${urlCode}`;

  const url = await URLModel.create({
    urlCode,
    longUrl,
    shortUrl,
    expiresAt: expiresAt ? new Date(expiresAt) : null
  });

  const urlData = {
    urlCode: url.urlCode,
    shortUrl: url.shortUrl,
    longUrl: url.longUrl,
    ...(url.expiresAt && { expiresAt: url.expiresAt })
  };

  await redisManager.set(longUrl, urlData);
  await redisManager.set(urlCode, { longUrl: url.longUrl, expiresAt: url.expiresAt });

  return { data: urlData, created: true };
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
