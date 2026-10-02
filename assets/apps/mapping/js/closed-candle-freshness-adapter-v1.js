import { state, p2 } from './main.js';
import { inspectClosedCandleSource } from './engine/closed-candle-source-state.js';

let queued = false;
let busy = false;

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const positive = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

function closedCandle(timeframe) {
  const candles = Array.isArray(state.candles?.[timeframe]) ? state.candles[timeframe] : [];
  return [...candles].reverse().find(candle => candle?.isClosed !== false) || null;
}

function sourceContext(snapshot) {
  const authority = snapshot?.scalperAuthority || snapshot?.structure?.authority || {};
  const candidates = [
    authority.anchorTimeframe,
    ...(Array.isArray(authority.sources) ? authority.sources : []),
    'M15', 'M5', 'M1', 'M30', 'H1',
    state.tf
  ].filter(Boolean);

  for (const timeframe of [...new Set(candidates)]) {
    const candle = closedCandle(timeframe);
    if (candle) {
      return {
        sourceTf: timeframe,
        candle,
        sourceState: inspectClosedCandleSource(
          timeframe,
          state.candles?.[timeframe] || []
        )
      };
    }
  }
  const sourceTf = state.tf || 'M15';
  return {
    sourceTf,
    candle: null,
    sourceState: inspectClosedCandleSource(sourceTf, [])
  };
}

function wita(candle) {
  const raw = Number(candle?.time || 0);
  if (!(raw > 0)) return 'Belum ada candle tertutup';
  const milliseconds = raw > 1e11 ? raw : raw * 1000;
  return `${new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(milliseconds)).replace('.', ':')} WITA`;
}

function officialSetupActive() {
  const execution = state.result?.setupExecution;
  return Boolean(
    execution
    && execution.active === true
    && execution.terminal !== true
    && execution.invalidated !== true
  );
}

function normalizedContext() {
  const snapshot = window.AmyFXMappingClarity?.snapshot?.() || {};
  const structure = snapshot.structure || {};
  const direction = structure.direction === 'BULLISH'
    ? 'BUY'
    : structure.direction === 'BEARISH'
      ? 'SELL'
      : null;
  const { sourceTf, candle, sourceState } = sourceContext(snapshot);
  const result = state.result || {};
  const invalidation = positive(structure.invalidation);
  const bsl = positive(result.bsl);
  const ssl = positive(result.ssl);
  const watchLevel = direction === 'BUY' ? ssl : direction === 'SELL' ? bsl : null;
  const targetLevel = direction === 'BUY' ? bsl : direction === 'SELL' ? ssl : null;
  const watchType = direction === 'BUY' ? 'SSL' : direction === 'SELL' ? 'BSL' : null;
  const targetType = direction === 'BUY' ? 'BSL' : direction === 'SELL' ? 'SSL' : null;
  const currentPrice = positive(state.price) || positive(result.price);
  const directionLabel = direction
    ? String(structure.label || structure.direction || direction)
    : 'Arah scalping belum jelas';
  const trigger = direction === 'BUY'
    ? 'Tunggu SSL sweep → reclaim → MSS bullish → candle close.'
    : direction === 'SELL'
      ? 'Tunggu BSL sweep → reclaim → MSS bearish → candle close.'
      : 'Tunggu M15/M5/M1 membentuk arah dan struktur yang jelas.';
  const invalidationText = invalidation
    ? structure.rule || `Batal bila protected structure ${p2(invalidation)} ditembus oleh candle close.`
    : 'Protected structure belum tersedia; entry tetap WAIT.';

  return {
    snapshot,
    structure,
    direction,
    directionLabel,
    sourceTf,
    sourceText: wita(candle),
    sourceCandle: candle,
    sourceState,
    hasClosedCandle: Boolean(candle),
    sourceCurrent: Boolean(candle && sourceState?.current),
    sourceDelayed: Boolean(candle && sourceState?.delayed),
    currentPrice,
    watchLevel,
    watchType,
    targetLevel,
    targetType,
    trigger,
    invalidation,
    invalidationText
  };
}

