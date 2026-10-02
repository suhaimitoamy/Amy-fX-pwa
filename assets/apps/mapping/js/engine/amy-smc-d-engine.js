import {
  TIMEFRAME_SECONDS,
  normalizeMappingTimeframe
} from './mapping-timeframes.js';

export const AMY_SMC_D_BASELINE_SHA = 'd6e6d7c979dd5a852bddd9661bef0480caa2eb35';
export const AMY_SMC_D_ENGINE_VERSION = '1.0.0';

const BULLISH = 1;
const BEARISH = -1;
const BULLISH_LEG = 1;
const BEARISH_LEG = 0;

const TF_PROFILE = Object.freeze({
  M1: Object.freeze({ htf: 'M5' }),
  M5: Object.freeze({ htf: 'M15' }),
  M15: Object.freeze({ htf: 'H1' }),
  M30: Object.freeze({ htf: 'H2' }),
  H1: Object.freeze({ htf: 'H4' }),
  H4: Object.freeze({ htf: 'D1' }),
  D1: Object.freeze({ htf: 'W1' }),
  W1: Object.freeze({ htf: 'MN1' })
});

function finite(value, fallback = NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function seconds(value) {
  const number = finite(value);
  if (!(number > 0)) return 0;
  return number > 100_000_000_000 ? Math.floor(number / 1000) : Math.floor(number);
}

function directionName(value) {
  return value === BULLISH ? 'BULLISH' : value === BEARISH ? 'BEARISH' : 'NEUTRAL';
}

function signalName(value) {
  return value === BULLISH ? 'BUY' : value === BEARISH ? 'SELL' : 'WAIT';
}

function candleGeometryValid(candle) {
  return [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
    && candle.high >= Math.max(candle.open, candle.close, candle.low)
    && candle.low <= Math.min(candle.open, candle.close, candle.high);
}

export function normalizeAmySmcDClosedCandles(candles, timeframe = '') {
  const unique = new Map();
  for (const raw of Array.isArray(candles) ? candles : []) {
    if (!raw || raw.isClosed === false || raw.amyfxSyntheticCurrent === true) continue;
    const candle = {
      time: seconds(raw.time ?? raw.timestamp ?? raw.open_time),
      timeframe: normalizeMappingTimeframe(raw.timeframe || timeframe),
      open: finite(raw.open),
      high: finite(raw.high),
      low: finite(raw.low),
      close: finite(raw.close),
      isClosed: true
    };
    const knownCloseTime = seconds(raw.amyfxClosedAt);
    if (knownCloseTime > candle.time) candle.amyfxClosedAt = knownCloseTime;
    if (!candle.time || !candleGeometryValid(candle)) continue;
    unique.set(candle.time, candle);
  }
  return [...unique.values()].sort((left, right) => left.time - right.time);
}

function trueRange(values, index) {
  const candle = values[index];
  if (!candle) return NaN;
  if (!values[index - 1]) return candle.high - candle.low;
  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - values[index - 1].close),
    Math.abs(candle.low - values[index - 1].close)
  );
}

export function pineRmaSeries(source, length) {
  const output = Array(source.length).fill(null);
  let seed = 0;
  let seedCount = 0;
  let previous = null;
  for (let index = 0; index < source.length; index += 1) {
    const value = finite(source[index]);
    if (!Number.isFinite(value)) continue;
    if (previous == null) {
      seed += value;
      seedCount += 1;
      if (seedCount === length) {
        previous = seed / length;
        output[index] = previous;
      }
      continue;
    }
    previous = (previous * (length - 1) + value) / length;
    output[index] = previous;
  }
  return output;
}

export function pineAtrSeries(candles, length = 14) {
  const values = normalizeAmySmcDClosedCandles(candles);
  return pineRmaSeries(values.map((_, index) => trueRange(values, index)), length);
}

function simpleAverage(values, endIndex, length) {
  const start = endIndex - length + 1;
  if (start < 0) return null;
  let total = 0;
  for (let index = start; index <= endIndex; index += 1) {
    const value = finite(values[index]);
    if (!Number.isFinite(value)) return null;
    total += value;
  }
  return total / length;
}

function strictPivot(values, index, length, key, high) {
  const candidateIndex = index - length;
  if (candidateIndex < length || index >= values.length) return null;
  const candidate = values[candidateIndex][key];
  for (let cursor = candidateIndex - length; cursor <= candidateIndex + length; cursor += 1) {
    if (cursor === candidateIndex) continue;
    if (high ? candidate <= values[cursor][key] : candidate >= values[cursor][key]) return null;
  }
  return { index: candidateIndex, value: candidate };
}

export function amyStructureBiasSeries(candles, length = 5) {
  const values = normalizeAmySmcDClosedCandles(candles);
  const output = Array(values.length).fill(0);
  const pivotHighs = [];
  const pivotLows = [];
  const closes = values.map(candle => candle.close);
  for (let index = 0; index < values.length; index += 1) {
    const high = strictPivot(values, index, length, 'high', true);
    const low = strictPivot(values, index, length, 'low', false);
    if (high) pivotHighs.push(high);
    if (low) pivotLows.push(low);
    const lastHigh = pivotHighs.at(-1)?.value;
    const previousHigh = pivotHighs.at(-2)?.value;
    const lastLow = pivotLows.at(-1)?.value;
    const previousLow = pivotLows.at(-2)?.value;
    const bullish = [lastHigh, previousHigh, lastLow, previousLow].every(Number.isFinite)
      && lastHigh > previousHigh
      && lastLow > previousLow;
    const bearish = [lastHigh, previousHigh, lastLow, previousLow].every(Number.isFinite)
      && lastHigh < previousHigh
      && lastLow < previousLow;
    const baseline = simpleAverage(closes, index, length * 2);
    output[index] = bullish ? BULLISH
      : bearish ? BEARISH
        : baseline == null ? 0
          : values[index].close >= baseline ? BULLISH : BEARISH;
  }
  return { values, bias: output };
}

function aggregateComplete(sourceCandles, targetSeconds, targetName, sourceSeconds) {
  const values = normalizeAmySmcDClosedCandles(sourceCandles);
  if (!values.length || !(targetSeconds > 0)) return [];
  if (!(sourceSeconds > 0) || targetSeconds % sourceSeconds !== 0) return [];
  const expected = targetSeconds / sourceSeconds;
  const buckets = new Map();
  for (const candle of values) {
    const bucket = Math.floor(candle.time / targetSeconds) * targetSeconds;
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(candle);
  }
  const output = [];
  for (const [time, bucket] of buckets) {
    if (bucket.length !== expected) continue;
    let continuous = true;
    for (let index = 0; index < expected; index += 1) {
      if (bucket[index]?.time !== time + index * sourceSeconds) {
        continuous = false;
        break;
      }
    }
    if (!continuous) continue;
    output.push({
      time,
      timeframe: targetName,
      open: bucket[0].open,
      high: Math.max(...bucket.map(candle => candle.high)),
      low: Math.min(...bucket.map(candle => candle.low)),
      close: bucket.at(-1).close,
      isClosed: true
    });
  }
  return output;
}

