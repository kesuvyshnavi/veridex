// server/backend/public/js/auth-common.js
// Loaded on every page. Checks login state via GET /api/auth/me and
// updates the navbar's .navbar-right accordingly: Log in/Sign up links
// when logged out, or a single avatar button when logged in that opens a
// dropdown with "My Dashboard" and a two-step "Log out" (no browser
// popup — confirmation happens inline inside the dropdown itself).
// Also gates pages marked data-require-auth="true", and wires up any
// password show/hide eye-icon buttons present on the page.

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

  function logoutButtonHtml() {
    return `<button type="button" class="profile-dropdown-item profile-dropdown-danger" id="logoutTrigger">Log out</button>`;
  }

  function renderLoggedIn(navbarRight, user) {
    const initial = (user.email || '?').charAt(0).toUpperCase();
    navbarRight.innerHTML = `
      <div class="profile-menu" id="profileMenu">
        <button type="button" class="profile-avatar" id="profileAvatarBtn" title="${user.email}" aria-haspopup="true" aria-expanded="false">${initial}</button>
        <div class="profile-dropdown hidden" id="profileDropdown">
          <div class="profile-dropdown-email">${user.email}</div>
          <a href="dashboard.html" class="profile-dropdown-item">My Dashboard</a>
          <div id="logoutSection">${logoutButtonHtml()}</div>
        </div>
      </div>
    `;

    const avatarBtn = document.getElementById('profileAvatarBtn');
    const dropdown = document.getElementById('profileDropdown');
    const logoutSection = document.getElementById('logoutSection');

    function attachLogoutTrigger() {
      const btn = document.getElementById('logoutTrigger');
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Step 1 -> Step 2: swap the button for an inline confirmation
        // row, right inside the dropdown. No browser confirm() popup.
        logoutSection.innerHTML = `
          <div class="profile-dropdown-confirm">
            <span>Log out of Veridex?</span>
            <div class="profile-dropdown-confirm-actions">
              <button type="button" class="profile-dropdown-confirm-yes" id="confirmLogoutBtn">Yes, log out</button>
              <button type="button" class="profile-dropdown-confirm-no" id="cancelLogoutBtn">Cancel</button>
            </div>
          </div>
        `;
        document.getElementById('confirmLogoutBtn').addEventListener('click', async (ev) => {
          ev.stopPropagation();
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
          window.location.href = 'home.html';
        });
        document.getElementById('cancelLogoutBtn').addEventListener('click', (ev) => {
          ev.stopPropagation();
          logoutSection.innerHTML = logoutButtonHtml();
          attachLogoutTrigger();
        });
      });
    }

    function closeDropdown() {
      dropdown.classList.add('hidden');
      avatarBtn.setAttribute('aria-expanded', 'false');
      // Reset the logout section back to the plain button whenever the
      // menu closes, so a half-finished confirmation never lingers.
      logoutSection.innerHTML = logoutButtonHtml();
      attachLogoutTrigger();
    }

    avatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = dropdown.classList.contains('hidden');
      if (isHidden) {
        dropdown.classList.remove('hidden');
        avatarBtn.setAttribute('aria-expanded', 'true');
      } else {
        closeDropdown();
      }
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.classList.contains('hidden') && !dropdown.contains(e.target) && e.target !== avatarBtn) {
        closeDropdown();
      }
    });

    attachLogoutTrigger();
  }

  // Wires up any .password-toggle-btn present on the page (login.html,
  // register.html) to flip its target input between type="password" and
  // type="text", swapping the eye/eye-off icon.
  function initPasswordToggles() {
    document.querySelectorAll('.password-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (!input) return;
        const willShow = input.type === 'password';
        input.type = willShow ? 'text' : 'password';
        btn.setAttribute('aria-label', willShow ? 'Hide password' : 'Show password');
        btn.classList.toggle('is-visible', willShow);
      });
    });
  }

  async function init() {
    initPasswordToggles();

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