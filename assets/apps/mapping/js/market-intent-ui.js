import { deriveLiquidityContext } from './engine/market-intent-engine.js';
import { detectMarketRegimeV2 } from './engine/market-regime-engine.js';
import { routeRegimeStrategy } from './engine/strategy-router-engine.js';
import { evaluateValidatedMarketContext } from './engine/validated-market-context.js';

const CARD_ID = 'amy-regime-router-v3';
const STATE_KEY = 'amy_regime_router_state_v3';
const READY_STATUS = 'READY';

let lastSignature = '';
let refreshTimer = 0;
let refreshFrame = 0;
let lifecycleController = null;
let lastRouterStateSignature = '';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const numberText = (value, digits = 0) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '-';
const labelText = value => String(value || '-').replaceAll('_', ' ');

function closedCandles(state, timeframe = 'M15') {
  return (Array.isArray(state?.candles?.[timeframe]) ? state.candles[timeframe] : [])
    .filter(candle => candle?.isClosed !== false)
    .filter(candle => [candle?.open, candle?.high, candle?.low, candle?.close]
      .map(Number)
      .every(Number.isFinite));
}

function closedCandleFingerprint(state, timeframe = 'M15') {
  const candles = closedCandles(state, timeframe);
  const latest = candles.at(-1);
  return JSON.stringify({
    timeframe,
    count: candles.length,
    time: Number(latest?.time || 0),
    open: Number(latest?.open || 0),
    high: Number(latest?.high || 0),
    low: Number(latest?.low || 0),
    close: Number(latest?.close || 0)
  });
}

function closedCandlePrice(result, state) {
  const preferred = closedCandles(state, 'M15').at(-1)?.close;
  if (Number.isFinite(Number(preferred))) return Number(preferred);
  const activeTf = String(result?.tf || state?.tf || 'M15').toUpperCase();
  const active = closedCandles(state, activeTf).at(-1)?.close;
  if (Number.isFinite(Number(active))) return Number(active);
  const fallback = Number(result?.price);
  return Number.isFinite(fallback) ? fallback : 0;
}

function readRouterState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (_) { return null; }
}

function persistRouterState(nextState) {
  const signature = JSON.stringify(nextState || null);
  if (signature === lastRouterStateSignature) return;
  lastRouterStateSignature = signature;
  try { localStorage.setItem(STATE_KEY, signature); } catch (_) {}
}

function calculateContext(result, state) {
  const candles = closedCandles(state, 'M15');
  if (!result || candles.length < 30) {
    return {
      validated: null,
      regime: null,
      router: null,
      liquidity: deriveLiquidityContext({ candles })
    };
  }

  const analysisPrice = closedCandlePrice(result, state);
  const validated = result.validatedMarketContext?.status === READY_STATUS
    ? result.validatedMarketContext
    : evaluateValidatedMarketContext({
        candles,
        tf: 'M15',
        htfCandles: { H4: closedCandles(state, 'H4') }
      });

  const intel = window.AmyFXIntel?.read?.() || {};
  const regime = result.marketRegime?.status === READY_STATUS
    ? result.marketRegime
    : detectMarketRegimeV2({
        candles,
        tf: 'M15',
        htfBiases: result.htfBiases || {},
        marketConcepts: result.marketConcepts || null,
        entryMap: result.entryMap || null,
        currentPrice: analysisPrice,
        newsRisk: window.AmyFXIntel?.newsRisk?.(intel) || 'UNKNOWN',
        freshness: window.AmyMappingIntegrity?.qualityByInterval || {}
      });

  const router = result.strategyRouter?.activeRegime
    ? result.strategyRouter
    : routeRegimeStrategy({
        candles,
        result,
        regime,
        currentPrice: analysisPrice,
        previousState: readRouterState()
      });

  persistRouterState(router?.state || null);
  const liquidity = deriveLiquidityContext({ result, regime, candles });

  result.validatedMarketContext = validated;
  result.marketRegime = regime;
  result.strategyRouter = router;
  result.liquidityContextV4 = liquidity;
  return { validated, regime, router, liquidity };
}

