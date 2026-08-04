const CURRENT_ENGINE_VERSION = 'amyfx-preview-scalper-pattern-v3.0';
const ENTRY_ACTIVE_STATUSES = new Set(['ACTIVE']);
const NON_TERMINAL_STATUSES = new Set(['WAITING_TRIGGER', 'WAITING_NEXT_OPEN', 'ENTRY_READY', 'ACTIVE', 'BE_ACTIVE']);

let applying = false;
let applyQueued = false;
let lastSignature = '';
let lastResult = null;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function direction(value) {
  const text = String(value || '').toUpperCase();
  if (text.includes('BUY') || text.includes('BULL')) return 'BUY';
  if (text.includes('SELL') || text.includes('BEAR')) return 'SELL';
  return 'WAIT';
}

function statusText(status) {
  return ({
    WAITING_TRIGGER: 'WAITING_FOR_TRIGGER',
    WAITING_NEXT_OPEN: 'WAITING_NEXT_OPEN',
    ENTRY_READY: 'WAITING_NEXT_OPEN',
    ACTIVE: 'ENTRY CONFIRMED · SCALPER ENGINE',
    BE_ACTIVE: 'TP1 HIT / BE'
  })[String(status || '').toUpperCase()] || 'WAITING_FOR_SCALPER_SETUP';
}

function lifecycleStage(status) {
  return ({
    WAITING_TRIGGER: 'WAITING_FOR_CLOSE',
    WAITING_NEXT_OPEN: 'WAITING_FOR_CLOSE',
    ENTRY_READY: 'WAITING_FOR_CLOSE',
    ACTIVE: 'ENTRY_TRIGGERED',
    BE_ACTIVE: 'TP1 HIT / BE'
  })[String(status || '').toUpperCase()] || 'WAITING_FOR_AREA';
}

function validCurrentSetup(setup) {
  return Boolean(
    setup
    && setup.isLegacy !== true
    && setup.engineVersion === CURRENT_ENGINE_VERSION
    && NON_TERMINAL_STATUSES.has(String(setup.status || '').toUpperCase())
    && ['BUY', 'SELL'].includes(direction(setup.direction))
  );
}

function setupSignature(setup, availability, mappingAlignment) {
  return JSON.stringify({
    availability,
    mappingAlignment,
    id: setup?.id || null,
    engineVersion: setup?.engineVersion || null,
    status: setup?.status || null,
    direction: setup?.direction || null,
    entry: setup?.entry ?? null,
    stopLoss: setup?.stopLoss ?? null,
    tp1: setup?.tp1 ?? setup?.breakEvenTrigger ?? null,
    tp2: setup?.tp2 ?? setup?.target ?? null,
    tp1Hit: setup?.tp1Hit === true,
    lifecycleSequence: setup?.lifecycleSequence ?? null,
    patternGate: setup?.patternGate || null,
    updatedAt: setup?.updatedAt || null
  });
}

function geometry(setup, side) {
  const entry = number(setup?.entry);
  const stop = number(setup?.stopLoss);
  const tp1 = number(setup?.tp1 ?? setup?.breakEvenTrigger);
  const tp2 = number(setup?.tp2 ?? setup?.target);
  const valid = entry != null && stop != null && tp1 != null && tp2 != null
    && (side === 'BUY'
      ? stop < entry && tp1 > entry && tp2 >= tp1
      : stop > entry && tp1 < entry && tp2 <= tp1);
  return { entry, stop, tp1, tp2, valid };
}

function mappingDirection(result) {
  const preserved = result?.mappingContextBeforeScalper || {};
  const decision = preserved.directionDecision || result?.directionDecision || {};
  const forecast = result?.validatedMarketContext?.directionForecast
    || result?.validatedDirectionForecast;
  if (forecast?.active) return direction(forecast.direction);
  const decided = direction(decision.signal || decision.bias);
  if (decided !== 'WAIT') return decided;
  return direction(
    result?.validatedMarketContext?.marketState?.direction
    || result?.validatedMarketState?.direction
    || result?.st?.confirmedTrend
  );
}

function alignmentFor(result, side) {
  const mapping = mappingDirection(result);
  const aligned = ['BUY', 'SELL'].includes(mapping) && mapping === side;
  return {
    aligned,
    mappingDirection: mapping,
    scalperDirection: side,
    reason: aligned
      ? `Scalper ${side} selaras dengan Mapping ${mapping}.`
      : mapping === 'WAIT'
        ? `Mapping belum memberi arah resmi untuk memvalidasi Scalper ${side}.`
        : `Scalper ${side} bertentangan dengan Mapping ${mapping}.`
  };
}

