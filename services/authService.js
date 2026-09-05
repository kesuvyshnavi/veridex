// server/backend/services/authService.js
// Password hashing + JWT issuing/verification, plus helpers for
// generating and hashing single-use tokens used by password reset and
// email verification (hashed at rest — a DB leak alone doesn't hand out
// a working reset/verify link).

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = '7d';

function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

function comparePassword(plainPassword, hash) {
  return bcrypt.compare(plainPassword, hash);
}

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET); // throws if invalid/expired
}

function generateRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

module.exports = {
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
  generateRawToken,
  hashToken,
};