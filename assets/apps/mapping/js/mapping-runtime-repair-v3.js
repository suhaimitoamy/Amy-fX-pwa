import { state } from './main.js';
import { runAnalysis as runEngineAnalysis, setCandleFetchedAt } from './api/market-data.js';
import {
  SUPPORTED_MAPPING_TIMEFRAMES,
  timeframeDurationMs
} from './engine/mapping-timeframes.js';

const REQUIRED_TFS = SUPPORTED_MAPPING_TIMEFRAMES;
let refreshInFlight = null;
let watchRepairQueued = false;
const lastAnalyzedSignature = new Map();

function finite(value, fallback = NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timestampMs(value) {
  const numeric = finite(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric > 100000000000 ? numeric : numeric * 1000;
}

function durationMs(tf) {
  return timeframeDurationMs(tf) || 15 * 60000;
}

function closedCandles(tf) {
  return (Array.isArray(state.candles?.[tf]) ? state.candles[tf] : [])
    .filter(candle => candle?.isClosed !== false)
    .filter(candle => [candle?.open, candle?.high, candle?.low, candle?.close]
      .map(Number)
      .every(Number.isFinite));
}

function sourceSignature(tf = state.tf) {
  const normalizedTf = String(tf || state.tf || 'M15').toUpperCase();
  const values = closedCandles(normalizedTf);
  const latest = values.at(-1);
  if (!latest) return `${normalizedTf}:EMPTY`;
  return JSON.stringify({
    tf: normalizedTf,
    count: values.length,
    time: timestampMs(latest.time),
    open: Number(latest.open),
    high: Number(latest.high),
    low: Number(latest.low),
    close: Number(latest.close)
  });
}

function markCachedSeriesUsable(nowMs = Date.now()) {
  const status = {};
  for (const tf of REQUIRED_TFS) {
    const hasClosedData = closedCandles(tf).length > 0;
    status[tf] = hasClosedData;
    // The fetch TTL is not an analysis validity gate. A valid historical closed
    // candle remains analyzable even when the provider has not produced a newer bar.
    if (hasClosedData) setCandleFetchedAt(tf, nowMs);
  }
  return status;
}

function latestClosedCandleClose(tf = state.tf) {
  const latest = closedCandles(tf).at(-1);
  const openMs = timestampMs(latest?.time);
  if (!openMs) return null;
  return new Date(openMs + durationMs(tf)).toISOString();
}

function publishFreshMappingClock() {
  const intel = window.AmyFXIntel;
  if (!intel?.write || !intel?.read) return false;
  const result = state.result;
  if (!result) return false;
  const snapshot = result.mappingSnapshot;
  const snapshotTf = snapshot?.timeframe || result.tf || state.tf;
  const sourceCandleTime = latestClosedCandleClose(snapshotTf);
  if (!sourceCandleTime) return false;
  const previous = intel.read()?.mapping || {};
  const next = {
    ...previous,
    timeframe: snapshotTf,
    sourceCandleTime,
    sourceCandleAt: sourceCandleTime,
    capturedAt: snapshot?.capturedAt || previous.capturedAt,
    analyzedAt: snapshot?.freshness?.analyzedAt || sourceCandleTime,
    dataStale: false,
    source: snapshot?.source || previous.source || 'AMY_MAPPING_CLOSED_CANDLE_AUTHORITY_V4'
  };
  const previousSignature = JSON.stringify({
    timeframe: previous.timeframe,
    sourceCandleTime: previous.sourceCandleTime,
    analyzedAt: previous.analyzedAt,
    source: previous.source
  });
  const nextSignature = JSON.stringify({
    timeframe: next.timeframe,
    sourceCandleTime: next.sourceCandleTime,
    analyzedAt: next.analyzedAt,
    source: next.source
  });
  if (previousSignature === nextSignature) return false;
  intel.write('mapping', next);
  window.AmyFXMappingConsistency?.sync?.();
  return true;
}

function repairEntryWatchVisibility() {
  watchRepairQueued = false;
  if (!state?.result) document.getElementById('amy-entry-watch-card')?.remove();
}

function scheduleWatchRepair() {
  if (watchRepairQueued) return;
  watchRepairQueued = true;
  requestAnimationFrame(repairEntryWatchVisibility);
}

async function refreshMapping(reason = 'manual', force = false, requestedTf = state.tf) {
  if (document.hidden) return false;
  const tf = String(requestedTf || state.tf || 'M15').toUpperCase();
  if (refreshInFlight?.tf === tf) return refreshInFlight.promise;

  markCachedSeriesUsable();
  const beforeSignature = sourceSignature(tf);
  const previousResult = state.result;
  const previousTf = previousResult?.tf || state.tf;
  if (
    !force
    && previousResult
    && previousTf === tf
    && lastAnalyzedSignature.get(tf) === beforeSignature
  ) {
    publishFreshMappingClock();
    scheduleWatchRepair();
    return true;
  }

  const operation = { tf, promise: null };
  operation.promise = (async () => {
    await runEngineAnalysis(tf);

    // A provider failure must not replace a previously valid closed-candle result.
    if (state.result?.dataStale && previousResult && closedCandles(tf).length) {
      state.result = previousResult;
      state.tf = previousTf;
      window.render?.();
    } else {
      lastAnalyzedSignature.set(tf, sourceSignature(tf));
      window.dispatchEvent(new CustomEvent('amyfx:mapping-state-change', {
        detail: {
          reason,
          timeframe: tf,
          sourceSignature: sourceSignature(tf),
          sourceCandleTime: latestClosedCandleClose(tf)
        }
      }));
    }

    publishFreshMappingClock();
    scheduleWatchRepair();
    return true;
  })().catch(error => {
    console.error('Amy FX closed-candle Mapping refresh failed', error);
    if (previousResult) {
      state.result = previousResult;
      state.tf = previousTf;
      window.render?.();
    }
    scheduleWatchRepair();
    return false;
  }).finally(() => {
    if (refreshInFlight === operation) refreshInFlight = null;
  });

  refreshInFlight = operation;
  return operation.promise;
}

function onCandlesUpdated(event) {
  const timeframes = Array.isArray(event?.detail?.timeframes)
    ? event.detail.timeframes.map(value => String(value).toUpperCase())
    : [];
  const selectedTf = String(state.tf || 'M15').toUpperCase();
  if (timeframes.length && !timeframes.includes(selectedTf)) return;
  const nextSignature = sourceSignature(selectedTf);
  if (lastAnalyzedSignature.get(selectedTf) === nextSignature) return;
  refreshMapping('closed-candle-update', false, selectedTf);
}

function boot() {
  // Inline timeframe buttons call window.runAnalysis. Route them through the
  // closed-candle authority so old-but-valid candles never become DATA USANG.
  window.runAnalysis = tf => refreshMapping('user-timeframe', true, tf);
  window.addEventListener('amyfx:candles-updated', onCandlesUpdated);
  window.addEventListener('amyfx:mapping-refresh-request', event => {
    refreshMapping(event?.detail?.reason || 'manual', true, event?.detail?.timeframe || state.tf);
  });
  scheduleWatchRepair();

  if (!state.result) {
    setTimeout(() => refreshMapping('startup', true, state.tf), 250);
  } else {
    lastAnalyzedSignature.set(String(state.result.tf || state.tf).toUpperCase(), sourceSignature(state.result.tf || state.tf));
    publishFreshMappingClock();
  }
}

window.AmyFXMappingRuntimeRepair = Object.freeze({
  version: '5.0.0',
  refresh: refreshMapping,
  publishFreshMappingClock,
  repairEntryWatchVisibility,
  latestClosedCandleClose,
  sourceSignature,
  markCachedSeriesUsable
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
