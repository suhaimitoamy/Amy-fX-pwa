import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../assets/apps/shared/market-intelligence.js', import.meta.url),
  'utf8'
);

function runtime() {
  const store = new Map();
  const window = {
    dispatchEvent() {},
    addEventListener() {}
  };
  const context = {
    window,
    navigator: { onLine: true },
    localStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, String(value)); }
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
    Date,
    Intl,
    Number,
    String,
    Array,
    Object,
    Math,
    JSON,
    RegExp,
    console
  };
  vm.runInNewContext(source, context);
  return { api: window.AmyFXIntel, store };
}

test('command strip hanya memilih BSL di atas harga dan SSL di bawah harga', () => {
  const { api } = runtime();
  api.write('mapping', {
    price: 4074.87,
    bsl: 4073.65,
    ssl: 4066.64,
    levels: [
      { type: 'BSL', price: 4073.65, status: 'ACTIVE' },
      { type: 'BSL', price: 4088.64, status: 'ACTIVE' },
      { type: 'SSL', price: 4066.64, status: 'ACTIVE' },
      { type: 'SSL', price: 4076, status: 'ACTIVE' }
    ]
  });

  const levels = api.nearestLevels(api.read());
  assert.equal(levels.bsl.price, 4088.64);
  assert.equal(levels.ssl.price, 4066.64);
});

test('command strip menolak level touched dan fallback data yang stale', () => {
  const { api, store } = runtime();
  const stale = Date.now() - 10 * 60 * 1000;
  store.set('amyfx.market.intel.v1', JSON.stringify({
    mapping: {
      price: 4074.87,
      bsl: 4073.65,
      ssl: 4076,
      levels: [
        { type: 'BSL', price: 4080, status: 'LIVE_TOUCHED' },
        { type: 'SSL', price: 4069, status: 'SWEPT' }
      ],
      storedAt: stale
    },
    liquidity: {
      currentPrice: 4074.87,
      levels: [
        { type: 'BSL', price: 4090, status: 'ACTIVE' },
        { type: 'SSL', price: 4060, status: 'ACTIVE' }
      ],
      storedAt: stale
    }
  }));

  const levels = api.nearestLevels(api.read());
  assert.equal(levels.bsl, null);
  assert.equal(levels.ssl, null);
});