function waitAuthority(availability) {
  const unavailable = availability !== 'LIVE';
  const waitStatus = unavailable ? 'WAITING_FOR_SCALPER_UPDATE' : 'WAITING_FOR_SCALPER_SETUP';
  return {
    authority: 'SCALPER_ENGINE_EXECUTION_AUTHORITY',
    engineVersion: CURRENT_ENGINE_VERSION,
    setup: null,
    mappingAlignment: { aligned: false, mappingDirection: 'WAIT', scalperDirection: 'WAIT', reason: 'Belum ada setup Scalper.' },
    directionDecision: {
      bias: 'WAIT',
      signal: 'WAIT',
      source: 'SCALPER_ENGINE_EXECUTION_AUTHORITY',
      status: waitStatus,
      invalidated: unavailable,
      invalidationReason: unavailable ? 'Snapshot Scalper belum diperbarui.' : ''
    },
    setupExecution: {
      active: false,
      setupId: '',
      direction: 'WAIT',
      status: waitStatus,
      lifecycleStage: 'WAITING_FOR_AREA',
      entryLow: null,
      entryHigh: null,
      stopLoss: null,
      target1: null,
      target2: null,
      singleTarget: false,
      entryTouched: false,
      target1Secured: false,
      terminal: false,
      alignedWithForecast: false,
      geometryValid: false,
      invalidated: unavailable,
      invalidationReason: unavailable
        ? 'Snapshot Scalper belum diperbarui; entry tetap WAIT.'
        : 'Scalper Engine belum memilih setup aktif.',
      authority: 'SCALPER_ENGINE_EXECUTION_AUTHORITY'
    },
    entryWatch: {
      active: false,
      terminal: false,
      entryAllowed: false,
      status: waitStatus,
      lifecycleStage: 'WAITING_FOR_AREA',
      executionPlan: { locked: false, tp1Hit: false },
      authority: 'SCALPER_ENGINE_EXECUTION_AUTHORITY'
    }
  };
}

