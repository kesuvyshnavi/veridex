// server/backend/public/js/reset-password.js
const form = document.getElementById('resetForm');
const submitBtn = document.getElementById('submitBtn');
const formErrorBox = document.getElementById('formErrorBox');
const formSuccessBox = document.getElementById('formSuccessBox');

function getTokenFromUrl() {
  return new URLSearchParams(window.location.search).get('token');
}

const token = getTokenFromUrl();
if (!token) {
  formErrorBox.textContent = 'This reset link is missing its token. Please request a new one.';
  formErrorBox.classList.remove('hidden');
  submitBtn.disabled = true;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formErrorBox.classList.add('hidden');
  formSuccessBox.classList.add('hidden');
  document.getElementById('err_password').textContent = '';
  document.getElementById('err_confirmPassword').textContent = '';

  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  let hasError = false;
  if (!password || password.length < 8) {
    document.getElementById('err_password').textContent = 'Password must be at least 8 characters.';
    hasError = true;
  }
  if (password !== confirmPassword) {
    document.getElementById('err_confirmPassword').textContent = 'Passwords do not match.';
    hasError = true;
  }
  if (hasError) return;

  submitBtn.disabled = true;
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const result = await res.json();

    if (!res.ok || !result.success) {
      formErrorBox.textContent = (result.errors && result.errors.join(' ')) || result.message || 'This link is invalid or has expired.';
      formErrorBox.classList.remove('hidden');
      return;
    }

    formSuccessBox.textContent = 'Password updated. You can now log in with your new password.';
    formSuccessBox.classList.remove('hidden');
    form.reset();
    form.classList.add('hidden');
    setTimeout(() => { window.location.href = 'login.html'; }, 2000);
  } catch (err) {
    formErrorBox.textContent = 'Unable to reach the server. Please check your connection and try again.';
    formErrorBox.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
  }
});