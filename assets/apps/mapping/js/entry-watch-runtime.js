import { detectMarketConcepts } from './engine/concept-engine.js';
import { evaluateValidatedMarketContext } from './engine/validated-market-context.js';
import {
  calculateMultiTimeframeEntryWatch,
  normalizeEntryDirection,
  ENTRY_WATCH_CONFIG
} from './engine/entry-watch-engine.js';

const STORAGE_KEY = 'amy_entry_watch_state_v2';
const LEGACY_STORAGE_KEY = 'amy_entry_watch_state_v1';
const NOTIFY_KEY = 'amy_entry_watch_notified_v2';
const CARD_ID = 'amy-entry-watch-card';
const WATCH_TFS = ['M5', 'M15', 'H1', 'H4'];
const FORECAST_TFS = ['M15', 'H1', 'M5'];
let previous = readJson(STORAGE_KEY, null);
let lastSignature = '';
let lastScannerKey = '';
let syncRunning = false;

if (!previous) {
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (_) {}
}

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch (_) { return fallback; }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

function finite(value, fallback = NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function price(value) {
  const number = finite(value);
  return Number.isFinite(number) ? number.toFixed(2) : '-';
}

function safe(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function activeForecastFor(tf, state) {
  const candles = state?.candles?.[tf] || [];
  if (candles.length < 100) return null;
  const context = evaluateValidatedMarketContext({
    candles,
    tf,
    htfCandles: { H4: state?.candles?.H4 || [] }
  });
  const forecast = context?.directionForecast;
  if (!forecast?.active || forecast.invalidated || forecast.expired) return null;
  const direction = normalizeEntryDirection(forecast.direction);
  return direction === 'WAIT' ? null : { tf, direction, context, forecast };
}

function resolveForecast(state) {
  if (!state?.result || state.result.dataStale) return null;
  const currentTf = FORECAST_TFS.includes(state.tf) ? state.tf : null;
  if (currentTf) {
    const current = activeForecastFor(currentTf, state);
    if (current) return current;
  }
  const active = FORECAST_TFS.map(tf => activeForecastFor(tf, state)).filter(Boolean);
  const directions = [...new Set(active.map(item => item.direction))];
  if (directions.length !== 1) return null;
  return active.find(item => item.tf === 'M15') || active.find(item => item.tf === 'H1') || active[0] || null;
}

function conceptsForTimeframes(state) {
  const htfCandles = {
    H4: state?.candles?.H4 || [],
    D1: state?.candles?.D1 || [],
    W1: state?.candles?.W1 || []
  };
  const currentPrice = finite(state?.price, finite(state?.result?.price));
  const output = {};
  for (const tf of WATCH_TFS) {
    const candles = state?.candles?.[tf] || [];
    if (candles.length < 30) continue;
    try {
      output[tf] = detectMarketConcepts(candles, {
        tf,
        currentPrice,
        htfCandles,
        htfBias: 'NEUTRAL'
      });
    } catch (_) {}
  }
  return output;
}

function setupFromEntryWatch(watch, currentPrice) {
  if (!watch?.entryAllowed || watch.lifecycleStage !== 'ENTRY_TRIGGERED') return null;
  const atr = Math.max(finite(watch.atr, 0), Math.abs(finite(watch.top, 0) - finite(watch.bottom, 0)), 0.10);
  const entryPrice = finite(watch.entryPrice, finite(currentPrice, watch.level));
  const livePrice = finite(currentPrice, entryPrice);
  const width = Math.max(atr * 0.04, 0.05);
  const entryLow = Math.min(entryPrice, livePrice) - width;
  const entryHigh = Math.max(entryPrice, livePrice) + width;
  const isBuy = watch.direction === 'BUY';
  const sl = isBuy ? watch.level - atr * 0.15 : watch.level + atr * 0.15;
  const tp1 = isBuy ? entryHigh + atr : entryLow - atr;
  const tp2 = isBuy ? entryHigh + atr * 2 : entryLow - atr * 2;
  return {
    dir: watch.direction,
    direction: watch.direction,
    type: `${watch.sourceKind} SWEEP ENTRY`,
    tf: watch.triggerTf,
    sourceTf: watch.sourceTf,
    entryLow,
    entryHigh,
    entry: entryPrice,
    sl,
    tp1,
    tp2,
    singleTarget: false,
    timestamp: finite(watch.entryTime, Date.now() / 1000) * 1000,
    entryStyle: 'MULTI_TF_LEVEL_SWEEP',
    watchId: watch.id,
    watchLevel: watch.level,
    sourceKind: watch.sourceKind,
    triggerTf: watch.triggerTf,
    status: 'ENTRY TRIGGERED',
    reason: `${watch.sourceTf} ${watch.sourceLabel} disapu pada ${watch.triggerTf} setelah fase pantau dan candle close kembali. Direction Forecast tetap ${watch.direction}.`,
    validationStatus: 'ARMED_SWEEP_CLOSE_RECLAIM',
    riskModel: 'ENGINEERING_DEFAULT_NOT_BACKTESTED'
  };
}

function attachToResult(state, watch, forecast) {
  const result = state?.result;
  if (!result) return;
  if (result.entryMap && !result.legacyEntryMap) result.legacyEntryMap = result.entryMap;
  if (result.entryMap) result.entryMap = { ...result.entryMap, setup: null, activeSetup: null, status: 'REPLACED_BY_MULTI_TF_LEVEL_WATCH' };
  result.experimentalBestSetup = null;
  result.experimentalSetups = [];
  if (forecast?.context) {
    result.validatedMarketContext = forecast.context;
    result.validatedMarketState = forecast.context.marketState;
    result.validatedDirectionForecast = forecast.context.directionForecast;
  }
  result.entryWatch = { ...watch, forecastTf: forecast?.tf || null, forecastConfidence: forecast?.forecast?.confidence || 0 };
  const setup = setupFromEntryWatch(watch, state.price || result.price);
  result.bestSetup = setup;
  result.setups = setup ? [setup] : [];
  result.directionDecision = null;
  result.setupExecution = null;
  result.mappingExplanation = null;
  if (setup) {
    const exists = Array.isArray(state.setups) && state.setups.some(item => item?.watchId === setup.watchId && item?.timestamp === setup.timestamp);
    if (!exists) state.setups = [setup, ...(state.setups || [])].slice(0, 50);
  }
}

function dataStaleWatch(state) {
  return {
    ...(previous || {}),
    version: '1.1.0',
    model: 'AMY_MULTI_TF_LEVEL_WATCH',
    direction: previous?.direction || 'WAIT',
    status: 'DATA USANG — ENTRY WATCH DINONAKTIFKAN',
    lifecycleStage: 'DATA_STALE',
    active: false,
    terminal: true,
    entryAllowed: false,
    reason: 'Cache kedaluwarsa dan API gagal diperbarui. Tidak ada entry atau scanner aktif.',
    updatedAt: Date.now()
  };
}

function notificationData(watch) {
  if (watch.lifecycleStage === 'ENTRY_TRIGGERED') {
    return {
      title: `AMY FX — ENTRY ${watch.direction}`,
      body: `${watch.triggerTf} sweep ${price(watch.level)} lalu close kembali setelah level di-arm. Level berasal dari ${watch.sourceTf} ${watch.sourceLabel}.`
    };
  }
  if (watch.lifecycleStage === 'VALID_BREAK') {
    return {
      title: `AMY FX — ${watch.direction} BATAL`,
      body: `${watch.sourceTf} close menembus ${price(watch.level)}. ${watch.transitionText || 'Level berubah menjadi Valid Break'}.`
    };
  }
  if (watch.lifecycleStage === 'FORECAST_PAUSED') {
    return {
      title: 'AMY FX — ENTRY WATCH DI-PAUSE',
      body: `Forecast tidak aktif. ${watch.sourceTf} ${watch.sourceLabel} tetap direkonsiliasi, tetapi entry dinonaktifkan.`
    };
  }
  if (watch.lifecycleStage === 'ENTRY_SPENT') {
    return {
      title: 'AMY FX — LEVEL SUDAH DIPAKAI',
      body: `${watch.sourceTf} ${watch.sourceLabel} sudah menghasilkan satu entry dan menunggu level baru.`
    };
  }
  if (['LEVEL_EXPIRED', 'LEVEL_RETIRED', 'FORECAST_CHANGED'].includes(watch.lifecycleStage)) {
    return {
      title: 'AMY FX — LEVEL DITUTUP',
      body: watch.reason || 'Level lama tidak lagi sah untuk entry.'
    };
  }
  return {
    title: `AMY FX — PANTAU ${watch.direction}`,
    body: `${watch.sourceTf} ${watch.sourceLabel} di ${price(watch.level)}. Sweep ${watch.triggerTf} setelah armed = entry; close ${watch.sourceTf} menembus level = batal.`
  };
}

function sendNotification(watch) {
  const allowed = new Set(['WATCHING_LEVEL', 'ENTRY_TRIGGERED', 'VALID_BREAK', 'FORECAST_PAUSED', 'ENTRY_SPENT', 'LEVEL_EXPIRED', 'LEVEL_RETIRED', 'FORECAST_CHANGED']);
  if (!allowed.has(watch?.lifecycleStage)) return;
  const store = readJson(NOTIFY_KEY, {});
  const key = `${watch.id || 'WAIT'}:${watch.lifecycleStage}:${watch.sourceCandleTime || 0}:${watch.triggerCandleTime || 0}`;
  if (store[key]) return;
  store[key] = Date.now();
  const recent = Object.fromEntries(Object.entries(store).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 80));
  writeJson(NOTIFY_KEY, recent);
  const data = notificationData(watch);
  const route = `${location.href.split('#')[0]}#Analyze`;
  if (window.Android?.showNotificationWithUrl) {
    window.Android.showNotificationWithUrl(data.title, data.body, route);
  } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    const notification = new Notification(data.title, { body: data.body, tag: `amy-entry-watch-${watch.id || watch.lifecycleStage}` });
    notification.onclick = () => { window.focus(); window.setTab?.('Analyze'); };
  }
}

