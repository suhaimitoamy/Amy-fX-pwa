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

function createOb() { return null; }

/**
 * Adapter tampilan validated Order Block:
 * Hanya menerima validatedOrderBlocks yang sudah dihasilkan oleh marketConcepts.orderBlocks.
 * Jika validatedOrderBlocks tidak tersedia, kembalikan array kosong. Jangan menghitung ulang OB.
 */
export function detectIndicatorOrderBlocks(_candles, {
  validatedOrderBlocks = null,
  visiblePerDirection = DEFAULT_OB_VISIBLE_PER_DIRECTION
} = {}) {
  if (!Array.isArray(validatedOrderBlocks) || !validatedOrderBlocks.length) {
    return [];
  }

  const latest = type => validatedOrderBlocks
    .filter(zone => (zone.direction === type || zone.type === type) && zone.active !== false && zone.status !== 'INVALID')
    .sort((a, b) => Number(b.availableIndex || b.structureBreakIndex || 0) - Number(a.availableIndex || a.structureBreakIndex || 0))
    .slice(0, visiblePerDirection);

  return [...latest('BULLISH'), ...latest('BEARISH')];
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
  if (zone.status === 'INVALID') return 'INVALID';
  if (!Number.isFinite(value)) return zone.status || 'DETECTED';
  if (value >= zone.bottom && value <= zone.top) return 'SEDANG DIUJI';
  if (zone.type === 'BEARISH' || zone.direction === 'BEARISH') {
    return value < zone.bottom ? 'BELUM RETEST · DI ATAS HARGA' : 'TERMITIGASI';
  }
  if (zone.type === 'BULLISH' || zone.direction === 'BULLISH') {
    return value > zone.top ? 'BELUM RETEST · DI BAWAH HARGA' : 'TERMITIGASI';
  }
  return zone.status || 'DETECTED';
}

export function nearestZones(zones, price, limit = 2) {
  return (Array.isArray(zones) ? zones : [])
    .filter(zone => zone.active !== false)
    .map(zone => ({ ...zone, distance: zoneDistance(zone, price) }))
    .sort((a, b) => a.distance - b.distance || (b.endIndex || b.breakIndex || 0) - (a.endIndex || a.breakIndex || 0))
    .slice(0, limit);
}

export function detectIndicatorZones(candles, price, options = {}) {
  const validatedOrderBlocks = options.validatedOrderBlocks || options.marketConcepts?.orderBlocks || options.orderBlocks?.validatedOrderBlocks || null;
  const orderBlocks = detectIndicatorOrderBlocks(candles, {
    ...options.orderBlocks,
    validatedOrderBlocks
  });
  const fairValueGaps = detectIndicatorFvgs(candles, options.fairValueGaps);
  return {
    orderBlocks,
    fairValueGaps,
    nearestOrderBlocks: nearestZones(orderBlocks, price, 2),
    nearestFairValueGaps: nearestZones(fairValueGaps, price, 2),
    metadata: {
      source: 'ICT Concepts [amygmgo]',
      obUseBody: false,
      fvgBodyLength: options.fairValueGaps?.bodyLength ?? 5,
      fvgWickBodyRatio: options.fairValueGaps?.wickBodyRatio ?? 0.36
    }
  };
}