function utcMonthKey(time) {
  const date = new Date(time * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function aggregateCompleteMonths(sourceCandles) {
  const values = normalizeAmySmcDClosedCandles(sourceCandles, 'D1');
  const buckets = [];
  for (const candle of values) {
    const key = utcMonthKey(candle.time);
    const current = buckets.at(-1);
    if (current?.key === key) current.values.push(candle);
    else buckets.push({ key, values: [candle] });
  }

  const output = [];
  for (let index = 0; index < buckets.length - 1; index += 1) {
    const bucket = buckets[index].values;
    const nextOpen = buckets[index + 1].values[0]?.time;
    const firstDate = new Date(bucket[0].time * 1000);
    const startsNearMonthOpen = firstDate.getUTCDate() <= 4;
    const endsNearNextMonth = nextOpen - bucket.at(-1).time <= 4 * 24 * 60 * 60;
    const continuous = bucket.every((candle, candleIndex) => (
      candleIndex === 0
      || candle.time - bucket[candleIndex - 1].time <= 4 * 24 * 60 * 60
    ));
    if (bucket.length < 15 || !startsNearMonthOpen || !endsNearNextMonth || !continuous) continue;
    output.push({
      time: bucket[0].time,
      timeframe: 'MN1',
      open: bucket[0].open,
      high: Math.max(...bucket.map(candle => candle.high)),
      low: Math.min(...bucket.map(candle => candle.low)),
      close: bucket.at(-1).close,
      isClosed: true,
      amyfxClosedAt: nextOpen
    });
  }
  return output;
}

function requestedHtfSeries(tf, htfCandles) {
  const htf = TF_PROFILE[tf]?.htf || null;
  if (!htf) return { htf: null, values: [], bias: [] };
  let source = normalizeAmySmcDClosedCandles(htfCandles?.[htf] || [], htf);
  if (!source.length && htf === 'H2') {
    source = aggregateComplete(
      htfCandles?.H1 || [],
      2 * 60 * 60,
      'H2',
      TIMEFRAME_SECONDS.H1
    );
  }
  if (!source.length && htf === 'MN1') {
    source = aggregateCompleteMonths(htfCandles?.D1 || []);
  }
  const series = amyStructureBiasSeries(source, 5);
  return { htf, values: series.values, bias: series.bias };
}

function closeTime(candle, timeframe) {
  const duration = TIMEFRAME_SECONDS[normalizeMappingTimeframe(timeframe)] || 0;
  return candle.time + duration;
}

function alignedClosedIndex(values, targetTf, sourceOpenTime) {
  let resolved = -1;
  const targetDuration = TIMEFRAME_SECONDS[targetTf] || (
    targetTf === 'H2' ? 2 * 60 * 60 : 0
  );
  for (let index = 0; index < values.length; index += 1) {
    const closedAt = finite(values[index].amyfxClosedAt, values[index].time + targetDuration);
    if (closedAt <= sourceOpenTime) resolved = index;
    else break;
  }
  return resolved;
}

function alignedHtfBias(series, sourceCandle) {
  if (!series?.values?.length || !series.htf) return 0;
  const index = alignedClosedIndex(series.values, series.htf, sourceCandle.time);
  return index >= 0 ? finite(series.bias[index], 0) : 0;
}

function alignedReferenceCandle(candles, targetTf, sourceCandle) {
  const values = normalizeAmySmcDClosedCandles(candles, targetTf);
  const index = alignedClosedIndex(values, targetTf, sourceCandle.time);
  return index >= 0 ? values[index] : null;
}

function pivotState() {
  return {
    currentLevel: null,
    lastLevel: null,
    crossed: false,
    barTime: null,
    barIndex: null,
    previousBarLevel: null
  };
}

function legState(size) {
  return { size, value: 0 };
}

function updateLeg(values, index, state) {
  const size = state.size;
  if (index < size) return { changed: false, pivotLow: false, pivotHigh: false };
  const candidate = values[index - size];
  let highest = -Infinity;
  let lowest = Infinity;
  for (let cursor = index - size + 1; cursor <= index; cursor += 1) {
    highest = Math.max(highest, values[cursor].high);
    lowest = Math.min(lowest, values[cursor].low);
  }
  const previous = state.value;
  if (candidate.high > highest) state.value = BEARISH_LEG;
  else if (candidate.low < lowest) state.value = BULLISH_LEG;
  const change = state.value - previous;
  return {
    changed: change !== 0,
    pivotLow: change === 1,
    pivotHigh: change === -1,
    candidateIndex: index - size
  };
}

function updateStructurePivot({
  values,
  index,
  leg,
  highPivot,
  lowPivot,
  equal = false,
  atr200,
  trailing,
  events
}) {
  const transition = updateLeg(values, index, leg);
  if (!transition.changed) return;
  const candidate = values[transition.candidateIndex];
  const pivot = transition.pivotLow ? lowPivot : highPivot;
  const level = transition.pivotLow ? candidate.low : candidate.high;
  if (equal && Number.isFinite(pivot.currentLevel) && Number.isFinite(atr200)) {
    if (Math.abs(pivot.currentLevel - level) < 0.1 * atr200) {
      events.push({
        type: transition.pivotLow ? 'EQL' : 'EQH',
        direction: 0,
        level,
        index,
        pivotIndex: transition.candidateIndex,
        time: values[index].time
      });
    }
  }
  pivot.lastLevel = pivot.currentLevel;
  pivot.currentLevel = level;
  pivot.crossed = false;
  pivot.barTime = candidate.time;
  pivot.barIndex = transition.candidateIndex;
  if (!equal) {
    if (transition.pivotLow) {
      trailing.bottom = level;
      trailing.lastBottomTime = candidate.time;
    } else {
      trailing.top = level;
      trailing.lastTopTime = candidate.time;
    }
    trailing.barTime = candidate.time;
    trailing.barIndex = transition.candidateIndex;
  }
}

function crossAbove(values, index, pivot) {
  if (index < 1 || !Number.isFinite(pivot.currentLevel)) return false;
  const previousLevel = Number.isFinite(pivot.previousBarLevel)
    ? pivot.previousBarLevel
    : pivot.currentLevel;
  return values[index].close > pivot.currentLevel
    && values[index - 1].close <= previousLevel;
}

function crossBelow(values, index, pivot) {
  if (index < 1 || !Number.isFinite(pivot.currentLevel)) return false;
  const previousLevel = Number.isFinite(pivot.previousBarLevel)
    ? pivot.previousBarLevel
    : pivot.currentLevel;
  return values[index].close < pivot.currentLevel
    && values[index - 1].close >= previousLevel;
}

function displayStructure({
  values,
  index,
  internal,
  swingHigh,
  swingLow,
  internalHigh,
  internalLow,
  trends,
  alerts
}) {
  const highPivot = internal ? internalHigh : swingHigh;
  const lowPivot = internal ? internalLow : swingLow;
  const trendKey = internal ? 'internal' : 'swing';
  const highEligible = !internal || highPivot.currentLevel !== swingHigh.currentLevel;
  const lowEligible = !internal || lowPivot.currentLevel !== swingLow.currentLevel;

  if (highEligible && !highPivot.crossed && crossAbove(values, index, highPivot)) {
    const kind = trends[trendKey] === BEARISH ? 'CHoCH' : 'BOS';
    highPivot.crossed = true;
    trends[trendKey] = BULLISH;
    alerts.push({
      type: `${internal ? 'INTERNAL' : 'SWING'}_${kind.toUpperCase()}_BULL`,
      kind,
      scope: internal ? 'INTERNAL' : 'SWING',
      direction: BULLISH,
      level: highPivot.currentLevel,
      index,
      time: values[index].time
    });
  }

  if (lowEligible && !lowPivot.crossed && crossBelow(values, index, lowPivot)) {
    const kind = trends[trendKey] === BULLISH ? 'CHoCH' : 'BOS';
    lowPivot.crossed = true;
    trends[trendKey] = BEARISH;
    alerts.push({
      type: `${internal ? 'INTERNAL' : 'SWING'}_${kind.toUpperCase()}_BEAR`,
      kind,
      scope: internal ? 'INTERNAL' : 'SWING',
      direction: BEARISH,
      level: lowPivot.currentLevel,
      index,
      time: values[index].time
    });
  }
}

function detectPattern(values, index, atr) {
  if (index < 3 || !Number.isFinite(atr)) return { name: 'NONE', direction: 0 };
  const candle = values[index];
  const previous = values[index - 1];
  const first = values[index - 2];
  const candleRange = candle.high - candle.low;
  const candleBody = Math.abs(candle.close - candle.open);
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const previousRange = previous.high - previous.low;
  const firstRange = first.high - first.low;
  const previousBody = Math.abs(previous.close - previous.open);
  const firstBody = Math.abs(first.close - first.open);
  const rangeValid = candleRange > 0 && candleRange >= atr * 0.50;
  const strongBody = rangeValid && candleBody >= candleRange * 0.52;
  const previousBodyValid = previousRange > 0 && previousBody >= previousRange * 0.32;
  const shortDown = previous.close < values[index - 3].close;
  const shortUp = previous.close > values[index - 3].close;

  const candidates = [
    ['Morning Star', BULLISH, rangeValid && first.close < first.open && firstBody >= firstRange * 0.55 && previousBody <= firstBody * 0.35 && candle.close > candle.open && candleBody >= candleRange * 0.48 && candle.close >= (first.open + first.close) / 2],
    ['Evening Star', BEARISH, rangeValid && first.close > first.open && firstBody >= firstRange * 0.55 && previousBody <= firstBody * 0.35 && candle.close < candle.open && candleBody >= candleRange * 0.48 && candle.close <= (first.open + first.close) / 2],
    ['Bullish Engulfing', BULLISH, strongBody && previousBodyValid && candle.close > candle.open && previous.close < previous.open && candle.open <= previous.close && candle.close >= previous.open && candleBody >= previousBody * 1.15],
    ['Bearish Engulfing', BEARISH, strongBody && previousBodyValid && candle.close < candle.open && previous.close > previous.open && candle.open >= previous.close && candle.close <= previous.open && candleBody >= previousBody * 1.15],
    ['Hammer', BULLISH, rangeValid && shortDown && candleBody <= candleRange * 0.38 && lowerWick >= candleRange * 0.58 && upperWick <= candleRange * 0.14 && candle.close >= candle.low + candleRange * 0.72],
    ['Shooting Star', BEARISH, rangeValid && shortUp && candleBody <= candleRange * 0.38 && upperWick >= candleRange * 0.58 && lowerWick <= candleRange * 0.14 && candle.close <= candle.low + candleRange * 0.28],
    ['Bullish Pin Bar', BULLISH, rangeValid && candle.close > candle.open && candleBody <= candleRange * 0.30 && lowerWick >= candleRange * 0.62 && upperWick <= candleRange * 0.12 && candle.close >= candle.low + candleRange * 0.76],
    ['Bearish Pin Bar', BEARISH, rangeValid && candle.close < candle.open && candleBody <= candleRange * 0.30 && upperWick >= candleRange * 0.62 && lowerWick <= candleRange * 0.12 && candle.close <= candle.low + candleRange * 0.24],
    ['Doji', 0, rangeValid && candleBody <= candleRange * 0.07 && upperWick >= candleRange * 0.25 && lowerWick >= candleRange * 0.25]
  ];
  const match = candidates.find(candidate => candidate[2]);
  return match ? { name: match[0], direction: match[1] } : { name: 'NONE', direction: 0 };
}

function nearestAbove(levels, reference) {
  return levels.filter(value => Number.isFinite(value) && value > reference)
    .sort((left, right) => left - right)[0] ?? null;
}

function nearestBelow(levels, reference) {
  return levels.filter(value => Number.isFinite(value) && value < reference)
    .sort((left, right) => right - left)[0] ?? null;
}

function previousWindowExtreme(values, index, length, key, highest) {
  const start = Math.max(0, index - length);
  const end = index - 1;
  if (end < start || end - start + 1 < length) return null;
  let result = highest ? -Infinity : Infinity;
  for (let cursor = start; cursor <= end; cursor += 1) {
    result = highest
      ? Math.max(result, values[cursor][key])
      : Math.min(result, values[cursor][key]);
  }
  return Number.isFinite(result) ? result : null;
}

function eventForCompatibility(event, values) {
  if (!event) return null;
  const candle = values[event.index] || {};
  return {
    eventId: `${event.type}:${event.index}:${event.level}`,
    kind: event.kind || (event.type?.includes('SWEEP') ? 'SWEEP' : event.type),
    dir: directionName(event.direction),
    direction: directionName(event.direction),
    price: event.level,
    level: event.level,
    index: event.index,
    time: event.time,
    valid: event.valid !== false,
    qualified: Boolean(event.qualified),
    sweepOnly: event.type?.includes('SWEEP'),
    failed: false,
    hasDisplacement: Boolean(event.hasDisplacement),
    breakType: event.type?.includes('SWEEP') ? 'SWEEP_ONLY' : 'VALID_BREAK',
    structureScope: event.scope || 'SWING',
    confirmationStage: event.scope === 'SWING' ? 'CONFIRMED' : 'TRANSITION',
    trendConfirmed: event.scope === 'SWING',
    candleClose: finite(event.candleClose, finite(candle.close, null)),
    candleHigh: finite(event.candleHigh, finite(candle.high, null)),
    candleLow: finite(event.candleLow, finite(candle.low, null)),
    bodyRatio: finite(event.bodyRatio, 0),
    localAtr: finite(event.atr, 0),
    liveStatus: 'CLOSED_CONFIRMED',
    atRisk: false
  };
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

export function replayAmySmcD(candles, {
  tf = 'M15',
  htfCandles = {}
} = {}) {
  const timeframe = normalizeMappingTimeframe(tf || 'M15');
  const values = normalizeAmySmcDClosedCandles(candles, timeframe);
  if (values.length < 30) {
    return freeze({
      version: AMY_SMC_D_ENGINE_VERSION,
      source: 'AMY_SMC_D',
      baselineSha: AMY_SMC_D_BASELINE_SHA,
      tf: timeframe,
      ready: false,
      reason: 'Minimal 30 candle tertutup diperlukan.',
      sourceCandle: values.at(-1) || null
    });
  }

  const atr14 = pineRmaSeries(values.map((_, index) => trueRange(values, index)), 14);
  const atr200 = pineRmaSeries(values.map((_, index) => trueRange(values, index)), 200);
  const htfSeries = requestedHtfSeries(timeframe, htfCandles);
  const swingHigh = pivotState();
  const swingLow = pivotState();
  const internalHigh = pivotState();
  const internalLow = pivotState();
  const equalHigh = pivotState();
  const equalLow = pivotState();
  const swingLeg = legState(50);
  const internalLeg = legState(5);
  const equalLeg = legState(3);
  const trends = { swing: 0, internal: 0 };
  const trailing = {
    top: null,
    bottom: null,
    barTime: null,
    barIndex: null,
    lastTopTime: null,
    lastBottomTime: null
  };
  const eventHistory = [];
  const structureEvents = [];
  const predictiveEvents = [];
  const dealing = { top: null, bottom: null, bias: 0 };
  const state = {
    lastSweptHigh: null,
    lastSweptLow: null,
    lastBrokenHigh: null,
    lastBrokenLow: null,
    lastLiquiditySide: '',
    lastLiquidityLevel: null,
    lastLiquidityBias: 0,
    lastLiquidityBar: null,
    lastPattern: 'NONE',
    lastPatternDirection: 0,
    lastPatternBar: null,
    protectedStrongHigh: null,
    protectedStrongLow: null,
    round9Direction: 0,
    round8Regime: false,
    nextDirection: 0,
    nextStartIndex: 0,
    previousHtf: 0,
    previousSwing: 0,
    previousInternal: 0,
    previousFinal: 0,
    latest: null
  };

  const addHistory = (name, level, direction, power, index) => {
    eventHistory.unshift({ name, level, direction: directionName(direction), directionValue: direction, power, index, time: values[index].time });
    if (eventHistory.length > 4) eventHistory.pop();
  };

  for (let index = 0; index < values.length; index += 1) {
    const candle = values[index];
    const previous = values[index - 1];
    const currentAtr = atr14[index];
    const currentAtr200 = atr200[index];
    const alerts = [];
    const equalEvents = [];

    for (const pivot of [swingHigh, swingLow, internalHigh, internalLow, equalHigh, equalLow]) {
      pivot.previousBarLevel = pivot.currentLevel;
    }

    if (Number.isFinite(trailing.top)) {
      if (candle.high >= trailing.top) {
        trailing.top = candle.high;
        trailing.lastTopTime = candle.time;
      }
    }
    if (Number.isFinite(trailing.bottom)) {
      if (candle.low <= trailing.bottom) {
        trailing.bottom = candle.low;
        trailing.lastBottomTime = candle.time;
      }
    }

    updateStructurePivot({ values, index, leg: swingLeg, highPivot: swingHigh, lowPivot: swingLow, atr200: currentAtr200, trailing, events: equalEvents });
    updateStructurePivot({ values, index, leg: internalLeg, highPivot: internalHigh, lowPivot: internalLow, atr200: currentAtr200, trailing: {}, events: equalEvents });
    updateStructurePivot({ values, index, leg: equalLeg, highPivot: equalHigh, lowPivot: equalLow, equal: true, atr200: currentAtr200, trailing: {}, events: equalEvents });

    displayStructure({ values, index, internal: true, swingHigh, swingLow, internalHigh, internalLow, trends, alerts });
    displayStructure({ values, index, internal: false, swingHigh, swingLow, internalHigh, internalLow, trends, alerts });

    const htfBias = alignedHtfBias(htfSeries, candle);
    const htfFresh = htfBias !== 0 && htfBias !== state.previousHtf;
    const swingFresh = trends.swing !== 0 && trends.swing !== state.previousSwing;
    const internalFresh = trends.internal !== 0 && trends.internal !== state.previousInternal;

    const patternNow = detectPattern(values, index, currentAtr);
    if (patternNow.name !== 'NONE') {
      state.lastPattern = patternNow.name;
      state.lastPatternDirection = patternNow.direction;
      state.lastPatternBar = index;
    }
    const patternAge = state.lastPatternBar == null ? Number.POSITIVE_INFINITY : index - state.lastPatternBar;
    const patternActive = state.lastPattern !== 'NONE' && patternAge <= 3;
    const patternStructureAligned = state.lastPatternDirection !== 0
      && (state.lastPatternDirection === trends.swing || state.lastPatternDirection === trends.internal);
    const patternCandidate = patternActive && patternStructureAligned ? state.lastPatternDirection : 0;

    const bsl = swingHigh.currentLevel;
    const ssl = swingLow.currentLevel;
    const bslSweep = Number.isFinite(bsl)
      && candle.high > bsl
      && candle.close <= bsl
      && state.lastSweptHigh !== bsl
      && state.lastBrokenHigh !== bsl;
    const sslSweep = Number.isFinite(ssl)
      && candle.low < ssl
      && candle.close >= ssl
      && state.lastSweptLow !== ssl
      && state.lastBrokenLow !== ssl;
    const bslValidBreak = Boolean(previous)
      && Number.isFinite(bsl)
      && candle.close > bsl
      && previous.close <= bsl
      && state.lastBrokenHigh !== bsl;
    const sslValidBreak = Boolean(previous)
      && Number.isFinite(ssl)
      && candle.close < ssl
      && previous.close >= ssl
      && state.lastBrokenLow !== ssl;

    const range = candle.high - candle.low;
    const body = Math.abs(candle.close - candle.open);
    const bodyRatio = range > 0 ? body / range : 0;
    const displacement = Number.isFinite(currentAtr)
      && body >= currentAtr * 0.35
      && bodyRatio >= 0.55;
    const minSweep = finite(currentAtr, 0) * 0.08;
    const minBreak = finite(currentAtr, 0) * 0.05;
    const bodyAtr = Number.isFinite(currentAtr) && currentAtr > 0 ? body / currentAtr : 0;
    const qualifiedBslBreakBase = bslValidBreak && displacement && candle.close > candle.open && candle.close >= bsl + minBreak;
    const qualifiedSslBreakBase = sslValidBreak && displacement && candle.close < candle.open && candle.close <= ssl - minBreak;
    const isM5 = timeframe === 'M5';
    const isM15 = timeframe === 'M15';
    const isH1 = timeframe === 'H1';
    const testedTf = isM5 || isM15 || isH1;
    const qualifiedBslBreak = isM5
      ? qualifiedBslBreakBase && trends.internal === BULLISH && (htfBias === 0 || htfBias === BULLISH) && bodyAtr >= 3.0 && bodyRatio >= 0.80
      : isM15
        ? qualifiedBslBreakBase && trends.internal === BULLISH && (htfBias === 0 || htfBias === BULLISH) && bodyAtr >= 1.0 && bodyRatio >= 0.65
        : isH1
          ? qualifiedBslBreakBase && bodyAtr >= 0.50 && bodyRatio >= 0.70
          : qualifiedBslBreakBase;
    const qualifiedSslBreak = isM5
      ? qualifiedSslBreakBase && trends.internal === BEARISH && (htfBias === 0 || htfBias === BEARISH) && bodyAtr >= 3.0 && bodyRatio >= 0.80
      : isM15
        ? qualifiedSslBreakBase && trends.internal === BEARISH && (htfBias === 0 || htfBias === BEARISH) && bodyAtr >= 1.0 && bodyRatio >= 0.65
        : isH1
          ? qualifiedSslBreakBase && bodyAtr >= 0.50 && bodyRatio >= 0.70
          : qualifiedSslBreakBase;
    const sweepContinuation = testedTf
      ? bslSweep && trends.internal === BULLISH ? BULLISH
        : sslSweep && trends.internal === BEARISH ? BEARISH
          : 0
      : 0;

    const swingBullBos = alerts.find(event => event.scope === 'SWING' && event.kind === 'BOS' && event.direction === BULLISH) || null;
    const swingBearBos = alerts.find(event => event.scope === 'SWING' && event.kind === 'BOS' && event.direction === BEARISH) || null;
    const swingBullChoch = alerts.find(event => event.scope === 'SWING' && event.kind === 'CHoCH' && event.direction === BULLISH) || null;
    const swingBearChoch = alerts.find(event => event.scope === 'SWING' && event.kind === 'CHoCH' && event.direction === BEARISH) || null;
    const baseBullBos = Boolean(swingBullBos && displacement && candle.close > candle.open && candle.close >= swingHigh.currentLevel + minBreak);
    const baseBearBos = Boolean(swingBearBos && displacement && candle.close < candle.open && candle.close <= swingLow.currentLevel - minBreak);
    const baseBullChoch = Boolean(swingBullChoch && displacement && candle.close > candle.open && candle.close >= swingHigh.currentLevel + minBreak);
    const baseBearChoch = Boolean(swingBearChoch && displacement && candle.close < candle.open && candle.close <= swingLow.currentLevel - minBreak);
    const bullChochExcursion = Number.isFinite(currentAtr) && currentAtr > 0 && Number.isFinite(swingHigh.currentLevel)
      ? (candle.close - swingHigh.currentLevel) / currentAtr : 0;
    const bearChochExcursion = Number.isFinite(currentAtr) && currentAtr > 0 && Number.isFinite(swingLow.currentLevel)
      ? (swingLow.currentLevel - candle.close) / currentAtr : 0;
    const qualifiedBullBos = testedTf ? false : baseBullBos && (htfBias === 0 || htfBias === BULLISH);
    const qualifiedBearBos = testedTf ? false : baseBearBos && (htfBias === 0 || htfBias === BEARISH);
    const qualifiedBullChoch = isM5
      ? baseBullChoch && htfBias === BEARISH && trends.internal === BULLISH && bodyRatio >= 0.65 && bullChochExcursion >= 0.30
      : isM15
        ? baseBullChoch && htfBias === BULLISH && trends.internal === BULLISH && Number.isFinite(currentAtr) && body >= currentAtr && bodyRatio >= 0.70 && bullChochExcursion >= 0.30
        : isH1
          ? baseBullChoch && bodyRatio >= 0.65 && bodyAtr < 1.50
          : baseBullChoch;
    const qualifiedBearChoch = isM5
      ? baseBearChoch && htfBias === BULLISH && trends.internal === BEARISH && bodyRatio >= 0.65 && bearChochExcursion >= 0.30
      : isM15
        ? baseBearChoch && htfBias === BEARISH && trends.internal === BEARISH && Number.isFinite(currentAtr) && body >= currentAtr && bodyRatio >= 0.70 && bearChochExcursion >= 0.30
        : isH1
          ? baseBearChoch && bodyRatio >= 0.65 && bodyAtr < 1.50
          : baseBearChoch;

    if ((baseBullBos || baseBullChoch) && Number.isFinite(swingLow.currentLevel)) state.protectedStrongLow = swingLow.currentLevel;
    if ((baseBearBos || baseBearChoch) && Number.isFinite(swingHigh.currentLevel)) state.protectedStrongHigh = swingHigh.currentLevel;

    if (bslSweep) {
      state.lastSweptHigh = bsl;
      state.lastLiquiditySide = 'BSL';
      state.lastLiquidityLevel = bsl;
      state.lastLiquidityBias = BEARISH;
      state.lastLiquidityBar = index;
      addHistory('BSL SWEEP', bsl, BEARISH, 30, index);
    }
    if (sslSweep) {
      state.lastSweptLow = ssl;
      state.lastLiquiditySide = 'SSL';
      state.lastLiquidityLevel = ssl;
      state.lastLiquidityBias = BULLISH;
      state.lastLiquidityBar = index;
      addHistory('SSL SWEEP', ssl, BULLISH, 30, index);
    }
    if (bslValidBreak) {
      state.lastBrokenHigh = bsl;
      state.lastLiquiditySide = 'BSL';
      state.lastLiquidityLevel = bsl;
      state.lastLiquidityBias = BULLISH;
      state.lastLiquidityBar = index;
      addHistory('BSL VALID BREAK', bsl, BULLISH, 35, index);
    }
    if (sslValidBreak) {
      state.lastBrokenLow = ssl;
      state.lastLiquiditySide = 'SSL';
      state.lastLiquidityLevel = ssl;
      state.lastLiquidityBias = BEARISH;
      state.lastLiquidityBar = index;
      addHistory('SSL VALID BREAK', ssl, BEARISH, 35, index);
    }
    if (swingBullBos) addHistory('BOS BULL', swingHigh.currentLevel, BULLISH, 25, index);
    if (swingBearBos) addHistory('BOS BEAR', swingLow.currentLevel, BEARISH, 25, index);
    if (swingBullChoch) addHistory('CHoCH BULL', swingHigh.currentLevel, BULLISH, 20, index);
    if (swingBearChoch) addHistory('CHoCH BEAR', swingLow.currentLevel, BEARISH, 20, index);
    for (const event of equalEvents) addHistory(event.type, event.level, 0, 0, index);

    const swingBullEvent = Boolean(swingBullBos || swingBullChoch);
    const swingBearEvent = Boolean(swingBearBos || swingBearChoch);
    if (swingBullEvent && Number.isFinite(swingLow.currentLevel)) {
      dealing.bottom = swingLow.currentLevel;
      dealing.top = Math.max(candle.high, finite(swingHigh.currentLevel, candle.high));
      dealing.bias = BULLISH;
    } else if (swingBearEvent && Number.isFinite(swingHigh.currentLevel)) {
      dealing.top = swingHigh.currentLevel;
      dealing.bottom = Math.min(candle.low, finite(swingLow.currentLevel, candle.low));
      dealing.bias = BEARISH;
    } else if (!Number.isFinite(dealing.top)
      && Number.isFinite(swingHigh.currentLevel)
      && Number.isFinite(swingLow.currentLevel)
      && swingHigh.currentLevel > swingLow.currentLevel) {
      dealing.top = swingHigh.currentLevel;
      dealing.bottom = swingLow.currentLevel;
      dealing.bias = trends.swing;
    }

    const liquidityAge = state.lastLiquidityBar == null ? Number.POSITIVE_INFINITY : index - state.lastLiquidityBar;
    const liquidityActive = liquidityAge <= 12;
    const liquidityBias = liquidityActive ? state.lastLiquidityBias : 0;
    const daily = alignedReferenceCandle(htfCandles?.D1 || [], 'D1', candle);
    const weekly = alignedReferenceCandle(htfCandles?.W1 || [], 'W1', candle);
    const recentHigh = previousWindowExtreme(values, index, 50, 'high', true);
    const recentLow = previousWindowExtreme(values, index, 50, 'low', false);
    const weakHigh = trends.swing === BULLISH && Number.isFinite(trailing.top) && trailing.lastTopTime < candle.time ? trailing.top : null;
    const weakLow = trends.swing === BEARISH && Number.isFinite(trailing.bottom) && trailing.lastBottomTime < candle.time ? trailing.bottom : null;
    const distance = finite(currentAtr, 0) * 0.35;
    const forwardBsl = nearestAbove([
      equalHigh.currentLevel, weakHigh, daily?.high, weekly?.high, swingHigh.currentLevel, recentHigh
    ], candle.close + distance);
    const forwardSsl = nearestBelow([
      equalLow.currentLevel, weakLow, daily?.low, weekly?.low, swingLow.currentLevel, recentLow
    ], candle.close - distance);

    const patternVotes = patternCandidate === 0 ? 0 : [htfBias, trends.swing, trends.internal, liquidityBias]
      .filter(value => value === patternCandidate).length;
    const patternOpposes = patternCandidate === 0 ? 0 : [htfBias, trends.swing, trends.internal, liquidityBias]
      .filter(value => value !== 0 && value === -patternCandidate).length;
    const reversalNames = new Set(['Morning Star', 'Evening Star', 'Hammer', 'Shooting Star', 'Bullish Pin Bar', 'Bearish Pin Bar']);
    const patternReversal = reversalNames.has(state.lastPattern);
    const localBoth = patternCandidate !== 0 && trends.swing === patternCandidate && trends.internal === patternCandidate;
    const liquidityConfirm = patternCandidate !== 0 && liquidityBias === patternCandidate;
    let patternQualified = false;
    if (patternCandidate !== 0) {
      if (!(isM15 || isH1)) {
        patternQualified = patternVotes >= 2 && patternOpposes <= 1 && (!patternReversal || liquidityConfirm || localBoth);
      } else {
        const bearPriority = ['Bearish Engulfing', 'Evening Star', 'Bearish Pin Bar'].includes(state.lastPattern);
        const requiredVotes = bearPriority ? 2 : 3;
        const conflictOk = bearPriority ? patternOpposes <= 1 : patternOpposes === 0;
        patternQualified = patternVotes >= requiredVotes
          && conflictOk
          && (patternCandidate !== BULLISH || liquidityConfirm || localBoth)
          && (!patternReversal || liquidityConfirm || localBoth);
      }
      if (isM5) {
        const primary = ['Bullish Engulfing', 'Bullish Pin Bar', 'Morning Star'].includes(state.lastPattern)
          && htfBias === patternCandidate
          && trends.swing !== patternCandidate;
        const recovery = ['Bullish Engulfing', 'Bearish Engulfing'].includes(state.lastPattern)
          && trends.internal === patternCandidate
          && ((patternVotes === 1 && patternOpposes === 3) || (patternVotes === 2 && patternOpposes === 2));
        patternQualified = (primary || recovery)
          && ['Bullish Engulfing', 'Bearish Engulfing'].includes(state.lastPattern)
          && state.lastPattern === 'Bearish Engulfing';
      } else if (isM15) {
        const primary = ['Bullish Engulfing', 'Morning Star', 'Bullish Pin Bar'].includes(state.lastPattern)
          && patternVotes === 3 && patternOpposes === 0;
        const retrace = state.lastPattern === 'Morning Star' && patternVotes === 2 && patternOpposes === 1 && trends.internal === patternCandidate;
        patternQualified = (primary || retrace)
          && ['Bullish Engulfing', 'Morning Star'].includes(state.lastPattern)
          && htfBias === patternCandidate;
      } else if (isH1) {
        const round3 = (state.lastPattern === 'Bullish Engulfing' && patternVotes === 3 && patternOpposes === 0)
          || (state.lastPattern === 'Morning Star' && patternVotes === 3 && patternOpposes === 0)
          || (state.lastPattern === 'Bearish Pin Bar' && patternVotes === 2 && patternOpposes === 1)
          || (state.lastPattern === 'Hammer' && patternVotes === 2 && patternOpposes === 1 && trends.internal === patternCandidate);
        patternQualified = round3 && htfBias === patternCandidate && trends.internal === patternCandidate;
      }
      const conflictRegime = patternAge === 0 && liquidityBias === -patternCandidate;
      if ((isM15 || isH1) && conflictRegime) patternQualified = true;
    }
    const qualifiedPatternDirection = patternQualified ? patternCandidate : 0;

    const dealingValid = Number.isFinite(dealing.top) && Number.isFinite(dealing.bottom) && dealing.top > dealing.bottom;
    let rangeTop = dealingValid ? dealing.top : null;
    let rangeBottom = dealingValid ? dealing.bottom : null;
    let premiumRatio = 0.65;
    let discountRatio = 0.35;
    let rangeSource = 'Z_STRUCTURAL_RANGE';
    let location = 'EQUILIBRIUM';
    let dealingBias = 0;
    if (isH1) {
      rangeTop = previousWindowExtreme(values, index, 240, 'high', true);
      rangeBottom = previousWindowExtreme(values, index, 240, 'low', false);
      premiumRatio = 0.55;
      discountRatio = 0.45;
      rangeSource = 'PREVIOUS_240_CLOSED_H1';
    } else if (isM5) {
      premiumRatio = 0.70;
      discountRatio = 0.30;
      rangeSource = 'D_STRUCTURAL_M5';
    } else if (isM15) {
      premiumRatio = 0.60;
      discountRatio = 0.40;
      rangeSource = 'D_STRUCTURAL_M15';
    }
    const rangeValid = Number.isFinite(rangeTop) && Number.isFinite(rangeBottom) && rangeTop > rangeBottom;
    const span = rangeValid ? rangeTop - rangeBottom : null;
    const premiumGate = rangeValid ? rangeBottom + span * premiumRatio : null;
    const discountGate = rangeValid ? rangeBottom + span * discountRatio : null;
    if (rangeValid) {
      if (isM5 || isM15 || isH1) {
        if (candle.close >= premiumGate) {
          location = 'PREMIUM';
          dealingBias = BEARISH;
        } else if (candle.close <= discountGate) {
          location = 'DISCOUNT';
          dealingBias = BULLISH;
        }
      } else {
        const eqUpper = rangeBottom + span * 0.525;
        const eqLower = rangeBottom + span * 0.475;
        const bullContext = dealing.bias === BULLISH && trends.swing === BULLISH && trends.internal !== BEARISH;
        const bearContext = dealing.bias === BEARISH && trends.swing === BEARISH && trends.internal !== BULLISH;
        if (candle.close > eqUpper) {
          location = 'PREMIUM';
          dealingBias = candle.close >= premiumGate && bearContext ? BEARISH : 0;
        } else if (candle.close < eqLower) {
          location = 'DISCOUNT';
          dealingBias = candle.close <= discountGate && bullContext ? BULLISH : 0;
        }
      }
    }

    const finalScore = htfBias * 35 + trends.swing * 30 + trends.internal * 20 + liquidityBias * 15;
    const finalBias = finalScore > 0 ? BULLISH
      : finalScore < 0 ? BEARISH
        : trends.swing !== 0 ? trends.swing
          : htfBias !== 0 ? htfBias
            : candle.close >= candle.open ? BULLISH : BEARISH;
    const finalFresh = finalBias !== 0 && finalBias !== state.previousFinal;

    const protectedLow = Number.isFinite(swingLow.currentLevel) && swingLow.currentLevel < candle.close ? swingLow.currentLevel : null;
    const protectedHigh = Number.isFinite(swingHigh.currentLevel) && swingHigh.currentLevel > candle.close ? swingHigh.currentLevel : null;
    const bullInvalidation = protectedLow ?? nearestBelow([trailing.bottom, recentLow, internalLow.currentLevel], candle.close);
    const bearInvalidation = protectedHigh ?? nearestAbove([trailing.top, recentHigh, internalHigh.currentLevel], candle.close);

    const round8Regime = isM5
      && htfBias !== 0
      && htfBias === trends.swing
      && liquidityBias === trends.swing
      && trends.internal === -trends.swing;
    const regimeEntry = round8Regime && !state.round8Regime;
    const entryInvalidation = trends.internal === BULLISH ? bullInvalidation : trends.internal === BEARISH ? bearInvalidation : null;
    const riskAtr = Number.isFinite(entryInvalidation) && Number.isFinite(currentAtr) && currentAtr > 0
      ? Math.abs(candle.close - entryInvalidation) / currentAtr : null;
    const candleConfirm = trends.internal === BULLISH ? candle.close > candle.open
      : trends.internal === BEARISH ? candle.close < candle.open : false;
    if (isM5) {
      if (!round8Regime) state.round9Direction = 0;
      else if (regimeEntry) state.round9Direction = candleConfirm && Number.isFinite(riskAtr) && riskAtr >= 3 ? trends.internal : 0;
    }
    let nextDirection = isM5 ? (round8Regime ? state.round9Direction : 0) : finalBias;
    if (isH1 && sweepContinuation !== 0) nextDirection = sweepContinuation;
    if (nextDirection !== state.nextDirection) state.nextStartIndex = index;

    const rawValidBreak = bslValidBreak ? {
      type: 'BSL_VALID_BREAK', direction: BULLISH, level: bsl, index, time: candle.time,
      qualified: qualifiedBslBreak, valid: true, hasDisplacement: displacement, bodyRatio, atr: currentAtr,
      candleClose: candle.close, candleHigh: candle.high, candleLow: candle.low
    } : sslValidBreak ? {
      type: 'SSL_VALID_BREAK', direction: BEARISH, level: ssl, index, time: candle.time,
      qualified: qualifiedSslBreak, valid: true, hasDisplacement: displacement, bodyRatio, atr: currentAtr,
      candleClose: candle.close, candleHigh: candle.high, candleLow: candle.low
    } : null;
    const rawSweep = bslSweep ? {
      type: 'BSL_SWEEP', direction: BEARISH, level: bsl, index, time: candle.time, valid: true,
      candleClose: candle.close, candleHigh: candle.high, candleLow: candle.low
    } : sslSweep ? {
      type: 'SSL_SWEEP', direction: BULLISH, level: ssl, index, time: candle.time, valid: true,
      candleClose: candle.close, candleHigh: candle.high, candleLow: candle.low
    } : null;
    const rawSwingEvent = [...alerts].reverse().find(event => event.scope === 'SWING') || null;
    const qualifiedChoch = qualifiedBullChoch ? { ...swingBullChoch, qualified: true }
      : qualifiedBearChoch ? { ...swingBearChoch, qualified: true } : null;
    const qualifiedBos = qualifiedBullBos ? { ...swingBullBos, qualified: true }
      : qualifiedBearBos ? { ...swingBearBos, qualified: true } : null;
    const qualifiedBreak = rawValidBreak?.qualified ? rawValidBreak : null;

    for (const event of alerts) structureEvents.push({
      ...event,
      valid: true,
      bodyRatio,
      atr: currentAtr,
      candleClose: candle.close,
      candleHigh: candle.high,
      candleLow: candle.low
    });
    if (rawSweep) predictiveEvents.push(rawSweep);
    if (rawValidBreak) predictiveEvents.push(rawValidBreak);
    if (qualifiedChoch) predictiveEvents.push(qualifiedChoch);
    if (qualifiedBos) predictiveEvents.push(qualifiedBos);

    state.latest = {
      index,
      sourceCandle: { ...candle },
      descriptive: {
        htfSwing: { direction: directionName(htfBias), directionValue: htfBias, timeframe: htfSeries.htf, fresh: htfFresh },
        swingStructure: { direction: directionName(trends.swing), directionValue: trends.swing, fresh: swingFresh, event: rawSwingEvent },
        internalStructure: { direction: directionName(trends.internal), directionValue: trends.internal, fresh: internalFresh, event: [...alerts].reverse().find(event => event.scope === 'INTERNAL') || null },
        liquidity: {
          active: liquidityActive,
          side: state.lastLiquiditySide || null,
          level: state.lastLiquidityLevel,
          direction: directionName(liquidityBias),
          directionValue: liquidityBias,
          forwardBsl,
          forwardSsl,
          rawSweep
        },
        dealingRange: {
          location,
          direction: directionName(dealingBias),
          directionValue: dealingBias,
          top: rangeTop,
          bottom: rangeBottom,
          equilibrium: rangeValid ? (rangeTop + rangeBottom) / 2 : null,
          premiumGate,
          discountGate,
          premiumRatio,
          discountRatio,
          source: rangeSource,
          descriptiveOnly: true,
          predictorDependency: false,
          valid: rangeValid
        },
        pattern: {
          name: patternActive ? state.lastPattern : 'NONE',
          direction: directionName(patternCandidate),
          directionValue: patternCandidate,
          detectedOnSourceCandle: patternNow.name !== 'NONE'
        },
        finalBias: {
          direction: directionName(finalBias),
          directionValue: finalBias,
          fresh: finalFresh,
          score: finalScore,
          components: { htfSwing: htfBias, swingStructure: trends.swing, internalStructure: trends.internal, liquidity: liquidityBias },
          dealingRangeExcluded: true
        },
        eventHistory: eventHistory.map(event => ({ ...event }))
      },
      predictive: {
        nextMove: {
          direction: directionName(nextDirection),
          directionValue: nextDirection,
          signal: signalName(nextDirection),
          active: nextDirection !== 0,
          startIndex: state.nextStartIndex,
          startTime: values[state.nextStartIndex]?.time || candle.time,
          source: isM5 ? 'D_M5_ROUND9_CONFIRMED_TRANSITION' : isH1 && sweepContinuation !== 0 ? 'D_H1_SWEEP_CONTINUATION_OVERRIDE' : 'D_FINAL_BIAS'
        },
        sweepContinuation: {
          direction: directionName(sweepContinuation),
          directionValue: sweepContinuation,
          active: sweepContinuation !== 0,
          rawSweep
        },
        rawValidBreak,
        qualifiedValidBreak: qualifiedBreak,
        qualifiedChoch,
        qualifiedBos,
        rawPattern: {
          name: patternNow.name,
          direction: directionName(patternNow.direction),
          directionValue: patternNow.direction,
          active: patternNow.name !== 'NONE'
        },
        qualifiedPattern: {
          name: qualifiedPatternDirection !== 0 ? state.lastPattern : 'NONE',
          direction: directionName(qualifiedPatternDirection),
          directionValue: qualifiedPatternDirection,
          active: qualifiedPatternDirection !== 0,
          lowSample: isM5
        }
      },
      levels: {
        bsl: forwardBsl,
        ssl: forwardSsl,
        protectedHigh: state.protectedStrongHigh ?? protectedHigh,
        protectedLow: state.protectedStrongLow ?? protectedLow,
        bullishInvalidation: bullInvalidation,
        bearishInvalidation: bearInvalidation
      },
      raw: {
        alerts: alerts.map(event => ({ ...event })),
        equalEvents: equalEvents.map(event => ({ ...event })),
        structureEvents: structureEvents.slice(-30).map(event => ({ ...event })),
        predictiveEvents: predictiveEvents.slice(-30).map(event => ({ ...event })),
        atr14: currentAtr
      }
    };

    state.previousHtf = htfBias;
    state.previousSwing = trends.swing;
    state.previousInternal = trends.internal;
    state.previousFinal = finalBias;
    state.round8Regime = round8Regime;
    state.nextDirection = nextDirection;
  }

  return freeze({
    version: AMY_SMC_D_ENGINE_VERSION,
    source: 'AMY_SMC_D',
    baselineSha: AMY_SMC_D_BASELINE_SHA,
    semanticContract: 'Z_ORIGINAL_PLUS_D_DEALING_RANGE_FIXES',
    tf: timeframe,
    ready: true,
    closedCandleOnly: true,
    noFutureCandle: true,
    noInterpolation: true,
    noSyntheticCandles: true,
    sourceCandle: state.latest.sourceCandle,
    candleCount: values.length,
    ...state.latest
  });
}

export function amySmcDCompatibilityStructure(result) {
  const d = result?.descriptive || {};
  const events = (result?.raw?.structureEvents || []).map(event => eventForCompatibility(event, []));
  const lastEvent = eventForCompatibility(result?.descriptive?.swingStructure?.event || result?.descriptive?.internalStructure?.event, []);
  return {
    trend: d.swingStructure?.direction || 'NEUTRAL',
    confirmedTrend: d.swingStructure?.direction || 'NEUTRAL',
    localTrend: d.internalStructure?.direction || 'NEUTRAL',
    transitionDirection: d.internalStructure?.event?.kind === 'CHoCH' ? d.internalStructure.direction : 'NEUTRAL',
    transitionBreak: d.internalStructure?.event?.kind === 'CHoCH' ? lastEvent : null,
    transitionConfirmationLevel: null,
    liveStatus: lastEvent ? 'CLOSED_CONFIRMED' : 'WAIT',
    atRisk: false,
    protectedHigh: result?.levels?.protectedHigh ?? null,
    protectedLow: result?.levels?.protectedLow ?? null,
    last: lastEvent,
    lastEvent,
    lastConfirmedBreak: lastEvent,
    lastMajorBreak: d.swingStructure?.event ? lastEvent : null,
    lastInternalBreak: d.internalStructure?.event ? lastEvent : null,
    lastSweep: eventForCompatibility(d.liquidity?.rawSweep, []),
    lastFailedBreak: null,
    events,
    source: 'AMY_SMC_D'
  };
}
