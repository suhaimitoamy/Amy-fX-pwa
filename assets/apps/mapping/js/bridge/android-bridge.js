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

function validatedContract(result = state.result) {
  const directionDecision = result?.directionDecision || null;
  const setupExecution = result?.setupExecution || null;
  const mappingExplanation = result?.mappingExplanation || null;
  const active = Boolean(
    result &&
    !result.dataStale &&
    directionDecision?.source === 'VALIDATED_DIRECTION_FORECAST' &&
    directionDecision?.invalidated === false &&
    (directionDecision?.signal === 'BUY' || directionDecision?.signal === 'SELL') &&
    setupExecution?.active === true &&
    setupExecution?.terminal === false &&
    setupExecution?.direction === directionDecision.signal
  );

  return { result, directionDecision, setupExecution, mappingExplanation, active };
}

function notificationTitle(execution) {
  const stage = execution?.lifecycleStage || 'WAITING_ENTRY';
  if (stage === 'ENTRY_ACTIVE') return `AMY FX — ENTRY ${execution.direction}`;
  if (stage === 'TP1_SECURED' || stage === 'RUNNER_ACTIVE') return 'AMY FX — TP1 DIAMANKAN';
  if (stage === 'TARGET_HIT') return 'AMY FX — TARGET TERCAPAI';
  if (stage === 'STOPPED') return 'AMY FX — SETUP BERHENTI';
  return `AMY FX — SETUP ${execution?.direction || 'WAIT'}`;
}

export function notifyImportant(result = state.result) {
  const contract = validatedContract(result);
  const execution = contract.setupExecution;
  if (!execution?.setupId) return;

  const allowedStages = new Set([
    'WAITING_ENTRY',
    'ENTRY_ACTIVE',
    'TP1_SECURED',
    'RUNNER_ACTIVE',
    'TARGET_HIT',
    'STOPPED',
    'MISSED_ENTRY',
    'EXPIRED',
    'FORECAST_INVALIDATED',
    'DATA_STALE',
    'SETUP_REPLACED',
    'INVALID_GEOMETRY'
  ]);
  if (!allowedStages.has(execution.lifecycleStage)) return;

  const activeOrTerminalEvent = contract.active || execution.terminal;
  if (!activeOrTerminalEvent) return;

  const key = `${execution.setupId}:${execution.lifecycleStage}:${execution.status}`;
  if (state.notified[key]) return;

  state.notified[key] = Date.now();
  const entries = Object.entries(state.notified)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 80);
  state.notified = Object.fromEntries(entries);
  localStorage.setItem('amy_mapping_notified', JSON.stringify(state.notified));

  const title = notificationTitle(execution);
  const message = setupText(execution, result);

  if (window.Android?.showNotificationWithUrl) {
    window.Android.showNotificationWithUrl(title, message, `${location.href.split('#')[0]}#Analyze`);
  } else {
    browserNotify(title, message, 'Analyze');
  }
}

export function sendTargetsToNative() {
  // Scanner area Mapping lokal sudah dinonaktifkan. Backend menjadi satu-satunya
  // sumber notifikasi setup/scalper agar tidak terjadi alert ganda atau stale.
  stopNativeMonitorOnce();
}

export function saveConnect() {
  const input = document.getElementById('apiKey');
  const apiKey = String(input?.value || '').trim();
  if (apiKey) {
    let saved = false;
    try {
      saved = window.AmyLivePrice?.saveApiKey?.(apiKey) === true;
    } catch (_) {
      saved = false;
    }
    if (!saved) {
      state.conn = 'Key Required';
      window.Android?.showAppToast?.('API key Twelve Data tidak valid.');
      render();
      return;
    }
  } else {
    let hasStoredKey = false;
    try {
      hasStoredKey = window.AmyLivePrice?.hasApiKey?.() === true;
    } catch (_) {
      hasStoredKey = false;
    }
    if (!hasStoredKey) {
      state.conn = 'Key Required';
      window.Android?.showAppToast?.('Masukkan API key Twelve Data untuk harga WebSocket.');
      render();
      return;
    }
  }

  state.key = '';
  try { localStorage.removeItem('twelve_api_key'); } catch (_) {}
  if (input) input.value = '';

  state.bg = false;
  try { localStorage.setItem('bg_scanner', 'false'); } catch (_) {}
  connect({ force: true });
  sendTargetsToNative();
  render();
}

export function toggleBg() {
  state.bg = false;
  try { localStorage.setItem('bg_scanner', 'false'); } catch (_) {}
  sendTargetsToNative();
  render();
}

export function testNotif() {
  const current = validatedContract();
  const execution = current.setupExecution?.active
    ? current.setupExecution
    : {
        active: true,
        terminal: false,
        setupId: 'PREVIEW-UPDATE-NOTIFICATION',
        direction: 'BUY',
        status: 'PREVIEW UPDATE',
        lifecycleStage: 'WAITING_ENTRY',
        entryLow: 2355.20,
        entryHigh: 2356.00,
        stopLoss: 2353.50,
        target1: 2358.50,
        target2: 2362.00,
        singleTarget: false
      };
  const message = setupText(execution, current.result);
  const title = current.setupExecution?.active
    ? notificationTitle(execution)
    : 'AMY FX — UPDATE PREVIEW';

  if (window.Android?.showNotificationWithUrl) {
    window.Android.showNotificationWithUrl(title, message, `${location.href.split('#')[0]}#Analyze`);
  } else {
    browserNotify(title, message, 'Analyze');
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
