/* Amy FX web/PWA platform adapter */
(function () {
  'use strict';

  if (window.AmyPlatform) return;

  const scriptUrl = new URL(document.currentScript?.src || 'platform-adapter.js', location.href);
  const appRootUrl = new URL('./', scriptUrl);
  const appRootPath = appRootUrl.pathname.endsWith('/') ? appRootUrl.pathname : `${appRootUrl.pathname}/`;
  const DEFAULT_API_BASE = 'https://amy-fx.vercel.app';
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const nativeFetch = window.fetch.bind(window);

  function apiUrl(path) {
    const value = String(path || '').trim();
    if (!value) return DEFAULT_API_BASE;
    const endpoint = value.startsWith('/') ? value : `/${value}`;
    return new URL(endpoint, DEFAULT_API_BASE).href;
  }

  function rewriteApiUrl(value) {
    try {
      const target = new URL(String(value), location.href);
      if (target.origin !== location.origin) return target.href;
      const marker = '/api/';
      const markerIndex = target.pathname.indexOf(marker);
      if (markerIndex < 0) return target.href;
      const endpoint = `${target.pathname.slice(markerIndex)}${target.search}${target.hash}`;
      return apiUrl(endpoint);
    } catch (_) {
      return value;
    }
  }

  window.fetch = function amyFxFetch(input, init) {
    if (input instanceof Request) {
      const rewritten = rewriteApiUrl(input.url);
      if (rewritten !== input.url) return nativeFetch(new Request(rewritten, input), init);
      return nativeFetch(input, init);
    }
    return nativeFetch(rewriteApiUrl(input), init);
  };

  function injectStyles() {
    if (document.getElementById('amy-platform-styles')) return;
    const style = document.createElement('style');
    style.id = 'amy-platform-styles';
    style.textContent = `
      #amy-platform-toast-root{position:fixed;left:12px;right:12px;bottom:calc(88px + env(safe-area-inset-bottom));z-index:2147483000;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none}
      .amy-platform-toast{max-width:520px;width:max-content;min-width:180px;padding:11px 14px;border:1px solid rgba(212,175,55,.45);border-radius:12px;background:rgba(8,8,8,.94);box-shadow:0 12px 34px rgba(0,0,0,.48);color:#fff;font:700 13px/1.4 system-ui,sans-serif;text-align:center;transform:translateY(10px);opacity:0;transition:opacity .18s ease,transform .18s ease;backdrop-filter:blur(12px)}
      .amy-platform-toast.is-visible{transform:translateY(0);opacity:1}
      .amy-platform-toast[data-kind="error"]{border-color:rgba(255,91,91,.65)}
      .amy-platform-toast[data-kind="success"]{border-color:rgba(82,210,115,.65)}
    `;
    document.head.appendChild(style);
  }

  function toast(message, options) {
    injectStyles();
    const opts = options || {};
    let root = document.getElementById('amy-platform-toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'amy-platform-toast-root';
      root.setAttribute('aria-live', 'polite');
      document.body.appendChild(root);
    }
    const node = document.createElement('div');
    node.className = 'amy-platform-toast';
    node.dataset.kind = opts.kind || 'info';
    node.textContent = String(message || 'Amy FX');
    root.appendChild(node);
    requestAnimationFrame(function () { node.classList.add('is-visible'); });
    const duration = Math.max(1200, Number(opts.duration || 2800));
    window.setTimeout(function () {
      node.classList.remove('is-visible');
      window.setTimeout(function () { node.remove(); }, 220);
    }, duration);
    return node;
  }

  function triggerHaptic(pattern) {
    try {
      if ('vibrate' in navigator) navigator.vibrate(pattern || 20);
    } catch (_) {}
  }

  async function copyText(text) {
    const value = String(text == null ? '' : text);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) {}
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return Boolean(ok);
    } catch (_) {
      return false;
    }
  }

  async function share(payload) {
    const data = typeof payload === 'string' ? { text: payload } : (payload || {});
    try {
      if (navigator.share) {
        await navigator.share(data);
        return true;
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return false;
    }
    const fallback = data.url || data.text || data.title || '';
    if (fallback && await copyText(fallback)) {
      toast('Teks disalin.');
      return true;
    }
    return false;
  }

  function normalizeBlob(data, type) {
    if (data instanceof Blob) return data;
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new Blob([data], { type: type || 'application/octet-stream' });
    return new Blob([String(data == null ? '' : data)], { type: type || 'text/plain;charset=utf-8' });
  }

  function saveFile(filename, data, type) {
    const blob = normalizeBlob(data, type);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'amy-fx-file.txt';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    return true;
  }

  function openExternal(url) {
    const value = String(url || '').trim();
    if (!value) return false;
    try {
      const target = new URL(value, location.href);
      if (!/^https?:$/.test(target.protocol) && !/^mailto:$/.test(target.protocol) && !/^tel:$/.test(target.protocol)) return false;
      window.open(target.href, '_blank', 'noopener,noreferrer');
      return true;
    } catch (_) {
      return false;
    }
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    try {
      return await Notification.requestPermission();
    } catch (_) {
      return Notification.permission || 'denied';
    }
  }

  async function notify(title, body, options) {
    if (!('Notification' in window)) return false;
    const opts = options || {};
    let permission = Notification.permission;
    if (permission === 'default' && opts.requestPermission === true) permission = await requestNotificationPermission();
    if (permission !== 'granted') return false;
    const icon = new URL('icons/amy-fx-192.png', appRootUrl).href;
    const targetUrl = new URL(opts.url || './', appRootUrl).href;
    const notificationOptions = {
      body: String(body || ''),
      icon,
      badge: icon,
      tag: opts.tag || undefined,
      data: { url: targetUrl, ...(opts.data || {}) },
      renotify: Boolean(opts.renotify)
    };
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(String(title || 'Amy FX'), notificationOptions);
        return true;
      }
      new Notification(String(title || 'Amy FX'), notificationOptions);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function clearRuntimeCache() {
    if (!('caches' in window)) return false;
    try {
      const names = await caches.keys();
      await Promise.all(names.filter(function (name) {
        return name.indexOf('amyfx-pwa-') === 0;
      }).map(function (name) {
        return caches.delete(name);
      }));
      return true;
    } catch (_) {
      return false;
    }
  }

  const storage = {
    get(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value == null ? fallback : value;
      } catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, String(value)); return true; } catch (_) { return false; }
    },
    remove(key) {
      try { localStorage.removeItem(key); return true; } catch (_) { return false; }
    },
    getJSON(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value == null ? fallback : JSON.parse(value);
      } catch (_) { return fallback; }
    },
    setJSON(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
    }
  };

  const platform = {
    name: 'web',
    version: '1.1.0',
    isIOS,
    isStandalone: standalone,
    isPWA: true,
    appRootUrl: appRootUrl.href,
    appRootPath,
    apiBaseUrl: DEFAULT_API_BASE,
    apiUrl,
    toast,
    notify,
    requestNotificationPermission,
    triggerHaptic,
    copyText,
    share,
    saveFile,
    openExternal,
    clearRuntimeCache,
    storage
  };

  const androidCompat = {
    showAppToast: message => toast(message),
    showToast: message => toast(message),
    triggerHaptic,
    openUrl: openExternal,
    openExternalUrl: openExternal,
    openExternal,
    copyText,
    shareText: text => share({ text: String(text || '') }),
    share,
    saveFile,
    downloadTextFile: (name, text) => saveFile(name, text, 'text/plain;charset=utf-8'),
    showNotification: (title, body) => notify(title, body, { requestPermission: false }),
    notify: (title, body) => notify(title, body, { requestPermission: false }),
    clearCache: clearRuntimeCache,
    getAppVersion: () => 'PWA 1.1.0',
    getPlatform: () => 'pwa',
    isPwa: () => true
  };

  if (!window.Android) {
    window.Android = new Proxy(androidCompat, {
      get(target, property) {
        if (property in target) return target[property];
        return function () { return null; };
      }
    });
  }

  window.AmyPlatform = Object.freeze(platform);
  window.showToast = window.showToast || function (message) { return toast(message); };
  window.triggerHaptic = window.triggerHaptic || triggerHaptic;
  window.dispatchEvent(new CustomEvent('amyfx:platform-ready', { detail: platform }));
})();
