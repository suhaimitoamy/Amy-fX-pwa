import { CONCEPT_THRESHOLDS } from './concept-config.js';
import {
  cleanConceptCandles,
  conceptAtrAtClean,
  conceptNumber
} from './concept-candles.js';

const ACTIVE_ZONE_STATES = new Set([
  'DETECTED',
  'TESTING',
  'CONFIRMED_REACTION',
  'IFVG_CONFIRMED_REACTION',
  'BREAKER_CONFIRMED_REACTION'
]);

function overlaps(candle, bottom, top) {
  return candle.high >= bottom && candle.low <= top;
}

function rejectionClose(candle, direction, bottom, top) {
  return direction === 'BULLISH' ? candle.close > top : candle.close < bottom;
}

function closesBeyond(candle, direction, bottom, top) {
  return direction === 'BULLISH' ? candle.close < bottom : candle.close > top;
}

function continuationBeyond(candle, direction, bottom, top, atr) {
  const distance = direction === 'BULLISH'
    ? bottom - candle.close
    : candle.close - top;
  return distance >= Math.max(atr, 0.0000001) * CONCEPT_THRESHOLDS.acceptedBreakContinuationAtr;
}

function wickFullyMitigates(candle, direction, bottom, top) {
  return direction === 'BULLISH' ? candle.low <= bottom : candle.high >= top;
}

function liveTestingStatus(zone, currentPrice) {
  const price = conceptNumber(currentPrice);
  if (!Number.isFinite(price) || !ACTIVE_ZONE_STATES.has(zone.status)) return zone.status;
  if (price < zone.bottom || price > zone.top) return zone.status;
  if (zone.kind === 'IFVG') return 'IFVG_TESTING';
  if (zone.kind === 'BREAKER_OB') return 'BREAKER_TESTING';
  return 'TESTING';
}

function acceptedBreak(values, {
  startIndex,
  direction,
  bottom,
  top,
  localAtr
}) {
  let consecutive = 0;
  let firstCloseIndex = -1;
  for (let index = startIndex; index < values.length; index += 1) {
    const candle = values[index];
    if (!closesBeyond(candle, direction, bottom, top)) {
      consecutive = 0;
      firstCloseIndex = -1;
      continue;
    }
    if (consecutive === 0) firstCloseIndex = index;
    consecutive += 1;
    const currentAtr = conceptAtrAtClean(values, index);
    const acceptanceAtr = currentAtr > 0
      ? currentAtr
      : Math.max(localAtr, 0.0000001);
    if (consecutive >= CONCEPT_THRESHOLDS.acceptedBreakCloses
      && continuationBeyond(candle, direction, bottom, top, acceptanceAtr)) {
      return { breakIndex: index, firstCloseIndex };
    }
  }
  return { breakIndex: -1, firstCloseIndex: -1 };
}

