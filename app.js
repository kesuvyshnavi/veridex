// server/backend/app.js
const express = require('express');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const projectRoutes = require('./routes/projectRoutes');
const riskRoutes = require('./routes/riskRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(express.json());
app.use(cookieParser());

app.use(
  express.static(path.join(__dirname, 'public'), {
    index: false,
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
      }
    },
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/risk-analysis', riskRoutes);
app.use('/api/recommendations', recommendationRoutes);

app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Simple health check — useful for uptime monitors and for the test suite.
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, status: 'ok' });
});

// Centralized error handler — catches anything thrown/rejected in a route
// that wasn't already caught locally, logs it with a stack trace, and
// always responds with JSON instead of leaking an HTML stack trace page.
app.use((err, req, res, next) => {
  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err.stack || err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ success: false, message: 'Something went wrong on our end. Please try again.' });
});

const PORT = process.env.PORT || 5000;

// Only start listening when run directly (npm start / node app.js) — not
// when require()'d by a test file, so the test suite can drive the app
// with supertest without binding a real port.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;