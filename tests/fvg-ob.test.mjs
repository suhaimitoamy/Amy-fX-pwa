import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFvgConcepts } from '../app/src/main/assets/apps/mapping/js/engine/concept-fvg.js';
import { obCreatedImbalance } from '../app/src/main/assets/apps/mapping/js/engine/concept-ob-helpers.js';
import { detectOrderBlockConcepts } from '../app/src/main/assets/apps/mapping/js/engine/concept-ob.js';

const candle = (open, high, low, close, time) => ({ time, open, high, low, close });

test('small valid three-candle FVG is kept without a 0.7 ATR width filter', () => {
  const values = [
    candle(99, 99.4, 98.8, 99.2, 0),
    candle(99.2, 99.5, 99, 99.3, 1),
    candle(99.3, 100, 99.2, 99.5, 2),
    candle(99.5, 104.2, 99.4, 104, 3),
    candle(100.2, 104.5, 100.2, 104.1, 4)
  ];
  const zones = detectFvgConcepts(values, { currentPrice: 104.1 });
  assert.equal(zones.length, 1);
  assert.equal(zones[0].bottom, 100);
  assert.equal(zones[0].top, 100.2);
  assert.ok(zones[0].widthAtr < 0.7);
});

test('FVG is removed on a full wick fill and is not converted to IFVG', () => {
  const values = [
    candle(99, 99.4, 98.8, 99.2, 0),
    candle(99.2, 99.5, 99, 99.3, 1),
    candle(99.3, 100, 99.2, 99.5, 2),
    candle(99.5, 104.2, 99.4, 104, 3),
    candle(100.2, 104.5, 100.2, 104.1, 4),
    candle(104, 104.2, 100, 101, 5)
  ];
  assert.equal(detectFvgConcepts(values, { currentPrice: 101 }).length, 0);
});

test('Order Block uses candle body and is available on the break candle without HTF or FVG gating', () => {
  const values = [
    candle(100, 101, 99, 100.5, 0),
    candle(100.5, 102, 100, 101, 1),
    candle(101, 102, 100, 101.5, 2),
    candle(101.5, 103, 101, 102, 3),
    candle(105, 106, 102, 103, 4),
    candle(103, 108, 102.5, 107, 5)
  ];
  const structure = {
    structureEvents: [{ index: 5, direction: 'BULLISH', concept: 'MSS', scope: 'MAJOR', valid: true }]
  };
  const zones = detectOrderBlockConcepts(values, structure, { htfCandles: {}, currentPrice: 107 });
  assert.equal(zones.length, 1);
  assert.equal(zones[0].bottom, 103);
  assert.equal(zones[0].top, 105);
  assert.equal(zones[0].availableIndex, 5);
  assert.equal(zones[0].structureBreakIndex, 5);
  assert.equal(zones[0].createdImbalance, false);
  assert.equal(zones[0].htfAligned, false);
});

test('invalid Order Block is deleted instead of converted into a breaker', () => {
  const values = [
    candle(100, 101, 99, 100.5, 0),
    candle(100.5, 102, 100, 101, 1),
    candle(101, 102, 100, 101.5, 2),
    candle(101.5, 103, 101, 102, 3),
    candle(105, 106, 102, 103, 4),
    candle(103, 108, 102.5, 107, 5),
    candle(104, 105, 101, 102.9, 6)
  ];
  const structure = {
    structureEvents: [{ index: 5, direction: 'BULLISH', concept: 'MSS', scope: 'MAJOR', valid: true }]
  };
  assert.equal(detectOrderBlockConcepts(values, structure, { currentPrice: 102.9 }).length, 0);
});

test('OB imbalance metadata never reads candles after the structure break', () => {
  const values = [
    candle(100, 102, 99, 101, 0),
    candle(101, 103, 100, 102, 1),
    candle(102, 103, 101, 102.5, 2),
    candle(104, 105, 104, 105, 3)
  ];
  assert.equal(obCreatedImbalance(values, 0, 2, 'BULLISH'), false);
});
