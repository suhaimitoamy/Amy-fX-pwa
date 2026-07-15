import { cleanConceptCandles, conceptAtrAtClean, conceptNumber, conceptSwingPoints } from './concept-candles.js';
import { evaluateLevelConfirmation } from './concept-level-confirmation.js';
import { addEqualLevels, addSwingLevels } from './concept-level-seed.js';

export { evaluateLevelConfirmation as evaluateLiquidityReclaim } from './concept-level-confirmation.js';

export function detectLiquidityConcepts(candles, { currentPrice = null, maxLevels = 24 } = {}) {
  const values = cleanConceptCandles(candles);
  if (values.length < 12) return [];
  const swings = conceptSwingPoints(values, 3, 3);
  const levels = [];
  const { recentHighs, recentLows } = addSwingLevels(values, swings, levels);
  addEqualLevels(values, recentHighs, 'BSL', levels);
  addEqualLevels(values, recentLows, 'SSL', levels);

  const evaluated = levels.map(level => {
    let interactionIndex = -1;
    for (let index = Math.max(0, level.availableIndex + 1); index < values.length; index += 1) {
      const hit = level.type === 'BSL'
        ? values[index].high > level.level
        : values[index].low < level.level;
      if (hit) {
        interactionIndex = index;
        break;
      }
    }
    if (interactionIndex < 0) {
      return {
        ...level,
        status: 'DETECTED',
        active: true,
        interactionIndex,
        reclaimDepthAtr: 0,
        confirmed: false,
        distance: Math.abs(level.level - conceptNumber(currentPrice, values.at(-1)?.close))
      };
    }

    const candle = values[interactionIndex];
    const localAtr = Math.max(conceptAtrAtClean(values, interactionIndex), 0.0000001);
    const confirmation = evaluateLevelConfirmation(level.type, level.level, candle.close, localAtr);
    return {
      ...level,
      interactionIndex,
      interactionTime: candle.time,
      localAtr,
      reclaimDepthAtr: confirmation.depthAtr,
      confirmed: confirmation.confirmed,
      active: false,
      status: confirmation.status,
      reactionDirection: level.type === 'BSL' ? 'BEARISH' : 'BULLISH',
      distance: Math.abs(level.level - conceptNumber(currentPrice, values.at(-1)?.close))
    };
  });

  const rank = item => item.interactionIndex >= 0 ? item.interactionIndex : item.availableIndex;
  return evaluated
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, maxLevels);
}
