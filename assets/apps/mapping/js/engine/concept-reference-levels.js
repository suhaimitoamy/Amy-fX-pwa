import {
  cleanConceptCandles,
  conceptAtrAtClean,
  conceptNumber
} from './concept-candles.js';

const DAY_MS = 86_400_000;

function timestampMs(value) {
  const numeric = conceptNumber(value);
  if (!Number.isFinite(numeric)) return NaN;
  return numeric > 10_000_000_000 ? numeric : numeric * 1000;
}

function utcDayStart(value) {
  const ms = timestampMs(value);
  if (!Number.isFinite(ms)) return NaN;
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function sundayWeekStart(dayStartMs) {
  if (!Number.isFinite(dayStartMs)) return NaN;
  return dayStartMs - new Date(dayStartMs).getUTCDay() * DAY_MS;
}

function cleanDailyCandles(candles) {
  const rows = cleanConceptCandles(candles)
    .map(candle => ({ ...candle, dayStart: utcDayStart(candle.time) }))
    .filter(candle => Number.isFinite(candle.dayStart))
    .sort((a, b) => a.dayStart - b.dayStart);
  const unique = new Map();
  for (const candle of rows) unique.set(candle.dayStart, candle);
  return [...unique.values()];
}

function previousTradingDay(daily, currentDayStart) {
  return [...daily].reverse().find(candle => candle.dayStart < currentDayStart) || null;
}

function previousTradingWeek(daily, currentWeekStart) {
  if (!daily.length) return null;
  const start = currentWeekStart - 7 * DAY_MS;
  if (start < daily[0].dayStart) return null;
  const rows = daily.filter(candle => candle.dayStart >= start && candle.dayStart < currentWeekStart);
  if (!rows.length) return null;
  return {
    start,
    end: currentWeekStart,
    high: Math.max(...rows.map(candle => candle.high)),
    low: Math.min(...rows.map(candle => candle.low)),
    rows
  };
}

function periodBars(values, daily, periodStart, currentDayStart) {
  const exact = values
    .map((candle, index) => ({
      ...candle,
      index,
      timeMs: timestampMs(candle.time),
      dayStart: utcDayStart(candle.time),
      precision: 'INTRADAY'
    }))
    .filter(candle => candle.timeMs >= periodStart);
  const exactByDay = new Map();
  for (const candle of exact) {
    if (!exactByDay.has(candle.dayStart)) exactByDay.set(candle.dayStart, []);
    exactByDay.get(candle.dayStart).push(candle);
  }
  const fullyCovered = dailyCandle => {
    const rows = exactByDay.get(dailyCandle.dayStart) || [];
    if (!rows.length) return false;
    return Math.abs(rows[0].open - dailyCandle.open) < 0.0000001
      && Math.abs(Math.max(...rows.map(candle => candle.high)) - dailyCandle.high) < 0.0000001
      && Math.abs(Math.min(...rows.map(candle => candle.low)) - dailyCandle.low) < 0.0000001
      && Math.abs(rows.at(-1).close - dailyCandle.close) < 0.0000001;
  };
  const fallback = daily
    .filter(candle => candle.dayStart >= periodStart
      && candle.dayStart < currentDayStart
      && !fullyCovered(candle))
    .map(candle => ({
      ...candle,
      index: -1,
      timeMs: candle.dayStart,
      precision: 'DAILY_FALLBACK'
    }));
  return [...fallback, ...exact].sort((a, b) => a.timeMs - b.timeMs);
}

function evaluateLevel({
  label,
  type,
  level,
  sourcePeriod,
  sourceStart,
  sourceEnd,
  bars,
  values,
  currentPrice
}) {
  const referenceIndex = Math.max(0, values.length - 1);
  const levelAtr = Math.max(conceptAtrAtClean(values, referenceIndex), 0.0000001);
  const tolerance = levelAtr * 0.03;
  const availableIndex = values.findIndex(candle => timestampMs(candle.time) >= sourceEnd);
  const hit = bars.find(candle => type === 'BSL'
    ? candle.high > level + tolerance
    : candle.low < level - tolerance);
  const exactSweep = Boolean(hit && hit.precision === 'INTRADAY' && (type === 'BSL'
    ? hit.high > level + tolerance && hit.close < level - tolerance
    : hit.low < level - tolerance && hit.close > level + tolerance));
  const closedThrough = Boolean(hit && (type === 'BSL'
    ? hit.close > level + tolerance
    : hit.close < level - tolerance));
  let reclaimDepthAtr = 0;
  if (hit?.precision === 'INTRADAY' && hit.index >= 0) {
    const localAtr = Math.max(conceptAtrAtClean(values, hit.index), 0.0000001);
    reclaimDepthAtr = type === 'BSL'
      ? (level - hit.close) / localAtr
      : (hit.close - level) / localAtr;
  }
  const active = !hit;
  const status = active
    ? 'DETECTED'
    : exactSweep
      ? 'CONFIRMED_REACTION'
      : closedThrough
        ? 'CLOSED_THROUGH'
        : 'SWEPT_UNCONFIRMED';
  return {
    id: `${label}:${sourceStart}:${Number(level).toFixed(5)}`,
    type,
    subtype: label,
    label,
    level,
    source: label,
    sourcePeriod,
    sourceStart,
    sourceEnd,
    originIndex: -1,
    availableIndex: availableIndex >= 0 ? availableIndex : values.length,
    interactionIndex: hit?.index ?? -1,
    interactionTime: hit ? hit.timeMs / 1000 : null,
    interactionPrecision: hit?.precision || null,
    active,
    status,
    confirmed: exactSweep,
    tolerance,
    localAtr: levelAtr,
    tier: 'EXTERNAL_KEY',
    reclaimDepthAtr,
    distance: Math.abs(level - conceptNumber(currentPrice, values.at(-1)?.close))
  };
}

export function detectPreviousPeriodLevels(candles, dailyCandles, { currentPrice = null } = {}) {
  const values = cleanConceptCandles(candles);
  const daily = cleanDailyCandles(dailyCandles);
  if (!values.length || !daily.length) return [];
  const currentDayStart = utcDayStart(values.at(-1).time);
  const currentWeekStart = sundayWeekStart(currentDayStart);
  const previousDay = previousTradingDay(daily, currentDayStart);
  const previousWeek = previousTradingWeek(daily, currentWeekStart);
  const levels = [];

  if (previousDay) {
    const bars = periodBars(values, daily, currentDayStart, currentDayStart);
    levels.push(evaluateLevel({
      label: 'PDH', type: 'BSL', level: previousDay.high,
      sourcePeriod: 'PREVIOUS_DAY', sourceStart: previousDay.dayStart,
      sourceEnd: previousDay.dayStart + DAY_MS, bars, values, currentPrice
    }));
    levels.push(evaluateLevel({
      label: 'PDL', type: 'SSL', level: previousDay.low,
      sourcePeriod: 'PREVIOUS_DAY', sourceStart: previousDay.dayStart,
      sourceEnd: previousDay.dayStart + DAY_MS, bars, values, currentPrice
    }));
  }

  if (previousWeek) {
    const bars = periodBars(values, daily, currentWeekStart, currentDayStart);
    levels.push(evaluateLevel({
      label: 'PWH', type: 'BSL', level: previousWeek.high,
      sourcePeriod: 'PREVIOUS_WEEK', sourceStart: previousWeek.start,
      sourceEnd: previousWeek.end, bars, values, currentPrice
    }));
    levels.push(evaluateLevel({
      label: 'PWL', type: 'SSL', level: previousWeek.low,
      sourcePeriod: 'PREVIOUS_WEEK', sourceStart: previousWeek.start,
      sourceEnd: previousWeek.end, bars, values, currentPrice
    }));
  }

  return levels;
}

export function previousPeriodSnapshot(levels) {
  const byLabel = Object.fromEntries((Array.isArray(levels) ? levels : []).map(level => [level.label, level]));
  return {
    pdh: byLabel.PDH?.level || 0,
    pdl: byLabel.PDL?.level || 0,
    pwh: byLabel.PWH?.level || 0,
    pwl: byLabel.PWL?.level || 0,
    pdhStatus: byLabel.PDH?.status || 'WAIT',
    pdlStatus: byLabel.PDL?.status || 'WAIT',
    pwhStatus: byLabel.PWH?.status || 'WAIT',
    pwlStatus: byLabel.PWL?.status || 'WAIT'
  };
}
