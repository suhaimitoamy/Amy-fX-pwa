import {
  TIMEFRAME_CONTEXT,
  normalizeMappingTimeframe
} from './mapping-timeframes.js';

const ANALYSIS_DEPENDENCIES = Object.freeze({
  M1: Object.freeze(['M1', 'M5', 'M15', 'H1', 'H4']),
  M5: Object.freeze(['M5', 'M15', 'H1', 'H4']),
  M15: Object.freeze(['M15', 'M30', 'H1', 'H4']),
  M30: Object.freeze(['M30', 'H1', 'H4']),
  H1: Object.freeze(['H1', 'H4', 'D1']),
  H4: Object.freeze(['H4', 'D1', 'W1']),
  D1: Object.freeze(['D1', 'W1']),
  W1: Object.freeze(['W1'])
});

export function mappingRefreshDependencies(value) {
  const timeframe = normalizeMappingTimeframe(value || 'M15');
  const requested = new Set(ANALYSIS_DEPENDENCIES[timeframe] || [timeframe]);

  let context = TIMEFRAME_CONTEXT[timeframe] || null;
  const visited = new Set();
  while (context && !visited.has(context)) {
    visited.add(context);
    requested.add(context);
    context = TIMEFRAME_CONTEXT[context] || null;
  }

  return [...requested];
}

export const MAPPING_REFRESH_DEPENDENCIES = ANALYSIS_DEPENDENCIES;
