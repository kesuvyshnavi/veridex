// server/backend/app.js
const express = require('express');
const path = require('path');
require('dotenv').config();

const projectRoutes = require('./routes/projectRoutes');
const riskRoutes = require('./routes/riskRoutes');

const app = express();

app.use(express.json());

// Serve static frontend (HTML, CSS, JS) from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/projects', projectRoutes);
app.use('/api/risk-analysis', riskRoutes);

// Fallback: serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});