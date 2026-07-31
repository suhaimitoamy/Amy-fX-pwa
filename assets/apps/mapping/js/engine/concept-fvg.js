import { CONCEPT_THRESHOLDS } from './concept-config.js';
import {
  averageConceptBody,
  cleanConceptCandles,
  conceptAtrAtClean
} from './concept-candles.js';
import { evaluateZoneLifecycle } from './concept-zone-lifecycle.js';

function limitedHistory(zones, maxPerDirection) {
  const output = new Map();
  for (const direction of ['BULLISH', 'BEARISH']) {
    for (const zone of zones
      .filter(item => (item.originalDirection || item.direction) === direction)
      .sort((a, b) => b.availableIndex - a.availableIndex)
      .slice(0, maxPerDirection)) {
      output.set(zone.id, zone);
    }
  }
  return [...output.values()].sort((a, b) => b.availableIndex - a.availableIndex);
}

export function detectFvgConcepts(candles, {
  lookback = 500,
  currentPrice = null,
  minWidthAtr = CONCEPT_THRESHOLDS.fvgMinWidthAtr,
  maxWidthAtr = CONCEPT_THRESHOLDS.fvgMaxWidthAtr,
  maxPerDirection = 8
} = {}) {
  const values = cleanConceptCandles(candles);
  const start = Math.max(
    2,
    values.length - Math.max(3, lookback),
    CONCEPT_THRESHOLDS.fvgBodyLength + 1
  );
  const zones = [];

  for (let index = start; index < values.length; index += 1) {
    const first = values[index - 2];
    const middle = values[index - 1];
    const third = values[index];
    if (!first || !middle || !third) continue;

    // Amy Market Context Final confirms the gap on the third candle and
    // compares that closed candle with the preceding 20-body baseline.
    const body = Math.abs(third.close - third.open);
    const meanBody = averageConceptBody(
      values,
      index - 1,
      CONCEPT_THRESHOLDS.fvgBodyLength
    );
    const range = Math.max(third.high - third.low, 0.0000001);
    const bodyRatio = body / range;
    const displacement = meanBody > 0
      && body >= meanBody * CONCEPT_THRESHOLDS.fvgBodyMeanMultiplier;
    const bullish = displacement && third.close > third.open && third.low > first.high;
    const bearish = displacement && third.close < third.open && third.high < first.low;
    if (!bullish && !bearish) continue;

    const direction = bullish ? 'BULLISH' : 'BEARISH';
    const bottom = bullish ? first.high : third.high;
    const top = bullish ? third.low : first.low;
    const localAtr = Math.max(conceptAtrAtClean(values, index), 0.0000001);
    const widthAtr = (top - bottom) / localAtr;
    if (!(top > bottom) || widthAtr < minWidthAtr || widthAtr > maxWidthAtr) continue;

    zones.push({
      id: `FVG:${direction}:${index}:${bottom.toFixed(5)}:${top.toFixed(5)}`,
      kind: 'FVG',
      direction,
      type: direction,
      bottom,
      top,
      mid: (bottom + top) / 2,
      originIndex: index - 2,
      displacementIndex: index,
      availableIndex: index,
      createdAt: third.time,
      localAtr,
      widthAtr,
      bodyRatio,
      bodyMeanMultiple: body / meanBody,
      status: 'DETECTED',
      active: true,
      converted: false,
      filterPassed: true,
      quality: body / meanBody >= 1.5 ? 'STRONG' : 'VALID',
      filterReason: `FVG displacement ${bodyRatio.toFixed(2)} body/range · width ${widthAtr.toFixed(2)} ATR.`
    });
  }

  const evaluated = zones.map(zone => evaluateZoneLifecycle(values, zone, {
    convertedKind: 'IFVG',
    currentPrice
  }));
  return limitedHistory(evaluated, maxPerDirection);
}