function activeAuthority(setup, availability, result) {
  const side = direction(setup.direction);
  const rawStatus = String(setup.status || '').toUpperCase();
  const levels = geometry(setup, side);
  const fresh = availability === 'LIVE';
  const alignment = alignmentFor(result, side);
  const tp1Secured = setup.tp1Hit === true;
  const entryActive = ENTRY_ACTIVE_STATUSES.has(rawStatus)
    && fresh
    && levels.valid
    && alignment.aligned
    && !tp1Secured;
  const entryLow = levels.entry ?? number(setup.zoneBottom);
  const entryHigh = levels.entry ?? number(setup.zoneTop);
  const stage = tp1Secured ? 'TP1_HIT_NO_BE' : lifecycleStage(rawStatus);
  const baseStatus = tp1Secured ? 'TP1 HIT · SL TETAP' : statusText(rawStatus);
  const status = alignment.aligned ? baseStatus : `WAIT · ${alignment.reason}`;
  const setupId = String(setup.id || '');
  const driverName = String(setup.driverName || setup.driverId || setup.model || 'Scalper Engine');

  const normalizedSetup = {
    id: setupId,
    setupId,
    type: driverName,
    model: setup.model,
    driverId: setup.driverId,
    driverName,
    driverRuleVersion: setup.driverRuleVersion,
    engineVersion: setup.engineVersion,
    tf: setup.timeframe || 'M15',
    timeframe: setup.timeframe || 'M15',
    dir: side,
    direction: side,
    status,
    lifecycleStatus: status,
    lifecycleStage: stage,
    entry: levels.entry,
    entryLow,
    entryHigh,
    sl: levels.stop,
    initialSl: number(setup.initialStopLoss) ?? levels.stop,
    tp1: levels.tp1,
    tp2: levels.tp2,
    singleTarget: false,
    targetR: levels.entry != null && levels.stop != null && levels.tp2 != null
      ? Math.abs(levels.tp2 - levels.entry) / Math.max(Math.abs(levels.entry - levels.stop), Number.EPSILON)
      : null,
    live: true,
    executionMode: 'SCALPER_ENGINE_EXECUTION_AUTHORITY',
    timestamp: number(setup.entryTimestamp ?? setup.entryCandleOpenTime ?? setup.signalCandleCloseTime),
    reason: setup.reason || `${driverName} dipilih oleh Scalper Engine.`,
    targetType: 'SCALPER_ENGINE_TARGET',
    source: 'AMY_SCALPER_ENGINE_PATTERN_V3',
    mappingAlignment: alignment
  };

  const invalid = !fresh || !levels.valid || !alignment.aligned;
  const invalidationReason = !fresh
    ? 'Snapshot Scalper belum diperbarui; entry tetap WAIT.'
    : !levels.valid
      ? 'Geometri entry, Stop Loss, atau target Scalper Engine tidak valid.'
      : !alignment.aligned
        ? alignment.reason
        : '';

  return {
    authority: 'SCALPER_ENGINE_EXECUTION_AUTHORITY',
    engineVersion: CURRENT_ENGINE_VERSION,
    setup: normalizedSetup,
    mappingAlignment: alignment,
    directionDecision: {
      bias: alignment.aligned ? side : 'WAIT',
      signal: alignment.aligned ? side : 'WAIT',
      source: 'SCALPER_ENGINE_EXECUTION_AUTHORITY',
      status: `${driverName} · ${setup.timeframe || 'M15'} · ${status}`,
      invalidated: invalid,
      invalidationReason
    },
    setupExecution: {
      active: entryActive || (tp1Secured && alignment.aligned && fresh),
      setupId,
      direction: side,
      status,
      lifecycleStage: stage,
      entryLow,
      entryHigh,
      stopLoss: levels.stop,
      initialStopLoss: number(setup.initialStopLoss) ?? levels.stop,
      target1: levels.tp1,
      target2: levels.tp2,
      singleTarget: false,
      entryTouched: entryActive || tp1Secured,
      target1Secured: tp1Secured,
      terminal: false,
      alignedWithForecast: alignment.aligned,
      mappingDirection: alignment.mappingDirection,
      geometryValid: levels.valid,
      invalidated: invalid,
      invalidationReason,
      liquidityTarget: levels.tp2 == null ? null : { type: 'SCALPER_ENGINE_TARGET', level: levels.tp2 },
      driverId: setup.driverId,
      driverName,
      timeframe: setup.timeframe || 'M15',
      authority: 'SCALPER_ENGINE_EXECUTION_AUTHORITY'
    },
    entryWatch: {
      active: entryActive || (tp1Secured && alignment.aligned && fresh),
      terminal: false,
      entryAllowed: entryActive,
      direction: side,
      status,
      lifecycleStage: stage,
      executionPlan: {
        locked: entryActive || (tp1Secured && alignment.aligned && fresh),
        entry: levels.entry,
        entryLow,
        entryHigh,
        sl: levels.stop,
        initialSl: number(setup.initialStopLoss) ?? levels.stop,
        tp1: levels.tp1,
        tp2: levels.tp2,
        tp1Hit: tp1Secured
      },
      mappingAlignment: alignment,
      authority: 'SCALPER_ENGINE_EXECUTION_AUTHORITY'
    }
  };
}

function cloneSnapshot(snapshot, authority, scenario) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  return {
    ...snapshot,
    execution: authority.setupExecution,
    scenario,
    authority: {
      ...(snapshot.authority || {}),
      entry: 'AMY_SCALPER_ENGINE_PATTERN_V3',
      execution: 'SCALPER_ENGINE_EXECUTION_AUTHORITY',
      uiMayMutate: false
    }
  };
}

function publishMarketState(result) {
  const marketState = window.AmyFXMarketState;
  if (!marketState || typeof marketState !== 'object' || Object.isFrozen(marketState)) return;
  try {
    marketState.result = result;
    marketState.executionAuthority = result.scalperExecutionAuthority;
  } catch (_) {}
}

