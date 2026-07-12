import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../app/src/main/assets/apps/shared/market-intelligence.js', import.meta.url),
  'utf8'
);

function createRuntime(initialState) {
  const values = new Map([
    ['amyfx.market.intel.v1', JSON.stringify(initialState)]
  ]);
  const listeners = new Map();
  const window = {
    addEventListener(type, handler) {
      const list = listeners.get(type) || [];
      list.push(handler);
      listeners.set(type, list);
    },
    dispatchEvent(event) {
      for (const handler of listeners.get(event.type) || []) handler(event);
    }
  };
  const context = {
    window,
    navigator: { onLine: true },
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); }
    },
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    Date,
    Intl,
    console
  };
  vm.runInNewContext(source, context);
  return window;
}

test('command strip shows latest mapping BSL and SSL prices', () => {
  const now = Date.now();
  const window = createRuntime({
    liquidity: {
      storedAt: now - 60_000,
      currentPrice: 4100,
      levels: [
        { type: 'BSL', price: 4199, distance: 99 },
        { type: 'SSL', price: 4001, distance: -99 }
      ]
    },
    mapping: {
      storedAt: now,
      price: 4111.42,
      bsl: 4120.25,
      ssl: 4101.75,
      levels: [
        { type: 'BSL', price: 4120.25, distance: 8.83, status: 'ACTIVE' },
        { type: 'SSL', price: 4101.75, distance: -9.67, status: 'ACTIVE' }
      ]
    }
  });

  const target = { innerHTML: '' };
  window.AmyFXIntel.mountStrip(target);

  assert.match(target.innerHTML, /4111\.42/);
  assert.match(target.innerHTML, /4120\.25/);
  assert.match(target.innerHTML, /4101\.75/);
  assert.doesNotMatch(target.innerHTML, /4199\.00/);
  assert.doesNotMatch(target.innerHTML, /4001\.00/);
});
