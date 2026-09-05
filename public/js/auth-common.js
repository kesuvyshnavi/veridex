// server/backend/public/js/auth-common.js
// Loaded on every page. Checks login state via GET /api/auth/me and
// updates the navbar's .navbar-right accordingly, gates auth-required
// pages, wires password show/hide, and (mobile only) injects a hamburger
// button that turns .navbar-links into a dropdown menu. Desktop layout is
// untouched — the hamburger only renders below the 960px breakpoint via CSS.
//
// Performance note: the /api/auth/me check is cached in sessionStorage for
// a short window so navigating across the 4-step analysis flow (Input ->
// Market -> Risk -> Recommendations) doesn't refetch the same auth check
// on every single page load.

(function () {
  const AUTH_CACHE_KEY = 'veridexAuthCache';
  const AUTH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  function getCachedUser() {
    try {
      const raw = sessionStorage.getItem(AUTH_CACHE_KEY);
      if (!raw) return undefined;
      const { user, ts } = JSON.parse(raw);
      if (Date.now() - ts > AUTH_CACHE_TTL_MS) return undefined;
      return user; // may be null (cached "logged out") or a user object
    } catch (err) {
      return undefined;
    }
  }

  function setCachedUser(user) {
    try {
      sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ user, ts: Date.now() }));
    } catch (err) {
      // sessionStorage unavailable (rare) — just skip caching, no functional impact
    }
  }

  async function fetchCurrentUser() {
    const cached = getCachedUser();
    if (cached !== undefined) return cached;

    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!res.ok) {
        setCachedUser(null);
        return null;
      }
      const data = await res.json();
      const user = data.success ? data.user : null;
      setCachedUser(user);
      return user;
    } catch (err) {
      return null; // network failure: don't cache, so the next page retries fresh
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
          sessionStorage.removeItem(AUTH_CACHE_KEY);
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

  // Builds the hamburger button once. Wiring (open/close + outside-click)
  // is attached here too, so it survives being moved around the DOM.
  function createHamburgerButton(links) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'navbarHamburgerBtn';
    btn.className = 'navbar-hamburger';
    btn.setAttribute('aria-label', 'Menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = links.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', (e) => {
      if (links.classList.contains('is-open') && !links.contains(e.target) && !btn.contains(e.target)) {
        links.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    return btn;
  }

  // Places the hamburger as the FIRST child inside .navbar-right, directly
  // before the avatar / login-signup controls — not as a sibling of
  // .navbar-right, which used to leave it stranded mid-navbar due to
  // justify-content: space-between on .navbar-inner. Only does anything on
  // pages that actually have a .navbar-links element (index, results,
  // risk, recommendations, dashboard, report) — home/login/register are
  // untouched. Purely additive on desktop: the button is display:none
  // above 960px via CSS, so desktop layout never changes.
  function placeNavbarHamburger(navbarRight) {
    const links = document.querySelector('.navbar-links');
    if (!links || !navbarRight) return;

    let btn = document.getElementById('navbarHamburgerBtn');
    if (!btn) {
      btn = createHamburgerButton(links);
    } else {
      btn.remove(); // detach from wherever it was before the re-render
    }

    navbarRight.insertBefore(btn, navbarRight.firstChild);
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
      placeNavbarHamburger(navbarRight);
    }

    if (document.body.getAttribute('data-require-auth') === 'true' && !user) {
      window.location.href = 'login.html';
    }

    window.VeridexAuth = { user };
  }

  init();
})();