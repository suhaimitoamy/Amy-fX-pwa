/* Amy FX PWA server-side live-price bridge. Provider credentials never enter the browser. */
(function () {
  'use strict';

  if (window.AmyLivePrice) return;

  const POLL_MS = 15000;
  const HARD_STALE_MS = 180000;
  let timer = null;
  let inFlight = false;
  let connected = false;
  let lastTickAt = 0;

  function dispatchStatus(status, message) {
    window.dispatchEvent(new CustomEvent('amyfx:twelvedata-status', {
      detail: { status, message: String(message || ''), source: 'PWA_SERVER_BRIDGE' }
    }));
  }

  function parseTimestamp(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 100000000000 ? numeric : numeric * 1000;
    }
    const text = String(value || '').trim();
    if (!text) return 0;
    const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(text)
      ? text
      : `${text.replace(' ', 'T')}Z`;
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function endpoint() {
    const query = `/api/twelvedata?symbol=${encodeURIComponent('XAU/USD')}&interval=1min&outputsize=1&_=${Math.floor(Date.now() / POLL_MS)}`;
    if (window.AmyPlatform?.apiUrl) return window.AmyPlatform.apiUrl(query);
    const base = window.AMYFX_PWA_CONFIG?.apiBaseUrl || 'https://amy-fx.vercel.app';
    return new URL(query, base).href;
  }

  async function poll() {
    if (document.hidden || inFlight) return;
    inFlight = true;
    try {
      const response = await fetch(endpoint(), { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data?.status === 'error') throw new Error(data.message || 'Harga server tidak tersedia');

      const row = Array.isArray(data?.values) ? data.values[0] : null;
      const price = Number(data?.price ?? data?.close ?? row?.close);
      const capturedAt = parseTimestamp(
        data?.timestamp || data?.capturedAt || data?.datetime || row?.datetime
      );
      const age = capturedAt ? Date.now() - capturedAt : Number.POSITIVE_INFINITY;

      if (!Number.isFinite(price) || price <= 0) throw new Error('Harga server tidak valid');
      if (!capturedAt || age > HARD_STALE_MS || age < -60000) throw new Error('Harga server sudah usang');

      lastTickAt = capturedAt;
      connected = true;
      dispatchStatus('CONNECTED', 'Harga tersambung melalui server Amy FX.');
      window.dispatchEvent(new CustomEvent('amyfx:twelvedata-price', {
        detail: {
          price,
          timestamp: capturedAt,
          capturedAt,
          source: data?.source || 'PWA_SERVER_BRIDGE'
        }
      }));
    } catch (error) {
      connected = false;
      dispatchStatus('ERROR', error?.message || 'Koneksi harga gagal');
    } finally {
      inFlight = false;
    }
  }

  function connect() {
    if (timer) return true;
    dispatchStatus('CONNECTING', 'Menghubungkan harga melalui server Amy FX.');
    poll();
    timer = window.setInterval(poll, POLL_MS);
    return true;
  }

  function disconnect() {
    if (timer) window.clearInterval(timer);
    timer = null;
    connected = false;
    dispatchStatus('CLOSED', 'Koneksi harga dihentikan.');
    return true;
  }

  window.addEventListener('online', function () {
    if (timer) poll();
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && timer) poll();
  });

  window.AmyLivePrice = Object.freeze({
    version: 'pwa-server-bridge-1.0.0',
    connect,
    disconnect,
    hasApiKey: function () { return true; },
    saveApiKey: function () { return true; },
    clearApiKey: function () { return true; },
    isConnected: function () { return connected; },
    lastTickAt: function () { return lastTickAt; }
  });
})();
