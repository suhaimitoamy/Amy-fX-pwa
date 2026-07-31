const SUPPORTED_TIMEFRAMES = new Set(['M15', 'H1']);
const THRESHOLD = 97;
const MINTICK = 0.01;
const RESEARCH_LOCK_SHA256 = '693cd685966d4c1845d8c289cc442c4292f4cc5a08ac20cce2804e3ed7aade92';
const SOURCE_INDICATOR_BLOB_SHA = 'c051677aee3b88e4cfdab50deda30d1e1c919654';

const MAKASSAR_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Makassar',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function cleanCandles(candles) {
  return (Array.isArray(candles) ? candles : [])
    .map(item => ({
      time: finite(item?.time),
      open: finite(item?.open, NaN),
      high: finite(item?.high, NaN),
      low: finite(item?.low, NaN),
      close: finite(item?.close, NaN)
    }))
    .filter(item => item.time > 0
      && Number.isFinite(item.open)
      && Number.isFinite(item.high)
      && Number.isFinite(item.low)
      && Number.isFinite(item.close)
      && item.high >= item.low)
    .sort((first, second) => first.time - second.time);
}

function emaSeries(values, length) {
  if (!Array.isArray(values) || !values.length || length <= 0) return [];
  const alpha = 2 / (length + 1);
  const output = [];
  let current = finite(values[0]);
  output.push(current);
  for (let index = 1; index < values.length; index += 1) {
    current = finite(values[index]) * alpha + current * (1 - alpha);
    output.push(current);
  }
  return output;
}

export function wilderAtrSeries(candles, length = 14) {
  const values = cleanCandles(candles);
  if (!values.length) return [];
  const trueRanges = values.map((candle, index) => {
    const previous = values[index - 1];
    if (!previous) return Math.max(candle.high - candle.low, MINTICK);
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previous.close),
      Math.abs(candle.low - previous.close),
      MINTICK
    );
  });
  const output = new Array(values.length).fill(null);
  if (values.length < length) return output;
  let current = trueRanges.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
  output[length - 1] = current;
  for (let index = length; index < values.length; index += 1) {
    current = ((current * (length - 1)) + trueRanges[index]) / length;
    output[index] = current;
  }
  return output;
}

function makassarParts(timeSeconds) {
  const values = {};
  for (const part of MAKASSAR_PARTS.formatToParts(new Date(timeSeconds * 1000))) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute)
  };
}

function isAsia(minutes) {
  return minutes >= 360 && minutes < 840;
}

function isLondon(minutes) {
  return minutes >= 840 && minutes < 1080;
}

function isNewYork(minutes) {
  return minutes >= 1170 || minutes < 240;
}

function utcDayKey(timeSeconds) {
  return new Date(timeSeconds * 1000).toISOString().slice(0, 10);
}

