import test from 'node:test';
import assert from 'node:assert/strict';
import { detectStructure, detectOB, modelSweepMssFvg } from '../app/src/main/assets/apps/mapping/js/engine/ict-core.js';
import { buildMarketOutlooks, evaluatePredictionHistory } from '../app/src/main/assets/apps/mapping/js/outlook/market-outlook-core.js';

function candle(open, high, low, close, time = 0) { return { open, high, low, close, time }; }

test('small body-ratio candle is not accepted as displacement without ATR size', () => {
  const candles = Array.from({ length: 20 }, (_, index) => candle(100, 102, 98, 100, index));
  candles.push(candle(100, 100.4, 99.9, 100.35, 20));
  const structure = detectStructure(candles, { highs: [{ index: 10, high: 100.2 }], lows: [] });
  assert.equal(structure.lastConfirmedBreak, null);
});

test('valid break and later sweep remain separate states', () => {
  const candles = Array.from({ length: 20 }, (_, index) => candle(100, 101, 99, 100, index));
  candles.push(candle(100, 103, 99.8, 102.7, 20));
  candles.push(candle(100, 101.4, 97.5, 99.2, 21));
  const structure = detectStructure(candles, {
    highs: [{ index: 10, high: 101.5 }],
    lows: [{ index: 11, low: 98 }]
  });
  assert.equal(structure.trend, 'BULLISH');
  assert.equal(structure.lastConfirmedBreak?.dir, 'BULLISH');
  assert.equal(structure.lastSweep?.dir, 'BEARISH');
  assert.equal(structure.last?.breakType, 'SWEEP_ONLY');
});

test('order block status is evaluated only after confirmation candle', () => {
  const candles = [
    candle(100, 101, 99, 100.5),
    candle(100.5, 101, 98, 99),
    candle(99, 100.8, 98.5, 100.6),
    candle(100.6, 103, 100.5, 102.8),
    candle(102.8, 104, 102.4, 103.5)
  ];
  const structure = { lastConfirmedBreak: { valid: true, breakType: 'VALID_BREAK', hasDisplacement: true, index: 3, dir: 'BULLISH' } };
  const [orderBlock] = detectOB(candles, structure, { htfBias: 'BULLISH' });
  assert.ok(orderBlock);
  assert.equal(orderBlock.confirmedAt, 3);
  assert.equal(orderBlock.status, 'FRESH');
});

test('Sweep MSS FVG requires FVG after MSS', () => {
  const candles = Array.from({ length: 20 }, (_, index) => candle(100, 101, 99, 100, index));
  candles[10] = candle(100, 101, 97, 99.5, 10);
  const context = {
    price: 100,
    eq: 101,
    bsl: 105,
    ssl: 95,
    st: { lastConfirmedBreak: { valid: true, breakType: 'VALID_BREAK', dir: 'BULLISH', index: 12 } },
    sw: { lows: [{ index: 5, low: 98 }], highs: [] },
    htfNarrative: { htfBias: 'BULLISH' },
    liquidityHierarchy: { activeTargets: [{ type: 'BSL', level: 105, hierarchy: 'EXTERNAL' }] },
    dealingRange: { currentZone: 'DISCOUNT' },
    fvgs: [{ type: 'BULLISH', index: 11, status: 'FRESH', qualityLabel: 'STRONG', qualityScore: 90, bottom: 99, top: 100 }]
  };
  assert.equal(modelSweepMssFvg(candles, 'M15', context), null);
  context.fvgs = [{ ...context.fvgs[0], index: 13 }];
  assert.ok(modelSweepMssFvg(candles, 'M15', context));
});

function analysis(tf, trend, levels) {
  return {
    tf,
    st: { trend, confirmedTrend: trend, lastConfirmedBreak: { valid: true, breakType: 'VALID_BREAK', dir: trend, index: 10 } },
    dealingRange: { currentZone: 'EQUILIBRIUM', high: 120, low: 80, equilibrium: 100 },
    liquidityHierarchy: { activeTargets: levels }
  };
}

const candles = Array.from({ length: 60 }, (_, index) => candle(100, 102, 98, 100, index * 60));
const analyses = {
  M15: analysis('M15', 'BULLISH', [{ type: 'BSL', level: 102, hierarchy: 'INTERNAL', strength: 'MEDIUM' }]),
  M30: analysis('M30', 'BULLISH', [{ type: 'BSL', level: 104, hierarchy: 'INTERNAL', strength: 'MEDIUM' }]),
  H1: analysis('H1', 'BULLISH', [{ type: 'BSL', level: 106, hierarchy: 'EXTERNAL', strength: 'STRONG' }, { type: 'SSL', level: 94, hierarchy: 'EXTERNAL', strength: 'STRONG' }]),
  H4: analysis('H4', 'BULLISH', [{ type: 'BSL', level: 112, hierarchy: 'EXTERNAL', strength: 'STRONG' }, { type: 'SSL', level: 88, hierarchy: 'EXTERNAL', strength: 'STRONG' }]),
  D1: analysis('D1', 'BULLISH', [{ type: 'BSL', level: 120, hierarchy: 'EXTERNAL', strength: 'STRONG' }, { type: 'SSL', level: 80, hierarchy: 'EXTERNAL', strength: 'STRONG' }])
};
const freshness = Object.fromEntries(Object.keys(analyses).map(tf => [tf, { state: 'FRESH' }]));

test('outlook no longer changes when active result timeframe changes', () => {
  const args = { analyses, candlesByTf: { M15: candles, H1: candles, H4: candles }, price: 100, freshness, newsRisk: 'LOW', session: { id: 'LONDON' } };
  const fromM15 = buildMarketOutlooks({ ...args, result: analyses.M15, now: 1000000 });
  const fromH4 = buildMarketOutlooks({ ...args, result: analyses.H4, now: 1000000 });
  assert.deepEqual(fromM15.outlooks, fromH4.outlooks);
});

test('daily target excludes M15 liquidity and uses horizon timeframe', () => {
  const projection = buildMarketOutlooks({ result: analyses.M15, analyses, candlesByTf: { M15: candles, H1: candles, H4: candles }, price: 100, freshness, newsRisk: 'LOW', session: { id: 'LONDON' }, now: 1000000 });
  const daily = projection.outlooks.find(item => item.id === 'DAILY');
  assert.notEqual(daily.primaryTargetTf, 'M15');
  assert.ok(['H1', 'H4', 'D1'].includes(daily.primaryTargetTf));
  for (const item of projection.outlooks) assert.equal(item.probability + item.alternativeProbability + item.invalidationProbability, 100);
});

test('prediction invalidation requires candle close, not wick touch', () => {
  const history = [{ id: 'x', status: 'PENDING', createdAt: 0, expiresAt: 100000, startPrice: 100, direction: 'BULLISH', target: 110, invalidation: 99, directionTolerance: 1, maxHigh: 100, minLow: 100, invalidated: false }];
  const updated = evaluatePredictionHistory(history, { candlesByTf: { M1: [{ time: 1, high: 101, low: 98, close: 100 }] }, now: 2000, livePrice: 100 });
  assert.equal(updated[0].status, 'PENDING');
  assert.equal(updated[0].invalidated, false);
});