function marketOverviewMarkup(validated, liquidity) {
  const marketState = validated?.marketState || {};
  const forecast = validated?.directionForecast || {};
  const target = liquidity?.nearestLiquidity || null;
  const stateKind = Number(marketState.directionValue || 0) > 0
    ? 'stable'
    : Number(marketState.directionValue || 0) < 0 ? 'danger' : 'warning';
  const forecastKind = Number(forecast.directionValue || 0) > 0
    ? 'stable'
    : Number(forecast.directionValue || 0) < 0 ? 'danger' : 'warning';

  return `<div class="market-health-title"><span>RINGKASAN MARKET</span><small>Struktur, arah, dan target terdekat</small></div>
    <div class="router-status-strip validated-context-strip">
      <div class="${stateKind}"><small>Kondisi Struktur</small><strong>${escapeHtml(marketState.state || 'RANGE / TRANSITION')}</strong><span>Sumber candle M15 yang sudah close</span></div>
      <div class="${forecastKind}"><small>Proyeksi Arah</small><strong>${escapeHtml(forecast.direction || 'BELUM JELAS')}</strong><span>${forecast.active ? escapeHtml(forecast.horizonText || 'Forecast aktif') : 'Belum ada proyeksi aktif'}</span></div>
      <div><small>Target Likuiditas</small><strong>${escapeHtml(target?.label || target?.type || 'BELUM JELAS')}</strong><span>${target ? numberText(target.level, 2) : 'Menunggu target aktif'}</span></div>
    </div>`;
}

function targetMarkup(title, target, emptyText) {
  if (!target) {
    return `<div class="liquidity-context-target empty"><small>${escapeHtml(title)}</small><strong>${escapeHtml(emptyText)}</strong><span>Belum tersedia</span></div>`;
  }
  return `<div class="liquidity-context-target"><small>${escapeHtml(title)}</small><strong>${escapeHtml(target.label || target.type)}</strong><span>${numberText(target.level, 2)} · ${escapeHtml(target.type)}</span></div>`;
}

function scenarioMarkup(result, router) {
  const setup = result?.experimentalBestSetup || result?.unroutedBestSetup || router?.watchSetup || null;
  if (!setup) {
    return `<div class="router-execution wait"><small>SKENARIO PEMANTAUAN</small><strong>Belum terbentuk</strong><p>Belum ada rangkaian harga yang cukup lengkap untuk membuat skenario level.</p></div>`;
  }
  return `<div class="router-execution ${String(setup.dir || setup.direction || '').toLowerCase()}"><small>SKENARIO PEMANTAUAN</small><strong>${escapeHtml(setup.dir || setup.direction || 'TUNGGU')} · ${escapeHtml(setup.type || 'SWEEP → MSS')}</strong><div class="router-level-row"><span><b>Area harga</b>${numberText(setup.entry ?? setup.entryLow, 2)}</span><span><b>Batas skenario</b>${numberText(setup.sl, 2)}</span><span><b>Target awal</b>${numberText(setup.tp1, 2)}</span><span><b>Target lanjutan</b>${numberText(setup.tp2, 2)}</span></div><p>Gunakan sebagai skenario pemantauan dan tunggu konfirmasi harga sebelum mengambil keputusan.</p></div>`;
}

function waitingMarkup(tab) {
  const dashboard = tab === 'Dashboard';
  return `<section class="card regime-router-card waiting ${dashboard ? 'dashboard-context-card' : 'analyze-context-card'}" id="${CARD_ID}" data-market-intent-ready="false">
    <div class="regime-preview-ribbon">AMY FX · MARKET INTELLIGENCE</div>
    <div class="regime-header"><div><div class="kicker">KONTEKS MARKET</div><h2>Menyiapkan analisis market</h2></div><span class="regime-badge">MEMUAT</span></div>
    <p class="muted">Memuat data struktur, arah, dan likuiditas XAU/USD dari candle yang sudah close.</p>
    <button class="router-primary-button" type="button" data-router-action="scan">Muat Ulang Analisis M15</button>
  </section>`;
}

