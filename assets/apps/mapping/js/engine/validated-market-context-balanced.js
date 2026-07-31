import {
  evaluateValidatedMarketContext as evaluateCanonicalContext,
  validatedForecastCandidate
} from './validated-market-context.js';

/**
 * Compatibility shim.
 *
 * The former implementation mirrored the trusted H1 bullish rule into a new
 * bearish rule. That changed the reference logic and created two direction
 * authorities. Imports that still point at this filename now receive the
 * canonical context; H1 bearish remains NO CLEAR DIRECTION.
 */
export function balancedH1ForecastCandidate(input = {}) {
  return validatedForecastCandidate({ ...input, tf: 'H1' });
}

export function evaluateValidatedMarketContext(input = {}) {
  return evaluateCanonicalContext(input);
}
