import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const bridgePath = 'app/src/main/assets/apps/academy/assets/js/market-learning-bridge.js';
const registryPath = 'app/src/main/assets/apps/academy/assets/data/market-learning-map.json';
const apiPath = 'api/learning-live-example.js';
const source = fs.readFileSync(bridgePath, 'utf8');
const apiSource = fs.readFileSync(apiPath, 'utf8');

function loadBridge(overrides = {}) {
  const sandbox = {
    module: { exports: {} },
    exports: {},
    URL,
    URLSearchParams,
    AbortController,
    Promise,
    Date,
    Number,
    String,
    JSON,
    setTimeout,
    clearTimeout,
    location: { pathname: '/assets/apps/academy/bagian-01-pemula-nol/apa-itu-trading.html' },
    ...overrides
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: bridgePath });
  return sandbox.module.exports;
}

function validLiveResponse(group = 'order_math') {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json; charset=utf-8' },
    async json() {
      return {
        status: 'ok',
        route: { group },
        market: { generatedAt: '2026-07-18T00:00:00.000Z' },
        content: {
          message: 'Lot dan pip memakai **data berbeda**.',
          disclaimer: 'Bukan sinyal.'
        }
      };
    }
  };
}

test('registry v2 maps all 645 HTML lessons to explicit topics', () => {
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const entries = Object.entries(registry.lessons);

  assert.equal(registry.schemaVersion, 2);
  assert.equal(registry.defaults.showLiveExamples, true);
  assert.equal(entries.length, 645);
  for (const [path, config] of entries) {
    assert.match(path, /\.html$/);
    assert.equal(config.enabled, true);
    assert.ok(['basics', 'structural', 'management'].includes(config.category));
    assert.equal(typeof config.topic, 'string');
    assert.ok(config.topic.length > 0);
  }
});

test('different pages inside the same category retain different topics', () => {
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const trading = registry.lessons['bagian-01-pemula-nol/apa-itu-trading.html'];
  const lot = registry.lessons['bagian-01-pemula-nol/lot-pip-point-dan-spread.html'];
  const risk = registry.lessons['bagian-01-pemula-nol/risk-sebelum-entry.html'];

  assert.equal(trading.category, 'basics');
  assert.equal(lot.category, 'basics');
  assert.equal(risk.category, 'basics');
  assert.equal(trading.topic, 'apa-itu-trading');
  assert.equal(lot.topic, 'lot-pip-point-dan-spread');
  assert.equal(risk.topic, 'risk-sebelum-entry');
  assert.notEqual(trading.topic, lot.topic);
  assert.notEqual(lot.topic, risk.topic);
});

