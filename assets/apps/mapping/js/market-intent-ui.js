const CARD_ID = 'amy-regime-router-v3';

let lastSignature = '';
let refreshFrame = 0;
let lifecycleController = null;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function directionClass(value) {
  const text = String(value || '').toUpperCase();
  if (text.includes('BULL') || text === 'BUY' || text === 'DISCOUNT') return 'amy-d-bull';
  if (text.includes('BEAR') || text === 'SELL' || text === 'PREMIUM') return 'amy-d-bear';
  return 'amy-d-neutral';
}

function numberText(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number.toFixed(2) : '—';
}

function wita(value) {
  const raw = Number(value);
  if (!(raw > 0)) return '—';
  const milliseconds = raw > 100_000_000_000 ? raw : raw * 1000;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(milliseconds)).replace('.', ':');
}

function closedCandlePrice(result) {
  const value = Number(result?.amySmcD?.sourceCandle?.close);
  return Number.isFinite(value) ? value : null;
}

function closedCandleFingerprint(state, timeframe = 'M15') {
  const tf = String(timeframe || 'M15').toUpperCase();
  const candles = state?.candles?.[tf]
    || state?.candleContext?.[tf]
    || state?.candlesByTimeframe?.[tf]
    || [];
  const closed = Array.isArray(candles)
    ? candles.filter(candle => candle && candle.isClosed !== false && candle.amyfxSyntheticCurrent !== true)
    : [];
  const candle = closed.at(-1);
  if (!candle) return null;
  return [candle.time, candle.open, candle.high, candle.low, candle.close].join(':');
}

function eventValue(event) {
  if (!event) return { title: 'WAIT', note: 'Tidak ada event baru pada candle sumber.' };
  const direction = Number(event.direction) > 0 ? 'BULLISH'
    : Number(event.direction) < 0 ? 'BEARISH'
      : String(event.direction || 'NEUTRAL');
  return {
    title: `${event.kind || event.type || 'EVENT'} ${direction}`,
    note: Number.isFinite(Number(event.level)) ? `Level ${numberText(event.level)}` : 'Closed-candle event'
  };
}

function cell(label, value, note = '') {
  return `<div class="amy-d-cell ${directionClass(value)}">${label ? `<small>${escapeHtml(label)}</small>` : ''}<strong>${escapeHtml(value || 'WAIT')}</strong>${note ? `<span>${escapeHtml(note)}</span>` : ''}</div>`;
}

function installStyle() {
  if (document.getElementById('amy-smc-d-mapping-style')) return;
  const style = document.createElement('style');
  style.id = 'amy-smc-d-mapping-style';
  style.textContent = `.amy-d-card{position:relative;overflow:hidden}.amy-d-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.amy-d-head h2{margin:3px 0}.amy-d-source{font-size:10px;color:#94a3b8;text-align:right}.amy-d-badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:rgba(56,189,248,.12);color:#7dd3fc;font-size:10px;font-weight:800;letter-spacing:.04em}.amy-d-section{margin-top:13px}.amy-d-section-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;color:#cbd5e1;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.amy-d-section-title span{font-size:9px;color:#64748b;font-weight:600}.amy-d-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.amy-d-cell{padding:9px 10px;border:1px solid rgba(148,163,184,.15);border-radius:10px;background:rgba(15,23,42,.52);min-width:0}.amy-d-cell small{display:block;color:#94a3b8;font-size:9px;text-transform:uppercase;letter-spacing:.04em}.amy-d-cell strong{display:block;color:#e2e8f0;font-size:12px;margin-top:3px;overflow-wrap:anywhere}.amy-d-cell span{display:block;color:#94a3b8;font-size:9px;line-height:1.35;margin-top:3px}.amy-d-bull strong{color:#4ade80}.amy-d-bear strong{color:#fb7185}.amy-d-neutral strong{color:#fbbf24}.amy-d-note{margin-top:10px;padding:9px 10px;border-left:3px solid #38bdf8;border-radius:8px;background:rgba(14,116,144,.08);color:#cbd5e1;font-size:10px;line-height:1.5}.amy-d-actions{display:flex;gap:7px;margin-top:12px}.amy-d-actions button{flex:1}.amy-d-card[data-stale="true"] .amy-d-badge{background:rgba(245,158,11,.12);color:#fbbf24}@media(max-width:640px){.amy-d-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.amy-d-head{display:block}.amy-d-source{text-align:left;margin-top:5px}}`;
  document.head.appendChild(style);
}