function utcWeekKey(timeSeconds) {
  const date = new Date(timeSeconds * 1000);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function previousPeriodCandle(periodCandles, anchorTime, keyFunction) {
  const currentKey = keyFunction(anchorTime);
  let selected = null;
  for (const candle of periodCandles) {
    if (candle.time >= anchorTime || keyFunction(candle.time) === currentKey) continue;
    if (!selected || candle.time > selected.time) selected = candle;
  }
  return selected;
}

function isPivotHigh(candles, center, length) {
  const value = candles[center]?.high;
  if (!Number.isFinite(value) || center < length || center + length >= candles.length) return false;
  for (let offset = 1; offset <= length; offset += 1) {
    if (value <= candles[center - offset].high || value <= candles[center + offset].high) return false;
  }
  return true;
}

function isPivotLow(candles, center, length) {
  const value = candles[center]?.low;
  if (!Number.isFinite(value) || center < length || center + length >= candles.length) return false;
  for (let offset = 1; offset <= length; offset += 1) {
    if (value >= candles[center - offset].low || value >= candles[center + offset].low) return false;
  }
  return true;
}

function nearestTarget(candidates, direction, close) {
  return candidates
    .filter(item => Number.isFinite(item.level)
      && (direction === 'BSL' ? item.level > close : item.level < close))
    .sort((first, second) => Math.abs(first.level - close) - Math.abs(second.level - close))[0] || null;
}

function simulateLiquidityState(candles, dailyCandles, weeklyCandles, timeframe) {
  const swingLength = 4;
  const sweepMemoryBars = timeframe === 'H1' ? 12 : 48;
  let lastHigh = null;
  let lastLow = null;
  let bslConsumed = false;
  let sslConsumed = false;
  let bslBroken = false;
  let sslBroken = false;
  let trend = 'NEUTRAL';
  let lastBuySweepBar = null;
  let lastSellSweepBar = null;
  let asiaHigh = null;
  let asiaLow = null;
  let asiaHighConsumed = false;
  let asiaLowConsumed = false;
  let previousAsia = false;
  let previousMakassarDate = null;
  let previousDayKey = null;
  let previousWeekKey = null;
  let pdhConsumed = false;
  let pdlConsumed = false;
  let pwhConsumed = false;
  let pwlConsumed = false;
  let currentPdh = null;
  let currentPdl = null;
  let currentPwh = null;
  let currentPwl = null;
  let finalRawBreakBull = false;
  let finalRawBreakBear = false;

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const previous = candles[index - 1];
    const makassar = makassarParts(candle.time);
    const inAsia = isAsia(makassar.minutes);
    const validSession = isLondon(makassar.minutes) || isNewYork(makassar.minutes);
    const dayKey = utcDayKey(candle.time);
    const weekKey = utcWeekKey(candle.time);

    if (dayKey !== previousDayKey) {
      previousDayKey = dayKey;
      pdhConsumed = false;
      pdlConsumed = false;
      const previousDay = previousPeriodCandle(dailyCandles, candle.time, utcDayKey);
      currentPdh = previousDay?.high ?? null;
      currentPdl = previousDay?.low ?? null;
    }
    if (weekKey !== previousWeekKey) {
      previousWeekKey = weekKey;
      pwhConsumed = false;
      pwlConsumed = false;
      const previousWeek = previousPeriodCandle(weeklyCandles, candle.time, utcWeekKey);
      currentPwh = previousWeek?.high ?? null;
      currentPwl = previousWeek?.low ?? null;
    }

    const asiaStart = inAsia && (!previousAsia || makassar.dateKey !== previousMakassarDate);
    if (asiaStart) {
      asiaHigh = candle.high;
      asiaLow = candle.low;
      asiaHighConsumed = false;
      asiaLowConsumed = false;
    } else if (inAsia) {
      asiaHigh = asiaHigh == null ? candle.high : Math.max(asiaHigh, candle.high);
      asiaLow = asiaLow == null ? candle.low : Math.min(asiaLow, candle.low);
    }

    const pivotCenter = index - swingLength;
    if (isPivotHigh(candles, pivotCenter, swingLength)) {
      lastHigh = candles[pivotCenter].high;
      bslConsumed = false;
      bslBroken = false;
    }
    if (isPivotLow(candles, pivotCenter, swingLength)) {
      lastLow = candles[pivotCenter].low;
      sslConsumed = false;
      sslBroken = false;
    }

    const newBslSweep = !bslConsumed && Number.isFinite(lastHigh)
      && candle.high > lastHigh && candle.close < lastHigh;
    const newSslSweep = !sslConsumed && Number.isFinite(lastLow)
      && candle.low < lastLow && candle.close > lastLow;
    const newAsiaHighSweep = validSession && !inAsia && !asiaHighConsumed
      && Number.isFinite(asiaHigh) && candle.high > asiaHigh && candle.close < asiaHigh;
    const newAsiaLowSweep = validSession && !inAsia && !asiaLowConsumed
      && Number.isFinite(asiaLow) && candle.low < asiaLow && candle.close > asiaLow;
    const newPdhSweep = !pdhConsumed && Number.isFinite(currentPdh)
      && candle.high > currentPdh && candle.close < currentPdh;
    const newPdlSweep = !pdlConsumed && Number.isFinite(currentPdl)
      && candle.low < currentPdl && candle.close > currentPdl;
    const newPwhSweep = !pwhConsumed && Number.isFinite(currentPwh)
      && candle.high > currentPwh && candle.close < currentPwh;
    const newPwlSweep = !pwlConsumed && Number.isFinite(currentPwl)
      && candle.low < currentPwl && candle.close > currentPwl;

    if (newBslSweep) {
      bslConsumed = true;
      lastBuySweepBar = index;
    }
    if (newSslSweep) {
      sslConsumed = true;
      lastSellSweepBar = index;
    }
    if (newAsiaHighSweep || newPdhSweep || newPwhSweep) lastBuySweepBar = index;
    if (newAsiaLowSweep || newPdlSweep || newPwlSweep) lastSellSweepBar = index;

    if (!inAsia && !asiaHighConsumed && Number.isFinite(asiaHigh) && candle.high >= asiaHigh) asiaHighConsumed = true;
    if (!inAsia && !asiaLowConsumed && Number.isFinite(asiaLow) && candle.low <= asiaLow) asiaLowConsumed = true;
    if (!pdhConsumed && Number.isFinite(currentPdh) && candle.high >= currentPdh) pdhConsumed = true;
    if (!pdlConsumed && Number.isFinite(currentPdl) && candle.low <= currentPdl) pdlConsumed = true;
    if (!pwhConsumed && Number.isFinite(currentPwh) && candle.high >= currentPwh) pwhConsumed = true;
    if (!pwlConsumed && Number.isFinite(currentPwl) && candle.low <= currentPwl) pwlConsumed = true;

    const rawBreakBull = !bslBroken && Number.isFinite(lastHigh) && previous
      && candle.close > lastHigh && previous.close <= lastHigh;
    const rawBreakBear = !sslBroken && Number.isFinite(lastLow) && previous
      && candle.close < lastLow && previous.close >= lastLow;
    if (rawBreakBull) {
      trend = 'BULLISH';
      bslBroken = true;
    }
    if (rawBreakBear) {
      trend = 'BEARISH';
      sslBroken = true;
    }
    if (index === candles.length - 1) {
      finalRawBreakBull = rawBreakBull;
      finalRawBreakBear = rawBreakBear;
    }

    previousAsia = inAsia;
    previousMakassarDate = makassar.dateKey;
  }

  const finalIndex = candles.length - 1;
  const close = candles.at(-1)?.close;
  const bsl = nearestTarget([
    { name: 'BSL', level: !bslConsumed && !bslBroken ? lastHigh : null },
    { name: 'ASIA HIGH', level: !asiaHighConsumed ? asiaHigh : null },
    { name: 'PDH', level: !pdhConsumed ? currentPdh : null },
    { name: 'PWH', level: !pwhConsumed ? currentPwh : null }
  ], 'BSL', close);
  const ssl = nearestTarget([
    { name: 'SSL', level: !sslConsumed && !sslBroken ? lastLow : null },
    { name: 'ASIA LOW', level: !asiaLowConsumed ? asiaLow : null },
    { name: 'PDL', level: !pdlConsumed ? currentPdl : null },
    { name: 'PWL', level: !pwlConsumed ? currentPwl : null }
  ], 'SSL', close);

  return {
    trend,
    bsl,
    ssl,
    recentBuySweep: Number.isInteger(lastBuySweepBar) && finalIndex - lastBuySweepBar <= sweepMemoryBars,
    recentSellSweep: Number.isInteger(lastSellSweepBar) && finalIndex - lastSellSweepBar <= sweepMemoryBars,
    rawBreakBull: finalRawBreakBull,
    rawBreakBear: finalRawBreakBear,
    inAsia: isAsia(makassarParts(candles.at(-1).time).minutes)
  };
}

