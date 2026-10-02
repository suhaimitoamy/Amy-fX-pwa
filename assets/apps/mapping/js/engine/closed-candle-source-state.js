import {
  expectedClosedCandleOpenTime,
  normalizeMappingTimeframe,
  timeframeDurationMs
} from './mapping-timeframes.js';

const ALLOWED_LAG_BARS = Object.freeze({
  M1: 1,
  M5: 0,
  M15: 0,
  M30: 0,
  H1: 0,
  H4: 1,
  D1: 2,
  W1: 1
});

const BLOCKING_DELAY_TIMEFRAMES = new Set([
  'M1', 'M5', 'M15', 'M30', 'H1'
]);

function timestampSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric > 10_000_000_000
    ? Math.floor(numeric / 1000)
    : Math.floor(numeric);
}

function validClosedCandle(candle) {
  if (!candle || candle.isClosed === false) return false;
  const values = [candle.open, candle.high, candle.low, candle.close].map(Number);
  if (!values.every(Number.isFinite)) return false;
  const [open, high, low, close] = values;
  return open > 0
    && high >= Math.max(open, close, low)
    && low <= Math.min(open, close, high)
    && timestampSeconds(candle.time) > 0;
}

function marketLikelyClosed(nowMs) {
  const date = new Date(nowMs);
  const day = date.getUTCDay();
  const hour = date.getUTCHours();
  return day === 6 || (day === 0 && hour < 22);
}

export function closedSourceCandles(candles) {
  return (Array.isArray(candles) ? candles : [])
    .filter(validClosedCandle)
    .sort((a, b) => timestampSeconds(a.time) - timestampSeconds(b.time));
}

export function inspectClosedCandleSource(
  timeframe,
  candles,
  {
    nowMs = Date.now(),
    graceMs = 10_000,
    allowedLagBars = null
  } = {}
) {
  const tf = normalizeMappingTimeframe(timeframe);
  const values = closedSourceCandles(candles);
  const latest = values.at(-1) || null;
  const latestOpen = timestampSeconds(latest?.time);
  const expectedOpen = expectedClosedCandleOpenTime(tf, nowMs, graceMs);
  const durationSeconds = Math.max(1, Math.floor(timeframeDurationMs(tf) / 1000));
  const lagSeconds = latestOpen && expectedOpen
    ? Math.max(0, expectedOpen - latestOpen)
    : Number.POSITIVE_INFINITY;
  const lagBars = Number.isFinite(lagSeconds)
    ? Math.ceil(lagSeconds / durationSeconds)
    : Number.POSITIVE_INFINITY;
  const allowance = Number.isFinite(Number(allowedLagBars))
    ? Math.max(0, Number(allowedLagBars))
    : (ALLOWED_LAG_BARS[tf] ?? 0);
  const marketClosed = marketLikelyClosed(nowMs);
  const available = Boolean(latest);
  const current = Boolean(
    available
    && (marketClosed || !expectedOpen || lagBars <= allowance)
  );
  const delayed = available && !current;
  const blockingDelayed = delayed && BLOCKING_DELAY_TIMEFRAMES.has(tf);
  return {
    timeframe: tf,
    available,
    current,
    delayed,
    blockingDelayed,
    marketClosed,
    count: values.length,
    latest,
    latestOpen,
    expectedOpen,
    lagSeconds,
    lagBars,
    allowedLagBars: allowance,
    status: !available
      ? 'UNAVAILABLE'
      : current
        ? 'CURRENT'
        : 'PROVIDER_DELAYED'
  };
}

export function assertCurrentClosedCandleSource(timeframe, candles, options = {}) {
  const state = inspectClosedCandleSource(timeframe, candles, options);
  if (!state.available) {
    throw new Error(`Candle ${state.timeframe} kosong setelah validasi closed-candle.`);
  }
  if (state.blockingDelayed) {
    throw new Error(
      `Candle ${state.timeframe} tertinggal ${state.lagBars} bar; `
      + `latest=${state.latestOpen}, expected=${state.expectedOpen}.`
    );
  }
  return state;
}

export const CLOSED_CANDLE_SOURCE_POLICY = Object.freeze({
  allowedLagBars: ALLOWED_LAG_BARS,
  blockingDelayTimeframes: Object.freeze([...BLOCKING_DELAY_TIMEFRAMES])
});