export function evaluateZoneLifecycle(candles, zone, {
  convertedKind,
  currentPrice
} = {}) {
  const values = cleanConceptCandles(candles);
  const originalDirection = zone.direction;
  const { bottom, top } = zone;
  const startIndex = Math.max(0, zone.availableIndex + 1);
  let touchIndex = -1;
  let confirmedIndex = -1;
  let fullMitigationIndex = -1;

  const accepted = acceptedBreak(values, {
    startIndex,
    direction: originalDirection,
    bottom,
    top,
    localAtr: zone.localAtr
  });

  const originalEnd = accepted.breakIndex >= 0 ? accepted.breakIndex : values.length;
  for (let index = startIndex; index < originalEnd; index += 1) {
    const candle = values[index];
    if (touchIndex < 0 && overlaps(candle, bottom, top)) touchIndex = index;
    if (fullMitigationIndex < 0 && wickFullyMitigates(candle, originalDirection, bottom, top)) {
      fullMitigationIndex = index;
    }
    if (overlaps(candle, bottom, top)
      && rejectionClose(candle, originalDirection, bottom, top)) {
      confirmedIndex = index;
    }
  }

  if (accepted.breakIndex < 0) {
    const status = confirmedIndex >= 0
      ? 'CONFIRMED_REACTION'
      : fullMitigationIndex >= 0
        ? 'MITIGATED'
        : touchIndex >= 0
          ? 'TESTING'
          : 'DETECTED';
    const output = {
      ...zone,
      touchIndex,
      confirmedIndex,
      fullMitigationIndex,
      breakIndex: -1,
      acceptedBreakFirstCloseIndex: accepted.firstCloseIndex,
      status,
      active: status !== 'MITIGATED',
      converted: false
    };
    output.status = liveTestingStatus(output, currentPrice);
    return output;
  }

  const inverseDirection = originalDirection === 'BULLISH' ? 'BEARISH' : 'BULLISH';
  let retestIndex = -1;
  let inverseConfirmedIndex = -1;
  for (let index = accepted.breakIndex + 1; index < values.length; index += 1) {
    const candle = values[index];
    if (!overlaps(candle, bottom, top)) continue;
    if (retestIndex < 0) retestIndex = index;
    if (rejectionClose(candle, inverseDirection, bottom, top)) {
      inverseConfirmedIndex = index;
      break;
    }
  }

  if (retestIndex < 0 || inverseConfirmedIndex < 0) {
    return {
      ...zone,
      touchIndex,
      confirmedIndex,
      fullMitigationIndex,
      breakIndex: accepted.breakIndex,
      acceptedBreakFirstCloseIndex: accepted.firstCloseIndex,
      retestIndex,
      inverseConfirmedIndex,
      status: retestIndex < 0 ? 'ACCEPTED_BROKEN' : 'CONVERSION_RETEST_UNCONFIRMED',
      active: false,
      converted: false
    };
  }

  const kind = convertedKind || (zone.kind === 'ORDER_BLOCK' ? 'BREAKER_OB' : 'IFVG');
  const status = kind === 'IFVG'
    ? 'IFVG_CONFIRMED_REACTION'
    : 'BREAKER_CONFIRMED_REACTION';
  const output = {
    ...zone,
    originalKind: zone.kind,
    originalDirection,
    originalStatus: 'ACCEPTED_BROKEN',
    kind,
    direction: inverseDirection,
    touchIndex,
    confirmedIndex,
    fullMitigationIndex,
    breakIndex: accepted.breakIndex,
    acceptedBreakFirstCloseIndex: accepted.firstCloseIndex,
    retestIndex,
    inverseConfirmedIndex,
    status,
    active: true,
    converted: true
  };
  output.status = liveTestingStatus(output, currentPrice);
  return output;
}

export function nearestConceptZones(zones, currentPrice, limit = 2) {
  const price = conceptNumber(currentPrice);
  return (Array.isArray(zones) ? zones : [])
    .filter(zone => zone.active !== false && ACTIVE_ZONE_STATES.has(zone.status))
    .map(zone => ({
      ...zone,
      distance: Number.isFinite(price)
        ? price < zone.bottom
          ? zone.bottom - price
          : price > zone.top
            ? price - zone.top
            : 0
        : Infinity
    }))
    .sort((a, b) => a.distance - b.distance || (b.availableIndex || 0) - (a.availableIndex || 0))
    .slice(0, limit);
}

export function conceptZoneLiveStatus(zone, currentPrice) {
  if (!zone) return 'TIDAK ADA';
  const price = conceptNumber(currentPrice);
  if (['INVALID', 'ACCEPTED_BROKEN', 'CONVERSION_RETEST_UNCONFIRMED'].includes(zone.status)) {
    return String(zone.status).replaceAll('_', ' ');
  }
  if (Number.isFinite(price) && price >= zone.bottom && price <= zone.top) {
    if (zone.kind === 'IFVG') return 'IFVG SEDANG DIRETEST';
    if (zone.kind === 'BREAKER_OB') return 'BREAKER SEDANG DIRETEST';
    return 'ZONA SEDANG DIUJI';
  }
  return String(zone.status || 'DETECTED').replaceAll('_', ' ');
}
