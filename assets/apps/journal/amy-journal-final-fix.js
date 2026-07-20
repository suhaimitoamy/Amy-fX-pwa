/* Amy FX Journal authenticated enhancement loader. */
(function () {
  'use strict';

  if (window.__amyJournalPwaEntryLoaded) return;
  window.__amyJournalPwaEntryLoaded = true;

  const entryScriptUrl = new URL(document.currentScript?.src || 'amy-journal-final-fix.js', location.href);
  const journalRootUrl = new URL('./', entryScriptUrl);
  const appRootUrl = new URL('../../../', entryScriptUrl);
  let enhancementLoaded = false;

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

  async function loadEnhancement() {
    if (enhancementLoaded) return;
    enhancementLoaded = true;
    await loadScript(new URL('amy-journal-core.js', journalRootUrl));
  }

  async function boot() {
    try {
      if (!window.AmyPlatform) await loadScript(new URL('platform-adapter.js', appRootUrl));
      if (!window.AmyFXAuth) await loadScript(new URL('member-auth.js', appRootUrl));
      if (!window.AmyPWA) await loadScript(new URL('pwa-bootstrap.js', appRootUrl));
      await window.AmyFXAuth.ready;
      const authenticated = await window.AmyFXAuth.requireAuth();
      if (!authenticated) {
        window.addEventListener('amyfx:auth-change', event => {
          if (event.detail?.authenticated) boot().catch(console.error);
        }, { once: true });
        return;
      }

      if (window.__amyJournalBaseLoaderStarted && typeof window.renderItems !== 'function') {
        window.addEventListener('amyfx:journal-core-ready', () => {
          loadEnhancement().catch(console.error);
        }, { once: true });
        return;
      }

      await loadEnhancement();
    } catch (error) {
      console.error('Journal enhancement bootstrap failed:', error);
      window.showToast?.('Penyempurnaan jurnal gagal dimuat.');
    }
  }

  boot();
})();
