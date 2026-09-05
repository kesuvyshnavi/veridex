// server/backend/services/emailService.js
// Sends password-reset and email-verification links via Brevo's
// transactional email HTTP API (https://api.brevo.com) instead of raw
// SMTP. Render's free tier blocks outbound traffic on SMTP ports
// (25/465/587), which is why nodemailer worked locally but hung/failed
// in production. HTTPS (port 443) isn't blocked, so an HTTP-based email
// API sidesteps the restriction entirely. Uses axios, which is already a
// project dependency — no new package needed.

const axios = require('axios');
require('dotenv').config();

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

function isEmailConfigured() {
  return !!(process.env.BREVO_API_KEY && process.env.SMTP_FROM);
}

// Parses "Veridex <no-reply@veridex.app>" into { name, email }; falls back
// to a bare address if no display name is present.
function parseFromAddress(raw) {
  const match = String(raw || '').match(/^(.*)<(.+)>$/);
  if (match) {
    return { name: match[1].trim() || 'Veridex', email: match[2].trim() };
  }
  return { name: 'Veridex', email: raw };
}

async function sendEmail({ to, subject, html, text }) {
  if (!isEmailConfigured()) {
    console.log('📧 [emailService] Brevo not configured — logging email instead of sending:');
    console.log(`To: ${to}\nSubject: ${subject}\n${text || html}`);
    return { sent: false, logged: true };
  }

  const sender = parseFromAddress(process.env.SMTP_FROM);

  try {
    await axios.post(
      BREVO_API_URL,
      {
        sender,
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 10000,
      }
    );
    return { sent: true, logged: false };
  } catch (err) {
    const details = err.response?.data || err.message;
    console.error('Brevo send failed:', details);
    throw new Error('Failed to send email');
  }
}

function sendPasswordResetEmail(to, resetUrl) {
  return sendEmail({
    to,
    subject: 'Reset your Veridex password',
    text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
    html: `<p>Click below to reset your Veridex password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
  });
}

function sendVerificationEmail(to, verifyUrl) {
  return sendEmail({
    to,
    subject: 'Verify your Veridex email',
    text: `Verify your email: ${verifyUrl}\n\nThis link expires in 24 hours.`,
    html: `<p>Click below to verify your Veridex email address:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
  });
}

module.exports = { sendPasswordResetEmail, sendVerificationEmail, isEmailConfigured };