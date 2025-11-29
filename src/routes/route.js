const express = require('express');
const router = express.Router();

const { createUrl, getUrl } = require('../controllers/urlController');
const { validateUrlCreation, validateUrlCode } = require('../validators/urlValidator');

router.get('/', (req, res) => {
  res.status(200).json({
    status: true,
    message: 'Welcome to RedisLink - High-Performance URL Shortening Service',
    version: '1.0.0',
    endpoints: {
      shorten: 'POST /url/shorten',
      redirect: 'GET /:urlCode',
      health: 'GET /health'
    }
  });
});

router.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

router.post('/url/shorten', validateUrlCreation, createUrl);

router.get('/:urlCode', (req, res, next) => {
  const { urlCode } = req.params;
  
  const systemRoutes = ['favicon.ico', 'health', 'robots.txt', 'sitemap.xml'];
  if (systemRoutes.includes(urlCode)) {
    return next('route');
  }
  
  validateUrlCode(req, res, next);
}, getUrl);

module.exports = router;