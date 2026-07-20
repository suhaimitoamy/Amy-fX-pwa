import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPreviousPeriodLevels,
  previousPeriodSnapshot
} from '../app/src/main/assets/apps/mapping/js/engine/concept-reference-levels.js';

const candle = ([iso, open, high, low, close]) => ({
  time: Date.parse(iso) / 1000,
  open, high, low, close
});
const rows = values => values.map(candle);
const byLabel = levels => Object.fromEntries(levels.map(level => [level.label, level]));

const jan1Daily = rows([
  ['2025-01-01T00:00:00Z', 2625.10, 2636.30, 2621.47, 2633.75]
]);

test('PDH and PDL use the previous closed UTC trading day from Drive D1 data', () => {
  const intraday = rows([
    ['2025-01-02T00:00:00Z', 2633.75, 2634.15, 2632.86, 2633.20],
    ['2025-01-02T00:15:00Z', 2633.19, 2635.15, 2633.15, 2634.65]
  ]);
  const snapshot = previousPeriodSnapshot(detectPreviousPeriodLevels(intraday, jan1Daily));
  assert.equal(snapshot.pdh, 2636.30);
  assert.equal(snapshot.pdl, 2621.47);
  assert.equal(snapshot.pdhStatus, 'DETECTED');
  assert.equal(snapshot.pdlStatus, 'DETECTED');
});

test('PDH wick sweep is consumed and confirmed on the exact M15 candle', () => {
  const intraday = rows([
    ['2025-01-02T02:45:00Z', 2633.41, 2635.90, 2632.80, 2635.85],
    ['2025-01-02T03:00:00Z', 2635.70, 2636.84, 2633.76, 2634.95]
  ]);
  const levels = byLabel(detectPreviousPeriodLevels(intraday, jan1Daily));
  assert.equal(levels.PDH.active, false);
  assert.equal(levels.PDH.status, 'CONFIRMED_REACTION');
  assert.equal(levels.PDH.interactionTime, Date.parse('2025-01-02T03:00:00Z') / 1000);
});

test('previous trading day skips Saturday when the new session starts Sunday', () => {
  const daily = rows([
    ['2025-01-02T00:00:00Z', 2633.75, 2665.18, 2630.99, 2662.74],
    ['2025-01-03T00:00:00Z', 2662.74, 2662.78, 2636.62, 2639.90]
  ]);
  const intraday = rows([
    ['2025-01-05T18:00:00Z', 2639.30, 2640.00, 2638.00, 2639.50]
  ]);
  const snapshot = previousPeriodSnapshot(detectPreviousPeriodLevels(intraday, daily));
  assert.equal(snapshot.pdh, 2662.78);
  assert.equal(snapshot.pdl, 2636.62);
});

test('PWH and PWL use the completed Sunday-start trading week', () => {
  const daily = rows([
    ['2025-01-05T00:00:00Z', 2639.30, 2647.28, 2634.18, 2635.30],
    ['2025-01-06T00:00:00Z', 2635.28, 2649.30, 2614.36, 2638.05],
    ['2025-01-07T00:00:00Z', 2638.05, 2664.10, 2636.86, 2646.85],
    ['2025-01-08T00:00:00Z', 2646.85, 2669.84, 2645.67, 2658.84],
    ['2025-01-09T00:00:00Z', 2658.82, 2678.39, 2657.53, 2671.70],
    ['2025-01-10T00:00:00Z', 2671.61, 2697.71, 2663.20, 2689.76]
  ]);
  const intraday = rows([
    ['2025-01-12T18:00:00Z', 2690.16, 2690.80, 2687.51, 2690.08]
  ]);
  const snapshot = previousPeriodSnapshot(detectPreviousPeriodLevels(intraday, daily));
  assert.equal(snapshot.pwh, 2697.71);
  assert.equal(snapshot.pwl, 2614.36);
});

test('old weekly touch found through closed D1 fallback remains consumed', () => {
  const daily = rows([
    ['2025-01-05T00:00:00Z', 100, 110, 90, 100],
    ['2025-01-06T00:00:00Z', 100, 108, 92, 101],
    ['2025-01-07T00:00:00Z', 101, 107, 93, 102],
    ['2025-01-08T00:00:00Z', 102, 106, 94, 103],
    ['2025-01-09T00:00:00Z', 103, 109, 95, 104],
    ['2025-01-10T00:00:00Z', 104, 108, 96, 105],
    ['2025-01-12T00:00:00Z', 105, 111, 100, 108]
  ]);
  const intraday = rows([
    ['2025-01-16T12:00:00Z', 106, 107, 104, 105]
  ]);
  const levels = byLabel(detectPreviousPeriodLevels(intraday, daily));
  assert.equal(levels.PWH.level, 110);
  assert.equal(levels.PWH.active, false);
  assert.equal(levels.PWH.status, 'REACHED');
  assert.equal(levels.PWH.interactionPrecision, 'DAILY_FALLBACK');
});

test('incomplete first previous week is not published', () => {
  const daily = rows([
    ['2025-01-01T00:00:00Z', 100, 110, 90, 105],
    ['2025-01-02T00:00:00Z', 105, 112, 95, 108],
    ['2025-01-03T00:00:00Z', 108, 111, 97, 100]
  ]);
  const intraday = rows([
    ['2025-01-05T18:00:00Z', 100, 101, 99, 100]
  ]);
  const labels = byLabel(detectPreviousPeriodLevels(intraday, daily));
  assert.equal(labels.PWH, undefined);
  assert.equal(labels.PWL, undefined);
});