function waitingMarkup() {
  return `<section class="card amy-d-card" id="${CARD_ID}" data-market-intent-ready="false"><div class="amy-d-head"><div><div class="kicker">AMY-SMC-D MAPPING</div><h2>Menunggu candle tertutup</h2></div><span class="amy-d-badge">CLOSED CANDLE ONLY</span></div><p class="muted">Mapping tidak dihitung dari tick harga WebSocket.</p><div class="amy-d-actions"><button class="action" type="button" data-amy-d-refresh>Perbarui Candle</button></div></section>`;
}

function contextMarkup(d) {
  const descriptive = d.descriptive;
  const liquidityNote = descriptive.liquidity.active
    ? `${descriptive.liquidity.side || '-'} ${numberText(descriptive.liquidity.level)}`
    : 'Continuous context';
  return `<div class="amy-d-section"><div class="amy-d-section-title">Context / Descriptive <span>bukan semua predictor</span></div><div class="amy-d-grid">
    ${cell(`HTF Swing · ${descriptive.htfSwing.timeframe || '-'}`, descriptive.htfSwing.direction, descriptive.htfSwing.fresh ? 'Fresh change' : 'Continuous state')}
    ${cell('Swing Structure', descriptive.swingStructure.direction, descriptive.swingStructure.fresh ? 'Fresh change' : 'Continuous state')}
    ${cell('Internal Structure', descriptive.internalStructure.direction, descriptive.internalStructure.fresh ? 'Fresh change' : 'Continuous state')}
    ${cell('Liquidity', descriptive.liquidity.direction, liquidityNote)}
    ${cell('Dealing Range', descriptive.dealingRange.location, `${descriptive.dealingRange.source} · descriptive-only`)}
    ${cell('Pattern', descriptive.pattern.name, descriptive.pattern.detectedOnSourceCandle ? 'Raw event baru' : 'Continuous/stale state')}
    ${cell('Final Bias', descriptive.finalBias.direction, descriptive.finalBias.fresh ? 'Fresh bias change' : 'Continuous descriptive bias')}
  </div></div>`;
}

function freshMarkup(d) {
  const descriptive = d.descriptive;
  const swing = eventValue(descriptive.swingStructure.event);
  const internal = eventValue(descriptive.internalStructure.event);
  const sweep = eventValue(descriptive.liquidity.rawSweep);
  return `<div class="amy-d-section"><div class="amy-d-section-title">Fresh Structural Evidence <span>candle sumber saja</span></div><div class="amy-d-grid">
    ${cell('Swing Event', descriptive.swingStructure.fresh ? swing.title : 'STALE / CONTINUOUS', descriptive.swingStructure.fresh ? swing.note : 'Tidak diperlakukan sebagai event baru')}
    ${cell('Internal Event', descriptive.internalStructure.fresh ? internal.title : 'STALE / CONTINUOUS', descriptive.internalStructure.fresh ? internal.note : 'Tidak diperlakukan sebagai event baru')}
    ${cell('Raw Sweep', descriptive.liquidity.rawSweep ? sweep.title : 'WAIT', descriptive.liquidity.rawSweep ? sweep.note : 'Tidak ada raw sweep baru')}
  </div></div>`;
}

