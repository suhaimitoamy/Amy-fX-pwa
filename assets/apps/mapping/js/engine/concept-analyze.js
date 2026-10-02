import { tfGroup } from './core/analyze.js';
import { detectMarketConcepts } from './concept-engine.js';
import {
  causalEntryLifecycleContract,
  detectTimeframeEntryMap
} from './concept-entry-map-v3.js';
import {
  amySmcDCompatibilityStructure,
  normalizeAmySmcDClosedCandles,
  replayAmySmcD
} from './amy-smc-d-engine.js';

export { tfGroup };

function entryMapRow(entryMap) {
  const setup = entryMap?.setup;
  if (!setup) {
    return [
      'Entry Map',
      entryMap?.scenario?.status || 'WAIT',
      entryMap?.scenario?.reason || 'Sequence causal belum lengkap.'
    ];
  }
  return [
    'Entry Map',
    setup.live ? 'AUTHORITATIVE' : setup.status,
    `${setup.dir} ${setup.type} · sweep → displaced MSS → target struktural ${Number(setup.targetR || 0).toFixed(2)}R.`
  ];
}

function directionalValue(direction) {
  return direction === 'BULLISH' ? 1 : direction === 'BEARISH' ? -1 : 0;
}

function eventText(event) {
  if (!event) return 'Tidak ada event baru pada candle sumber.';
  const kind = event.kind || event.type || 'EVENT';
  const direction = event.direction === 1 || event.direction === 'BULLISH'
    ? 'BULLISH'
    : event.direction === -1 || event.direction === 'BEARISH'
      ? 'BEARISH'
      : 'NEUTRAL';
  const level = Number(event.level);
  return `${kind} ${direction}${Number.isFinite(level) ? ` @ ${level.toFixed(2)}` : ''}`;
}

function buildAmySmcDValidatedContext(dResult) {
  const finalBias = dResult.descriptive.finalBias;
  const nextMove = dResult.predictive.nextMove;
  const active = Boolean(nextMove.active && directionalValue(nextMove.direction));
  const forecast = {
    active,
    direction: active ? nextMove.direction : 'NEUTRAL',
    directionValue: active ? nextMove.directionValue : 0,
    startIndex: nextMove.startIndex,
    startTime: nextMove.startTime,
    sourceCandleTime: dResult.sourceCandle?.time || null,
    source: nextMove.source,
    triggerRule: active
      ? `Amy-SMC-D Next Move ${nextMove.direction}`
      : 'Amy-SMC-D Next Move menunggu event/regime yang memenuhi baseline.',
    validationMode: 'AMY_SMC_D_BASELINE',
    confidence: null,
    confidenceLabel: 'HISTORICAL REFERENCE ONLY',
    confidenceMeaning: 'Bukan probabilitas live untuk candle saat ini.',
    invalidated: false,
    invalidationReason: '',
    expired: false
  };
  const marketState = {
    state: `${finalBias.direction} STRUCTURE`,
    direction: finalBias.direction,
    directionValue: finalBias.directionValue,
    structureTrend: dResult.descriptive.swingStructure.direction,
    internalTrend: dResult.descriptive.internalStructure.direction,
    htfTrend: dResult.descriptive.htfSwing.direction,
    sourceCandleTime: dResult.sourceCandle?.time || null,
    source: 'AMY_SMC_D_FINAL_BIAS'
  };
  return {
    version: dResult.version,
    tf: dResult.tf,
    source: 'AMY_SMC_D',
    baselineSha: dResult.baselineSha,
    marketState,
    directionForecast: forecast,
    descriptiveOnlyFields: ['DEALING_RANGE', 'EVENT_HISTORY'],
    dealingRangeMayOverridePredictors: false
  };
}

