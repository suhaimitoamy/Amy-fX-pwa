import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectStructure } from '../app/src/main/assets/apps/mapping/js/engine/core/math-structure.js';
import { detectSetupConflicts } from '../app/src/main/assets/apps/mapping/js/engine/core/setups.js';

const candle = (open, high, low, close, time = 0) => ({ open, high, low, close, time });

function transitionFixture(includeConfirmation = false) {
  const candles = [
    candle(100, 101, 99.5, 100),
    candle(100, 100.8, 99, 100.1),
    candle(100.1, 103.8, 99.8, 100.2),
    candle(100, 100.4, 96.8, 97.2),
    candle(97.2, 100.4, 97, 99.8),
    candle(99.8, 100.7, 98.8, 99.5),
    candle(99.5, 102.8, 99.3, 102.4),
    candle(102.4, 103, 101.8, 102.2),
    candle(102.2, 103.2, 101.6, 102.7),
    candle(102.7, includeConfirmation ? 105.8 : 103.5, 102.5, includeConfirmation ? 105.5 : 103.1)
  ];
  const swings = {
    highs: [
      { index: 2, high: 104 },
      { index: 4, high: 101 },
      { index: 7, high: 104 }
    ],
    lows: [{ index: 1, low: 99 }]
  };
  return { candles, swings };
}

test('first opposite valid break is internal transition and does not flip confirmed trend', () => {
  const { candles, swings } = transitionFixture(false);
  const structure = detectStructure(candles.slice(0, 7), swings);

  assert.equal(structure.confirmedTrend, 'BEARISH');
  assert.equal(structure.trend, 'BEARISH');
  assert.equal(structure.localTrend, 'BULLISH');
  assert.equal(structure.transitionDirection, 'BULLISH');
  assert.equal(structure.lastConfirmedBreak?.kind, 'CHOCH');
  assert.equal(structure.lastConfirmedBreak?.structureScope, 'INTERNAL');
  assert.equal(structure.lastConfirmedBreak?.confirmationStage, 'TRANSITION');
  assert.equal(structure.lastConfirmedBreak?.trendConfirmed, false);
  assert.equal(structure.transitionConfirmationLevel, 104);
});

test('second higher opposite break confirms reversal and flips protected trend', () => {
  const { candles, swings } = transitionFixture(true);
  const structure = detectStructure(candles, swings);

  assert.equal(structure.confirmedTrend, 'BULLISH');
  assert.equal(structure.transitionDirection, 'NEUTRAL');
  assert.equal(structure.transitionBreak, null);
  assert.equal(structure.lastConfirmedBreak?.kind, 'CHOCH');
  assert.equal(structure.lastConfirmedBreak?.structureScope, 'MAJOR');
  assert.equal(structure.lastConfirmedBreak?.confirmationStage, 'CONFIRMED');
  assert.equal(structure.lastConfirmedBreak?.trendConfirmed, true);
});

function conflictContext(overrides = {}) {
  return {
    st: {
      lastConfirmedBreak: {
        valid: true,
        failed: false,
        breakType: 'VALID_BREAK',
        dir: 'BULLISH',
        confirmationStage: 'TRANSITION',
        trendConfirmed: false,
        atRisk: false,
        liveStatus: 'TRANSITION'
      }
    },
    htfNarrative: { htfBias: 'NEUTRAL' },
    dealingRange: { currentZone: 'DISCOUNT' },
    liquidityHierarchy: { drawTarget: { type: 'BSL' } },
    sessionContext: { session: 'LONDON' },
    ...overrides
  };
}

const baseSetup = {
  type: 'FAIR VALUE GAP',
  dir: 'BUY WATCH',
  entryLow: 100,
  entryHigh: 101,
  sl: 98,
  tp1: 104,
  tp2: 107,
  status: 'FRESH',
  qualityLabel: 'STRONG'
};

test('ordinary setup is blocked while CHOCH is still internal', () => {
  const result = detectSetupConflicts({ ...baseSetup }, conflictContext());
  assert.equal(result.hasFatalConflict, true);
  assert.ok(result.conflicts.some(item => item.note.includes('CHOCH masih internal')));
});

test('complete Sweep MSS FVG model may continue through internal MSS validation', () => {
  const result = detectSetupConflicts({ ...baseSetup, type: 'SWEEP_MSS_FVG' }, conflictContext());
  assert.equal(result.conflicts.some(item => item.note.includes('CHOCH masih internal')), false);
});

test('live price returning through break level blocks every setup as AT RISK', () => {
  const ctx = conflictContext();
  ctx.st.lastConfirmedBreak.atRisk = true;
  ctx.st.lastConfirmedBreak.liveStatus = 'AT_RISK';
  const result = detectSetupConflicts({ ...baseSetup, type: 'SWEEP_MSS_FVG' }, ctx);
  assert.equal(result.hasFatalConflict, true);
  assert.ok(result.conflicts.some(item => item.note.includes('AT RISK')));
});

test('mapping UI exposes internal trend, confirmed trend, next level, and AT RISK status', () => {
  const source = readFileSync(
    new URL('../app/src/main/assets/apps/mapping/js/ui/ui-render.js', import.meta.url),
    'utf8'
  );
  assert.match(source, /INTERNAL CHOCH/);
  assert.match(source, /Struktur terkonfirmasi/);
  assert.match(source, /Konfirmasi berikutnya/);
  assert.match(source, /AT RISK/);
});
