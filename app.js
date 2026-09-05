// server/backend/app.js
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const projectRoutes = require('./routes/projectRoutes');
const riskRoutes = require('./routes/riskRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

app.use(express.json());
app.use(cookieParser());

// Serve static frontend (HTML, CSS, JS) from the "public" folder.
//
// Cache-Control: no-cache forces the browser to revalidate with the server
// on every load instead of trusting its own disk cache blindly. Without
// this, browsers apply heuristic caching to CSS/JS/HTML that have no
// explicit cache header, which was causing stale (old) versions of the
// UI to render first, then get swapped for the current version a moment
// later once a background revalidation happened. Express still sends an
// ETag automatically, so an unchanged file gets a fast 304 response
// instead of being re-downloaded — this fixes the flash without making
// pages noticeably slower.
app.use(
  express.static(path.join(__dirname, 'public'), {
    index: false,
    etag: true,
    lastModified: true,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/risk-analysis', riskRoutes);
app.use('/api/recommendations', recommendationRoutes);

// Root route: serve home.html as the landing page
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});