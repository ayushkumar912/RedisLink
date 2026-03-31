const express = require('express');
const router = express.Router();

const { createUrl, getStats, bulkCreate } = require('../controllers/urlController');
const { validateUrlCreation, validateBulkCreation, validateUrlCode } = require('../validators/urlValidator');
const { shortenLimiter } = require('../middleware/rateLimiter');

router.post('/url/shorten', shortenLimiter, validateUrlCreation, createUrl);
router.post('/url/bulk', shortenLimiter, validateBulkCreation, bulkCreate);
router.get('/url/:urlCode/stats', validateUrlCode, getStats);

module.exports = router;
