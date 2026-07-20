import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  applyLiveLiquidity,
  classifyBreak,
  deriveBiasView,
  executionGuidance,
  filterActionableSetups,
  sanitizeCandleValues,
  zoneLiveStatus
} from '../app/src/main/assets/apps/mapping/js/integrity/mapping-integrity-core.js';

function candle(datetime, open, high, low, close) {
  return {
    datetime,
    open: String(open),
    high: String(high),
    low: String(low),
    close: String(close)
  };
}

test('SWEEP ONLY tidak dilabeli sebagai BOS terkonfirmasi', () => {
  const result = classifyBreak({
    kind: 'BOS',
    dir: 'BEARISH',
    price: 4070.83,
    breakType: 'SWEEP_ONLY',
    sweepOnly: true,
    valid: false,
    hasDisplacement: true
  }, 'BEARISH');

  assert.equal(result.state, 'SWEEP');
  assert.equal(result.isConfirmed, false);
  assert.match(result.title, /SSL SWEEP/);
  assert.doesNotMatch(result.title, /VALID BOS/);
  assert.match(result.explanation, /tidak mengesahkan BOS/i);
});

test('hanya setup M15 precision yang valid dan RR minimal 2 dihitung aktif', () => {
  const base = {
    type: 'ORDER BLOCK',
    dir: 'SELL WATCH',
    tf: 'M15',
    status: 'WATCH SETUP',
    executionMode: 'M15_PRECISION',
    entryLow: 4080,
    entryHigh: 4084,
    sl: 4087,
    tp1: 4076,
    tp2: 4070,
    timestamp: Date.now(),
    conflictCheck: { conflictLevel: 'MEDIUM', rr: 3 }
  };
  const setups = [
    base,
    { ...base, tf: 'M5' },
    { ...base, type: 'STRUCTURE SETUP', executionMode: 'CONTEXT_ONLY' },
    { ...base, status: 'WAIT' },
    { ...base, conflictCheck: { conflictLevel: 'FATAL', rr: 4 } },
    { ...base, conflictCheck: { conflictLevel: 'NONE', rr: 1.5 } }
  ];

  const active = filterActionableSetups(setups, Date.now(), 4075);
  assert.equal(active.length, 1);
  assert.equal(active[0], base);
});

test('BSL yang sudah dilewati live dikeluarkan dan target berikutnya dipilih', () => {
  const result = {
    price: 4074.87,
    bsl: 4073.65,
    ssl: 4066.64,
    htfNarrative: { htfBias: 'BEARISH' },
    liquidityHierarchy: {
      tolerance: { sweep: 0.01 },
      activeTargets: [
        { type: 'BSL', level: 4073.65, status: 'ACTIVE' },
        { type: 'BSL', level: 4088.64, status: 'ACTIVE' },
        { type: 'SSL', level: 4066.64, status: 'ACTIVE' }
      ]
    }
  };

  applyLiveLiquidity(result, { price: 4074.87, high: 4075.2, low: 4074.2 });
  assert.equal(result.bsl, 4088.64);
  assert.equal(result.ssl, 4066.64);
  assert.equal(result.drawTarget.type, 'SSL');
  assert.ok(result.liquidityHierarchy.liveTouched.some(item => item.level === 4073.65));
});

test('bias lokal dipisahkan dari bias HTF dan composite', () => {
  const view = deriveBiasView({
    st: { trend: 'BULLISH' },
    htfNarrative: { htfBias: 'BEARISH' },
    final: 'BEARISH'
  });
  assert.deepEqual(view, {
    local: 'BULLISH',
    htf: 'BEARISH',
    composite: 'BEARISH',
    alignment: 'CONFLICT'
  });
});

test('feed candle membuang duplikat, OHLC rusak, dan rangkaian harga beku', () => {
  const valid = [];
  for (let index = 0; index < 40; index += 1) {
    const minute = String(index % 60).padStart(2, '0');
    const hour = String(Math.floor(index / 4)).padStart(2, '0');
    const open = 4100 + index * 0.4;
    valid.push(candle(`2026-07-10 ${hour}:${minute}:00`, open, open + 2, open - 1, open + 0.5));
  }
  const frozen = [];
  for (let index = 0; index < 12; index += 1) {
    frozen.push(candle(`2026-07-11 0${Math.floor(index / 4)}:${String((index % 4) * 15).padStart(2, '0')}:00`, 4111.44482, 4111.63, 4111.38, 4111.5));
  }
  const payload = [
    ...valid,
    ...frozen,
    valid[5],
    candle('2026-07-12 12:00:00', 10, 9, 11, 10)
  ].reverse();

  const cleaned = sanitizeCandleValues(payload, '15min');
  assert.equal(cleaned.quality.duplicates, 1);
  assert.equal(cleaned.quality.malformed, 1);
  assert.equal(cleaned.quality.frozenRemoved, 12);
  assert.equal(cleaned.values.length, 40);
});

test('status live OB dan arahan discount bearish tidak menyuruh mengejar SELL', () => {
  assert.equal(zoneLiveStatus({ type: 'BEARISH', bottom: 4072.2, top: 4084.3, status: 'ACTIVE' }, 4074.87), 'SEDANG DIUJI');
  assert.match(executionGuidance('BEARISH', 'DISCOUNT', false), /Jangan mengejar SELL/);
});

test('runtime dan halaman Mapping memuat lapisan integrity tanpa MutationObserver', () => {
  const runtime = fs.readFileSync(new URL('../app/src/main/assets/apps/mapping/js/mapping-integrity.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../app/src/main/assets/apps/mapping/index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../app/src/main/assets/apps/mapping/css/mapping-integrity.css', import.meta.url), 'utf8');

  assert.match(html, /mapping-integrity\.css/);
  assert.match(html, /mapping-integrity\.js/);
  assert.match(runtime, /sanitizeCandleValues/);
  assert.match(runtime, /filterActionableSetups/);
  assert.match(runtime, /Struktur lokal/);
  assert.doesNotMatch(runtime, /new\s+MutationObserver/);
  assert.match(css, /integrity-map-row/);
});
