import { cleanConceptCandles, conceptNumber } from './concept-candles.js';
import { detectStructureConcepts } from './concept-structure.js';

export function htfDirectionAt(candlesByTf, eventTime) {
  const source = candlesByTf?.D1?.length > 12 ? candlesByTf.D1
    : candlesByTf?.H4?.length > 12 ? candlesByTf.H4 : null;
  if (!source) return 'NEUTRAL';
  const cutoff = conceptNumber(eventTime, Infinity);
  const closed = cleanConceptCandles(source).filter(candle => candle.time < cutoff);
  if (closed.length < 12) return 'NEUTRAL';
  return detectStructureConcepts(closed).trend;
}

export function obCreatedImbalance(candles, originIndex, breakIndex, direction) {
  for (let index = Math.max(2, originIndex); index <= Math.min(candles.length - 1, breakIndex + 2); index += 1) {
    if (direction === 'BULLISH' && candles[index - 2].high < candles[index].low) return true;
    if (direction === 'BEARISH' && candles[index - 2].low > candles[index].high) return true;
  }
  return false;
}
