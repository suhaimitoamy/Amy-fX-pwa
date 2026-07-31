import { state } from './main.js';
import { fetchTf } from './api/market-data.js';
import {
  TIMEFRAME_SECONDS,
  expectedClosedCandleOpenTime
} from './engine/mapping-timeframes.js';

const STORAGE_KEY = 'amy_entry_watch_state_v3';
const CHECK_MS = 15_000;
const FAILURE_BACKOFF_MS = 60_000;

let refreshRunning = false;
const lastAttemptAt = new Map();

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readStoredWatch() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch (_) {
    return null;
  }
}

function currentWatch() {
  return state?.result?.entryWatch || readStoredWatch();
}

function shouldTrack(watch) {
  if (!watch || watch.terminal || !watch.active) return false;
  return Boolean(watch.sourceTf || watch.triggerTf);
}

function expectedClosedOpenTime(tf, nowMs = Date.now()) {
  return expectedClosedCandleOpenTime(tf, nowMs);
}

function latestClosedOpenTime(tf) {
  return finite(state?.candles?.[tf]?.at(-1)?.time, 0);
}

function dueTimeframes() {
  const watch = currentWatch();
  if (!shouldTrack(watch)) return [];

  const requested = new Set([watch.triggerTf, watch.sourceTf]);
  const now = Date.now();
  return [...requested]
    .filter(tf => TIMEFRAME_SECONDS[tf])
    .filter(tf => latestClosedOpenTime(tf) < expectedClosedOpenTime(tf, now))
    .filter(tf => now - finite(lastAttemptAt.get(tf), 0) >= FAILURE_BACKOFF_MS);
}

async function refreshDueCandles() {
  if (document.hidden || refreshRunning) return;
  const due = dueTimeframes();
  if (!due.length) return;

  refreshRunning = true;
  const updated = [];
  try {
    for (const tf of due) {
      lastAttemptAt.set(tf, Date.now());
      try {
        await fetchTf(tf);
        updated.push(tf);
        lastAttemptAt.delete(tf);
      } catch (_) {
        // Mapping keeps the last valid candle cache and retries after the backoff.
      }
    }
  } finally {
    refreshRunning = false;
  }

  if (updated.length) {
    window.dispatchEvent(new CustomEvent('amyfx:candles-updated', {
      detail: { timeframes: updated, source: 'SHARED_CANDLE_COORDINATOR' }
    }));
  }
}

function start() {
  refreshDueCandles();
  window.setInterval(refreshDueCandles, CHECK_MS);
  window.addEventListener('amyfx:entry-watch-updated', refreshDueCandles);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshDueCandles();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
