/* Amy FX Journal authenticated base loader. */
(function () {
  'use strict';

  if (window.__amyJournalBaseLoaderStarted) return;
  window.__amyJournalBaseLoaderStarted = true;

  const loaderUrl = new URL(document.currentScript?.src || 'app.js', location.href);
  const journalRootUrl = new URL('./', loaderUrl);
  const appRootUrl = new URL('../../../', loaderUrl);
  let coreLoaded = false;

  function loadScript(url) {
    const source = url instanceof URL ? url.href : String(url);
    const existing = Array.from(document.scripts).find(script => script.src === source);
    if (existing) {
      if (existing.dataset.loaded === '1') return Promise.resolve();
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source;
      script.async = false;
      script.addEventListener('load', () => {
        script.dataset.loaded = '1';
        resolve();
      }, { once: true });
      script.addEventListener('error', reject, { once: true });
      document.head.appendChild(script);
    });
  }

  async function loadCore() {
    if (coreLoaded) return;
    coreLoaded = true;
    await loadScript(new URL('app-core.js', journalRootUrl));
    window.dispatchEvent(new CustomEvent('amyfx:journal-core-ready'));
  }

  async function boot() {
    try {
      if (!window.AmyPlatform) await loadScript(new URL('platform-adapter.js', appRootUrl));
      if (!window.AmyFXAuth) await loadScript(new URL('member-auth.js', appRootUrl));
      if (!window.AmyPWA) await loadScript(new URL('pwa-bootstrap.js', appRootUrl));
      await window.AmyFXAuth.ready;
      const authenticated = await window.AmyFXAuth.requireAuth();
      if (authenticated) {
        await loadCore();
        return;
      }
      window.addEventListener('amyfx:auth-change', event => {
        if (event.detail?.authenticated) loadCore().catch(console.error);
      });
    } catch (error) {
      console.error('Journal application bootstrap failed:', error);
      window.showToast?.('Jurnal gagal dimuat. Muat ulang halaman.');
    }
  }

  boot();
})();
