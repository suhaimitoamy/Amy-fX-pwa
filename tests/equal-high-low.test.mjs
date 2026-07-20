import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLiquidityConcepts } from '../app/src/main/assets/apps/mapping/js/engine/concept-liquidity.js';

function candlesFromHighs(highs, closes = null) {
  return highs.map((high, index) => {
    const close = closes?.[index] ?? high - 5;
    return {
      time: index,
      open: close - 0.2,
      high,
      low: high - 10,
      close
    };
  });
}

const baseHighs = [104,105,106,107,110,106,105,104,103,104,105,106,107,110.2,107,106,105,104,105,106,107,108];

test('two confirmed swing highs inside 0.03 ATR form one active Equal High', () => {
  const candles = candlesFromHighs(baseHighs);
  const levels = detectLiquidityConcepts(candles, { currentPrice: candles.at(-1).close, maxLevels: 100 });
  const equal = levels.find(level => level.type === 'BSL' && level.subtype === 'EQUAL');
  assert.ok(equal);
  assert.equal(equal.level, 110.2);
  assert.equal(equal.availableIndex, 17);
  assert.equal(equal.active, true);
  assert.equal(equal.touchCount, 2);
  assert.deepEqual(equal.memberIndices, [4, 13]);
  assert.equal(levels.some(level => level.type === 'BSL' && level.subtype === 'SWING'
    && Math.abs(level.level - equal.level) <= equal.tolerance), false);
});

test('a second swing outside 0.03 ATR is not classified as Equal High', () => {
  const highs = [...baseHighs];
  highs[13] = 110.6;
  const candles = candlesFromHighs(highs);
  const levels = detectLiquidityConcepts(candles, { currentPrice: candles.at(-1).close, maxLevels: 100 });
  assert.equal(levels.some(level => level.type === 'BSL' && level.subtype === 'EQUAL'), false);
});

test('Equal High is unavailable before four right-side confirmation candles close', () => {
  const candles = candlesFromHighs(baseHighs.slice(0, 17));
  const levels = detectLiquidityConcepts(candles, { currentPrice: candles.at(-1).close, maxLevels: 100 });
  assert.equal(levels.some(level => level.type === 'BSL' && level.subtype === 'EQUAL'), false);
});

test('wick beyond Equal High consumes the pool and records confirmed reaction', () => {
  const highs = [...baseHighs];
  highs[18] = 112;
  const closes = highs.map(high => high - 5);
  closes[18] = 104;
  const candles = candlesFromHighs(highs, closes);
  const levels = detectLiquidityConcepts(candles, { currentPrice: candles.at(-1).close, maxLevels: 100 });
  const equal = levels.find(level => level.type === 'BSL' && level.subtype === 'EQUAL');
  assert.ok(equal);
  assert.equal(equal.active, false);
  assert.equal(equal.interactionIndex, 18);
  assert.equal(equal.status, 'CONFIRMED_REACTION');
});

test('three connected equal highs collapse into one renewed pool without duplicates', () => {
  const highs = [104,105,106,107,110,106,105,104,103,104,105,106,107,110.2,107,106,105,104,105,106,107,108,110.1,107,106,105,104,103];
  const candles = candlesFromHighs(highs);
  const levels = detectLiquidityConcepts(candles, { currentPrice: candles.at(-1).close, maxLevels: 100 });
  const equals = levels.filter(level => level.type === 'BSL' && level.subtype === 'EQUAL');
  assert.equal(equals.length, 1);
  assert.equal(equals[0].active, true);
  assert.equal(equals[0].touchCount, 3);
  assert.deepEqual(equals[0].memberIndices, [4, 13, 22]);
});

test('two confirmed swing lows inside tolerance form one active Equal Low', () => {
  const lows = [106,105,104,103,100,104,105,106,107,106,105,104,103,99.8,103,104,105,106,105,104,103,102];
  const candles = lows.map((low, index) => ({time:index, open:low+5.2, high:low+10, low, close:low+5}));
  const levels = detectLiquidityConcepts(candles, { currentPrice: candles.at(-1).close, maxLevels: 100 });
  const equal = levels.find(level => level.type === 'SSL' && level.subtype === 'EQUAL');
  assert.ok(equal);
  assert.equal(equal.level, 99.8);
  assert.equal(equal.active, true);
  assert.equal(equal.touchCount, 2);
  assert.deepEqual(equal.memberIndices, [4, 13]);
});