function buildAmySmcDConceptRows(dResult, entryMap) {
  const d = dResult.descriptive;
  const p = dResult.predictive;
  const freshStructure = d.swingStructure.fresh || d.internalStructure.fresh || d.htfSwing.fresh;
  const freshEvent = d.swingStructure.event || d.internalStructure.event;
  return [
    ['Context · HTF Swing', d.htfSwing.direction, `${d.htfSwing.timeframe || '-'} · continuous context`],
    ['Context · Swing Structure', d.swingStructure.direction, d.swingStructure.fresh ? 'Fresh structural change.' : 'Continuous/stale state; bukan event baru.'],
    ['Context · Internal Structure', d.internalStructure.direction, d.internalStructure.fresh ? 'Fresh structural change.' : 'Continuous/stale state; bukan event baru.'],
    ['Context · Liquidity', d.liquidity.direction, d.liquidity.active ? `${d.liquidity.side || '-'} ${Number(d.liquidity.level || 0).toFixed(2)} · context aktif` : 'Tidak ada liquidity event aktif.'],
    ['Context · Dealing Range', d.dealingRange.location, `${d.dealingRange.source} · descriptive-only`],
    ['Context · Pattern', d.pattern.name, d.pattern.detectedOnSourceCandle ? 'Raw pattern baru pada candle sumber.' : 'Continuous pattern state.'],
    ['Context · Final Bias', d.finalBias.direction, d.finalBias.fresh ? 'Fresh bias change.' : 'Continuous descriptive bias.'],
    ['Fresh Structure Evidence', freshStructure ? 'FRESH' : 'STALE / CONTINUOUS', eventText(freshEvent)],
    ['Predictive · Next Move', p.nextMove.signal, p.nextMove.source],
    ['Predictive · Sweep Continuation', p.sweepContinuation.active ? p.sweepContinuation.direction : 'WAIT', eventText(p.sweepContinuation.rawSweep)],
    ['Predictive · Raw Valid Break', p.rawValidBreak ? p.rawValidBreak.direction === 1 ? 'BULLISH' : 'BEARISH' : 'WAIT', eventText(p.rawValidBreak)],
    ['Predictive · Qualified Valid Break', p.qualifiedValidBreak ? p.qualifiedValidBreak.direction === 1 ? 'BULLISH' : 'BEARISH' : 'WAIT', eventText(p.qualifiedValidBreak)],
    ['Predictive · Qualified CHoCH', p.qualifiedChoch ? p.qualifiedChoch.direction === 1 ? 'BULLISH' : 'BEARISH' : 'WAIT', eventText(p.qualifiedChoch)],
    ['Predictive · Qualified BOS', p.qualifiedBos ? p.qualifiedBos.direction === 1 ? 'BULLISH' : 'BEARISH' : 'WAIT', p.qualifiedBos ? eventText(p.qualifiedBos) : 'M5/M15/H1 baseline riset: N=0; tidak dibuat synthetic event.'],
    ['Predictive · Raw Pattern', p.rawPattern.active ? p.rawPattern.name : 'WAIT', p.rawPattern.active ? p.rawPattern.direction : 'Tidak ada raw pattern baru.'],
    ['Predictive · Qualified Pattern', p.qualifiedPattern.active ? p.qualifiedPattern.name : 'WAIT', p.qualifiedPattern.lowSample ? 'Low-sample evidence; bukan confidence probability.' : 'Baseline-qualified event.'],
    entryMapRow(entryMap)
  ];
}

export function buildCausalEntryWatch(entryMap, tf) {
  const activeSetup = entryMap?.activeSetup || null;
  const authoritativeSetup = entryMap?.setup || activeSetup;
  const lifecycle = causalEntryLifecycleContract(authoritativeSetup);
  return {
    version: '3.0.0',
    model: 'AMY_CAUSAL_ENTRY_MAP_MONITOR',
    sourceTf: tf,
    triggerTf: tf,
    direction: entryMap?.scenario?.direction || 'WAIT',
    status: authoritativeSetup
      ? lifecycle.status
      : entryMap?.scenario?.status || 'WAIT',
    lifecycleStage: authoritativeSetup
      ? lifecycle.lifecycleStage
      : 'WAITING_CONFIRMATION',
    active: Boolean(
      !lifecycle.terminal
      && entryMap?.scenario?.direction
      && entryMap.scenario.direction !== 'WAIT'
    ),
    entryAllowed: Boolean(activeSetup),
    terminal: lifecycle.terminal,
    reason: entryMap?.scenario?.reason || 'Sequence causal belum lengkap.',
    scenario: entryMap?.scenario,
    executionPlan: authoritativeSetup ? {
      locked: true,
      lockedAt: authoritativeSetup.timestamp,
      entry: authoritativeSetup.entry,
      entryLow: authoritativeSetup.entryLow,
      entryHigh: authoritativeSetup.entryHigh,
      initialSl: authoritativeSetup.initialSl,
      sl: authoritativeSetup.sl,
      tp1: authoritativeSetup.tp1,
      tp2: authoritativeSetup.tp2,
      lifecycleStatus: lifecycle.status,
      terminal: lifecycle.terminal,
      tp1Hit: Boolean(authoritativeSetup.tp1Hit),
      endIndex: authoritativeSetup.endIndex,
      endTime: authoritativeSetup.endTime || null
    } : null
  };
}

