import { deriveLiquidityContext } from './engine/market-intent-engine.js';
import { detectMarketRegimeV2 } from './engine/market-regime-engine.js';
import { routeRegimeStrategy } from './engine/strategy-router-engine.js';
import { evaluateValidatedMarketContext } from './engine/validated-market-context.js';
import { MAPPING_CLAIM_ACCURACY, LOCKED_PINE_REFERENCE_CLAIMS } from './engine/mapping-claim-accuracy.js';

const CARD_ID = 'amy-regime-router-v3';
const STATE_KEY = 'amy_regime_router_state_v3';
let lastSignature = '';
let refreshTimer = 0;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const numberText = (value, digits = 0) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '-';
const labelText = value => String(value || '-').replaceAll('_', ' ');

const FEATURE_COPY = Object.freeze({
  marketStateM15: { title: 'Kondisi Struktur', description: 'Kesesuaian pembacaan struktur dengan pengujian historis.' },
  directionForecastM15: { title: 'Proyeksi Arah', description: 'Ketepatan arah penutupan pada horizon analisis.' },
  nearestLiquidity: { title: 'Target Likuiditas', description: 'Ketepatan level terdekat sebagai target pertama.' },
  failedBreak: { title: 'Failed Break', description: 'Ketepatan reaksi harga setelah break gagal dipertahankan.' },
  validBreak: { title: 'Valid Break', description: 'Ketepatan kelanjutan harga setelah break terkonfirmasi.' },
  sweepOnly: { title: 'Liquidity Sweep', description: 'Ketepatan reaksi harga setelah sapuan dan reclaim.' },
  marketRegime: { title: 'Karakter Market', description: 'Konsistensi klasifikasi kondisi market saat ini.' },
  marketShift: { title: 'Risiko Perubahan', description: 'Ketepatan peringatan sebelum perubahan struktur besar.' },
  strategyRouter: { title: 'Konteks Strategi', description: 'Kesesuaian strategi dengan perilaku market berikutnya.' },
  entryMap: { title: 'Skenario Harga', description: 'Ketepatan reaksi harga setelah rangkaian Sweep dan MSS.' }
});

const REFERENCE_COPY = Object.freeze({
  'Validated Target': ['Target Utama', 'Target historis tercapai'],
  'Asia High / Low': ['High / Low Asia', 'Target tercapai dalam ≤4 jam'],
  'PDH / PDL': ['PDH / PDL', 'Target tercapai dalam ≤8 jam'],
  'Midnight Open': ['Midnight Open', 'Harga kembali menguji level dalam ≤4 jam'],
  'Order Block': ['Order Block', 'Area kembali diuji dalam ≤4 jam'],
  FVG: ['Fair Value Gap', 'Area kembali diuji dalam ≤4 jam'],
  'M5 Key Liquidity': ['Likuiditas Utama M5', 'Target tercapai dalam ≤4 jam'],
  'Protected Low': ['Protected Low', 'Level bertahan selama 1 jam'],
  'Protected High': ['Protected High', 'Level bertahan selama 1 jam']
});

function reliabilityLevel(value) {
  const score = Number(value || 0);
  if (score >= 85) return { label: 'Sangat kuat', kind: 'stable' };
  if (score >= 75) return { label: 'Kuat', kind: 'stable' };
  if (score >= 60) return { label: 'Cukup', kind: 'warning' };
  return { label: 'Terbatas', kind: 'danger' };
}

function reliabilityCard(key, detail = '') {
  const metric = MAPPING_CLAIM_ACCURACY[key];
  const copy = FEATURE_COPY[key] || { title: metric?.label || key, description: metric?.claim || '' };
  const level = reliabilityLevel(metric?.value);
  return `<div class="reliability-card ${level.kind}">
    <div class="reliability-head"><small>${escapeHtml(copy.title)}</small><span>${escapeHtml(level.label)}</span></div>
    <strong>${numberText(metric?.value, 2)}%</strong>
    <p>${escapeHtml(copy.description)}</p>
    <em>${escapeHtml(detail || metric?.period || '')}</em>
  </div>`;
}