function predictiveMarkup(d) {
  const predictive = d.predictive;
  const rawBreak = eventValue(predictive.rawValidBreak);
  const qualifiedBreak = eventValue(predictive.qualifiedValidBreak);
  const choch = eventValue(predictive.qualifiedChoch);
  const bos = eventValue(predictive.qualifiedBos);
  const bosNote = ['M5', 'M15', 'H1'].includes(d.tf) && !predictive.qualifiedBos
    ? 'Baseline riset N=0; tidak dibuat synthetic BOS.'
    : bos.note;
  return `<div class="amy-d-section"><div class="amy-d-section-title">Predictive / Event Signals <span>Amy-SMC-D baseline</span></div><div class="amy-d-grid">
    ${cell('', predictive.nextMove.signal)}
    ${cell('Sweep Continuation', predictive.sweepContinuation.active ? predictive.sweepContinuation.direction : 'WAIT', 'Tidak meng-invert Raw Sweep secara sembarang')}
    ${cell('Raw Valid Break', predictive.rawValidBreak ? rawBreak.title : 'WAIT', rawBreak.note)}
    ${cell('Qualified Valid Break', predictive.qualifiedValidBreak ? qualifiedBreak.title : 'WAIT', qualifiedBreak.note)}
    ${cell('Qualified CHoCH', predictive.qualifiedChoch ? choch.title : 'WAIT', choch.note)}
    ${cell('Qualified BOS', predictive.qualifiedBos ? bos.title : 'WAIT', bosNote)}
    ${cell('Raw Pattern', predictive.rawPattern.active ? predictive.rawPattern.name : 'WAIT', predictive.rawPattern.active ? predictive.rawPattern.direction : 'Tidak ada raw event baru')}
    ${cell('Qualified Pattern', predictive.qualifiedPattern.active ? predictive.qualifiedPattern.name : 'WAIT', predictive.qualifiedPattern.lowSample ? 'Low sample; bukan confidence probability' : 'Baseline-qualified event')}
  </div></div>`;
}

function marketOverviewMarkup(d) {
  return `<div class="amy-d-section"><div class="amy-d-section-title">Ringkasan Mapping</div><div class="amy-d-grid">
    ${cell('Final Bias', d.descriptive.finalBias.direction)}
    ${cell('', d.predictive.nextMove.signal)}
    ${cell('Dealing Range', d.descriptive.dealingRange.location)}
  </div></div>`;
}

function renderDashboardCard(result) {
  const d = result.amySmcD;
  const stale = Boolean(result.dataStale || result.dataDegraded);
  return `<section class="card amy-d-card dashboard-context-card" id="${CARD_ID}" data-market-intent-ready="true" data-stale="${stale}"><div class="amy-d-head"><div><div class="kicker">AMY-SMC-D · ${escapeHtml(d.tf)}</div><h2>Mapping candle tertutup</h2><span class="amy-d-badge">${stale ? 'LAST VALID CLOSED CANDLE' : 'CLOSED CANDLE'}</span></div><div class="amy-d-source">Candle sumber<br><b>${escapeHtml(wita(d.sourceCandle?.time))} WITA</b></div></div>
    ${marketOverviewMarkup(d)}
    <div class="amy-d-actions"><button class="action" type="button" data-amy-d-refresh>Perbarui Candle ${escapeHtml(d.tf)}</button></div>
  </section>`;
}

function renderAnalyzeCard(result) {
  const d = result.amySmcD;
  const stale = Boolean(result.dataStale || result.dataDegraded);
  const execution = result.setupExecution || {};
  return `<section class="card amy-d-card analyze-context-card" id="${CARD_ID}" data-market-intent-ready="true" data-stale="${stale}"><div class="amy-d-head"><div><div class="kicker">AMY-SMC-D · ${escapeHtml(d.tf)}</div><h2>Analisis Mapping</h2><span class="amy-d-badge">${stale ? 'LAST VALID CLOSED CANDLE' : 'CLOSED CANDLE'}</span></div><div class="amy-d-source">Candle sumber<br><b>${escapeHtml(wita(d.sourceCandle?.time))} WITA</b></div></div>
    ${marketOverviewMarkup(d)}
    <details class="professional-disclosure"><summary><span>Context & Fresh Evidence</span><small>Descriptive state dan event struktur baru</small></summary>${contextMarkup(d)}${freshMarkup(d)}</details>
    <details class="professional-disclosure"><summary><span>Predictive / Event Signals</span><small>Signal baseline Amy-SMC-D</small></summary>${predictiveMarkup(d)}</details>
    <div class="amy-d-note"><b>Rencana Eksekusi:</b> ${escapeHtml(execution.status || 'WAIT')}</div>
    <p class="muted">Diperbarui setelah candle berikutnya ditutup.</p>
    <div class="amy-d-actions"><button class="action" type="button" data-amy-d-refresh>Perbarui Candle ${escapeHtml(d.tf)}</button></div>
  </section>`;
}