function renderDashboardCard(validated, liquidity) {
  return `<section class="card regime-router-card dashboard-context-card" id="${CARD_ID}" data-market-intent-ready="true">
    <div class="regime-preview-ribbon">AMY FX · MARKET INTELLIGENCE</div>
    <div class="regime-header"><div><div class="kicker">RINGKASAN LIVE</div><h2>Kondisi market saat ini</h2></div><span class="regime-badge">M15 CANDLE TERTUTUP</span></div>
    ${marketOverviewMarkup(validated, liquidity)}
    <div class="router-actions dashboard-context-actions">
      <button type="button" data-router-open-analyze>Lihat Analisis Lengkap</button>
      <button type="button" data-router-action="scan">Perbarui Data</button>
    </div>
  </section>`;
}

function renderAnalyzeCard(result, validated, regime, router, liquidity) {
  const probabilities = regime?.probabilities || {};
  const health = regime?.health || {};
  const shiftClass = Number(regime?.shift?.risk || 0) >= 55
    ? 'danger'
    : Number(regime?.shift?.risk || 0) >= 30 ? 'warning' : 'stable';
  return `<section class="card regime-router-card analyze-context-card" id="${CARD_ID}" data-market-intent-ready="true">
    <div class="regime-preview-ribbon">AMY FX · ANALISIS PASAR</div>
    <div class="regime-header"><div><div class="kicker">XAU/USD · M15</div><h2>Analisis market</h2></div><span class="regime-badge">M15 CANDLE TERTUTUP</span></div>
    ${marketOverviewMarkup(validated, liquidity)}
    <details class="professional-disclosure">
      <summary><span>Konteks Market Lanjutan</span><small>Karakter, stabilitas, dan risiko perubahan</small></summary>
      <div class="regime-hero ${String(router?.activeRegime || 'transition').toLowerCase()}">
        <div><small>KARAKTER MARKET</small><strong>${escapeHtml(labelText(router?.activeRegime || 'TRANSITION'))}</strong><p>Kondisi terdeteksi: ${escapeHtml(labelText(router?.rawRegime || regime?.regime || 'TRANSITION'))} · skor kejelasan ${numberText(regime?.confidence)}/100</p></div>
        <div class="regime-strategy"><small>KONTEKS STRATEGI</small><strong>${escapeHtml(labelText(router?.activeStrategy || 'NO TRADE'))}</strong><span>${router?.blocked ? 'Tunggu hingga kondisi market lebih stabil.' : 'Gunakan sebagai konteks tambahan untuk membaca market.'}</span></div>
      </div>
      <div class="regime-probability-list">${Object.entries(probabilities).map(([name, value]) => `<div class="regime-probability ${name === router?.activeRegime ? 'active' : ''}"><div><span>${escapeHtml(labelText(name))}</span><b>${numberText(value)} / 100</b></div><i style="--regime-value:${numberText(value)}%"></i></div>`).join('')}</div>
      <div class="market-health-grid">
        <div class="health-metric"><small>Kekuatan Tren</small><strong>${numberText(health.trendStrength)} / 100</strong></div>
        <div class="health-metric"><small>Stabilitas Tren</small><strong>${numberText(health.trendStability)} / 100</strong></div>
        <div class="health-metric ${shiftClass}"><small>Risiko Transisi</small><strong>${numberText(health.transitionRisk)} / 100</strong></div>
        <div class="health-metric"><small>Potensi Ekspansi</small><strong>${numberText(health.expansionProbability)} / 100</strong></div>
      </div>
    </details>
    <details class="professional-disclosure">
      <summary><span>Target & Skenario Harga</span><small>Level yang sedang dipantau</small></summary>
      <div class="liquidity-context-grid">
        ${targetMarkup('TARGET TERDEKAT', liquidity?.nearestLiquidity, 'Belum ada target')}
        ${targetMarkup('TARGET TIMEFRAME BESAR', liquidity?.htfAlignedLiquidity, 'Arah timeframe besar belum selaras')}
        ${targetMarkup('TARGET UTAMA', liquidity?.destinationTarget, 'Belum ada target utama')}
      </div>
      ${scenarioMarkup(result, router)}
      <div class="liquidity-warning"><b>${escapeHtml(liquidity?.destination || 'KONTEKS LIKUIDITAS')}</b><span>${escapeHtml(liquidity?.warning || 'Target likuiditas tidak menentukan waktu entry.')}</span></div>
    </details>
    <div class="router-actions"><button type="button" data-router-action="scan">Perbarui Analisis M15</button></div>
    <p class="router-disclaimer">Konteks hanya berubah ketika sumber candle closed-candle berubah, bukan pada setiap tick harga live.</p>
  </section>`;
}

