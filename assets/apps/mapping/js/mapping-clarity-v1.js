import { state, p2 } from './main.js';
import { analyze } from './engine/ict-core.js';
import { SUPPORTED_MAPPING_TIMEFRAMES } from './engine/mapping-timeframes.js';

let queued = false;
let busy = false;
let cacheKey = '';
let cachedRows = [];

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function closed(timeframe) {
  return (state.candles?.[timeframe] || [])
    .filter(candle => candle?.isClosed !== false && candle?.amyfxSyntheticCurrent !== true)
    .filter(candle => [candle?.open, candle?.high, candle?.low, candle?.close]
      .map(Number)
      .every(Number.isFinite));
}

function wita(value) {
  const raw = Number(value);
  if (!(raw > 0)) return '—';
  const milliseconds = raw > 100_000_000_000 ? raw : raw * 1000;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(milliseconds)).replace('.', ':');
}

function directionClass(value) {
  const text = String(value || '').toUpperCase();
  if (text.includes('BULL') || text === 'BUY' || text === 'DISCOUNT') return 'd-bull';
  if (text.includes('BEAR') || text === 'SELL' || text === 'PREMIUM') return 'd-bear';
  return 'd-wait';
}

function installStyle() {
  if (document.getElementById('amy-smc-d-clarity-style')) return;
  const style = document.createElement('style');
  style.id = 'amy-smc-d-clarity-style';
  style.textContent = `.d-note{padding:10px 11px;border-radius:9px;background:rgba(30,41,59,.64);color:#cbd5e1;font-size:11px;line-height:1.55;margin:9px 0}.d-note.fresh{border-left:3px solid #38bdf8}.d-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:10px 0}.d-box{padding:10px;border:1px solid rgba(148,163,184,.15);border-radius:10px;background:rgba(15,23,42,.52)}.d-box small{display:block;color:#94a3b8;font-size:9px;text-transform:uppercase}.d-box strong{display:block;color:#e2e8f0;font-size:12px;margin-top:3px}.d-box span{display:block;color:#94a3b8;font-size:10px;margin-top:4px;line-height:1.4}.d-bull{color:#4ade80!important}.d-bear{color:#fb7185!important}.d-wait{color:#fbbf24!important}.d-table-wrap{overflow:auto}.d-table{width:100%;min-width:780px;border-collapse:collapse;font-size:10px}.d-table th,.d-table td{padding:8px;border-bottom:1px solid rgba(148,163,184,.14);text-align:left;vertical-align:top}.d-table th{color:#94a3b8;text-transform:uppercase;font-size:9px}.d-table small{display:block;color:#64748b;margin-top:3px}@media(max-width:640px){.d-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
}

function candleKey(timeframe) {
  const values = closed(timeframe);
  const last = values.at(-1);
  return `${timeframe}:${values.length}:${last?.time || 0}:${last?.open || 0}:${last?.high || 0}:${last?.low || 0}:${last?.close || 0}`;
}

function analyzeTimeframe(timeframe) {
  const candles = closed(timeframe);
  if (candles.length < 30) return { tf: timeframe, missing: true };
  try {
    const result = analyze(candles, timeframe, {}, null, { ...state.candles });
    return result?.amySmcD?.ready
      ? { tf: timeframe, result, d: result.amySmcD }
      : { tf: timeframe, missing: true, error: result?.amySmcD?.reason || 'Data belum cukup.' };
  } catch (error) {
    return { tf: timeframe, missing: true, error: error?.message || 'Analisis gagal.' };
  }
}

function allRows() {
  const nextKey = SUPPORTED_MAPPING_TIMEFRAMES.map(candleKey).join('|');
  if (nextKey === cacheKey) return cachedRows;
  cacheKey = nextKey;
  cachedRows = SUPPORTED_MAPPING_TIMEFRAMES.map(analyzeTimeframe);
  return cachedRows;
}

function eventText(event) {
  if (!event) return 'WAIT';
  const direction = Number(event.direction) > 0 ? 'BULLISH'
    : Number(event.direction) < 0 ? 'BEARISH'
      : 'NEUTRAL';
  return `${event.kind || event.type || 'EVENT'} ${direction}`;
}

function patchHost(details, className, html, signature) {
  if (!details) return;
  let host = details.querySelector(`.${className}`);
  if (!host) {
    [...details.children].forEach(child => {
      if (child.tagName !== 'SUMMARY') child.remove();
    });
    host = document.createElement('section');
    host.className = `card ${className}`;
    details.appendChild(host);
  }
  if (host.dataset.dSignature === signature) return;
  host.dataset.dSignature = signature;
  host.innerHTML = html;
}

function renderExplanation() {
  const details = document.querySelector('details[data-stability-key="mapping-explanation"]');
  const d = state.result?.amySmcD;
  if (!details || !d?.ready) return;
  const descriptive = d.descriptive;
  const predictive = d.predictive;
  const execution = state.result.setupExecution || {};
  const fresh = [
    descriptive.htfSwing.fresh ? `HTF ${descriptive.htfSwing.direction}` : null,
    descriptive.swingStructure.fresh ? `Swing ${descriptive.swingStructure.direction}` : null,
    descriptive.internalStructure.fresh ? `Internal ${descriptive.internalStructure.direction}` : null,
    descriptive.liquidity.rawSweep ? eventText(descriptive.liquidity.rawSweep) : null
  ].filter(Boolean);
  const signature = JSON.stringify([d.sourceCandle, descriptive, predictive, execution.status]);
  patchHost(details, 'amy-d-explanation', `<div class="kicker">AMY-SMC-D MAPPING</div><h2>Apa yang Sedang Terjadi?</h2>
    <div class="d-grid">
      <div class="d-box"><small>Final Bias</small><strong class="${directionClass(descriptive.finalBias.direction)}">${escapeHtml(descriptive.finalBias.direction)}</strong></div>
      <div class="d-box"><strong class="${directionClass(predictive.nextMove.signal)}">${escapeHtml(predictive.nextMove.signal)}</strong></div>
      <div class="d-box"><small>Dealing Range</small><strong class="${directionClass(descriptive.dealingRange.location)}">${escapeHtml(descriptive.dealingRange.location)}</strong></div>
      <div class="d-box"><small>Sumber Analisis</small><strong>${escapeHtml(wita(d.sourceCandle?.time))} WITA</strong><span>Candle sudah resmi tutup.</span></div>
    </div>
    <div class="d-note fresh"><b>Fresh evidence:</b> ${fresh.length ? escapeHtml(fresh.join(' · ')) : 'Tidak ada event struktur baru; state yang tampil adalah continuous/stale context.'}</div>
    <div class="d-note"><b>Execution Plan:</b> ${escapeHtml(execution.status || 'WAIT')}</div>`, signature);
}

function renderValidBreak() {
  const details = document.querySelector('details[data-stability-key="valid-break"]');
  const d = state.result?.amySmcD;
  if (!details || !d?.ready) return;
  const predictive = d.predictive;
  const raw = predictive.rawValidBreak;
  const qualified = predictive.qualifiedValidBreak;
  const choch = predictive.qualifiedChoch;
  const bos = predictive.qualifiedBos;
  const bosNote = ['M5', 'M15', 'H1'].includes(d.tf) && !bos
    ? 'Baseline riset N=0; engine tidak membuat qualified BOS synthetic.'
    : eventText(bos);
  const signature = JSON.stringify([d.sourceCandle?.time, raw, qualified, choch, bos]);
  patchHost(details, 'amy-d-breaks', `<div class="kicker">CLOSED-CANDLE EVENT SIGNALS</div><h2>Valid Break & Structure Qualification</h2><div class="d-grid">
    <div class="d-box"><small>Raw Valid Break</small><strong class="${directionClass(raw?.direction)}">${escapeHtml(eventText(raw))}</strong><span>${raw ? `Level ${p2(raw.level)}` : 'Tidak ada event baru.'}</span></div>
    <div class="d-box"><small>Qualified Valid Break</small><strong class="${directionClass(qualified?.direction)}">${escapeHtml(eventText(qualified))}</strong><span>${qualified ? 'Lolos filter Amy-SMC-D.' : 'WAIT'}</span></div>
    <div class="d-box"><small>Qualified CHoCH</small><strong class="${directionClass(choch?.direction)}">${escapeHtml(eventText(choch))}</strong><span>${choch ? 'Fresh qualified event.' : 'WAIT'}</span></div>
    <div class="d-box"><small>Qualified BOS</small><strong class="${directionClass(bos?.direction)}">${escapeHtml(eventText(bos))}</strong><span>${escapeHtml(bosNote)}</span></div>
  </div><p class="d-note">Harga live tidak mengubah event ini. Status berubah hanya setelah candle sumber berikutnya resmi tutup.</p>`, signature);
}

function renderAllTimeframes() {
  const details = document.querySelector('details[data-stability-key="mapping-all-timeframes"]');
  if (!details) return;
  const rows = allRows();
  const body = rows.map(row => {
    if (row.missing) return `<tr><td><b>${escapeHtml(row.tf)}</b></td><td colspan="6">${escapeHtml(row.error || 'Belum dimuat')}</td></tr>`;
    const d = row.d;
    const fresh = d.descriptive.htfSwing.fresh || d.descriptive.swingStructure.fresh || d.descriptive.internalStructure.fresh;
    return `<tr><td><b>${escapeHtml(row.tf)}</b><small>${escapeHtml(wita(d.sourceCandle?.time))} WITA</small></td><td><b class="${directionClass(d.descriptive.finalBias.direction)}">${escapeHtml(d.descriptive.finalBias.direction)}</b></td><td><b class="${directionClass(d.predictive.nextMove.signal)}">${escapeHtml(d.predictive.nextMove.signal)}</b></td><td><b class="${directionClass(d.descriptive.dealingRange.location)}">${escapeHtml(d.descriptive.dealingRange.location)}</b></td><td>${fresh ? '<b class="d-bull">FRESH</b>' : 'CONTINUOUS'}<small>${escapeHtml(eventText(d.descriptive.swingStructure.event || d.descriptive.internalStructure.event))}</small></td><td>${escapeHtml(eventText(d.predictive.qualifiedChoch))}</td><td>${escapeHtml(d.predictive.qualifiedPattern.active ? d.predictive.qualifiedPattern.name : 'WAIT')}</td></tr>`;
  }).join('');
  const signature = JSON.stringify(rows.map(row => row.missing ? [row.tf, 'missing'] : [row.tf, row.d.sourceCandle, row.d.descriptive, row.d.predictive]));
  patchHost(details, 'amy-d-all-tf', `<div class="kicker">ALL-TIMEFRAME AMY-SMC-D</div><h2>Context • Fresh Evidence • Predictive</h2><p class="d-note">Setiap timeframe memakai perilaku Amy-SMC-D/Z miliknya sendiri. Boundary 70/30, 60/40, dan rolling-240 hanya diterapkan pada M5, M15, dan H1 sesuai source.</p><div class="d-table-wrap"><table class="d-table"><thead><tr><th>TF / Candle</th><th>Final Bias</th><th>Next Move</th><th>Dealing Range</th><th>Fresh Structure</th><th>Qualified CHoCH</th><th>Qualified Pattern</th></tr></thead><tbody>${body}</tbody></table></div>`, signature);
}

function sync() {
  queued = false;
  if (busy) return;
  busy = true;
  try {
    installStyle();
    renderExplanation();
    renderValidBreak();
    renderAllTimeframes();
  } finally {
    busy = false;
  }
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(sync);
}

function boot() {
  installStyle();
  const app = document.getElementById('app');
  if (app) {
    new MutationObserver(records => {
      if (records.some(record => record.target === app)) schedule();
    }).observe(app, { childList: true, subtree: false });
  }
  [
    'amyfx:candles-updated',
    'amyfx:mapping-state-change',
    'amyfx:mapping-ui-rendered',
    'amyfx:entry-watch-updated',
    'amyfx:execution-authority-updated'
  ].forEach(name => window.addEventListener(name, schedule));
  schedule();
}

window.AmyFXMappingClarity = Object.freeze({
  version: '2.0.0',
  source: 'AMY_SMC_D',
  refresh: schedule,
  snapshot: () => state.result?.amySmcD || null
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
