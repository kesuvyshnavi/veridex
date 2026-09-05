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
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Quick sanity check when the server starts — skipped during automated
// tests (Jest sets NODE_ENV=test automatically). Test suites shouldn't
// depend on a live network connection to Supabase to run quickly and
// deterministically; routes/controllers that actually need the DB are
// exercised with their own test setup as the suite grows.
if (process.env.NODE_ENV !== 'test') {
  pool.connect((err, client, release) => {
    if (err) {
      console.error('❌ Failed to connect to PostgreSQL:', err.message);
      return;
    }
    console.log('✅ Connected to PostgreSQL database');
    release();
  });
}

module.exports = pool;