function renderCard(tab, result, validated, regime, router, liquidity) {
  const ready = validated?.status === READY_STATUS
    && regime?.status === READY_STATUS
    && Boolean(router);
  if (!ready) return waitingMarkup(tab);
  return tab === 'Dashboard'
    ? renderDashboardCard(validated, liquidity)
    : renderAnalyzeCard(result, validated, regime, router, liquidity);
}

function disclosureStates(card) {
  return new Map([...card.querySelectorAll('details')].map(details => [
    String(details.querySelector(':scope > summary')?.textContent || '').trim(),
    details.open
  ]));
}

function restoreDisclosureStates(card, states) {
  card.querySelectorAll('details').forEach(details => {
    const key = String(details.querySelector(':scope > summary')?.textContent || '').trim();
    if (states.has(key)) details.open = states.get(key);
  });
}

function syncAttributes(current, next) {
  [...current.attributes].forEach(attribute => {
    if (attribute.name === 'id' || attribute.name === 'data-market-intent-bound') return;
    if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  });
  [...next.attributes].forEach(attribute => {
    if (attribute.name === 'id') return;
    if (current.getAttribute(attribute.name) !== attribute.value) {
      current.setAttribute(attribute.name, attribute.value);
    }
  });
}

function bindCard(card) {
  if (!card || card.dataset.marketIntentBound === 'true') return;
  card.dataset.marketIntentBound = 'true';
  card.addEventListener('click', event => {
    const scan = event.target.closest?.('[data-router-action="scan"]');
    if (scan) {
      scan.disabled = true;
      scan.textContent = 'Memperbarui...';
      const operation = typeof window.runAnalysis === 'function'
        ? window.runAnalysis('M15')
        : Promise.resolve(false);
      Promise.resolve(operation).finally(() => schedule(0));
      return;
    }
    const openAnalyze = event.target.closest?.('[data-router-open-analyze]');
    if (openAnalyze && typeof window.setTab === 'function') window.setTab('Analyze');
  });
}

function mountCard(app, markup, signature, ready) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const next = template.content.firstElementChild;
  if (!next) return false;

  let current = document.getElementById(CARD_ID);
  if (current?.dataset.marketIntentReady === 'true' && !ready) {
    const badge = current.querySelector('.regime-badge');
    if (badge && badge.textContent !== 'MEMPERBARUI CANDLE') badge.textContent = 'MEMPERBARUI CANDLE';
    return false;
  }

  if (!current) {
    const validBreak = [...app.querySelectorAll('details.disclosure')].find(item =>
      item.querySelector(':scope > summary')?.textContent?.trim().startsWith('Valid Break')
    );
    if (validBreak) validBreak.insertAdjacentElement('beforebegin', next);
    else app.appendChild(next);
    current = next;
  } else if (current.dataset.marketIntentSignature !== signature) {
    const states = disclosureStates(current);
    syncAttributes(current, next);
    current.innerHTML = next.innerHTML;
    restoreDisclosureStates(current, states);
  }

  current.dataset.marketIntentSignature = signature;
  current.dataset.marketIntentReady = String(ready);
  bindCard(current);
  return true;
}

