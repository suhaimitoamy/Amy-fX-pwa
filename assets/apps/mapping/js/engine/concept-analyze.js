import { analyze as analyzeLegacy, tfGroup } from './core/analyze.js';
import { detectMarketConcepts } from './concept-engine.js';
import {
  causalEntryLifecycleContract,
  detectTimeframeEntryMap
} from './concept-entry-map-v3.js';
import { evaluateValidatedMarketContext } from './validated-market-context.js';
import { reconcileBt71MarketState } from './bt71-market-state-reconciliation.js';

export { tfGroup };

const REPLACED_ROWS = new Set([
  'Structure', 'Latest Event', 'OB', 'FVG', 'Liquidity Hierarchy',
  'BSL / SSL Sweep', 'Concept Filter', 'Entry Map'
]);

function mergeRows(current, replacement) {
  const rows = Array.isArray(current) ? current : [];
  const kept = rows.filter(row => row?.[0] !== 'Best Setup' && !REPLACED_ROWS.has(row?.[0]));
  return [...kept, ...replacement];
}

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
  const result = analyzeLegacy(
    candles,
    tf,
    htfBiases,
    currentPrice,
    htfCandles,
    analysisOptions
  );
  if (!Array.isArray(candles) || candles.length < 30) return { ...result, htfBiases };
  const marketConcepts = detectMarketConcepts(candles, {
    tf,
    currentPrice: result.price || currentPrice,
    htfCandles,
    htfBias: result.htfNarrative?.htfBias || 'NEUTRAL'
  });
  const strictValidatedMarketContext = evaluateValidatedMarketContext({
    candles,
    tf,
    htfCandles
  });
  const validatedMarketContext = reconcileBt71MarketState(strictValidatedMarketContext, {
    objectiveStructure: marketConcepts.structure,
    objectiveStructureSnapshot: marketConcepts.structureSnapshot,
    close: result.price || currentPrice || candles.at(-1)?.close
  });
  const entryMap = detectTimeframeEntryMap(candles, {
    tf,
    marketConcepts,
    validatedContext: validatedMarketContext,
    htfCandles
  });
  const activeSetup = entryMap.activeSetup || null;
  const replacementRows = [...marketConcepts.concepts, entryMapRow(entryMap)];

  return {
    ...result,
    htfBiases: { ...htfBiases },
    setups: activeSetup ? [activeSetup] : [],
    bestSetup: activeSetup,
    signal: activeSetup?.dir || 'WAIT',
    setupStructure: result.st,
    st: marketConcepts.structure,
    bsl: marketConcepts.bsl,
    ssl: marketConcepts.ssl,
    liquidityHierarchy: marketConcepts.liquidityHierarchy,
    drawTarget: marketConcepts.liquidityHierarchy.drawTarget,
    activeLiquidityTargets: marketConcepts.liquidityHierarchy.activeTargets,
    marketConcepts,
    entryMap: {
      ...entryMap,
      status: entryMap.status || 'AMY_CAUSAL_ENTRY_MAP_V3'
    },
    entryWatch: buildCausalEntryWatch(entryMap, tf),
    validatedMarketContext,
    validatedMarketState: validatedMarketContext.marketState,
    validatedDirectionForecast: validatedMarketContext.directionForecast,
    mappingZones: marketConcepts.mappingZones,
    concepts: mergeRows(result.concepts, replacementRows)
  };
}