function syncScanner(watch) {
  if (!window.Android?.startBackgroundScanner) return;
  const shouldScan = Boolean(watch?.active && !watch.entryAllowed && ['WATCHING_LEVEL', 'LEVEL_TESTING'].includes(watch.lifecycleStage));
  if (!shouldScan) {
    if (lastScannerKey !== 'NONE') {
      lastScannerKey = 'NONE';
      window.Android?.stopBackgroundScanner?.();
    }
    return;
  }
  const upper = watch.direction === 'SELL' ? watch.level : 0;
  const lower = watch.direction === 'BUY' ? watch.level : 0;
  const key = `${watch.id}:${watch.direction}:${price(watch.level)}`;
  if (key === lastScannerKey) return;
  lastScannerKey = key;
  window.Android.startBackgroundScanner('amyfx-proxy', String(upper), String(lower));
}

function lifecycleHtml(watch) {
  const stage = watch.lifecycleStage;
  const watched = !['WAIT_LEVEL', 'WAIT_DIRECTION'].includes(stage);
  const entry = stage === 'ENTRY_TRIGGERED' || stage === 'ENTRY_SPENT';
  const spent = stage === 'ENTRY_SPENT';
  const broken = stage === 'VALID_BREAK';
  const steps = [
    ['LEVEL', true, false],
    ['PANTAU', watched, false],
    ['SWEEP / ENTRY', entry, broken],
    ['SPENT', spent, false],
    ['VALID BREAK', broken, false],
    ['iFVG / BB', broken && Boolean(watch.transformed), false]
  ];
  return `<div class="entry-watch-lifecycle">${steps.map(([label, active, invalid]) =>
    `<div class="${invalid ? 'invalid' : active ? 'active' : 'locked'}"><span>${invalid ? '×' : active ? '●' : '○'}</span><small>${label}</small></div>`
  ).join('')}</div>`;
}

