import { conceptAtrAtClean } from './concept-candles.js';

function addLevel(list, item, tolerance) {
  if (list.some(existing => existing.type === item.type && Math.abs(existing.level - item.level) <= tolerance)) return;
  list.push(item);
}

export function addSwingLevels(values, swings, levels) {
  const recentHighs = swings.highs.slice(-25);
  const recentLows = swings.lows.slice(-25);
  for (const high of recentHighs) {
    const localAtr = Math.max(conceptAtrAtClean(values, high.index), 0.0000001);
    addLevel(levels, {
      id: `BSL:SWING:${high.index}:${high.high.toFixed(5)}`,
      type: 'BSL', subtype: 'SWING', level: high.high,
      originIndex: high.index, availableIndex: high.index + 3, localAtr
    }, localAtr * 0.015);
  }
  for (const low of recentLows) {
    const localAtr = Math.max(conceptAtrAtClean(values, low.index), 0.0000001);
    addLevel(levels, {
      id: `SSL:SWING:${low.index}:${low.low.toFixed(5)}`,
      type: 'SSL', subtype: 'SWING', level: low.low,
      originIndex: low.index, availableIndex: low.index + 3, localAtr
    }, localAtr * 0.015);
  }
  return { recentHighs, recentLows };
}

export function addEqualLevels(values, items, type, levels) {
  for (let index = 1; index < items.length; index += 1) {
    const current = items[index];
    const localAtr = Math.max(conceptAtrAtClean(values, current.index), 0.0000001);
    const tolerance = Math.max(localAtr * 0.03, 0.0000001);
    const candidates = items.slice(Math.max(0, index - 4), index).reverse();
    const previous = candidates.find(item => Math.abs(
      (type === 'BSL' ? item.high : item.low) - (type === 'BSL' ? current.high : current.low)
    ) <= tolerance);
    if (!previous) continue;
    const level = type === 'BSL'
      ? Math.max(previous.high, current.high)
      : Math.min(previous.low, current.low);
    addLevel(levels, {
      id: `${type}:EQUAL:${current.index}:${level.toFixed(5)}`,
      type, subtype: 'EQUAL', level,
      originIndex: current.index, availableIndex: current.index + 3, localAtr
    }, tolerance);
  }
}
