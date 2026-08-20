// server/backend/public/js/back-to-top.js
// Lightweight "back to top" affordance for the long single-column report
// pages (results.html, risk.html, recommendations.html). Injected via JS
// rather than hardcoded into each HTML file so all three pages share one
// implementation and one place to update. Appears after the user scrolls
// down roughly one screen height, and smooth-scrolls back to the top of
// the page on click.

(function () {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'vrx-back-to-top';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 19V5M12 5L5 12M12 5L19 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  document.body.appendChild(btn);

  function toggleVisibility() {
    if (window.scrollY > window.innerHeight * 0.6) {
      btn.classList.add('is-visible');
    } else {
      btn.classList.remove('is-visible');
    }
  }

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('scroll', toggleVisibility, { passive: true });
  toggleVisibility();
})();