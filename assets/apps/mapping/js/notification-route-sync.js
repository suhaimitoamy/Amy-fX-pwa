(function () {
  'use strict';

  const ROUTE_KEY = 'amyfx.notification.route';
  const CONSUMED_URL_KEY = 'amyfx.notification.consumed_url';
  const ENTRY_CARD_ID = 'amy-entry-watch-card';
  const VALID_ROUTES = new Set(['Dashboard', 'Analyze', 'Setups', 'History', 'Settings']);
  const RETRY_DELAYS_MS = [0, 50, 120, 250, 500, 900, 1500, 2500, 4000, 6500];

  let retryTimers = [];
  let focusObserver = null;
  let pendingEntryFocus = false;

  function readStorage(key) {
    try { return localStorage.getItem(key) || ''; } catch (_) { return ''; }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function removeStorage(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function routeFromLocation() {
    const currentUrl = String(location.href || '');
    if (currentUrl && readStorage(CONSUMED_URL_KEY) === currentUrl) return '';

    let route = '';
    try { route = new URLSearchParams(location.search || '').get('route') || ''; } catch (_) {}
    if (!route) {
      try { route = decodeURIComponent((location.hash || '').replace(/^#/, '')); } catch (_) {}
    }
    return VALID_ROUTES.has(route) ? route : '';
  }

  function pendingRoute() {
    const stored = readStorage(ROUTE_KEY);
    if (VALID_ROUTES.has(stored)) return { route: stored, source: 'ANDROID_PENDING' };
    const located = routeFromLocation();
    return located ? { route: located, source: 'DEEP_LINK_URL' } : null;
  }

  function installFocusStyle() {
    if (document.getElementById('amy-notification-focus-style')) return;
    const style = document.createElement('style');
    style.id = 'amy-notification-focus-style';
    style.textContent = `
      #${ENTRY_CARD_ID}.amy-notification-focus {
        outline: 2px solid rgba(255, 205, 64, .95);
        outline-offset: 4px;
        animation: amyNotificationPulse 1s ease-in-out 3;
        scroll-margin-top: 18px;
      }
      @keyframes amyNotificationPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(255, 205, 64, 0); }
        50% { box-shadow: 0 0 0 8px rgba(255, 205, 64, .18); }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function focusEntryWatchCard() {
    if (!pendingEntryFocus) return true;
    const card = document.getElementById(ENTRY_CARD_ID);
    if (!card) return false;

    pendingEntryFocus = false;
    installFocusStyle();
    card.classList.add('amy-notification-focus');
    try { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) { card.scrollIntoView(); }
    window.setTimeout(() => card.classList.remove('amy-notification-focus'), 4200);
    focusObserver?.disconnect();
    focusObserver = null;
    return true;
  }

  function watchForEntryCard() {
    if (focusEntryWatchCard() || focusObserver || !document.documentElement) return;
    focusObserver = new MutationObserver(() => focusEntryWatchCard());
    focusObserver.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => {
      focusObserver?.disconnect();
      focusObserver = null;
      focusEntryWatchCard();
    }, 8000);
  }

  function consumePendingRoute() {
    const pending = pendingRoute();
    if (!pending) return true;

    writeStorage(ROUTE_KEY, pending.route);
    if (typeof window.setTab !== 'function') return false;

    window.setTab(pending.route);
    removeStorage(ROUTE_KEY);
    writeStorage(CONSUMED_URL_KEY, String(location.href || ''));

    if (pending.route === 'Analyze') {
      pendingEntryFocus = true;
      window.requestAnimationFrame(() => watchForEntryCard());
    }
    return true;
  }

  function clearRetries() {
    retryTimers.forEach(timer => window.clearTimeout(timer));
    retryTimers = [];
  }

  function scheduleRouteConsumption() {
    clearRetries();
    RETRY_DELAYS_MS.forEach(delay => {
      retryTimers.push(window.setTimeout(() => {
        if (consumePendingRoute()) clearRetries();
      }, delay));
    });
  }

  window.AmyFXNotificationRoute = Object.freeze({
    consume: consumePendingRoute,
    schedule: scheduleRouteConsumption,
    focusEntryWatch: function () {
      pendingEntryFocus = true;
      watchForEntryCard();
    }
  });

  document.addEventListener('DOMContentLoaded', scheduleRouteConsumption, { once: true });
  window.addEventListener('pageshow', scheduleRouteConsumption);
  window.addEventListener('focus', scheduleRouteConsumption);
  window.addEventListener('hashchange', scheduleRouteConsumption);
  window.addEventListener('popstate', scheduleRouteConsumption);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) scheduleRouteConsumption();
  });

  if (document.readyState !== 'loading') scheduleRouteConsumption();
})();
