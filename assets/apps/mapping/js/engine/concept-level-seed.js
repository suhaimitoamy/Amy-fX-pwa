import { conceptAtrAtClean } from './concept-candles.js';

function addSwingLevel(list, item, tolerance) {
  if (list.some(existing => existing.type === item.type
    && existing.subtype === 'SWING'
    && Math.abs(existing.level - item.level) <= tolerance)) return;
  list.push(item);
}

export function addSwingLevels(values, swings, levels, confirmationBars = 4) {
  const recentHighs = swings.highs.slice(-25);
  const recentLows = swings.lows.slice(-25);
  for (const high of recentHighs) {
    const localAtr = Math.max(conceptAtrAtClean(values, high.index), 0.0000001);
    addSwingLevel(levels, {
      id: `BSL:SWING:${high.index}:${high.high.toFixed(5)}`,
      type: 'BSL', subtype: 'SWING', level: high.high,
      originIndex: high.index, availableIndex: high.index + confirmationBars, localAtr
    }, localAtr * 0.015);
  }
  for (const low of recentLows) {
    const localAtr = Math.max(conceptAtrAtClean(values, low.index), 0.0000001);
    addSwingLevel(levels, {
      id: `SSL:SWING:${low.index}:${low.low.toFixed(5)}`,
      type: 'SSL', subtype: 'SWING', level: low.low,
      originIndex: low.index, availableIndex: low.index + confirmationBars, localAtr
    }, localAtr * 0.015);
  }
  return { recentHighs, recentLows };
}

export function addEqualLevels(values, items, type, levels, confirmationBars = 4) {
  for (let index = 1; index < items.length; index += 1) {
    const current = items[index];
    const localAtr = Math.max(conceptAtrAtClean(values, current.index), 0.0000001);
    const tolerance = Math.max(localAtr * 0.03, 0.0000001);
    const candidates = items.slice(Math.max(0, index - 4), index).reverse();
    const price = item => type === 'BSL' ? item.high : item.low;
    const previous = candidates.find(item => Math.abs(price(item) - price(current)) <= tolerance);
    if (!previous) continue;
    const level = type === 'BSL'
      ? Math.max(previous.high, current.high)
      : Math.min(previous.low, current.low);
    levels.push({
      id: `${type}:EQUAL:${previous.index}:${current.index}:${level.toFixed(5)}`,
      type,
      subtype: 'EQUAL',
      level,
      originIndex: current.index,
      availableIndex: current.index + confirmationBars,
      localAtr,
      tolerance,
      memberIndices: [previous.index, current.index],
      touchCount: 2
    });
  }
}
