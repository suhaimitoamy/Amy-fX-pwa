(function () {
  const VERSION = Object.freeze({ name: '1.4.13', code: 36 });
  window.AmyFXAppVersion = VERSION;

  function versionText() {
    return `Amy FX v${VERSION.name} • Version code ${VERSION.code}`;
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
      <span class="tool-icon">ⓘ</span>
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
    window.showToast?.(`Versi terpasang: Amy FX v${VERSION.name} (${VERSION.code}). Pemeriksa update sedang dimuat.`);
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