function patchFreshnessLabels(context) {
  const connection = document.getElementById('conn');
  if (connection) {
    connection.dataset.analysisFreshness = context.sourceDelayed
      ? 'PROVIDER_DELAYED'
      : context.hasClosedCandle
        ? 'CLOSED_CANDLE'
        : 'UNAVAILABLE';
    connection.classList.toggle('stale', context.sourceDelayed);
  }

  document.querySelectorAll('#mapping-command-strip *').forEach(node => {
    if (node.children.length) return;
    const text = String(node.textContent || '').trim().toUpperCase();
    if (!['STALE', 'EXPIRED', 'DATA USANG'].includes(text)) return;
    node.textContent = context.sourceDelayed
      ? `CANDLE TERTUNDA ${context.sourceState?.lagBars || '?'} BAR`
      : context.hasClosedCandle
        ? 'CANDLE TERTUTUP'
        : 'MENUNGGU DATA';
    node.classList.remove('expired');
    node.classList.toggle('stale', context.sourceDelayed);
    node.classList.toggle('live', context.sourceCurrent);
    node.classList.toggle('waiting', !context.sourceCurrent);
  });
}

function compactMarkup(context) {
  const tone = context.direction === 'BUY' ? 'buy' : context.direction === 'SELL' ? 'sell' : 'wait';
  const focusLabel = context.direction ? `Cari peluang ${context.direction}` : 'Menunggu arah scalping';
  const watch = context.watchLevel
    ? `${context.watchType} ${p2(context.watchLevel)}`
    : 'Belum tersedia dari liquidity Mapping.';
  const source = context.sourceDelayed
    ? `Basis candle terakhir tertutup · ${context.sourceTf} · ${context.sourceText} · provider tertinggal ${context.sourceState?.lagBars || '?'} bar`
    : context.hasClosedCandle
      ? `Basis candle terakhir tertutup · ${context.sourceTf} · ${context.sourceText}`
      : 'Belum ada candle tertutup yang dapat digunakan.';

  return `<div class="execution-plan__head">
      <div><div class="kicker">RENCANA EKSEKUSI</div><h2>WAIT — ${context.direction ? `PANTAU ${context.direction}` : 'MENUNGGU ARAH'}</h2></div>
      <span class="execution-badge execution-badge--${tone}">WAIT</span>
    </div>
    <div class="execution-summary">
      <div><span>Fokus</span><strong>${esc(focusLabel)}</strong></div>
      <div><span>Area pantauan</span><strong>${esc(watch)}</strong></div>
      <div><span>Sedang menunggu</span><strong>${esc(context.trigger)}</strong></div>
      <div><span>Arah scalping</span><strong>${esc(context.directionLabel)}</strong></div>
      <div><span>Invalidasi</span><strong>${esc(context.invalidationText)}</strong></div>
    </div>
    <div class="execution-freshness execution-freshness--${context.sourceCurrent ? 'live' : 'waiting'}">${esc(source)}</div>
    <div class="execution-actions">
      <button type="button" class="action execution-action" data-execution-plan-action="detail">Lihat Rencana Lengkap</button>
      <button type="button" class="action execution-action execution-action--amy" data-execution-plan-action="ask-amy">Tanya Amy Kenapa Masih WAIT</button>
    </div>`;
}

