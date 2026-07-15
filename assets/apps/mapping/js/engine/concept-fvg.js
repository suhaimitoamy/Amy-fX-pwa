import { CONCEPT_THRESHOLDS } from './concept-config.js';
import { averageConceptBody, cleanConceptCandles, conceptAtrAtClean } from './concept-candles.js';
import { evaluateZoneLifecycle } from './concept-zone-lifecycle.js';

export function detectFvgConcepts(candles, {
  lookback = 500,
  currentPrice = null,
  minWidthAtr = CONCEPT_THRESHOLDS.fvgMinWidthAtr
} = {}) {
  const values = cleanConceptCandles(candles);
  const start = Math.max(2, values.length - Math.max(3, lookback));
  const raw = [];
  let previousBullIndex = -99;
  let previousBearIndex = -99;

  for (let index = start; index < values.length; index += 1) {
    const first = values[index - 2];
    const middle = values[index - 1];
    const third = values[index];
    if (!first || !middle || !third) continue;

    const body = Math.abs(middle.close - middle.open);
    const meanBody = averageConceptBody(values, index - 1, CONCEPT_THRESHOLDS.fvgBodyLength);
    const upperWick = middle.high - Math.max(middle.open, middle.close);
    const lowerWick = Math.min(middle.open, middle.close) - middle.low;
    const displacement = body > meanBody
      && body > 0
      && upperWick < body * CONCEPT_THRESHOLDS.fvgWickBodyRatio
      && lowerWick < body * CONCEPT_THRESHOLDS.fvgWickBodyRatio;
    if (!displacement) continue;

    const bullish = middle.close > middle.open && third.low > first.high;
    const bearish = middle.close < middle.open && third.high < first.low;
    if (!bullish && !bearish) continue;

    const direction = bullish ? 'BULLISH' : 'BEARISH';
    const bottom = bullish ? first.high : third.high;
    const top = bullish ? third.low : first.low;
    const localAtr = Math.max(conceptAtrAtClean(values, index - 1), 0.0000001);
    const widthAtr = (top - bottom) / localAtr;
    if (!(top > bottom) || widthAtr < minWidthAtr) continue;

    const zone = {
      id: `FVG:${direction}:${index}:${bottom.toFixed(5)}:${top.toFixed(5)}`,
      kind: 'FVG',
      direction,
      type: direction,
      bottom,
      top,
      mid: (bottom + top) / 2,
      originIndex: index - 2,
      displacementIndex: index - 1,
      availableIndex: index,
      createdAt: third.time,
      localAtr,
      widthAtr,
      filterPassed: true,
      filterReason: `Lebar gap ${widthAtr.toFixed(2)} ATR memenuhi minimum ${minWidthAtr.toFixed(2)} ATR.`
    };

    const consecutive = bullish ? previousBullIndex === index - 1 : previousBearIndex === index - 1;
    const latest = raw.at(-1);
    if (consecutive && latest?.direction === direction) raw[raw.length - 1] = zone;
    else raw.push(zone);
    if (bullish) previousBullIndex = index;
    if (bearish) previousBearIndex = index;
  }

  return raw
    .map(zone => evaluateZoneLifecycle(values, zone, {
      breakMode: 'WICK',
      convertedKind: 'IFVG',
      currentPrice
    }))
    .sort((a, b) => (b.availableIndex || 0) - (a.availableIndex || 0));
}
