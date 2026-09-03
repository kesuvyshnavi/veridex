// server/backend/controllers/authController.js
const pool = require('../db/database');
const { hashPassword, comparePassword, signToken } = require('../services/authService');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, matches JWT expiry
};

function validateCredentials(email, password) {
  const errors = [];
  if (!email || !EMAIL_RE.test(email)) errors.push('Please enter a valid email address.');
  if (!password || password.length < 8) errors.push('Password must be at least 8 characters long.');
  return errors;
}

async function register(req, res) {
  try {
    const { email, password } = req.body;
    const errors = validateCredentials(email, password);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, errors: ['An account with this email already exists.'] });
    }

    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email.toLowerCase(), passwordHash]
    );
    const user = result.rows[0];

    const token = signToken(user.id);
    res.cookie('veridex_token', token, COOKIE_OPTIONS);

    return res.status(201).json({ success: true, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('Error in register:', err.message);
    return res.status(500).json({ success: false, message: 'Something went wrong while creating your account.' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, errors: ['Email and password are required.'] });
    }

    const result = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [
      email.toLowerCase(),
    ]);
    const user = result.rows[0];

    // Same generic message whether the email doesn't exist or the password
    // is wrong — avoids confirming to an attacker which emails are registered.
    if (!user || !(await comparePassword(password, user.password_hash))) {
      return res.status(401).json({ success: false, errors: ['Invalid email or password.'] });
    }

    const token = signToken(user.id);
    res.cookie('veridex_token', token, COOKIE_OPTIONS);

    return res.status(200).json({ success: true, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('Error in login:', err.message);
    return res.status(500).json({ success: false, message: 'Something went wrong while logging in.' });
  }
}

function logout(req, res) {
  res.clearCookie('veridex_token', { ...COOKIE_OPTIONS, maxAge: undefined });
  return res.status(200).json({ success: true });
}

async function me(req, res) {
  try {
    const result = await pool.query('SELECT id, email FROM users WHERE id = $1', [req.userId]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }
    return res.status(200).json({ success: true, user });
  } catch (err) {
    console.error('Error in me:', err.message);
    return res.status(500).json({ success: false, message: 'Something went wrong.' });
  }
}

module.exports = { register, login, logout, me };