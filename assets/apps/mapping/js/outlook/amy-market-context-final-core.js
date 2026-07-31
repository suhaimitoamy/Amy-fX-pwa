export const AMY_MARKET_CONTEXT_FINAL_CONFIG = Object.freeze({
  contextTimeframe: 'M15',
  executionTimeframe: 'M5',
  swingLength: 3,
  atrPeriod: 14,
  meanBodyPeriod: 20,
  fvgBodyMult: 1.20,
  fvgMinGapAtr: 0.15,
  fvgMaxGapAtr: 0.75,
  obBodyMult: 2.00,
  obMinWidthAtr: 0.30,
  obMaxWidthAtr: 1.50,
  acceptCloses: 3,
  acceptContinuationAtr: 0.30,
  poiMaxDistanceAtr: 1.25,
  dolMaxDistanceAtr: 0.75,
  dolMinClosePosition: 0.80,
  asiaEntryMinAtr: 0.35,
  asiaEntryMaxAtr: 1.00,
  asiaEntryRewardRisk: 0.20,
  fourHoursM5: 48
});

const MINUTE = 60_000;
const INTERVAL_MS = Object.freeze({ M1: MINUTE, M5: 5 * MINUTE, M15: 15 * MINUTE });
const zoneFormatters = new Map();

function num(value, fallback = NaN) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function candleTime(candle) {
  const raw = num(candle?.time, Date.parse(candle?.datetime || ''));
  if (!Number.isFinite(raw)) return null;
  return raw > 0 && raw < 1e12 ? raw * 1000 : raw;
}

function normalizeCandle(candle) {
  const open = num(candle?.open);
  const high = num(candle?.high);
  const low = num(candle?.low);
  const close = num(candle?.close);
  const time = candleTime(candle);
  if (![open, high, low, close, time].every(Number.isFinite) || high < low) return null;
  return { ...candle, open, high, low, close, time };
}

export function normalizeCandles(candles = []) {
  return (Array.isArray(candles) ? candles : [])
    .map(normalizeCandle)
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
}

function trueRange(candle, previousClose) {
  if (!Number.isFinite(previousClose)) return Math.max(0, candle.high - candle.low);
  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - previousClose),
    Math.abs(candle.low - previousClose)
  );
}

export function buildAtrSeries(candles, period = AMY_MARKET_CONTEXT_FINAL_CONFIG.atrPeriod) {
  const values = normalizeCandles(candles);
  const output = Array(values.length).fill(NaN);
  const tr = values.map((candle, index) => trueRange(candle, values[index - 1]?.close));
  if (values.length < period) return output;
  let seed = 0;
  for (let index = 0; index < period; index += 1) seed += tr[index];
  output[period - 1] = seed / period;
  for (let index = period; index < values.length; index += 1) {
    output[index] = ((output[index - 1] * (period - 1)) + tr[index]) / period;
  }
  return output;
}

function bodyMean(values, index, period) {
  const start = Math.max(0, index + 1 - period);
  let total = 0;
  let count = 0;
  for (let cursor = start; cursor <= index; cursor += 1) {
    total += Math.abs(values[cursor].close - values[cursor].open);
    count += 1;
  }
  return count ? total / count : NaN;
}

function pivotHigh(values, confirmationIndex, strength) {
  const pivot = confirmationIndex - strength;
  if (pivot - strength < 0 || pivot + strength > confirmationIndex) return NaN;
  const price = values[pivot].high;
  for (let offset = 1; offset <= strength; offset += 1) {
    if (!(price > values[pivot - offset].high && price > values[pivot + offset].high)) return NaN;
  }
  return price;
}

function pivotLow(values, confirmationIndex, strength) {
  const pivot = confirmationIndex - strength;
  if (pivot - strength < 0 || pivot + strength > confirmationIndex) return NaN;
  const price = values[pivot].low;
  for (let offset = 1; offset <= strength; offset += 1) {
    if (!(price < values[pivot - offset].low && price < values[pivot + offset].low)) return NaN;
  }
  return price;
}

