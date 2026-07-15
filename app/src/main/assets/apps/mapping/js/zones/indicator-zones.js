const DEFAULT_FVG_VISIBLE_PER_DIRECTION = 2;
const DEFAULT_OB_VISIBLE_PER_DIRECTION = 1;

function number(value, fallback = NaN) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bodyHigh(candle, useBody = true) {
  return useBody
    ? Math.max(number(candle?.open), number(candle?.close))
    : number(candle?.high);
}

function bodyLow(candle, useBody = true) {
  return useBody
    ? Math.min(number(candle?.open), number(candle?.close))
    : number(candle?.low);
}

function validCandle(candle) {
  const open = number(candle?.open);
  const high = number(candle?.high);
  const low = number(candle?.low);
  const close = number(candle?.close);
  return [open, high, low, close].every(Number.isFinite)
    && high >= Math.max(open, close)
    && low <= Math.min(open, close)
    && high >= low;
}

function cleanCandles(candles) {
  return (Array.isArray(candles) ? candles : [])
    .filter(validCandle)
    .map((candle, index) => ({
      ...candle,
      index,
      open: number(candle.open),
      high: number(candle.high),
      low: number(candle.low),
      close: number(candle.close),
      time: number(candle.time, index)
    }));
}

function averageBody(candles, endIndex, length) {
  const start = Math.max(0, endIndex - length + 1);
  const values = [];
  for (let index = start; index <= endIndex; index += 1) {
    const candle = candles[index];
    if (!candle) continue;
    values.push(Math.abs(candle.close - candle.open));
  }
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function evaluateFvgStatus(zone, candles) {
  let status = 'FRESH';
  let lastTouchIndex = null;
  for (let index = zone.endIndex + 1; index < candles.length; index += 1) {
    const candle = candles[index];
    if (zone.type === 'BULLISH') {
      if (candle.low < zone.bottom) {
        return { status: 'BROKEN', active: false, lastTouchIndex: index };
      }
      if (candle.low < zone.mid) {
        status = 'MITIGATED';
        lastTouchIndex = index;
      } else if (candle.low < zone.top && status === 'FRESH') {
        status = 'TESTED';
        lastTouchIndex = index;
      }
    } else {
      if (candle.high > zone.top) {
        return { status: 'BROKEN', active: false, lastTouchIndex: index };
      }
      if (candle.high > zone.mid) {
        status = 'MITIGATED';
        lastTouchIndex = index;
      } else if (candle.high > zone.bottom && status === 'FRESH') {
        status = 'TESTED';
        lastTouchIndex = index;
      }
    }
  }
  return { status, active: true, lastTouchIndex };
}

/**
 * Meniru aturan FVG Pine milik pengguna:
 * - candle tengah harus lebih besar dari rata-rata body length 5;
 * - wick atas dan bawah masing-masing < 36% body;
 * - bullish FVG: low candle ketiga > high candle pertama;
 * - bearish FVG: high candle ketiga < low candle pertama;
 * - zona tetap aktif sampai wick menembus sisi terjauh zona.
 */
export function detectIndicatorFvgs(candles, {
  bodyLength = 5,
  wickBodyRatio = 0.36,
  visiblePerDirection = DEFAULT_FVG_VISIBLE_PER_DIRECTION,
  lookback = 500
} = {}) {
  const values = cleanCandles(candles);
  const start = Math.max(2, values.length - Math.max(lookback, 3));
  const raw = [];
  let previousBullIndex = -99;
  let previousBearIndex = -99;

  for (let index = start; index < values.length; index += 1) {
    const first = values[index - 2];
    const middle = values[index - 1];
    const third = values[index];
    if (!first || !middle || !third) continue;

    const body = Math.abs(middle.close - middle.open);
    const meanBody = averageBody(values, index - 1, bodyLength);
    const upperWick = middle.high - Math.max(middle.open, middle.close);
    const lowerWick = Math.min(middle.open, middle.close) - middle.low;
    const displacementBody = body > meanBody
      && upperWick < body * wickBodyRatio
      && lowerWick < body * wickBodyRatio;
    if (!displacementBody || body <= 0) continue;

    const bullish = middle.close > middle.open && third.low > first.high;
    const bearish = middle.close < middle.open && third.high < first.low;
    if (!bullish && !bearish) continue;

    const type = bullish ? 'BULLISH' : 'BEARISH';
    const bottom = bullish ? first.high : third.high;
    const top = bullish ? third.low : first.low;
    if (!(top > bottom)) continue;

    const zone = {
      kind: 'FVG',
      type,
      bottom,
      top,
      mid: (bottom + top) / 2,
      originIndex: index - 2,
      displacementIndex: index - 1,
      endIndex: index,
      createdAt: third.time,
      active: true,
      status: 'FRESH',
      source: 'PINE_AMYGMGO',
      reason: 'Pola tiga candle dengan displacement body di atas rata-rata dan wick terkendali.'
    };

    const consecutive = bullish
      ? previousBullIndex === index - 1
      : previousBearIndex === index - 1;
    const last = raw.at(-1);
    if (consecutive && last?.type === type) {
      last.bottom = zone.bottom;
      last.top = zone.top;
      last.mid = zone.mid;
      last.endIndex = zone.endIndex;
      last.createdAt = zone.createdAt;
    } else {
      raw.push(zone);
    }

    if (bullish) previousBullIndex = index;
    if (bearish) previousBearIndex = index;
  }

  const evaluated = raw.map(zone => ({
    ...zone,
    ...evaluateFvgStatus(zone, values)
  }));

  const latest = type => evaluated
    .filter(zone => zone.type === type && zone.active)
    .sort((a, b) => b.endIndex - a.endIndex)
    .slice(0, visiblePerDirection);

  return [...latest('BULLISH'), ...latest('BEARISH')]
    .sort((a, b) => b.endIndex - a.endIndex);
}

function createOb(candles, startIndex, endIndex, type, useBody) {
  if (endIndex <= startIndex + 1) return null;
  let selectedIndex = -1;
  let selectedExtreme = type === 'BULLISH' ? Infinity : -Infinity;

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const candle = candles[index];
    const low = bodyLow(candle, useBody);
    const high = bodyHigh(candle, useBody);
    if (type === 'BULLISH' && low < selectedExtreme) {
      selectedExtreme = low;
      selectedIndex = index;
    }
    if (type === 'BEARISH' && high > selectedExtreme) {
      selectedExtreme = high;
      selectedIndex = index;
    }
  }

  if (selectedIndex < 0) return null;
  const origin = candles[selectedIndex];
  const bottom = bodyLow(origin, useBody);
  const top = bodyHigh(origin, useBody);
  if (!(top > bottom)) return null;

  return {
    kind: 'ORDER_BLOCK',
    type,
    bottom,
    top,
    mid: (bottom + top) / 2,
    originIndex: selectedIndex,
    endIndex,
    createdAt: origin.time,
    breakIndex: endIndex,
    active: true,
    breaker: false,
    status: 'ACTIVE',
    useBody,
    source: 'PINE_AMYGMGO',
    reason: `Ekstrem ${useBody ? 'body' : 'wick'} di antara swing dan candle close pemecah struktur.`
  };
}

