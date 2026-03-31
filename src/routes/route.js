const express = require('express');
const router = express.Router();

const { getUrl } = require('../controllers/urlController');
const { validateUrlCode } = require('../validators/urlValidator');
const v1Routes = require('./v1');

router.get('/', (req, res) => {
  res.status(200).json({
    status: true,
    message: 'Welcome to RedisLink - High-Performance URL Shortening Service',
    version: '2.0.0',
    endpoints: {
      shorten: 'POST /api/v1/url/shorten',
      bulk: 'POST /api/v1/url/bulk',
      stats: 'GET /api/v1/url/:urlCode/stats',
      redirect: 'GET /:urlCode',
      health: 'GET /health'
    }
  });
});

router.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

router.use('/api/v1', v1Routes);

router.get('/:urlCode', (req, res, next) => {
  const { urlCode } = req.params;

  const systemRoutes = ['favicon.ico', 'health', 'robots.txt', 'sitemap.xml', 'api'];
  if (systemRoutes.includes(urlCode)) {
    return next('route');
  }

  validateUrlCode(req, res, next);
}, getUrl);

module.exports = router;