function renderCard(tab, result) {
  if (!result?.amySmcD?.ready) return waitingMarkup();
  return tab === 'Dashboard' ? renderDashboardCard(result) : renderAnalyzeCard(result);
}

function bindCard(card) {
  if (!card || card.dataset.amySmcDBound === 'true') return;
  card.dataset.amySmcDBound = 'true';
  card.addEventListener('click', event => {
    const button = event.target.closest?.('[data-amy-d-refresh]');
    if (!button) return;
    button.disabled = true;
    const tf = window.state?.result?.tf || window.state?.tf || 'M15';
    Promise.resolve(window.runAnalysis?.(tf)).finally(() => {
      button.disabled = false;
      schedule();
    });
  });
}

function mount(markup, signature, ready) {
  const app = document.getElementById('app');
  if (!app) return false;
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const next = template.content.firstElementChild;
  if (!next) return false;
  let current = document.getElementById(CARD_ID);
  if (current?.dataset.marketIntentReady === 'true' && !ready) {
    const badge = current.querySelector('.amy-d-badge');
    if (badge) badge.textContent = 'MEMPERBARUI CANDLE';
    return false;
  }
  if (!current) {
    const anchor = app.querySelector('[data-stability-key="market-regime"]');
    if (anchor) anchor.replaceWith(next);
    else app.prepend(next);
    current = next;
  } else if (current.dataset.amySmcDSignature !== signature) {
    current.className = next.className;
    current.innerHTML = next.innerHTML;
    current.dataset.marketIntentReady = next.dataset.marketIntentReady || 'false';
    current.dataset.stale = next.dataset.stale || 'false';
  }
  current.dataset.amySmcDSignature = signature;
  bindCard(current);
  return true;
}

function renderSignature(result, state, tab) {
  const d = result?.amySmcD;
  return JSON.stringify({
    tab,
    m15: closedCandleFingerprint(state, 'M15'),
    tf: d?.tf || result?.tf || null,
    sourceTime: d?.sourceCandle?.time || 0,
    sourceClose: closedCandlePrice(result),
    sourceOhlc: d?.sourceCandle ? [d.sourceCandle.open, d.sourceCandle.high, d.sourceCandle.low, d.sourceCandle.close] : null,
    descriptive: d?.descriptive || null,
    predictive: d?.predictive || null,
    executionStatus: result?.setupExecution?.status || null,
    stale: Boolean(result?.dataStale || result?.dataDegraded)
  });
}

export function syncMarketIntentV3() {
  installStyle();
  const state = window.state || {};
  if (!['Dashboard', 'Analyze'].includes(state.tab)) {
    lastSignature = '';
    return false;
  }
  const result = state.result || null;
  const ready = Boolean(result?.amySmcD?.ready);
  const signature = renderSignature(result, state, state.tab);
  if (signature === lastSignature && document.getElementById(CARD_ID)?.dataset.amySmcDSignature === signature) return false;
  const changed = mount(renderCard(state.tab, result), signature, ready);
  lastSignature = signature;
  if (changed) {
    window.dispatchEvent(new CustomEvent('amyfx:market-intent-rendered', {
      detail: { timeframe: result?.tf || state.tf, sourceCandleTime: result?.amySmcD?.sourceCandle?.time || 0 }
    }));
  }
  return changed;
}

function runScheduledSync() {
  refreshFrame = 0;
  syncMarketIntentV3();
}

function schedule() {
  if (refreshFrame) return;
  refreshFrame = requestAnimationFrame(runScheduledSync);
}

function stop() {
  if (refreshFrame) cancelAnimationFrame(refreshFrame);
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
  ].forEach(name => window.addEventListener(name, schedule, { signal }));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule();
  }, { signal });
  window.addEventListener('pagehide', stop, { once: true, signal });
  schedule();
}

window.AmyFXMarketIntentUi = Object.freeze({
  version: '5.0.0',
  source: 'AMY_SMC_D',
  sync: syncMarketIntentV3,
  schedule,
  start,
  stop
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
