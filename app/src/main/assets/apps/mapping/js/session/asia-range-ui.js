import { state, p2 } from '../main.js';
import { calculateAsiaRange } from './asia-range.js';

const renderedMarkup = new WeakMap();
let syncQueued = false;

function currentRange() {
  try {
    return calculateAsiaRange(
      state.candles?.M15 || [],
      Number(state.price || localStorage.getItem('last_price') || 0),
      Date.now()
    );
  } catch (error) {
    console.error('Asia Range calculation failed:', error);
    return {
      valid: false,
      state: 'ERROR',
      windowLabel: '-',
      note: 'Asia Range gagal dimuat. Mapping utama tetap dapat digunakan.'
    };
  }
}

function statusClass(status) {
  return `status-${String(status || 'wait').toLowerCase().replaceAll(' ', '-')}`;
}

function levelMarkup(label, value, status) {
  return `<div class="asia-level ${statusClass(status)}">
    <small>${label}</small>
    <strong>${p2(value)}</strong>
    <span>${status}</span>
  </div>`;
}

function dashboardMarkup(range) {
  if (!range?.valid) {
    return `<div class="asia-range-head"><b>ASIA RANGE</b><small>${range?.windowLabel || '-'}</small></div>
      <div class="asia-range-empty">${range?.note || 'Data Asia Range belum tersedia.'}</div>`;
  }
  return `<div class="asia-range-head"><b>ASIA RANGE</b><small>${range.windowLabel}</small></div>
    <div class="asia-range-grid">
      ${levelMarkup('ASIA HIGH', range.high, range.highStatus)}
      ${levelMarkup('ASIA LOW', range.low, range.lowStatus)}
    </div>
    <div class="asia-range-summary">${range.summary}</div>`;
}

function analyzeMarkup(range) {
  if (!range?.valid) {
    return `<div class="asia-strip-head"><span>ASIA LIQUIDITY</span><small>${range?.windowLabel || '-'}</small></div>
      <div class="asia-range-empty">${range?.note || 'Data Asia Range belum tersedia.'}</div>`;
  }
  return `<div class="asia-strip-head"><span>ASIA LIQUIDITY</span><small>${range.windowLabel}</small></div>
    <div class="asia-strip-levels">
      <span>Asia High <b>${p2(range.high)}</b><em>${range.highStatus}</em></span>
      <span>Asia Low <b>${p2(range.low)}</b><em>${range.lowStatus}</em></span>
    </div>
    <div class="asia-range-summary">${range.summary}</div>`;
}

function setMarkupIfChanged(element, markup) {
  if (!element || renderedMarkup.get(element) === markup) return false;
  renderedMarkup.set(element, markup);
  element.innerHTML = markup;
  return true;
}

function mountDashboard(range) {
  const sessionCard = document.querySelector('.session-card');
  if (!sessionCard) return;
  let block = sessionCard.querySelector('[data-asia-range-dashboard]');
  if (!block) {
    block = document.createElement('div');
    block.className = 'asia-range-block';
    block.dataset.asiaRangeDashboard = '';
    const sessionPill = sessionCard.querySelector('.session-pill');
    if (sessionPill) sessionPill.insertAdjacentElement('afterend', block);
    else sessionCard.appendChild(block);
  }
  setMarkupIfChanged(block, dashboardMarkup(range));
}

function mountAnalyze(range) {
  const app = document.getElementById('app');
  const decisionCard = app?.querySelector('.decision-main')?.closest('.card');
  if (!decisionCard) return;
  let strip = app.querySelector('[data-asia-range-analyze]');
  if (!strip) {
    strip = document.createElement('section');
    strip.className = 'card asia-liquidity-strip';
    strip.dataset.asiaRangeAnalyze = '';
    decisionCard.insertAdjacentElement('afterend', strip);
  }
  setMarkupIfChanged(strip, analyzeMarkup(range));
}

export function syncAsiaRangeUi() {
  const range = currentRange();
  mountDashboard(range);
  mountAnalyze(range);
}

function scheduleAsiaRangeSync() {
  if (syncQueued) return;
  syncQueued = true;
  const run = () => {
    syncQueued = false;
    try {
      syncAsiaRangeUi();
    } catch (error) {
      console.error('Asia Range UI sync failed:', error);
    }
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 0);
}

const app = document.getElementById('app');
if (app) {
  new MutationObserver(scheduleAsiaRangeSync).observe(app, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleAsiaRangeSync, { once: true });
} else {
  scheduleAsiaRangeSync();
}

setInterval(scheduleAsiaRangeSync, 20_000);
