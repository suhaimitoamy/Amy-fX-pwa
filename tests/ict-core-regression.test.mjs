import test from 'node:test';
import assert from 'node:assert/strict';

const enginePath = new URL('../app/src/main/assets/apps/mapping/js/engine/ict-core.js', import.meta.url);
const engine = await import(enginePath.href);

const candle = (open, high, low, close) => ({ open, high, low, close });

test('liquidity yang pernah disapu tidak aktif kembali setelah harga berbalik', () => {
  const candles = [
    candle(100, 101, 99, 100),
    candle(100, 105, 99.5, 101),
    candle(101, 106, 100, 104),
    candle(104, 104.5, 98, 99),
    candle(99, 101, 97, 100)
  ];
  const result = engine.buildLiquidityHierarchy(candles, {
    highs: [{ high: 105, index: 1 }], lows: []
  }, { price: 100, htfNarrative: { htfBias: 'NEUTRAL' } });

  assert.equal(result.activeTargets.some(x => x.type === 'BSL' && x.level === 105), false);
  assert.equal(result.swept.some(x => x.type === 'BSL' && x.level === 105), true);
});

test('break historis memakai ATR lokal sebelum candle breakout', () => {
  const candles = [
    candle(100, 101, 99.5, 100.2),
    candle(100.2, 102, 100, 101),
    candle(101, 101.5, 100.2, 101.1),
    candle(100.5, 105, 100, 104.5),
    ...Array.from({ length: 16 }, () => candle(103, 112, 102.5, 103.1))
  ];
  const result = engine.detectStructure(candles, {
    highs: [{ high: 102, index: 1 }], lows: []
  });

  assert.equal(result.lastConfirmedBreak?.breakType, 'VALID_BREAK');
  assert.ok(result.lastConfirmedBreak?.localAtr < 3);
});

test('sweep wajib menutup kembali di dalam level', () => {
  assert.equal(engine.isValidLiquiditySweep(candle(100.2, 101, 99, 99.5), 'SSL', 100), false);
  assert.equal(engine.isValidLiquiditySweep(candle(100.2, 101, 99, 100.4), 'SSL', 100), true);
  assert.equal(engine.isValidLiquiditySweep(candle(99.8, 101, 99, 100.5), 'BSL', 100), false);
  assert.equal(engine.isValidLiquiditySweep(candle(99.8, 101, 99, 99.6), 'BSL', 100), true);
});

function conflictContext() {
  return {
    htfNarrative: { htfBias: 'NEUTRAL' },
    dealingRange: { currentZone: 'DISCOUNT' },
    liquidityHierarchy: { drawTarget: { type: 'BSL' } },
    st: {
      last: {
        breakType: 'VALID_BREAK',
        valid: true,
        failed: false,
        dir: 'BULLISH',
        hasDisplacement: true
      }
    },
    sessionContext: { session: 'LONDON' }
  };
}

test('setup RR di bawah 1:2 ditolak sebagai konflik fatal', () => {
  const setup = { dir: 'BUY WATCH', tf: 'M15', entryLow: 100, entryHigh: 101, sl: 99, tp1: 102.5, tp2: 103.5, status: 'FRESH', qualityLabel: 'MEDIUM' };
  const result = engine.detectSetupConflicts(setup, conflictContext());
  assert.equal(result.hasFatalConflict, true);
  assert.equal(result.recommendation, 'INVALID');
  assert.equal(result.conflicts.some(x => x.type === 'RR_CONFLICT'), true);
  setup.conflictCheck = result;
  assert.equal(engine.assignChecklist(setup, conflictContext()).status, 'INVALID');
});

test('setup RR tepat 1:2 tidak terkena konflik RR', () => {
  const setup = { dir: 'BUY WATCH', tf: 'M15', entryLow: 100, entryHigh: 101, sl: 99, tp1: 103, tp2: 105, status: 'FRESH', qualityLabel: 'MEDIUM' };
  const result = engine.detectSetupConflicts(setup, conflictContext());
  assert.equal(result.conflicts.some(x => x.type === 'RR_CONFLICT'), false);
});

