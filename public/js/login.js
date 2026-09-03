// server/backend/public/js/login.js
const form = document.getElementById('loginForm');
const submitBtn = document.getElementById('submitBtn');
const formErrorBox = document.getElementById('formErrorBox');

function showError(message) {
  formErrorBox.textContent = message;
  formErrorBox.classList.remove('hidden');
}

function clearErrors() {
  document.querySelectorAll('.error-msg').forEach((el) => (el.textContent = ''));
  formErrorBox.classList.add('hidden');
  formErrorBox.textContent = '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email) document.getElementById('err_email').textContent = 'Email is required.';
  if (!password) document.getElementById('err_password').textContent = 'Password is required.';
  if (!email || !password) return;

  submitBtn.disabled = true;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email, password }),
    });
    const result = await res.json();

    if (!res.ok || !result.success) {
      showError((result.errors && result.errors.join(' ')) || result.message || 'Login failed.');
      return;
    }

    window.location.href = 'index.html';
  } catch (err) {
    showError('Unable to reach the server. Please check your connection and try again.');
  } finally {
    submitBtn.disabled = false;
  }
});