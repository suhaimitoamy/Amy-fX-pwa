import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLiquidityConcepts } from '../app/src/main/assets/apps/mapping/js/engine/concept-liquidity.js';

const candle = ([iso, open, high, low, close]) => ({
  time: Date.parse(iso) / 1000,
  open,
  high,
  low,
  close
});

const driveCandles = rows => rows.map(candle);

test('BSL requires four candles on the right, matching the reference swing length', () => {
  const candles = driveCandles([
    ['2025-01-02T03:15:00Z', 2634.93, 2634.95, 2631.16, 2633.09],
    ['2025-01-02T03:30:00Z', 2633.07, 2636.72, 2630.99, 2636.03],
    ['2025-01-02T03:45:00Z', 2636.05, 2637.56, 2635.12, 2636.35],
    ['2025-01-02T04:00:00Z', 2636.36, 2639.71, 2636.36, 2638.05],
    ['2025-01-02T04:15:00Z', 2638.00, 2639.78, 2637.03, 2637.20],
    ['2025-01-02T04:30:00Z', 2637.30, 2638.30, 2636.53, 2637.00],
    ['2025-01-02T04:45:00Z', 2637.00, 2637.75, 2635.86, 2635.91],
    ['2025-01-02T05:00:00Z', 2635.91, 2638.82, 2632.53, 2638.74],
    ['2025-01-02T05:15:00Z', 2638.72, 2646.10, 2637.93, 2644.60],
    ['2025-01-02T05:30:00Z', 2644.57, 2645.55, 2642.95, 2643.75],
    ['2025-01-02T05:45:00Z', 2643.71, 2643.92, 2640.27, 2642.49],
    ['2025-01-02T06:00:00Z', 2642.49, 2643.25, 2640.40, 2641.10]
  ]);

  const levels = detectLiquidityConcepts(candles, {
    currentPrice: candles.at(-1).close,
    maxLevels: 100
  });

  assert.equal(
    levels.some(level => level.type === 'BSL' && level.originIndex === 4 && level.level === 2639.78),
    false,
    'High 2639.78 hanya lolos pivot 3-bar dan harus ditolak oleh pivot 4-bar'
  );
});

test('confirmed BSL is published after four right-side candles', () => {
  const candles = driveCandles([
    ['2025-01-01T20:15:00Z', 2629.26, 2632.80, 2629.16, 2632.30],
    ['2025-01-01T20:30:00Z', 2632.40, 2634.15, 2632.11, 2633.30],
    ['2025-01-01T20:45:00Z', 2633.30, 2633.30, 2631.41, 2632.74],
    ['2025-01-01T21:00:00Z', 2632.74, 2634.55, 2632.40, 2634.36],
    ['2025-01-01T21:15:00Z', 2634.36, 2636.30, 2633.66, 2635.50],
    ['2025-01-01T21:30:00Z', 2635.50, 2635.64, 2632.45, 2633.25],
    ['2025-01-01T21:45:00Z', 2633.05, 2635.15, 2632.15, 2634.50],
    ['2025-01-01T22:00:00Z', 2634.40, 2635.20, 2632.90, 2632.95],
    ['2025-01-01T22:15:00Z', 2632.95, 2634.55, 2632.78, 2633.16],
    ['2025-01-01T22:30:00Z', 2633.15, 2634.11, 2632.07, 2633.24],
    ['2025-01-01T22:45:00Z', 2633.20, 2633.64, 2632.55, 2633.45],
    ['2025-01-01T23:00:00Z', 2633.47, 2633.47, 2631.91, 2632.07],
    ['2025-01-01T23:15:00Z', 2632.06, 2632.96, 2631.88, 2632.24]
  ]);

  const levels = detectLiquidityConcepts(candles, {
    currentPrice: candles.at(-1).close,
    maxLevels: 100
  });
  const bsl = levels.find(level => level.type === 'BSL' && level.originIndex === 4);

  assert.ok(bsl);
  assert.equal(bsl.level, 2636.30);
  assert.equal(bsl.availableIndex, 8);
  assert.equal(bsl.active, true);
  assert.equal(bsl.status, 'DETECTED');
});

test('confirmed SSL is published after four right-side candles', () => {
  const candles = driveCandles([
    ['2025-01-01T22:45:00Z', 2633.20, 2633.64, 2632.55, 2633.45],
    ['2025-01-01T23:00:00Z', 2633.47, 2633.47, 2631.91, 2632.07],
    ['2025-01-01T23:15:00Z', 2632.06, 2632.96, 2631.88, 2632.24],
    ['2025-01-01T23:30:00Z', 2632.15, 2632.70, 2631.80, 2631.96],
    ['2025-01-01T23:45:00Z', 2631.93, 2634.05, 2630.86, 2633.75],
    ['2025-01-02T00:00:00Z', 2633.75, 2634.15, 2632.86, 2633.20],
    ['2025-01-02T00:15:00Z', 2633.19, 2635.15, 2633.15, 2634.65],
    ['2025-01-02T00:30:00Z', 2634.57, 2636.28, 2634.30, 2634.66],
    ['2025-01-02T00:45:00Z', 2634.73, 2635.20, 2633.75, 2633.87],
    ['2025-01-02T01:00:00Z', 2633.75, 2633.82, 2631.35, 2631.57],
    ['2025-01-02T01:15:00Z', 2631.55, 2634.30, 2631.00, 2634.09],
    ['2025-01-02T01:30:00Z', 2634.07, 2634.49, 2633.25, 2633.95],
    ['2025-01-02T01:45:00Z', 2633.96, 2635.24, 2633.44, 2633.97]
  ]);

  const levels = detectLiquidityConcepts(candles, {
    currentPrice: candles.at(-1).close,
    maxLevels: 100
  });
  const ssl = levels.find(level => level.type === 'SSL' && level.originIndex === 4);

  assert.ok(ssl);
  assert.equal(ssl.level, 2630.86);
  assert.equal(ssl.availableIndex, 8);
  assert.equal(ssl.active, true);
  assert.equal(ssl.status, 'DETECTED');
});
