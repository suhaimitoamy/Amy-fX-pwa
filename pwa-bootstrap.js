(function () {
  'use strict';

  if (window.__amyfxPwaBootstrapped) return;
  window.__amyfxPwaBootstrapped = true;

  const scriptUrl = new URL(document.currentScript?.src || 'pwa-bootstrap.js', location.href);
  const appRootUrl = new URL('./', scriptUrl);
  const appRootPath = appRootUrl.pathname.endsWith('/') ? appRootUrl.pathname : `${appRootUrl.pathname}/`;
  const serviceWorkerUrl = new URL('service-worker.js', appRootUrl);

  const state = {
    deferredPrompt: null,
    registration: null,
    updateReady: false
  };

  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const currentPath = location.pathname.replace(/index\.html$/, '');
  const isRoot = currentPath === appRootPath || currentPath === appRootPath.replace(/\/$/, '');

  function toast(message, kind) {
    if (window.AmyPlatform && window.AmyPlatform.toast) {
      window.AmyPlatform.toast(message, { kind: kind || 'info', duration: 3600 });
      return;
    }
    console.log(message);
  }

  function injectInstallStyles() {
    if (document.getElementById('amy-pwa-install-styles')) return;
    const style = document.createElement('style');
    style.id = 'amy-pwa-install-styles';
    style.textContent = `
      .amy-pwa-install{position:fixed;left:12px;right:12px;bottom:calc(86px + env(safe-area-inset-bottom));z-index:2147482000;max-width:560px;margin:auto;padding:13px 14px;border:1px solid rgba(212,175,55,.45);border-radius:15px;background:rgba(8,8,8,.95);box-shadow:0 16px 42px rgba(0,0,0,.55);color:#fff;font-family:system-ui,sans-serif;backdrop-filter:blur(14px)}
      .amy-pwa-install strong{display:block;color:#f9f1c8;font-size:14px;margin-bottom:3px}.amy-pwa-install p{margin:0;color:#bdb7a8;font-size:12px;line-height:1.45}.amy-pwa-install-actions{display:flex;gap:8px;margin-top:10px}.amy-pwa-install button{border:1px solid rgba(212,175,55,.45);border-radius:10px;padding:9px 12px;background:#17140c;color:#f9f1c8;font-weight:800;font-size:12px}.amy-pwa-install button.primary{background:#d4af37;color:#080808}.amy-pwa-install button.dismiss{margin-left:auto;background:transparent;color:#aaa}
      .amy-pwa-update{position:fixed;left:12px;right:12px;top:calc(10px + env(safe-area-inset-top));z-index:2147482500;max-width:560px;margin:auto;padding:11px 12px;border:1px solid rgba(212,175,55,.55);border-radius:13px;background:rgba(8,8,8,.96);color:#fff;font:700 12px/1.4 system-ui,sans-serif;display:flex;align-items:center;gap:10px;box-shadow:0 14px 36px rgba(0,0,0,.48)}
      .amy-pwa-update button{margin-left:auto;border:0;border-radius:9px;padding:8px 10px;background:#d4af37;color:#080808;font-weight:900}
    `;
    document.head.appendChild(style);
  }

  function installHintDismissed() {
    try { return localStorage.getItem('amyfx.pwa.install.dismissed') === '1'; } catch (_) { return false; }
  }

  function dismissInstallHint(node) {
    try { localStorage.setItem('amyfx.pwa.install.dismissed', '1'); } catch (_) {}
    if (node) node.remove();
  }

  function showInstallHint() {
    if (!isRoot || isStandalone || installHintDismissed()) return;
    if (document.querySelector('.amy-pwa-install')) return;
    injectInstallStyles();

    const box = document.createElement('section');
    box.className = 'amy-pwa-install';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Pasang Amy FX');

    const text = isIOS
      ? 'Di Safari, tekan tombol Bagikan lalu pilih Tambahkan ke Layar Utama.'
      : 'Pasang Amy FX agar terbuka seperti aplikasi dan dapat memakai cache offline.';

    box.innerHTML = `<strong>Pasang Amy FX</strong><p>${text}</p><div class="amy-pwa-install-actions"></div>`;
    const actions = box.querySelector('.amy-pwa-install-actions');

    if (!isIOS) {
      const install = document.createElement('button');
      install.className = 'primary';
      install.type = 'button';
      install.textContent = 'Pasang';
      install.addEventListener('click', installApp);
      actions.appendChild(install);
    }

    const close = document.createElement('button');
    close.className = 'dismiss';
    close.type = 'button';
    close.textContent = 'Nanti';
    close.addEventListener('click', function () { dismissInstallHint(box); });
    actions.appendChild(close);
    document.body.appendChild(box);
  }

  async function installApp() {
    if (!state.deferredPrompt) {
      if (isIOS) toast('Safari: Bagikan → Tambahkan ke Layar Utama.');
      else toast('Pilihan pemasangan belum tersedia. Buka menu browser lalu pilih Instal aplikasi.');
      return false;
    }

    state.deferredPrompt.prompt();
    const result = await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    document.querySelector('.amy-pwa-install')?.remove();
    return result && result.outcome === 'accepted';
  }

  function showUpdateReady(registration) {
    if (state.updateReady || !registration || !registration.waiting) return;
    state.updateReady = true;
    injectInstallStyles();

    const banner = document.createElement('div');
    banner.className = 'amy-pwa-update';
    banner.innerHTML = '<span>Versi Amy FX terbaru sudah siap.</span>';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Perbarui';
    button.addEventListener('click', function () {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    });
    banner.appendChild(button);
    document.body.appendChild(banner);
  }

  function watchRegistration(registration) {
    state.registration = registration;
    if (registration.waiting) showUpdateReady(registration);

    registration.addEventListener('updatefound', function () {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', function () {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateReady(registration);
        }
      });
    });
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
    try {
      const registration = await navigator.serviceWorker.register(serviceWorkerUrl.href, {
        scope: appRootPath,
        updateViaCache: 'none'
      });
      watchRegistration(registration);
      window.setTimeout(function () { registration.update().catch(function () {}); }, 1500);
      return registration;
    } catch (error) {
      console.error('Amy FX service worker gagal didaftarkan', error);
      return null;
    }
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    state.deferredPrompt = event;
    showInstallHint();
  });

  window.addEventListener('appinstalled', function () {
    state.deferredPrompt = null;
    document.querySelector('.amy-pwa-install')?.remove();
    toast('Amy FX berhasil dipasang.', 'success');
  });

  window.addEventListener('online', function () { toast('Koneksi kembali online.', 'success'); });
  window.addEventListener('offline', function () { toast('Koneksi terputus. Data cache tetap dapat digunakan.', 'error'); });

  let refreshing = false;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  }

  window.AmyPWA = Object.freeze({
    install: installApp,
    registration: function () { return state.registration; },
    appRootUrl: appRootUrl.href,
    appRootPath,
    isStandalone,
    isIOS
  });

  registerServiceWorker();
  window.setTimeout(showInstallHint, 1400);
})();