function applyAuthority() {
  applyQueued = false;
  if (applying) return false;
  const runtime = window.AmyFXScalperState || {};
  const payload = runtime.payload || null;
  if (!payload?.ok) return false;
  const availability = String(runtime.availability || 'DATA BELUM TERSEDIA');
  const primary = validCurrentSetup(payload.primary) ? payload.primary : null;
  const result = window.state?.result || window.AmyFXMarketState?.result || null;
  if (!result) return false;

  if (!result.mappingContextBeforeScalper) {
    result.mappingContextBeforeScalper = {
      directionDecision: result.directionDecision || null,
      setupExecution: result.setupExecution || null,
      entryMapSetup: result.entryMap?.setup || null,
      entryWatch: result.entryWatch || null
    };
  }

  const previewAlignment = primary
    ? alignmentFor(result, direction(primary.direction))
    : { aligned: false, mappingDirection: mappingDirection(result), scalperDirection: 'WAIT' };
  const signature = setupSignature(primary, availability, previewAlignment);
  if (lastResult === result && lastSignature === signature) return false;

  applying = true;
  try {
    const authority = primary
      ? activeAuthority(primary, availability, result)
      : waitAuthority(availability);
    const originalScenario = result.mappingContextBeforeScalper?.entryWatch?.scenario
      || result.mappingSnapshot?.scenario
      || result.entryMap?.scenario
      || {};
    const activeStatus = ENTRY_ACTIVE_STATUSES.has(String(primary?.status || '').toUpperCase());
    const scenario = primary
      ? {
          ...originalScenario,
          tf: primary.timeframe || result.tf || 'M15',
          triggerTf: primary.timeframe || result.tf || 'M15',
          direction: authority.setupExecution.active ? direction(primary.direction) : 'WAIT',
          candidateDirection: direction(primary.direction),
          status: authority.setupExecution.status,
          missing: [
            ...(activeStatus ? [] : ['NEXT OPEN / ENTRY LOCK']),
            ...(authority.mappingAlignment.aligned ? [] : ['MAPPING ALIGNMENT'])
          ],
          requirements: [
            {
              label: 'SCALPER SNAPSHOT',
              passed: availability === 'LIVE',
              detail: availability === 'LIVE' ? 'Snapshot Scalper aktif.' : 'Snapshot Scalper belum diperbarui.'
            },
            {
              label: 'SCALPER DRIVER',
              passed: true,
              detail: `${primary.driverName || primary.driverId} ${primary.timeframe || 'M15'} dipilih sebagai kandidat.`
            },
            {
              label: 'MAPPING ALIGNMENT',
              passed: authority.mappingAlignment.aligned,
              detail: authority.mappingAlignment.reason
            },
            {
              label: 'ENTRY LOCK',
              passed: activeStatus && authority.mappingAlignment.aligned,
              detail: authority.setupExecution.status
            }
          ],
          source: 'SCALPER_ENGINE_EXECUTION_AUTHORITY'
        }
      : originalScenario;

    result.scalperExecutionAuthority = {
      ...authority,
      availability,
      generatedAt: payload.generatedAt || null,
      engine: payload.engine || null
    };
    result.executionDirectionDecision = authority.directionDecision;
    result.setupExecution = authority.setupExecution;
    result.entryWatch = { ...authority.entryWatch, scenario };
    result.entryMap = {
      ...(result.entryMap || {}),
      setup: authority.setup,
      scenario,
      source: 'SCALPER_ENGINE_EXECUTION_AUTHORITY'
    };
    result.mappingSnapshot = cloneSnapshot(result.mappingSnapshot, authority, scenario);

    if (result.mappingContextBeforeScalper?.directionDecision) {
      result.directionDecision = result.mappingContextBeforeScalper.directionDecision;
    }

    publishMarketState(result);
    window.AmyFXExecutionAuthority = Object.freeze({
      source: 'SCALPER_ENGINE_EXECUTION_AUTHORITY',
      engineVersion: CURRENT_ENGINE_VERSION,
      primarySetupId: primary?.id || null,
      availability,
      mappingAlignment: authority.mappingAlignment,
      updatedAt: Date.now()
    });

    const placeholder = document.querySelector('#amy-scalper-entry-watch .scalper-watch__instruction');
    if (placeholder && /IFVG|FVG BUY High Quality/i.test(placeholder.textContent || '')) {
      placeholder.textContent = '';
    }

    lastResult = result;
    lastSignature = signature;
    window.dispatchEvent(new CustomEvent('amyfx:entry-watch-updated', {
      detail: {
        watch: result.entryWatch,
        scenario,
        readOnly: true,
        authority: 'SCALPER_ENGINE_EXECUTION_AUTHORITY'
      }
    }));
    window.dispatchEvent(new CustomEvent('amyfx:execution-authority-updated', {
      detail: result.scalperExecutionAuthority
    }));
    window.render?.();
    return true;
  } finally {
    applying = false;
  }
}

function scheduleApply() {
  if (applyQueued) return;
  applyQueued = true;
  queueMicrotask(applyAuthority);
}

window.addEventListener('amyfx:scalper-state-change', scheduleApply);
window.addEventListener('amyfx:candles-updated', scheduleApply);
window.addEventListener('amyfx:mapping-state-change', scheduleApply);

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleApply, { once: true });
else scheduleApply();

export { applyAuthority as applyScalperExecutionAuthority };