function statusClass(watch) {
  if (watch.lifecycleStage === 'ENTRY_TRIGGERED') return 'entry';
  if (watch.lifecycleStage === 'VALID_BREAK') return 'break';
  if (watch.lifecycleStage === 'LEVEL_TESTING') return 'testing';
  if (['ENTRY_SPENT', 'LEVEL_EXPIRED', 'LEVEL_RETIRED', 'FORECAST_CHANGED', 'DATA_STALE'].includes(watch.lifecycleStage)) return 'break';
  return 'watch';
}

function actionText(watch) {
  if (watch.lifecycleStage === 'ENTRY_TRIGGERED') return `ENTRY ${watch.direction}`;
  if (watch.lifecycleStage === 'VALID_BREAK') return `BATAL ${watch.direction}`;
  if (watch.lifecycleStage === 'FORECAST_PAUSED') return 'PAUSE';
  if (watch.lifecycleStage === 'ENTRY_SPENT') return 'ENTRY SPENT';
  if (['LEVEL_EXPIRED', 'LEVEL_RETIRED', 'FORECAST_CHANGED', 'DATA_STALE'].includes(watch.lifecycleStage)) return 'DITUTUP';
  return `PANTAU ${watch.direction}`;
}

function watchCardHtml(watch) {
  const zone = watch.bottom !== watch.top ? `${price(watch.bottom)}–${price(watch.top)}` : price(watch.level);
  const transformed = watch.transformed
    ? `<div class="entry-watch-transition"><b>Perubahan fungsi level</b><span>${safe(watch.sourceKind)} → ${safe(watch.transformed.sourceKind)}</span><small>Arah pantauan baru: ${safe(watch.transformed.direction)}</small></div>`
    : '';
  const candidates = (watch.candidates || []).slice(0, 4).map(candidate =>
    `<span>${safe(candidate.sourceTf)} ${safe(candidate.sourceKind)} · ${price(candidate.level)}</span>`
  ).join('');
  return `<section class="card entry-watch-card ${statusClass(watch)}" id="${CARD_ID}">
    <div class="entry-watch-head"><div><div class="kicker">MULTI-TIMEFRAME ENTRY WATCH</div><h2>${safe(watch.status)}</h2></div><span class="entry-watch-badge">${safe(actionText(watch))}</span></div>
    ${lifecycleHtml(watch)}
    <div class="entry-watch-grid">
      <div><small>Arah</small><strong>${safe(watch.direction)}</strong></div>
      <div><small>Level Asal</small><strong>${safe(watch.sourceTf)} · ${safe(watch.sourceLabel)}</strong></div>
      <div><small>Area / Level</small><strong>${zone}</strong></div>
      <div><small>Trigger Sweep</small><strong>${safe(watch.triggerTf)}</strong></div>
      <div><small>Entry</small><strong>Setelah armed: wick sweep + close kembali</strong></div>
      <div><small>Batal</small><strong>Replay close ${safe(watch.sourceTf)} menembus ${price(watch.level)}</strong></div>
    </div>
    <p class="entry-watch-reason">${safe(watch.reason)}</p>
    ${transformed}
    ${candidates ? `<div class="entry-watch-candidates"><small>Level berikutnya</small>${candidates}</div>` : ''}
    <div class="entry-watch-footnote">${safe(ENTRY_WATCH_CONFIG.entryRule)} · ${safe(ENTRY_WATCH_CONFIG.breakRule)}</div>
  </section>`;
}

