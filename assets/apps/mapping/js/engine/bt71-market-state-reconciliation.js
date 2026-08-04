function finite(value, fallback = NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function structuralDirection(value) {
  const text = String(value || '').trim().toUpperCase();
  if (['BULLISH', 'BULL', 'UPTREND', 'BUY'].includes(text)) return 1;
  if (['BEARISH', 'BEAR', 'DOWNTREND', 'SELL'].includes(text)) return -1;
  return 0;
}

function stateLabel(directionValue, phase) {
  if (directionValue > 0) {
    if (phase === 'PULLBACK') return 'BULLISH PULLBACK';
    if (phase === 'TRANSITION') return 'BULLISH TRANSITION';
    return 'UPTREND CONFIRMED';
  }
  if (directionValue < 0) {
    if (phase === 'PULLBACK') return 'BEARISH PULLBACK';
    if (phase === 'TRANSITION') return 'BEARISH TRANSITION';
    return 'DOWNTREND CONFIRMED';
  }
  return 'RANGE / TRANSITION';
}

/**
 * BT7.1 corrects only the meaning of Market State.
 * Market State describes structure on the latest closed candle. Direction
 * Forecast remains the separate future-price authority and is copied unchanged.
 */
export function reconcileBt71MarketState(validatedContext = {}, {
  objectiveStructure = null,
  objectiveStructureSnapshot = null,
  close = NaN
} = {}) {
  if (!validatedContext || typeof validatedContext !== 'object') return validatedContext;
  if (!objectiveStructure || typeof objectiveStructure !== 'object') return validatedContext;

  const baseState = validatedContext.marketState || {};
  const confirmedDirection = structuralDirection(
    objectiveStructure.confirmedTrend || objectiveStructure.trend
  );
  const majorDirection = structuralDirection(
    objectiveStructure.lastMajorBreak?.dir
      || objectiveStructure.lastMajorBreak?.direction
      || objectiveStructure.lastConfirmedBreak?.dir
      || objectiveStructure.lastConfirmedBreak?.direction
  );
  const localDirection = structuralDirection(objectiveStructure.localTrend);
  const transitionDirection = structuralDirection(
    objectiveStructure.transitionDirection
      || objectiveStructure.transitionBreak?.dir
      || objectiveStructure.transitionBreak?.direction
  );

  const confirmedOrMajor = confirmedDirection || majorDirection;
  const transitionOnly = confirmedOrMajor ? 0 : transitionDirection;
  const candidateDirection = confirmedOrMajor || transitionOnly;

  const protectedHigh = finite(
    objectiveStructureSnapshot?.protectedHigh,
    finite(objectiveStructure.protectedHigh)
  );
  const protectedLow = finite(
    objectiveStructureSnapshot?.protectedLow,
    finite(objectiveStructure.protectedLow)
  );
  const currentClose = finite(close);
  const protectedSwingIntact = candidateDirection > 0
    ? (!Number.isFinite(protectedLow) || !Number.isFinite(currentClose) || currentClose > protectedLow)
    : candidateDirection < 0
      ? (!Number.isFinite(protectedHigh) || !Number.isFinite(currentClose) || currentClose < protectedHigh)
      : true;
  const directionValue = protectedSwingIntact ? candidateDirection : 0;

  let phase = 'RANGE';
  if (directionValue) {
    const localOpposes = localDirection && localDirection !== directionValue;
    const transitionOpposes = transitionDirection && transitionDirection !== directionValue;
    phase = transitionOnly
      ? 'TRANSITION'
      : (localOpposes || transitionOpposes)
        ? 'PULLBACK'
        : 'CONTINUATION';
  }

  const resolvedState = stateLabel(directionValue, phase);
  const marketState = {
    ...baseState,
    rawState: baseState.state || 'RANGE / TRANSITION',
    rawDirection: baseState.direction || 'NEUTRAL',
    rawDirectionValue: finite(baseState.directionValue, 0),
    state: resolvedState,
    direction: directionValue > 0 ? 'BULLISH' : directionValue < 0 ? 'BEARISH' : 'NEUTRAL',
    directionValue,
    primaryDirection: directionValue > 0 ? 'BULLISH' : directionValue < 0 ? 'BEARISH' : 'NEUTRAL',
    primaryDirectionValue: directionValue,
    phase,
    confirmed: Boolean(directionValue && phase !== 'TRANSITION'),
    transition: Boolean(directionValue && phase === 'TRANSITION'),
    pullback: phase === 'PULLBACK',
    conceptDirectionValue: confirmedOrMajor,
    localDirectionValue: localDirection,
    transitionDirectionValue: transitionDirection,
    protectedHigh: Number.isFinite(protectedHigh) ? protectedHigh : null,
    protectedLow: Number.isFinite(protectedLow) ? protectedLow : null,
    protectedSwingIntact,
    reconciled: directionValue !== finite(baseState.directionValue, 0)
      || resolvedState !== baseState.state,
    authority: 'AMY_CONCEPT_STRUCTURE_RECONCILIATION_BT7_1',
    sourceRule: 'CONCEPT STRUCTURE PRIMARY DIRECTION + SEPARATE PHASE + PROTECTED SWING',
    directionMeaning: 'CURRENT_STRUCTURE_NOT_FUTURE_PRICE_FORECAST',
    phaseMeaning: 'CONTINUATION_PULLBACK_TRANSITION_OR_RANGE',
    bt71Applied: true
  };

  return {
    ...validatedContext,
    version: '2.1.0-bt7.1',
    marketState,
    isolation: {
      ...(validatedContext.isolation || {}),
      conceptStructureMayReconcileMarketState: true,
      marketStateMayOverrideDirectionForecast: false
    }
  };
}
