import { state, TF, p2 } from './main.js';
import { analyze } from './engine/ict-core.js';
import {
  applyLiveLiquidity,
  candleFreshness
} from './integrity/mapping-integrity-core.js';
import {
  appendPredictionSnapshots,
  buildMarketOutlooks,
  evaluatePredictionHistory,
  predictionStats
} from './outlook/market-outlook-core.js';

const TRACKER_KEY = 'amy_mapping_outlook_predictions_v1';
const OPEN_KEY = 'amy_mapping_outlook_open';
const ANALYSIS_TFS = ['M15', 'M30', 'H1', 'H4', 'D1'];
let cachedCandleSignature = '';
let cachedAnalyses = {};
let lastPaintSignature = '';
let lastTrackerWrite = '';
let timer = 0;

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function readHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRACKER_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeHistory(history) {
  const serialized = JSON.stringify((history || []).slice(-500));
  if (serialized === lastTrackerWrite) return;
  lastTrackerWrite = serialized;
  localStorage.setItem(TRACKER_KEY, serialized);
}

function lastCandleTime(tf) {
  const candles = state.candles?.[tf] || [];
  return Number(candles.at(-1)?.time || 0);
}

function candleSignature() {
  return ANALYSIS_TFS.map(tf => `${tf}:${state.candles?.[tf]?.length || 0}:${lastCandleTime(tf)}`).join('|');
}

function analyzeTimeframe(tf) {
  const candles = state.candles?.[tf] || [];
  if (candles.length < 30) return null;
  try {
    const result = analyze(candles, tf, {}, Number(state.price || 0), {
      H4: state.candles?.H4,
      D1: state.candles?.D1,
      W1: state.candles?.W1
    });
    applyLiveLiquidity(result, { price: Number(state.price || result.price || 0) });
    return result;
  } catch (_) {
    return null;
  }
}

function analyses() {
  const signature = candleSignature();
  if (signature === cachedCandleSignature && Object.keys(cachedAnalyses).length) {
    if (state.result?.tf) cachedAnalyses[state.result.tf] = state.result;
    return cachedAnalyses;
  }
  cachedCandleSignature = signature;
  cachedAnalyses = Object.fromEntries(
    ANALYSIS_TFS
      .map(tf => [tf, analyzeTimeframe(tf)])
      .filter(([, result]) => result)
  );
  if (state.result?.tf) cachedAnalyses[state.result.tf] = state.result;
  return cachedAnalyses;
}

function freshnessMap() {
  const quality = window.AmyMappingIntegrity?.qualityByInterval || {};
  return Object.fromEntries(ANALYSIS_TFS.map(tf => [
    tf,
    candleFreshness(quality[TF[tf]] || state.candleMeta?.[TF[tf]], tf)
  ]));
}

function marketContext() {
  const intel = window.AmyFXIntel;
  const stored = intel?.read?.() || {};
  return {
    session: intel?.sessionInfo?.() || { id: 'OFF_SESSION', label: 'OFF-SESSION' },
    newsRisk: intel?.newsRisk?.(stored) || 'UNKNOWN'
  };
}

function directionLabel(direction) {
  if (direction === 'BULLISH') return 'Naik';
  if (direction === 'BEARISH') return 'Turun';
  return 'Sideways / Range';
}

function directionClass(direction) {
  return String(direction || 'range').toLowerCase();
}

function expiryText(timestamp) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function priceText(value) {
  return Number.isFinite(Number(value)) ? p2(value) : 'Belum tersedia';
}

function invalidationText(outlook) {
  if (outlook.direction === 'RANGE') {
    return `${priceText(outlook.invalidation?.lower)}–${priceText(outlook.invalidation?.upper)}`;
  }
  return priceText(outlook.invalidation);
}

function probabilityMarkup(outlook) {
  return `<div class="outlook-probabilities">
    <div><span>Skenario utama</span><b>${outlook.probability}%</b><i style="--value:${outlook.probability}%"></i></div>
    <div><span>Alternatif</span><b>${outlook.alternativeProbability}%</b><i style="--value:${outlook.alternativeProbability}%"></i></div>
    <div><span>Invalidasi / reversal</span><b>${outlook.invalidationProbability}%</b><i style="--value:${outlook.invalidationProbability}%"></i></div>
  </div>`;
}

function listMarkup(title, items, emptyText) {
  const values = Array.isArray(items) ? items : [];
  return `<div class="outlook-list-block"><small>${safeText(title)}</small>${
    values.length
      ? `<ul>${values.map(item => `<li>${safeText(item)}</li>`).join('')}</ul>`
      : `<p>${safeText(emptyText)}</p>`
  }</div>`;
}