function historicalReferenceRow(claim) {
  const [title, description] = REFERENCE_COPY[claim.label] || [claim.label, claim.claim];
  return `<div class="performance-row">
    <span><b>${escapeHtml(title)}</b><small>${escapeHtml(description)}</small></span>
    <strong>${numberText(claim.value, 2)}%</strong>
  </div>`;
}

function readRouterState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (_) { return null; }
}

function writeRouterState(state) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) {}
}

function calculateContext(result, state) {
  const candles = state?.candles?.M15 || [];
  if (!result || candles.length < 30) {
    return { validated: null, regime: null, router: null, liquidity: deriveLiquidityContext({ candles }) };
  }
  const validated = result.validatedMarketContext || evaluateValidatedMarketContext({
    candles,
    tf: 'M15',
    htfCandles: { H4: state?.candles?.H4 || [] }
  });
  const intel = window.AmyFXIntel?.read?.() || {};
  const regime = result.marketRegime || detectMarketRegimeV2({
    candles,
    tf: 'M15',
    htfBiases: result.htfBiases || {},
    marketConcepts: result.marketConcepts || null,
    entryMap: result.entryMap || null,
    currentPrice: state.price || result.price,
    newsRisk: window.AmyFXIntel?.newsRisk?.(intel) || 'UNKNOWN',
    freshness: window.AmyMappingIntegrity?.qualityByInterval || {}
  });
  const router = result.strategyRouter || routeRegimeStrategy({
    candles,
    result,
    regime,
    currentPrice: state.price || result.price,
    previousState: readRouterState()
  });
  writeRouterState(router.state);
  const liquidity = deriveLiquidityContext({ result, regime, candles });
  result.validatedMarketContext = validated;
  result.marketRegime = regime;
  result.strategyRouter = router;
  result.liquidityContextV4 = liquidity;
  return { validated, regime, router, liquidity };
}

function bar(name, value, active) {
  const amount = Math.max(0, Math.min(100, Number(value || 0)));
  return `<div class="regime-probability ${active ? 'active' : ''}"><div><span>${escapeHtml(labelText(name))}</span><b>${numberText(amount)} / 100</b></div><i style="--regime-value:${numberText(amount)}%"></i></div>`;
}

function healthMetric(label, value, kind = '') {
  return `<div class="health-metric ${kind}"><small>${escapeHtml(label)}</small><strong>${numberText(value)} / 100</strong><i style="--health-value:${numberText(value)}%"></i></div>`;
}

function engineCard(engine, activeName) {
  const isActive = engine?.engine === activeName;
  return `<div class="strategy-engine ${isActive ? 'active' : 'disabled'}"><small>${isActive ? 'KONTEKS AKTIF' : 'ALTERNATIF'}</small><strong>${escapeHtml(labelText(engine?.engine))}</strong><span>${escapeHtml(labelText(engine?.status || 'BELUM AKTIF'))}${engine?.quality ? ` · skor konteks ${numberText(engine.quality)}/100` : ''}</span></div>`;
}

function scenarioMarkup(result, router) {
  const setup = result?.experimentalBestSetup || result?.unroutedBestSetup || router?.watchSetup || null;
  if (!setup) {
    return `<div class="router-execution wait"><small>SKENARIO PEMANTAUAN</small><strong>Belum terbentuk</strong><p>Belum ada rangkaian harga yang cukup lengkap untuk membuat skenario level.</p></div>`;
  }
  return `<div class="router-execution ${String(setup.dir || '').toLowerCase()}"><small>SKENARIO PEMANTAUAN</small><strong>${escapeHtml(setup.dir || setup.direction || 'TUNGGU')} · ${escapeHtml(setup.type || 'SWEEP → MSS')}</strong><div class="router-level-row"><span><b>Area harga</b>${numberText(setup.entry ?? setup.entryLow, 2)}</span><span><b>Batas skenario</b>${numberText(setup.sl, 2)}</span><span><b>Target awal</b>${numberText(setup.tp1, 2)}</span><span><b>Target lanjutan</b>${numberText(setup.tp2, 2)}</span></div><p>Gunakan sebagai skenario pemantauan dan tunggu konfirmasi harga sebelum mengambil keputusan.</p></div>`;
}

