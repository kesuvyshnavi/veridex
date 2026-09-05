// server/backend/services/httpRetry.js
// Shared retry wrapper for Groq calls. Previously a single transient
// network blip (timeout, brief rate limit, DNS hiccup) would immediately
// drop straight to the deterministic fallback, even though a fast retry
// often would have succeeded. This gives every Groq caller one retry with
// a short backoff before giving up — similar total worst-case wait as
// before, but a real chance to get a live AI result instead of a fallback.

const axios = require('axios');

async function postJsonWithRetry(url, data, headers, { timeout = 15000, retries = 1, backoffMs = 800 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios.post(url, data, { headers, timeout });
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }
  throw lastError;
}

module.exports = { postJsonWithRetry };