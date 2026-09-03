// server/backend/services/authService.js
// Password hashing + JWT issuing/verification for Milestone 4 auth.
// Stateless JWT-in-httpOnly-cookie approach: no session store needed, so
// auth survives Render's free-tier restarts without extra infrastructure.

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
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

module.exports = { hashPassword, comparePassword, signToken, verifyToken };