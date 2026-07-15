import "./bridge/sync-fix.js";
import "./bridge/notify-guard.js";
import {
  runAnalysis,
  connect,
  isLivePriceRunning,
  lastWsTickAt
} from './api/market-data.js';
import { fmtDir } from './ui/ui-render.js';
import {
  render,
  applyAmyFxRoute,
  analyzeActiveSetups
} from './ui/ui-render.js';
import {
  saveConnect,
  toggleBg,
  testNotif,
  downloadLogs
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
  logs: JSON.parse(localStorage.getItem('amy_mapping_logs') || '[]'),
  analyses: JSON.parse(localStorage.getItem('amy_mapping_analyses') || '[]'),
  setups: JSON.parse(localStorage.getItem('amy_mapping_setups') || '[]'),
  candles: {},
  result: null,
  bg: true,
  notified: JSON.parse(localStorage.getItem('amy_mapping_notified') || '{}')
};

export const p2 = value =>
  Number.isFinite(+value) ? Number(value).toFixed(2) : '-';

export function nowTime() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
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
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(timestamp));
    return {
      name: item[0],
      active: now >= range.start && now < range.end,
      wib: `${format(range.start)} - ${format(range.end)}`
    };
  });
}

export function curSession() {
  return sessions().find(item => item.active) ||
    { name: 'Off-Session', active: false, wib: '-' };
}

export function log(message) {
  state.logs = [`[${nowTime()}] ${message}`, ...state.logs].slice(0, 200);
  save();
  try { render(); } catch (_) {}
}

export function save() {
  localStorage.setItem('amy_mapping_logs', JSON.stringify(state.logs.slice(0, 200)));
  localStorage.setItem('amy_mapping_analyses', JSON.stringify(state.analyses.slice(0, 80)));
  localStorage.setItem('amy_mapping_setups', JSON.stringify(state.setups.slice(0, 50)));
  localStorage.setItem('bg_scanner', 'true');
}

export function setupText(setup) {
  if (!setup) return '';
  const action = setup.status === 'WAIT'
    ? 'Tunggu konfirmasi.'
    : setup.status === 'INVALID'
      ? 'Setup tidak valid.'
      : 'Pantau harga saat masuk ke area, jangan mengejar.';
  return `${fmtDir(setup.dir)} • ${setup.tf}
Kualitas: ${setup.score}/100
Area rencana: ${p2(setup.entryLow)} - ${p2(setup.entryHigh)}
Batas salah: ${p2(setup.sl)}
Target aman: ${p2(setup.tp1)}
Target lanjutan: ${p2(setup.tp2)}
${action}
${setup.reason}`;
}

function setTab(tab) {
  state.tab = tab;
  localStorage.setItem('amy_mapping_tab', tab);
  render();
  syncAutomaticScannerUi();
}

window.setTab = setTab;
window.runAnalysis = runAnalysis;
window.render = render;
window.analyzeActiveSetups = analyzeActiveSetups;
window.saveConnect = saveConnect;
window.toggleBg = toggleBg;
window.testNotif = testNotif;
window.downloadLogs = downloadLogs;
window.state = state;
window.TF = TF;

function autoConnectLivePrice() {
  if (!isLivePriceRunning()) connect();
}

function livePriceWatchdog() {
  const stale = !lastWsTickAt || Date.now() - lastWsTickAt > 45000;
  if (!isLivePriceRunning() || state.conn === 'Offline' || stale) connect();
}

function syncAutomaticScannerUi() {
  const button = document.querySelector('[data-scanner-status]');
  const buttonText = '📡 Background Scanner Otomatis Aktif';
  if (button) {
    if (button.textContent !== buttonText) button.textContent = buttonText;
    if (!button.classList.contains('action')) button.className = 'action';
  }

  const settings = document.querySelector('.settings');
  if (!settings) return;

  const helpText =
    'Harga live dan Background Scanner memakai server Amy FX secara otomatis. API key lokal tidak wajib.';
  const help = settings.querySelector('p.muted');
  if (help && help.textContent !== helpText) help.textContent = helpText;

  const warningHtml =
    '<b>Monitor Otomatis</b><br>News dan area M15 tetap dipantau setelah aplikasi ditutup.';
  const warning = settings.querySelector('.warn');
  if (warning && warning.innerHTML !== warningHtml) warning.innerHTML = warningHtml;
}

function initApp() {
  try { localStorage.removeItem('twelve_api_key'); } catch (_) {}

  document.querySelectorAll('.nav button')
    .forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));

  window.AmyFXIntel?.mountStrip(document.getElementById('mapping-command-strip'));
  window.AmyFXIntel?.mountBriefing(document.getElementById('intel-briefing'));
  applyAmyFxRoute();
  render();
  syncAutomaticScannerUi();

  // MutationObserver sebelumnya menulis ulang Settings lalu memicu dirinya sendiri.
  // Tanpa observer, navigasi tetap ringan dan semua tombol dapat menerima sentuhan.

  setTimeout(autoConnectLivePrice, 600);
  setInterval(livePriceWatchdog, 30000);
  document.addEventListener(
    'visibilitychange',
    () => document.body.classList.toggle('webview-idle', document.hidden)
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
