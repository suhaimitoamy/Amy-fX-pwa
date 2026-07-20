import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLiquidityDrawContext,
  scoreLiquidityDraw,
  wilderAtrSeries,
  LIQUIDITY_DRAW_CONTEXT_CONFIG
} from '../app/src/main/assets/apps/mapping/js/engine/liquidity-draw-context.js';

function candles(count = 120) {
  return Array.from({ length: count }, (_, index) => {
    const close = 2000 + index * 0.2;
    return {
      time: 1_700_000_000 + index * 900,
      open: close - 0.1,
      high: close + 0.5,
      low: close - 0.5,
      close
    };
  });
}

test('Liquidity Draw config remains locked to threshold 97 and context-only', () => {
  assert.equal(LIQUIDITY_DRAW_CONTEXT_CONFIG.threshold, 97);
  assert.equal(LIQUIDITY_DRAW_CONTEXT_CONFIG.purpose, 'CONTEXT_ONLY');
  assert.deepEqual(LIQUIDITY_DRAW_CONTEXT_CONFIG.supportedTimeframes, ['M15', 'H1']);
});

test('unsupported timeframe abstains instead of forcing a destination', () => {
  const result = calculateLiquidityDrawContext({ candles: candles(), tf: 'H4' });
  assert.equal(result.status, 'UNSUPPORTED');
  assert.equal(result.destination, null);
});

test('insufficient data abstains', () => {
  const result = calculateLiquidityDrawContext({ candles: candles(50), tf: 'M15' });
  assert.equal(result.status, 'INSUFFICIENT_DATA');
  assert.equal(result.destination, null);
});

test('neutral features stay below threshold', () => {
  const result = scoreLiquidityDraw();
  assert.equal(result.bslPercent, 50);
  assert.equal(result.sslPercent, 50);
  assert.equal(result.valid, false);
  assert.equal(result.destination, null);
});

test('strong upper context reaches fixed 97 threshold', () => {
  const result = scoreLiquidityDraw({
    distanceLocation: 0.95,
    htfDirection: 1,
    structureDirection: 1,
    emaDirection: 1,
    priceDirection: 1,
    sweepDirection: 1,
    rangeDirection: 1,
    eventDirection: 1,
    emaSlopeAtr: 2,
    bodyAtr: 2
  });
  assert.ok(result.bslPercent >= 97);
  assert.equal(result.valid, true);
  assert.equal(result.destination, 'BSL');
});

test('rejection guard blocks a high-confidence destination', () => {
  const result = scoreLiquidityDraw({
    distanceLocation: 0.95,
    htfDirection: 1,
    structureDirection: 1,
    emaDirection: 1,
    priceDirection: 1,
    sweepDirection: 1,
    rangeDirection: 1,
    eventDirection: 1,
    emaSlopeAtr: 2,
    bodyAtr: 2,
    upperLiquidityRejection: true
  });
  assert.ok(result.bslPercent >= 97);
  assert.equal(result.valid, false);
  assert.equal(result.destination, null);
});

test('Wilder ATR produces a finite value after 14 candles', () => {
  const values = wilderAtrSeries(candles(20), 14);
  assert.equal(values.slice(0, 13).every(value => value === null), true);
  assert.ok(Number.isFinite(values[13]));
  assert.ok(Number.isFinite(values.at(-1)));
});
