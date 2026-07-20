/* Amy FX PWA member authentication */
(function () {
  'use strict';

  if (window.AmyFXAuth) return;

  const scriptUrl = new URL(document.currentScript?.src || 'member-auth.js', location.href);
  const appRootUrl = new URL('./', scriptUrl);
  const CONFIG_URL = new URL('pwa-config.json', appRootUrl).href;
  const SESSION_KEY = 'amyfx.pwa.auth.session.v1';
  const CONFIG_FALLBACK = {
    authRequired: true,
    authEndpoint: 'https://wliecyxzlwhmtftnfnps.supabase.co/functions/v1/pwa-auth',
    apiBaseUrl: 'https://amy-fx.vercel.app',
    webPushEnabled: false
  };

  let config = CONFIG_FALLBACK;
  let session = readSession();
  let currentUser = session?.user || null;
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });

  function safeJson(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function readSession() {
    try { return safeJson(localStorage.getItem(SESSION_KEY) || 'null', null); }
    catch (_) { return null; }
  }

  function writeSession(next) {
    session = next || null;
    currentUser = session?.user || null;
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('amyfx:auth-change', {
      detail: { authenticated: Boolean(session?.access_token), user: currentUser }
    }));
  }

  async function loadConfig() {
    try {
      const response = await fetch(CONFIG_URL, { cache: 'no-store' });
      if (response.ok) config = { ...CONFIG_FALLBACK, ...(await response.json()) };
    } catch (_) {
      config = CONFIG_FALLBACK;
    }
    window.AMYFX_PWA_CONFIG = config;
    return config;
  }

  async function request(action, payload) {
    const response = await fetch(config.authEndpoint, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...(payload || {}) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || 'Permintaan login gagal.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function sessionExpiresSoon(value) {
    const expiresAt = Number(value?.expires_at || 0) * 1000;
    return !expiresAt || expiresAt - Date.now() < 90_000;
  }

  async function refreshSession() {
    if (!session?.refresh_token) throw new Error('Sesi tidak tersedia.');
    const data = await request('refresh', { refresh_token: session.refresh_token });
    writeSession(data.session);
    return session;
  }

  async function validateSession() {
    if (!session?.access_token) return false;
    try {
      if (sessionExpiresSoon(session)) await refreshSession();
      const data = await request('me', { access_token: session.access_token });
      currentUser = data.user || session.user || null;
      writeSession({ ...session, user: currentUser });
      return true;
    } catch (_) {
      writeSession(null);
      return false;
    }
  }

  function ensureStyles() {
    if (document.getElementById('amyfx-auth-style')) return;
    const style = document.createElement('style');
    style.id = 'amyfx-auth-style';
    style.textContent = `
      #amyfx-auth-overlay{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:22px;background:radial-gradient(circle at 50% 0%,rgba(212,175,55,.14),transparent 42%),#050505;color:#fff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #amyfx-auth-overlay[hidden]{display:none}
      .amyfx-auth-card{width:min(100%,390px);padding:24px;border:1px solid rgba(212,175,55,.34);border-radius:20px;background:rgba(18,18,18,.96);box-shadow:0 24px 70px rgba(0,0,0,.58)}
      .amyfx-auth-mark{width:58px;height:58px;margin:0 auto 14px;border:2px solid #d4af37;border-radius:50%;display:grid;place-items:center;color:#d4af37;font-weight:900;letter-spacing:1px;box-shadow:0 0 20px rgba(212,175,55,.24)}
      .amyfx-auth-card h1{margin:0;text-align:center;font-size:1.35rem}.amyfx-auth-card p{margin:7px 0 20px;text-align:center;color:#aaa;font-size:.84rem;line-height:1.5}
      .amyfx-auth-field{display:grid;gap:6px;margin-top:12px}.amyfx-auth-field span{font-size:.72rem;font-weight:800;color:#d8ca9d}.amyfx-auth-field input{width:100%;padding:13px 14px;border:1px solid rgba(212,175,55,.24);border-radius:12px;background:#0b0b0b;color:#fff;font:inherit;outline:none}.amyfx-auth-field input:focus{border-color:#d4af37;box-shadow:0 0 0 3px rgba(212,175,55,.11)}
      .amyfx-auth-submit{width:100%;margin-top:17px;padding:13px 16px;border:0;border-radius:12px;background:linear-gradient(135deg,#d4af37,#f0d778);color:#17130a;font-weight:900;font:inherit}.amyfx-auth-submit:disabled{opacity:.6}
      .amyfx-auth-status{min-height:20px;margin-top:11px;color:#ffb4a9;text-align:center;font-size:.76rem}.amyfx-auth-help{margin-top:16px!important;font-size:.7rem!important;color:#777!important}
    `;
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    ensureStyles();
    let overlay = document.getElementById('amyfx-auth-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('section');
    overlay.id = 'amyfx-auth-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <form class="amyfx-auth-card" id="amyfx-auth-form">
        <div class="amyfx-auth-mark">AMY</div>
        <h1>Masuk ke Amy FX</h1>
        <p>Akses khusus member. Gunakan akun yang dibuat oleh pengelola Amy FX.</p>
        <label class="amyfx-auth-field"><span>Email</span><input id="amyfx-auth-email" type="email" autocomplete="username" required></label>
        <label class="amyfx-auth-field"><span>Password</span><input id="amyfx-auth-password" type="password" autocomplete="current-password" minlength="6" required></label>
        <button class="amyfx-auth-submit" type="submit">Masuk</button>
        <div class="amyfx-auth-status" id="amyfx-auth-status" aria-live="polite"></div>
        <p class="amyfx-auth-help">Pendaftaran umum tidak tersedia.</p>
      </form>`;
    document.body.appendChild(overlay);

    const form = overlay.querySelector('#amyfx-auth-form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      const status = form.querySelector('#amyfx-auth-status');
      const email = form.querySelector('#amyfx-auth-email').value.trim();
      const password = form.querySelector('#amyfx-auth-password').value;
      button.disabled = true;
      status.textContent = 'Memeriksa akun...';
      try {
        const data = await request('login', { email, password });
        writeSession(data.session);
        overlay.hidden = true;
        status.textContent = '';
      } catch (error) {
        status.textContent = error.message || 'Login gagal.';
      } finally {
        button.disabled = false;
      }
    });
    return overlay;
  }

  async function requireAuth() {
    await ready;
    if (!config.authRequired) return true;
    if (await validateSession()) return true;
    ensureOverlay().hidden = false;
    return false;
  }

  async function login(email, password) {
    await ready;
    const data = await request('login', { email, password });
    writeSession(data.session);
    const overlay = document.getElementById('amyfx-auth-overlay');
    if (overlay) overlay.hidden = true;
    return data.session;
  }

  async function signOut() {
    await ready;
    try {
      if (session?.access_token) await request('logout', { access_token: session.access_token });
    } catch (_) {}
    writeSession(null);
    if (config.authRequired) ensureOverlay().hidden = false;
  }

  function openLogin() {
    ensureOverlay().hidden = false;
  }

  window.AmyFXAuth = {
    ready,
    requireAuth,
    login,
    signOut,
    openLogin,
    appRootUrl: appRootUrl.href,
    getConfig: () => ({ ...config }),
    getSession: () => session,
    getUser: () => currentUser,
    isAuthenticated: () => Boolean(session?.access_token)
  };

  async function boot() {
    await loadConfig();
    readyResolve(true);
    if (config.authRequired) await requireAuth();
    else if (session?.access_token) validateSession().catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
