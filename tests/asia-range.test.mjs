import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calculateAsiaRange } from '../assets/apps/mapping/js/session/asia-range.js';

const candle = (iso, high, low, close) => ({
  time: Date.parse(iso) / 1000,
  high,
  low,
  close,
  open: close
});

test('Asia Range uses 20:00-00:00 New York and reports wick sweep', () => {
  const now = Date.parse('2026-07-13T10:00:00Z');
  const candles = [
    candle('2026-07-13T00:00:00Z', 4102, 4099, 4101),
    candle('2026-07-13T00:15:00Z', 4106, 4100, 4105),
    candle('2026-07-13T00:30:00Z', 4110, 4103, 4108),
    candle('2026-07-13T01:00:00Z', 4108, 4096, 4098),
    candle('2026-07-13T02:00:00Z', 4104, 4094, 4097),
    candle('2026-07-13T03:45:00Z', 4103, 4095, 4100),
    candle('2026-07-13T05:00:00Z', 4112, 4105, 4108)
  ];
  const result = calculateAsiaRange(candles, 4107, now);
  assert.equal(result.valid, true);
  assert.equal(result.high, 4110);
  assert.equal(result.low, 4094);
  assert.equal(result.range, 16);
  assert.equal(result.highStatus, 'TERSAPU WICK');
  assert.equal(result.lowStatus, 'BELUM DISAPU');
  assert.match(result.windowLabel, /WIB/);
});

test('closed candle beyond Asia High has priority over wick sweep', () => {
  const now = Date.parse('2026-07-13T10:00:00Z');
  const candles = [
    candle('2026-07-13T00:00:00Z', 4105, 4098, 4102),
    candle('2026-07-13T01:00:00Z', 4110, 4095, 4100),
    candle('2026-07-13T03:45:00Z', 4108, 4097, 4104),
    candle('2026-07-13T05:00:00Z', 4113, 4107, 4112)
  ];
  assert.equal(calculateAsiaRange(candles, 4112, now).highStatus, 'CLOSE BREAK');
});

test('active Asia session remains developing', () => {
  const now = Date.parse('2026-07-14T01:00:00Z');
  const candles = [
    candle('2026-07-14T00:00:00Z', 4072, 4068, 4070),
    candle('2026-07-14T00:15:00Z', 4075, 4069, 4074),
    candle('2026-07-14T00:30:00Z', 4076, 4071, 4073)
  ];
  const result = calculateAsiaRange(candles, 4073, now);
  assert.equal(result.active, true);
  assert.equal(result.highStatus, 'BERKEMBANG');
  assert.equal(result.lowStatus, 'BERKEMBANG');
});

test('TwelveData backend normalizes UTC timestamps for session boundaries', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const backend = readFileSync(`${root}/api/twelvedata.js`, 'utf8');
  assert.match(backend, /timezone=UTC/);
  assert.match(backend, /normalizeUtcDatetime/);
});