function updateBullZone(zone, candle, atrValue, settings, index) {
  if (!zone || zone.status <= 0 || zone.status >= 4 || index <= zone.createdIndex) return zone;
  const next = { ...zone };
  const midpoint = (next.high + next.low) / 2;
  const touched = candle.low <= next.high && candle.high >= next.low;
  if (candle.close < next.low) {
    next.outside += 1;
    if (next.outside >= settings.acceptCloses && next.low - candle.close >= atrValue * settings.acceptContinuationAtr) next.status = 4;
  } else {
    next.outside = 0;
    if (next.status === 1 && touched) next.status = candle.low <= midpoint ? 3 : 2;
    else if (next.status === 2 && touched && candle.low <= midpoint) next.status = 3;
  }
  return next;
}

function updateBearZone(zone, candle, atrValue, settings, index) {
  if (!zone || zone.status <= 0 || zone.status >= 4 || index <= zone.createdIndex) return zone;
  const next = { ...zone };
  const midpoint = (next.high + next.low) / 2;
  const touched = candle.high >= next.low && candle.low <= next.high;
  if (candle.close > next.high) {
    next.outside += 1;
    if (next.outside >= settings.acceptCloses && candle.close - next.high >= atrValue * settings.acceptContinuationAtr) next.status = 4;
  } else {
    next.outside = 0;
    if (next.status === 1 && touched) next.status = candle.high >= midpoint ? 3 : 2;
    else if (next.status === 2 && touched && candle.high >= midpoint) next.status = 3;
  }
  return next;
}

function cloneZone(zone, index) {
  if (!zone) return null;
  return { ...zone, mature: zone.status === 1 && index - zone.createdIndex >= 1 };
}

