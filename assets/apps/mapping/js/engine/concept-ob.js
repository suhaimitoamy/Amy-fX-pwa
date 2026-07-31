import { CONCEPT_THRESHOLDS } from './concept-config.js';
import {
  averageConceptBody,
  cleanConceptCandles,
  conceptAtrAtClean
} from './concept-candles.js';
import { htfDirectionAt, obCreatedImbalance } from './concept-ob-helpers.js';
import { evaluateZoneLifecycle } from './concept-zone-lifecycle.js';

function limitedHistory(zones, maxZones) {
  return [...zones]
    .sort((a, b) => {
      if (Boolean(b.active) !== Boolean(a.active)) return Number(b.active) - Number(a.active);
      const scoreA = (a.createdImbalance ? 2 : 0) + (a.htfAligned ? 1 : 0);
      const scoreB = (b.createdImbalance ? 2 : 0) + (b.htfAligned ? 1 : 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.availableIndex - a.availableIndex;
    })
    .slice(0, maxZones);
}

export function detectOrderBlockConcepts(candles, structureSnapshot, {
  htfCandles = {},
  currentPrice = null,
  maxZones = 16,
  useBody = true
} = {}) {
  const values = cleanConceptCandles(candles);
  const events = (structureSnapshot?.structureEvents || []).filter(event =>
    event.valid
    && event.status === 'CONFIRMED_BREAK'
    && event.hasDisplacement
  );
  const zones = [];

  for (const event of events) {
    const breakIndex = event.index;
    const direction = event.direction;
    const originIndex = breakIndex - 1;
    const candidate = values[originIndex];
    const opposite = direction === 'BULLISH'
      ? candidate?.close < candidate?.open
      : candidate?.close > candidate?.open;
    if (!candidate || !opposite) continue;

    const origin = values[originIndex];
    const breakCandle = values[breakIndex];
    const localAtr = Math.max(conceptAtrAtClean(values, breakIndex), 0.0000001);
    const bottom = useBody
      ? direction === 'BULLISH' ? origin.low : origin.open
      : origin.low;
    const top = useBody
      ? direction === 'BULLISH' ? origin.open : origin.high
      : origin.high;
    const widthAtr = (top - bottom) / localAtr;
    if (widthAtr < CONCEPT_THRESHOLDS.obMinWidthAtr
      || widthAtr > CONCEPT_THRESHOLDS.obMaxWidthAtr) continue;

    const meanBody = averageConceptBody(
      values,
      Math.max(0, breakIndex - 1),
      CONCEPT_THRESHOLDS.fvgBodyLength
    );
    const impulseBody = Math.abs(breakCandle.close - breakCandle.open);
    const impulseMultiple = meanBody > 0 ? impulseBody / meanBody : 0;
    if (impulseMultiple < CONCEPT_THRESHOLDS.obImpulseBodyMeanMultiplier) continue;

    const imbalance = obCreatedImbalance(values, originIndex, breakIndex, direction);
    const htfDirection = htfDirectionAt(htfCandles, breakCandle.time);
    if (!(top > bottom)) continue;

    zones.push({
      id: `OB:${direction}:${breakIndex}:${bottom.toFixed(5)}:${top.toFixed(5)}`,
      kind: 'ORDER_BLOCK',
      direction,
      type: direction,
      bottom,
      top,
      mid: (bottom + top) / 2,
      originIndex,
      structureBreakIndex: breakIndex,
      availableIndex: breakIndex,
      createdAt: breakCandle.time,
      localAtr,
      widthAtr,
      impulseMultiple,
      causedValidBreak: true,
      createdImbalance: imbalance,
      htfAligned: htfDirection === direction,
      htfDirection,
      sourceStructure: event.concept,
      structureScope: event.scope,
      protectedLevel: event.protectedLevel,
      status: 'DETECTED',
      active: true,
      converted: false,
      filterPassed: true,
      quality: imbalance && htfDirection === direction ? 'STRONG' : 'VALID',
      filterReason: `Origin sebelum displaced ${event.concept} · width ${widthAtr.toFixed(2)} ATR · impulse ${impulseMultiple.toFixed(2)}× mean body.`
    });
  }

  return limitedHistory(zones.map(zone => evaluateZoneLifecycle(values, zone, {
    convertedKind: 'BREAKER_OB',
    currentPrice
  })), maxZones);
}
