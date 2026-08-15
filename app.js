// server/backend/app.js
const express = require('express');
const path = require('path');
require('dotenv').config();

const projectRoutes = require('./routes/projectRoutes');
const riskRoutes = require('./routes/riskRoutes');

const app = express();

app.use(express.json());

// Serve static frontend (HTML, CSS, JS) from the "public" folder.
// index: false disables express.static's default behaviour of
// auto-serving public/index.html for the root "/" route — otherwise it
// would win over the custom "/" route below and home.html would never load.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// API routes
app.use('/api/projects', projectRoutes);
app.use('/api/risk-analysis', riskRoutes);

// Root route: serve home.html as the landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});