/* Amy FX PWA Web Push verification */
(function () {
  'use strict';

  if (window.__amyfxPushTestLoaded) return;
  window.__amyfxPushTestLoaded = true;

  const scriptUrl = new URL(document.currentScript?.src || 'pwa-push-test.js', location.href);
  const appRootUrl = new URL('./', scriptUrl);
  const TESTED_KEY = 'amyfx.pwa.push.server-test.v3';
  const DISMISSED_KEY = 'amyfx.pwa.push.test-dismissed.until.v3';
  let pendingTest = null;

  function tested() {
    try { return localStorage.getItem(TESTED_KEY) === '1'; } catch (_) { return false; }
  }

  function dismissed() {
    try { return Number(localStorage.getItem(DISMISSED_KEY) || 0) > Date.now(); } catch (_) { return false; }
  }

  function markTested() {
    try { localStorage.setItem(TESTED_KEY, '1'); } catch (_) {}
  }

  function dismiss(node) {
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now() + 6 * 60 * 60 * 1000)); } catch (_) {}
    node?.remove();
  }

  function ensureStyles() {
    if (document.getElementById('amyfx-push-test-style')) return;
    const style = document.createElement('style');
    style.id = 'amyfx-push-test-style';
    style.textContent = `
      .amyfx-push-test{position:fixed;left:12px;right:12px;bottom:calc(86px + env(safe-area-inset-bottom));z-index:2147482100;max-width:560px;margin:auto;padding:13px 14px;border:1px solid rgba(212,175,55,.52);border-radius:15px;background:rgba(8,8,8,.97);box-shadow:0 16px 42px rgba(0,0,0,.58);color:#fff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
      .amyfx-push-test strong{display:block;color:#f9f1c8;font-size:14px;margin-bottom:3px}.amyfx-push-test p{margin:0;color:#bdb7a8;font-size:12px;line-height:1.45}.amyfx-push-test-status{display:block;min-height:16px;margin-top:7px;color:#e5d28d;font-size:11px;line-height:1.45}.amyfx-push-test-actions{display:flex;gap:8px;margin-top:10px}.amyfx-push-test button{border:1px solid rgba(212,175,55,.45);border-radius:10px;padding:9px 12px;background:#17140c;color:#f9f1c8;font-weight:800;font-size:12px}.amyfx-push-test button.primary{background:#d4af37;color:#080808}.amyfx-push-test button.dismiss{margin-left:auto;background:transparent;color:#aaa}.amyfx-push-test.is-busy button{pointer-events:none;opacity:.6}
      .amyfx-push-test-launcher{position:fixed;right:14px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:2147481850;min-height:44px;padding:0 14px;border:1px solid rgba(212,175,55,.55);border-radius:999px;background:rgba(8,8,8,.94);box-shadow:0 10px 28px rgba(0,0,0,.5);color:#f3d567;font:800 12px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-tap-highlight-color:transparent}.amyfx-push-test-launcher:active{transform:scale(.96)}
    `;
    document.head.appendChild(style);
  }

  function setStatus(node, message) {
    const status = node?.querySelector('.amyfx-push-test-status');
    if (status) status.textContent = message;
  }

  function waitForPushReceipt(timeoutMs) {
    if (pendingTest?.reject) pendingTest.reject(new Error('Tes sebelumnya dibatalkan.'));
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (pendingTest?.timer === timer) pendingTest = null;
        reject(new Error('Push belum diterima service worker iPhone dalam 15 detik.'));
      }, timeoutMs || 15000);
      pendingTest = { resolve, reject, timer };
    });
  }

  function resolvePushReceipt(detail) {
    if (!pendingTest) return;
    window.clearTimeout(pendingTest.timer);
    const resolve = pendingTest.resolve;
    pendingTest = null;
    resolve(detail || {});
  }

  async function testNotification(node) {
    if (window.AmyFXAuth?.ready) await window.AmyFXAuth.ready;
    const config = window.AmyFXAuth?.getConfig?.() || window.AMYFX_PWA_CONFIG || {};
    const session = window.AmyFXAuth?.getSession?.();

    if (!session?.access_token) {
      window.AmyFXAuth?.openLogin?.();
      setStatus(node, 'Masuk kembali ke akun Amy FX.');
      return false;
    }
    if (!String(config.webPushRegisterEndpoint || '').startsWith('https://')) {
      setStatus(node, 'Layanan tes notifikasi belum tersedia.');
      return false;
    }

    node?.classList.add('is-busy');
    setStatus(node, 'Mengirim tes dari server...');

    try {
      const receiptPromise = waitForPushReceipt(15000);
      const response = await fetch(config.webPushRegisterEndpoint, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'test' })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false || !Number(data.sent || 0)) {
        if (pendingTest?.reject) pendingTest.reject(new Error(data.error || 'Tes notifikasi gagal dikirim.'));
        throw new Error(data.error || 'Tes notifikasi gagal dikirim.');
      }

      setStatus(node, 'Server Apple menerima push. Menunggu iPhone menampilkannya...');
      const receipt = await receiptPromise;
      markTested();
      setStatus(node, receipt.displayed
        ? 'Push diterima service worker iPhone. Jika spanduk tetap tidak terlihat, Focus sedang menyenyapkan Amy FX. Matikan Focus atau izinkan Amy FX di pengaturan Focus.'
        : 'Push diterima iPhone, tetapi tampilan notifikasi gagal. Buka ulang Amy FX lalu tes kembali.');
      const primary = node?.querySelector('.primary');
      if (primary) primary.textContent = 'Kirim Ulang';
      return true;
    } catch (error) {
      console.error('Tes Web Push gagal', error);
      setStatus(node, error.message || 'Tes notifikasi gagal.');
      return false;
    } finally {
      node?.classList.remove('is-busy');
    }
  }

  async function canTest() {
    if (!('serviceWorker' in navigator) || !('Notification' in window) || Notification.permission !== 'granted') return false;
    if (window.AmyFXAuth?.ready) await window.AmyFXAuth.ready;
    if (!window.AmyFXAuth?.isAuthenticated?.()) return false;
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    const subscription = await registration?.pushManager?.getSubscription().catch(() => null);
    return Boolean(subscription);
  }

  async function showPrompt(force) {
    if (!force && (tested() || dismissed())) return;
    if (document.querySelector('.amyfx-push-test')) return;
    if (!(await canTest())) return;

    ensureStyles();
    const box = document.createElement('section');
    box.className = 'amyfx-push-test';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Tes notifikasi Amy FX');
    box.innerHTML = `
      <strong>Tes Notifikasi Background</strong>
      <p>Tes ini memastikan push benar-benar mencapai service worker iPhone. Ikon orang atau bulan di samping jam menandakan Focus aktif dan dapat menyenyapkan spanduk.</p>
      <span class="amyfx-push-test-status" aria-live="polite"></span>
      <div class="amyfx-push-test-actions">
        <button type="button" class="primary">Tes Sekarang</button>
        <button type="button" class="dismiss">Nanti</button>
      </div>`;
    box.querySelector('.primary').addEventListener('click', function () { testNotification(box); });
    box.querySelector('.dismiss').addEventListener('click', function () { dismiss(box); });
    document.body.appendChild(box);
  }

  async function ensureLauncher() {
    if (document.querySelector('.amyfx-push-test-launcher')) return;
    if (!(await canTest())) return;
    ensureStyles();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'amyfx-push-test-launcher';
    button.textContent = '🔔 Tes Notif';
    button.setAttribute('aria-label', 'Tes notifikasi Amy FX');
    button.addEventListener('click', function () { showPrompt(true); });
    document.body.appendChild(button);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (event) {
      if (event.data?.type === 'AMYFX_PUSH_RECEIVED' && event.data?.detail?.type === 'test') {
        resolvePushReceipt(event.data.detail);
      }
    });
  }

  window.AmyPushTest = Object.freeze({
    run: function () { return showPrompt(true); },
    send: function () { return testNotification(document.querySelector('.amyfx-push-test')); },
    appRootUrl: appRootUrl.href
  });

  window.addEventListener('amyfx:web-push-change', function (event) {
    if (event.detail?.enabled) window.setTimeout(function () {
      ensureLauncher();
      showPrompt(true);
    }, 500);
  });
  window.addEventListener('amyfx:auth-change', function (event) {
    if (event.detail?.authenticated) window.setTimeout(function () {
      ensureLauncher();
      showPrompt(false);
    }, 1000);
  });

  function start() {
    window.setTimeout(function () {
      ensureLauncher();
      showPrompt(false);
    }, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
