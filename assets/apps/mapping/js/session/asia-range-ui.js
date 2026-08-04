import { state, p2 } from '../main.js';
import {
  calculateAsiaRange,
  nextAsiaSessionBoundary
} from './asia-range.js';

const renderedMarkup = new WeakMap();
let syncQueued = false;
let observer = null;
let boundaryTimer = 0;
let lifecycleController = null;

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
  if (!app || state.tab !== 'Analyze') return;
  const explanation = [...app.querySelectorAll('details.disclosure')].find(item =>
    item.querySelector(':scope > summary')?.textContent?.trim() === 'Penjelasan Mapping'
  );
  const anchor = explanation || app.querySelector('#amy-execution-plan-detail') || app.firstElementChild;
  if (!anchor) return;
  let strip = app.querySelector('[data-asia-range-analyze]');
  if (!strip) {
    strip = document.createElement('section');
    strip.className = 'card asia-liquidity-strip';
    strip.dataset.asiaRangeAnalyze = '';
  }
  if (anchor.nextElementSibling !== strip) anchor.insertAdjacentElement('afterend', strip);
  setMarkupIfChanged(strip, analyzeMarkup(range));
}

function syncClarityAsiaWindow(range) {
  const label = String(range?.windowLabel || '').trim();
  if (!label) return;

  const canonicalAsia = state.result?.marketOutlook?.canonicalAsia;
  if (canonicalAsia && canonicalAsia.window !== label) canonicalAsia.window = label;

  document.querySelectorAll('.clarity-note > b').forEach(node => {
    if (!String(node.textContent || '').startsWith('Asia Session Context')) return;
    const next = `Asia Session Context · ${label}`;
    if (node.textContent !== next) node.textContent = next;
  });
}

function scheduleBoundarySync() {
  clearTimeout(boundaryTimer);
  boundaryTimer = 0;
  const now = Date.now();
  const boundary = nextAsiaSessionBoundary(now);
  const delay = Math.max(1000, Math.min(2_147_000_000, boundary - now + 1000));
  boundaryTimer = setTimeout(() => {
    boundaryTimer = 0;
    scheduleAsiaRangeSync();
  }, delay);
}

export function syncAsiaRangeUi() {
  const range = currentRange();
  mountDashboard(range);
  mountAnalyze(range);
  syncClarityAsiaWindow(range);
  scheduleBoundarySync();
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

function stop() {
  observer?.disconnect();
  observer = null;
  lifecycleController?.abort();
  lifecycleController = null;
  clearTimeout(boundaryTimer);
  boundaryTimer = 0;
  syncQueued = false;
}

function start() {
  if (lifecycleController) return;
  const app = document.getElementById('app');
  lifecycleController = new AbortController();
  const signal = lifecycleController.signal;

  if (app) {
    observer = new MutationObserver(scheduleAsiaRangeSync);
    observer.observe(app, { childList: true, subtree: false });
  }

  window.addEventListener('amyfx:live-price-display', scheduleAsiaRangeSync, { signal });
  window.addEventListener('amyfx:candles-updated', scheduleAsiaRangeSync, { signal });
  window.addEventListener('amyfx:mapping-ui-rendered', scheduleAsiaRangeSync, { signal });
  window.addEventListener('amyfx:mapping-state-change', scheduleAsiaRangeSync, { signal });
  window.addEventListener('storage', event => {
    if (event.key === 'last_price' || event.key === 'last_ws_tick_at') scheduleAsiaRangeSync();
  }, { signal });
  window.addEventListener('pagehide', stop, { once: true, signal });
  scheduleAsiaRangeSync();
}

window.AmyFXAsiaRangeUiLifecycle = Object.freeze({
  version: '2.1.0',
  start,
  stop,
  schedule: scheduleAsiaRangeSync
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
