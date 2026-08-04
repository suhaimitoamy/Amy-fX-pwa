(function () {
  'use strict';

  const ROUTE_KEY = 'amyfx.notification.route';
  const CONSUMED_URL_KEY = 'amyfx.notification.consumed_url';
  const VALID_ROUTES = new Set(['Dashboard', 'Analyze', 'Setups', 'History', 'Settings']);
  const RETRY_DELAYS_MS = [0, 50, 120, 250, 500, 900, 1500, 2500];

  let retryTimers = [];

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

  function consumePendingRoute() {
    const pending = pendingRoute();
    if (!pending) return true;

    writeStorage(ROUTE_KEY, pending.route);
    if (typeof window.setTab !== 'function') return false;

    window.setTab(pending.route);
    removeStorage(ROUTE_KEY);
    writeStorage(CONSUMED_URL_KEY, String(location.href || ''));
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
    schedule: scheduleRouteConsumption
  });

  document.addEventListener('DOMContentLoaded', scheduleRouteConsumption, { once: true });
  window.addEventListener('pageshow', scheduleRouteConsumption);
  window.addEventListener('hashchange', scheduleRouteConsumption);
  window.addEventListener('popstate', scheduleRouteConsumption);

  if (document.readyState !== 'loading') scheduleRouteConsumption();
})();
