(function () {
  'use strict';

  if (window.__amyFxPwaUpdateBridgeInstalled) return;
  window.__amyFxPwaUpdateBridgeInstalled = true;

  const scriptUrl = new URL(document.currentScript?.src || 'pwa-update-bridge.js', location.href);
  const appRootUrl = new URL('./', scriptUrl);
  const appRootPath = appRootUrl.pathname.endsWith('/') ? appRootUrl.pathname : `${appRootUrl.pathname}/`;

  function toast(message, kind) {
    if (window.AmyPlatform?.toast) {
      window.AmyPlatform.toast(message, { kind: kind || 'info', duration: 4200 });
      return;
    }
    if (window.showToast) {
      window.showToast(message);
      return;
    }
    console.log(message);
  }

  async function resolveRegistration() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
    const scoped = await navigator.serviceWorker.getRegistration(appRootPath).catch(() => null);
    if (scoped) return scoped;
    return navigator.serviceWorker.ready.catch(() => null);
  }

  async function checkNow(options = {}) {
    const announce = options.announce !== false;
    const registration = await resolveRegistration();
    if (!registration) {
      if (announce) toast('Pembaruan PWA belum tersedia pada browser ini.', 'error');
      return { ok: false, updateReady: false, reason: 'service_worker_unavailable' };
    }

    try {
      await registration.update();
      await new Promise(resolve => setTimeout(resolve, 500));
      const updateReady = Boolean(registration.waiting);
      if (announce) {
        toast(
          updateReady
            ? 'Versi Amy FX PWA terbaru sudah siap. Tekan Perbarui pada banner aplikasi.'
            : 'Amy FX PWA sudah menggunakan versi terbaru.',
          updateReady ? 'success' : 'info'
        );
      }
      window.dispatchEvent(new CustomEvent('amyfx:pwa-update-check', {
        detail: { ok: true, updateReady, checkedAt: Date.now() }
      }));
      return { ok: true, updateReady };
    } catch (error) {
      console.error('Pemeriksaan update Amy FX PWA gagal', error);
      if (announce) toast('Pemeriksaan pembaruan PWA gagal. Periksa koneksi lalu coba lagi.', 'error');
      return { ok: false, updateReady: false, reason: String(error?.message || error) };
    }
  }

  // PWA tidak memakai manifest APK Android. UI versi tetap dapat memanggil API yang sama.
  window.AmyFXUpdateManifestUrl = null;
  window.AmyFXUpdate = Object.freeze({ checkNow });
})();
