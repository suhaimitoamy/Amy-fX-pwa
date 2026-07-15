import { CONCEPT_THRESHOLDS } from './concept-config.js';

export function structureDisplacementMetrics(candle, localAtr, level, direction) {
  const safeAtr = Math.max(localAtr, 0.0000001);
  const body = Math.abs(candle.close - candle.open);
  const range = Math.max(candle.high - candle.low, 0.0000001);
  const ratio = body / range;
  const penetration = direction === 'BULLISH' ? candle.close - level : level - candle.close;
  const penetrationAtr = penetration / safeAtr;
  return {
    bodyAtr: body / safeAtr,
    rangeAtr: range / safeAtr,
    bodyRatio: ratio,
    penetration,
    penetrationAtr,
    valid: body >= safeAtr * CONCEPT_THRESHOLDS.displacementBodyAtr
      && range >= safeAtr * CONCEPT_THRESHOLDS.displacementRangeAtr
      && ratio >= CONCEPT_THRESHOLDS.displacementBodyRatio
      && penetrationAtr >= CONCEPT_THRESHOLDS.structurePenetrationAtr
  };
}

export function liquiditySweepEvent({ direction, candle, level, index, localAtr }) {
  const reclaimDepthAtr = direction === 'BULLISH'
    ? (level - candle.close) / localAtr
    : (candle.close - level) / localAtr;
  const valid = reclaimDepthAtr >= CONCEPT_THRESHOLDS.liquidityReclaimAtr;
  return {
    id: `SWEEP:${direction}:${index}:${level.toFixed(5)}`,
    concept: direction === 'BULLISH' ? 'BSL' : 'SSL',
    kind: 'LIQUIDITY_SWEEP',
    direction: direction === 'BULLISH' ? 'BEARISH' : 'BULLISH',
    brokenSide: direction,
    level,
    index,
    localAtr,
    reclaimDepthAtr,
    status: valid ? 'CONFIRMED_REACTION' : 'SWEPT_UNCONFIRMED',
    valid
  };
}
