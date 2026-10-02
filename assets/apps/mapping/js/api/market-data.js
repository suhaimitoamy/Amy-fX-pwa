import { state, TF, log, save, p2 } from '../main.js';
import { analyze, tfGroup } from '../engine/ict-core.js';
import { timeframeDurationMs } from '../engine/mapping-timeframes.js';
import { aggregateClosedCandles } from './closed-candle-aggregation.js';
import {
  assertCurrentClosedCandleSource,
  inspectClosedCandleSource
} from '../engine/closed-candle-source-state.js';
import { causalEntryLifecycleContract } from '../engine/concept-entry-map-v3.js';
import { buildMappingSnapshot } from '../engine/mapping-snapshot.js';
import { render, renderSoft, renderAnalyzeLive } from '../ui/ui-render.js';
import { sendTargetsToNative, notifyImportant } from '../bridge/android-bridge.js';

export let scanTimer = null;
export let lastWsTickAt = Number(localStorage.getItem('last_ws_tick_at') || 0);

let nativeLiveStarted = false;
let reconnectTimer = null;
let reconnectAttempt = 0;
let lastErrorLogAt = 0;
let analysisSequence = 0;
let analysisController = null;
let analysisInFlight = null;

const PROXY_URL = 'https://amy-fx.vercel.app/api/twelvedata';
const LIVE_TICK_HARD_TTL_MS = 45_000;
const LIVE_RECONNECT_DELAYS_MS = [2_000, 5_000, 10_000, 30_000, 60_000];