function htfDirectionSnapshot(h4Candles) {
  const values = cleanCandles(h4Candles);
  if (values.length < 22) return { bull: false, bear: false };
  const closes = values.map(item => item.close);
  const ema20 = emaSeries(closes, 20);
  const close = closes.at(-1);
  const current = ema20.at(-1);
  const previous = ema20.at(-2);
  return {
    bull: close > current && current >= previous,
    bear: close < current && current <= previous
  };
}

export function scoreLiquidityDraw({
  distanceLocation = 0.5,
  htfDirection = 0,
  structureDirection = 0,
  emaDirection = 0,
  priceDirection = 0,
  sweepDirection = 0,
  rangeDirection = 0,
  eventDirection = 0,
  emaSlopeAtr = 0,
  bodyAtr = 0,
  rejectionDirection = 0,
  upperLiquidityRejection = false,
  lowerLiquidityRejection = false,
  supported = true,
  inAsia = false,
  hasTwoSidedLiquidity = true,
  threshold = THRESHOLD
} = {}) {
  const predictionLogit = 5.0 * (distanceLocation - 0.50)
    + 0.40 * htfDirection
    + 0.50 * structureDirection
    + 0.40 * emaDirection
    + 0.20 * priceDirection
    + 0.60 * sweepDirection
    + 0.25 * rangeDirection
    + 0.30 * eventDirection
    + 0.25 * clamp(emaSlopeAtr, -2, 2)
    + 0.15 * clamp(bodyAtr, -2, 2)
    + 0.40 * rejectionDirection;
  const rawBslProbability = hasTwoSidedLiquidity
    ? 100 / (1 + Math.exp(-predictionLogit))
    : 50;
  const bslPercent = Math.round(clamp(rawBslProbability, 1, 99));
  const sslPercent = 100 - bslPercent;
  const bslHighConfidence = supported && !inAsia && hasTwoSidedLiquidity
    && bslPercent >= threshold && !upperLiquidityRejection;
  const sslHighConfidence = supported && !inAsia && hasTwoSidedLiquidity
    && sslPercent >= threshold && !lowerLiquidityRejection;
  return {
    predictionLogit,
    bslPercent,
    sslPercent,
    destination: bslHighConfidence ? 'BSL' : sslHighConfidence ? 'SSL' : null,
    confidence: bslHighConfidence ? bslPercent : sslHighConfidence ? sslPercent : Math.max(bslPercent, sslPercent),
    valid: bslHighConfidence || sslHighConfidence
  };
}