function updateObLifecycle(list, candle, index, useBody) {
  for (const zone of list) {
    if (!zone.active) continue;
    const low = bodyLow(candle, useBody);
    const high = bodyHigh(candle, useBody);

    if (zone.type === 'BULLISH') {
      if (!zone.breaker && low < zone.bottom) {
        zone.breaker = true;
        zone.status = 'BREAKER';
        zone.breakerIndex = index;
      } else if (zone.breaker && candle.close > zone.top) {
        zone.active = false;
        zone.status = 'REMOVED';
        zone.removedIndex = index;
      }
    } else if (!zone.breaker && high > zone.top) {
      zone.breaker = true;
      zone.status = 'BREAKER';
      zone.breakerIndex = index;
    } else if (zone.breaker && candle.close < zone.bottom) {
      zone.active = false;
      zone.status = 'REMOVED';
      zone.removedIndex = index;
    }
  }
}

/**
 * Meniru OB Pine milik pengguna:
 * - swing lookback default 10;
 * - break berdasarkan candle close;
 * - batas zona memakai candle body ketika useBody=true;
 * - satu OB bullish dan satu bearish terbaru tetap ditampilkan;
 * - zona yang berubah polaritas ditandai BREAKER, bukan langsung disembunyikan.
 */
export function detectIndicatorOrderBlocks(candles, {
  swingLength = 10,
  useBody = true,
  visiblePerDirection = DEFAULT_OB_VISIBLE_PER_DIRECTION,
  lookback = 1000
} = {}) {
  const all = cleanCandles(candles);
  const offset = Math.max(0, all.length - Math.max(lookback, swingLength * 3));
  const values = all.slice(offset).map((candle, index) => ({ ...candle, index }));
  if (values.length <= swingLength + 2) return [];

  let oscillator = 0;
  let topSwing = null;
  let bottomSwing = null;
  const zones = [];

  for (let current = swingLength; current < values.length; current += 1) {
    const candidateIndex = current - swingLength;
    const candidate = values[candidateIndex];
    const subsequent = values.slice(candidateIndex + 1, current + 1);
    const highestAfter = Math.max(...subsequent.map(item => item.high));
    const lowestAfter = Math.min(...subsequent.map(item => item.low));
    let nextOscillator = oscillator;

    if (candidate.high > highestAfter) nextOscillator = 0;
    else if (candidate.low < lowestAfter) nextOscillator = 1;

    if (nextOscillator === 0 && oscillator !== 0) {
      topSwing = { y: candidate.high, x: candidateIndex, crossed: false };
    }
    if (nextOscillator === 1 && oscillator !== 1) {
      bottomSwing = { y: candidate.low, x: candidateIndex, crossed: false };
    }
    oscillator = nextOscillator;

    const candle = values[current];
    if (topSwing && !topSwing.crossed && candle.close > topSwing.y) {
      topSwing.crossed = true;
      const zone = createOb(values, topSwing.x, current, 'BULLISH', useBody);
      if (zone) zones.unshift(zone);
    }
    if (bottomSwing && !bottomSwing.crossed && candle.close < bottomSwing.y) {
      bottomSwing.crossed = true;
      const zone = createOb(values, bottomSwing.x, current, 'BEARISH', useBody);
      if (zone) zones.unshift(zone);
    }

    updateObLifecycle(zones, candle, current, useBody);
  }

  const latest = type => zones
    .filter(zone => zone.type === type && zone.active)
    .sort((a, b) => b.breakIndex - a.breakIndex)
    .slice(0, visiblePerDirection)
    .map(zone => ({
      ...zone,
      originIndex: zone.originIndex + offset,
      breakIndex: zone.breakIndex + offset,
      endIndex: zone.endIndex + offset
    }));

  return [...latest('BULLISH'), ...latest('BEARISH')]
    .sort((a, b) => b.breakIndex - a.breakIndex);
}

