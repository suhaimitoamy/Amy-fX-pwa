import { state } from './main.js';
import { detectMarketConcepts } from './engine/concept-engine.js';
import { SUPPORTED_MAPPING_TIMEFRAMES } from './engine/mapping-timeframes.js';

const cache = new Map();

function closed(timeframe) {
  return (state.candles?.[timeframe] || [])
    .filter(candle => candle?.isClosed !== false && candle?.amyfxSyntheticCurrent !== true);
}

function signatureFor(timeframe) {
  const timeframes = [timeframe, 'H4', 'D1', 'W1'];
  return timeframes.map(tf => {
    const values = closed(tf);
    const last = values.at(-1);
    return `${tf}:${values.length}:${last?.time || 0}:${last?.open || 0}:${last?.high || 0}:${last?.low || 0}:${last?.close || 0}`;
  }).join('|');
}

function conceptsFor(timeframe) {
  const tf = SUPPORTED_MAPPING_TIMEFRAMES.includes(timeframe) ? timeframe : state.tf;
  if (tf === state.result?.tf && state.result?.executionSupport) {
    return state.result.executionSupport;
  }
  const signature = signatureFor(tf);
  const cached = cache.get(tf);
  if (cached?.signature === signature) return cached.value;
  const candles = closed(tf);
  const value = detectMarketConcepts(candles, {
    tf,
    currentPrice: Number(candles.at(-1)?.close || 0),
    htfCandles: { ...state.candles },
    htfBias: 'NEUTRAL'
  });
  cache.set(tf, { signature, value });
  return value;
}

function invalidate() {
  cache.clear();
}

window.addEventListener('amyfx:candles-updated', invalidate);
window.addEventListener('amyfx:mapping-state-change', invalidate);

window.AmyIndicatorZones = Object.freeze({
  detect: tf => conceptsFor(tf || state.tf).mappingZones,
  concepts: tf => conceptsFor(tf || state.tf),
  refresh: invalidate,
  source: 'AMY_CONCEPT_ENGINE_V3_EXECUTION_SUPPORT',
  directionalAuthority: false,
  mayOverrideMapping: false
});