function outlookCard(outlook, horizonStats) {
  const accuracy = horizonStats?.ready
    ? `<span class="outlook-calibrated">Akurasi arah historis ${horizonStats.directionalAccuracy.toFixed(1)}%</span>`
    : `<span class="outlook-collecting">Tracker ${horizonStats?.count || 0}/20 sampel</span>`;

  return `<article class="outlook-card ${directionClass(outlook.direction)}">
    <div class="outlook-card-head">
      <div><small>HORIZON</small><h3>${safeText(outlook.label)}</h3></div>
      <span class="outlook-direction ${directionClass(outlook.direction)}">${safeText(directionLabel(outlook.direction))}</span>
    </div>
    <div class="outlook-confidence">
      <div><small>Probabilitas model</small><strong>${outlook.probability}%</strong></div>
      ${accuracy}
    </div>
    <p class="outlook-scenario"><b>Skenario utama</b><br>${safeText(outlook.scenario)}</p>
    ${probabilityMarkup(outlook)}
    <div class="outlook-level-grid">
      <div><small>Target utama</small><strong>${outlook.primaryTargetType ? `${safeText(outlook.primaryTargetType)} ${priceText(outlook.primaryTarget)}` : 'Belum ada target aktif'}</strong></div>
      <div><small>Target lanjutan</small><strong>${outlook.secondaryTargetType ? `${safeText(outlook.secondaryTargetType)} ${priceText(outlook.secondaryTarget)}` : 'Belum tersedia'}</strong></div>
      <div><small>Invalidasi konteks</small><strong>${invalidationText(outlook)}</strong></div>
      <div><small>Berlaku sampai</small><strong>${safeText(expiryText(outlook.expiresAt))} WIB</strong></div>
    </div>
    <div class="outlook-path"><small>Jalur harga yang diperkirakan</small><strong>${safeText(outlook.path)}</strong></div>
    <div class="outlook-scenarios">
      <p><b>Skenario alternatif</b><br>${safeText(outlook.alternativeScenario)}</p>
      <p><b>Kondisi batal</b><br>${safeText(outlook.invalidationScenario)}</p>
    </div>
    <div class="outlook-factor-grid">
      ${listMarkup('Faktor pendukung', outlook.factors, 'Belum ada faktor kuat yang selaras.')}
      ${listMarkup('Faktor risiko', outlook.risks, 'Tidak ada risiko tambahan yang terdeteksi.')}
    </div>
  </article>`;
}

function trackerMarkup(stats) {
  const overall = stats.overall;
  const headline = overall.ready
    ? `<strong>${overall.directionalAccuracy.toFixed(1)}%</strong><span>Akurasi arah historis</span>`
    : `<strong>${overall.count}/20</strong><span>Mengumpulkan sampel sebelum menampilkan akurasi</span>`;

  const recent = stats.recent || [];
  return `<section class="outlook-tracker">
    <div class="outlook-tracker-head">
      <div><small>PREDICTION TRACKER</small><h3>Validasi Otomatis Outlook</h3></div>
      <span>${stats.pending} aktif</span>
    </div>
    <div class="outlook-tracker-main">${headline}</div>
    <div class="outlook-tracker-grid">
      <div><small>Outlook selesai</small><b>${overall.count}</b></div>
      <div><small>Target tercapai</small><b>${overall.count ? overall.targetHitRate.toFixed(1) : '0.0'}%</b></div>
      <div><small>Invalidasi</small><b>${overall.count ? overall.invalidationRate.toFixed(1) : '0.0'}%</b></div>
    </div>
    <p class="outlook-tracker-note">Akurasi baru ditampilkan setelah minimal 20 outlook selesai. Tracker menilai arah, target, dan invalidasi dari candle sesudah outlook dibuat.</p>
    ${recent.length ? `<details class="outlook-history"><summary>Riwayat hasil terbaru</summary><div>${
      recent.map(item => `<p><b>${safeText(item.horizonLabel)}</b> · ${safeText(directionLabel(item.direction))} · ${safeText(item.outcome || 'SELESAI')}<br><small>${priceText(item.startPrice)} → ${priceText(item.finalPrice)}</small></p>`).join('')
    }</div></details>` : ''}
  </section>`;
}

