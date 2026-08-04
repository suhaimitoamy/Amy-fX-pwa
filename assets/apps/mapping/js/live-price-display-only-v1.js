(function () {
  'use strict';

  if (window.__amyFxLivePriceDisplayOnlyInstalled) return;
  window.__amyFxLivePriceDisplayOnlyInstalled = true;

  const HARD_TTL_MS = 180000;
  const LIVE_LABEL_PATTERN = /^harga\s+(?:saat\s+ini|live)$/i;
  let lifecycleController = null;

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function timestampMs(value) {
    const numeric = number(value);
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

  function validTick(detail) {
    const price = number(detail?.price);
    const capturedAt = timestampMs(detail?.timestamp || detail?.capturedAt);
    const age = capturedAt ? Date.now() - capturedAt : Number.POSITIVE_INFINITY;
    return Number.isFinite(price)
      && price > 0
      && capturedAt > 0
      && age <= HARD_TTL_MS
      && age >= -60000
      ? { price, capturedAt }
      : null;
  }

  function priceText(price) {
    return Number(price).toFixed(2);
  }

  function markSemanticLivePriceNodes(root = document) {
    root.querySelectorAll?.(
      '[data-execution-plan-card] .execution-detail-grid > div, .break-box, .num'
    ).forEach(container => {
      const label = String(container.querySelector('small')?.textContent || '').trim();
      if (!LIVE_LABEL_PATTERN.test(label)) return;
      const value = container.querySelector('strong');
      if (value) value.setAttribute('data-live-price', '');
    });
  }

  function currentPrice() {
    const runtime = Number(window.state?.price || 0);
    if (Number.isFinite(runtime) && runtime > 0) return runtime;
    try {
      const stored = Number(localStorage.getItem('last_price') || 0);
      return Number.isFinite(stored) && stored > 0 ? stored : NaN;
    } catch (_) {
      return NaN;
    }
  }

  function updatePriceNodes(price = currentPrice()) {
    if (!Number.isFinite(Number(price)) || Number(price) <= 0) return false;
    markSemanticLivePriceNodes();
    const formatted = priceText(price);
    document.querySelectorAll('.price, [data-live-price]').forEach(node => {
      const prefix = node.classList.contains('price') ? '$' : '';
      const next = `${prefix}${formatted}`;
      if (node.textContent !== next) node.textContent = next;
    });
    document.querySelectorAll('.sticky-price').forEach(node => {
      const next = `$${formatted}`;
      if (node.textContent !== next) node.textContent = next;
    });
    return true;
  }

  function syncAfterRender() {
    markSemanticLivePriceNodes();
    updatePriceNodes();
  }

  function handlePrice(event) {
    const tick = validTick(event?.detail || {});
    if (!tick) return;

    // Paint only display fields. Mapping, levels, lifecycle, and execution
    // authority remain bound to closed candles and are never recomputed here.
    window.__amyFxDisplayLastTickAt = tick.capturedAt;
    try {
      localStorage.setItem('last_ws_tick_at', String(tick.capturedAt));
      localStorage.setItem('last_price', String(tick.price));
    } catch (_) {}

    if (window.state && typeof window.state === 'object') {
      window.state.price = tick.price;
      window.state.conn = 'Connected';
    }

    updatePriceNodes(tick.price);
    const connection = document.getElementById('conn');
    if (connection) {
      connection.textContent = '●';
      connection.className = 'status on';
    }

    window.dispatchEvent(new CustomEvent('amyfx:live-price-display', {
      detail: { price: tick.price, capturedAt: tick.capturedAt }
    }));
  }

  function stop() {
    lifecycleController?.abort();
    lifecycleController = null;
  }

  function start() {
    if (lifecycleController) return;
    lifecycleController = new AbortController();
    const signal = lifecycleController.signal;
    window.addEventListener('amyfx:twelvedata-price', handlePrice, { capture: true, signal });
    [
      'amyfx:mapping-ui-rendered',
      'amyfx:market-intent-rendered',
      'amyfx:mapping-state-change',
      'amyfx:entry-watch-updated'
    ].forEach(name => window.addEventListener(name, syncAfterRender, { signal }));
    window.addEventListener('pagehide', stop, { once: true, signal });
    syncAfterRender();
  }

  window.addEventListener('pageshow', event => {
    if (event.persisted) start();
  });

  window.AmyFXLivePriceDisplayOnly = Object.freeze({
    version: '3.0.0',
    lastTickAt: () => Number(window.__amyFxDisplayLastTickAt || 0),
    markSemanticLivePriceNodes,
    updatePriceNodes,
    start,
    stop
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
