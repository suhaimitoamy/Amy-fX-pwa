import { calculateLiquidityDrawContext, LIQUIDITY_DRAW_CONTEXT_CONFIG } from './engine/liquidity-draw-context.js';

const CARD_ID = 'liquidity-draw-context-card';
let lastSignature = '';
let referenceFetchStarted = false;

function number(value, digits = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : '-';
}

function destinationText(value) {
  if (value === 'BSL') return 'BSL · Likuiditas Atas';
  if (value === 'SSL') return 'SSL · Likuiditas Bawah';
  return 'Belum ada target terkonfirmasi';
}

function statusText(context) {
  if (context.status === 'VALID') return 'TERKONFIRMASI';
  if (context.status === 'UNSUPPORTED') return 'TIMEFRAME TIDAK AKTIF';
  if (context.status === 'INSUFFICIENT_DATA') return 'MEMUAT DATA';
  return 'NETRAL';
}

async function ensureWeeklyReference() {
  const state = window.state || {};
  if (state.candles?.W1?.length || referenceFetchStarted) return;
  if (!state.candles?.M15?.length && !state.candles?.H1?.length) return;
  referenceFetchStarted = true;
  try {
    const { fetchTf } = await import('./api/market-data.js');
    await fetchTf('W1');
    lastSignature = '';
  } catch (_) {
    referenceFetchStarted = false;
  }
}

function contextFor(tf) {
  const state = window.state || {};
  return calculateLiquidityDrawContext({
    candles: state.candles?.[tf] || [],
    tf,
    h4Candles: state.candles?.H4 || [],
    dailyCandles: state.candles?.D1 || [],
    weeklyCandles: state.candles?.W1 || [],
    currentPrice: state.price
  });
}

function contextRow(context) {
  const valid = context.status === 'VALID';
  return `<article class="liquidity-draw-row ${valid ? 'is-valid' : 'is-abstain'}">
    <div class="liquidity-draw-row-head">
      <strong>${context.tf}</strong>
      <span>${statusText(context)}</span>
    </div>
    <div class="liquidity-draw-grid">
      <div><small>Destination</small><b>${destinationText(context.destination)}</b></div>
      <div><small>Target</small><b>${valid ? `${context.targetName} ${number(context.targetLevel)}` : '-'}</b></div>
      <div><small>Confidence model</small><b>${Number.isFinite(context.confidence) ? `${context.confidence}%` : '-'}</b></div>
      <div><small>Jarak</small><b>${valid ? `${number(context.distanceAtr)} ATR` : '-'}</b></div>
    </div>
    <p>${context.reason}</p>
  </article>`;
}

function overallSummary(contexts) {
  const valid = contexts.filter(item => item.status === 'VALID');
  if (!valid.length) {
    return 'Belum ada M15/H1 yang memenuhi confidence minimum 97%. Sistem tidak memaksa arah.';
  }
  if (valid.length === 2 && valid[0].destination === valid[1].destination) {
    return `M15 dan H1 sama-sama menunjuk ${destinationText(valid[0].destination)}. Ini merupakan target likuiditas terdekat.`;
  }
  if (valid.length === 2) {
    return 'M15 dan H1 berbeda destination. Context dianggap konflik dan tidak boleh diterjemahkan menjadi sinyal entry.';
  }
  return `${valid[0].tf} menunjuk ${destinationText(valid[0].destination)}; timeframe lain masih netral.`;
}

function cardHtml(contexts) {
  return `<section class="card liquidity-draw-card" id="${CARD_ID}" aria-label="Liquidity Draw context">
    <div class="liquidity-draw-title-row">
      <div>
        <div class="kicker">TARGET LIKUIDITAS TERDEKAT</div>
        <h2>Destination Context</h2>
      </div>
      <span class="liquidity-context-badge">KONTEKS ACUAN</span>
    </div>
    <p class="liquidity-draw-summary">${overallSummary(contexts)}</p>
    <div class="liquidity-draw-rows">${contexts.map(contextRow).join('')}</div>
    <div class="liquidity-draw-footnote">
      Threshold tetap <b>${LIQUIDITY_DRAW_CONTEXT_CONFIG.threshold}%</b> · horizon riset 72 jam · bukan BUY/SELL, bukan entry, bukan SL/TP.
    </div>
  </section>`;
}
}

function findAnchor() {
  const app = document.getElementById('app');
  if (!app) return null;
  if (window.state?.tab === 'Dashboard') return app.querySelector('.tf-card');
  if (window.state?.tab === 'Analyze') return app.querySelector(':scope > .card');
  return null;
}

function syncLiquidityDrawCard() {
  void ensureWeeklyReference();
  const anchor = findAnchor();
  const existing = document.getElementById(CARD_ID);
  if (!anchor) {
    existing?.remove();
    lastSignature = '';
    return;
  }

  const contexts = ['M15', 'H1'].map(contextFor);
  const signature = JSON.stringify(contexts.map(item => ({
    tf: item.tf,
    status: item.status,
    destination: item.destination,
    targetLevel: item.targetLevel,
    confidence: item.confidence,
    distanceAtr: item.distanceAtr,
    reason: item.reason,
    calculatedAt: item.calculatedAt
  })));

  if (existing && signature === lastSignature) return;
  const html = cardHtml(contexts);
  if (existing) {
    if (existing.outerHTML !== html) existing.outerHTML = html;
  } else {
    anchor.insertAdjacentHTML('afterend', html);
  }
  lastSignature = signature;
}

function start() {
  syncLiquidityDrawCard();
  setInterval(syncLiquidityDrawCard, 1500);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncLiquidityDrawCard();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
