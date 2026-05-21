const URLModel = require('../models/urlModel');
const { ValidationError } = require('../middleware/errorHandler');
const BaseUrlCreationStrategy = require('./BaseUrlCreationStrategy');

class CustomCodeStrategy extends BaseUrlCreationStrategy {
  async create({ longUrl, customCode, expiresAt }) {
    const urlCode = customCode.toLowerCase();
    const taken = await URLModel.findOne({ urlCode });

    if (taken) {
      throw new ValidationError(`Custom code "${customCode}" is already taken`);
    }

    return this.createAndCacheUrl({
      urlCode,
      longUrl,
      expiresAt
    });
  }
}

module.exports = CustomCodeStrategy;
