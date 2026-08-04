import { state } from './main.js';
import { fetchTf } from './api/market-data.js';
import {
  TIMEFRAME_SECONDS,
  expectedClosedCandleOpenTime
} from './engine/mapping-timeframes.js';

const STORAGE_KEY = 'amy_entry_watch_state_v3';
const CLOSE_GRACE_MS = 12000;
const FAILURE_BACKOFF_MS = 60000;

let refreshRunning = false;
let nextCloseTimer = 0;
const lastAttemptAt = new Map();

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timestampMs(value) {
  const number = finite(value, 0);
  return number > 100000000000 ? number : number * 1000;
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

function trackedTimeframes() {
  const requested = new Set([String(state.tf || 'M15').toUpperCase()]);
  const watch = currentWatch();
  if (watch && !watch.terminal && watch.active) {
    if (watch.triggerTf) requested.add(String(watch.triggerTf).toUpperCase());
    if (watch.sourceTf) requested.add(String(watch.sourceTf).toUpperCase());
  }
  return [...requested].filter(tf => TIMEFRAME_SECONDS[tf]);
}

function expectedClosedOpenTime(tf, now = Date.now()) {
  return expectedClosedCandleOpenTime(tf, now);
}

function latestClosedOpenTime(tf) {
  const values = Array.isArray(state?.candles?.[tf]) ? state.candles[tf] : [];
  const latest = [...values].reverse().find(candle => candle?.isClosed !== false);
  return finite(latest?.time, 0);
}

function sourceSignature(tf) {
  const values = Array.isArray(state?.candles?.[tf]) ? state.candles[tf] : [];
  const closed = values.filter(candle => candle?.isClosed !== false);
  const latest = closed.at(-1);
  return JSON.stringify({
    tf,
    count: closed.length,
    time: finite(latest?.time, 0),
    open: finite(latest?.open, 0),
    high: finite(latest?.high, 0),
    low: finite(latest?.low, 0),
    close: finite(latest?.close, 0)
  });
}

function dueTimeframes(now = Date.now()) {
  return trackedTimeframes()
    .filter(tf => latestClosedOpenTime(tf) < expectedClosedOpenTime(tf, now))
    .filter(tf => now - finite(lastAttemptAt.get(tf), 0) >= FAILURE_BACKOFF_MS);
}

function nextBoundaryMs(tf, now = Date.now()) {
  const duration = Number(TIMEFRAME_SECONDS[tf]) * 1000;
  if (!(duration > 0)) return Number.POSITIVE_INFINITY;
  return Math.floor(now / duration) * duration + duration + CLOSE_GRACE_MS;
}

function scheduleNextClosedCandle() {
  clearTimeout(nextCloseTimer);
  const timeframes = trackedTimeframes();
  if (!timeframes.length) return;
  const now = Date.now();
  const next = Math.min(...timeframes.map(tf => nextBoundaryMs(tf, now)));
  const delay = Math.max(1000, next - now);
  nextCloseTimer = window.setTimeout(async () => {
    await refreshDueCandles('scheduled-close');
    scheduleNextClosedCandle();
  }, delay);
}

async function refreshDueCandles(reason = 'manual') {
  if (document.hidden || refreshRunning) return false;
  const due = dueTimeframes();
  if (!due.length) return false;

  refreshRunning = true;
  const updated = [];
  try {
    for (const tf of due) {
      const before = sourceSignature(tf);
      lastAttemptAt.set(tf, Date.now());
      try {
        await fetchTf(tf);
        const after = sourceSignature(tf);
        if (after !== before) {
          updated.push(tf);
          lastAttemptAt.delete(tf);
        }
      } catch (_) {
        // Keep the last valid closed candle and retry only after the backoff.
      }
    }
  } finally {
    refreshRunning = false;
  }

  if (!updated.length) return false;
  window.dispatchEvent(new CustomEvent('amyfx:candles-updated', {
    detail: {
      timeframes: updated,
      reason,
      source: 'CLOSED_CANDLE_COORDINATOR',
      sourceSignatures: Object.fromEntries(updated.map(tf => [tf, sourceSignature(tf)])),
      updatedAt: Date.now()
    }
  }));
  return true;
}

function start() {
  refreshDueCandles('startup');
  scheduleNextClosedCandle();
  window.addEventListener('amyfx:entry-watch-updated', scheduleNextClosedCandle);
  window.addEventListener('amyfx:mapping-state-change', scheduleNextClosedCandle);
  window.addEventListener('amyfx:candle-refresh-request', event => {
    refreshDueCandles(event?.detail?.reason || 'manual').finally(scheduleNextClosedCandle);
  });
}

window.AmyFXCandleRefreshCoordinator = Object.freeze({
  version: '2.0.0',
  refresh: refreshDueCandles,
  schedule: scheduleNextClosedCandle,
  trackedTimeframes,
  sourceSignature,
  nextBoundaryMs
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
