import test from 'node:test';
import assert from 'node:assert/strict';

const outlookUrl = new URL('../app/src/main/assets/apps/mapping/js/outlook/market-outlook-core.js', import.meta.url);
const outlook = await import(outlookUrl.href);

function candles(start = 4000, direction = 1, count = 80) {
  return Array.from({ length: count }, (_, index) => {
    const open = start + direction * index * 0.8;
    const close = open + direction * 0.5;
    return {
      time: 1_700_000_000 + index * 900,
      open,
      high: Math.max(open, close) + 1.2,
      low: Math.min(open, close) - 1.1,
      close
    };
  });
}

function result(direction = 'BULLISH', price = 4070) {
  const bullish = direction === 'BULLISH';
  const targets = [
    { type: 'BSL', level: 4090, status: 'ACTIVE' },
    { type: 'BSL', level: 4110, status: 'ACTIVE' },
    { type: 'SSL', level: 4050, status: 'ACTIVE' },
    { type: 'SSL', level: 4030, status: 'ACTIVE' }
  ];
  return {
    tf: 'M15',
    price,
    final: direction,
    st: {
      trend: direction,
      last: { breakType: 'VALID_BREAK', valid: true, dir: direction, kind: 'BOS' }
    },
    htfNarrative: { htfBias: direction },
    premiumDiscountZone: bullish ? 'DISCOUNT' : 'PREMIUM',
    dealingRange: { low: 4040, high: 4100, equilibrium: 4070 },
    activeLiquidityTargets: targets,
    liquidityHierarchy: {
      activeTargets: targets,
      drawTarget: bullish ? { type: 'BSL', level: 4090 } : { type: 'SSL', level: 4050 }
    }
  };
}

function projectionArgs(base, direction, candleDirection, sessionId = 'LONDON') {
  return {
    result: base,
    analyses: {
      M15: base,
      M30: result(direction),
      H1: result(direction),
      H4: result(direction),
      D1: result(direction)
    },
    candlesByTf: { M15: candles(direction === 'BULLISH' ? 4000 : 4100, candleDirection) },
    price: 4070,
    newsRisk: 'NORMAL',
    freshness: {
      M15: { state: 'FRESH' },
      H1: { state: 'FRESH' },
      H4: { state: 'FRESH' }
    },
    session: { id: sessionId },
    now: 1_800_000_000_000
  };
}

test('aligned bullish context produces a capped bullish outlook and BSL target', () => {
  const projection = outlook.buildMarketOutlooks(projectionArgs(result('BULLISH'), 'BULLISH', 1));
  const first = projection.outlooks[0];
  assert.equal(projection.outlooks.length, 3);
  assert.equal(first.direction, 'BULLISH');
  assert.equal(first.primaryTargetType, 'BSL');
  assert.equal(first.primaryTarget, 4090);
  assert.ok(first.probability <= 76);
  assert.equal(first.probability + first.alternativeProbability + first.invalidationProbability, 100);
});

test('bearish outlook in discount carries a chase-risk warning and remains capped', () => {
  const base = result('BEARISH');
  base.premiumDiscountZone = 'DISCOUNT';
  const projection = outlook.buildMarketOutlooks(projectionArgs(base, 'BEARISH', -1, 'ASIA'));
  const first = projection.outlooks[0];
  assert.equal(first.direction, 'BEARISH');
  assert.ok(first.risks.some(item => item.toLowerCase().includes('discount')));
  assert.ok(first.probability <= 76);
  assert.equal(first.probability + first.alternativeProbability + first.invalidationProbability, 100);
});

test('mixed timeframe structure produces range or reduced directional confidence', () => {
  const base = result('BULLISH');
  const projection = outlook.buildMarketOutlooks({
    ...projectionArgs(base, 'BULLISH', 0, 'OFF_SESSION'),
    analyses: {
      M15: result('BULLISH'),
      M30: result('BEARISH'),
      H1: result('BULLISH'),
      H4: result('BEARISH'),
      D1: { ...result('BULLISH'), st: { trend: 'NEUTRAL', last: null }, final: 'NEUTRAL' }
    },
    newsRisk: 'ELEVATED'
  });
  assert.ok(['RANGE', 'BULLISH', 'BEARISH'].includes(projection.outlooks[0].direction));
  assert.ok(projection.outlooks[0].probability <= 65);
});

test('prediction tracker resolves bullish target before invalidation', () => {
  const createdAt = 1_700_000_000_000;
  const history = [{
    id: 'x', slot: 'x', horizonId: 'INTRADAY', horizonLabel: '1–4 Jam',
    createdAt, expiresAt: createdAt + 4 * 60 * 60 * 1000,
    startPrice: 4070, direction: 'BULLISH', probability: 60,
    target: 4080, invalidation: 4060, status: 'PENDING', maxHigh: 4070, minLow: 4070
  }];
  const evaluated = outlook.evaluatePredictionHistory(history, {
    candlesByTf: {
      M1: [
        { time: (createdAt + 60_000) / 1000, high: 4075, low: 4068, close: 4074 },
        { time: (createdAt + 120_000) / 1000, high: 4081, low: 4072, close: 4080 }
      ]
    },
    livePrice: 4080,
    now: createdAt + 180_000
  });
  assert.equal(evaluated[0].status, 'RESOLVED');
  assert.equal(evaluated[0].outcome, 'TARGET_HIT');
  assert.equal(evaluated[0].directionCorrect, true);
});

test('tracker hides accuracy readiness until minimum sample size', () => {
  const history = Array.from({ length: 19 }, (_, index) => ({
    id: String(index), horizonId: 'INTRADAY', status: 'RESOLVED',
    directionCorrect: true, targetHit: index % 2 === 0, invalidated: false, resolvedAt: index
  }));
  const stats = outlook.predictionStats(history, 20);
  assert.equal(stats.overall.ready, false);
  assert.equal(stats.overall.needed, 1);
  const ready = outlook.predictionStats([
    ...history,
    { id: '20', horizonId: 'INTRADAY', status: 'RESOLVED', directionCorrect: false, targetHit: false, invalidated: true, resolvedAt: 20 }
  ], 20);
  assert.equal(ready.overall.ready, true);
  assert.equal(ready.overall.count, 20);
});
