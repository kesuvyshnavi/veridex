// server/backend/public/js/auth-common.js
// Loaded on every page. Checks login state via GET /api/auth/me and
// updates the navbar's .navbar-right accordingly (Log in/Sign up links
// vs. Dashboard + avatar + Log out). Also gates pages marked
// data-require-auth="true" by redirecting to login.html if not logged in.

(function () {
  async function fetchCurrentUser() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!res.ok) return null;
      const data = await res.json();
      return data.success ? data.user : null;
    } catch (err) {
      return null;
    }
  }

  function renderLoggedOut(navbarRight) {
    navbarRight.innerHTML = `
      <a href="login.html" class="nav-item">Log in</a>
      <a href="register.html" class="submit-btn" style="width:auto;padding:9px 20px;font-size:14px;">Sign up</a>
    `;
  }

  function renderLoggedIn(navbarRight, user) {
    const initial = (user.email || '?').charAt(0).toUpperCase();
    navbarRight.innerHTML = `
      <a href="dashboard.html" class="nav-item">Dashboard</a>
      <button type="button" id="logoutBtn" class="nav-item" style="background:none;border:none;cursor:pointer;font:inherit;">Log out</button>
      <div class="profile-avatar" title="${user.email}">${initial}</div>
    `;
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
        window.location.href = 'home.html';
      });
    }
  }

  async function init() {
    const navbarRight = document.querySelector('.navbar-right');
    const user = await fetchCurrentUser();

    if (navbarRight) {
      if (user) {
        renderLoggedIn(navbarRight, user);
      } else {
        renderLoggedOut(navbarRight);
      }
    }

    // index.html sets data-require-auth="true" — bounce logged-out
    // visitors to login.html rather than showing a form that will 401.
    if (document.body.getAttribute('data-require-auth') === 'true' && !user) {
      window.location.href = 'login.html';
    }

    window.VeridexAuth = { user };
  }

  init();
})();