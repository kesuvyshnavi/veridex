// server/backend/services/emailService.js
// Minimal email sender for password-reset and email-verification links.
// Uses nodemailer with SMTP credentials from environment variables. If no
// SMTP credentials are configured, emails are logged to the console
// instead of silently failing — the feature still works end to end for
// testing, it just doesn't send a real email until SMTP is set up.

const nodemailer = require('nodemailer');
require('dotenv').config();

function isEmailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter = null;
function getTransporter() {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  const from = process.env.SMTP_FROM || 'Veridex <no-reply@veridex.app>';
  const t = getTransporter();

  if (!t) {
    console.log('📧 [emailService] SMTP not configured — logging email instead of sending:');
    console.log(`To: ${to}\nSubject: ${subject}\n${text || html}`);
    return { sent: false, logged: true };
  }

  await t.sendMail({ from, to, subject, html, text });
  return { sent: true, logged: false };
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