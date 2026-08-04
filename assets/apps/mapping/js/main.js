import "./ui/dom-stable-render.js";
import "./bridge/sync-fix.js";
import "./bridge/notify-guard.js";
import {
  runAnalysis,
  connect,
  isLivePriceRunning,
  lastWsTickAt,
  stopLivePrice
} from './api/market-data.js';
import { fmtDir } from './ui/ui-render.js';
import {
  render,
  applyAmyFxRoute,
  analyzeActiveSetups
} from './ui/ui-render.js';
import {
  saveConnect,
  toggleBg
} from './bridge/android-bridge.js';

export const TF = {
  M1: '1min',
  M5: '5min',
  M15: '15min',
  M30: '30min',
  H1: '1h',
  H4: '4h',
  D1: '1day',
  W1: '1week'
};

export const state = {
  tab: 'Dashboard',
  tf: 'M15',
  key: '',
  price: Number(localStorage.getItem('last_price') || 0),
  conn: 'Offline',
  logs: [],
  analyses: [],
  setups: [],
  candles: {},
  result: null,
  bg: true,
  notified: JSON.parse(localStorage.getItem('amy_mapping_notified') || '{}')
};

const DISPLAY_TIME_ZONE = 'Asia/Makassar';
const INTERNAL_LOG_LIMIT = 30;
const INTERNAL_LOG_PATTERN = /error|gagal|usang|offline|invalid|timeout/i;
const RUNTIME_SNAPSHOT_KEY = 'amy_mapping_runtime_snapshot_v1';

let runtimeStarted = false;
let autoConnectTimer = 0;
let livePriceWatchdogTimer = 0;

export const p2 = value =>
  Number.isFinite(+value) ? Number(value).toFixed(2) : '-';

export function nowTime() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date());
}

export function timeRange(zone, sh, sm, eh, em) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const get = type => +parts.find(item => item.type === type).value;
  const guess = Date.UTC(get('year'), get('month') - 1, get('day'), sh, sm);
  const text = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(guess));
  const [hh, mm] = text.split(':').map(Number);
  const start = guess + ((sh * 60 + sm) - (hh * 60 + mm)) * 60000;
  const end = start + (
    (eh * 60 + em) - (sh * 60 + sm) +
    (eh * 60 + em <= sh * 60 + sm ? 1440 : 0)
  ) * 60000;
  return { start, end };
}