function detailMarkup(context) {
  const tone = context.direction === 'BUY' ? 'buy' : context.direction === 'SELL' ? 'sell' : 'wait';
  const focusLabel = context.direction ? `Cari peluang ${context.direction}` : 'Menunggu arah scalping';
  const watch = context.watchLevel
    ? `${context.watchType} ${p2(context.watchLevel)}`
    : 'Belum tersedia dari liquidity Mapping.';
  const target = context.targetLevel
    ? `${context.targetType} ${p2(context.targetLevel)}`
    : 'Belum tersedia dari target struktural Mapping.';
  const source = context.sourceDelayed
    ? `Basis candle terakhir tertutup · ${context.sourceTf} · ${context.sourceText} · provider tertinggal ${context.sourceState?.lagBars || '?'} bar`
    : context.hasClosedCandle
      ? `Basis candle terakhir tertutup · ${context.sourceTf} · ${context.sourceText}`
      : 'Belum ada candle tertutup yang dapat digunakan.';

  return `<div class="execution-plan__head">
      <div><div class="kicker">RENCANA EKSEKUSI</div><h2>WAIT — ${context.direction ? `PANTAU ${context.direction}` : 'MENUNGGU ARAH'}</h2></div>
      <span class="execution-badge execution-badge--${tone}">WAIT</span>
    </div>
    <div class="execution-detail-grid">
      <div><small>Arah yang diprioritaskan</small><strong>${esc(focusLabel)}</strong></div>
      <div><small>Harga saat ini</small><strong>${context.currentPrice ? p2(context.currentPrice) : 'Belum tersedia'}</strong></div>
      <div class="execution-detail-wide"><small>Konteks</small><strong>${esc(context.directionLabel)}</strong><p>M15 menjadi arah utama, M5 membaca struktur entry, dan M1 menjadi trigger. M30/H1 hanya fallback; H4/D1 tidak menentukan arah scalping.</p></div>
      <div class="execution-detail-wide"><small>Area pantauan</small><strong>${esc(watch)}</strong></div>
    </div>
    <div class="execution-list-block"><h3>Trigger yang harus ditunggu</h3><ul><li>${esc(context.trigger)}</li><li>Entry tetap WAIT sampai setup resmi terkunci.</li></ul></div>
    <div class="execution-level-grid">
      <div><small>Entry</small><strong>Belum tersedia</strong></div>
      <div><small>Stop Loss</small><strong>Belum dikunci oleh setup</strong></div>
      <div><small>TP1</small><strong>Belum tersedia</strong></div>
      <div><small>TP2</small><strong>Belum tersedia</strong></div>
      <div><small>RR</small><strong>Belum tersedia</strong></div>
      <div><small>Target struktural</small><strong>${esc(target)}</strong></div>
    </div>
    <div class="execution-invalidation"><h3>Invalidasi</h3><p>${esc(context.invalidationText)}</p></div>
    <div class="execution-list-block"><h3>Alasan masih WAIT</h3><ul><li>Arah scalping tetap ditampilkan dari candle terakhir yang sudah close.</li><li>Belum ada entry, SL, dan target resmi yang terkunci.</li><li>Freshness tetap menjadi proteksi internal, tetapi tidak menghapus analisis terakhir dari UI.</li></ul></div>
    <div class="execution-conclusion"><small>KESIMPULAN SEDERHANA</small><strong>${esc(context.direction ? `Fokus ${context.direction}, tetapi tunggu trigger resmi.` : 'Tunggu arah M15/M5/M1 menjadi jelas.')}</strong></div>
    <div class="execution-freshness execution-freshness--${context.sourceCurrent ? 'live' : 'waiting'}">${esc(source)}</div>
    <div class="execution-actions"><button type="button" class="action execution-action execution-action--amy" data-execution-plan-action="ask-amy">Tanya Amy Kenapa Masih WAIT</button></div>`;
}

function patchCard(card, context) {
  if (!card || officialSetupActive()) return;
  const signature = JSON.stringify([
    context.direction,
    context.directionLabel,
    context.sourceTf,
    context.sourceText,
    context.currentPrice,
    context.watchLevel,
    context.targetLevel,
    context.invalidation,
    context.hasClosedCandle,
    context.sourceCurrent,
    context.sourceState?.lagBars
  ]);
  if (card.dataset.closedCandleSignature === signature) return;
  card.dataset.closedCandleSignature = signature;
  card.classList.remove('execution-plan--buy', 'execution-plan--sell', 'execution-plan--wait');
  card.classList.add(`execution-plan--${context.direction === 'BUY' ? 'buy' : context.direction === 'SELL' ? 'sell' : 'wait'}`);
  card.innerHTML = card.dataset.executionPlanCard === 'compact'
    ? compactMarkup(context)
    : detailMarkup(context);
}

function sync() {
  queued = false;
  if (busy) return;
  busy = true;
  try {
    const context = normalizedContext();
    patchFreshnessLabels(context);
    document.querySelectorAll('[data-execution-plan-card]').forEach(card => patchCard(card, context));
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
  const app = document.getElementById('app');
  if (app) {
    new MutationObserver(records => {
      if (records.some(record => record.target === app)) schedule();
    }).observe(app, { childList: true, subtree: false });
  }
  [
    'amyfx:candles-updated',
    'amyfx:mapping-state-change',
    'amyfx:entry-watch-updated',
    'amyfx:execution-authority-updated'
  ].forEach(name => window.addEventListener(name, schedule));
  schedule();
}

window.AmyFXClosedCandleFreshness = Object.freeze({
  version: '1.1.0',
  refresh: schedule,
  snapshot: normalizedContext
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
