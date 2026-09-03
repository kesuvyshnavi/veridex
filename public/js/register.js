// server/backend/public/js/register.js
const form = document.getElementById('registerForm');
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
  const confirmPassword = document.getElementById('confirmPassword').value;

  let hasError = false;
  if (!email) {
    document.getElementById('err_email').textContent = 'Email is required.';
    hasError = true;
  }
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
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email, password }),
    });
    const result = await res.json();

    if (!res.ok || !result.success) {
      showError((result.errors && result.errors.join(' ')) || result.message || 'Registration failed.');
      return;
    }

    window.location.href = 'index.html';
  } catch (err) {
    showError('Unable to reach the server. Please check your connection and try again.');
  } finally {
    submitBtn.disabled = false;
  }
});