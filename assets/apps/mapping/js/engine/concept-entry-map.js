import { cleanConceptCandles, conceptNumber } from './concept-candles.js';

export const M15_ENTRY_PROFILE = Object.freeze({
  timeframe: 'M15',
  expiryBars: 36,
  tp1R: 0.35,
  tp2R: 1.75,
  slAtrPad: 0.10,
  maxRiskAtr: 6,
  sweepMemoryBars: 12,
  swingLength: 4,
  htfEmaLength: 20,
  emaLengths: [21, 34, 90],
  atrLength: 14
});

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

function sundayWeekStart(dayStart) {
  return dayStart - new Date(dayStart).getUTCDay() * DAY_MS;
}

function witaMinute(value) {
  const ms = timestampMs(value);
  if (!Number.isFinite(ms)) return -1;
  const local = new Date(ms + 8 * 60 * 60 * 1000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

function inSession(minute, start, end) {
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

function emaSeries(values, length) {
  const alpha = 2 / (length + 1);
  const output = [];
  let average = null;
  for (const value of values) {
    average = average == null ? value : alpha * value + (1 - alpha) * average;
    output.push(average);
  }
  return output;
}

function trueRange(values, index) {
  const candle = values[index];
  if (!candle) return 0;
  const previous = values[index - 1];
  if (!previous) return candle.high - candle.low;
  return Math.max(candle.high - candle.low, Math.abs(candle.high - previous.close), Math.abs(candle.low - previous.close));
}

function pineAtrSeries(values, length) {
  const ranges = values.map((_, index) => trueRange(values, index));
  const output = Array(values.length).fill(null);
  if (ranges.length < length) return output;
  let average = ranges.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
  output[length - 1] = average;
  for (let index = length; index < ranges.length; index += 1) {
    average = (average * (length - 1) + ranges[index]) / length;
    output[index] = average;
  }
  return output;
}

function pivotAt(values, confirmationIndex, direction, length) {
  const originIndex = confirmationIndex - length;
  if (originIndex < length) return null;
  const price = direction === 'HIGH' ? values[originIndex].high : values[originIndex].low;
  for (let index = originIndex - length; index < originIndex; index += 1) {
    if (direction === 'HIGH' ? price <= values[index].high : price >= values[index].low) return null;
  }
  for (let index = originIndex + 1; index <= originIndex + length; index += 1) {
    if (direction === 'HIGH' ? price <= values[index].high : price >= values[index].low) return null;
  }
  return direction === 'HIGH'
    ? { index: originIndex, high: price }
    : { index: originIndex, low: price };
}

function cleanDaily(candles) {
  const unique = new Map();
  for (const candle of cleanConceptCandles(candles)) {
    const dayStart = utcDayStart(candle.time);
    if (Number.isFinite(dayStart)) unique.set(dayStart, { ...candle, dayStart });
  }
  return [...unique.values()].sort((a, b) => a.dayStart - b.dayStart);
}

function previousDay(daily, dayStart) {
  for (let index = daily.length - 1; index >= 0; index -= 1) {
    if (daily[index].dayStart < dayStart) return daily[index];
  }
  return null;
}

function previousWeek(daily, weekStart) {
  if (!daily.length) return null;
  const start = weekStart - 7 * DAY_MS;
  if (start < daily[0].dayStart) return null;
  const rows = daily.filter(candle => candle.dayStart >= start && candle.dayStart < weekStart);
  if (!rows.length) return null;
  return { high: Math.max(...rows.map(candle => candle.high)), low: Math.min(...rows.map(candle => candle.low)) };
}

function htfContextAt(htf, htfEma, eventTime, cursor) {
  while (cursor + 1 < htf.length && htf[cursor + 1].time <= eventTime) cursor += 1;
  const previous = cursor - 1;
  if (previous < 1) return { cursor, ready: false };
  const close = htf[previous].close;
  const ema = htfEma[previous];
  const emaPrevious = htfEma[previous - 1];
  return {
    cursor,
    ready: [close, ema, emaPrevious].every(Number.isFinite),
    bullish: close > ema && ema >= emaPrevious,
    bearish: close < ema && ema <= emaPrevious
  };
}

export function createM15EntryPlan({
  direction,
  candle,
  index,
  atr,
  protectedSwing,
  sweep,
  profile = M15_ENTRY_PROFILE
}) {
  const bullish = direction === 'BULLISH';
  const entry = candle.close;
  const rawStop = bullish
    ? Math.min(candle.low, protectedSwing) - atr * profile.slAtrPad
    : Math.max(candle.high, protectedSwing) + atr * profile.slAtrPad;
  const risk = bullish ? entry - rawStop : rawStop - entry;
  if (!(risk > 0) || risk > atr * profile.maxRiskAtr) return null;
  const sign = bullish ? 1 : -1;
  return {
    id: `M15_ENTRY_MAP:${direction}:${index}:${entry.toFixed(5)}`,
    type: 'M15 ENTRY MAP',
    direction,
    dir: bullish ? 'BUY' : 'SELL',
    tf: 'M15',
    startIndex: index,
    startTime: candle.time,
    entry,
    entryLow: entry,
    entryHigh: entry,
    initialSl: rawStop,
    sl: rawStop,
    risk,
    tp1: entry + sign * risk * profile.tp1R,
    tp2: entry + sign * risk * profile.tp2R,
    tp1Hit: false,
    tp1Index: -1,
    endIndex: -1,
    live: true,
    lifecycleStatus: bullish ? 'LONG ACTIVE' : 'SHORT ACTIVE',
    sweepType: sweep?.type || (bullish ? 'SSL' : 'BSL'),
    sweepIndex: sweep?.index ?? -1,
    expiryBars: profile.expiryBars,
    profile: 'M15',
    executionMode: 'M15_ENTRY_MAP',
    scoreMode: 'RULE_BASED',
    tradeManagement: {
      tp1R: profile.tp1R,
      moveStopToBreakEven: true,
      tp2R: profile.tp2R,
      expiryBars: profile.expiryBars
    }
  };
}

export function advanceM15EntryLifecycle(plan, candle, index, profile = M15_ENTRY_PROFILE) {
  if (!plan?.live || index <= plan.startIndex) return plan;
  const bullish = plan.direction === 'BULLISH';
  const slHit = bullish ? candle.low <= plan.sl : candle.high >= plan.sl;
  const tp1Hit = bullish ? candle.high >= plan.tp1 : candle.low <= plan.tp1;
  const tp2Hit = bullish ? candle.high >= plan.tp2 : candle.low <= plan.tp2;
  const breakEvenHit = bullish ? candle.low <= plan.entry : candle.high >= plan.entry;

  if (!plan.tp1Hit) {
    if (slHit) {
      plan.live = false;
      plan.lifecycleStatus = 'SL HIT';
      plan.endIndex = index;
    } else if (tp2Hit) {
      plan.tp1Hit = true;
      plan.live = false;
      plan.lifecycleStatus = 'TP2 HIT';
      plan.endIndex = index;
    } else if (tp1Hit) {
      plan.tp1Hit = true;
      plan.tp1Index = index;
      plan.lifecycleStatus = 'TP1 HIT / BE';
      plan.sl = plan.entry;
    }
  } else if (tp2Hit) {
    plan.live = false;
    plan.lifecycleStatus = 'TP2 HIT';
    plan.endIndex = index;
  } else if (breakEvenHit) {
    plan.live = false;
    plan.lifecycleStatus = 'TP1 / BE';
    plan.endIndex = index;
  }

  if (plan.live && index - plan.startIndex >= profile.expiryBars) {
    plan.live = false;
    plan.lifecycleStatus = 'EXPIRED';
    plan.endIndex = index;
  }
  return plan;
}

function setupView(plan, values) {
  if (!plan) return null;
  const terminal = !plan.live;
  const activeStatus = plan.tp1Hit ? 'TP1 HIT / BE' : 'READY SETUP';
  return {
    ...plan,
    price: values.at(-1)?.close || plan.entry,
    status: terminal ? plan.lifecycleStatus : activeStatus,
    grade: 'RULE-BASED',
    score: 0,
    reason: `${plan.sweepType} disapu, MSS ${plan.direction} terkonfirmasi, entry pada close candle MSS.`,
    components: {
      model: 'Sweep → MSS → Entry Map',
      sweep: plan.sweepType,
      mss: 'Valid',
      entry: 'Close candle MSS',
      htf: 'aligned'
    },
    conflictCheck: {
      hasFatalConflict: false,
      conflictLevel: 'NONE',
      conflicts: [],
      recommendation: plan.live ? 'VALID' : 'CLOSED',
      rr: M15_ENTRY_PROFILE.tp2R,
      plannedEntry: plan.entry,
      mainTarget: plan.tp2
    },
    lifecycle: {
      status: plan.lifecycleStatus,
      live: plan.live,
      tp1Hit: plan.tp1Hit,
      startIndex: plan.startIndex,
      tp1Index: plan.tp1Index,
      endIndex: plan.endIndex,
      barsElapsed: (plan.endIndex >= 0 ? plan.endIndex : values.length - 1) - plan.startIndex
    }
  };
}

export function detectM15EntryMap(candles, {
  tf = 'M15',
  htfCandles = {},
  profile = M15_ENTRY_PROFILE,
  historyLimit = 10
} = {}) {
  const values = cleanConceptCandles(candles);
  if (tf !== 'M15' || values.length < Math.max(100, profile.emaLengths.at(-1) + profile.swingLength * 2 + 1)) {
    return { supported: tf === 'M15', profile: 'M15', setup: null, activeSetup: null, setupCount: 0, history: [] };
  }

  const closes = values.map(candle => candle.close);
  const emaFast = emaSeries(closes, profile.emaLengths[0]);
  const emaMid = emaSeries(closes, profile.emaLengths[1]);
  const emaSlow = emaSeries(closes, profile.emaLengths[2]);
  const atr = pineAtrSeries(values, profile.atrLength);
  const htf = cleanConceptCandles(htfCandles?.H4 || []);
  const htfEma = emaSeries(htf.map(candle => candle.close), profile.htfEmaLength);
  const daily = cleanDaily(htfCandles?.D1 || []);

  let htfCursor = -1;
  let lastHigh = null;
  let lastLow = null;
  let bslConsumed = false;
  let sslConsumed = false;
  let bslBroken = false;
  let sslBroken = false;
  let trend = 'NEUTRAL';
  let asiaHigh = null;
  let asiaLow = null;
  let asiaHighConsumed = false;
  let asiaLowConsumed = false;
  let previousInAsia = false;
  let currentDay = NaN;
  let currentWeek = NaN;
  let pdh = null;
  let pdl = null;
  let pwh = null;
  let pwl = null;
  let pdhConsumed = false;
  let pdlConsumed = false;
  let pwhConsumed = false;
  let pwlConsumed = false;
  let latestBuySweep = null;
  let latestSellSweep = null;
  let currentPlan = null;
  const history = [];

  for (let index = 0; index < values.length; index += 1) {
    const candle = values[index];
    const minute = witaMinute(candle.time);
    const inAsia = inSession(minute, 360, 840);
    const inLondon = inSession(minute, 840, 1080);
    const inNewYork = inSession(minute, 1170, 240);
    const validSession = inLondon || inNewYork;
    const dayStart = utcDayStart(candle.time);
    const weekStart = sundayWeekStart(dayStart);

    if (dayStart !== currentDay) {
      const previous = previousDay(daily, dayStart);
      pdh = previous?.high ?? null;
      pdl = previous?.low ?? null;
      pdhConsumed = false;
      pdlConsumed = false;
      currentDay = dayStart;
    }
    if (weekStart !== currentWeek) {
      const previous = previousWeek(daily, weekStart);
      pwh = previous?.high ?? null;
      pwl = previous?.low ?? null;
      pwhConsumed = false;
      pwlConsumed = false;
      currentWeek = weekStart;
    }

    const asiaStart = inAsia && !previousInAsia;
    if (asiaStart) {
      asiaHigh = candle.high;
      asiaLow = candle.low;
      asiaHighConsumed = false;
      asiaLowConsumed = false;
    } else if (inAsia) {
      asiaHigh = asiaHigh == null ? candle.high : Math.max(asiaHigh, candle.high);
      asiaLow = asiaLow == null ? candle.low : Math.min(asiaLow, candle.low);
    }
    previousInAsia = inAsia;

    const high = pivotAt(values, index, 'HIGH', profile.swingLength);
    const low = pivotAt(values, index, 'LOW', profile.swingLength);
    if (high) {
      lastHigh = high;
      bslConsumed = false;
      bslBroken = false;
    }
    if (low) {
      lastLow = low;
      sslConsumed = false;
      sslBroken = false;
    }

    const newBslSweep = !bslConsumed && lastHigh && candle.high > lastHigh.high && candle.close < lastHigh.high;
    const newSslSweep = !sslConsumed && lastLow && candle.low < lastLow.low && candle.close > lastLow.low;
    const newAsiaHighSweep = validSession && !inAsia && !asiaHighConsumed && asiaHigh != null && candle.high > asiaHigh && candle.close < asiaHigh;
    const newAsiaLowSweep = validSession && !inAsia && !asiaLowConsumed && asiaLow != null && candle.low < asiaLow && candle.close > asiaLow;
    const asiaHighReached = !inAsia && !asiaHighConsumed && asiaHigh != null && candle.high >= asiaHigh;
    const asiaLowReached = !inAsia && !asiaLowConsumed && asiaLow != null && candle.low <= asiaLow;
    const newPdhSweep = !pdhConsumed && pdh != null && candle.high > pdh && candle.close < pdh;
    const newPdlSweep = !pdlConsumed && pdl != null && candle.low < pdl && candle.close > pdl;
    const pdhReached = !pdhConsumed && pdh != null && candle.high >= pdh;
    const pdlReached = !pdlConsumed && pdl != null && candle.low <= pdl;
    const newPwhSweep = !pwhConsumed && pwh != null && candle.high > pwh && candle.close < pwh;
    const newPwlSweep = !pwlConsumed && pwl != null && candle.low < pwl && candle.close > pwl;
    const pwhReached = !pwhConsumed && pwh != null && candle.high >= pwh;
    const pwlReached = !pwlConsumed && pwl != null && candle.low <= pwl;

    if (newBslSweep) { bslConsumed = true; latestBuySweep = { index, type: 'BSL' }; }
    if (newSslSweep) { sslConsumed = true; latestSellSweep = { index, type: 'SSL' }; }
    if (asiaHighReached) asiaHighConsumed = true;
    if (asiaLowReached) asiaLowConsumed = true;
    if (newAsiaHighSweep) latestBuySweep = { index, type: 'ASIA HIGH' };
    if (newAsiaLowSweep) latestSellSweep = { index, type: 'ASIA LOW' };
    if (pdhReached) pdhConsumed = true;
    if (pdlReached) pdlConsumed = true;
    if (pwhReached) pwhConsumed = true;
    if (pwlReached) pwlConsumed = true;
    if (newPdhSweep) latestBuySweep = { index, type: 'PDH' };
    if (newPdlSweep) latestSellSweep = { index, type: 'PDL' };
    if (newPwhSweep) latestBuySweep = { index, type: 'PWH' };
    if (newPwlSweep) latestSellSweep = { index, type: 'PWL' };

    const previousClose = values[index - 1]?.close;
    const breakBullish = Boolean(index && !bslBroken && lastHigh && candle.close > lastHigh.high && previousClose <= lastHigh.high);
    const breakBearish = Boolean(index && !sslBroken && lastLow && candle.close < lastLow.low && previousClose >= lastLow.low);
    const mssBullish = breakBullish && trend !== 'BULLISH';
    const mssBearish = breakBearish && trend !== 'BEARISH';
    if (breakBullish) { trend = 'BULLISH'; bslBroken = true; }
    if (breakBearish) { trend = 'BEARISH'; sslBroken = true; }

    if (currentPlan?.live) advanceM15EntryLifecycle(currentPlan, candle, index, profile);

    if (!Number.isFinite(atr[index]) || !htf.length) continue;
    const htfContext = htfContextAt(htf, htfEma, candle.time, htfCursor);
    htfCursor = htfContext.cursor;
    if (!htfContext.ready) continue;

    const emaBullish = emaFast[index] > emaMid[index] && emaMid[index] > emaSlow[index];
    const emaBearish = emaFast[index] < emaMid[index] && emaMid[index] < emaSlow[index];
    const mappingDirection = htfContext.bullish && trend === 'BULLISH' && emaBullish ? 'BULLISH'
      : htfContext.bearish && trend === 'BEARISH' && emaBearish ? 'BEARISH' : 'NEUTRAL';
    const recentBuySweep = latestBuySweep && index - latestBuySweep.index <= profile.sweepMemoryBars;
    const recentSellSweep = latestSellSweep && index - latestSellSweep.index <= profile.sweepMemoryBars;
    const range = Math.max(candle.high - candle.low, 0.0000001);
    const body = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;

    const bslCandidates = [
      !bslConsumed && !bslBroken && lastHigh?.high > candle.close ? lastHigh.high : null,
      !asiaHighConsumed && asiaHigh > candle.close ? asiaHigh : null,
      !pdhConsumed && pdh > candle.close ? pdh : null,
      !pwhConsumed && pwh > candle.close ? pwh : null
    ].filter(Number.isFinite);
    const nearestBsl = bslCandidates.length ? Math.min(...bslCandidates) : null;
    const sslCandidates = [
      !sslConsumed && !sslBroken && lastLow?.low < candle.close ? lastLow.low : null,
      !asiaLowConsumed && asiaLow < candle.close ? asiaLow : null,
      !pdlConsumed && pdl < candle.close ? pdl : null,
      !pwlConsumed && pwl < candle.close ? pwl : null
    ].filter(Number.isFinite);
    const nearestSsl = sslCandidates.length ? Math.max(...sslCandidates) : null;

    const upperRejection = upperWick >= Math.max(body * 0.75, atr[index] * 0.10)
      && candle.close <= candle.high - range * 0.35
      && nearestBsl != null && candle.high >= nearestBsl - atr[index] * 0.25 && candle.close < nearestBsl;
    const lowerRejection = lowerWick >= Math.max(body * 0.75, atr[index] * 0.10)
      && candle.close >= candle.low + range * 0.35
      && nearestSsl != null && candle.low <= nearestSsl + atr[index] * 0.25 && candle.close > nearestSsl;
    const bullishCandle = candle.close >= candle.low + range * 0.70;
    const bearishCandle = candle.close <= candle.high - range * 0.70;
    const setupAvailable = !currentPlan?.live;
    const newLong = setupAvailable && mssBullish && validSession && htfContext.bullish && emaBullish
      && recentSellSweep && mappingDirection === 'BULLISH' && bullishCandle && !upperRejection && lastLow;
    const newShort = setupAvailable && mssBearish && validSession && htfContext.bearish && emaBearish
      && recentBuySweep && mappingDirection === 'BEARISH' && bearishCandle && !lowerRejection && lastHigh;

    if (newLong || newShort) {
      const plan = createM15EntryPlan({
        direction: newLong ? 'BULLISH' : 'BEARISH',
        candle,
        index,
        atr: atr[index],
        protectedSwing: newLong ? lastLow.low : lastHigh.high,
        sweep: newLong ? latestSellSweep : latestBuySweep,
        profile
      });
      if (plan) {
        history.push(plan);
        currentPlan = plan;
      }
    }
  }

  const setup = setupView(currentPlan, values);
  return {
    supported: true,
    profile: 'M15',
    setup,
    activeSetup: setup?.live ? setup : null,
    setupCount: history.length,
    history: history.slice(-Math.max(1, historyLimit)).map(plan => setupView(plan, values))
  };
}
