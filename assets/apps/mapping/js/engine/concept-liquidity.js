import { cleanConceptCandles, conceptAtrAtClean, conceptNumber, conceptSwingPoints } from './concept-candles.js';
import { evaluateLevelConfirmation } from './concept-level-confirmation.js';
import { addEqualLevels, addSwingLevels } from './concept-level-seed.js';

export { evaluateLevelConfirmation as evaluateLiquidityReclaim } from './concept-level-confirmation.js';

const LIQUIDITY_SWING_LENGTH = 4;

function rank(item) {
  return item.interactionIndex >= 0 ? item.interactionIndex : item.availableIndex;
}

function collapseEqualLevels(items) {
  const equal = items.filter(item => item.subtype === 'EQUAL');
  const other = items.filter(item => item.subtype !== 'EQUAL');
  const clusters = [];

  for (const item of equal.sort((a, b) => a.availableIndex - b.availableIndex)) {
    const tolerance = Math.max(Number(item.tolerance || 0), Number(item.localAtr || 0) * 0.03, 0.0000001);
    const cluster = clusters.find(existing => existing.type === item.type
      && Math.abs(existing.level - item.level) <= Math.max(existing.tolerance, tolerance));
    if (!cluster) {
      clusters.push({ type: item.type, level: item.level, tolerance, items: [item] });
      continue;
    }
    cluster.items.push(item);
    cluster.tolerance = Math.max(cluster.tolerance, tolerance);
    cluster.level = item.type === 'BSL'
      ? Math.max(cluster.level, item.level)
      : Math.min(cluster.level, item.level);
  }

  const selected = clusters.map(cluster => {
    const active = cluster.items.filter(item => item.active);
    const candidates = active.length ? active : cluster.items;
    const latest = [...candidates].sort((a, b) => rank(b) - rank(a))[0];
    const members = [...new Set(cluster.items.flatMap(item => item.memberIndices || []))].sort((a, b) => a - b);
    return {
      ...latest,
      memberIndices: members,
      touchCount: members.length,
      tolerance: cluster.tolerance,
      clusterLevel: cluster.level
    };
  });

  const filteredOther = other.filter(item => item.subtype !== 'SWING' || !selected.some(equalItem =>
    equalItem.type === item.type
      && Math.abs(equalItem.level - item.level) <= Math.max(equalItem.tolerance || 0, item.localAtr * 0.03)
  ));
  return [...filteredOther, ...selected];
}

export function detectLiquidityConcepts(candles, { currentPrice = null, maxLevels = 24 } = {}) {
  const values = cleanConceptCandles(candles);
  if (values.length < 12) return [];
  const swings = conceptSwingPoints(values, LIQUIDITY_SWING_LENGTH, LIQUIDITY_SWING_LENGTH);
  const levels = [];
  const { recentHighs, recentLows } = addSwingLevels(values, swings, levels, LIQUIDITY_SWING_LENGTH);
  addEqualLevels(values, recentHighs, 'BSL', levels, LIQUIDITY_SWING_LENGTH);
  addEqualLevels(values, recentLows, 'SSL', levels, LIQUIDITY_SWING_LENGTH);

  const evaluated = levels.map(level => {
    const levelAtr = Math.max(Number(level.localAtr || 0), 0.0000001);
    const tolerance = Math.max(Number(level.tolerance || 0), levelAtr * 0.03, 0.0000001);
    let interactionIndex = -1;
    for (let index = Math.max(0, level.availableIndex + 1); index < values.length; index += 1) {
      const hit = level.type === 'BSL'
        ? values[index].high > level.level + tolerance
        : values[index].low < level.level - tolerance;
      if (hit) {
        interactionIndex = index;
        break;
      }
    }
    if (interactionIndex < 0) {
      return {
        ...level,
        tolerance,
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
    const closedThrough = level.type === 'BSL'
      ? candle.close > level.level + tolerance
      : candle.close < level.level - tolerance;
    const confirmation = evaluateLevelConfirmation(
      level.type,
      level.level,
      candle.close,
      localAtr,
      tolerance
    );
    return {
      ...level,
      tolerance,
      interactionIndex,
      interactionTime: candle.time,
      localAtr,
      reclaimDepthAtr: confirmation.depthAtr,
      confirmed: !closedThrough && confirmation.confirmed,
      active: false,
      status: closedThrough ? 'CLOSED_THROUGH' : confirmation.status,
      consumedBy: closedThrough ? 'ACCEPTED_CLOSE' : 'WICK_SWEEP',
      reactionDirection: level.type === 'BSL' ? 'BEARISH' : 'BULLISH',
      distance: Math.abs(level.level - conceptNumber(currentPrice, values.at(-1)?.close))
    };
  });

  return collapseEqualLevels(evaluated)
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, maxLevels);
}