export function buildM15Context(candles = [], config) {
  const settings = { ...AMY_MARKET_CONTEXT_FINAL_CONFIG, ...(config || {}) };
  const values = normalizeCandles(candles);
  const atr = buildAtrSeries(values, settings.atrPeriod);
  let lastPH = NaN;
  let lastPL = NaN;
  let bias = 0;
  let invalidation = NaN;
  let bullFvg = null;
  let bearFvg = null;
  let bullOb = null;
  let bearOb = null;
  const dolEvents = [];

  for (let index = 0; index < values.length; index += 1) {
    const candle = values[index];
    const atrValue = atr[index];
    const meanBody = bodyMean(values, index, settings.meanBodyPeriod);
    const body = Math.abs(candle.close - candle.open);
    const ph = pivotHigh(values, index, settings.swingLength);
    const pl = pivotLow(values, index, settings.swingLength);
    if (Number.isFinite(ph)) lastPH = ph;
    if (Number.isFinite(pl)) lastPL = pl;

    const previous = values[index - 1];
    const bullMss = Number.isFinite(lastPH) && Number.isFinite(lastPL) && candle.close > lastPH && previous?.close <= lastPH;
    const bearMss = Number.isFinite(lastPH) && Number.isFinite(lastPL) && candle.close < lastPL && previous?.close >= lastPL;

    if (bias === 1 && Number.isFinite(invalidation) && candle.close < invalidation) {
      if (bearMss) {
        bias = -1;
        invalidation = lastPH;
      } else {
        bias = 0;
        invalidation = NaN;
      }
    } else if (bias === -1 && Number.isFinite(invalidation) && candle.close > invalidation) {
      if (bullMss) {
        bias = 1;
        invalidation = lastPL;
      } else {
        bias = 0;
        invalidation = NaN;
      }
    } else if (bullMss && bias !== 1) {
      bias = 1;
      invalidation = lastPL;
    } else if (bearMss && bias !== -1) {
      bias = -1;
      invalidation = lastPH;
    }

    const left = values[index - 2];
    if (left && Number.isFinite(atrValue) && atrValue > 0 && Number.isFinite(meanBody)) {
      const bullRaw = candle.low > left.high;
      const bearRaw = candle.high < left.low;
      const bullGapAtr = bullRaw ? (candle.low - left.high) / atrValue : NaN;
      const bearGapAtr = bearRaw ? (left.low - candle.high) / atrValue : NaN;
      if (bullRaw && candle.close > candle.open && body >= meanBody * settings.fvgBodyMult
        && bullGapAtr >= settings.fvgMinGapAtr && bullGapAtr <= settings.fvgMaxGapAtr) {
        bullFvg = { high: candle.low, low: left.high, status: 1, createdIndex: index, createdTime: candle.time, outside: 0 };
      }
      if (bearRaw && candle.close < candle.open && body >= meanBody * settings.fvgBodyMult
        && bearGapAtr >= settings.fvgMinGapAtr && bearGapAtr <= settings.fvgMaxGapAtr) {
        bearFvg = { high: left.low, low: candle.high, status: 1, createdIndex: index, createdTime: candle.time, outside: 0 };
      }
    }

    const prior = values[index - 1];
    if (prior && Number.isFinite(atrValue) && atrValue > 0 && Number.isFinite(meanBody)) {
      const bullHigh = prior.open;
      const bullLow = prior.low;
      const bearHigh = prior.high;
      const bearLow = prior.open;
      const bullWidthAtr = Math.abs(bullHigh - bullLow) / atrValue;
      const bearWidthAtr = Math.abs(bearHigh - bearLow) / atrValue;
      if (candle.close > candle.open && body > meanBody * settings.obBodyMult && candle.close > prior.high
        && prior.close < prior.open && bullWidthAtr >= settings.obMinWidthAtr && bullWidthAtr <= settings.obMaxWidthAtr) {
        bullOb = { high: bullHigh, low: bullLow, status: 1, createdIndex: index, createdTime: candle.time, outside: 0 };
      }
      if (candle.close < candle.open && body > meanBody * settings.obBodyMult && candle.close < prior.low
        && prior.close > prior.open && bearWidthAtr >= settings.obMinWidthAtr && bearWidthAtr <= settings.obMaxWidthAtr) {
        bearOb = { high: bearHigh, low: bearLow, status: 1, createdIndex: index, createdTime: candle.time, outside: 0 };
      }
    }

    if (Number.isFinite(atrValue) && atrValue > 0) {
      bullFvg = updateBullZone(bullFvg, candle, atrValue, settings, index);
      bearFvg = updateBearZone(bearFvg, candle, atrValue, settings, index);
      bullOb = updateBullZone(bullOb, candle, atrValue, settings, index);
      bearOb = updateBearZone(bearOb, candle, atrValue, settings, index);
    }

    const bslSweep = Number.isFinite(lastPH) && candle.high > lastPH && candle.close < lastPH;
    const sslSweep = Number.isFinite(lastPL) && candle.low < lastPL && candle.close > lastPL;
    const range = Math.max(candle.high - candle.low, Number.EPSILON);
    const bullClosePosition = (candle.close - candle.low) / range;
    const bearClosePosition = (candle.high - candle.close) / range;
    const healthyBull = bias === 1 && (!Number.isFinite(invalidation) || candle.close > invalidation);
    const healthyBear = bias === -1 && (!Number.isFinite(invalidation) || candle.close < invalidation);
    const bullDistance = Number.isFinite(lastPH) && Number.isFinite(atrValue) ? (lastPH - candle.close) / atrValue : NaN;
    const bearDistance = Number.isFinite(lastPL) && Number.isFinite(atrValue) ? (candle.close - lastPL) / atrValue : NaN;

    if (sslSweep && !bslSweep && healthyBull && candle.close > candle.open
      && bullClosePosition >= settings.dolMinClosePosition && bullDistance > 0
      && bullDistance <= settings.dolMaxDistanceAtr && candle.high < lastPH) {
      dolEvents.push({ direction: 1, target: lastPH, invalidation, index, time: candle.time });
    } else if (bslSweep && !sslSweep && healthyBear && candle.close < candle.open
      && bearClosePosition >= settings.dolMinClosePosition && bearDistance > 0
      && bearDistance <= settings.dolMaxDistanceAtr && candle.low > lastPL) {
      dolEvents.push({ direction: -1, target: lastPL, invalidation, index, time: candle.time });
    }
  }

  const index = values.length - 1;
  return {
    candles: values,
    atr,
    bias,
    invalidation: Number.isFinite(invalidation) ? invalidation : null,
    lastPH: Number.isFinite(lastPH) ? lastPH : null,
    lastPL: Number.isFinite(lastPL) ? lastPL : null,
    bullFvg: cloneZone(bullFvg, index),
    bearFvg: cloneZone(bearFvg, index),
    bullOb: cloneZone(bullOb, index),
    bearOb: cloneZone(bearOb, index),
    dolEvents,
    sourceTime: values.at(-1)?.time || null,
    config: settings
  };
}

