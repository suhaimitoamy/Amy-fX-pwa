import { state } from './main.js';
import { runAnalysis } from './api/market-data.js';
import {
  SUPPORTED_MAPPING_TIMEFRAMES,
  timeframeDurationMs
} from './engine/mapping-timeframes.js';

const REQUIRED_TFS = SUPPORTED_MAPPING_TIMEFRAMES;
const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

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

function latestClosedCandleClose(tf = state.tf) {
  const latest = state.candles?.[tf]?.at(-1);
  const openMs = finite(latest?.time) * 1000;
  if (!Number.isFinite(openMs) || openMs <= 0) return null;
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
  if (!force && Date.now() - lastRefreshAt < REFRESH_INTERVAL_MS) {
    publishFreshMappingClock();
    scheduleWatchRepair();
    return true;
  }

  refreshInFlight = (async () => {
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
  version: '3.0.0',
  refresh: refreshMapping,
  publishFreshMappingClock,
  repairEntryWatchVisibility,
  latestClosedCandleClose
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