export function calculateLiquidityDrawContext({
  candles,
  tf,
  h4Candles = [],
  dailyCandles = [],
  weeklyCandles = [],
  currentPrice = null
} = {}) {
  const values = cleanCandles(candles);
  const base = {
    version: '1.0.0',
    model: 'AMY_LIQUIDITY_DRAW_FIRST_HIT_97',
    purpose: 'CONTEXT_ONLY',
    threshold: THRESHOLD,
    researchLockSha256: RESEARCH_LOCK_SHA256,
    sourceIndicatorBlobSha: SOURCE_INDICATOR_BLOB_SHA,
    tf: String(tf || ''),
    status: 'ABSTAIN',
    destination: null,
    targetName: null,
    targetLevel: null,
    confidence: null,
    bslConfidence: null,
    sslConfidence: null,
    distanceAtr: null,
    atr: null,
    reason: 'Belum ada context yang memenuhi threshold 97.',
    disclaimer: 'Informasi target first-hit, bukan sinyal entry.'
  };
  if (!SUPPORTED_TIMEFRAMES.has(base.tf)) {
    return { ...base, status: 'UNSUPPORTED', reason: 'Model tervalidasi hanya untuk M15 dan H1.' };
  }
  if (values.length < 100) {
    return { ...base, status: 'INSUFFICIENT_DATA', reason: 'Minimal 100 candle closed diperlukan.' };
  }

  const atrValues = wilderAtrSeries(values, 14);
  const atr = finite(atrValues.at(-1), NaN);
  if (!Number.isFinite(atr) || atr <= 0) {
    return { ...base, status: 'INSUFFICIENT_DATA', reason: 'ATR14 belum tersedia.' };
  }

  const state = simulateLiquidityState(
    values,
    cleanCandles(dailyCandles),
    cleanCandles(weeklyCandles),
    base.tf
  );
  const close = values.at(-1).close;
  const livePrice = finite(currentPrice, close);
  const bslDistance = state.bsl ? state.bsl.level - close : NaN;
  const sslDistance = state.ssl ? close - state.ssl.level : NaN;
  const hasTwoSidedLiquidity = Number.isFinite(bslDistance) && Number.isFinite(sslDistance)
    && bslDistance > MINTICK && sslDistance > MINTICK;

  const closes = values.map(item => item.close);
  const ema21 = emaSeries(closes, 21);
  const ema34 = emaSeries(closes, 34);
  const ema90 = emaSeries(closes, 90);
  const last = values.at(-1);
  const ema1 = ema21.at(-1);
  const ema2 = ema34.at(-1);
  const ema3 = ema90.at(-1);
  const emaBull = ema1 > ema2 && ema2 > ema3;
  const emaBear = ema1 < ema2 && ema2 < ema3;
  const priceBull = close >= ema2 && ema2 >= ema3;
  const priceBear = close <= ema2 && ema2 <= ema3;
  const htf = htfDirectionSnapshot(h4Candles);
  const lookback = values.slice(-80);
  const pdHigh = Math.max(...lookback.map(item => item.high));
  const pdLow = Math.min(...lookback.map(item => item.low));
  const pdEq = (pdHigh + pdLow) / 2;
  const inDiscount = close < pdEq;
  const inPremium = close > pdEq;
  const body = Math.abs(last.close - last.open);
  const barRange = Math.max(last.high - last.low, MINTICK);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const upperRejectionCandle = upperWick >= Math.max(body * 0.75, atr * 0.10)
    && last.close <= last.high - barRange * 0.35;
  const lowerRejectionCandle = lowerWick >= Math.max(body * 0.75, atr * 0.10)
    && last.close >= last.low + barRange * 0.35;
  const upperLiquidityRejection = upperRejectionCandle && state.bsl
    && last.high >= state.bsl.level - atr * 0.25 && last.close < state.bsl.level;
  const lowerLiquidityRejection = lowerRejectionCandle && state.ssl
    && last.low <= state.ssl.level + atr * 0.25 && last.close > state.ssl.level;
  const rejectionDirection = (lowerLiquidityRejection ? 1 : 0) - (upperLiquidityRejection ? 1 : 0);
  const distanceLocation = hasTwoSidedLiquidity ? sslDistance / (bslDistance + sslDistance) : 0.5;
  const emaSlopeAtr = ema21.length >= 4 ? clamp((ema1 - ema21.at(-4)) / atr, -2, 2) : 0;
  const bodyAtr = clamp((last.close - last.open) / atr, -2, 2);

  const scored = scoreLiquidityDraw({
    distanceLocation,
    htfDirection: (htf.bull ? 1 : 0) - (htf.bear ? 1 : 0),
    structureDirection: state.trend === 'BULLISH' ? 1 : state.trend === 'BEARISH' ? -1 : 0,
    emaDirection: (emaBull ? 1 : 0) - (emaBear ? 1 : 0),
    priceDirection: (priceBull ? 1 : 0) - (priceBear ? 1 : 0),
    sweepDirection: (state.recentSellSweep ? 1 : 0) - (state.recentBuySweep ? 1 : 0),
    rangeDirection: (inDiscount ? 1 : 0) - (inPremium ? 1 : 0),
    eventDirection: (state.rawBreakBull ? 1 : 0) - (state.rawBreakBear ? 1 : 0),
    emaSlopeAtr,
    bodyAtr,
    rejectionDirection,
    upperLiquidityRejection,
    lowerLiquidityRejection,
    supported: true,
    inAsia: state.inAsia,
    hasTwoSidedLiquidity,
    threshold: THRESHOLD
  });

  const statusReason = !hasTwoSidedLiquidity
    ? 'BSL dan SSL aktif belum lengkap.'
    : state.inAsia
      ? 'Asia range masih dibangun; model abstain.'
      : upperLiquidityRejection && scored.bslPercent > scored.sslPercent
        ? 'Ada rejection di liquidity atas; model abstain.'
        : lowerLiquidityRejection && scored.sslPercent > scored.bslPercent
          ? 'Ada rejection di liquidity bawah; model abstain.'
          : `Confidence tertinggi ${scored.confidence}% masih di bawah threshold ${THRESHOLD}.`;

  if (!scored.valid) {
    return {
      ...base,
      bslConfidence: scored.bslPercent,
      sslConfidence: scored.sslPercent,
      confidence: scored.confidence,
      atr,
      bslTarget: state.bsl,
      sslTarget: state.ssl,
      reason: statusReason
    };
  }

  const target = scored.destination === 'BSL' ? state.bsl : state.ssl;
  return {
    ...base,
    status: 'VALID',
    destination: scored.destination,
    targetName: target.name,
    targetLevel: target.level,
    confidence: scored.confidence,
    bslConfidence: scored.bslPercent,
    sslConfidence: scored.sslPercent,
    atr,
    distanceAtr: Math.abs(target.level - livePrice) / atr,
    bslTarget: state.bsl,
    sslTarget: state.ssl,
    reason: `${target.name} diproyeksikan tersentuh lebih dahulu dalam context 72 jam.`,
    calculatedAt: last.time * 1000
  };
}

export const LIQUIDITY_DRAW_CONTEXT_CONFIG = Object.freeze({
  threshold: THRESHOLD,
  supportedTimeframes: [...SUPPORTED_TIMEFRAMES],
  researchLockSha256: RESEARCH_LOCK_SHA256,
  sourceIndicatorBlobSha: SOURCE_INDICATOR_BLOB_SHA,
  purpose: 'CONTEXT_ONLY'
});
