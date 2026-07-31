const TF_SECONDS = Object.freeze({ M1: 60, M5: 300, M15: 900, H1: 3600, H4: 14400 });

function finite(value, fallback = NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeDirection(value) {
  const direction = String(value || '').toUpperCase();
  if (direction.includes('BUY') || direction.includes('BULL')) return 'BUY';
  if (direction.includes('SELL') || direction.includes('BEAR')) return 'SELL';
  return 'WAIT';
}

function activeItemsFor(watch, conceptsByTf) {
  const concepts = conceptsByTf?.[watch?.sourceTf];
  if (!concepts) return null;
  if (watch.sourceKind === 'FVG') return concepts.fairValueGaps || [];
  if (watch.sourceKind === 'ORDER_BLOCK') return concepts.orderBlocks || [];
  if (watch.sourceKind === 'LIQUIDITY') return concepts.liquidityLevels || [];
  return [];
}

function itemIsActive(watch, item) {
  if (item?.active === false) return false;
  const status = String(item?.status || 'DETECTED').toUpperCase();
  if (watch.sourceKind === 'LIQUIDITY') return status === 'DETECTED';
  return status === 'DETECTED' || status === 'TESTING';
}

function levelForItem(watch, item) {
  if (watch.sourceKind === 'LIQUIDITY') return finite(item?.level);
  return normalizeDirection(watch.direction) === 'BUY' ? finite(item?.bottom) : finite(item?.top);
}

export function candidateStillActive(watch, conceptsByTf) {
  if (!watch?.id) return false;
  if (watch.converted) return true;
  const items = activeItemsFor(watch, conceptsByTf);
  if (items == null) return true;
  const tolerance = Math.max(finite(watch.atr, 0) * 0.01, 0.001);
  return items.some(item => {
    if (!itemIsActive(watch, item)) return false;
    if (watch.sourceId && item?.id) return watch.sourceId === item.id;
    const itemLevel = levelForItem(watch, item);
    return Number.isFinite(itemLevel) && Math.abs(itemLevel - finite(watch.level)) <= tolerance;
  });
}

function confirmedEntryTime(watch) {
  const explicit = finite(watch?.entryCloseTime);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const openTime = finite(watch?.entryTime, finite(watch?.triggerCandleTime));
  return Number.isFinite(openTime) && openTime > 0
    ? openTime + (TF_SECONDS[watch?.triggerTf] || 60)
    : 0;
}

export function buildFrozenExecutionPlan(watch) {
  if (!watch || watch.lifecycleStage !== 'ENTRY_TRIGGERED') return null;
  if (watch.executionPlan?.locked) return watch.executionPlan;

  const atr = Math.max(
    finite(watch.atr, 0),
    Math.abs(finite(watch.top, 0) - finite(watch.bottom, 0)),
    0.10
  );
  const entry = finite(watch.entryPrice, finite(watch.level));
  if (!Number.isFinite(entry)) return null;

  const width = Math.max(atr * 0.04, 0.05);
  const entryLow = entry - width;
  const entryHigh = entry + width;
  const isBuy = normalizeDirection(watch.direction) === 'BUY';
  const sl = isBuy ? finite(watch.level, entry) - atr * 0.15 : finite(watch.level, entry) + atr * 0.15;
  const tp1 = isBuy ? entryHigh + atr : entryLow - atr;
  const tp2 = isBuy ? entryHigh + atr * 2 : entryLow - atr * 2;

  return {
    locked: true,
    lockedAt: confirmedEntryTime(watch),
    entry,
    entryLow,
    entryHigh,
    sl,
    tp1,
    tp2,
    atr
  };
}

function retireTriggeredWatch(watch) {
  return {
    ...watch,
    active: false,
    terminal: true,
    entryAllowed: false,
    sweepDetected: false,
    lifecycleStage: 'LEVEL_RETIRED',
    status: 'LEVEL TIDAK LAGI AKTIF',
    reason: `${watch.sourceTf} ${watch.sourceLabel} sudah keluar dari detector aktif sebelum trigger dapat disahkan.`,
    retiredAt: Date.now(),
    updatedAt: Date.now()
  };
}

function pauseWatch(watch) {
  if (!watch?.id || watch.terminal) return watch;
  return {
    ...watch,
    previousLifecycleStage: watch.lifecycleStage,
    active: false,
    entryAllowed: false,
    lifecycleStage: 'FORECAST_PAUSED',
    status: 'FORECAST PAUSED — ENTRY DINONAKTIFKAN',
    reason: 'Direction Forecast tidak aktif. Setup lama tidak boleh tetap tampil sebagai BUY/SELL aktif.',
    pausedAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function hardenEntryWatch({ watch, conceptsByTf = {}, direction = 'WAIT' } = {}) {
  if (!watch) return null;
  const normalizedDirection = normalizeDirection(direction);

  if (normalizedDirection === 'WAIT') return pauseWatch(watch);

  if (watch.lifecycleStage === 'ENTRY_TRIGGERED') {
    if (!candidateStillActive(watch, conceptsByTf)) return retireTriggeredWatch(watch);
    const executionPlan = buildFrozenExecutionPlan(watch);
    const entryConfirmedAt = confirmedEntryTime(watch);
    return {
      ...watch,
      triggerCandleOpenTime: finite(watch.entryTime, watch.triggerCandleTime),
      entryTime: entryConfirmedAt,
      entryCloseTime: entryConfirmedAt,
      entryConfirmedAt,
      executionPlan,
      entryPlanLocked: Boolean(executionPlan?.locked),
      updatedAt: Date.now()
    };
  }

  return {
    ...watch,
    entryAllowed: false,
    updatedAt: Date.now()
  };
}

export function setupFromHardenedWatch(watch) {
  const plan = watch?.executionPlan;
  if (!watch?.entryAllowed || watch.lifecycleStage !== 'ENTRY_TRIGGERED' || !plan?.locked) return null;
  const timestampSeconds = finite(watch.entryConfirmedAt, finite(watch.entryCloseTime, finite(watch.entryTime)));
  return {
    dir: watch.direction,
    direction: watch.direction,
    type: `${watch.sourceKind} SWEEP ENTRY`,
    tf: watch.triggerTf,
    sourceTf: watch.sourceTf,
    entryLow: plan.entryLow,
    entryHigh: plan.entryHigh,
    entry: plan.entry,
    sl: plan.sl,
    tp1: plan.tp1,
    tp2: plan.tp2,
    singleTarget: false,
    timestamp: timestampSeconds * 1000,
    entryStyle: 'MULTI_TF_LEVEL_SWEEP_LOCKED',
    watchId: watch.id,
    watchLevel: watch.level,
    sourceKind: watch.sourceKind,
    triggerTf: watch.triggerTf,
    status: 'ENTRY TRIGGERED',
    reason: `${watch.sourceTf} ${watch.sourceLabel} disapu pada ${watch.triggerTf} dan disahkan saat candle trigger ditutup.`,
    validationStatus: 'ARMED_SWEEP_CLOSE_RECLAIM_CAUSAL',
    riskModel: 'LOCKED_AT_TRIGGER_CLOSE_NOT_BACKTESTED'
  };
}