function hideLegacyCards(show) {
  const setupFocus = document.querySelector('.setup-focus');
  if (setupFocus) setupFocus.style.display = show ? 'none' : '';
  document.querySelectorAll('#app > section.card').forEach(section => {
    if (section.id === CARD_ID) return;
    const kicker = section.querySelector('.kicker')?.textContent?.trim();
    if (kicker === 'AMY FX DECISION') section.style.display = show ? 'none' : '';
  });
}

function syncCard(watch) {
  const existing = document.getElementById(CARD_ID);
  const visible = watch && watch.direction !== 'WAIT' && !['WAIT_DIRECTION', 'WAIT_LEVEL'].includes(watch.lifecycleStage);
  hideLegacyCards(Boolean(visible));
  if (!visible) {
    existing?.remove();
    return;
  }
  const app = document.getElementById('app');
  if (!app) return;
  const anchor = window.state?.tab === 'Dashboard'
    ? app.querySelector('.tf-card')
    : app.querySelector(':scope > .card');
  if (!anchor) return;
  const html = watchCardHtml(watch);
  if (existing) {
    if (existing.outerHTML !== html) existing.outerHTML = html;
  } else {
    anchor.insertAdjacentHTML('afterend', html);
  }
}

function signatureOf(watch, forecast) {
  return JSON.stringify({
    id: watch?.id,
    stage: watch?.lifecycleStage,
    status: watch?.status,
    level: watch?.level,
    sourceCandleTime: watch?.sourceCandleTime,
    triggerCandleTime: watch?.triggerCandleTime,
    direction: watch?.direction,
    transformed: watch?.transformed?.id,
    forecastTf: forecast?.tf
  });
}

function persistAndRender(state, watch, forecast) {
  if (!watch) return;
  const signature = signatureOf(watch, forecast);
  attachToResult(state, watch, forecast);
  previous = watch;
  writeJson(STORAGE_KEY, watch);
  syncScanner(watch);
  if (signature !== lastSignature) {
    lastSignature = signature;
    sendNotification(watch);
    try { window.render?.(); } catch (_) {}
  }
  syncCard(watch);
}

function sync() {
  if (syncRunning) return;
  syncRunning = true;
  try {
    const state = window.state;
    if (!state?.result) {
      syncCard(null);
      return;
    }
    if (state.result.dataStale) {
      persistAndRender(state, dataStaleWatch(state), null);
      return;
    }
    const conceptsByTf = conceptsForTimeframes(state);
    const forecast = resolveForecast(state);
    const watch = calculateMultiTimeframeEntryWatch({
      conceptsByTf,
      candlesByTf: state.candles,
      direction: forecast?.direction || 'WAIT',
      currentPrice: finite(state.price, state.result.price),
      previous
    });
    persistAndRender(state, watch, forecast);
  } finally {
    syncRunning = false;
  }
}

function start() {
  sync();
  setInterval(sync, 750);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
