// server/backend/controllers/authController.js
const pool = require('../db/database');
const {
  hashPassword,
  comparePassword,
  signToken,
  generateRawToken,
  hashToken,
} = require('../services/authService');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../services/emailService');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5000';

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
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, email_verified',
      [email.toLowerCase(), passwordHash]
    );
    const user = result.rows[0];

    const token = signToken(user.id);
    res.cookie('veridex_token', token, COOKIE_OPTIONS);

    // Fire off a verification email. Failure here never blocks account
    // creation — the user can request a fresh link via resendVerification.
    try {
      const rawToken = generateRawToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await pool.query(
        'INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user.id, tokenHash, expiresAt]
      );
      const verifyUrl = `${APP_BASE_URL}/verify-email.html?token=${rawToken}`;
      await sendVerificationEmail(user.email, verifyUrl);
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr.message);
    }

    return res.status(201).json({
      success: true,
      user: { id: user.id, email: user.email, emailVerified: user.email_verified },
    });
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

    const result = await pool.query(
      'SELECT id, email, password_hash, email_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = result.rows[0];

    if (!user || !(await comparePassword(password, user.password_hash))) {
      return res.status(401).json({ success: false, errors: ['Invalid email or password.'] });
    }

    const token = signToken(user.id);
    res.cookie('veridex_token', token, COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      user: { id: user.id, email: user.email, emailVerified: user.email_verified },
    });
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
    const result = await pool.query('SELECT id, email, email_verified FROM users WHERE id = $1', [req.userId]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }
    return res.status(200).json({
      success: true,
      user: { id: user.id, email: user.email, emailVerified: user.email_verified },
    });
  } catch (err) {
    console.error('Error in me:', err.message);
    return res.status(500).json({ success: false, message: 'Something went wrong.' });
  }
}

// POST /api/auth/forgot-password — always responds with the same generic
// message regardless of whether the email exists, so this endpoint can't
// be used to enumerate registered accounts.
async function forgotPassword(req, res) {
  const generic = {
    success: true,
    message: 'If an account exists for that email, a reset link has been sent.',
  };
  try {
    const { email } = req.body;
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(200).json(generic);
    }

    const result = await pool.query('SELECT id, email FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user) {
      return res.status(200).json(generic);
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    const resetUrl = `${APP_BASE_URL}/reset-password.html?token=${rawToken}`;
    await sendPasswordResetEmail(user.email, resetUrl);

    return res.status(200).json(generic);
  } catch (err) {
    console.error('Error in forgotPassword:', err.message);
    return res.status(200).json(generic);
  }
}

// POST /api/auth/reset-password
async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;
    if (!token || !password || password.length < 8) {
      return res.status(400).json({
        success: false,
        errors: ['A valid token and a password of at least 8 characters are required.'],
      });
    }

    const tokenHash = hashToken(token);
    const result = await pool.query(
      `SELECT id, user_id FROM password_resets
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );
    const record = result.rows[0];
    if (!record) {
      return res.status(400).json({ success: false, errors: ['This reset link is invalid or has expired.'] });
    }

    const passwordHash = await hashPassword(password);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, record.user_id]);
    await pool.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [record.id]);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error in resetPassword:', err.message);
    return res.status(500).json({ success: false, message: 'Something went wrong while resetting your password.' });
  }
}

// GET /api/auth/verify-email?token=...
async function verifyEmail(req, res) {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Missing verification token.' });
    }

    const tokenHash = hashToken(token);
    const result = await pool.query(
      `SELECT id, user_id FROM email_verifications
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );
    const record = result.rows[0];
    if (!record) {
      return res.status(400).json({ success: false, message: 'This verification link is invalid or has expired.' });
    }

    await pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [record.user_id]);
    await pool.query('UPDATE email_verifications SET used_at = NOW() WHERE id = $1', [record.id]);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error in verifyEmail:', err.message);
    return res.status(500).json({ success: false, message: 'Something went wrong while verifying your email.' });
  }
}

// POST /api/auth/resend-verification — requires login, so it can't be used
// to spam arbitrary email addresses.
async function resendVerification(req, res) {
  try {
    const result = await pool.query('SELECT id, email, email_verified FROM users WHERE id = $1', [req.userId]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }
    if (user.email_verified) {
      return res.status(200).json({ success: true, message: 'Your email is already verified.' });
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    const verifyUrl = `${APP_BASE_URL}/verify-email.html?token=${rawToken}`;
    await sendVerificationEmail(user.email, verifyUrl);

    return res.status(200).json({ success: true, message: 'Verification email sent.' });
  } catch (err) {
    console.error('Error in resendVerification:', err.message);
    return res.status(500).json({ success: false, message: 'Something went wrong while sending the email.' });
  }
}

module.exports = {
  register,
  login,
  logout,
  me,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
};