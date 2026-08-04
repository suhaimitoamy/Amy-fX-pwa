(function () {
  'use strict';

  if (window.__amyFxLivePriceDisplayOnlyInstalled) return;
  window.__amyFxLivePriceDisplayOnlyInstalled = true;

  const HARD_TTL_MS = 180000;

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

  function updatePriceNodes(price) {
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
  }

  function handlePrice(event) {
    const tick = validTick(event?.detail || {});
    if (!tick) return;

    // Closed-candle Mapping must not consume live ticks. Handle the visual price
    // here and stop the older runtime listener from rebuilding Mapping state.
    event.stopImmediatePropagation();

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

  window.addEventListener('amyfx:twelvedata-price', handlePrice, true);

  window.AmyFXLivePriceDisplayOnly = Object.freeze({
    version: '1.0.0',
    lastTickAt: () => Number(window.__amyFxDisplayLastTickAt || 0),
    updatePriceNodes
  });
})();