export function zoneDistance(zone, price) {
  const value = number(price);
  if (!Number.isFinite(value)) return Infinity;
  if (value < zone.bottom) return zone.bottom - value;
  if (value > zone.top) return value - zone.top;
  return 0;
}

export function zoneLiveStatus(zone, price) {
  if (!zone) return 'TIDAK ADA';
  const value = number(price);
  if (zone.status === 'BROKEN' || zone.status === 'REMOVED') return 'INVALID';
  if (zone.status === 'BREAKER') return 'BREAKER / POLARITY CHANGE';
  if (!Number.isFinite(value)) return zone.status || 'AKTIF';
  if (value >= zone.bottom && value <= zone.top) return 'SEDANG DIUJI';
  if (zone.type === 'BEARISH' && value < zone.bottom) {
    return zone.status === 'MITIGATED' ? 'TERMITIGASI · DI ATAS HARGA' : 'BELUM RETEST · DI ATAS HARGA';
  }
  if (zone.type === 'BULLISH' && value > zone.top) {
    return zone.status === 'MITIGATED' ? 'TERMITIGASI · DI BAWAH HARGA' : 'BELUM RETEST · DI BAWAH HARGA';
  }
  return 'DILEWATI LIVE · TUNGGU CANDLE CLOSE';
}

export function nearestZones(zones, price, limit = 2) {
  return (Array.isArray(zones) ? zones : [])
    .filter(zone => zone.active !== false)
    .map(zone => ({ ...zone, distance: zoneDistance(zone, price) }))
    .sort((a, b) => a.distance - b.distance || (b.endIndex || b.breakIndex || 0) - (a.endIndex || a.breakIndex || 0))
    .slice(0, limit);
}

export function detectIndicatorZones(candles, price, options = {}) {
  const orderBlocks = detectIndicatorOrderBlocks(candles, options.orderBlocks);
  const fairValueGaps = detectIndicatorFvgs(candles, options.fairValueGaps);
  return {
    orderBlocks,
    fairValueGaps,
    nearestOrderBlocks: nearestZones(orderBlocks, price, 2),
    nearestFairValueGaps: nearestZones(fairValueGaps, price, 2),
    metadata: {
      source: 'ICT Concepts [amygmgo]',
      obUseBody: options.orderBlocks?.useBody ?? true,
      obSwingLength: options.orderBlocks?.swingLength ?? 10,
      fvgBodyLength: options.fairValueGaps?.bodyLength ?? 5,
      fvgWickBodyRatio: options.fairValueGaps?.wickBodyRatio ?? 0.36
    }
  };
}
