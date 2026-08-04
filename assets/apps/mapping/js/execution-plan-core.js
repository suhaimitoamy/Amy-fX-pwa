const ACTIVE_DIRECTIONS = new Set(['BUY', 'SELL']);
const TERMINAL_STATUS = /(TP2 HIT|TP1 \/ BE|SL HIT|STOPPED|TARGET_HIT|EXPIRED|INVALID|LEVEL_RETIRED|RETIRED|TERMINAL|SETUP REPLACED|SETUP NO LONGER ACTIVE)/i;
const FORECAST_PAUSED = /(FORECAST_INVALIDATED|FORECAST INVALIDATED|FORECAST_PAUSED|FORECAST PAUSED)/i;
const NON_BLOCKING_SCALPER_CONFLICT = /(QUOTE_MAPPING_TIMESTAMP_SKEW|BSL_SOURCE_DIFFERENCE|SSL_SOURCE_DIFFERENCE|HTF.*LOCAL|MACRO.*SCALP)/i;

function clean(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positivePrice(value) {
  const number = finite(value);
  return number != null && number > 0 ? number : null;
}

function direction(value) {
  const text = upper(value);
  if (text.includes('BUY') || text.includes('BULL')) return 'BUY';
  if (text.includes('SELL') || text.includes('BEAR')) return 'SELL';
  return null;
}

function clone(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return fallback;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function timestamp(value) {
  const numeric = Number(value);
  const milliseconds = Number.isFinite(numeric) && numeric > 0
    ? (numeric < 10_000_000_000 ? numeric * 1_000 : numeric)
    : new Date(value || 0).getTime();
  return Number.isFinite(milliseconds) && milliseconds > 86_400_000
    ? milliseconds
    : null;
}

function isoTime(value) {
  const milliseconds = timestamp(value);
  return milliseconds ? new Date(milliseconds).toISOString() : null;
}

function witaTime(value) {
  const milliseconds = timestamp(value);
  if (!milliseconds) return 'Belum tersedia';
  try {
    return `${new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Makassar',
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: false
    }).format(new Date(milliseconds))} WITA`;
  } catch (_) {
    return new Date(milliseconds).toISOString();
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((output, key) => {
    output[key] = stable(value[key]);
    return output;
  }, {});
}

function uniqueTexts(values) {
  const seen = new Set();
  return values
    .map(clean)
    .filter(value => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function conflictText(value) {
  if (typeof value === 'string') return clean(value);
  if (!value || typeof value !== 'object') return '';
  return clean(value.note || value.reason || value.message || value.label || value.code || value.type);
}

function normalizeRequirements(scenario) {
  const requirements = Array.isArray(scenario?.requirements) ? scenario.requirements : [];
  return requirements.map(item => ({
    label: upper(item?.label),
    passed: item?.passed === true,
    detail: clean(item?.detail)
  })).filter(item => item.label);
}

function requirementLabel(label, focusDirection, timeframe) {
  const side = focusDirection === 'BUY' ? 'SSL' : focusDirection === 'SELL' ? 'BSL' : 'liquidity';
  const structure = focusDirection === 'BUY' ? 'bullish' : focusDirection === 'SELL' ? 'bearish' : 'searah Mapping';
  const tf = clean(timeframe) || 'timeframe aktif';
  const labels = {
    DATA: `Menunggu data candle ${tf} yang sudah close dan cukup.`,
    DIRECTION: 'Menunggu Direction Forecast resmi menetapkan arah.',
    'OPPOSING LIQUIDITY SWEEP': `Menunggu ${side} disapu dan reaksi sweep dikonfirmasi Mapping.`,
    'DISPLACED MSS': `Menunggu displaced MSS ${structure} ${tf} dari candle yang sudah close.`,
    'HTF ALIGNMENT': 'Menunggu konteks timeframe Mapping resmi selaras.',
    'EMA STACK': 'Menunggu filter EMA resmi terpenuhi.',
    'EMA DISTANCE': 'Menunggu jarak EMA resmi memenuhi filter.',
    SESSION: 'Menunggu session resmi yang diizinkan Mapping.',
    'DEALING LOCATION': 'Menunggu harga berada di dealing location resmi.',
    'CLOSE LOCATION': 'Menunggu candle konfirmasi close pada lokasi yang mendukung.',
    'STRUCTURAL TARGET ≥ 2R': 'Menunggu target struktural resmi yang memenuhi filter Mapping.'
  };
  return labels[label] || `Menunggu syarat resmi ${label.toLowerCase()}.`;
}

function passedRequirementLabel(item, focusDirection, timeframe) {
  const side = focusDirection === 'BUY' ? 'SSL' : focusDirection === 'SELL' ? 'BSL' : 'Liquidity';
  const structure = focusDirection === 'BUY' ? 'bullish' : focusDirection === 'SELL' ? 'bearish' : 'searah Mapping';
  const tf = clean(timeframe) || 'timeframe aktif';
  const labels = {
    DATA: `Data candle ${tf} tertutup tersedia.`,
    DIRECTION: `Direction Forecast resmi memprioritaskan ${focusDirection || 'arah setup'}.`,
    'OPPOSING LIQUIDITY SWEEP': `${side} sudah disapu dan dikonfirmasi oleh Mapping.`,
    'DISPLACED MSS': `Displaced MSS ${structure} ${tf} sudah terkonfirmasi.`,
    'HTF ALIGNMENT': 'Konteks timeframe Mapping resmi sudah selaras.',
    'EMA STACK': 'Filter EMA stack resmi sudah terpenuhi.',
    'EMA DISTANCE': 'Filter jarak EMA resmi sudah terpenuhi.',
    SESSION: 'Filter session resmi sudah terpenuhi.',
    'DEALING LOCATION': 'Dealing location resmi sudah terpenuhi.',
    'CLOSE LOCATION': 'Lokasi close candle konfirmasi sudah valid.',
    'STRUCTURAL TARGET ≥ 2R': 'Target struktural resmi sudah tersedia.'
  };
  const base = labels[item.label] || `${item.label} sudah terpenuhi.`;
  return item.detail && !/tidak menjadi hard gate/i.test(item.detail)
    ? `${base} ${item.detail}`
    : base;
}

function setupDirection(setup) {
  return direction(setup?.dir || setup?.direction);
}

function meaningfulExecution(execution) {
  if (!execution || typeof execution !== 'object') return false;
  return Boolean(
    clean(execution.setupId)
    || positivePrice(execution.entryLow)
    || positivePrice(execution.entryHigh)
    || positivePrice(execution.stopLoss)
    || positivePrice(execution.target1)
  );
}

function latestClosedCandle(input, result, snapshot) {
  const candlesByTf = input?.runtimeState?.candles
    || input?.marketState?.candles
    || {};
  const candidates = [
    result?.tf,
    snapshot?.timeframe,
    input?.marketState?.timeframe,
    'M15', 'M5', 'M1', 'M30', 'H1'
  ].filter(Boolean);

  for (const timeframe of [...new Set(candidates)]) {
    const candles = Array.isArray(candlesByTf?.[timeframe]) ? candlesByTf[timeframe] : [];
    const candle = [...candles].reverse().find(item =>
      item?.isClosed !== false
      && timestamp(item?.time)
      && positivePrice(item?.close)
    );
    if (candle) return { timeframe, candle };
  }
  return null;
}

function freshnessFrom(input, result, snapshot) {
  const supplied = typeof input?.mappingFreshness === 'object'
    ? input.mappingFreshness
    : { state: input?.mappingFreshness };
  const internalState = upper(
    supplied?.state
    || snapshot?.freshness?.state
    || (result?.dataStale ? 'STALE' : '')
    || 'UNKNOWN'
  );
  const internalStale = /STALE/.test(internalState);
  const internalExpired = /EXPIRED/.test(internalState);
  const executable = !internalStale && !internalExpired;
  const closed = latestClosedCandle(input, result, snapshot);
  const sourceTime = timestamp(
    snapshot?.freshness?.sourceCandleTime
    || snapshot?.sourceCandle?.time
    || closed?.candle?.time
    || input?.marketState?.mappingCapturedAt
    || input?.marketState?.capturedAt
  );
  const hasAnalysis = Boolean(
    result?.st
    || result?.validatedMarketContext?.marketState
    || snapshot?.facts?.structure
    || snapshot?.context?.marketState
  );

  if (sourceTime || closed) {
    return {
      state: 'CLOSED_CANDLE',
      valid: true,
      executable,
      stale: internalStale,
      expired: internalExpired,
      label: 'CANDLE TERTUTUP',
      sourceTime,
      sourceTimeframe: closed?.timeframe || result?.tf || snapshot?.timeframe || null,
      internalState
    };
  }

  if (hasAnalysis) {
    return {
      state: 'ANALYSIS_AVAILABLE',
      valid: true,
      executable,
      stale: internalStale,
      expired: internalExpired,
      label: 'ANALISIS TERAKHIR',
      sourceTime: null,
      sourceTimeframe: result?.tf || snapshot?.timeframe || null,
      internalState
    };
  }

  return {
    state: 'UNAVAILABLE',
    valid: false,
    executable: false,
    stale: false,
    expired: false,
    label: 'BELUM TERSEDIA',
    sourceTime: null,
    sourceTimeframe: null,
    internalState
  };
}

function lifecycleStatus(execution, setup, watch, scenario) {
  return clean(
    execution?.status
    || setup?.lifecycleStatus
    || setup?.status
    || watch?.status
    || scenario?.status
    || 'WAIT'
  );
}

function terminalState(execution, setup, watch, status) {
  const hasSetup = meaningfulExecution(execution) || Boolean(setup);
  const targetOneSecured = Boolean(
    execution?.target1Secured
    || setup?.tp1Hit
    || watch?.executionPlan?.tp1Hit
    || /TP1 HIT/i.test(status)
  );
  const terminal = Boolean(
    hasSetup
    && (
      execution?.terminal === true
      || setup?.live === false
      || watch?.terminal === true
      || TERMINAL_STATUS.test(status)
    )
  );
  return { hasSetup, terminal, targetOneSecured };
}

function officialLevels(execution, setup, watch, scenario) {
  const plan = watch?.executionPlan || null;
  const low = positivePrice(execution?.entryLow)
    ?? positivePrice(setup?.entryLow)
    ?? positivePrice(plan?.entryLow);
  const high = positivePrice(execution?.entryHigh)
    ?? positivePrice(setup?.entryHigh)
    ?? positivePrice(plan?.entryHigh);
  return {
    entry: positivePrice(setup?.entry) ?? positivePrice(plan?.entry)
      ?? (low != null && high != null && low === high ? low : null),
    entryLow: low,
    entryHigh: high,
    stopLoss: positivePrice(execution?.stopLoss)
      ?? positivePrice(setup?.sl)
      ?? positivePrice(plan?.sl),
    initialStopLoss: positivePrice(execution?.initialStopLoss)
      ?? positivePrice(setup?.initialSl)
      ?? positivePrice(plan?.initialSl),
    tp1: positivePrice(execution?.target1)
      ?? positivePrice(setup?.tp1)
      ?? positivePrice(plan?.tp1),
    tp2: positivePrice(execution?.target2)
      ?? positivePrice(setup?.tp2)
      ?? positivePrice(plan?.tp2),
    rr: finite(setup?.targetR)
      ?? finite(setup?.tradeManagement?.tp2R)
      ?? finite(scenario?.target?.rr)
      ?? null
  };
}

function watchArea({ decision, levels, scenario, result, snapshot }) {
  if (decision === 'BUY' || decision === 'SELL') {
    return {
      kind: 'ENTRY',
      low: levels.entryLow,
      high: levels.entryHigh,
      level: levels.entry,
      source: 'OFFICIAL_EXECUTION_PLAN',
      label: 'Area entry resmi'
    };
  }

  const poiLow = positivePrice(scenario?.poi?.bottom ?? scenario?.poi?.low);
  const poiHigh = positivePrice(scenario?.poi?.top ?? scenario?.poi?.high);
  if (poiLow != null || poiHigh != null) {
    const values = [poiLow, poiHigh].filter(value => value != null);
    return {
      kind: 'WATCH',
      low: Math.min(...values),
      high: Math.max(...values),
      level: values.length === 1 ? values[0] : null,
      source: 'OFFICIAL_SCENARIO_POI',
      label: clean(scenario?.poi?.kind || scenario?.poi?.type || 'Area pantauan resmi')
    };
  }

  const focus = direction(
    result?.setupExecution?.direction
    || result?.entryMap?.scenario?.direction
    || result?.directionDecision?.bias
  );
  const expectedType = focus === 'BUY' ? 'SSL' : focus === 'SELL' ? 'BSL' : '';
  const expectedLevel = expectedType === 'SSL'
    ? positivePrice(result?.ssl) ?? positivePrice(snapshot?.facts?.liquidity?.ssl)
    : expectedType === 'BSL'
      ? positivePrice(result?.bsl) ?? positivePrice(snapshot?.facts?.liquidity?.bsl)
      : null;
  if (expectedLevel != null) {
    return {
      kind: 'WATCH',
      low: expectedLevel,
      high: expectedLevel,
      level: expectedLevel,
      source: 'OFFICIAL_LIQUIDITY_LEVEL',
      label: `${expectedType} aktif`
    };
  }

  return {
    kind: 'UNAVAILABLE',
    low: null,
    high: null,
    level: null,
    source: null,
    label: 'Belum tersedia — menunggu setup resmi.'
  };
}

function structuralTarget(execution, setup, scenario) {
  const type = clean(
    execution?.liquidityTarget?.type
    || setup?.targetType
    || scenario?.target?.type
  );
  const subtype = clean(setup?.targetSubtype || scenario?.target?.subtype);
  const level = positivePrice(
    execution?.liquidityTarget?.level
    ?? scenario?.target?.level
    ?? setup?.tp2
  );
  return {
    type: type || null,
    subtype: subtype || null,
    level
  };
}

function contextFields(result, snapshot, conflicts) {
  const validated = result?.validatedMarketContext || snapshot?.context || {};
  const marketState = validated?.marketState || snapshot?.context?.marketState || {};
  const htf = result?.htfNarrative || snapshot?.context?.htfNarrative || {};
  const structure = snapshot?.facts?.structure || result?.st || {};
  const dealing = result?.dealingRange || snapshot?.context?.dealingRange || {};
  const dealingLocation = clean(
    result?.premiumDiscountZone
    || result?.zone
    || result?.entryMap?.scenario?.location?.zone
    || dealing?.zone
  );
  return {
    higherTimeframeBias: upper(htf?.htfBias || htf?.bias || 'NEUTRAL'),
    localStructure: upper(
      structure?.localTrend
      || marketState?.structureTrend
      || structure?.confirmedTrend
      || structure?.trend
      || 'NEUTRAL'
    ),
    marketCondition: conflicts.length
      ? 'CONFLICT'
      : upper(marketState?.state || result?.marketCondition || 'BELUM TERSEDIA'),
    dealingLocation: upper(dealingLocation || 'BELUM TERSEDIA'),
    session: clone(result?.sessionContext || snapshot?.context?.session || null, null)
  };
}

function canonicalBlockingConflicts(input) {
  const explicitConflicts = Array.isArray(input?.conflicts)
    ? input.conflicts
    : Array.isArray(input?.marketState?.conflicts)
      ? input.marketState.conflicts
      : [];
  return explicitConflicts
    .map(conflictText)
    .filter(text => text && !NON_BLOCKING_SCALPER_CONFLICT.test(text));
}

function hasOfficialContextConflict(input) {
  return canonicalBlockingConflicts(input).length > 0;
}

function statusHeadline({
  decision,
  freshness,
  freshnessBlocked,
  focusDirection,
  terminal,
  targetOneSecured,
  status,
  invalidated
}) {
  if (!freshness.valid) return 'WAIT — DATA MAPPING BELUM TERSEDIA';
  if (freshnessBlocked && freshness.expired) return 'WAIT — ANALISIS KEDALUWARSA';
  if (freshnessBlocked && freshness.stale) return 'WAIT — DATA MAPPING SUDAH LAMA';
  if (decision === 'BUY') return 'BUY — ENTRY SUDAH VALID';
  if (decision === 'SELL') return 'SELL — ENTRY SUDAH VALID';
  if (/TP2 HIT|TARGET_HIT/i.test(status)) return 'WAIT — TARGET AKHIR TERCAPAI';
  if (/EXPIRED/i.test(status)) return 'WAIT — SETUP KEDALUWARSA';
  if (/TP1 \/ BE|SL HIT|STOPPED/i.test(status)) return 'WAIT — SETUP SELESAI';
  if (targetOneSecured || /TP1 HIT/i.test(status)) return 'WAIT — TP1 TERCAPAI';
  if (/LEVEL_RETIRED|RETIRED/i.test(status)) return 'WAIT — LEVEL TIDAK LAGI AKTIF';
  if (FORECAST_PAUSED.test(status)) return 'WAIT — FORECAST TIDAK AKTIF';
  if (invalidated || /INVALID/i.test(status)) return 'WAIT — SETUP TIDAK VALID';
  if (terminal) return 'WAIT — SETUP SELESAI';
  return focusDirection
    ? 'WAIT — BELUM ADA ENTRY VALID'
    : 'WAIT — BELUM ADA SKENARIO PRIORITAS';
}

function decisionMatrix({
  freshness,
  execution,
  setup,
  watch,
  scenario,
  directionDecision,
  contextConflict,
  levels,
  status,
  terminal,
  targetOneSecured
}) {
  const executionDirection = direction(execution?.direction);
  const setupDir = setupDirection(setup);
  const watchDirection = direction(watch?.direction);
  const scenarioDirection = direction(scenario?.direction);
  const decisionDirection = direction(directionDecision?.signal);
  const officialDirection = executionDirection || setupDir || scenarioDirection || watchDirection;
  const directions = [executionDirection, setupDir, watchDirection, scenarioDirection, decisionDirection]
    .filter(Boolean);
  const aligned = Boolean(
    officialDirection
    && directions.every(value => value === officialDirection)
    && decisionDirection === officialDirection
    && execution?.alignedWithForecast === true
    && !contextConflict
  );
  const lifecycle = upper(execution?.lifecycleStage || watch?.lifecycleStage);
  const entryTriggered = lifecycle === 'ENTRY_TRIGGERED'
    || lifecycle === 'ENTRY_ACTIVE'
    || /ENTRY CONFIRMED/.test(upper(status));
  const hasEntryArea = levels.entryLow != null && levels.entryHigh != null;
  const hasTargets = levels.tp1 != null
    && (execution?.singleTarget === true || setup?.singleTarget === true || levels.tp2 != null);
  const completeWithoutFreshness = Boolean(
    ACTIVE_DIRECTIONS.has(officialDirection)
    && execution?.active === true
    && execution?.terminal !== true
    && execution?.invalidated !== true
    && execution?.geometryValid === true
    && setup?.live !== false
    && watch?.active === true
    && watch?.entryAllowed === true
    && watch?.executionPlan?.locked === true
    && entryTriggered
    && aligned
    && !terminal
    && !targetOneSecured
    && levels.entry != null
    && hasEntryArea
    && levels.stopLoss != null
    && hasTargets
  );
  const freshnessExecutable = Boolean(freshness.valid && freshness.executable !== false);
  const complete = Boolean(freshnessExecutable && completeWithoutFreshness);
  const freshnessBlocked = Boolean(
    freshness.valid
    && freshness.executable === false
    && completeWithoutFreshness
  );
  return {
    decision: complete ? officialDirection : 'WAIT',
    officialDirection,
    aligned,
    entryTriggered,
    complete,
    freshnessBlocked,
    checks: {
      freshnessValid: freshnessExecutable,
      analysisAvailable: freshness.valid,
      executionActive: execution?.active === true,
      setupActive: setup?.live !== false,
      entryAllowed: watch?.entryAllowed === true,
      executionPlanLocked: watch?.executionPlan?.locked === true,
      lifecycleEntryTriggered: entryTriggered,
      executionGeometryValid: execution?.geometryValid === true,
      directionsAligned: aligned,
      noContextConflict: !contextConflict,
      entryAvailable: levels.entry != null && hasEntryArea,
      stopLossAvailable: levels.stopLoss != null,
      targetAvailable: hasTargets,
      nonTerminal: !terminal && !targetOneSecured
    }
  };
}

export function formatExecutionReason(requirement, {
  focusDirection = null,
  timeframe = null,
  passed = false
} = {}) {
  const item = typeof requirement === 'string'
    ? { label: upper(requirement), passed, detail: '' }
    : {
        label: upper(requirement?.label),
        passed: requirement?.passed === true,
        detail: clean(requirement?.detail)
      };
  return item.passed
    ? passedRequirementLabel(item, focusDirection, timeframe)
    : requirementLabel(item.label, focusDirection, timeframe);
}

export function formatLifecycleLabel(stage, status = '') {
  const rawStage = upper(stage);
  const rawStatus = upper(status);
  const combined = `${rawStage} ${rawStatus}`;
  if (/TP2 HIT|TARGET_HIT/.test(combined)) return 'Target akhir tercapai';
  if (/TP1 \/ BE/.test(combined)) return 'TP1 tercapai; runner selesai di break-even';
  if (/SL HIT/.test(combined)) return 'Setup selesai terkena Stop Loss';
  if (/TP1 HIT|RUNNER_ACTIVE/.test(combined)) return 'TP1 tercapai; runner berada di break-even';
  if (/EXPIRED/.test(combined)) return 'Setup kedaluwarsa';
  if (/LEVEL_RETIRED|RETIRED/.test(combined)) return 'Level tidak lagi aktif';
  if (/FORECAST_PAUSED|FORECAST_INVALIDATED|FORECAST INVALIDATED/.test(combined)) {
    return 'Forecast tidak aktif; entry dinonaktifkan';
  }
  if (/INVALID|STOPPED|TERMINAL/.test(combined)) return 'Setup tidak lagi valid';
  if (/ENTRY_TRIGGERED|ENTRY_ACTIVE|ENTRY CONFIRMED/.test(combined)) return 'Entry sudah terkonfirmasi';
  if (/WAITING_FOR_CLOSE|MENUNGGU CLOSE/.test(combined)) return 'Menunggu candle konfirmasi close';
  if (/WAITING_FOR_MSS|MENUNGGU DISPLACED MSS/.test(combined)) return 'Sweep terdeteksi; menunggu MSS';
  if (/SWEEP_DETECTED/.test(combined)) return 'Liquidity sudah disapu; menunggu reclaim dan MSS';
  if (/WAITING_FOR_SWEEP|MENUNGGU OPPOSING LIQUIDITY SWEEP/.test(combined)) {
    return 'Menunggu liquidity sweep';
  }
  if (/WAITING_FOR_AREA/.test(combined)) return 'Menunggu harga masuk ke area pantauan';
  if (/NO CLEAR DIRECTION|WAIT_DIRECTION/.test(combined)) return 'Menunggu arah Mapping';
  if (/WAITING_ENTRY|WAITING_CONFIRMATION|WAITING FOR SETUP|NO_ACTIVE_SETUP/.test(combined)) {
    return 'Menunggu setup resmi Mapping';
  }
  return clean(status || stage || 'Menunggu Mapping');
}

export function determineExecutionDisplayStatus(input = {}) {
  const result = input.result || input.marketState?.result || null;
  const snapshot = result?.mappingSnapshot || input.mappingSnapshot || null;
  const execution = result?.setupExecution || input.setupExecution || snapshot?.execution || null;
  const setup = result?.entryMap?.setup || input.entryMapSetup || null;
  const watch = result?.entryWatch || input.entryWatch || null;
  const scenario = result?.entryMap?.scenario || watch?.scenario || snapshot?.scenario || {};
  const freshness = freshnessFrom(input, result, snapshot);
  const levels = officialLevels(execution, setup, watch, scenario);
  const status = lifecycleStatus(execution, setup, watch, scenario);
  const terminal = terminalState(execution, setup, watch, status);
  const directionDecision = result?.directionDecision
    || snapshot?.context?.directionDecision
    || input.marketState?.directionDecision
    || null;
  const contextConflict = hasOfficialContextConflict(input);
  const matrix = decisionMatrix({
    freshness,
    execution,
    setup,
    watch,
    scenario,
    directionDecision,
    contextConflict,
    levels,
    status,
    terminal: terminal.terminal,
    targetOneSecured: terminal.targetOneSecured
  });
  return deepFreeze({
    ...matrix,
    freshness,
    levels,
    status,
    terminal: terminal.terminal,
    targetOneSecured: terminal.targetOneSecured,
    hasOfficialSetup: terminal.hasSetup,
    invalidated: execution?.invalidated === true || /INVALID/i.test(status)
  });
}

export function buildExecutionPlanViewModel(input = {}) {
  const result = input.result || input.marketState?.result || null;
  const snapshot = result?.mappingSnapshot || input.mappingSnapshot || null;
  const execution = result?.setupExecution || input.setupExecution || snapshot?.execution || null;
  const setup = result?.entryMap?.setup || input.entryMapSetup || null;
  const watch = result?.entryWatch || input.entryWatch || null;
  const scenario = result?.entryMap?.scenario || watch?.scenario || snapshot?.scenario || {};
  const display = determineExecutionDisplayStatus({
    ...input,
    result,
    mappingSnapshot: snapshot,
    setupExecution: execution,
    entryMapSetup: setup,
    entryWatch: watch
  });
  const directionDecision = result?.directionDecision
    || snapshot?.context?.directionDecision
    || input.marketState?.directionDecision
    || null;
  const forecast = result?.validatedMarketContext?.directionForecast
    || snapshot?.context?.directionForecast
    || null;
  const focusDirection = display.officialDirection
    || direction(scenario?.direction)
    || direction(directionDecision?.bias)
    || direction(forecast?.direction);
  const timeframe = clean(
    scenario?.triggerTf
    || result?.tf
    || snapshot?.timeframe
    || input.marketState?.timeframe
    || 'M15'
  ).toUpperCase();
  const requirements = normalizeRequirements(scenario);
  const missingLabels = new Set(
    (Array.isArray(scenario?.missing) ? scenario.missing : [])
      .map(upper)
      .filter(Boolean)
  );
  const waitingRequirements = requirements.filter(item =>
    !item.passed && (!missingLabels.size || missingLabels.has(item.label))
  );
  const waitingFor = waitingRequirements.map(item =>
    formatExecutionReason(item, { focusDirection, timeframe })
  );
  const confirmations = requirements.filter(item => item.passed).map(item =>
    formatExecutionReason(item, { focusDirection, timeframe, passed: true })
  );
  const blockingConflicts = canonicalBlockingConflicts(input);
  const context = contextFields(result, snapshot, blockingConflicts);
  const officialArea = watchArea({
    decision: display.decision,
    levels: display.levels,
    scenario,
    result,
    snapshot
  });
  const area = !display.freshness.valid || display.freshnessBlocked
    ? {
        kind: 'UNAVAILABLE',
        low: null,
        high: null,
        level: null,
        source: null,
        label: display.freshnessBlocked
          ? (display.freshness.expired
              ? 'Analisis terakhir tetap ditampilkan, tetapi setup sudah kedaluwarsa.'
              : 'Analisis terakhir tetap ditampilkan, tetapi izin entry menunggu pembaruan candle.')
          : 'Data Mapping belum tersedia.'
      }
    : display.terminal || display.targetOneSecured
      ? {
          kind: 'UNAVAILABLE',
          low: null,
          high: null,
          level: null,
          source: null,
          label: 'Setup selesai — tunggu setup baru dari Mapping.'
        }
      : officialArea;
  const target = structuralTarget(execution, setup, scenario);
  const closed = latestClosedCandle(input, result, snapshot);
  const sourceCandleTime = isoTime(
    snapshot?.freshness?.sourceCandleTime
    || snapshot?.sourceCandle?.time
    || closed?.candle?.time
    || display.freshness.sourceTime
    || input.marketState?.mappingCapturedAt
    || input.marketState?.capturedAt
  );
  const analyzedAt = isoTime(
    snapshot?.freshness?.analyzedAt
    || snapshot?.capturedAt
    || input.marketState?.updatedAt
    || input.marketState?.capturedAt
  );
  const currentPrice = positivePrice(
    snapshot?.liveOverlay?.price
    ?? input.marketState?.price
    ?? input.runtimeState?.price
    ?? result?.price
  );
  const lifecycleStage = clean(execution?.lifecycleStage || watch?.lifecycleStage || 'WAITING_CONFIRMATION');
  const lifecycleDisplayStatus = display.decision === 'WAIT'
    ? clean(watch?.status || scenario?.status || display.status)
    : clean(display.status || watch?.status || scenario?.status);
  const lifecycleLabel = formatLifecycleLabel(lifecycleStage, lifecycleDisplayStatus);
  const headline = statusHeadline({
    decision: display.decision,
    freshness: display.freshness,
    freshnessBlocked: display.freshnessBlocked,
    focusDirection,
    terminal: display.terminal,
    targetOneSecured: display.targetOneSecured,
    status: display.status,
    invalidated: display.invalidated
  });

  const officialReason = clean(
    (execution?.invalidated === true || display.terminal
      ? execution?.invalidationReason
      : '')
    || (directionDecision?.invalidated === true
      ? directionDecision?.invalidationReason
      : '')
    || (forecast?.invalidated === true || forecast?.expired === true
      ? forecast?.invalidationReason
      : '')
  );
  const invalidation = officialReason
    || (display.decision !== 'WAIT' && display.levels.stopLoss != null
      ? `Stop Loss resmi ${display.levels.stopLoss}. Setup selanjutnya mengikuti lifecycle Mapping resmi.`
      : display.terminal
        ? lifecycleLabel
        : 'Belum tersedia — menunggu invalidasi resmi Mapping.');

  const reasons = [];
  if (display.freshnessBlocked) {
    reasons.push(display.freshness.expired
      ? 'Freshness internal menandai setup kedaluwarsa; analisis terakhir tetap terlihat tetapi entry dinonaktifkan.'
      : 'Freshness internal menunggu pembaruan; analisis terakhir tetap terlihat tetapi entry dinonaktifkan.');
  }
  if (focusDirection) reasons.push(`Arah yang sedang dipantau oleh Mapping: ${focusDirection}.`);
  reasons.push(...waitingRequirements.map(item => {
    const detail = clean(item.detail);
    return detail || formatExecutionReason(item, { focusDirection, timeframe });
  }));
  reasons.push(...blockingConflicts);
  if (display.decision === 'WAIT' && !display.terminal && !display.targetOneSecured) {
    if (display.checks.executionPlanLocked !== true) reasons.push('Execution plan resmi belum dikunci.');
    if (display.checks.entryAllowed !== true) reasons.push('Causal Entry Watch belum mengizinkan entry.');
    if (display.checks.entryAvailable !== true) reasons.push('Entry resmi belum tersedia.');
    if (display.checks.stopLossAvailable !== true) reasons.push('Stop Loss resmi belum tersedia.');
    if (display.checks.targetAvailable !== true) reasons.push('Target resmi belum tersedia.');
  }
  if (display.terminal || display.targetOneSecured) reasons.push(lifecycleLabel);

  let conclusion = '';
  if (display.decision === 'BUY' || display.decision === 'SELL') {
    conclusion = `Setup ${display.decision} sudah valid berdasarkan Mapping. Gunakan hanya level yang telah dikunci oleh setup resmi.`;
  } else if (!display.freshness.valid) {
    conclusion = 'Tunggu candle tertutup tersedia sebelum mempertimbangkan entry.';
  } else if (display.freshnessBlocked) {
    conclusion = 'Arah Mapping terakhir tetap berlaku sebagai konteks, tetapi jangan entry sampai freshness internal kembali valid.';
  } else if (display.terminal || display.targetOneSecured) {
    conclusion = `${lifecycleLabel}. Jangan entry ulang menggunakan setup ini; tunggu setup baru dari Mapping.`;
  } else if (focusDirection) {
    conclusion = `Jangan ${focusDirection} sekarang. ${waitingFor[0] || 'Tunggu sampai setup resmi Mapping mengizinkan entry.'}`;
  } else {
    conclusion = 'Jangan entry sekarang. Tunggu arah scalping dan setup resmi Mapping menjadi jelas.';
  }

  const levelsAreExecutable = display.decision === 'BUY' || display.decision === 'SELL';
  const visibleTarget = display.terminal
    || display.targetOneSecured
    || !display.freshness.valid
    || display.freshnessBlocked
    ? { type: null, subtype: null, level: null }
    : target;
  const plan = {
    version: '1.1.0',
    source: 'AMY_MAPPING_EXECUTION_PLAN_READ_ONLY',
    authoritySource: result?.setupExecution
      ? 'setupExecution'
      : setup
        ? 'entryMap.setup'
        : snapshot?.execution
          ? 'mappingSnapshot.execution'
          : 'none',
    decision: display.decision,
    headline,
    focusDirection,
    focusLabel: focusDirection ? `Cari peluang ${focusDirection}` : 'Belum ada arah valid',
    timeframe,
    currentPrice,
    area,
    entry: levelsAreExecutable ? display.levels.entry : null,
    entryLow: levelsAreExecutable ? display.levels.entryLow : null,
    entryHigh: levelsAreExecutable ? display.levels.entryHigh : null,
    stopLoss: levelsAreExecutable ? display.levels.stopLoss : null,
    initialStopLoss: levelsAreExecutable ? display.levels.initialStopLoss : null,
    tp1: levelsAreExecutable ? display.levels.tp1 : null,
    tp2: levelsAreExecutable ? display.levels.tp2 : null,
    rr: levelsAreExecutable ? display.levels.rr : null,
    structuralTarget: visibleTarget,
    waitingFor: uniqueTexts(waitingFor),
    confirmations: uniqueTexts(confirmations),
    reasons: uniqueTexts(reasons),
    conflicts: blockingConflicts,
    invalidation,
    conclusion,
    entryWatchStage: lifecycleStage,
    entryWatchStatus: clean(watch?.status || display.status || scenario?.status || 'WAIT'),
    lifecycleLabel,
    terminal: display.terminal,
    targetOneSecured: display.targetOneSecured,
    mappingFreshness: display.freshness.state,
    internalFreshness: display.freshness.internalState,
    dataStatus: display.freshness.label,
    sourceCandleTime,
    sourceTimeframe: closed?.timeframe || display.freshness.sourceTimeframe || timeframe,
    analysisTime: analyzedAt,
    analysisTimeWita: witaTime(sourceCandleTime || analyzedAt),
    higherTimeframeBias: context.higherTimeframeBias,
    localStructure: context.localStructure,
    marketCondition: context.marketCondition,
    dealingLocation: context.dealingLocation,
    session: context.session,
    checks: clone(display.checks, {}),
    rawStatus: display.status
  };
  plan.fingerprint = executionPlanFingerprint(plan);
  return deepFreeze(plan);
}

export function buildAmyExecutionContext(viewModel) {
  const vm = viewModel || {};
  return deepFreeze({
    sourceModule: 'mapping',
    feature: 'execution_plan',
    source: clean(vm.source || 'AMY_MAPPING_EXECUTION_PLAN_READ_ONLY'),
    authoritySource: clean(vm.authoritySource || 'none'),
    decision: ACTIVE_DIRECTIONS.has(vm.decision) ? vm.decision : 'WAIT',
    headline: clean(vm.headline),
    focusDirection: vm.focusDirection || null,
    currentPrice: finite(vm.currentPrice),
    timeframe: clean(vm.timeframe),
    sourceTimeframe: clean(vm.sourceTimeframe),
    higherTimeframeBias: clean(vm.higherTimeframeBias),
    localStructure: clean(vm.localStructure),
    marketCondition: clean(vm.marketCondition),
    dealingLocation: clean(vm.dealingLocation),
    entryWatchStage: clean(vm.entryWatchStage),
    entryWatchStatus: clean(vm.entryWatchStatus),
    lifecycleLabel: clean(vm.lifecycleLabel),
    waitingFor: clone(vm.waitingFor || [], []),
    confirmations: clone(vm.confirmations || [], []),
    entryArea: {
      low: positivePrice(vm.entryLow),
      high: positivePrice(vm.entryHigh)
    },
    watchArea: {
      kind: clean(vm.area?.kind),
      label: clean(vm.area?.label),
      low: positivePrice(vm.area?.low),
      high: positivePrice(vm.area?.high),
      level: positivePrice(vm.area?.level),
      source: clean(vm.area?.source)
    },
    entry: positivePrice(vm.entry),
    stopLoss: positivePrice(vm.stopLoss),
    tp1: positivePrice(vm.tp1),
    tp2: positivePrice(vm.tp2),
    rr: finite(vm.rr),
    structuralTarget: {
      type: clean(vm.structuralTarget?.type) || null,
      subtype: clean(vm.structuralTarget?.subtype) || null,
      level: positivePrice(vm.structuralTarget?.level)
    },
    invalidation: clean(vm.invalidation),
    reasons: clone(vm.reasons || [], []),
    conflicts: clone(vm.conflicts || [], []),
    conclusion: clean(vm.conclusion),
    terminal: Boolean(vm.terminal),
    mappingFreshness: clean(vm.mappingFreshness),
    internalFreshness: clean(vm.internalFreshness),
    sourceCandleTime: vm.sourceCandleTime || null,
    analysisTimeWita: clean(vm.analysisTimeWita),
    fingerprint: clean(vm.fingerprint)
  });
}

export function executionPlanFingerprint(value) {
  try {
    const copy = clone(value, {});
    if (copy && typeof copy === 'object') delete copy.fingerprint;
    return JSON.stringify(stable(copy));
  } catch (_) {
    return '';
  }
}
