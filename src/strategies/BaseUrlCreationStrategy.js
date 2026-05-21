const URLModel = require('../models/urlModel');
const redisManager = require('../utils/redisClient');
const config = require('../config');

class BaseUrlCreationStrategy {
  buildShortUrl(urlCode) {
    return `${config.server.baseUrl}/${urlCode}`;
  }

  formatUrlData(url) {
    return {
      urlCode: url.urlCode,
      shortUrl: url.shortUrl,
      longUrl: url.longUrl,
      ...(url.expiresAt && { expiresAt: url.expiresAt })
    };
  }

  async createAndCacheUrl({ urlCode, longUrl, expiresAt }) {
    const url = await URLModel.create({
      urlCode,
      longUrl,
      shortUrl: this.buildShortUrl(urlCode),
      expiresAt: expiresAt ? new Date(expiresAt) : null
    });

    const urlData = this.formatUrlData(url);

    await redisManager.set(longUrl, urlData);
    await redisManager.set(urlCode, { longUrl: url.longUrl, expiresAt: url.expiresAt });

    return { data: urlData, created: true };
  }
}

module.exports = BaseUrlCreationStrategy;