test('M15 precision menghasilkan TP1 1R dan runner TP2 minimal 2R', () => {
  const setup = { dir: 'BUY WATCH', tf: 'M15', entryLow: 100, entryHigh: 101, sl: 99, tp1: 103, tp2: 105, status: 'FRESH', qualityLabel: 'STRONG' };
  setup.conflictCheck = engine.detectSetupConflicts(setup, conflictContext());
  const result = engine.assignChecklist(setup, conflictContext());
  assert.equal(result.tp1, 103);
  assert.equal(result.tp2, 105);
  assert.equal(result.executionMode, 'M15_PRECISION');
  assert.deepEqual(result.tradeManagement, { tp1R:1, tp1ClosePercent:90, moveStopToBreakEven:true, tp2MinimumR:2, runnerPercent:10 });
});

test('timeframe selain M15 tetap menjadi konteks dan tidak actionable', () => {
  const setup = { dir: 'BUY WATCH', tf: 'H1', entryLow: 100, entryHigh: 101, sl: 99, tp1: 103, tp2: 105, status: 'FRESH', qualityLabel: 'STRONG' };
  setup.conflictCheck = engine.detectSetupConflicts(setup, conflictContext());
  const result = engine.assignChecklist(setup, conflictContext());
  assert.equal(result.status, 'WAIT');
  assert.equal(result.executionMode, 'CONTEXT_ONLY');
});

test('struktur HTF lebih dominan daripada lokasi discount/premium', () => {
  assert.deepEqual(engine.resolveHtfBias('DISCOUNT', 'BEARISH'), { bias: 'BEARISH', draw: 'SSL', aligned: false });
  assert.deepEqual(engine.resolveHtfBias('PREMIUM', 'BULLISH'), { bias: 'BULLISH', draw: 'BSL', aligned: false });
  assert.deepEqual(engine.resolveHtfBias('DISCOUNT', 'BULLISH'), { bias: 'BULLISH', draw: 'BSL', aligned: true });
});

test('Silver Bullet aktif pada pukul 10:30 New York', () => {
  const newYork1030Winter = Date.UTC(2026, 0, 15, 15, 30, 0);
  const result = engine.buildSessionContext(newYork1030Winter);
  assert.equal(result.session, 'NEW_YORK');
  assert.equal(result.killzone, 'SILVER_BULLET');
  assert.equal(result.sessionQuality, 'ACTIVE');
});

test('FVG historis memakai ATR lokal saat imbalance terbentuk', () => {
  const candles = [
    candle(100.2, 101, 100, 100.6),
    candle(100.5, 102.2, 100.3, 102),
    candle(101.6, 103, 101.5, 102.5),
    ...Array.from({ length: 16 }, (_, i) => candle(103 + i * .1, 120 + i, 102, 104 + i * .1))
  ];
  const fvgs = engine.detectFvg(candles, { htfBias: 'BULLISH' });
  const historical = fvgs.find(x => x.index === 2);
  assert.ok(historical);
  assert.ok(historical.localAtr < 3);
});

test('Order Block ditolak jika tidak berasal dari valid break dengan displacement', () => {
  const candles = [
    candle(100, 101, 99, 100.5),
    candle(100.5, 101, 99.5, 100),
    candle(100, 102, 99.8, 101.8),
    candle(101.8, 103, 101, 102.5)
  ];
  assert.deepEqual(engine.detectOB(candles, { last: { index: 2, dir: 'BULLISH', valid: false, breakType: 'SWEEP_ONLY' } }, { htfBias: 'BULLISH' }), []);
});

test('BOS atau displacement tunggal hanya menjadi konteks, bukan trigger entry', () => {
  const setup = { type: 'STRUCTURE SETUP', dir: 'BUY WATCH', tf: 'M15', entryLow: 100, entryHigh: 101, sl: 99, tp1: 103, tp2: 105, status: 'FRESH', qualityLabel: 'STRONG' };
  setup.conflictCheck = engine.detectSetupConflicts(setup, conflictContext());
  const result = engine.assignChecklist(setup, conflictContext());
  assert.equal(result.status, 'WAIT');
  assert.equal(result.executionMode, 'CONTEXT_ONLY');
});