export function analyze(
  candles,
  tf,
  htfBiases = {},
  currentPrice = null,
  htfCandles = {},
  analysisOptions = {}
) {
  const closedCandles = normalizeAmySmcDClosedCandles(candles, tf);
  const closedHtfCandles = Object.fromEntries(
    Object.entries(htfCandles && typeof htfCandles === 'object' ? htfCandles : {})
      .map(([timeframe, values]) => [
        timeframe,
        normalizeAmySmcDClosedCandles(values, timeframe)
      ])
  );
  const dResult = replayAmySmcD(closedCandles, { tf, htfCandles: closedHtfCandles });
  if (!dResult.ready) {
    return {
      tf,
      price: dResult.sourceCandle?.close || 0,
      final: 'WAIT',
      signal: 'WAIT',
      st: null,
      setups: [],
      bestSetup: null,
      amySmcD: dResult,
      htfBiases: { ...htfBiases }
    };
  }

  const closedPrice = dResult.sourceCandle.close;
  const executionSupport = detectMarketConcepts(closedCandles, {
    tf,
    currentPrice: closedPrice,
    htfCandles: closedHtfCandles,
    htfBias: dResult.descriptive.htfSwing.direction
  });
  const validatedMarketContext = buildAmySmcDValidatedContext(dResult);
  const entryMap = detectTimeframeEntryMap(closedCandles, {
    tf,
    marketConcepts: executionSupport,
    validatedContext: validatedMarketContext,
    htfCandles: closedHtfCandles
  });
  const activeSetup = entryMap.activeSetup || null;
  const structure = amySmcDCompatibilityStructure(dResult);
  const dealingRange = {
    ...dResult.descriptive.dealingRange,
    high: dResult.descriptive.dealingRange.top,
    low: dResult.descriptive.dealingRange.bottom,
    rangeSource: dResult.descriptive.dealingRange.source,
    confidence: 'DESCRIPTIVE ONLY'
  };
  const dBsl = dResult.levels.bsl || 0;
  const dSsl = dResult.levels.ssl || 0;
  const activeLiquidityTargets = [
    dBsl > 0 ? { type: 'BSL', level: dBsl, status: 'ACTIVE', source: 'AMY_SMC_D', timeframe: tf } : null,
    dSsl > 0 ? { type: 'SSL', level: dSsl, status: 'ACTIVE', source: 'AMY_SMC_D', timeframe: tf } : null
  ].filter(Boolean);
  const marketConcepts = {
    source: 'AMY_SMC_D',
    directionalAuthority: true,
    structure,
    bsl: dBsl,
    ssl: dSsl,
    fairValueGaps: executionSupport.fairValueGaps,
    orderBlocks: executionSupport.orderBlocks,
    nearestFairValueGaps: executionSupport.nearestFairValueGaps,
    nearestOrderBlocks: executionSupport.nearestOrderBlocks,
    mappingZones: executionSupport.mappingZones,
    executionSupportSource: executionSupport.source
  };

  return {
    tf,
    price: closedPrice,
    analyzedPrice: closedPrice,
    sourceCandleTime: dResult.sourceCandle.time,
    sourceCandle: dResult.sourceCandle,
    baselineSha: dResult.baselineSha,
    mappingSource: 'AMY_SMC_D',
    closedCandleOnly: true,
    noFutureCandle: true,
    noInterpolation: true,
    noSyntheticCandles: true,
    analysisOptions: { ...analysisOptions },
    htfBiases: { ...htfBiases },
    setups: activeSetup ? [activeSetup] : [],
    bestSetup: activeSetup,
    signal: dResult.predictive.nextMove.signal,
    final: dResult.descriptive.finalBias.direction,
    bias: dResult.descriptive.finalBias.direction,
    score: null,
    setupStructure: structure,
    st: structure,
    bsl: dBsl,
    ssl: dSsl,
    liquidityHierarchy: {
      source: 'AMY_SMC_D',
      bsl: dBsl,
      ssl: dSsl,
      activeTargets: activeLiquidityTargets,
      drawTarget: dResult.predictive.nextMove.directionValue > 0
        ? activeLiquidityTargets.find(item => item.type === 'BSL') || null
        : dResult.predictive.nextMove.directionValue < 0
          ? activeLiquidityTargets.find(item => item.type === 'SSL') || null
          : null,
      swept: dResult.descriptive.liquidity.rawSweep ? [dResult.descriptive.liquidity.rawSweep] : []
    },
    drawTarget: dResult.predictive.nextMove.directionValue > 0 ? dBsl : dResult.predictive.nextMove.directionValue < 0 ? dSsl : 0,
    activeLiquidityTargets,
    marketConcepts,
    executionSupport: {
      ...executionSupport,
      directionalAuthority: false,
      role: 'ENTRY_AND_ZONE_CONSUMER_ONLY'
    },
    entryMap: {
      ...entryMap,
      status: entryMap.status || 'AMY_CAUSAL_ENTRY_MAP_V3',
      mappingAuthority: 'AMY_SMC_D',
      mayOverrideMapping: false
    },
    entryWatch: buildCausalEntryWatch(entryMap, tf),
    validatedMarketContext,
    validatedMarketState: validatedMarketContext.marketState,
    validatedDirectionForecast: validatedMarketContext.directionForecast,
    mappingZones: executionSupport.mappingZones,
    dealingRange,
    premiumDiscountZone: dealingRange.location,
    zone: dealingRange.location,
    htfNarrative: {
      sourceTf: dResult.descriptive.htfSwing.timeframe,
      htfBias: dResult.descriptive.htfSwing.direction,
      reason: `Amy-SMC-D HTF Swing ${dResult.descriptive.htfSwing.direction}`,
      source: 'AMY_SMC_D'
    },
    amySmcD: dResult,
    concepts: buildAmySmcDConceptRows(dResult, entryMap)
  };
}
