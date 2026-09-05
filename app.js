// server/backend/app.js
const express = require('express');
const compression = require('compression');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const projectRoutes = require('./routes/projectRoutes');
const riskRoutes = require('./routes/riskRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

// Gzip/brotli-negotiated compression for every response (JSON analysis
// payloads, HTML, CSS, JS). Runs before routes so it covers both static
// files and API responses.
app.use(compression());

app.use(express.json());
app.use(cookieParser());

// Serve static frontend (HTML, CSS, JS) from the "public" folder.
//
// Cache policy is split by file type:
// - HTML: Cache-Control: no-cache — always revalidate with the server so
//   deploys show up immediately (this is what fixed the earlier
//   stale-UI-flash bug).
// - CSS/JS/images: cached for 1 day with must-revalidate — repeat page
//   navigations within a session skip re-downloading unchanged assets,
//   while a real change is picked up automatically without needing
//   manual cache busting or filename hashing.
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