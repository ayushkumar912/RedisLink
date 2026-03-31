const { asyncHandler } = require('../middleware/errorHandler');
const { createShortUrl, getLongUrl, incrementClicks, getUrlStats, bulkCreateUrls } = require('../services/urlService');

const createUrl = asyncHandler(async (req, res) => {
  const { longUrl, customCode, expiresAt } = req.body;
  const { data, created } = await createShortUrl(longUrl, customCode, expiresAt);

  res.status(created ? 201 : 200).json({
    status: true,
    message: created ? 'Short URL created successfully' : 'Short URL already exists',
    data
  });
});

const getUrl = asyncHandler(async (req, res) => {
  const { urlCode } = req.params;
  const longUrl = await getLongUrl(urlCode);
  incrementClicks(urlCode); // fire and forget
  res.status(302).redirect(longUrl);
});

const getStats = asyncHandler(async (req, res) => {
  const { urlCode } = req.params;
  const stats = await getUrlStats(urlCode);
  res.status(200).json({ status: true, data: stats });
});

const bulkCreate = asyncHandler(async (req, res) => {
  const { urls } = req.body;
  const results = await bulkCreateUrls(urls);
  res.status(207).json({
    status: true,
    message: `Processed ${urls.length} URL(s)`,
    data: results
  });
});

module.exports = { createUrl, getUrl, getStats, bulkCreate };