function ema(values, length) {
  if (!values.length) return NaN;
  const alpha = 2 / (length + 1);
  let current = values[0].close;
  for (let index = 1; index < values.length; index += 1) current = alpha * values[index].close + (1 - alpha) * current;
  return current;
}

function trendPack(candles) {
  const values = normalizeCandles(candles);
  if (!values.length) return { fast: null, slow: null, price: null, direction: 0, label: 'NEUTRAL' };
  const fast = ema(values, 5);
  const slow = ema(values, 15);
  const direction = fast > slow ? 1 : fast < slow ? -1 : 0;
  return {
    fast,
    slow,
    price: values.at(-1).close,
    direction,
    label: direction > 0 ? 'BULLISH' : direction < 0 ? 'BEARISH' : 'NEUTRAL'
  };
}

function activePoiScenario({ type, zone, contextBias, m5Values, m5Atr, now, settings, historicalRate, historicalPeriod }) {
  if (!zone?.mature || zone.status !== 1 || !m5Values.length) return null;
  if ((contextBias === 1 && !type.startsWith('BULL')) || (contextBias === -1 && !type.startsWith('BEAR'))) return null;
  const latest = m5Values.at(-1);
  const atrValue = m5Atr.at(-1);
  if (!(atrValue > 0)) return null;
  const outside = latest.low > zone.high || latest.high < zone.low;
  if (!outside) return null;
  const direction = latest.close > zone.high ? -1 : latest.close < zone.low ? 1 : 0;
  if (!direction) return null;
  const target = direction < 0 ? zone.high : zone.low;
  const distanceAtr = Math.abs(target - latest.close) / atrValue;
  if (distanceAtr > settings.poiMaxDistanceAtr) return null;
  const startTime = zone.createdTime + INTERVAL_MS.M15;
  const expiresAt = startTime + settings.fourHoursM5 * INTERVAL_MS.M5;
  if (now < startTime || now > expiresAt) return null;
  const zoneType = type.includes('FVG') ? 'FVG_REVISIT' : 'OB_REVISIT';
  return {
    side: direction > 0 ? 'BUY' : 'SELL',
    status: 'ACTIVE',
    setupType: zoneType,
    confidenceBand: zoneType === 'FVG_REVISIT' ? 'HIGH' : 'MODERATE',
    historicalRate,
    historicalPeriod,
    timeframe: 'M5 + M15',
    referencePrice: latest.close,
    entry: latest.close,
    target,
    invalidation: null,
    zoneLow: zone.low,
    zoneHigh: zone.high,
    distanceAtr,
    sourceTime: startTime,
    expiresAt,
    reason: zoneType === 'FVG_REVISIT'
      ? 'Fresh FVG M15 yang searah struktur masih belum disentuh; harga M5 berada di luar zona dan jaraknya masih dalam 1,25 ATR.'
      : 'Fresh Order Block M15 yang searah struktur masih belum disentuh; harga M5 berada di luar zona dan jaraknya masih dalam 1,25 ATR.'
  };
}

function evaluateDol(context, m5Values, now, settings) {
  const event = context.dolEvents.at(-1);
  if (!event || !m5Values.length) return null;
  const startTime = event.time + INTERVAL_MS.M15;
  const expiresAt = startTime + settings.fourHoursM5 * INTERVAL_MS.M5;
  if (now < startTime || now > expiresAt) return null;
  const after = m5Values.filter(candle => candle.time >= startTime);
  for (const candle of after) {
    const hit = event.direction > 0 ? candle.high >= event.target : candle.low <= event.target;
    const invalid = Number.isFinite(event.invalidation)
      && (event.direction > 0 ? candle.close < event.invalidation : candle.close > event.invalidation);
    if (hit || invalid) return null;
  }
  return {
    side: event.direction > 0 ? 'BUY' : 'SELL',
    status: 'ACTIVE',
    setupType: 'DOL',
    confidenceBand: 'MODERATE',
    historicalRate: 75.00,
    historicalPeriod: '2023–2024 combined',
    timeframe: 'M5 + M15',
    referencePrice: m5Values.at(-1).close,
    entry: m5Values.at(-1).close,
    target: event.target,
    invalidation: Number.isFinite(event.invalidation) ? event.invalidation : null,
    zoneLow: null,
    zoneHigh: null,
    distanceAtr: null,
    sourceTime: startTime,
    expiresAt,
    reason: 'Qualified liquidity sweep terjadi searah struktur M15, candle menutup kuat, dan draw on liquidity berada maksimal 0,75 ATR.'
  };
}

