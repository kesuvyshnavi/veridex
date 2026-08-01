// server/db/database.js
// PostgreSQL connection pool setup using the 'pg' package

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
  rejectUnauthorized: false,
},
});

// Quick sanity check when the server starts
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Failed to connect to PostgreSQL:', err.message);
    return;
  }
  console.log('✅ Connected to PostgreSQL database');
  release();
});

module.exports = pool;