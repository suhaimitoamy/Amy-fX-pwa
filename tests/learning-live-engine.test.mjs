import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLearningExample,
  buildMarketContext,
  humanizeTopic
} from '../lib/learning-live-engine.js';
import {
  classifyLearningTopic,
  normalizeTopic
} from '../lib/learning-topic-router.js';

function candles(count, start, step, timeframe = 'generic') {
  return Array.from({ length: count }, (_, index) => {
    const open = start + index * step;
    const close = open + step * 0.6;
    return {
      time: 1_700_000_000 + index * 60,
      timeframe,
      open,
      high: Math.max(open, close) + Math.abs(step) * 0.5 + 0.5,
      low: Math.min(open, close) - Math.abs(step) * 0.5 - 0.5,
      close
    };
  });
}

function marketFixture() {
  const m1 = candles(5, 3330, 0.2, 'M1');
  const m15 = candles(25, 3300, 1.1, 'M15');
  m15[2] = { time: 3, open: 3305, high: 3307, low: 3304, close: 3306 };
  m15[4] = { time: 5, open: 3310, high: 3312, low: 3309, close: 3311 };
  const priorHigh = Math.max(...m15.slice(-11, -1).map(candle => candle.high));
  m15[m15.length - 1] = {
    time: 30,
    open: priorHigh - 1,
    high: priorHigh + 3,
    low: priorHigh - 4,
    close: priorHigh - 0.5
  };
  const h1 = candles(30, 3280, 1.4, 'H1');
  const d1 = candles(30, 3100, 7, 'D1');

  return buildMarketContext({
    '1min': m1,
    '15min': m15,
    '1h': h1,
    '1day': d1
  }, new Date('2026-07-18T08:00:00.000Z'));
}

test('topic normalization is deterministic and bounded', () => {
  assert.equal(normalizeTopic('  FVG Presisi vs FVG Luas.html '), 'fvg-presisi-vs-fvg-luas');
  assert.equal(normalizeTopic('Risk & Reward!'), 'risk-reward');
  assert.equal(humanizeTopic('lot-pip-point-dan-spread'), 'LOT PIP Point DAN Spread');
});

test('specific topics route to different rule groups', () => {
  assert.equal(classifyLearningTopic('apa-itu-trading', 'basics').group, 'trading_basics');
  assert.equal(classifyLearningTopic('lot-pip-point-dan-spread', 'basics').group, 'order_math');
  assert.equal(classifyLearningTopic('risk-sebelum-entry', 'basics').group, 'risk');
  assert.equal(classifyLearningTopic('fair-value-gap-fvg', 'structural').group, 'imbalance');
  assert.equal(classifyLearningTopic('breaker-blocks-dan-mitigation-blocks', 'structural').group, 'order_block');
  assert.equal(classifyLearningTopic('liquidity-sweep', 'structural').group, 'liquidity');
  assert.equal(classifyLearningTopic('konsep-yang-belum-dipetakan', 'structural').group, 'structural_fallback');
});

test('specific concepts win over generic words inside the same slug', () => {
  assert.equal(classifyLearningTopic('stop-loss-dan-take-profit', 'basics').group, 'risk');
  assert.equal(classifyLearningTopic('xauusd-session-playbook', 'structural').group, 'session');
  assert.equal(classifyLearningTopic('xauusd-liquidity-map-memetakan-bahan-bakar-market', 'structural').group, 'liquidity');
  assert.equal(classifyLearningTopic('target-dan-partial-take-profit-mengelola-hasil-secara-objektif', 'management').group, 'trade_management');
  assert.equal(classifyLearningTopic('seasonal-tendency-dan-cot-report-gold', 'structural').group, 'news');
});

test('same basics category produces topic-specific messages', () => {
  const context = marketFixture();
  const trading = buildLearningExample(
    classifyLearningTopic('apa-itu-trading', 'basics'),
    context
  );
  const lot = buildLearningExample(
    classifyLearningTopic('lot-pip-point-dan-spread', 'basics'),
    context
  );
  const risk = buildLearningExample(
    classifyLearningTopic('risk-sebelum-entry', 'basics'),
    context
  );

  assert.equal(trading.route.group, 'trading_basics');
  assert.equal(lot.route.group, 'order_math');
  assert.equal(risk.route.group, 'risk');
  assert.notEqual(trading.content.message, lot.content.message);
  assert.notEqual(lot.content.message, risk.content.message);
  assert.match(trading.content.message, /inti trading/i);
  assert.match(lot.content.message, /Buy/i);
  assert.match(risk.content.message, /ATR\(14\)/i);
});

test('structural messages use calculated FVG and sweep context', () => {
  const context = marketFixture();
  const fvg = buildLearningExample(
    classifyLearningTopic('fvg-presisi-vs-fvg-luas', 'structural'),
    context
  );
  const liquidity = buildLearningExample(
    classifyLearningTopic('liquidity-sweep', 'structural'),
    context
  );

  assert.equal(fvg.route.group, 'imbalance');
  assert.match(fvg.content.message, /FVG/i);
  assert.equal(liquidity.route.group, 'liquidity');
  assert.match(liquidity.content.message, /BSL|SSL|pool likuiditas/i);
});

test('payload remains rule-based educational context, not a signal', () => {
  const result = buildLearningExample(
    classifyLearningTopic('trade-management-advanced', 'management'),
    marketFixture()
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.market.symbol, 'XAU/USD');
  assert.ok(Number.isFinite(result.market.price));
  assert.match(result.content.disclaimer, /bukan sinyal Buy\/Sell/i);
  assert.match(result.content.disclaimer, /bukan keluaran AI/i);
});