function targetMarkup(title, target, emptyText) {
  if (!target) return `<div class="liquidity-context-target empty"><small>${escapeHtml(title)}</small><strong>${escapeHtml(emptyText)}</strong><span>Belum tersedia</span></div>`;
  return `<div class="liquidity-context-target"><small>${escapeHtml(title)}</small><strong>${escapeHtml(target.label || target.type)}</strong><span>${numberText(target.level, 2)} · ${escapeHtml(target.type)}</span></div>`;
}

function contextKinds(validated, regime) {
  const marketState = validated?.marketState || {};
  const forecast = validated?.directionForecast || {};
  return {
    marketState,
    forecast,
    stateKind: marketState.directionValue > 0 ? 'stable' : marketState.directionValue < 0 ? 'danger' : 'warning',
    forecastKind: forecast.directionValue > 0 ? 'stable' : forecast.directionValue < 0 ? 'danger' : 'warning',
    shiftKind: regime?.shift?.risk >= 55 ? 'danger' : regime?.shift?.risk >= 30 ? 'warning' : 'stable'
  };
}

function marketOverviewMarkup(validated, liquidity) {
  const { marketState, forecast, stateKind, forecastKind } = contextKinds(validated);
  const target = liquidity?.nearestLiquidity || null;
  return `<div class="market-health-title"><span>RINGKASAN MARKET</span><small>Struktur, arah, dan target terdekat</small></div>
    <div class="router-status-strip validated-context-strip">
      <div class="${stateKind}"><small>Kondisi Struktur</small><strong>${escapeHtml(marketState.state || 'RANGE / TRANSITION')}</strong><span>${numberText(MAPPING_CLAIM_ACCURACY.marketStateM15.value, 2)}% konsistensi historis</span></div>
      <div class="${forecastKind}"><small>Proyeksi Arah</small><strong>${escapeHtml(forecast.direction || 'BELUM JELAS')}</strong><span>${forecast.active ? `${numberText(MAPPING_CLAIM_ACCURACY.directionForecastM15.value, 2)}% akurasi · ${escapeHtml(forecast.horizonText || '-')}` : 'Belum ada proyeksi aktif'}</span></div>
      <div><small>Target Likuiditas</small><strong>${escapeHtml(target?.label || target?.type || 'BELUM JELAS')}</strong><span>${target ? `${numberText(target.level, 2)} · ${numberText(MAPPING_CLAIM_ACCURACY.nearestLiquidity.value, 2)}% akurasi target pertama` : 'Menunggu target aktif'}</span></div>
    </div>`;
}

function waitingMarkup(tab) {
  const dashboard = tab === 'Dashboard';
  return `<section class="card regime-router-card waiting ${dashboard ? 'dashboard-context-card' : 'analyze-context-card'}" id="${CARD_ID}">
    <div class="regime-preview-ribbon">AMY FX · MARKET INTELLIGENCE</div>
    <div class="regime-header"><div><div class="kicker">KONTEKS MARKET</div><h2>Menyiapkan analisis market</h2></div><span class="regime-badge">MEMUAT</span></div>
    <p class="muted">Memuat data struktur, arah, dan likuiditas XAU/USD.</p>
    <button class="router-primary-button" type="button" data-router-action="scan">Muat Ulang Analisis M15</button>
  </section>`;
}

function renderDashboardCard(validated, regime, router, liquidity) {
  return `<section class="card regime-router-card dashboard-context-card" id="${CARD_ID}">
    <div class="regime-preview-ribbon">AMY FX · MARKET INTELLIGENCE</div>
    <div class="regime-header"><div><div class="kicker">RINGKASAN LIVE</div><h2>Kondisi market saat ini</h2></div><span class="regime-badge">M15</span></div>
    ${marketOverviewMarkup(validated, liquidity)}
    <p class="professional-note">Reliabilitas ditampilkan berdasarkan pengujian historis dan tidak menjamin hasil market berikutnya.</p>
    <div class="router-actions dashboard-context-actions">
      <button type="button" data-router-open-analyze>Lihat Analisis Lengkap</button>
      <button type="button" data-router-action="scan">Perbarui Data</button>
    </div>
  </section>`;
}

