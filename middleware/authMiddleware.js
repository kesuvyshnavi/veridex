// server/backend/middleware/authMiddleware.js
const { verifyToken } = require('../services/authService');

// Reads the JWT from the httpOnly "veridex_token" cookie, verifies it, and
// attaches req.userId for downstream controllers. Responds 401 rather than
// letting an unauthenticated request fall through.
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.veridex_token;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  }
  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Your session has expired. Please log in again.' });
  }
}

module.exports = { requireAuth };