function panelMarkup(projection, stats, context) {
  const cards = projection.outlooks.map(outlook =>
    outlookCard(outlook, stats.byHorizon[outlook.id])
  ).join('');

  return `<section class="market-outlook-panel">
    <div class="outlook-overview">
      <div><small>MARKET REGIME</small><strong>${safeText(projection.regime.label)}</strong></div>
      <div><small>SESSION</small><strong>${safeText(context.session.label || context.session.id)}</strong></div>
      <div><small>NEWS RISK</small><strong>${safeText(context.newsRisk)}</strong></div>
      <div><small>HARGA ACUAN</small><strong>${priceText(projection.price)}</strong></div>
    </div>
    <p class="outlook-disclaimer"><b>Proyeksi, bukan kepastian.</b> ${safeText(projection.disclaimer)} Fitur ini membahas kemungkinan arah dan target market, bukan rekomendasi entry.</p>
    <div class="outlook-cards">${cards}</div>
    ${trackerMarkup(stats)}
  </section>`;
}

function findValidBreak() {
  return [...document.querySelectorAll('#app details.disclosure')]
    .find(details => details.querySelector(':scope > summary')?.textContent.trim().startsWith('Valid Break'));
}

function ensureDisclosure() {
  const app = document.getElementById('app');
  if (!app || state.tab !== 'Analyze' || !state.result) return null;
  let details = app.querySelector('.outlook-disclosure');
  if (details) return details;

  details = document.createElement('details');
  details.className = 'card disclosure outlook-disclosure';
  details.open = localStorage.getItem(OPEN_KEY) !== 'false';
  details.innerHTML = '<summary>Amy Market Outlook</summary><div class="outlook-loading">Menyusun proyeksi market...</div>';
  details.addEventListener('toggle', () => localStorage.setItem(OPEN_KEY, String(details.open)));

  const validBreak = findValidBreak();
  if (validBreak) app.insertBefore(details, validBreak);
  else app.appendChild(details);
  return details;
}

function projectionSignature(projection, history) {
  return JSON.stringify({
    price: Number(projection.price || 0).toFixed(2),
    regime: projection.regime?.id,
    outlooks: projection.outlooks.map(item => ({
      id: item.id,
      direction: item.direction,
      probability: item.probability,
      target: item.primaryTarget,
      invalidation: item.invalidation
    })),
    resolved: history.filter(item => item.status === 'RESOLVED').length,
    pending: history.filter(item => item.status === 'PENDING').length
  });
}

function publishOutlook(projection, stats) {
  const primary = projection.outlooks?.[0];
  if (!primary || !window.AmyFXIntel?.write) return;
  window.AmyFXIntel.write('outlook', {
    generatedAt: projection.generatedAt,
    price: projection.price,
    regime: projection.regime.label,
    direction: primary.direction,
    probability: primary.probability,
    target: primary.primaryTarget,
    invalidation: primary.invalidation,
    directionalAccuracy: stats.overall.ready ? stats.overall.directionalAccuracy : null,
    sampleSize: stats.overall.count
  });
}

function refresh(force = false) {
  const details = ensureDisclosure();
  if (!details || !state.result || state.tab !== 'Analyze') return;

  const context = marketContext();
  const fresh = freshnessMap();
  const projection = buildMarketOutlooks({
    result: state.result,
    analyses: analyses(),
    candlesByTf: state.candles,
    price: state.price,
    newsRisk: context.newsRisk,
    freshness: fresh,
    session: context.session,
    now: Date.now()
  });

  let history = evaluatePredictionHistory(readHistory(), {
    candlesByTf: state.candles,
    livePrice: state.price,
    now: Date.now()
  });
  history = appendPredictionSnapshots(history, projection, {
    now: Date.now(),
    session: context.session
  });
  writeHistory(history);
  const stats = predictionStats(history);
  const signature = projectionSignature(projection, history);

  if (force || signature !== lastPaintSignature) {
    lastPaintSignature = signature;
    const summary = details.querySelector(':scope > summary');
    [...details.children].filter(child => child !== summary).forEach(child => child.remove());
    summary.insertAdjacentHTML('afterend', panelMarkup(projection, stats, context));
    state.result.marketOutlook = projection;
    publishOutlook(projection, stats);
  }
}

function boot() {
  refresh(true);
  clearInterval(timer);
  timer = setInterval(() => refresh(), 2500);
  document.addEventListener('click', () => setTimeout(() => refresh(true), 30), true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh(true);
  });
}

window.AmyMarketOutlook = {
  refresh: () => refresh(true),
  history: readHistory,
  stats: () => predictionStats(readHistory())
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
