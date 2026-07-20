import test from 'node:test';
import assert from 'node:assert/strict';
import { detectStructureConcepts, STRUCTURE_SWING_LENGTH } from '../app/src/main/assets/apps/mapping/js/engine/concept-structure.js';

const driveCandle = ([iso, open, high, low, close]) => ({
  time: Date.parse(iso) / 1000,
  open, high, low, close
});

const driveRows = [
  ['2025-01-01T18:00:00Z', 2625.1, 2626.01, 2623.7, 2624.59],
  ['2025-01-01T18:15:00Z', 2624.59, 2624.89, 2623.25, 2623.45],
  ['2025-01-01T18:30:00Z', 2623.46, 2623.7, 2621.7, 2621.7],
  ['2025-01-01T18:45:00Z', 2621.66, 2624.24, 2621.47, 2623.55],
  ['2025-01-01T19:00:00Z', 2623.66, 2626.01, 2622.45, 2625.53],
  ['2025-01-01T19:15:00Z', 2625.53, 2626.3, 2625.01, 2626.11],
  ['2025-01-01T19:30:00Z', 2626.11, 2627.32, 2625.24, 2626.79],
  ['2025-01-01T19:45:00Z', 2626.79, 2627.76, 2625.16, 2625.18],
  ['2025-01-01T20:00:00Z', 2625.18, 2630.7, 2623.64, 2629.32],
  ['2025-01-01T20:15:00Z', 2629.26, 2632.8, 2629.16, 2632.3],
  ['2025-01-01T20:30:00Z', 2632.4, 2634.15, 2632.11, 2633.3],
  ['2025-01-01T20:45:00Z', 2633.3, 2633.3, 2631.41, 2632.74],
  ['2025-01-01T21:00:00Z', 2632.74, 2634.55, 2632.4, 2634.36],
  ['2025-01-01T21:15:00Z', 2634.36, 2636.3, 2633.66, 2635.5],
  ['2025-01-01T21:30:00Z', 2635.5, 2635.64, 2632.45, 2633.25],
  ['2025-01-01T21:45:00Z', 2633.05, 2635.15, 2632.15, 2634.5],
  ['2025-01-01T22:00:00Z', 2634.4, 2635.2, 2632.9, 2632.95],
  ['2025-01-01T22:15:00Z', 2632.95, 2634.55, 2632.78, 2633.16],
  ['2025-01-01T22:30:00Z', 2633.15, 2634.11, 2632.07, 2633.24],
  ['2025-01-01T22:45:00Z', 2633.2, 2633.64, 2632.55, 2633.45],
  ['2025-01-01T23:00:00Z', 2633.47, 2633.47, 2631.91, 2632.07],
  ['2025-01-01T23:15:00Z', 2632.06, 2632.96, 2631.88, 2632.24],
  ['2025-01-01T23:30:00Z', 2632.15, 2632.7, 2631.8, 2631.96],
  ['2025-01-01T23:45:00Z', 2631.93, 2634.05, 2630.86, 2633.75],
  ['2025-01-02T00:00:00Z', 2633.75, 2634.15, 2632.86, 2633.2],
  ['2025-01-02T00:15:00Z', 2633.19, 2635.15, 2633.15, 2634.65],
  ['2025-01-02T00:30:00Z', 2634.57, 2636.28, 2634.3, 2634.66],
  ['2025-01-02T00:45:00Z', 2634.73, 2635.2, 2633.75, 2633.87],
  ['2025-01-02T01:00:00Z', 2633.75, 2633.82, 2631.35, 2631.57],
  ['2025-01-02T01:15:00Z', 2631.55, 2634.3, 2631.0, 2634.09],
  ['2025-01-02T01:30:00Z', 2634.07, 2634.49, 2633.25, 2633.95],
  ['2025-01-02T01:45:00Z', 2633.96, 2635.24, 2633.44, 2633.97],
  ['2025-01-02T02:00:00Z', 2633.95, 2634.91, 2633.33, 2634.21],
  ['2025-01-02T02:15:00Z', 2634.18, 2635.8, 2633.4, 2634.12],
  ['2025-01-02T02:30:00Z', 2634.07, 2634.1, 2632.83, 2633.41],
  ['2025-01-02T02:45:00Z', 2633.41, 2635.9, 2632.8, 2635.85],
  ['2025-01-02T03:00:00Z', 2635.7, 2636.84, 2633.76, 2634.95],
  ['2025-01-02T03:15:00Z', 2634.93, 2634.95, 2631.16, 2633.09],
  ['2025-01-02T03:30:00Z', 2633.07, 2636.72, 2630.99, 2636.03],
  ['2025-01-02T03:45:00Z', 2636.05, 2637.56, 2635.12, 2636.35]
].map(driveCandle);

function synthetic(highs, closes) {
  return highs.map((high, index) => ({
    time: index,
    open: Math.min(closes[index], high - 0.5),
    high,
    low: 100,
    close: closes[index]
  }));
}

test('structure uses the same four-bar pivot length as the reference', () => {
  assert.equal(STRUCTURE_SWING_LENGTH, 4);
});

test('Drive candle close above confirmed swing creates MSS even without displacement', () => {
  const result = detectStructureConcepts(driveRows);
  assert.equal(result.trend, 'BULLISH');
  assert.equal(result.latestStructure.concept, 'MSS');
  assert.equal(result.latestStructure.direction, 'BULLISH');
  assert.equal(result.latestStructure.level, 2636.28);
  assert.equal(result.latestStructure.index, 39);
  assert.equal(result.latestStructure.hasDisplacement, false);
  assert.equal(result.latestStructure.valid, true);
});

test('first directional close-cross is MSS and the next same-direction close-cross is BOS', () => {
  const highs = [104,105,106,107,110,109,108,107,106,112,113,114,113,115,114,113,112,111,117];
  const closes = [103,104,105,106,108,107,106,105,104,111,112,113,112,114,113,112,111,110,116];
  const result = detectStructureConcepts(synthetic(highs, closes));
  assert.deepEqual(
    result.structureEvents.map(event => [event.concept, event.direction, event.level, event.index]),
    [['MSS', 'BULLISH', 110, 9], ['BOS', 'BULLISH', 115, 18]]
  );
  assert.equal(result.trend, 'BULLISH');
});

test('one confirmed swing can emit only one sweep before it is replaced', () => {
  const highs = [104,105,106,107,110,109,108,107,106,111,112];
  const closes = [103,104,105,106,108,107,106,105,104,109,108];
  const result = detectStructureConcepts(synthetic(highs, closes));
  const sweeps = result.sweepEvents.filter(event => event.concept === 'BSL' && event.level === 110);
  assert.equal(sweeps.length, 1);
});

test('break lifecycle marks a close back inside as failed', () => {
  const highs = [104,105,106,107,110,109,108,107,106,112,111];
  const closes = [103,104,105,106,108,107,106,105,104,111,109];
  const result = detectStructureConcepts(synthetic(highs, closes));
  assert.equal(result.structureEvents[0].status, 'FAILED');
  assert.equal(result.structureEvents[0].failureIndex, 10);
});
