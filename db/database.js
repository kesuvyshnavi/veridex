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
  // Pool tuning: caps concurrent connections against Supabase's limit,
  // recycles idle connections instead of holding them open indefinitely,
  // and fails fast on a dead/unreachable DB instead of hanging the request.
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
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