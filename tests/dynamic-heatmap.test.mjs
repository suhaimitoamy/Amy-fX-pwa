import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../lib/heatmap-core.mjs', import.meta.url),
  'utf8'
);
const heatmap = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function candle(open, high, low, close, index) {
  return { open, high, low, close, time: 1_700_000_000 + index * 900 };
}

test('dynamic heatmap always inserts a current-price row', () => {
  const candles = Array.from({ length: 40 }, (_, index) => {
    const center = 100 + Math.sin(index / 2) * 4;
    return candle(center - 0.4, center + 1, center - 1, center + 0.4, index);
  });
  const result = heatmap.computeDynamicHeatmap(candles, {
    swingWindow: 1,
    bucketSize: 1,
    maxZonesPerSide: 8
  });
  const current = result.zones.find(zone => zone.isCurrent);
  assert.ok(current);
  assert.equal(current.status, 'LIVE_PRICE');
  assert.equal(current.price, Number(candles.at(-1).close.toFixed(2)));
});

test('a support level above current price is not kept as active support after a close break', () => {
  const candles = [
    candle(103, 104, 102, 103, 0),
    candle(103, 104, 100, 103, 1),
    candle(103, 104, 102, 103, 2),
    candle(103, 104, 101, 102, 3),
    candle(102, 103, 98, 98.5, 4),
    candle(98.5, 100.4, 98, 99.8, 5),
    candle(99.8, 100, 97, 97.5, 6),
    candle(97.5, 98.2, 96.8, 97.2, 7)
  ];
  const result = heatmap.computeDynamicHeatmap(candles, {
    swingWindow: 1,
    bucketSize: 1,
    maxZonesPerSide: 10
  });
  const oldSupport = result.zones.find(zone => !zone.isCurrent && Math.abs(zone.price - 100) < 0.01);
  assert.ok(oldSupport, 'the former support should remain visible as market memory');
  assert.notEqual(oldSupport.liquidityType, 'SSL');
  assert.notEqual(oldSupport.role, 'SUPPORT');
  assert.ok(['POLARITY_FLIP', 'BROKEN'].includes(oldSupport.status));
});

test('polarity retest converts broken support into resistance / BSL context', () => {
  const candles = [
    candle(103, 104, 102, 103, 0),
    candle(103, 104, 100, 103, 1),
    candle(103, 104, 102, 103, 2),
    candle(103, 104, 101, 102, 3),
    candle(102, 103, 98, 98.5, 4),
    candle(98.5, 100.4, 98, 99.8, 5),
    candle(99.8, 100, 97, 97.5, 6),
    candle(97.5, 98.2, 96.8, 97.2, 7)
  ];
  const result = heatmap.computeDynamicHeatmap(candles, {
    swingWindow: 1,
    bucketSize: 1,
    maxZonesPerSide: 10
  });
  const flipped = result.zones.find(zone => !zone.isCurrent && Math.abs(zone.price - 100) < 0.01);
  assert.equal(flipped.status, 'POLARITY_FLIP');
  assert.equal(flipped.role, 'RESISTANCE');
  assert.equal(flipped.liquidityType, 'BSL');
});

test('intensity uses bounded logarithmic normalization so one outlier cannot flatten every row', () => {
  const candles = [];
  for (let index = 0; index < 90; index += 1) {
    const wave = index % 6;
    const center = wave < 3 ? 110 + wave : 112 - wave;
    candles.push(candle(center - 0.3, center + 1, center - 1, center + 0.3, index));
  }
  const result = heatmap.computeDynamicHeatmap(candles, {
    swingWindow: 1,
    bucketSize: 1,
    maxZonesPerSide: 10
  });
  const visible = result.zones.filter(zone => !zone.isCurrent);
  assert.ok(visible.length > 1);
  assert.ok(visible.every(zone => zone.intensity >= 0.08 && zone.intensity <= 1));
  assert.ok(visible.some(zone => zone.intensity > 0.2));
});

test('summary exposes active pressure and nearest draw from usable zones', () => {
  const candles = Array.from({ length: 70 }, (_, index) => {
    const center = 100 + Math.sin(index / 3) * 5;
    return candle(center - 0.5, center + 1.2, center - 1.2, center + 0.5, index);
  });
  const result = heatmap.computeDynamicHeatmap(candles, {
    swingWindow: 1,
    bucketSize: 1,
    maxZonesPerSide: 10
  });
  assert.ok(['ABOVE PRICE', 'BELOW PRICE', 'BALANCED'].includes(result.summary.pressure));
  assert.ok(result.summary.activeZones >= 0);
  if (result.summary.nearestDraw) {
    assert.ok(['BSL', 'SSL'].includes(result.summary.nearestDraw.type));
    assert.ok(Number.isFinite(result.summary.nearestDraw.price));
  }
});
