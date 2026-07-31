import { CONCEPT_THRESHOLDS } from './concept-config.js';
import { conceptNumber } from './concept-candles.js';

export function evaluateLevelConfirmation(type, level, close, localAtr, tolerance = 0) {
  const atr = Math.max(conceptNumber(localAtr, 0), 0.0000001);
  const reclaimTolerance = Math.max(conceptNumber(tolerance, 0), 0);
  const depthAtr = type === 'BSL'
    ? (conceptNumber(level) - reclaimTolerance - conceptNumber(close)) / atr
    : (conceptNumber(close) - conceptNumber(level) - reclaimTolerance) / atr;
  const confirmed = depthAtr >= CONCEPT_THRESHOLDS.liquidityReclaimAtr;
  return {
    depthAtr,
    confirmed,
    status: confirmed ? 'CONFIRMED_REACTION' : 'SWEPT_UNCONFIRMED'
  };
}
