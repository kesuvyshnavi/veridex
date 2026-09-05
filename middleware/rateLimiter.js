// server/backend/middleware/rateLimiter.js
// Rate limiters for the endpoints most attractive to abuse: login (brute
// force), register (spam accounts), forgot-password (email-bombing an
// address), and project creation (each submission triggers a Groq API
// call, so this also protects cost/quota, not just abuse).

const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many reset requests. Please try again later.' },
});

const projectCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many projects submitted. Please try again later.' },
});

module.exports = { authLimiter, forgotPasswordLimiter, projectCreationLimiter };