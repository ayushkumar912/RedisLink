const redisManager = require('../utils/redisClient');

const createRateLimiter = ({ windowMs, max, keyPrefix }) => {
  return async (req, res, next) => {
    if (!redisManager.isConnected) {
      return next();
    }

    const ip = req.ip || req.connection.remoteAddress;
    const key = `ratelimit:${keyPrefix}:${ip}`;
    const windowSecs = Math.floor(windowMs / 1000);

    try {
      const count = await redisManager.incr(key);
      if (count === 1) {
        await redisManager.expire(key, windowSecs);
      }

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));

      if (count > max) {
        return res.status(429).json({
          status: false,
          message: 'Too many requests, please try again later'
        });
      }

      next();
    } catch (error) {
      console.error('Rate limiter error:', error.message);
      next();
    }
  };
};

const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyPrefix: 'general'
});

const shortenLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyPrefix: 'shorten'
});

module.exports = { generalLimiter, shortenLimiter };
