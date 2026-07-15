import { CONCEPT_THRESHOLDS } from './concept-config.js';
import { cleanConceptCandles } from './concept-candles.js';
import { evaluateZoneLifecycle } from './concept-zone-lifecycle.js';
import { htfDirectionAt, obCreatedImbalance } from './concept-ob-helpers.js';

export function detectOrderBlockConcepts(candles, structureSnapshot, {
  htfCandles = {},
  currentPrice = null,
  maxZones = 12
} = {}) {
  const values = cleanConceptCandles(candles);
  const events = (structureSnapshot?.structureEvents || [])
    .filter(event => event.valid)
    .slice(-Math.max(1, maxZones * 2));
  const output = [];

  for (const event of events) {
    const breakIndex = event.index;
    const direction = event.direction;
    const start = Math.max(0, breakIndex - CONCEPT_THRESHOLDS.obLookbackCandles);
    let originIndex = -1;
    for (let index = breakIndex - 1; index >= start; index -= 1) {
      const candle = values[index];
      const opposite = direction === 'BULLISH'
        ? candle.close < candle.open
        : candle.close > candle.open;
      if (opposite) {
        originIndex = index;
        break;
      }
    }
    if (originIndex < 0) continue;

    const origin = values[originIndex];
    const imbalance = obCreatedImbalance(values, originIndex, breakIndex, direction);
    const htfDirection = htfDirectionAt(htfCandles, values[breakIndex]?.time);
    const htfAligned = htfDirection === direction;
    if (!imbalance || !htfAligned) continue;

    const availableIndex = Math.min(values.length - 1, breakIndex + 2);
    const zone = {
      id: `OB:${direction}:${breakIndex}:${origin.low.toFixed(5)}:${origin.high.toFixed(5)}`,
      kind: 'ORDER_BLOCK',
      direction,
      type: direction,
      bottom: origin.low,
      top: origin.high,
      mid: (origin.low + origin.high) / 2,
      originIndex,
      breakIndex,
      availableIndex,
      createdAt: values[availableIndex]?.time,
      causedValidBreak: true,
      createdImbalance: true,
      htfAligned: true,
      htfDirection,
      sourceStructure: event.concept,
      structureScope: event.scope,
      filterPassed: true,
      filterReason: 'Valid break, imbalance, dan arah HTF sejalan.'
    };
    output.push(evaluateZoneLifecycle(values, zone, {
      breakMode: 'CLOSE',
      convertedKind: 'BREAKER_OB',
      currentPrice
    }));
  }

  return output
    .sort((a, b) => (b.availableIndex || 0) - (a.availableIndex || 0))
    .slice(0, maxZones);
}
