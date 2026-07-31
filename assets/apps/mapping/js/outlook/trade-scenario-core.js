export const TRADE_SCENARIO_CONFIG = Object.freeze({
  timeframe: 'M5',
  atrPeriod: 14,
  displacementBodyAtr: 0.8,
  displacementBodyRatio: 0.6,
  minimumFvgAtr: 0.08,
  maximumFvgAtr: 0.8,
  zoneExpiryBars: 144,
  invalidationAtr: 0.1,
  confirmationBars: 3,
  confirmationBodyAtr: 0.2,
  confirmationBodyRatio: 0.45,
  entryWaitBars: 5,
  stopBufferAtr: 0.12,
  minimumRiskPoints: 0.6,
  maximumRiskPoints: 4.0,
  liquidityPivotStrength: 5,
  liquidityLookbackBars: 300,
  minimumLiquidityRoomR: 2.0,
  sweepLookbackBars: 5,
  tp1R: 1.5,
  tp2R: 2.0,
  tradeValidityBars: 24
});

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
  if (![open, high, low, close].every(Number.isFinite) || high < low) return null;
  return { ...candle, open, high, low, close, time: candleTime(candle) };
}

export function normalizeCandles(candles = []) {
  return (Array.isArray(candles) ? candles : [])
    .map(normalizeCandle)
    .filter(Boolean)
    .sort((a, b) => num(a.time, 0) - num(b.time, 0));
}

function trueRange(candle, previousClose) {
  if (!Number.isFinite(previousClose)) return Math.max(0, candle.high - candle.low);
  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - previousClose),
    Math.abs(candle.low - previousClose)
  );
}

export function buildAtrSeries(candles, period = TRADE_SCENARIO_CONFIG.atrPeriod) {
  const values = normalizeCandles(candles);
  const output = Array(values.length).fill(NaN);
  for (let index = 1; index < values.length; index += 1) {
    const start = Math.max(1, index + 1 - Math.max(2, period));
    let total = 0;
    let count = 0;
    for (let cursor = start; cursor <= index; cursor += 1) {
      total += trueRange(values[cursor], values[cursor - 1]?.close);
      count += 1;
    }
    if (count) output[index] = total / count;
  }
  return output;
}

function mergeConfig(config) {
  return { ...TRADE_SCENARIO_CONFIG, ...(config || {}) };
}

export function detectReactionZones(candles, config) {
  const settings = mergeConfig(config);
  const values = normalizeCandles(candles);
  const atr = buildAtrSeries(values, settings.atrPeriod);
  const zones = [];

  for (let index = 2; index < values.length; index += 1) {
    const displacementIndex = index - 1;
    const displacement = values[displacementIndex];
    const atrValue = atr[displacementIndex];
    if (!(atrValue > 0)) continue;

    const body = Math.abs(displacement.close - displacement.open);
    const range = displacement.high - displacement.low;
    if (!(range > 0)
      || body < settings.displacementBodyAtr * atrValue
      || body / range < settings.displacementBodyRatio) continue;

    const left = values[index - 2];
    const right = values[index];

    if (displacement.close > displacement.open && right.low > left.high) {
      const bottom = left.high;
      const top = right.low;
      const widthAtr = (top - bottom) / atrValue;
      if (widthAtr >= settings.minimumFvgAtr && widthAtr <= settings.maximumFvgAtr) {
        zones.push({
          side: 'BUY',
          createdIndex: index,
          displacementIndex,
          bottom,
          top,
          midpoint: (bottom + top) / 2,
          originAtr: atrValue,
          sourceTime: values[index].time
        });
      }
    }

    if (displacement.close < displacement.open && right.high < left.low) {
      const bottom = right.high;
      const top = left.low;
      const widthAtr = (top - bottom) / atrValue;
      if (widthAtr >= settings.minimumFvgAtr && widthAtr <= settings.maximumFvgAtr) {
        zones.push({
          side: 'SELL',
          createdIndex: index,
          displacementIndex,
          bottom,
          top,
          midpoint: (bottom + top) / 2,
          originAtr: atrValue,
          sourceTime: values[index].time
        });
      }
    }
  }

  return { candles: values, atr, zones, config: settings };
}

function firstTouch(values, zone, atr, settings, endIndex) {
  const lastIndex = Math.min(endIndex, zone.createdIndex + settings.zoneExpiryBars);
  for (let index = zone.createdIndex + 1; index <= lastIndex; index += 1) {
    const candle = values[index];
    const atrValue = atr[index] || zone.originAtr;
    if (zone.side === 'BUY' && candle.close < zone.bottom - settings.invalidationAtr * atrValue) {
      return { invalidated: true, index };
    }
    if (zone.side === 'SELL' && candle.close > zone.top + settings.invalidationAtr * atrValue) {
      return { invalidated: true, index };
    }
    if (candle.low <= zone.top && candle.high >= zone.bottom) return { invalidated: false, index };
  }
  return null;
}

