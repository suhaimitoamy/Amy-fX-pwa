/* Amy FX Journal authenticated enhancement loader. */
(function () {
  'use strict';

  if (window.__amyJournalPwaEntryLoaded) return;
  window.__amyJournalPwaEntryLoaded = true;

  const entryScriptUrl = new URL(document.currentScript?.src || 'amy-journal-final-fix.js', location.href);
  const journalRootUrl = new URL('./', entryScriptUrl);
  const appRootUrl = new URL('../../../', entryScriptUrl);
  let enhancementLoaded = false;
  let authListenerInstalled = false;

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

  function waitForDocumentScripts() {
    if (document.readyState !== 'loading') return Promise.resolve();
    return new Promise(resolve => {
      document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }

  function waitForJournalCore() {
    if (typeof window.renderItems === 'function' || typeof window.renderJournals === 'function') {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      window.addEventListener('amyfx:journal-core-ready', resolve, { once: true });
    });
  }

  async function loadEnhancement() {
    if (enhancementLoaded) return;
    enhancementLoaded = true;
    await loadScript(new URL('amy-journal-core.js', journalRootUrl));
  }

  function waitForLogin() {
    if (authListenerInstalled) return;
    authListenerInstalled = true;
    window.addEventListener('amyfx:auth-change', event => {
      if (event.detail?.authenticated) boot().catch(console.error);
    });
  }

  async function boot() {
    try {
      if (!window.AmyPlatform) await loadScript(new URL('platform-adapter.js', appRootUrl));
      if (!window.AmyFXAuth) await loadScript(new URL('member-auth.js', appRootUrl));
      if (!window.AmyPWA) await loadScript(new URL('pwa-bootstrap.js', appRootUrl));
      await window.AmyFXAuth.ready;

      const authenticated = await window.AmyFXAuth.requireAuth();
      if (!authenticated) {
        waitForLogin();
        return;
      }

      await waitForDocumentScripts();
      if (window.__amyJournalBaseLoaderStarted) await waitForJournalCore();
      await loadEnhancement();
    } catch (error) {
      enhancementLoaded = false;
      console.error('Journal enhancement bootstrap failed:', error);
      window.showToast?.('Penyempurnaan jurnal gagal dimuat.');
    }
  }

  boot();
})();
