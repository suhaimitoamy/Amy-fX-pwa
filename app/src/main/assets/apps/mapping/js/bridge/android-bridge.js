import { state, save, setupText } from '../main.js';
import { connect } from '../api/market-data.js';
import { render } from '../ui/ui-render.js';

let lastNativeTargetKey = null;

function browserNotify(title, message, route = 'Analyze') {
  if (typeof Notification === 'undefined') return;
  Notification.requestPermission().then(permission => {
    if (permission !== 'granted') return;
    const notification = new Notification(title, {
      body: message,
      tag: `amy-mapping-${route.toLowerCase()}`
    });
    notification.onclick = () => {
      window.focus();
      location.hash = route;
      window.setTab?.(route);
    };
  });
}

function stopNativeMonitorOnce() {
  if (lastNativeTargetKey === 'NONE') return;
  lastNativeTargetKey = 'NONE';
  window.Android?.stopBackgroundScanner?.();
}

export function notifyImportant(result) {
  const setup = result?.bestSetup;
  if (!setup || setup.score < 70) return;

  const key = `${setup.type}:${setup.dir}:${Math.round(setup.entryLow * 10)}:${Math.round(setup.sl * 10)}`;
  const last = state.notified[key] || 0;
  if (Date.now() - last < 300000) return;

  state.notified[key] = Date.now();
  localStorage.setItem('amy_mapping_notified', JSON.stringify(state.notified));
  const message = setupText(setup);

  if (window.Android?.showNotificationWithUrl) {
    window.Android.showNotificationWithUrl(
      `AMY FX — ${setup.type}`,
      message,
      location.href
    );
  } else {
    browserNotify(`AMY FX — ${setup.type}`, message);
  }
}

export function sendTargetsToNative() {
  if (!window.Android?.startBackgroundScanner) return;

  const setup = state.result?.bestSetup;
  const validSetup =
    state.tf === 'M15' &&
    setup?.executionMode === 'M15_PRECISION' &&
    setup?.status !== 'INVALID' &&
    setup?.status !== 'WAIT' &&
    Number.isFinite(setup?.entryLow) &&
    Number.isFinite(setup?.entryHigh);

  if (!validSetup) {
    stopNativeMonitorOnce();
    return;
  }

  let upper = 0;
  let lower = 0;
  if (String(setup.dir).includes('SELL')) {
    upper = Math.min(Number(setup.entryLow), Number(setup.entryHigh));
  } else if (String(setup.dir).includes('BUY')) {
    lower = Math.max(Number(setup.entryLow), Number(setup.entryHigh));
  }

  if (upper <= 0 && lower <= 0) {
    stopNativeMonitorOnce();
    return;
  }

  const targetKey = `${setup.dir}|${upper.toFixed(2)}|${lower.toFixed(2)}|${setup.timestamp || 0}`;
  if (targetKey === lastNativeTargetKey) return;
  lastNativeTargetKey = targetKey;

  // Proxy server dipakai; pengguna tidak perlu mengaktifkan scanner atau mengisi API key.
  window.Android.startBackgroundScanner(
    'amyfx-proxy',
    String(upper),
    String(lower)
  );
}

export function saveConnect() {
  const input = document.getElementById('apiKey');
  state.key = input?.value?.trim() || state.key || '';
  if (state.key) localStorage.setItem('twelve_api_key', state.key);

  state.bg = true;
  save();
  connect();
  sendTargetsToNative();
  render();
}

export function toggleBg() {
  // Scanner tidak lagi membutuhkan tombol manual. Fungsi dipertahankan agar UI lama tetap aman.
  state.bg = true;
  save();
  sendTargetsToNative();
  render();
}

export function testNotif() {
  const setup = state.result?.bestSetup || {
    type: 'LIQUIDITY SWEEP',
    dir: 'BUY WATCH',
    tf: 'M15',
    score: 78,
    entryLow: 2355.20,
    entryHigh: 2356.00,
    sl: 2353.50,
    tp1: 2358.50,
    tp2: 2362.00,
    reason: 'Contoh notifikasi setup angka.'
  };
  const message = setupText(setup);
  if (window.Android?.showNotificationWithUrl) {
    window.Android.showNotificationWithUrl(
      `AMY FX — ${setup.type}`,
      message,
      location.href
    );
  } else {
    browserNotify(`AMY FX — ${setup.type}`, message);
  }
}

export function downloadLogs() {
  const blob = new Blob([state.logs.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'amy-fx-logs.txt';
  anchor.click();
  URL.revokeObjectURL(url);
}
