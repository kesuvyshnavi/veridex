// server/backend/public/js/verify-email.js
const statusTitle = document.getElementById('statusTitle');
const statusText = document.getElementById('statusText');
const continueBtn = document.getElementById('continueBtn');

function getTokenFromUrl() {
  return new URLSearchParams(window.location.search).get('token');
}

async function run() {
  const token = getTokenFromUrl();
  if (!token) {
    statusTitle.textContent = 'Missing verification token';
    statusText.textContent = 'This link is incomplete. Please use the link from your email exactly as sent.';
    return;
  }

  try {
    const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
      credentials: 'same-origin',
    });
    const result = await res.json();

    if (!res.ok || !result.success) {
      statusTitle.textContent = 'Verification failed';
      statusText.textContent = result.message || 'This link is invalid or has expired.';
      return;
    }

    statusTitle.textContent = 'Email verified!';
    statusText.textContent = 'Your email has been confirmed.';
    continueBtn.style.display = 'inline-block';
  } catch (err) {
    statusTitle.textContent = 'Something went wrong';
    statusText.textContent = 'Unable to reach the server. Please try again.';
  }
}

run();