function renderAnalyzeCard(result, validated, regime, router, liquidity) {
  const probabilities = regime.probabilities || {};
  const health = regime.health || {};
  const shiftClass = regime.shift?.risk >= 55 ? 'danger' : regime.shift?.risk >= 30 ? 'warning' : 'stable';
  const engines = Object.values(router.engines || {});
  return `<section class="card regime-router-card analyze-context-card" id="${CARD_ID}">
    <div class="regime-preview-ribbon">AMY FX · ANALISIS PASAR</div>
    <div class="regime-header"><div><div class="kicker">XAU/USD · M15</div><h2>Analisis market</h2></div><span class="regime-badge">LIVE</span></div>

    ${marketOverviewMarkup(validated, liquidity)}

    <div class="market-health-title"><span>RELIABILITAS HISTORIS</span><small>Ringkasan performa fitur utama</small></div>
    <div class="reliability-grid">
      ${reliabilityCard('marketStateM15')}
      ${reliabilityCard('directionForecastM15')}
      ${reliabilityCard('nearestLiquidity', `Cakupan ${numberText(MAPPING_CLAIM_ACCURACY.nearestLiquidity.coverage, 2)}%`)}
      ${reliabilityCard('failedBreak')}
    </div>

    <details class="professional-disclosure">
      <summary><span>Performa Historis Model</span><small>${LOCKED_PINE_REFERENCE_CLAIMS.length} referensi · 2020–2025</small></summary>
      <div class="performance-list">${LOCKED_PINE_REFERENCE_CLAIMS.map(historicalReferenceRow).join('')}</div>
      <p class="professional-note">Hasil historis digunakan sebagai referensi reliabilitas dan bukan jaminan performa di masa depan.</p>
    </details>

    <details class="professional-disclosure">
      <summary><span>Konteks Market Lanjutan</span><small>Karakter, stabilitas, dan risiko perubahan</small></summary>
      <div class="regime-hero ${String(router.activeRegime).toLowerCase()}">
        <div><small>KARAKTER MARKET</small><strong>${escapeHtml(labelText(router.activeRegime))}</strong><p>Kondisi terdeteksi: ${escapeHtml(labelText(router.rawRegime))} · skor kejelasan ${numberText(regime.confidence)}/100</p></div>
        <div class="regime-strategy"><small>KONTEKS STRATEGI</small><strong>${escapeHtml(labelText(router.activeStrategy))}</strong><span>${router.blocked ? 'Tunggu hingga kondisi market lebih stabil.' : 'Gunakan sebagai konteks tambahan untuk membaca market.'}</span></div>
      </div>
      <div class="regime-probability-list">${Object.entries(probabilities).map(([name, value]) => bar(name, value, name === router.activeRegime)).join('')}</div>
      <div class="market-health-grid">
        ${healthMetric('Kekuatan Tren', health.trendStrength)}
        ${healthMetric('Stabilitas Tren', health.trendStability)}
        ${healthMetric('Risiko Transisi', health.transitionRisk, shiftClass)}
        ${healthMetric('Tekanan Manipulasi', health.manipulationRisk, health.manipulationRisk >= 60 ? 'warning' : '')}
        ${healthMetric('Kondisi Range', health.rangeProbability)}
        ${healthMetric('Potensi Ekspansi', health.expansionProbability)}
      </div>
      <div class="router-status-strip">
        <div class="${shiftClass}"><small>Risiko Perubahan</small><strong>${escapeHtml(labelText(regime.shift?.status || 'STABIL'))}</strong><span>Skor ${numberText(regime.shift?.risk)}/100</span></div>
        <div><small>Stabilitas Kondisi</small><strong>${router.state?.stable ? 'STABIL' : 'DALAM KONFIRMASI'}</strong><span>${router.state?.candidateBars || 0} candle observasi</span></div>
        <div><small>Mode Analisis</small><strong>INFORMASI</strong><span>Konfirmasi harga tetap diperlukan</span></div>
      </div>
      <div class="strategy-engine-grid">${engines.map(engine => engineCard(engine, router.activeStrategy)).join('')}</div>
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
    <p class="router-disclaimer">Gunakan analisis sebagai alat bantu. Keputusan dan pengelolaan risiko tetap berada pada pengguna.</p>
  </section>`;
}

