import { cleanConceptCandles, conceptNumber } from './concept-candles.js';

const ACTIVE_ZONE_STATES = new Set([
  'DETECTED', 'TESTING', 'CONFIRMED_REACTION',
  'IFVG_DETECTED', 'IFVG_TESTING', 'IFVG_CONFIRMED_REACTION',
  'BREAKER_DETECTED', 'BREAKER_TESTING', 'BREAKER_CONFIRMED_REACTION'
]);

function overlaps(candle, bottom, top) {
  return candle.high >= bottom && candle.low <= top;
}

function rejectionClose(candle, direction, bottom, top) {
  return direction === 'BULLISH' ? candle.close > top : candle.close < bottom;
}

function zoneBroken(candle, direction, bottom, top, mode = 'WICK') {
  if (direction === 'BULLISH') return mode === 'CLOSE' ? candle.close < bottom : candle.low < bottom;
  return mode === 'CLOSE' ? candle.close > top : candle.high > top;
}

function liveTestingStatus(zone, currentPrice) {
  const price = conceptNumber(currentPrice);
  if (!Number.isFinite(price) || !ACTIVE_ZONE_STATES.has(zone.status)) return zone.status;
  if (price < zone.bottom || price > zone.top) return zone.status;
  if (zone.kind === 'IFVG') return 'IFVG_TESTING';
  if (zone.kind === 'BREAKER_OB') return 'BREAKER_TESTING';
  return 'TESTING';
}

export function evaluateZoneLifecycle(candles, zone, {
  breakMode = 'WICK', convertedKind, currentPrice
} = {}) {
  const values = cleanConceptCandles(candles);
  const originalDirection = zone.direction;
  const { bottom, top } = zone;
  let touchIndex = -1;
  let breakIndex = -1;
  let confirmedIndex = -1;

  for (let index = Math.max(0, zone.availableIndex + 1); index < values.length; index += 1) {
    const candle = values[index];
    if (touchIndex < 0 && overlaps(candle, bottom, top)) touchIndex = index;
    if (zoneBroken(candle, originalDirection, bottom, top, breakMode)) {
      breakIndex = index;
      break;
    }
    if (touchIndex === index && rejectionClose(candle, originalDirection, bottom, top)) confirmedIndex = index;
  }

  if (breakIndex < 0) {
    const output = {
      ...zone,
      touchIndex,
      confirmedIndex,
      breakIndex,
      status: touchIndex < 0 ? 'DETECTED' : confirmedIndex === touchIndex ? 'CONFIRMED_REACTION' : 'TESTING',
      active: true,
      converted: false
    };
    output.status = liveTestingStatus(output, currentPrice);
    return output;
  }

  const inverseDirection = originalDirection === 'BULLISH' ? 'BEARISH' : 'BULLISH';
  let retestIndex = -1;
  let inverseBreakIndex = -1;
  let inverseConfirmedIndex = -1;
  for (let index = breakIndex + 1; index < values.length; index += 1) {
    const candle = values[index];
    if (retestIndex < 0 && overlaps(candle, bottom, top)) retestIndex = index;
    if (zoneBroken(candle, inverseDirection, bottom, top, breakMode)) {
      inverseBreakIndex = index;
      break;
    }
    if (retestIndex === index && rejectionClose(candle, inverseDirection, bottom, top)) inverseConfirmedIndex = index;
  }

  const kind = convertedKind || (zone.kind === 'ORDER_BLOCK' ? 'BREAKER_OB' : 'IFVG');
  let status;
  if (inverseBreakIndex >= 0) status = 'INVALID';
  else if (retestIndex < 0) status = kind === 'IFVG' ? 'IFVG_DETECTED' : 'BREAKER_DETECTED';
  else if (inverseConfirmedIndex === retestIndex) status = kind === 'IFVG' ? 'IFVG_CONFIRMED_REACTION' : 'BREAKER_CONFIRMED_REACTION';
  else status = kind === 'IFVG' ? 'IFVG_TESTING' : 'BREAKER_TESTING';

  const output = {
    ...zone,
    originalKind: zone.kind,
    originalDirection,
    kind,
    direction: inverseDirection,
    touchIndex,
    confirmedIndex,
    breakIndex,
    retestIndex,
    inverseConfirmedIndex,
    inverseBreakIndex,
    status,
    active: status !== 'INVALID',
    converted: true
  };
  output.status = liveTestingStatus(output, currentPrice);
  return output;
}

export function nearestConceptZones(zones, currentPrice, limit = 2) {
  const price = conceptNumber(currentPrice);
  return zones
    .filter(zone => zone.active !== false && zone.status !== 'INVALID')
    .map(zone => ({
      ...zone,
      distance: Number.isFinite(price)
        ? price < zone.bottom ? zone.bottom - price : price > zone.top ? price - zone.top : 0
        : Infinity
    }))
    .sort((a, b) => a.distance - b.distance || (b.availableIndex || 0) - (a.availableIndex || 0))
    .slice(0, limit);
}

export function conceptZoneLiveStatus(zone, currentPrice) {
  if (!zone) return 'TIDAK ADA';
  const price = conceptNumber(currentPrice);
  if (zone.status === 'INVALID') return 'INVALID';
  if (Number.isFinite(price) && price >= zone.bottom && price <= zone.top) {
    if (zone.kind === 'IFVG') return 'IFVG SEDANG DIRETEST';
    if (zone.kind === 'BREAKER_OB') return 'BREAKER SEDANG DIRETEST';
    return 'ZONA SEDANG DIUJI';
  }
  return String(zone.status || 'DETECTED').replaceAll('_', ' ');
}