export function sessions() {
  const zones = [
    ['Asian Kill Zone', 'Asia/Tokyo', 9, 0, 12, 0],
    ['London Judas Swing', 'Europe/London', 7, 0, 8, 30],
    ['London Open Kill Zone', 'Europe/London', 8, 0, 12, 0],
    ['New York Judas Swing', 'America/New_York', 8, 0, 9, 30],
    ['New York Open Kill Zone', 'America/New_York', 8, 30, 11, 30],
    ['Silver Bullet', 'America/New_York', 10, 0, 11, 0],
    ['Swing Session', 'America/New_York', 13, 30, 16, 0]
  ];
  const now = Date.now();
  return zones.map(item => {
    const range = timeRange(...item.slice(1));
    const format = timestamp => new Intl.DateTimeFormat('en-GB', {
      timeZone: DISPLAY_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(timestamp));
    const displayRange = `${format(range.start)} - ${format(range.end)}`;
    return {
      name: item[0],
      active: now >= range.start && now < range.end,
      wita: displayRange,
      wib: displayRange
    };
  });
}

export function curSession() {
  return sessions().find(item => item.active) ||
    { name: 'Off-Session', active: false, wita: '-', wib: '-' };
}

export function log(message) {
  const entry = `[${nowTime()}] ${message}`;
  if (INTERNAL_LOG_PATTERN.test(String(message || ''))) {
    state.logs = [entry, ...state.logs].slice(0, INTERNAL_LOG_LIMIT);
    console.warn(entry);
  } else {
    console.info(entry);
  }
}

export function save() {
  try {
    localStorage.setItem('bg_scanner', 'true');
    localStorage.setItem(RUNTIME_SNAPSHOT_KEY, JSON.stringify({
      timeframe: state.tf,
      tab: state.tab,
      price: Number(state.price || 0),
      connection: state.conn,
      directionDecision: state.result?.directionDecision || null,
      setupExecution: state.result?.setupExecution || null,
      mappingExplanation: state.result?.mappingExplanation || null,
      mappingSnapshot: state.result?.mappingSnapshot || null,
      savedAt: Date.now()
    }));
  } catch (_) {}
}

export function setupText(execution, result = state.result) {
  if (!execution) return 'Belum ada setup tervalidasi.';

  const explanation = result?.mappingExplanation;
  if (!execution.active) {
    return `Status: ${execution.status || 'TUNGGU'}\n${execution.invalidationReason || explanation?.reason || 'Belum ada setup aktif.'}`;
  }

  const targetText = execution.singleTarget
    ? `Target: ${p2(execution.target1)}`
    : `TP1: ${p2(execution.target1)}\nTP2: ${p2(execution.target2)}`;

  return `${fmtDir(execution.direction)} • ${result?.tf || state.tf}
Status: ${execution.status}
Area rencana: ${p2(execution.entryLow)} - ${p2(execution.entryHigh)}
Batas salah: ${p2(execution.stopLoss)}
${targetText}
${explanation?.action || 'Ikuti lifecycle setup; jangan mengejar harga.'}`;
}

function dispatchMappingUiRendered() {
  if (typeof window?.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent('amyfx:mapping-ui-rendered', {
    detail: { tab: state.tab, timeframe: state.tf, renderedAt: Date.now() }
  }));
}

function renderAndNotify() {
  const changed = render();
  if (changed) {
    if (typeof queueMicrotask === 'function') queueMicrotask(dispatchMappingUiRendered);
    else Promise.resolve().then(dispatchMappingUiRendered);
  }
  return changed;
}

function setTab(tab) {
  const allowedTab = tab === 'Analyze' ? 'Analyze' : 'Dashboard';
  state.tab = allowedTab;
  localStorage.setItem('amy_mapping_tab', allowedTab);
  renderAndNotify();
  syncAutomaticScannerUi();
}

window.setTab = setTab;
window.runAnalysis = runAnalysis;
window.render = renderAndNotify;
window.analyzeActiveSetups = analyzeActiveSetups;
window.saveConnect = saveConnect;
window.toggleBg = toggleBg;
window.state = state;
window.TF = TF;

function effectiveLastWsTickAt() {
  const displayTick = Number(window.__amyFxDisplayLastTickAt || 0);
  const storedTick = Number(localStorage.getItem('last_ws_tick_at') || 0);
  return Math.max(Number(lastWsTickAt || 0), displayTick, storedTick);
}

function autoConnectLivePrice() {
  autoConnectTimer = 0;
  if (!isLivePriceRunning()) connect();
}

function livePriceWatchdog() {
  const tickAt = effectiveLastWsTickAt();
  const stale = !tickAt || Date.now() - tickAt > 45000;
  if (!isLivePriceRunning() || state.conn === 'Offline' || stale) {
    connect({ force: stale || state.conn === 'Offline' });
  }
}

function syncAutomaticScannerUi() {
  const button = document.querySelector('[data-scanner-status]');
  const buttonText = '📡 Scanner mengikuti setup causal';
  if (button) {
    if (button.textContent !== buttonText) button.textContent = buttonText;
    if (!button.classList.contains('action')) button.className = 'action';
  }

  const settings = document.querySelector('.settings');
  if (!settings) return;
  const helpText =
    'Harga live, snapshot Mapping, scanner, dan notifikasi memakai kontrak setupExecution yang sama.';
  const help = settings.querySelector('p.muted');
  if (help && help.textContent !== helpText) help.textContent = helpText;

  const warningHtml =
    '<b>Monitor Causal</b><br>Scanner hanya aktif ketika setup causal timeframe terpilih masih aktif, searah forecast, dan belum terminal.';
  const warning = settings.querySelector('.warn');
  if (warning && warning.innerHTML !== warningHtml) warning.innerHTML = warningHtml;
}

export function pruneStorage() {
  const keysToClean = [
    'amy_mapping_logs',
    'amy_mapping_analyses',
    'amy_mapping_setups',
    'amy_mapping_tmp',
    'amy_test_cache',
    'amy_debug_log'
  ];
  keysToClean.forEach(key => {
    try { localStorage.removeItem(key); } catch (_) {}
  });
  state.logs = [];
  state.analyses = [];
  state.setups = [];
}

function handleOnline() {
  connect({ force: true });
}

function handleVisibilityChange() {
  document.body?.classList?.toggle('webview-idle', document.hidden);
  if (!document.hidden) {
    const tickAt = effectiveLastWsTickAt();
    const stale = !tickAt || Date.now() - tickAt > 45000;
    connect({ force: stale });
  }
}

function handlePageHide() {
  stopRuntime();
}

function hasBrowserRuntimeLifecycle() {
  return typeof window?.setTimeout === 'function'
    && typeof window?.setInterval === 'function'
    && typeof window?.addEventListener === 'function'
    && typeof document?.addEventListener === 'function';
}

function startRuntime() {
  if (runtimeStarted || !hasBrowserRuntimeLifecycle()) return false;
  runtimeStarted = true;
  autoConnectTimer = setTimeout(autoConnectLivePrice, 600);
  livePriceWatchdogTimer = setInterval(livePriceWatchdog, 30000);
  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide, { once: true });
  return true;
}

function stopRuntime() {
  if (autoConnectTimer) {
    clearTimeout(autoConnectTimer);
    autoConnectTimer = 0;
  }
  if (livePriceWatchdogTimer) {
    clearInterval(livePriceWatchdogTimer);
    livePriceWatchdogTimer = 0;
  }
  window.removeEventListener?.('online', handleOnline);
  document.removeEventListener?.('visibilitychange', handleVisibilityChange);
  window.removeEventListener?.('pagehide', handlePageHide);
  try { stopLivePrice(); } catch (_) {}
  runtimeStarted = false;
  return true;
}

window.AmyFXMappingRuntimeLifecycle = Object.freeze({
  version: '1.0.0',
  start: startRuntime,
  stop: stopRuntime,
  isStarted: () => runtimeStarted,
  supported: hasBrowserRuntimeLifecycle
});

function initApp() {
  try { localStorage.removeItem('twelve_api_key'); } catch (_) {}
  try {
    const storedTab = localStorage.getItem('amy_mapping_tab');
    if (storedTab !== 'Analyze' && storedTab !== 'Dashboard') {
      localStorage.setItem('amy_mapping_tab', 'Dashboard');
    }
  } catch (_) {}
  pruneStorage();

  document.querySelectorAll('.nav button')
    .forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));

  window.AmyFXIntel?.mountStrip(document.getElementById('mapping-command-strip'));
  window.AmyFXIntel?.mountBriefing(document.getElementById('intel-briefing'));
  applyAmyFxRoute();
  if (state.tab !== 'Analyze') state.tab = 'Dashboard';
  renderAndNotify();
  syncAutomaticScannerUi();
  startRuntime();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp, { once: true });
} else {
  initApp();
}
