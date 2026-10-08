// Amy FX Pro — Gold market context; manual execution only.
(function () {
  const VERSION = Object.freeze({ name: '2.0.0-pro.408', code: 950408 });
  window.AmyFXAppVersion = VERSION;
  window.AmyFXUpdateManifestUrl = 'https://raw.githubusercontent.com/suhaimitoamy/Amy-fx-pro/main/update.json';
  function displayVersionName(name) {
    return String(name || '').replace(/-pro(?:\.|-)?/i, ' · build ');
  }

  function versionText() {
    return `Amy FX Pro · v${displayVersionName(VERSION.name)}`;
  }

  function injectVersionRow() {
    const list = document.querySelector('#main-content .profile-list');
    if (!list || list.querySelector('[data-profile-action="version"]')) return;

    const row = document.createElement('button');
    row.className = 'profile-row';
    row.type = 'button';
    row.dataset.profileAction = 'version';
    row.setAttribute('aria-label', `Versi aplikasi ${VERSION.name}, periksa pembaruan`);
    row.innerHTML = `
      <span class="tool-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v6M12 7h.01"></path></svg></span>
      <span>
        <strong>Versi Aplikasi</strong>
        <small>${versionText()}</small>
      </span>
      <span class="chevron">›</span>`;

    const clearCache = list.querySelector('[data-profile-action="clear"]');
    if (clearCache) list.insertBefore(row, clearCache);
    else list.appendChild(row);
  }

  function requestUpdateCheck() {
    if (window.AmyFXUpdate?.checkNow) {
      window.AmyFXUpdate.checkNow({ announce: true });
      return;
    }
    window.showToast?.(`Versi terpasang: Amy FX Pro v${displayVersionName(VERSION.name)} (${VERSION.code}). Pemeriksa update sedang dimuat.`);
    setTimeout(() => window.AmyFXUpdate?.checkNow?.({ announce: true }), 800);
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-profile-action="version"]')) requestUpdateCheck();
  });

  const main = document.getElementById('main-content');
  if (main) {
    new MutationObserver(injectVersionRow).observe(main, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectVersionRow, { once: true });
  } else {
    injectVersionRow();
  }
})();