function normalizedMarketTimestamp(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 100_000_000_000 ? numeric : numeric * 1000;
  }
  const text = String(value || '').trim();
  if (!text) return 0;
  const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(text)
    ? text
    : `${text.replace(' ', 'T')}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function assertBackendPayloadFresh(data, label = 'Market') {
  const source = String(data?.source || '');
  const cacheState = String(data?.amyfxCacheState || '');
  return {
    fresh: !(/stale/i.test(source) || /stale/i.test(cacheState)),
    label,
    source,
    cacheState
  };
}

function validateLiveTickPayload(data) {
  const capturedAt = normalizedMarketTimestamp(
    data?.timestamp
    || data?.capturedAt
  );
  const ageMs = capturedAt ? Date.now() - capturedAt : Number.POSITIVE_INFINITY;
  if (!capturedAt || ageMs > LIVE_TICK_HARD_TTL_MS || ageMs < -60_000) {
    throw new Error('Timestamp harga provider tidak lagi live');
  }
  return capturedAt;
}

export let candleFetchedAt = {};

function normalizeTfKey(tf) {
  const norm = String(tf || '').toUpperCase();
  if (norm === '1MIN') return 'M1';
  if (norm === '5MIN') return 'M5';
  if (norm === '15MIN') return 'M15';
  if (norm === '30MIN') return 'M30';
  if (norm === '1H') return 'H1';
  if (norm === '4H') return 'H4';
  if (norm === '1DAY') return 'D1';
  return norm;
}

export function setCandleFetchedAt(tf, timestamp = Date.now()) {
  const key = normalizeTfKey(tf);
  candleFetchedAt[tf] = timestamp;
  candleFetchedAt[key] = timestamp;
}

export function getCandleFetchedAt(tf) {
  const key = normalizeTfKey(tf);
  return candleFetchedAt[key] || candleFetchedAt[tf] || 0;
}

export function isCandleStale(tf) {
  const norm = normalizeTfKey(tf);
  const sourceState = inspectClosedCandleSource(norm, state.candles?.[norm] || []);
  if (sourceState.blockingDelayed) return true;
  const fetched = getCandleFetchedAt(tf);
  const ageMinutes = (Date.now() - fetched) / (1000 * 60);

  if (norm === 'M1') return ageMinutes >= 2;
  if (norm === 'M5') return ageMinutes >= 5;
  if (norm === 'M15') return ageMinutes >= 5;
  if (norm === 'M30') return ageMinutes >= 10;
  if (norm === 'H1') return ageMinutes >= 15;
  if (norm === 'H4') return ageMinutes >= 60;
  if (norm === 'D1') return ageMinutes >= 240;
  return ageMinutes >= 240;
}

export function buildDirectionDecision(result) {
  const d = result?.amySmcD;
  if (!result || !d?.ready) {
    return {
      bias: result?.dataStale ? 'DATA USANG' : 'WAIT',
      signal: 'WAIT',
      source: result?.dataStale ? 'DATA_STALE' : 'AMY_SMC_D_UNAVAILABLE',
      status: result?.dataStale
        ? 'DATA USANG — belum ada Mapping candle tertutup yang valid'
        : 'WAIT — data Amy-SMC-D belum tersedia',
      invalidated: Boolean(result?.dataStale),
      invalidationReason: result?.dataStale ? 'Belum ada candle tertutup valid yang dapat dipertahankan.' : '',
      confidence: null,
      confidenceLabel: 'NOT A LIVE PROBABILITY'
    };
  }
  const finalBias = d.descriptive.finalBias;
  const nextMove = d.predictive.nextMove;
  const bias = finalBias.directionValue > 0 ? 'BUY' : finalBias.directionValue < 0 ? 'SELL' : 'WAIT';
  const signal = nextMove.signal || 'WAIT';
  const staleSuffix = result.dataStale || result.dataDegraded ? ' · LAST VALID CLOSED CANDLE' : '';
  const invalidationLevel = finalBias.directionValue > 0
    ? d.levels?.bullishInvalidation
    : finalBias.directionValue < 0
      ? d.levels?.bearishInvalidation
      : null;
  return {
    bias,
    biasSource: 'AMY_SMC_D_FINAL_BIAS',
    biasReason: 'Final Bias Amy-SMC-D: HTF Swing 35 + Swing 30 + Internal 20 + active Liquidity 15.',
    biasInvalidationLevel: invalidationLevel,
    biasStructure: finalBias.components,
    biasPreviousInvalidated: false,
    signal,
    source: 'AMY_SMC_D_NEXT_MOVE',
    status: `FINAL BIAS ${finalBias.direction} · NEXT MOVE ${signal}${staleSuffix}`,
    invalidated: false,
    invalidationReason: '',
    confidence: null,
    confidenceLabel: 'HISTORICAL REFERENCE ONLY',
    confidenceMeaning: 'Bukan probabilitas live untuk candle saat ini.',
    sourceCandleTime: d.sourceCandle?.time || null,
    baselineSha: d.baselineSha
  };
}

function numStr(val) {
  const n = Number(val);
  return Number.isFinite(n) ? String(n) : '';
}

export function buildSetupId(setup, forecast, tf) {
  if (!setup) return '';
  const dir = String(setup.dir || setup.direction || '').toUpperCase();
  const type = String(setup.type || 'ENTRY_MAP').toUpperCase();
  const lo = numStr(setup.entryLow);
  const hi = numStr(setup.entryHigh);
  const sl = numStr(setup.initialSl ?? setup.sl);
  const tp1 = numStr(setup.tp1);
  const tp2 = numStr(setup.tp2);
  const ts = setup.timestamp || 0;
  const fcStartTime = forecast?.startTime != null ? forecast.startTime : 0;
  const fcStartIndex = forecast?.startIndex != null ? forecast.startIndex : 0;
  return `${tf}:${dir}:${type}:${lo}:${hi}:${sl}:${tp1}:${tp2}:${ts}:${fcStartTime}:${fcStartIndex}`;
}

export function validateSetupGeometry(setup, dirSignal) {
  if (!setup) return { valid: false, reason: 'Setup kosong' };

  const isBuy = dirSignal === 'BUY' || String(setup.dir).toUpperCase().includes('BUY');
  const isSell = dirSignal === 'SELL' || String(setup.dir).toUpperCase().includes('SELL');

  const lo = Number(setup.entryLow);
  const hi = Number(setup.entryHigh);
  const sl = Number(setup.sl);
  const tp1 = Number(setup.tp1);
  const tp2 = Number(setup.tp2);
  const singleTarget = Boolean(setup.singleTarget);

  if (![lo, hi, sl, tp1].every(value => Number.isFinite(value) && value > 0)) {
    return { valid: false, reason: 'Angka entry, SL, atau TP1 tidak valid (NaN).' };
  }

  if (lo > hi) {
    return { valid: false, reason: `entryLow (${lo}) lebih tinggi dari entryHigh (${hi}).` };
  }

  if (!singleTarget && (!Number.isFinite(tp2) || tp2 <= 0)) {
    return { valid: false, reason: 'Target 2 wajib tersedia untuk setup multi-target.' };
  }

  if (isBuy) {
    if (sl >= lo) return { valid: false, reason: `SL BUY (${sl}) harus di bawah entryLow (${lo}).` };
    if (tp1 <= hi) return { valid: false, reason: `Target 1 BUY (${tp1}) harus di atas entryHigh (${hi}).` };
    if (!singleTarget && tp2 < tp1) return { valid: false, reason: `Target 2 BUY (${tp2}) harus lebih tinggi dari Target 1 (${tp1}).` };
  } else if (isSell) {
    if (sl <= hi) return { valid: false, reason: `SL SELL (${sl}) harus di atas entryHigh (${hi}).` };
    if (tp1 >= lo) return { valid: false, reason: `Target 1 SELL (${tp1}) harus di bawah entryLow (${lo}).` };
    if (!singleTarget && tp2 > tp1) return { valid: false, reason: `Target 2 SELL (${tp2}) harus lebih rendah dari Target 1 (${tp1}).` };
  } else {
    return { valid: false, reason: 'Arah setup tidak BUY maupun SELL.' };
  }

  return { valid: true, reason: '' };
}

export function persistSetupLifecycle({ setupId, lifecycleStage, status, terminal = false, invalidationReason = '', entryTouched = false, target1Secured = false, entryAt = null, target1At = null, terminalAt = null }) {
  if (!setupId) return;
  let lcStorage = {};
  try { lcStorage = JSON.parse(localStorage.getItem('amy_mapping_lifecycle_v4') || '{}'); } catch (_) {}

  const existing = lcStorage[setupId] || {};
  lcStorage[setupId] = {
    setupId,
    entryTouched: Boolean(entryTouched || existing.entryTouched),
    target1Secured: Boolean(target1Secured || existing.target1Secured),
    lifecycleStage,
    status,
    terminal: Boolean(terminal),
    invalidationReason,
    entryAt: entryAt || existing.entryAt || null,
    target1At: target1At || existing.target1At || existing.tp1At || null,
    terminalAt: terminal ? (terminalAt || existing.terminalAt || Date.now()) : null
  };

  const keys = Object.keys(lcStorage);
  if (keys.length > 50) keys.slice(0, keys.length - 30).forEach(k => delete lcStorage[k]);
  try { localStorage.setItem('amy_mapping_lifecycle_v4', JSON.stringify(lcStorage)); } catch (_) {}
}

export function persistTerminalSetup(args) {
  return persistSetupLifecycle({ ...args, terminal: true, terminalAt: args.terminalAt || Date.now() });
}

function getActivePointers() {
  try { return JSON.parse(localStorage.getItem('amy_mapping_active_pointer_v4') || '{}'); } catch (_) { return {}; }
}

function saveActivePointers(pointers) {
  const keys = Object.keys(pointers);
  if (keys.length > 50) {
    const sorted = keys.map(k => ({ k, t: pointers[k]?.updatedAt || 0 })).sort((a, b) => a.t - b.t);
    sorted.slice(0, keys.length - 30).forEach(item => delete pointers[item.k]);
  }
  try { localStorage.setItem('amy_mapping_active_pointer_v4', JSON.stringify(pointers)); } catch (_) {}
}

function deleteActivePointer(tf) {
  const pointers = getActivePointers();
  if (pointers[tf]) {
    delete pointers[tf];
    saveActivePointers(pointers);
  }
}

export function buildSetupExecution(result, { persist = true } = {}) {
  const defaultExecution = {
    active: false,
    setupId: '',
    direction: 'WAIT',
    status: 'NO_ACTIVE_SETUP',
    lifecycleStage: 'WAITING_ENTRY',
    entryLow: null,
    entryHigh: null,
    stopLoss: null,
    target1: null,
    target2: null,
    singleTarget: true,
    entryTouched: false,
    target1Secured: false,
    terminal: true,
    alignedWithForecast: false,
    geometryValid: false,
    invalidated: false,
    invalidationReason: '',
    liquidityTarget: null
  };

  if (!result) return defaultExecution;

  const dd = result.directionDecision || buildDirectionDecision(result);
  const validated = result.validatedMarketContext;
  const forecast = validated?.directionForecast;
  const forecastActive = Boolean(forecast?.active && !forecast?.invalidated && !forecast?.expired);
  const bestSetup = result.bestSetup;
  const tf = result.tf || 'M15';
  const price = Number(state.price || result.price || localStorage.getItem('last_price') || 0);

  if ((result.dataStale || dd.source === 'DATA_STALE') && !result.st && !result.validatedMarketContext?.marketState) {
    if (persist) {
      const prev = getActivePointers()[tf];
      if (prev?.setupId) {
        persistTerminalSetup({ setupId: prev.setupId, lifecycleStage: 'DATA_STALE', status: 'DATA USANG', invalidationReason: 'Data market usang.' });
        deleteActivePointer(tf);
      }
    }
    return { ...defaultExecution, status: 'DATA USANG', lifecycleStage: 'DATA_STALE', invalidated: true, invalidationReason: 'Data market usang.' };
  }

  const causalSetup = result.entryMap?.setup;
  const terminalCausalSetup = causalSetup?.executionMode === 'CAUSAL_ENTRY_MAP_ALL_TF'
    && causalSetup.live === false;
  if (terminalCausalSetup) {
    const setupDirectionValue = setupDirection(causalSetup);
    const direction = setupDirectionValue > 0 ? 'BUY' : setupDirectionValue < 0 ? 'SELL' : 'WAIT';
    const geometrySetup = Number.isFinite(Number(causalSetup.initialSl))
      ? { ...causalSetup, sl: Number(causalSetup.initialSl) }
      : causalSetup;
    const geom = validateSetupGeometry(geometrySetup, direction);
    if (!geom.valid) {
      return {
        ...defaultExecution,
        direction,
        status: 'INVALID SETUP GEOMETRY',
        lifecycleStage: 'INVALID_GEOMETRY',
        alignedWithForecast: false,
        geometryValid: false,
        invalidated: true,
        invalidationReason: geom.reason
      };
    }

    const lifecycle = causalEntryLifecycleContract(causalSetup);
    const setupId = buildSetupId(causalSetup, forecast, tf);
    const lo = Math.min(Number(causalSetup.entryLow), Number(causalSetup.entryHigh));
    const hi = Math.max(Number(causalSetup.entryLow), Number(causalSetup.entryHigh));
    const tp2 = Number(causalSetup.tp2);
    const target1Secured = Boolean(causalSetup.tp1Hit);
    if (persist) {
      persistTerminalSetup({
        setupId,
        lifecycleStage: lifecycle.lifecycleStage,
        status: lifecycle.status,
        invalidationReason: '',
        entryTouched: true,
        target1Secured,
        entryAt: Number(causalSetup.timestamp || 0) || Date.now(),
        target1At: target1Secured ? Number(causalSetup.tp1Time || 0) || null : null,
        terminalAt: Number(causalSetup.endTime || 0) || Date.now()
      });
      deleteActivePointer(tf);
    }

    return {
      active: false,
      setupId,
      direction,
      status: lifecycle.status,
      lifecycleStage: lifecycle.lifecycleStage,
      outcome: lifecycle.status,
      entryLow: lo,
      entryHigh: hi,
      stopLoss: Number(causalSetup.sl),
      initialStopLoss: Number(causalSetup.initialSl),
      target1: Number(causalSetup.tp1),
      target2: Number.isFinite(tp2) ? tp2 : null,
      singleTarget: Boolean(causalSetup.singleTarget),
      entryTouched: true,
      target1Secured,
      terminal: true,
      alignedWithForecast: direction !== 'WAIT',
      geometryValid: true,
      invalidated: false,
      invalidationReason: '',
      liquidityTarget: Number.isFinite(tp2)
        ? { type: causalSetup.targetType || 'STRUCTURAL', level: tp2 }
        : null,
      endIndex: Number.isInteger(causalSetup.endIndex) ? causalSetup.endIndex : null,
      endTime: Number(causalSetup.endTime || 0) || null,
      lifecycle: causalSetup.lifecycle || null,
      authority: 'CLOSED_CANDLE_CAUSAL_ENGINE'
    };
  }

  if (!forecastActive || dd.invalidated || dd.source !== 'AMY_SMC_D_NEXT_MOVE' || (dd.signal !== 'BUY' && dd.signal !== 'SELL')) {
    const reason = dd.invalidationReason || 'Direction Forecast tidak aktif atau ter-invalidasi.';
    if (persist) {
      const prev = getActivePointers()[tf];
      if (prev?.setupId) {
        persistTerminalSetup({ setupId: prev.setupId, lifecycleStage: 'FORECAST_INVALIDATED', status: 'FORECAST INVALIDATED', invalidationReason: reason });
        deleteActivePointer(tf);
      }
    }
    return { ...defaultExecution, status: 'FORECAST INVALIDATED', lifecycleStage: 'FORECAST_INVALIDATED', invalidated: true, invalidationReason: reason };
  }

  if (!bestSetup) {
    if (persist) {
      const prev = getActivePointers()[tf];
      if (prev?.setupId) {
        const fcStartTime = forecast?.startTime || 0;
        const sameForecast = prev.forecastStartTime === fcStartTime && prev.direction === dd.signal;
        persistTerminalSetup({
          setupId: prev.setupId,
          lifecycleStage: sameForecast ? 'SETUP_REPLACED' : 'FORECAST_INVALIDATED',
          status: sameForecast ? 'SETUP NO LONGER ACTIVE' : 'FORECAST INVALIDATED',
          invalidationReason: sameForecast ? 'Setup lama tidak lagi menjadi Entry Map aktif setelah analisis terbaru.' : 'Direction Forecast atau arah market telah berubah.'
        });
        deleteActivePointer(tf);
      }
    }
    return { ...defaultExecution, direction: dd.signal, status: 'WAITING FOR SETUP', lifecycleStage: 'WAITING_ENTRY', alignedWithForecast: true, invalidationReason: 'Belum ada setup Entry Map yang lolos seluruh filter.' };
  }

  const setupDir = String(bestSetup.dir || bestSetup.direction || '').toUpperCase();
  const setupIsBuy = setupDir.includes('BUY') || setupDir.includes('BULL');
  const setupIsSell = setupDir.includes('SELL') || setupDir.includes('BEAR');
  const aligned = (dd.signal === 'BUY' && setupIsBuy) || (dd.signal === 'SELL' && setupIsSell);

  if (!aligned) {
    if (persist) {
      const prev = getActivePointers()[tf];
      if (prev?.setupId) {
        persistTerminalSetup({ setupId: prev.setupId, lifecycleStage: 'FORECAST_INVALIDATED', status: 'SETUP CONFLICT', invalidationReason: `Setup Entry Map (${setupDir}) bertentangan dengan Direction Forecast (${dd.signal}).` });
        deleteActivePointer(tf);
      }
    }
    return { ...defaultExecution, direction: dd.signal, status: 'SETUP CONFLICT', lifecycleStage: 'FORECAST_INVALIDATED', alignedWithForecast: false, invalidated: true, invalidationReason: `Setup Entry Map (${setupDir}) bertentangan dengan Direction Forecast (${dd.signal}).` };
  }

  const causalExecution = bestSetup.executionMode === 'CAUSAL_ENTRY_MAP_ALL_TF';
  const geometrySetup = causalExecution && Number.isFinite(Number(bestSetup.initialSl))
    ? { ...bestSetup, sl: Number(bestSetup.initialSl) }
    : bestSetup;
  const geom = validateSetupGeometry(geometrySetup, dd.signal);
  if (!geom.valid) {
    if (persist) {
      const prev = getActivePointers()[tf];
      if (prev?.setupId) {
        persistTerminalSetup({ setupId: prev.setupId, lifecycleStage: 'INVALID_GEOMETRY', status: 'INVALID SETUP GEOMETRY', invalidationReason: geom.reason });
        deleteActivePointer(tf);
      }
    }
    return { ...defaultExecution, direction: dd.signal, status: 'INVALID SETUP GEOMETRY', lifecycleStage: 'INVALID_GEOMETRY', alignedWithForecast: true, geometryValid: false, invalidated: true, invalidationReason: geom.reason };
  }

  const setupId = buildSetupId(bestSetup, forecast, tf);

  if (persist) {
    const fcStartTime = forecast?.startTime || 0;
    const prevPointer = getActivePointers()[tf];
    if (prevPointer && prevPointer.setupId !== setupId) {
      const sameForecast = prevPointer.forecastStartTime === fcStartTime && prevPointer.direction === dd.signal;
      persistTerminalSetup({
        setupId: prevPointer.setupId,
        lifecycleStage: sameForecast ? 'SETUP_REPLACED' : 'FORECAST_INVALIDATED',
        status: sameForecast ? 'SETUP REPLACED' : 'FORECAST INVALIDATED',
        invalidationReason: sameForecast ? 'Setup lama telah digantikan oleh setup Entry Map yang lebih baru.' : 'Direction Forecast atau arah market telah berubah.'
      });
    }
  }

  let lcStorage = {};
  try { lcStorage = JSON.parse(localStorage.getItem('amy_mapping_lifecycle_v4') || '{}'); } catch (_) {}
  const savedState = lcStorage[setupId] || {};

  const lo = Math.min(Number(bestSetup.entryLow), Number(bestSetup.entryHigh));
  const hi = Math.max(Number(bestSetup.entryLow), Number(bestSetup.entryHigh));
  const sl = Number(bestSetup.sl);
  const tp1 = Number(bestSetup.tp1);
  const tp2 = Number(bestSetup.tp2);
  const singleTarget = Boolean(bestSetup.singleTarget);
  const isBuy = dd.signal === 'BUY';

  if (causalExecution) {
    const target1Secured = Boolean(bestSetup.tp1Hit);
    const lifecycle = causalEntryLifecycleContract(bestSetup);
    const lifecycleStage = lifecycle.lifecycleStage;
    const status = target1Secured
      ? lifecycle.status
      : 'ENTRY CONFIRMED · CLOSED CANDLE';
    if (persist) {
      persistSetupLifecycle({
        setupId,
        lifecycleStage,
        status,
        terminal: false,
        entryTouched: true,
        target1Secured,
        entryAt: Number(bestSetup.timestamp || 0) || Date.now(),
        target1At: target1Secured
          ? Number(bestSetup.tp1Time || savedState.target1At || Date.now())
          : null
      });
      const pointers = getActivePointers();
      pointers[tf] = {
        setupId,
        timeframe: tf,
        direction: dd.signal,
        forecastStartTime: forecast?.startTime || 0,
        updatedAt: Date.now()
      };
      saveActivePointers(pointers);
    }
    return {
      active: bestSetup.live !== false,
      setupId,
      direction: dd.signal,
      status,
      lifecycleStage,
      entryLow: lo,
      entryHigh: hi,
      stopLoss: Number(bestSetup.sl),
      initialStopLoss: Number(bestSetup.initialSl),
      target1: tp1,
      target2: Number.isFinite(tp2) ? tp2 : null,
      singleTarget,
      entryTouched: true,
      target1Secured,
      terminal: false,
      alignedWithForecast: true,
      geometryValid: true,
      invalidated: false,
      invalidationReason: '',
      liquidityTarget: Number.isFinite(tp2)
        ? { type: bestSetup.targetType || 'STRUCTURAL', level: tp2 }
        : null,
      authority: 'CLOSED_CANDLE_CAUSAL_ENGINE'
    };
  }

  if (savedState.terminal) {
    return {
      ...defaultExecution,
      active: false,
      setupId,
      direction: dd.signal,
      status: savedState.status || 'TERMINAL',
      lifecycleStage: savedState.lifecycleStage || 'FORECAST_INVALIDATED',
      entryLow: lo,
      entryHigh: hi,
      stopLoss: sl,
      target1: tp1,
      target2: Number.isFinite(tp2) ? tp2 : null,
      singleTarget,
      entryTouched: Boolean(savedState.entryTouched),
      target1Secured: Boolean(savedState.target1Secured),
      terminal: true,
      alignedWithForecast: true,
      geometryValid: true,
      invalidated: true,
      invalidationReason: savedState.invalidationReason || 'Setup sudah terminal.',
      liquidityTarget: null
    };
  }

  let entryTouched = Boolean(savedState.entryTouched);
  let target1Secured = Boolean(savedState.target1Secured);
  let liquidityTarget = null;
  const drawTarget = result.liquidityHierarchy?.drawTarget;
  if (drawTarget && Number.isFinite(drawTarget.level)) {
    const levelPrice = Number(drawTarget.level);
    const targetType = String(drawTarget.type || '').toUpperCase();
    if (isBuy) {
      if (levelPrice > Math.max(price, hi) && (!targetType || targetType === 'BSL')) liquidityTarget = { type: targetType || 'BSL', level: levelPrice };
    } else if (levelPrice < Math.min(price, lo) && (!targetType || targetType === 'SSL')) {
      liquidityTarget = { type: targetType || 'SSL', level: levelPrice };
    }
  }

  let stage = 'WAITING_ENTRY';
  let statusText = 'MENUNGGU ENTRY';
  let isTerminal = false;
  let invalidReason = '';

  const setupTimestamp = Number(bestSetup.timestamp || 0);
  const setupExpiryBars = Math.max(1, Number(bestSetup.expiryBars || bestSetup.tradeManagement?.expiryBars || 1));
  const setupExpiryMs = Math.max(
    timeframeDurationMs(bestSetup.tf || tf) * setupExpiryBars,
    timeframeDurationMs(bestSetup.tf || tf)
  );
  if (setupTimestamp > 0 && setupExpiryMs > 0 && Date.now() - setupTimestamp > setupExpiryMs) {
    stage = 'EXPIRED';
    statusText = 'SETUP EXPIRED';
    isTerminal = true;
    invalidReason = `Setup sudah melewati ${setupExpiryBars} candle ${bestSetup.tf || tf}.`;
  } else if (price > 0) {
    const reachedTarget1BeforeEntry = !entryTouched && (isBuy ? price >= tp1 : price <= tp1);
    if (reachedTarget1BeforeEntry) {
      stage = 'MISSED_ENTRY';
      statusText = 'MISSED ENTRY';
      isTerminal = true;
      invalidReason = 'Harga sudah bergerak mencapai target tanpa menyentuh area entry. Jangan mengejar harga.';
    } else {
      if (!entryTouched && price >= lo && price <= hi) {
        entryTouched = true;
        savedState.entryTouched = true;
        savedState.entryAt = Date.now();
      }
      if (entryTouched) {
        const slHit = isBuy ? price <= sl : price >= sl;
        if (slHit) {
          stage = 'STOPPED';
          statusText = 'SL HIT';
          isTerminal = true;
          invalidReason = `Harga tersentuh Stop Loss pada ${p2(sl)}.`;
        } else {
          const tp1Hit = isBuy ? price >= tp1 : price <= tp1;
          if (tp1Hit) {
            target1Secured = true;
            savedState.target1Secured = true;
            savedState.target1At = Date.now();
            if (singleTarget) {
              stage = 'TARGET_HIT';
              statusText = 'TP1 HIT';
              isTerminal = true;
            } else if (Number.isFinite(tp2) && (isBuy ? price >= tp2 : price <= tp2)) {
              stage = 'TARGET_HIT';
              statusText = 'TP2 HIT';
              isTerminal = true;
            } else {
              stage = 'RUNNER_ACTIVE';
              statusText = 'TP1 SECURED · RUNNER KE TP2';
            }
          } else if (target1Secured) {
            stage = 'RUNNER_ACTIVE';
            statusText = 'TP1 SECURED · RUNNER AKTIF';
          } else {
            stage = 'ENTRY_ACTIVE';
            statusText = 'ENTRY AKTIF';
          }
        }
      }
    }
  }

  if (persist) {
    if (isTerminal) {
      persistTerminalSetup({ setupId, lifecycleStage: stage, status: statusText, invalidationReason: invalidReason, entryTouched, target1Secured, entryAt: savedState.entryAt, target1At: savedState.target1At });
      deleteActivePointer(tf);
    } else {
      persistSetupLifecycle({ setupId, lifecycleStage: stage, status: statusText, terminal: false, invalidationReason: '', entryTouched, target1Secured, entryAt: savedState.entryAt, target1At: savedState.target1At, terminalAt: null });
      const pointers = getActivePointers();
      pointers[tf] = { setupId, timeframe: tf, direction: dd.signal, forecastStartTime: forecast?.startTime || 0, updatedAt: Date.now() };
      saveActivePointers(pointers);
    }
  }

  return {
    active: !isTerminal,
    setupId,
    direction: dd.signal,
    status: statusText,
    lifecycleStage: stage,
    entryLow: lo,
    entryHigh: hi,
    stopLoss: sl,
    target1: tp1,
    target2: Number.isFinite(tp2) ? tp2 : null,
    singleTarget,
    entryTouched,
    target1Secured,
    terminal: isTerminal,
    alignedWithForecast: true,
    geometryValid: true,
    invalidated: isTerminal,
    invalidationReason: invalidReason,
    liquidityTarget
  };
}

export function buildMappingExplanation(result) {
  const d = result?.amySmcD;
  if (!result || !d?.ready) {
    return {
      headline: 'Data market belum tersedia',
      action: 'Jangan mengambil keputusan entry.',
      reason: 'Belum ada hasil Amy-SMC-D dari candle tertutup yang valid.',
      confirmationNeeded: 'Tunggu candle tertutup dan pipeline REST Mapping.',
      invalidation: '-',
      marketContext: 'BELUM TERSEDIA',
      dataStatus: 'BELUM TERSEDIA'
    };
  }

  const dd = result.directionDecision || buildDirectionDecision(result);
  const se = result.setupExecution || buildSetupExecution(result);
  const descriptive = d.descriptive;
  const predictive = d.predictive;
  const sourceTime = Number(d.sourceCandle?.time || 0);
  const sourceLabel = sourceTime
    ? new Date(sourceTime * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })
    : '-';
  const stale = Boolean(result.dataStale || result.dataDegraded);
  const context = `HTF ${descriptive.htfSwing.direction}, Swing ${descriptive.swingStructure.direction}, Internal ${descriptive.internalStructure.direction}, Liquidity ${descriptive.liquidity.direction}.`;
  const dealingNote = `Dealing Range ${descriptive.dealingRange.location} bersifat descriptive-only dan tidak mengubah predictor.`;
  const invalidation = Number.isFinite(Number(dd.biasInvalidationLevel))
    ? `Level struktur ${p2(dd.biasInvalidationLevel)}`
    : 'Perubahan struktur pada candle tertutup berikutnya';

  if (predictive.nextMove.active && se.active && se.alignedWithForecast) {
    return {
      headline: `Amy-SMC-D Next Move ${predictive.nextMove.signal}`,
      action: `Rencana Eksekusi membaca Mapping sebagai consumer: ${se.status}.`,
      reason: `${context} ${dealingNote}`,
      confirmationNeeded: se.entryTouched
        ? 'Workflow entry sedang berjalan; Mapping tetap terkunci pada candle sumber.'
        : `Area entry ${p2(se.entryLow)}–${p2(se.entryHigh)} berasal dari modul eksekusi yang dipertahankan.`,
      invalidation: se.stopLoss ? `SL aplikasi ${p2(se.stopLoss)} (tidak dihitung ulang oleh Mapping).` : invalidation,
      marketContext: `FINAL BIAS ${descriptive.finalBias.direction} · NEXT MOVE ${predictive.nextMove.signal}`,
      dataStatus: stale ? 'LAST VALID CLOSED CANDLE' : 'CLOSED CANDLE',
      sourceCandleTime: sourceTime,
      sourceCandleLabel: sourceLabel
    };
  }

  if (predictive.nextMove.active) {
    return {
      headline: `Amy-SMC-D Next Move ${predictive.nextMove.signal}`,
      action: 'Mapping aktif; tunggu workflow Entry Map yang lengkap tanpa mengejar harga.',
      reason: `${context} ${dealingNote}`,
      confirmationNeeded: 'Rencana Eksekusi tetap consumer/read-only dan tidak boleh menimpa arah Mapping.',
      invalidation,
      marketContext: `FINAL BIAS ${descriptive.finalBias.direction} · NEXT MOVE ${predictive.nextMove.signal}`,
      dataStatus: stale ? 'LAST VALID CLOSED CANDLE' : 'CLOSED CANDLE',
      sourceCandleTime: sourceTime,
      sourceCandleLabel: sourceLabel
    };
  }

  return {
    headline: `Final Bias ${descriptive.finalBias.direction}; Next Move WAIT`,
    action: 'Tunggu event/regime Amy-SMC-D baru pada candle yang resmi tutup.',
    reason: `${context} ${dealingNote}`,
    confirmationNeeded: 'Final Bias adalah continuous context; WAIT tidak boleh dipaksa menjadi forecast.',
    invalidation,
    marketContext: `FINAL BIAS ${descriptive.finalBias.direction} · NEXT MOVE WAIT`,
    dataStatus: stale ? 'LAST VALID CLOSED CANDLE' : 'CLOSED CANDLE',
    sourceCandleTime: sourceTime,
    sourceCandleLabel: sourceLabel
  };
}

function publishMappingSnapshot(result = state.result) {
  const intel = window.AmyFXIntel;
  if (!intel?.write) return;

  const previous = intel.read?.()?.mapping || {};
  const price = Number(state.price || result?.price || previous.price || 0);
  const bsl = Number(result?.bsl || previous.bsl || 0);
  const ssl = Number(result?.ssl || previous.ssl || 0);
  const activeTargets = Array.isArray(result?.activeLiquidityTargets) ? result.activeLiquidityTargets : [];
  const levels = activeTargets.map(item => {
    const levelPrice = Number(item.level);
    return { type: item.type, price: levelPrice, distance: Number.isFinite(levelPrice) && price > 0 ? levelPrice - price : 0, status: item.status || 'ACTIVE', strength: item.strength || 'MEDIUM', source: item.source || 'MAPPING', timeframe: result?.tf || state.tf };
  }).filter(item => (item.type === 'BSL' || item.type === 'SSL') && Number.isFinite(item.price) && item.price > 0);

  if (!levels.some(item => item.type === 'BSL') && bsl > 0) levels.push({ type: 'BSL', price: bsl, distance: price > 0 ? bsl - price : 0, status: 'ACTIVE', source: 'MAPPING', timeframe: result?.tf || state.tf });
  if (!levels.some(item => item.type === 'SSL') && ssl > 0) levels.push({ type: 'SSL', price: ssl, distance: price > 0 ? ssl - price : 0, status: 'ACTIVE', source: 'MAPPING', timeframe: result?.tf || state.tf });

  const decision = result?.directionDecision || buildDirectionDecision(result);
  if (result && !result.directionDecision) result.directionDecision = decision;
  const execution = result?.setupExecution || buildSetupExecution(result);
  if (result && !result.setupExecution) result.setupExecution = execution;
  const explanation = result?.mappingExplanation || buildMappingExplanation(result);
  if (result && !result.mappingExplanation) result.mappingExplanation = explanation;
  const validated = result?.validatedMarketContext;
  const analysisUnavailable = Boolean(result?.dataStale && !result?.st && !validated?.marketState);
  if (result) {
    result.mappingSnapshot = buildMappingSnapshot(result, {
      candles: state.candles[result.tf] || [],
      livePrice: price,
      capturedAt: Date.now()
    });
  }

  intel.write('mapping', {
    ...previous,
    price,
    bsl,
    ssl,
    levels,
    timeframe: result?.tf || previous.timeframe || state.tf,
    bias: decision.bias,
    direction: decision.signal,
    status: execution.active ? execution.status : decision.status,
    directionDecision: decision,
    setupExecution: execution,
    mappingExplanation: explanation,
    mappingSnapshot: result?.mappingSnapshot || null,
    marketState: analysisUnavailable ? 'DATA TIDAK TERSEDIA' : (validated?.marketState?.state || result?.st?.trend || 'RANGE / TRANSITION'),
    directionForecast: decision.source === 'AMY_SMC_D_NEXT_MOVE' ? (validated?.directionForecast?.direction || 'NO CLEAR DIRECTION') : 'NO CLEAR DIRECTION',
    regime: analysisUnavailable ? 'TRANSITION' : 'AMY_SMC_D',
    strategy: analysisUnavailable ? 'NO_TRADE' : 'READ_ONLY_EXECUTION_CONSUMER',
    shiftRisk: 0,
    analyzedAt: result?.sourceCandleTime || result?.amySmcD?.sourceCandle?.time || Number(previous.analyzedAt || 0)
  });
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Mapping analysis request superseded');
  error.name = 'AbortError';
  throw error;
}

export async function fetchTf(tf, { signal } = {}) {
  throwIfAborted(signal);
  try {
    const params = new URLSearchParams({
      symbol: 'XAU/USD',
      interval: TF[tf],
      outputsize: '300'
    });
    const response = await fetch(`${PROXY_URL}?${params.toString()}`, {
      cache: 'no-store',
      signal
    });
    if (!response.ok) throw new Error(`Market HTTP ${response.status}`);
    const data = await response.json();
    throwIfAborted(signal);
    if (data.status === 'error') throw new Error(data.message || 'Fetch gagal');
    const payloadQuality = assertBackendPayloadFresh(data, `Candle ${tf}`);

    const raw = (data.values || []).filter(c => !c.amyfxSyntheticCurrent).slice().reverse();
    const closeCutoff = Date.now() - 10_000;
    const duration = timeframeDurationMs(tf);
    const candles = raw.map(c => ({
      time: normalizedMarketTimestamp(c.datetime) / 1000,
      timeframe: tf,
      open: +c.open,
      high: +c.high,
      low: +c.low,
      close: +c.close,
      tickCount: 1,
      isClosed: false
    })).map(candle => ({
      ...candle,
      isClosed: Number.isFinite(candle.time)
        && duration > 0
        && candle.time * 1000 + duration <= closeCutoff
    })).filter(candle =>
      candle.isClosed
      && [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
      && candle.high >= Math.max(candle.open, candle.close, candle.low)
      && candle.low <= Math.min(candle.open, candle.close, candle.high)
    );

    if (!candles.length) throw new Error(`Candle ${tf} kosong`);
    const sourceState = assertCurrentClosedCandleSource(tf, candles);
    throwIfAborted(signal);
    state.candles[tf] = candles;
    state.candleSourceState = {
      ...(state.candleSourceState || {}),
      [tf]: { ...sourceState, providerStale: !payloadQuality.fresh }
    };
    setCandleFetchedAt(tf, Date.now());
    return candles;
  } catch (err) {
    if (signal?.aborted) throw err;
    if (tf === 'M5' || tf === 'M15') {
      if (!state.candles.M1?.length) {
        try { await fetchTf('M1', { signal }); } catch (_) {}
      }
      const duration = timeframeDurationMs(tf);
      const candles = aggregateClosedCandles(state.candles.M1 || [], {
        timeframe: tf,
        durationMs: duration,
        sourceDurationMs: timeframeDurationMs('M1'),
        closeCutoff: Date.now() - 10_000
      });
      if (candles.length) {
        const sourceState = assertCurrentClosedCandleSource(tf, candles);
        state.candles[tf] = candles;
        state.candleSourceState = {
          ...(state.candleSourceState || {}),
          [tf]: { ...sourceState, providerStale: false, aggregatedFrom: 'M1_CLOSED' }
        };
        setCandleFetchedAt(tf, Date.now());
        return candles;
      }
    }
    throw err;
  }
}

function setupDirection(setup) {
  const value = String(setup?.dir || setup?.direction || '').toUpperCase();
  if (value.includes('BUY') || value.includes('BULL')) return 1;
  if (value.includes('SELL') || value.includes('BEAR')) return -1;
  return 0;
}

function applyCanonicalMappingContracts(result) {
  if (!result) return result;

  const forecast = result.validatedMarketContext?.directionForecast;
  const forecastActive = Boolean(forecast?.active);
  const forecastDirection = forecastActive ? Number(forecast.directionValue || 0) : 0;
  const causalSetups = Array.isArray(result.setups) ? [...result.setups] : [];
  const causalBestSetup = result.bestSetup || result.entryMap?.activeSetup || null;
  const setupVal = setupDirection(causalBestSetup);
  const setupConflict = Boolean(
    causalBestSetup
    && (!forecastActive || !forecastDirection || setupVal !== forecastDirection)
  );

  result.strategyRouter = {
    decision: 'Amy-SMC-D adalah satu-satunya directional Mapping authority.',
    activeRegime: 'AMY_SMC_D',
    activeStrategy: 'READ_ONLY_EXECUTION_CONSUMER',
    role: 'EXECUTION_CONSUMER_ONLY',
    mayOverrideValidatedMarketState: false,
    mayOverrideValidatedDirectionForecast: false,
    mayReplaceEntryMap: false,
    mayOverrideMapping: false,
    marketShiftHardGate: false
  };

  result.unroutedSetups = causalSetups;
  result.unroutedBestSetup = causalBestSetup;
  result.validatedSetupConflict = setupConflict;
  result.experimentalSetups = [];
  result.experimentalBestSetup = null;
  if (!forecastActive || setupConflict) {
    result.setups = [];
    result.bestSetup = null;
  } else {
    result.bestSetup = causalBestSetup;
    result.setups = causalBestSetup
      ? [causalBestSetup]
      : causalSetups.filter(Boolean);
  }

  const decision = buildDirectionDecision(result);
  result.directionDecision = decision;
  result.setupExecution = buildSetupExecution(result);
  result.mappingExplanation = buildMappingExplanation(result);
  result.bias = decision.bias;
  result.signal = decision.signal;
  result.statusText = decision.status;
  result.final = result.amySmcD?.descriptive?.finalBias?.direction || 'NEUTRAL';
  result.routerDecision = result.strategyRouter.decision;
  result.mappingSnapshot = buildMappingSnapshot(result, {
    candles: state.candles[result.tf] || [],
    livePrice: state.price || result.price,
    capturedAt: Date.now()
  });
  return result;
}

async function performAnalysis(tf, requestId, signal) {
  const isCurrentRequest = () => !signal.aborted && requestId === analysisSequence && state.tf === tf;
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
  state.tf = tf;
  render();

  try {
    log(`Memindai ${tf}...`);
    const group = tfGroup(tf);
    const scanGroup = [...new Set([
      ...group,
      'M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'
    ])];
    const refreshFailures = new Set();

    await Promise.all(scanGroup.map(async currentTf => {
      const isStale = isCandleStale(currentTf);
      if (!state.candles[currentTf]?.length || isStale) {
        try { await fetchTf(currentTf, { signal }); } catch (error) {
          if (signal.aborted || error?.name === 'AbortError') throw error;
          log(`Candle ${currentTf} belum diperbarui, memakai cache.`);
          if (isStale || !state.candles[currentTf]?.length) refreshFailures.add(currentTf);
        }
      }
      if (state.candleSourceState?.[currentTf]?.providerStale) {
        refreshFailures.add(currentTf);
      }
      return state.candles[currentTf] || [];
    }));
    if (!isCurrentRequest()) return;

    const currentDataUnavailable = !(state.candles[tf] || []).some(candle => candle?.isClosed !== false);
    if (currentDataUnavailable) {
      if (state.result?.tf === tf && state.result?.amySmcD?.ready) {
        const result = {
          ...state.result,
          dataStale: true,
          dataDegraded: true,
          dataStatus: 'LAST_VALID_CLOSED_CANDLE',
          dataStatusText: 'REST belum menyediakan candle tertutup baru; Mapping terakhir yang valid tetap ditampilkan.'
        };
        result.directionDecision = buildDirectionDecision(result);
        result.setupExecution = buildSetupExecution(result);
        result.mappingExplanation = buildMappingExplanation(result);
        state.result = result;
        save();
        publishMappingSnapshot(result);
        render();
        return;
      }
      log(`DATA USANG: Cache ${tf} kedaluwarsa & API gagal diperbarui.`);
      const result = {
        tf,
        price: state.price || 0,
        dataStale: true,
        statusText: 'DATA USANG',
        final: 'DATA USANG',
        signal: 'WAIT',
        bestSetup: null,
        entryMap: null,
        setups: [],
        experimentalSetups: [],
        experimentalBestSetup: null,
        routerDecision: 'DATA USANG — CACHE KEDALUWARSA & API GAGAL',
        marketState: { state: 'DATA USANG', detail: 'Cache kedaluwarsa & API gagal diperbarui.' },
        strategyRouter: { decision: 'DATA USANG — CACHE KEDALUWARSA & API GAGAL', activeRegime: 'TRANSITION', activeStrategy: 'NO_TRADE' }
      };
      result.directionDecision = buildDirectionDecision(result);
      result.setupExecution = buildSetupExecution(result);
      result.mappingExplanation = buildMappingExplanation(result);
      state.result = result;
      save();
      publishMappingSnapshot(result);
      sendTargetsToNative();
      notifyImportant(result);
      render();
      return;
    }

    const htfContext = { ...state.candles };
    let result = analyze(state.candles[tf], tf, {}, null, htfContext);
    if (!result?.st) throw new Error('Hasil analisis tidak valid');
    result = applyCanonicalMappingContracts(result);
    result.dataDegraded = refreshFailures.size > 0;
    result.dataWarnings = [...refreshFailures];
    result.candleSourceState = {
      ...(state.candleSourceState || {}),
      [tf]: inspectClosedCandleSource(tf, state.candles[tf] || [])
    };
    if (result.dataDegraded) {
      result.dataStatus = 'PARTIAL';
      result.dataStatusText = result.dataWarnings.length
        ? `Sebagian timeframe belum diperbarui: ${result.dataWarnings.join(', ')}. Analisis utama ${tf} tetap memakai data valid terakhir.`
        : 'Timeframe utama tersedia; pembaruan tambahan sedang dicoba ulang.';
    }
    result.mappingSnapshot = buildMappingSnapshot(result, {
      candles: state.candles[result.tf] || [],
      livePrice: state.price || result.price,
      capturedAt: Date.now()
    });

    state.result = result;
    state.setups = [...(result.setups || []), ...state.setups].slice(0, 50);
    state.analyses = [{ id: Date.now(), ...result }, ...state.analyses].slice(0, 80);
    save();
    publishMappingSnapshot(result);
    const validatedText = result.validatedDirectionForecast?.active
      ? `${result.validatedDirectionForecast.direction} · Amy-SMC-D Next Move`
      : result.validatedMarketState?.state;
    log(`${tf} selesai: ${validatedText || result.strategyRouter?.decision || result.signal}`);
    sendTargetsToNative();
    notifyImportant(result);
  } catch (error) {
    if (signal.aborted || error?.name === 'AbortError') return false;
    if (isCurrentRequest()) log(`Error ${tf}: ${error.message}`);
  }
  if (isCurrentRequest()) render();
  return isCurrentRequest();
}

export function runAnalysis(tf = state.tf) {
  if (document.hidden) return Promise.resolve(false);
  if (analysisInFlight?.tf === tf && !analysisInFlight.controller.signal.aborted) {
    return analysisInFlight.promise;
  }

  analysisController?.abort();
  const controller = new AbortController();
  analysisController = controller;
  const requestId = ++analysisSequence;
  const operation = { tf, requestId, controller, promise: null };
  operation.promise = performAnalysis(tf, requestId, controller.signal).finally(() => {
    if (analysisInFlight === operation) analysisInFlight = null;
    if (analysisController === controller) analysisController = null;
  });
  analysisInFlight = operation;
  return operation.promise;
}

function nativeLiveBridge() {
  return window.AmyLivePrice || null;
}

function nativeHasApiKey() {
  try {
    return nativeLiveBridge()?.hasApiKey?.() === true;
  } catch (_) {
    return false;
  }
}

function clearReconnectTimer() {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleLiveReconnect(reason = '') {
  if (document.hidden || reconnectTimer || !nativeHasApiKey()) return;
  const delay = LIVE_RECONNECT_DELAYS_MS[
    Math.min(reconnectAttempt, LIVE_RECONNECT_DELAYS_MS.length - 1)
  ];
  reconnectAttempt += 1;
  if (reason && Date.now() - lastErrorLogAt > 60_000) {
    lastErrorLogAt = Date.now();
    log(`Harga WebSocket mencoba tersambung kembali: ${reason}`);
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect({ force: true });
  }, delay);
}

function applyLivePriceTick(detail) {
  const price = Number(detail?.price);
  if (!Number.isFinite(price) || price <= 0) return false;

  let capturedAt;
  try {
    capturedAt = validateLiveTickPayload(detail);
  } catch (error) {
    scheduleLiveReconnect(error.message);
    return false;
  }

  if (capturedAt < Math.max(lastWsTickAt, Number(localStorage.getItem('last_ws_tick_at') || 0))) return false;
  lastWsTickAt = capturedAt;
  localStorage.setItem('last_ws_tick_at', String(lastWsTickAt));
  localStorage.setItem('last_price', String(price));
  state.price = price;
  state.conn = 'Connected';
  nativeLiveStarted = true;
  reconnectAttempt = 0;
  clearReconnectTimer();

  // WebSocket is display-only. Mapping and lifecycle remain bound to closed candles.
  renderAnalyzeLive();
  renderSoft();
  return true;
}

function handleNativeLiveStatus(detail) {
  const status = String(detail?.status || '').toUpperCase();
  const message = String(detail?.message || '').trim();

  if (status === 'KEY_REQUIRED' || status === 'KEY_INVALID' || status === 'KEY_REJECTED') {
    nativeLiveStarted = false;
    clearReconnectTimer();
    state.conn = 'Key Required';
    render();
    return;
  }

  if (status === 'CONNECTING') {
    state.conn = 'Connecting';
    renderSoft();
    return;
  }

  if (status === 'CONNECTED' || status === 'SUBSCRIBED') {
    nativeLiveStarted = true;
    reconnectAttempt = 0;
    state.conn = 'Connected';
    renderSoft();
    return;
  }

  if (status === 'ERROR' || status === 'CLOSED') {
    nativeLiveStarted = false;
    state.conn = 'Offline';
    renderSoft();
    scheduleLiveReconnect(message || 'koneksi terputus');
  }
}

window.addEventListener('amyfx:twelvedata-price', event => {
  applyLivePriceTick(event?.detail || {});
});

window.addEventListener('amyfx:twelvedata-status', event => {
  handleNativeLiveStatus(event?.detail || {});
});

export function connect({ force = false } = {}) {
  if (document.hidden) return false;
  const bridge = nativeLiveBridge();
  if (!bridge?.connect || !bridge?.hasApiKey) {
    nativeLiveStarted = false;
    state.conn = 'Offline';
    renderSoft();
    if (Date.now() - lastErrorLogAt > 60_000) {
      lastErrorLogAt = Date.now();
      log('Bridge harga WebSocket tidak tersedia.');
    }
    return false;
  }

  if (!nativeHasApiKey()) {
    nativeLiveStarted = false;
    clearReconnectTimer();
    state.conn = 'Key Required';
    render();
    return false;
  }

  clearReconnectTimer();
  if (force) {
    try { bridge.disconnect?.(); } catch (_) {}
    nativeLiveStarted = false;
  } else if (nativeLiveStarted) {
    return true;
  }

  state.conn = 'Connecting';
  renderSoft();
  let started = false;
  try {
    started = bridge.connect() === true;
  } catch (_) {
    started = false;
  }
  nativeLiveStarted = started;
  if (!started) {
    state.conn = 'Offline';
    renderSoft();
    scheduleLiveReconnect('gagal memulai koneksi');
  }
  if (!state.candles[state.tf]?.length) runAnalysis(state.tf);
  return started;
}

export function isLivePriceRunning() {
  return nativeLiveStarted || reconnectTimer !== null;
}

export function stopLivePrice() {
  clearReconnectTimer();
  try { nativeLiveBridge()?.disconnect?.(); } catch (_) {}
  nativeLiveStarted = false;
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
  state.conn = 'Offline';
  renderSoft();
}