function dateParts(timestamp, timeZone) {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
    zoneFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(new Date(timestamp));
  const get = type => Number(parts.find(item => item.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

function dateKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function previousDateKey(parts) {
  const prior = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - 86400000);
  return `${prior.getUTCFullYear()}-${String(prior.getUTCMonth() + 1).padStart(2, '0')}-${String(prior.getUTCDate()).padStart(2, '0')}`;
}

function evaluateAsiaEntry(m1Values, m5Values, m5Atr, now, settings) {
  if (!m1Values.length || !m5Values.length) return null;
  for (let index = m5Values.length - 1; index >= 0; index -= 1) {
    const eventCandle = m5Values[index];
    const parts = dateParts(eventCandle.time, 'America/New_York');
    if (parts.hour !== 0 || parts.minute !== 0) continue;
    const sessionDate = previousDateKey(parts);
    const session = m1Values.filter(candle => {
      const local = dateParts(candle.time, 'America/New_York');
      return dateKey(local) === sessionDate && local.hour >= 20;
    });
    if (!session.length) continue;
    const asiaHigh = Math.max(...session.map(candle => candle.high));
    const asiaLow = Math.min(...session.map(candle => candle.low));
    const highValid = asiaHigh > eventCandle.high;
    const lowValid = asiaLow < eventCandle.low;
    const highDistance = highValid ? asiaHigh - eventCandle.close : NaN;
    const lowDistance = lowValid ? eventCandle.close - asiaLow : NaN;
    const direction = highValid && (!lowValid || highDistance <= lowDistance) ? 1 : lowValid ? -1 : 0;
    if (!direction) continue;
    const target = direction > 0 ? asiaHigh : asiaLow;
    const atrValue = m5Atr[index];
    if (!(atrValue > 0)) continue;
    const distanceAtr = Math.abs(target - eventCandle.close) / atrValue;
    if (distanceAtr < settings.asiaEntryMinAtr || distanceAtr > settings.asiaEntryMaxAtr) continue;
    const startTime = eventCandle.time + INTERVAL_MS.M5;
    const expiresAt = startTime + settings.fourHoursM5 * INTERVAL_MS.M5;
    if (now < startTime || now > expiresAt) return null;
    const reward = Math.abs(target - eventCandle.close);
    const stop = eventCandle.close - direction * (reward / settings.asiaEntryRewardRisk);
    for (let cursor = index + 1; cursor < m5Values.length; cursor += 1) {
      const candle = m5Values[cursor];
      const sl = direction > 0 ? candle.low <= stop : candle.high >= stop;
      const tp = direction > 0 ? candle.high >= target : candle.low <= target;
      if (sl || tp) return null;
      if (cursor - index >= settings.fourHoursM5) return null;
    }
    return {
      side: direction > 0 ? 'BUY' : 'SELL',
      status: 'ACTIVE',
      setupType: 'ASIA_ENTRY',
      confidenceBand: 'HIGH',
      historicalRate: 84.62,
      historicalPeriod: '2024',
      timeframe: 'M1 Asia range + M5',
      referencePrice: eventCandle.close,
      entry: eventCandle.close,
      target,
      invalidation: stop,
      zoneLow: asiaLow,
      zoneHigh: asiaHigh,
      distanceAtr,
      sourceTime: startTime,
      expiresAt,
      rewardRisk: settings.asiaEntryRewardRisk,
      reason: 'Pada pukul 00:00 New York, target Asia terdekat berjarak 0,35–1,00 ATR dari harga M5. SL historis memakai RR 0,20.'
    };
  }
  return null;
}

export function buildAmyMarketContextOutlook({ M1 = [], M5 = [], M15 = [], H1 = [], H4 = [], D1 = [], price, now = Date.now(), config } = {}) {
  const settings = { ...AMY_MARKET_CONTEXT_FINAL_CONFIG, ...(config || {}) };
  const m1Values = normalizeCandles(M1);
  const m5Values = normalizeCandles(M5);
  const m15Values = normalizeCandles(M15);
  const requiredM5 = Math.max(64, settings.atrPeriod + 2);
  const requiredM15 = Math.max(64, settings.meanBodyPeriod + settings.swingLength * 2 + 1);
  if (m5Values.length < requiredM5 || m15Values.length < requiredM15) {
    return {
      mode: 'AMY_MARKET_CONTEXT_FINAL',
      status: 'WAITING_DATA',
      generatedAt: now,
      sourceTime: m5Values.at(-1)?.time || m15Values.at(-1)?.time || now,
      referencePrice: num(price, m5Values.at(-1)?.close),
      requiredBars: { M5: requiredM5, M15: requiredM15 },
      availableBars: { M1: m1Values.length, M5: m5Values.length, M15: m15Values.length },
      scenarios: [],
      message: 'Candle M5 atau M15 belum cukup untuk menjalankan AMY Market Context Final.'
    };
  }

  const context = buildM15Context(m15Values, settings);
  const m5Atr = buildAtrSeries(m5Values, settings.atrPeriod);
  const scenarios = [];
  const fvgZone = context.bias === 1 ? context.bullFvg : context.bias === -1 ? context.bearFvg : null;
  const obZone = context.bias === 1 ? context.bullOb : context.bias === -1 ? context.bearOb : null;
  const fvgType = context.bias === 1 ? 'BULL_FVG' : 'BEAR_FVG';
  const obType = context.bias === 1 ? 'BULL_OB' : 'BEAR_OB';
  const asia = evaluateAsiaEntry(m1Values, m5Values, m5Atr, now, settings);
  const fvg = activePoiScenario({ type: fvgType, zone: fvgZone, contextBias: context.bias, m5Values, m5Atr, now, settings, historicalRate: 83.70, historicalPeriod: '2024' });
  const ob = activePoiScenario({ type: obType, zone: obZone, contextBias: context.bias, m5Values, m5Atr, now, settings, historicalRate: 76.34, historicalPeriod: '2023–2024 combined' });
  const dol = evaluateDol(context, m5Values, now, settings);
  if (asia) scenarios.push(asia);
  if (fvg) scenarios.push(fvg);
  if (ob) scenarios.push(ob);
  if (dol) scenarios.push(dol);

  const trends = {
    M5: trendPack(m5Values),
    M15: trendPack(m15Values),
    H1: trendPack(H1),
    H4: trendPack(H4),
    D1: trendPack(D1)
  };
  const trendDirections = Object.values(trends).map(item => item.direction).filter(Boolean);
  const mtfDirection = trendDirections.length && trendDirections.every(item => item === trendDirections[0]) ? trendDirections[0] : 0;
  const directions = [...new Set(scenarios.map(item => item.side))];
  const primaryDirection = directions.length === 1 ? directions[0] : 'WAIT';
  const referencePrice = num(price, m5Values.at(-1)?.close);

  return {
    mode: 'AMY_MARKET_CONTEXT_FINAL',
    status: scenarios.length ? (directions.length === 1 ? 'ACTIVE' : 'MIXED') : 'WAITING_EVENT',
    generatedAt: now,
    sourceTime: Math.max(context.sourceTime || 0, m5Values.at(-1)?.time || 0),
    referencePrice,
    primaryDirection,
    context: {
      bias: context.bias > 0 ? 'BULLISH' : context.bias < 0 ? 'BEARISH' : 'NEUTRAL',
      biasValue: context.bias,
      invalidation: context.invalidation,
      bsl: context.lastPH,
      ssl: context.lastPL,
      mtfDirection: mtfDirection > 0 ? 'BULLISH' : mtfDirection < 0 ? 'BEARISH' : 'MIXED',
      trends
    },
    validityBars: settings.fourHoursM5,
    scenarios,
    config: settings,
    message: scenarios.length
      ? directions.length === 1
        ? `${scenarios.length} qualified context event aktif ke arah ${primaryDirection}.`
        : 'Qualified context event aktif tetapi arahnya bertentangan; Outlook tetap WAIT.'
      : 'Tidak ada qualified FVG revisit, OB revisit, DOL, atau Asia entry. Outlook tetap WAIT.'
  };
}
