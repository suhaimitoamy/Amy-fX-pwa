import { state, TF } from './main.js';
import { sanitizeCandleValues } from './integrity/mapping-integrity-core.js';

const TWELVE_DATA_PATH = '/api/twelvedata';
const qualityByInterval = {};
const originalFetch = window.fetch.bind(window);

function interceptCandleFeed() {
  if (window.__amyMappingCandleIntegrityFetch) return;
  window.__amyMappingCandleIntegrityFetch = true;

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const rawUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const url = new URL(rawUrl, location.href);
      const outputSize = Number(url.searchParams.get('outputsize') || 0);
      if (!url.pathname.endsWith(TWELVE_DATA_PATH) || outputSize <= 1 || !response.ok) return response;

      const payload = await response.clone().json();
      if (!Array.isArray(payload?.values)) return response;
      const interval = url.searchParams.get('interval') || payload.meta?.interval || '15min';
      const cleaned = sanitizeCandleValues(payload.values, interval);
      qualityByInterval[interval] = cleaned.quality;
      state.candleMeta = { ...(state.candleMeta || {}), [interval]: cleaned.quality };

      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify({
        ...payload,
        values: cleaned.values,
        amy_quality: cleaned.quality
      }), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (_) {
      return response;
    }
  };
}

function patchHeaderFreshness() {
  const connection = document.getElementById('conn');
  if (!connection) return false;
  const tf = state.tf || 'M15';
  const source = state.result?.amySmcD?.sourceCandle;
  const quality = qualityByInterval[TF[tf]] || state.candleMeta?.[TF[tf]] || null;
  const stale = Boolean(
    state.result?.dataStale
    || state.result?.dataDegraded
    || state.candleSourceState?.[tf]?.delayed
    || state.candleSourceState?.[tf]?.providerStale
  );
  connection.textContent = '●';
  connection.classList.toggle('stale', stale);
  connection.setAttribute(
    'aria-label',
    `${state.conn} · Mapping ${tf} ${stale ? 'LAST VALID CLOSED CANDLE' : 'CLOSED CANDLE'} · source ${source?.time || '-'}${quality ? ` · ${quality.cleanCount}/${quality.rawCount}` : ''}`
  );
  return true;
}

function boot() {
  patchHeaderFreshness();
  [
    'amyfx:candles-updated',
    'amyfx:mapping-state-change',
    'amyfx:mapping-ui-rendered'
  ].forEach(name => window.addEventListener(name, patchHeaderFreshness));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) patchHeaderFreshness();
  });
}

interceptCandleFeed();
window.AmyMappingIntegrity = Object.freeze({
  version: '2.0.0',
  qualityByInterval,
  reconcile: patchHeaderFreshness,
  patch: patchHeaderFreshness,
  mappingRecomputeOnLiveTick: false
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
