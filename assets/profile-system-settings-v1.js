(function () {
  'use strict';

  if (window.__amyFxProfileSystemSettingsInstalled) return;
  window.__amyFxProfileSystemSettingsInstalled = true;

  function injectSettings() {
    const list = document.querySelector('#main-content .profile-list');
    if (!list) return;

    if (!list.querySelector('[data-profile-system="market-api"]')) {
      const row = document.createElement('div');
      row.className = 'profile-row';
      row.dataset.profileSystem = 'market-api';
      row.innerHTML = `
        <span class="tool-icon">⌁</span>
        <span>
          <strong>Data Market API</strong>
          <small>Dikelola otomatis melalui Vercel dan Supabase. Tidak perlu API key di HP.</small>
        </span>
        <span class="check-mark">✓</span>`;
      const clearButton = list.querySelector('[data-profile-action="clear"]');
      if (clearButton) list.insertBefore(row, clearButton);
      else list.appendChild(row);
    }

    if (!list.querySelector('[data-profile-action="test-notification"]')) {
      const button = document.createElement('button');
      button.className = 'profile-row';
      button.type = 'button';
      button.dataset.profileAction = 'test-notification';
      button.innerHTML = `
        <span class="tool-icon">🔔</span>
        <span>
          <strong>Tes Notifikasi</strong>
          <small>Periksa notifikasi Amy FX pada perangkat ini.</small>
        </span>
        <span class="chevron">›</span>`;
      const clearButton = list.querySelector('[data-profile-action="clear"]');
      if (clearButton) list.insertBefore(button, clearButton);
      else list.appendChild(button);
    }
  }

  function browserNotification(title, body) {
    if (typeof Notification === 'undefined') return false;
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') new Notification(title, { body, tag: 'amyfx-profile-test' });
    });
    return true;
  }

  function testNotification() {
    const title = 'AMY FX — TES NOTIFIKASI';
    const body = 'Notifikasi Amy FX Preview berfungsi pada perangkat ini.';
    const target = location.href.split('#')[0];

    if (window.Android?.showNotificationWithUrl) {
      window.Android.showNotificationWithUrl(title, body, target);
      window.showToast?.('Tes notifikasi dikirim.');
      return;
    }

    if (browserNotification(title, body)) {
      window.showToast?.('Tes notifikasi dikirim.');
      return;
    }

    window.showToast?.('Notifikasi belum tersedia pada perangkat ini.');
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-profile-action="test-notification"]')) testNotification();
  });

  const main = document.getElementById('main-content');
  if (main) new MutationObserver(injectSettings).observe(main, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSettings, { once: true });
  } else {
    injectSettings();
  }
})();
