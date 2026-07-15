import { analyze as analyzeLegacy, tfGroup } from './core/analyze.js';
import { detectMarketConcepts } from './concept-engine.js';

export { tfGroup };

const REPLACED_ROWS = new Set(['Structure', 'Latest Event', 'OB', 'FVG', 'Liquidity Hierarchy', 'BSL / SSL Sweep', 'Concept Filter']);

function mergeRows(current, replacement) {
  const rows = Array.isArray(current) ? current : [];
  const last = rows.find(row => row?.[0] === 'Best Setup');
  const kept = rows.filter(row => row?.[0] !== 'Best Setup' && !REPLACED_ROWS.has(row?.[0]));
  return [...kept, ...replacement, ...(last ? [last] : [])];
}

export function analyze(candles, tf, htfBiases = {}, currentPrice = null, htfCandles = {}) {
  const result = analyzeLegacy(candles, tf, htfBiases, currentPrice, htfCandles);
  if (!Array.isArray(candles) || candles.length < 30) return result;
  const marketConcepts = detectMarketConcepts(candles, {
    tf,
    currentPrice: result.price || currentPrice,
    htfCandles,
    htfBias: result.htfNarrative?.htfBias || 'NEUTRAL'
  });
  return {
    ...result,
    setupStructure: result.st,
    st: marketConcepts.structure,
    bsl: marketConcepts.bsl,
    ssl: marketConcepts.ssl,
    liquidityHierarchy: marketConcepts.liquidityHierarchy,
    drawTarget: marketConcepts.liquidityHierarchy.drawTarget,
    activeLiquidityTargets: marketConcepts.liquidityHierarchy.activeTargets,
    marketConcepts,
    mappingZones: marketConcepts.mappingZones,
    concepts: mergeRows(result.concepts, marketConcepts.concepts)
  };
}
