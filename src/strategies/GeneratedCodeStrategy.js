const nanoidPackage = require('nanoid');
const crypto = require('crypto');
const URLModel = require('../models/urlModel');
const redisManager = require('../utils/redisClient');
const BaseUrlCreationStrategy = require('./BaseUrlCreationStrategy');

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const nanoid = nanoidPackage.customAlphabet
  ? nanoidPackage.customAlphabet(alphabet, 9)
  : () => Array.from(crypto.randomBytes(9), byte => alphabet[byte % alphabet.length]).join('');

class GeneratedCodeStrategy extends BaseUrlCreationStrategy {
  async create({ longUrl, expiresAt }) {
    const cachedUrl = await redisManager.get(longUrl);
    if (cachedUrl) {
      return { data: cachedUrl, created: false };
    }

    const existingUrl = await URLModel.findOne({ longUrl });
    if (existingUrl) {
      const urlData = this.formatUrlData(existingUrl);
      await redisManager.set(longUrl, urlData);
      return { data: urlData, created: false };
    }

    return this.createAndCacheUrl({
      urlCode: nanoid().toLowerCase(),
      longUrl,
      expiresAt
    });
  }
}

module.exports = GeneratedCodeStrategy;
