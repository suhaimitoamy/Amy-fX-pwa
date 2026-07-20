(function () {
  'use strict';

  if (window.__amyfxPwaBootstrapped) return;
  window.__amyfxPwaBootstrapped = true;

  const scriptUrl = new URL(document.currentScript?.src || 'pwa-bootstrap.js', location.href);
  const appRootUrl = new URL('./', scriptUrl);
  const appRootPath = appRootUrl.pathname.endsWith('/') ? appRootUrl.pathname : `${appRootUrl.pathname}/`;
  const serviceWorkerUrl = new URL('service-worker.js', appRootUrl);
  const NOTIFY_DISMISS_KEY = 'amyfx.pwa.notify.dismissed.until.v1';

  const state = {
    deferredPrompt: null,
    registration: null,
    updateReady: false,
    config: null,
    pushSyncing: false
  };

  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const currentPath = location.pathname.replace(/index\.html$/, '');
  const isRoot = currentPath === appRootPath || currentPath === appRootPath.replace(/\/$/, '');
  const supportsPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  function toast(message, kind) {
    if (window.AmyPlatform && window.AmyPlatform.toast) {
      window.AmyPlatform.toast(message, { kind: kind || 'info', duration: 4200 });
      return;
    }
    console.log(message);
  }

  function injectInstallStyles() {
    if (document.getElementById('amy-pwa-install-styles')) return;
    const style = document.createElement('style');
    style.id = 'amy-pwa-install-styles';
    style.textContent = `
      .amy-pwa-install,.amy-pwa-notify{position:fixed;left:12px;right:12px;bottom:calc(86px + env(safe-area-inset-bottom));z-index:2147482000;max-width:560px;margin:auto;padding:13px 14px;border:1px solid rgba(212,175,55,.45);border-radius:15px;background:rgba(8,8,8,.96);box-shadow:0 16px 42px rgba(0,0,0,.55);color:#fff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;backdrop-filter:blur(14px)}
      .amy-pwa-install strong,.amy-pwa-notify strong{display:block;color:#f9f1c8;font-size:14px;margin-bottom:3px}.amy-pwa-install p,.amy-pwa-notify p{margin:0;color:#bdb7a8;font-size:12px;line-height:1.45}.amy-pwa-install-actions,.amy-pwa-notify-actions{display:flex;gap:8px;margin-top:10px}.amy-pwa-install button,.amy-pwa-notify button{border:1px solid rgba(212,175,55,.45);border-radius:10px;padding:9px 12px;background:#17140c;color:#f9f1c8;font-weight:800;font-size:12px}.amy-pwa-install button.primary,.amy-pwa-notify button.primary{background:#d4af37;color:#080808}.amy-pwa-install button.dismiss,.amy-pwa-notify button.dismiss{margin-left:auto;background:transparent;color:#aaa}
      .amy-pwa-notify.is-busy button{pointer-events:none;opacity:.6}.amy-pwa-notify-status{display:block;min-height:16px;margin-top:7px;color:#e5d28d;font-size:11px}
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

  function notificationPromptDismissed() {
    try { return Number(localStorage.getItem(NOTIFY_DISMISS_KEY) || 0) > Date.now(); }
    catch (_) { return false; }
  }

  function dismissNotificationPrompt(node) {
    try { localStorage.setItem(NOTIFY_DISMISS_KEY, String(Date.now() + 24 * 60 * 60 * 1000)); } catch (_) {}
    node?.remove();
  }

  function clearNotificationPromptDismissal() {
    try { localStorage.removeItem(NOTIFY_DISMISS_KEY); } catch (_) {}
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

  function urlBase64ToUint8Array(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  }

  async function loadPushConfig() {
    if (state.config) return state.config;
    if (window.AmyFXAuth?.ready) await window.AmyFXAuth.ready;
    state.config = window.AmyFXAuth?.getConfig?.() || window.AMYFX_PWA_CONFIG || {};
    return state.config;
  }

  function pushPlatform() {
    if (isIOS) return isStandalone ? 'ios-pwa' : 'ios-browser';
    if (/Android/i.test(ua)) return isStandalone ? 'android-pwa' : 'android-browser';
    return isStandalone ? 'desktop-pwa' : 'desktop-browser';
  }

  async function pushRegistration() {
    if (state.registration) return state.registration;
    return registerServiceWorker();
  }

  async function registerSubscription(subscription) {
    const config = await loadPushConfig();
    const session = window.AmyFXAuth?.getSession?.();
    if (!session?.access_token) throw new Error('Silakan masuk kembali ke akun Amy FX.');
    if (!String(config.webPushRegisterEndpoint || '').startsWith('https://')) {
      throw new Error('Layanan notifikasi belum dikonfigurasi.');
    }

    const serialized = subscription.toJSON();
    const response = await fetch(config.webPushRegisterEndpoint, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        subscription: serialized,
        platform: pushPlatform(),
        userAgent: ua
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || 'Pendaftaran notifikasi gagal.');
    return data;
  }

  async function syncExistingSubscription() {
    if (state.pushSyncing || !supportsPush || Notification.permission !== 'granted') return false;
    const config = await loadPushConfig();
    if (!config.webPushEnabled || !window.AmyFXAuth?.isAuthenticated?.()) return false;
    const registration = await pushRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return false;

    state.pushSyncing = true;
    try {
      await registerSubscription(subscription);
      clearNotificationPromptDismissal();
      document.querySelector('.amy-pwa-notify')?.remove();
      return true;
    } catch (error) {
      console.error('Sinkronisasi Web Push gagal', error);
      return false;
    } finally {
      state.pushSyncing = false;
    }
  }

  async function enableNotifications() {
    const config = await loadPushConfig();
    if (!config.webPushEnabled) {
      toast('Web Push belum aktif pada server Amy FX.', 'error');
      return false;
    }
    if (!supportsPush || !window.isSecureContext) {
      toast('Browser ini belum mendukung Web Push.', 'error');
      return false;
    }
    if (isIOS && !isStandalone) {
      showInstallHint();
      toast('Di iPhone, pasang Amy FX ke Layar Utama lalu buka dari ikonnya.', 'error');
      return false;
    }

    if (window.AmyFXAuth?.ready) await window.AmyFXAuth.ready;
    if (!window.AmyFXAuth?.isAuthenticated?.()) {
      window.AmyFXAuth?.openLogin?.();
      toast('Masuk ke akun Amy FX terlebih dahulu.');
      return false;
    }

    const node = document.querySelector('.amy-pwa-notify');
    const status = node?.querySelector('.amy-pwa-notify-status');
    node?.classList.add('is-busy');
    if (status) status.textContent = 'Meminta izin notifikasi...';

    try {
      let permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        if (permission === 'denied') throw new Error('Izin ditolak. Aktifkan notifikasi Amy FX dari pengaturan browser.');
        throw new Error('Izin notifikasi belum diberikan.');
      }

      const registration = await pushRegistration();
      if (!registration) throw new Error('Service worker Amy FX belum siap.');
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const publicKey = String(config.webPushVapidPublicKey || '');
        if (!publicKey) throw new Error('Kunci Web Push belum tersedia.');
        if (status) status.textContent = 'Menghubungkan perangkat...';
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      }

      if (status) status.textContent = 'Menyimpan perangkat...';
      await registerSubscription(subscription);
      clearNotificationPromptDismissal();
      node?.remove();
      toast('Notifikasi news Amy FX sudah aktif.', 'success');
      window.dispatchEvent(new CustomEvent('amyfx:web-push-change', { detail: { enabled: true } }));
      return true;
    } catch (error) {
      console.error('Aktivasi Web Push gagal', error);
      if (status) status.textContent = error.message || 'Aktivasi notifikasi gagal.';
      toast(error.message || 'Aktivasi notifikasi gagal.', 'error');
      return false;
    } finally {
      node?.classList.remove('is-busy');
    }
  }

  async function disableNotifications() {
    if (!supportsPush) return false;
    const registration = await pushRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return true;

    try {
      const config = await loadPushConfig();
      const session = window.AmyFXAuth?.getSession?.();
      if (session?.access_token && String(config.webPushRegisterEndpoint || '').startsWith('https://')) {
        await fetch(config.webPushRegisterEndpoint, {
          method: 'DELETE',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ endpoint: subscription.endpoint, action: 'unsubscribe' })
        });
      }
    } catch (error) {
      console.error('Pencabutan Web Push backend gagal', error);
    }

    await subscription.unsubscribe();
    window.dispatchEvent(new CustomEvent('amyfx:web-push-change', { detail: { enabled: false } }));
    toast('Notifikasi news Amy FX dinonaktifkan.');
    return true;
  }

  async function showNotificationPrompt() {
    const config = await loadPushConfig();
    if (!config.webPushEnabled || !supportsPush || !window.AmyFXAuth?.isAuthenticated?.()) return;
    if (Notification.permission === 'denied' || notificationPromptDismissed()) return;
    if (isIOS && !isStandalone) {
      showInstallHint();
      return;
    }

    const registration = await pushRegistration();
    const existing = await registration?.pushManager.getSubscription();
    if (existing) {
      await syncExistingSubscription();
      return;
    }
    if (document.querySelector('.amy-pwa-notify')) return;

    injectInstallStyles();
    const box = document.createElement('section');
    box.className = 'amy-pwa-notify';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Aktifkan notifikasi news');
    box.innerHTML = `
      <strong>Aktifkan Notifikasi News</strong>
      <p>Terima breaking news XAU/USD meski Amy FX sedang tidak dibuka.</p>
      <span class="amy-pwa-notify-status" aria-live="polite"></span>
      <div class="amy-pwa-notify-actions">
        <button type="button" class="primary">Aktifkan</button>
        <button type="button" class="dismiss">Nanti</button>
      </div>`;
    box.querySelector('.primary').addEventListener('click', enableNotifications);
    box.querySelector('.dismiss').addEventListener('click', function () { dismissNotificationPrompt(box); });
    document.body.appendChild(box);
  }

  function scheduleNotificationPrompt(delay) {
    window.setTimeout(function () {
      showNotificationPrompt().catch(error => console.error('Prompt Web Push gagal', error));
    }, delay || 1200);
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
    scheduleNotificationPrompt(600);
  });

  window.addEventListener('amyfx:auth-change', function (event) {
    if (event.detail?.authenticated) scheduleNotificationPrompt(700);
  });

  window.addEventListener('online', function () {
    toast('Koneksi kembali online.', 'success');
    syncExistingSubscription().catch(function () {});
  });
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
    enableNotifications,
    disableNotifications,
    syncNotifications: syncExistingSubscription,
    notificationPermission: function () { return supportsPush ? Notification.permission : 'unsupported'; },
    registration: function () { return state.registration; },
    appRootUrl: appRootUrl.href,
    appRootPath,
    isStandalone,
    isIOS
  });

  registerServiceWorker().then(function () {
    window.setTimeout(showInstallHint, 1400);
    if (window.AmyFXAuth?.ready) {
      window.AmyFXAuth.ready.then(function () {
        if (window.AmyFXAuth?.isAuthenticated?.()) scheduleNotificationPrompt(1000);
      });
    }
  });
})();
