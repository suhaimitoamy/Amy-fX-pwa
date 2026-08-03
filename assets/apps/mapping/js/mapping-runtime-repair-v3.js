import { state } from './main.js';
import { runAnalysis, setCandleFetchedAt } from './api/market-data.js';
import {
  SUPPORTED_MAPPING_TIMEFRAMES,
  timeframeDurationMs
} from './engine/mapping-timeframes.js';

const REQUIRED_TFS = SUPPORTED_MAPPING_TIMEFRAMES;
const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const CLOSE_GRACE_MS = 10_000;
const SOURCE_VALIDATED_TFS = new Set(['M1', 'M5', 'M15', 'M30', 'H1', 'H4']);

let refreshInFlight = null;
let lastRefreshAt = 0;
let watchRepairQueued = false;

function durationMs(tf) {
  return timeframeDurationMs(tf) || 15 * 60_000;
}

function finite(value, fallback = NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function candleOpenMs(candle) {
  const value = finite(candle?.time);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 100_000_000_000 ? value : value * 1000;
}

function marketReference(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const fridayClosed = day === 5 && (hour > 22 || (hour === 22 && minute >= 0));
  const saturday = day === 6;
  const sundayClosed = day === 0 && hour < 22;

  if (!fridayClosed && !saturday && !sundayClosed) {
    return { time: nowMs, marketClosed: false };
  }

  const daysBack = fridayClosed ? 0 : saturday ? 1 : 2;
  return {
    time: Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysBack,
      22, 0, 0, 0
    ),
    marketClosed: true
  };
}

function expectedClosedCandleOpen(tf, nowMs = Date.now()) {
  const normalizedTf = String(tf || '').toUpperCase();
  if (!SOURCE_VALIDATED_TFS.has(normalizedTf)) return null;
  const interval = durationMs(normalizedTf);
  if (!Number.isFinite(interval) || interval <= 0) return null;
  const reference = marketReference(nowMs);
  const safeTime = reference.marketClosed
    ? reference.time
    : reference.time - CLOSE_GRACE_MS;
  return Math.floor(safeTime / interval) * interval - interval;
}

function cachedSeriesIsCurrent(tf = state.tf, nowMs = Date.now()) {
  const normalizedTf = String(tf || '').toUpperCase();
  if (!SOURCE_VALIDATED_TFS.has(normalizedTf)) return null;
  const latest = state.candles?.[normalizedTf]?.at(-1);
  const latestOpen = candleOpenMs(latest);
  const expectedOpen = expectedClosedCandleOpen(normalizedTf, nowMs);
  if (!latestOpen || !Number.isFinite(expectedOpen)) return false;
  return latestOpen >= expectedOpen;
}

function primeCurrentCandleFreshness(nowMs = Date.now()) {
  const status = {};
  for (const tf of REQUIRED_TFS) {
    const normalizedTf = String(tf || '').toUpperCase();
    if (!SOURCE_VALIDATED_TFS.has(normalizedTf)) continue;
    const current = cachedSeriesIsCurrent(normalizedTf, nowMs);
    status[normalizedTf] = current;
    setCandleFetchedAt(normalizedTf, current ? nowMs : 0);
  }
  return status;
}

function latestClosedCandleClose(tf = state.tf) {
  const latest = state.candles?.[tf]?.at(-1);
  const openMs = candleOpenMs(latest);
  if (!openMs) return null;
  return new Date(openMs + durationMs(tf)).toISOString();
}

function publishFreshMappingClock() {
  const intel = window.AmyFXIntel;
  if (!intel?.write || !intel?.read) return;
  const snapshot = state.result?.mappingSnapshot;
  if (!snapshot) return;
  const snapshotTf = snapshot?.timeframe || state.tf;
  const sourceCandleTime = latestClosedCandleClose(snapshotTf);
  if (!sourceCandleTime) return;
  const previous = intel.read()?.mapping || {};
  intel.write('mapping', {
    ...previous,
    timeframe: snapshotTf,
    sourceCandleTime,
    sourceCandleAt: sourceCandleTime,
    capturedAt: snapshot?.capturedAt || previous.capturedAt,
    analyzedAt: snapshot?.freshness?.analyzedAt || previous.analyzedAt,
    dataStale: Boolean(snapshot?.data?.stale),
    source: snapshot?.source || previous.source || 'AMY_MAPPING_SINGLE_AUTHORITY_V3'
  });
  window.AmyFXMappingConsistency?.sync?.();
  window.AmyFXBlueprintHotfix?.repairFreshnessUi?.();
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

async function refreshMapping(reason = 'manual', force = false) {
  if (document.hidden) return false;
  if (refreshInFlight) return refreshInFlight;

  const sourceStatus = primeCurrentCandleFreshness();
  const selectedTf = String(state.tf || '').toUpperCase();
  const selectedHasData = Boolean(state.candles?.[selectedTf]?.length);
  const selectedNeedsRefresh = !selectedHasData || sourceStatus[selectedTf] === false;

  if (!force && !selectedNeedsRefresh && Date.now() - lastRefreshAt < REFRESH_INTERVAL_MS) {
    publishFreshMappingClock();
    scheduleWatchRepair();
    return true;
  }

  refreshInFlight = (async () => {
    primeCurrentCandleFreshness();
    await runAnalysis(state.tf);
    window.dispatchEvent(new CustomEvent('amyfx:candles-updated', {
      detail: {
        reason,
        timeframes: REQUIRED_TFS.filter(tf => state.candles?.[tf]?.length),
        updatedAt: Date.now()
      }
    }));
    publishFreshMappingClock();
    scheduleWatchRepair();
    lastRefreshAt = Date.now();
    return true;
  })().catch(error => {
    console.error('Amy FX mapping freshness repair failed', error);
    scheduleWatchRepair();
    return false;
  }).finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

function boot() {
  const app = document.getElementById('app');
  if (app && typeof MutationObserver === 'function') {
    new MutationObserver(scheduleWatchRepair).observe(app, { childList: true, subtree: true });
  }
  window.addEventListener('amyfx:entry-watch-updated', scheduleWatchRepair);
  window.addEventListener('amyfx:market-update', scheduleWatchRepair);
  window.addEventListener('focus', () => refreshMapping('focus', true));
  window.addEventListener('online', () => refreshMapping('online', true));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshMapping('visible', true);
  });
  setInterval(() => refreshMapping('periodic'), REFRESH_INTERVAL_MS);
  scheduleWatchRepair();
  setTimeout(() => refreshMapping('startup', true), 250);
}

window.AmyFXMappingRuntimeRepair = Object.freeze({
  version: '4.0.0',
  refresh: refreshMapping,
  publishFreshMappingClock,
  repairEntryWatchVisibility,
  latestClosedCandleClose,
  cachedSeriesIsCurrent,
  expectedClosedCandleOpen,
  primeCurrentCandleFreshness
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