function renderSignature(tab, result, state, validated, regime, router, liquidity) {
  return JSON.stringify({
    tab,
    selectedTf: state.tf,
    activeResultTf: result?.tf || null,
    m15: closedCandleFingerprint(state, 'M15'),
    resultSourceTime: result?.mappingSnapshot?.sourceCandleTime || 0,
    marketState: validated?.marketState?.state || null,
    forecast: validated?.directionForecast?.direction || null,
    forecastStart: validated?.directionForecast?.startTime || null,
    regime: router?.activeRegime || regime?.regime || null,
    shiftRisk: regime?.shift?.risk || 0,
    strategy: router?.activeStrategy || null,
    decision: router?.decision || null,
    setup: router?.watchSetup?.id || result?.setupExecution?.id || '',
    executionStatus: result?.setupExecution?.status || '',
    liquidity: liquidity?.nearestLiquidity?.level || null
  });
}

export function syncMarketIntentV3() {
  const app = document.getElementById('app');
  const state = window.state || {};
  const tab = state.tab;
  if (!app || !['Dashboard', 'Analyze'].includes(tab)) {
    lastSignature = '';
    return false;
  }

  const result = state.result || null;
  const { validated, regime, router, liquidity } = calculateContext(result, state);
  const signature = renderSignature(tab, result, state, validated, regime, router, liquidity);
  const current = document.getElementById(CARD_ID);
  if (current && signature === lastSignature && current.dataset.marketIntentSignature === signature) return false;

  const ready = validated?.status === READY_STATUS
    && regime?.status === READY_STATUS
    && Boolean(router);
  const changed = mountCard(
    app,
    renderCard(tab, result, validated, regime, router, liquidity),
    signature,
    ready
  );
  lastSignature = signature;

  if (changed) {
    window.dispatchEvent(new CustomEvent('amyfx:market-intent-rendered', {
      detail: {
        tab,
        timeframe: 'M15',
        sourceFingerprint: closedCandleFingerprint(state, 'M15'),
        renderedAt: Date.now()
      }
    }));
    queueMicrotask(() => window.AmyFXMappingClarity?.refresh?.());
  }
  return changed;
}

function runScheduledSync() {
  refreshTimer = 0;
  refreshFrame = 0;
  syncMarketIntentV3();
}

function schedule(delay = 0) {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (refreshFrame) cancelAnimationFrame(refreshFrame);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = 0;
    if (typeof requestAnimationFrame === 'function') refreshFrame = requestAnimationFrame(runScheduledSync);
    else runScheduledSync();
  }, Math.max(0, Number(delay) || 0));
}

function stop() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (refreshFrame) cancelAnimationFrame(refreshFrame);
  refreshTimer = 0;
  refreshFrame = 0;
  lifecycleController?.abort();
  lifecycleController = null;
}

function start() {
  if (lifecycleController) return;
  lifecycleController = new AbortController();
  const signal = lifecycleController.signal;
  [
    'amyfx:mapping-ui-rendered',
    'amyfx:mapping-state-change',
    'amyfx:candles-updated',
    'amyfx:entry-watch-updated',
    'amyfx:execution-authority-updated'
  ].forEach(name => window.addEventListener(name, () => schedule(0), { signal }));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule(0);
  }, { signal });
  window.addEventListener('pagehide', stop, { once: true, signal });
  schedule(0);
}

window.addEventListener('pageshow', event => {
  if (event.persisted) start();
});

window.AmyFXMarketIntentUi = Object.freeze({
  version: '4.0.0',
  sync: syncMarketIntentV3,
  schedule,
  start,
  stop,
  closedCandlePrice,
  closedCandleFingerprint
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