test('bridge calls topic-aware backend without hardcoded protected preview URL', () => {
  assert.doesNotMatch(source, /simulatedLiveData/);
  assert.doesNotMatch(source, /Siap disambungkan ke API backend/);
  assert.match(source, /amy-fx\.vercel\.app\/api\/learning-live-example/);
  assert.doesNotMatch(source, /feature-learning-context-stage1-aplikasi-trading/);
  assert.match(source, /AMY_FX_LEARNING_API_URL/);
  assert.match(source, /topic:\s*String\(topic/);
  assert.match(source, /category:\s*String\(category/);
});

test('inline glass UI, pulse animation, and no-redirect contract remain present', () => {
  assert.match(source, /live-example-box glass-panel/);
  assert.match(source, /Live Market Example/);
  assert.match(source, /pulse 2s infinite/);
  assert.match(source, /@keyframes pulse/);
  assert.match(source, /insertBefore\(ui, injectionPoint\.nextSibling\)/);
  assert.doesNotMatch(source, /location\.assign\s*\(/);
  assert.doesNotMatch(source, /location\.replace\s*\(/);
  assert.doesNotMatch(source, /window\.open\s*\(/);
  assert.doesNotMatch(source, /Gemini|OpenAI|chatbot|learning-ai/i);
});

test('academy chapter URL resolves to its exact registry key', () => {
  const bridge = loadBridge({
    location: { pathname: '/assets/apps/academy/bagian-01-pemula-nol/realita-trading-untuk-pemula.html' }
  });
  assert.equal(
    bridge.getCurrentPath(),
    'bagian-01-pemula-nol/realita-trading-untuk-pemula.html'
  );
});

test('bridge forwards exact category and topic when API responds', async () => {
  let requestedUrl = '';
  const bridge = loadBridge({
    fetch: async url => {
      requestedUrl = String(url);
      return validLiveResponse();
    }
  });

  const result = await bridge.fetchLiveExample('basics', 'lot-pip-point-dan-spread');
  const parsed = new URL(requestedUrl);
  assert.equal(parsed.pathname, '/api/learning-live-example');
  assert.equal(parsed.searchParams.get('category'), 'basics');
  assert.equal(parsed.searchParams.get('topic'), 'lot-pip-point-dan-spread');
  assert.equal(result.status, 'ok');
  assert.equal(result.route.group, 'order_math');
});

test('production 404 returns a neutral topic-aware offline example', async () => {
  let requestCount = 0;
  const bridge = loadBridge({
    fetch: async () => {
      requestCount += 1;
      return {
        ok: false,
        status: 404,
        headers: { get: () => 'text/plain; charset=utf-8' },
        async json() { throw new Error('not json'); }
      };
    }
  });

  const result = await bridge.fetchLiveExample('basics', 'realita-trading-untuk-pemula');
  assert.equal(requestCount, 1);
  assert.equal(result.status, 'offline');
  assert.equal(result.mode, 'offline');
  assert.equal(result.route.group, 'trading_basics');
  assert.match(result.content.title, /Contoh Materi/i);
  assert.match(result.content.message, /probabilitas/i);
  assert.match(result.content.disclaimer, /tanpa data market live/i);
  assert.doesNotMatch(result.content.message, /belum tersedia|koneksi market stabil|error/i);
});

test('HTML login redirect from protected preview is treated as offline, not an error message', async () => {
  const bridge = loadBridge({
    AMY_FX_LEARNING_API_URL: 'https://preview.example.test/api/learning-live-example',
    fetch: async url => {
      if (String(url).startsWith('https://preview.example.test')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'text/html; charset=utf-8' },
          async json() { throw new Error('HTML login page'); }
        };
      }
      return {
        ok: false,
        status: 404,
        headers: { get: () => 'text/plain' },
        async json() { return null; }
      };
    }
  });

  const result = await bridge.fetchLiveExample('structural', 'liquidity-sweep');
  assert.equal(result.status, 'offline');
  assert.equal(result.route.group, 'liquidity');
  assert.match(result.content.message, /pool likuiditas|sweep/i);
});

test('offline fallback remains different for different lesson topics', () => {
  const bridge = loadBridge();
  const trading = bridge.buildOfflineExample('basics', 'realita-trading-untuk-pemula');
  const lot = bridge.buildOfflineExample('basics', 'lot-pip-point-dan-spread');
  const risk = bridge.buildOfflineExample('basics', 'risk-sebelum-entry');

  assert.equal(trading.route.group, 'trading_basics');
  assert.equal(lot.route.group, 'order_math');
  assert.equal(risk.route.group, 'risk');
  assert.notEqual(trading.content.message, lot.content.message);
  assert.notEqual(lot.content.message, risk.content.message);
  assert.match(lot.content.message, /lot|spread|pip/i);
  assert.match(risk.content.message, /invalidasi|nominal risiko/i);
});

test('old red-style connection error copy is removed from bridge', () => {
  assert.doesNotMatch(source, /Data live untuk topik/);
  assert.doesNotMatch(source, /Buka kembali halaman saat koneksi market stabil/);
  assert.match(source, /Mode latihan lokal tanpa data market live/);
  assert.match(source, /pulse\.style\.animation = 'none'/);
});

test('API text is escaped before limited bold markup is rendered', () => {
  const bridge = loadBridge();
  const rendered = bridge.renderMessage('<img src=x onerror=alert(1)> **aman**');
  assert.doesNotMatch(rendered, /<img/);
  assert.match(rendered, /&lt;img/);
  assert.match(rendered, /<strong>aman<\/strong>/);
});

test('backend route validates topic and uses server-side market data', () => {
  assert.match(apiSource, /req\.query\?\.topic/);
  assert.match(apiSource, /classifyLearningTopic/);
  assert.match(apiSource, /buildLearningExample/);
  assert.match(apiSource, /process\.env\.TWELVEDATA_API_KEY/);
  assert.match(apiSource, /api\.twelvedata\.com\/time_series/);
  assert.match(apiSource, /amy-fx\.vercel\.app\/api\/twelvedata/);
  assert.match(apiSource, /Access-Control-Allow-Origin/);
  assert.doesNotMatch(apiSource, /Gemini|OpenAI|chatbot/i);
});
