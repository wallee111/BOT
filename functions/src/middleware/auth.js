const crypto = require('crypto');

function validateApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  const expected = process.env.API_KEY;
  if (!key || !expected || key.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected))) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

module.exports = { validateApiKey };