function confirmation(values, zone, touchIndex, atr, settings, endIndex) {
  const lastIndex = Math.min(endIndex, touchIndex + settings.confirmationBars);
  for (let index = touchIndex; index <= lastIndex; index += 1) {
    const candle = values[index];
    const atrValue = atr[index] || zone.originAtr;
    const body = candle.close - candle.open;
    const range = candle.high - candle.low;
    if (!(range > 0) || !(atrValue > 0)) continue;

    if (zone.side === 'BUY'
      && candle.close > zone.top
      && body > 0
      && body >= settings.confirmationBodyAtr * atrValue
      && body / range >= settings.confirmationBodyRatio) return index;

    if (zone.side === 'SELL'
      && candle.close < zone.bottom
      && body < 0
      && -body >= settings.confirmationBodyAtr * atrValue
      && -body / range >= settings.confirmationBodyRatio) return index;
  }
  return null;
}

function didSweep(values, side, touchIndex, lookback) {
  if (touchIndex < lookback) return false;
  const previous = values.slice(touchIndex - lookback, touchIndex);
  if (side === 'BUY') return values[touchIndex].low < Math.min(...previous.map(item => item.low));
  return values[touchIndex].high > Math.max(...previous.map(item => item.high));
}

export function findNearestStrongLiquidity({
  candles,
  side,
  entry,
  risk,
  knownIndex,
  strength = TRADE_SCENARIO_CONFIG.liquidityPivotStrength,
  lookback = TRADE_SCENARIO_CONFIG.liquidityLookbackBars
}) {
  const values = normalizeCandles(candles);
  if (!(risk > 0) || knownIndex < strength * 2) return null;
  const start = Math.max(strength, knownIndex - lookback);
  const candidates = [];

  for (let pivot = start; pivot + strength <= knownIndex; pivot += 1) {
    const current = values[pivot];
    let valid = true;
    for (let offset = 1; offset <= strength; offset += 1) {
      if (side === 'BUY' && !(current.high > values[pivot - offset].high && current.high >= values[pivot + offset].high)) {
        valid = false;
        break;
      }
      if (side === 'SELL' && !(current.low < values[pivot - offset].low && current.low <= values[pivot + offset].low)) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    if (side === 'BUY' && current.high > entry) candidates.push(current.high);
    if (side === 'SELL' && current.low < entry) candidates.push(current.low);
  }

  if (!candidates.length) return null;
  const level = side === 'BUY'
    ? Math.min(...candidates)
    : Math.max(...candidates);
  const roomR = Math.abs(level - entry) / risk;
  return { level, roomR };
}

function buildConcreteScenario(values, atr, zone, touchIndex, confirmationIndex, settings, endIndex) {
  const entry = zone.midpoint;
  const atrValue = atr[confirmationIndex] || zone.originAtr;
  const stopLoss = zone.side === 'BUY'
    ? zone.bottom - settings.stopBufferAtr * atrValue
    : zone.top + settings.stopBufferAtr * atrValue;
  const risk = Math.abs(entry - stopLoss);
  if (risk < settings.minimumRiskPoints || risk > settings.maximumRiskPoints) return null;

  const liquidity = findNearestStrongLiquidity({
    candles: values,
    side: zone.side,
    entry,
    risk,
    knownIndex: confirmationIndex,
    strength: settings.liquidityPivotStrength,
    lookback: settings.liquidityLookbackBars
  });
  if (!liquidity || liquidity.roomR < settings.minimumLiquidityRoomR) return null;

  const sign = zone.side === 'BUY' ? 1 : -1;
  const entryWindowEnd = Math.min(endIndex, confirmationIndex + settings.entryWaitBars);
  let entryTouchedIndex = null;
  for (let index = confirmationIndex + 1; index <= entryWindowEnd; index += 1) {
    const candle = values[index];
    const invalidated = zone.side === 'BUY' ? candle.low <= stopLoss : candle.high >= stopLoss;
    if (candle.low <= entry && candle.high >= entry) {
      entryTouchedIndex = index;
      break;
    }
    if (invalidated) return null;
  }

  const status = entryTouchedIndex === null ? 'READY_ENTRY' : 'ENTRY_TOUCHED';
  if (entryTouchedIndex === null && endIndex > confirmationIndex + settings.entryWaitBars) return null;
  const sweep = didSweep(values, zone.side, touchIndex, settings.sweepLookbackBars);

  return {
    side: zone.side,
    status,
    setupType: sweep ? 'LIQUIDITY_SWEEP_FVG_REACTION' : 'FVG_FIRST_TOUCH_REACTION',
    quality: sweep ? 'A' : 'B',
    timeframe: settings.timeframe,
    zoneLow: zone.bottom,
    zoneHigh: zone.top,
    entry,
    stopLoss,
    risk,
    takeProfit1: entry + sign * risk * settings.tp1R,
    takeProfit2: entry + sign * risk * settings.tp2R,
    riskReward1: settings.tp1R,
    riskReward2: settings.tp2R,
    liquidityTarget: liquidity.level,
    liquidityRoomR: liquidity.roomR,
    touchIndex,
    confirmationIndex,
    entryTouchedIndex,
    sourceTime: values[confirmationIndex]?.time || zone.sourceTime,
    validUntilIndex: Math.min(values.length - 1, confirmationIndex + settings.entryWaitBars),
    reason: sweep
      ? 'Fresh FVG M5 mendapat first touch, menyapu liquidity lokal, lalu close rejection M5 valid.'
      : 'Fresh FVG M5 mendapat first touch lalu close rejection M5 valid; ruang menuju liquidity kuat minimal 2R.'
  };
}

function watchScenario(values, zone, touch, settings) {
  const sweep = touch && !touch.invalidated
    ? didSweep(values, zone.side, touch.index, settings.sweepLookbackBars)
    : false;
  return {
    side: zone.side,
    status: touch ? 'WAIT_CONFIRMATION' : 'WAIT_ZONE_TOUCH',
    setupType: sweep ? 'LIQUIDITY_SWEEP_FVG_REACTION' : 'FVG_FIRST_TOUCH_REACTION',
    quality: sweep ? 'A-WATCH' : 'WATCH',
    timeframe: settings.timeframe,
    zoneLow: zone.bottom,
    zoneHigh: zone.top,
    entry: zone.midpoint,
    stopLoss: null,
    takeProfit1: null,
    takeProfit2: null,
    riskReward1: settings.tp1R,
    riskReward2: settings.tp2R,
    sourceTime: zone.sourceTime,
    reason: touch
      ? 'Harga sudah first touch FVG M5. Tunggu candle rejection M5 sebelum level entry diaktifkan.'
      : 'Fresh FVG M5 belum disentuh. Entry belum aktif sebelum first touch dan rejection M5.'
  };
}

function latestScenarioForSide(values, atr, zones, side, settings) {
  const endIndex = values.length - 1;
  const sideZones = zones.filter(zone => zone.side === side).sort((a, b) => b.createdIndex - a.createdIndex);
  let watch = null;

  for (const zone of sideZones) {
    if (endIndex > zone.createdIndex + settings.zoneExpiryBars) continue;
    const touch = firstTouch(values, zone, atr, settings, endIndex);
    if (touch?.invalidated) continue;
    if (!touch) {
      watch ||= watchScenario(values, zone, null, settings);
      continue;
    }

    const confirmedIndex = confirmation(values, zone, touch.index, atr, settings, endIndex);
    if (confirmedIndex === null) {
      if (endIndex <= touch.index + settings.confirmationBars) watch ||= watchScenario(values, zone, touch, settings);
      continue;
    }

    const concrete = buildConcreteScenario(values, atr, zone, touch.index, confirmedIndex, settings, endIndex);
    if (concrete) return concrete;
  }

  return watch;
}

export function buildTradeScenarios({ candles = [], price, now = Date.now(), config } = {}) {
  const settings = mergeConfig(config);
  const detected = detectReactionZones(candles, settings);
  const values = detected.candles;
  const requiredBars = Math.max(64, settings.atrPeriod + 3, settings.liquidityPivotStrength * 2 + 1);

  if (values.length < requiredBars) {
    return {
      status: 'WAITING_DATA',
      generatedAt: now,
      timeframe: settings.timeframe,
      requiredBars,
      availableBars: values.length,
      scenarios: [],
      config: settings
    };
  }

  const buy = latestScenarioForSide(values, detected.atr, detected.zones, 'BUY', settings);
  const sell = latestScenarioForSide(values, detected.atr, detected.zones, 'SELL', settings);
  let scenarios = [buy, sell].filter(Boolean);
  const active = scenarios
    .filter(item => item.status === 'ENTRY_TOUCHED')
    .sort((a, b) => num(a.entryTouchedIndex, Infinity) - num(b.entryTouchedIndex, Infinity))[0];
  if (active) {
    scenarios = scenarios.map(item => item === active ? item : { ...item, status: 'OCO_CANCELLED' });
  }

  const ready = scenarios.some(item => item.status === 'READY_ENTRY' || item.status === 'ENTRY_TOUCHED');
  const referencePrice = num(price, values.at(-1)?.close);
  const sourceTime = values.at(-1)?.time || now;

  return {
    status: ready ? 'READY' : scenarios.length ? 'WATCHING_REACTION' : 'WAITING_SETUP',
    generatedAt: now,
    sourceTime,
    timeframe: settings.timeframe,
    referencePrice,
    validityBars: settings.entryWaitBars,
    config: settings,
    watchCount: scenarios.length,
    scenarios,
    message: ready
      ? 'Level M5 tervalidasi tersedia.'
      : scenarios.length
        ? 'Fresh FVG M5 ditemukan, tetapi first touch/rejection belum lengkap.'
        : 'Belum ada fresh FVG M5 yang memenuhi displacement, risiko, dan ruang liquidity.'
  };
}
