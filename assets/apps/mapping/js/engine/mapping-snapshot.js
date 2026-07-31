function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clone(value, fallback) {
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

function sourceCandle(candles) {
  const candle = Array.isArray(candles) ? candles.at(-1) : null;
  if (!candle) return null;
  return {
    time: finite(candle.time),
    open: finite(candle.open),
    high: finite(candle.high),
    low: finite(candle.low),
    close: finite(candle.close),
    isClosed: candle.isClosed !== false
  };
}

export function buildMappingSnapshot(result, {
  candles = [],
  livePrice = null,
  capturedAt = Date.now()
} = {}) {
  const concepts = result?.marketConcepts || {};
  const structure = concepts.structure || result?.st || {};
  const validated = result?.validatedMarketContext || {};
  const entryMap = result?.entryMap || {};
  const scenario = entryMap.scenario || result?.entryWatch?.scenario || {};
  const execution = result?.setupExecution || {};
  const lastClosedCandle = sourceCandle(candles);

  const snapshot = {
    version: '3.0.0',
    source: 'AMY_MAPPING_SINGLE_AUTHORITY_V3',
    timeframe: result?.tf || null,
    capturedAt,
    sourceCandle: lastClosedCandle,
    data: {
      stale: Boolean(result?.dataStale),
      degraded: Boolean(result?.dataDegraded),
      warnings: clone(result?.dataWarnings || [], []),
      closedCandleOnly: true,
      candleCount: Array.isArray(candles) ? candles.length : 0
    },
    facts: {
      structure: {
        trend: structure.trend || 'NEUTRAL',
        confirmedTrend: structure.confirmedTrend || 'NEUTRAL',
        localTrend: structure.localTrend || 'NEUTRAL',
        protectedHigh: finite(concepts?.structureSnapshot?.protectedHigh),
        protectedLow: finite(concepts?.structureSnapshot?.protectedLow),
        lastEvent: clone(structure.lastEvent || null, null),
        lastConfirmedBreak: clone(structure.lastConfirmedBreak || null, null),
        lastSweep: clone(structure.lastSweep || null, null),
        events: clone((structure.events || []).slice(-20), [])
      },
      liquidity: {
        bsl: finite(result?.bsl, 0),
        ssl: finite(result?.ssl, 0),
        drawTarget: clone(result?.liquidityHierarchy?.drawTarget || null, null),
        active: clone(result?.liquidityHierarchy?.activeTargets || [], []),
        consumed: clone(result?.liquidityHierarchy?.swept || [], []),
        tolerance: clone(result?.liquidityHierarchy?.tolerance || {}, {})
      },
      zones: {
        fairValueGaps: clone(concepts?.fairValueGaps || [], []),
        orderBlocks: clone(concepts?.orderBlocks || [], [])
      }
    },
    context: {
      marketState: clone(validated.marketState || {}, {}),
      directionForecast: clone(validated.directionForecast || {}, {}),
      directionDecision: clone(result?.directionDecision || {}, {}),
      htfNarrative: clone(result?.htfNarrative || {}, {}),
      dealingRange: clone(result?.dealingRange || {}, {}),
      session: clone(result?.sessionContext || {}, {})
    },
    scenario: clone(scenario, {}),
    execution: clone(execution, {}),
    freshness: {
      state: result?.dataStale ? 'STALE' : lastClosedCandle ? 'CLOSED_CANDLE' : 'UNKNOWN',
      sourceCandleTime: lastClosedCandle?.time || null,
      analyzedAt: capturedAt
    },
    liveOverlay: {
      price: finite(livePrice, finite(result?.price)),
      observedAt: capturedAt,
      provisional: true,
      mayRewriteClosedCandleFacts: false
    },
    authority: {
      facts: 'AMY_CONCEPT_ENGINE_V3',
      direction: validated.source || 'AMY_MAPPING_CONTEXT_V3',
      entry: entryMap.source || 'AMY_CAUSAL_ENTRY_MAP_V3',
      uiMayMutate: false
    }
  };

  return deepFreeze(snapshot);
}
