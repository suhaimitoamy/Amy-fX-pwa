/* Amy FX PWA live-price stream bridge. Twelve Data credentials stay on the Amy FX production relay. */
(function () {
  'use strict';

  if (window.AmyLivePrice) return;

  const FALLBACK_ENDPOINT = 'https://amy-fx.vercel.app/api/pwa-live-price';
  const MAX_RECONNECT_MS = 15_000;
  let requestController = null;
  let reconnectTimer = 0;
  let reconnectAttempt = 0;
  let connected = false;
  let connecting = false;
  let intentionalClose = false;
  let lastTickAt = 0;

  function dispatchStatus(status, message, extra) {
    window.dispatchEvent(new CustomEvent('amyfx:twelvedata-status', {
      detail: {
        status,
        message: String(message || ''),
        source: 'TWELVE_DATA_WEBSOCKET_EDGE',
        ...(extra || {})
      }
    }));
  }

  function streamEndpoint() {
    const config = window.AmyFXAuth?.getConfig?.() || window.AMYFX_PWA_CONFIG || {};
    const endpoint = String(config.livePriceStreamEndpoint || FALLBACK_ENDPOINT).trim();
    return endpoint.startsWith('https://') ? endpoint : FALLBACK_ENDPOINT;
  }

  function normalizedTimestamp(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return Date.now();
    return numeric > 100_000_000_000 ? Math.floor(numeric) : Math.floor(numeric * 1000);
  }

  function publishPrice(payload) {
    const price = Number(payload?.price);
    if (!Number.isFinite(price) || price <= 0) return false;

    const capturedAt = normalizedTimestamp(payload?.capturedAt ?? payload?.timestamp);
    const marketOpen = payload?.marketOpen !== false;
    if (payload?.stale === true && marketOpen) {
      dispatchStatus('STALE', 'Snapshot harga WebSocket sudah usang; menunggu tick live terbaru.', {
        capturedAt,
        marketOpen
      });
      return false;
    }

    lastTickAt = capturedAt;
    connected = true;
    reconnectAttempt = 0;
    window.dispatchEvent(new CustomEvent('amyfx:twelvedata-price', {
      detail: {
        price,
        timestamp: capturedAt,
        capturedAt,
        symbol: 'XAU/USD',
        source: String(payload?.source || 'TWLEVE_DATA_WEBSOCKET_EDGE'),
        snapshot: payload?.snapshot === true,
        marketOpen
      }
    }));
    return true;
  }

  function handleEvent(eventName, payload) {
    if (eventName === 'price') {
      publishPrice(payload);
      return;
    }
    if (eventName !== 'status') return;

    const status = String(payload?.status || 'CONNECTED').toUpperCase();
    if (['CONNECTED', 'SUBSCRIBED'].includes(status)) {
      connected = true;
      reconnectAttempt = 0;
    } else if (['ERROR', 'RECONNECT', 'CLOSED'].includes(status)) {
      connected = false;
    }
    dispatchStatus(status, payload?.message || '', {
      marketOpen: payload?.marketOpen
    });
  }

  function consumeSseBlock(block) {
    let eventName = 'message';
    const dataLines = [];
    for (const rawLine of block.split('\n')) {
      const line = rawLine.trimEnd();
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim() || 'message';
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (!dataLines.length) return;
    try {
      handleEvent(eventName, JSON.parse(dataLines.join('\n')));
    } catch (_) {}
  }

  function scheduleReconnect() {
    if (intentionalClose || reconnectTimer || document.hidden || !navigator.onLine) return;
    reconnectAttempt += 1;
    const delay = Math.min(MAX_RECONNECT_MS, 1000 * (2 ** Math.min(reconnectAttempt - 1, 4)));
    dispatchStatus('RECONNECTING', `Menyambungkan ulang harga live dalam ${Math.ceil(delay / 1000)} detik.`);
    reconnectTimer = window.setTimeout(function () {
      reconnectTimer = 0;
      openStream().catch(function () {});
    }, delay);
  }

  async function authenticatedSession() {
    if (window.AmyFXAuth?.ready) await window.AmyFXAuth.ready;
    let session = window.AmyFXAuth?.getSession?.();
    if (!session?.access_token && window.AmyFXAuth?.requireAuth) {
      await window.AmyFXAuth.requireAuth().catch(function () {});
      session = window.AmyFXAuth?.getSession?.();
    }
    return session;
  }

  async function openStream() {
    if (intentionalClose || connecting || requestController || document.hidden || !navigator.onLine) return false;
    connecting = true;

    try {
      const session = await authenticatedSession();
      if (!session?.access_token) {
        dispatchStatus('AUTH_REQUIRED', 'Masuk ke akun Amy FX untuk mengaktifkan harga live.');
        return false;
      }

      const controller = new AbortController();
      requestController = controller;
      dispatchStatus('CONNECTING', 'Menghubungkan stream harga WebSocket Amy FX.');

      const response = await fetch(streamEndpoint(), {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(function () { return {}; });
        if (response.status === 401) {
          window.AmyFXAuth?.requireAuth?.().catch(function () {});
        }
        throw new Error(body?.error || `HTTP ${response.status}`);
      }

      connected = true;
      dispatchStatus('CONNECTED', 'Stream harga Twelve Data WebSocket tersambung.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!controller.signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        buffer = buffer.replace(/\r\n/g, '\n');
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          consumeSseBlock(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');
        }
      }

      if (buffer.trim()) consumeSseBlock(buffer.trim());
      try { reader.releaseLock(); } catch (_) {}
      return true;
    } catch (error) {
      if (error?.name !== 'AbortError' && !intentionalClose) {
        connected = false;
        dispatchStatus('ERROR', error?.message || 'Stream harga live gagal tersambung.');
      }
      return false;
    } finally {
      requestController = null;
      connecting = false;
      connected = false;
      scheduleReconnect();
    }
  }

  function connect() {
    intentionalClose = false;
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = 0;
    }
    openStream().catch(function () {});
    return true;
  }

  function disconnect() {
    intentionalClose = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = 0;
    reconnectAttempt = 0;
    requestController?.abort();
    requestController = null;
    connected = false;
    connecting = false;
    dispatchStatus('CLOSED', 'Stream harga live dihentikan.');
    return true;
  }

  window.addEventListener('online', connect);
  window.addEventListener('offline', function () {
    requestController?.abort();
    dispatchStatus('OFFLINE', 'Koneksi internet terputus.');
  });
  window.addEventListener('amyfx:auth-change', function (event) {
    if (event.detail?.authenticated) connect();
    else disconnect();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      requestController?.abort();
      return;
    }
    connect();
  });

  window.AmyLivePrice = Object.freeze({
    version: 'pwa-websocket-production-relay-3.0.0',
    connect,
    disconnect,
    hasApiKey: function () { return true; },
    saveApiKey: function () { return true; },
    clearApiKey: function () { return true; },
    isConnected: function () { return connected; },
    lastTickAt: function () { return lastTickAt; }
  });
})();
