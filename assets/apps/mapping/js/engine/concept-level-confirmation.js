import { CONCEPT_THRESHOLDS } from './concept-config.js';
import { conceptNumber } from './concept-candles.js';

export function evaluateLevelConfirmation(type, level, close, localAtr) {
  const atr = Math.max(conceptNumber(localAtr, 0), 0.0000001);
  const depthAtr = type === 'BSL'
    ? (conceptNumber(level) - conceptNumber(close)) / atr
    : (conceptNumber(close) - conceptNumber(level)) / atr;
  const confirmed = depthAtr >= CONCEPT_THRESHOLDS.liquidityReclaimAtr;
  return { depthAtr, confirmed, status: confirmed ? 'CONFIRMED_REACTION' : 'UNCONFIRMED' };
}