function renderCard(tab, result, validated, regime, router, liquidity) {
  if (!validated || validated.status !== 'READY' || !regime || regime.status !== 'READY' || !router) return waitingMarkup(tab);
  return tab === 'Dashboard'
    ? renderDashboardCard(validated, regime, router, liquidity)
    : renderAnalyzeCard(result, validated, regime, router, liquidity);
}

function applyViewMode() {
  document.body.classList.remove('regime-router-focus-mode', 'regime-router-detail-mode');
}

function bindCard() {
  const card = document.getElementById(CARD_ID);
  if (!card || card.dataset.bound === 'true') return;
  card.dataset.bound = 'true';
  card.addEventListener('click', event => {
    const scan = event.target.closest('[data-router-action="scan"]');
    if (scan) {
      scan.disabled = true;
      scan.textContent = 'Memperbarui...';
      if (typeof window.runAnalysis === 'function') window.runAnalysis('M15');
      return;
    }
    const openAnalyze = event.target.closest('[data-router-open-analyze]');
    if (openAnalyze && typeof window.setTab === 'function') window.setTab('Analyze');
  });
}

export function syncMarketIntentV3() {
  const app = document.getElementById('app');
  const state = window.state || {};
  if (!app || !['Dashboard', 'Analyze'].includes(state.tab)) {
    document.getElementById(CARD_ID)?.remove();
    document.body.classList.remove('regime-router-focus-mode', 'regime-router-detail-mode');
    lastSignature = '';
    return;
  }
  const result = state.result || null;
  const { validated, regime, router, liquidity } = calculateContext(result, state);
  const signature = JSON.stringify({
    tab: state.tab,
    candle: state.candles?.M15?.at(-1)?.time || 0,
    price: Number(state.price || result?.price || 0).toFixed(2),
    marketState: validated?.marketState?.state,
    forecast: validated?.directionForecast?.direction,
    forecastStart: validated?.directionForecast?.startTime,
    regime: router?.activeRegime,
    raw: regime?.regime,
    shift: regime?.shift?.risk,
    strategy: router?.activeStrategy,
    decision: router?.decision,
    setup: router?.watchSetup?.id || '',
    liquidity: liquidity?.nearestLiquidity?.level
  });
  applyViewMode();
  const current = document.getElementById(CARD_ID);
  if (current && signature === lastSignature) return;

  const openStates = current
    ? Array.from(current.querySelectorAll('.professional-disclosure')).map(element => element.open)
    : [];

  const rawMarkup = renderCard(state.tab, result, validated, regime, router, liquidity);
  let markup = rawMarkup;
  if (openStates.length > 0) {
    const temp = document.createElement('div');
    temp.innerHTML = rawMarkup;
    const disclosures = temp.querySelectorAll('.professional-disclosure');
    openStates.forEach((isOpen, index) => {
      if (disclosures[index] && isOpen) disclosures[index].open = true;
    });
    markup = temp.innerHTML;
  }

  if (current) {
    if (current.outerHTML !== markup) current.outerHTML = markup;
  } else {
    const validBreak = [...app.querySelectorAll('details.disclosure')].find(item => item.querySelector(':scope > summary')?.textContent.trim().startsWith('Valid Break'));
    if (validBreak) validBreak.insertAdjacentHTML('beforebegin', markup);
    else app.insertAdjacentHTML('beforeend', markup);
  }
  lastSignature = signature;
  bindCard();
}

function schedule(delay = 0) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => requestAnimationFrame(syncMarketIntentV3), delay);
}

function start() {
  schedule();
  document.addEventListener('click', () => schedule(100), { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  window.addEventListener('storage', event => { if (event.key === STATE_KEY) schedule(); });
  setInterval(() => { if (!document.hidden) schedule(); }, 1500);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
