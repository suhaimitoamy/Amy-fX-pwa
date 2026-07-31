import { CONCEPT_THRESHOLDS } from './concept-config.js';
import { liquiditySweepEvent, structureDisplacementMetrics } from './concept-structure-metrics.js';
import { cleanConceptCandles, conceptAtrAtClean, conceptSwingPoints } from './concept-candles.js';

export const STRUCTURE_SWING_LENGTH = 4;
export const STRUCTURE_SLOW_SWING_LENGTH = 6;

function availablePivotMap(items, confirmationBars) {
  return new Map(items.map(item => [item.index + confirmationBars, item]));
}

function tracker(scope, swings, right) {
  return {
    scope,
    right,
    confirmedHighAt: availablePivotMap(swings.highs, right),
    confirmedLowAt: availablePivotMap(swings.lows, right),
    lastHigh: null,
    lastLow: null,
    bslConsumed: false,
    sslConsumed: false,
    bslBroken: false,
    sslBroken: false,
    pendingHighIndex: -1,
    pendingLowIndex: -1,
    trend: 'NEUTRAL'
  };
}

function markFailedBreaks(events, values) {
  const horizon = Math.max(1, CONCEPT_THRESHOLDS.structureFailureHorizonBars);
  const validEvents = events.filter(event =>
    event.kind === 'STRUCTURE_BREAK' && event.status === 'CONFIRMED_BREAK'
  );

  for (let eventIndex = 0; eventIndex < validEvents.length; eventIndex += 1) {
    const event = validEvents[eventIndex];
    const nextSameScope = validEvents
      .slice(eventIndex + 1)
      .find(candidate => candidate.scope === event.scope);
    const end = Math.min(
      values.length - 1,
      event.index + horizon,
      nextSameScope ? nextSameScope.index : Infinity
    );
    const tolerance = Math.max(Number(event.localAtr || 0) * 0.05, 0.0000001);

    for (let cursor = event.index + 1; cursor <= end; cursor += 1) {
      const failed = event.direction === 'BULLISH'
        ? values[cursor].close < event.level - tolerance
        : values[cursor].close > event.level + tolerance;
      if (!failed) continue;
      event.failureIndex = cursor;
      event.status = 'FAILED';
      event.failed = true;
      event.valid = false;
      break;
    }
  }
}

function latestConfirmedDirection(events, scope) {
  return [...events].reverse().find(event =>
    event.kind === 'STRUCTURE_BREAK'
    && event.scope === scope
    && event.status === 'CONFIRMED_BREAK'
    && event.valid
  )?.direction || 'NEUTRAL';
}

function pushUnique(events, event) {
  if (!events.some(item => item.id === event.id)) events.push(event);
}

function registerCandidate(
  events,
  values,
  state,
  direction,
  swing,
  level,
  index,
  attemptIndex = index
) {
  const candle = values[index];
  const localAtr = Math.max(conceptAtrAtClean(values, index), 0.0000001);
  const metrics = structureDisplacementMetrics(candle, localAtr, level, direction);
  const concept = state.trend === direction ? 'BOS' : 'MSS';
  const valid = Boolean(metrics.valid);
  const event = {
    id: `${valid ? concept : 'CANDIDATE'}:${state.scope}:${direction}:${valid ? index : attemptIndex}:${level.toFixed(5)}`,
    concept,
    kind: 'STRUCTURE_BREAK',
    scope: state.scope,
    direction,
    level,
    index,
    swingIndex: swing.index,
    availableIndex: swing.index + state.right,
    protectedLevel: direction === 'BULLISH'
      ? state.lastLow?.low ?? null
      : state.lastHigh?.high ?? null,
    protectedSwingIndex: direction === 'BULLISH'
      ? state.lastLow?.index ?? -1
      : state.lastHigh?.index ?? -1,
    localAtr,
    ...metrics,
    hasDisplacement: valid,
    status: valid ? 'CONFIRMED_BREAK' : 'BREAK_CANDIDATE',
    valid,
    failed: false,
    failureIndex: -1
  };
  pushUnique(events, event);
  if (valid) state.trend = direction;
  return event;
}

function updatePivots(state, index) {
  const confirmedHigh = state.confirmedHighAt.get(index);
  const confirmedLow = state.confirmedLowAt.get(index);
  if (confirmedHigh) {
    state.lastHigh = confirmedHigh;
    state.bslConsumed = false;
    state.bslBroken = false;
    state.pendingHighIndex = -1;
  }
  if (confirmedLow) {
    state.lastLow = confirmedLow;
    state.sslConsumed = false;
    state.sslBroken = false;
    state.pendingLowIndex = -1;
  }
}

function detectSweeps(events, values, state, index) {
  const candle = values[index];
  const localAtr = Math.max(conceptAtrAtClean(values, index), 0.0000001);

  if (!state.bslConsumed && state.lastHigh
    && candle.high > state.lastHigh.high
    && candle.close < state.lastHigh.high) {
    const event = liquiditySweepEvent({
      direction: 'BULLISH',
      candle,
      level: state.lastHigh.high,
      index,
      localAtr
    });
    pushUnique(events, {
      ...event,
      id: `${event.id}:${state.scope}`,
      scope: state.scope,
      swingIndex: state.lastHigh.index,
      availableIndex: state.lastHigh.index + state.right
    });
    state.bslConsumed = true;
  }

  if (!state.sslConsumed && state.lastLow
    && candle.low < state.lastLow.low
    && candle.close > state.lastLow.low) {
    const event = liquiditySweepEvent({
      direction: 'BEARISH',
      candle,
      level: state.lastLow.low,
      index,
      localAtr
    });
    pushUnique(events, {
      ...event,
      id: `${event.id}:${state.scope}`,
      scope: state.scope,
      swingIndex: state.lastLow.index,
      availableIndex: state.lastLow.index + state.right
    });
    state.sslConsumed = true;
  }
}

function detectBreaks(events, values, state, index) {
  if (index === 0) return;
  const candle = values[index];
  const previous = values[index - 1];
  const confirmationWindow = 3;

  if (state.lastHigh && !state.bslBroken) {
    const crossed = candle.close > state.lastHigh.high && previous.close <= state.lastHigh.high;
    if (crossed) state.pendingHighIndex = index;
    const pending = state.pendingHighIndex >= 0
      && index - state.pendingHighIndex <= confirmationWindow
      && candle.close > state.lastHigh.high;
    if (pending) {
      const event = registerCandidate(
        events,
        values,
        state,
        'BULLISH',
        state.lastHigh,
        state.lastHigh.high,
        index,
        state.pendingHighIndex
      );
      if (event.valid) {
        state.bslBroken = true;
        state.pendingHighIndex = -1;
      }
    } else if (state.pendingHighIndex >= 0 && candle.close <= state.lastHigh.high) {
      state.pendingHighIndex = -1;
    }
  }

  if (state.lastLow && !state.sslBroken) {
    const crossed = candle.close < state.lastLow.low && previous.close >= state.lastLow.low;
    if (crossed) state.pendingLowIndex = index;
    const pending = state.pendingLowIndex >= 0
      && index - state.pendingLowIndex <= confirmationWindow
      && candle.close < state.lastLow.low;
    if (pending) {
      const event = registerCandidate(
        events,
        values,
        state,
        'BEARISH',
        state.lastLow,
        state.lastLow.low,
        index,
        state.pendingLowIndex
      );
      if (event.valid) {
        state.sslBroken = true;
        state.pendingLowIndex = -1;
      }
    } else if (state.pendingLowIndex >= 0 && candle.close >= state.lastLow.low) {
      state.pendingLowIndex = -1;
    }
  }
}

export function detectStructureConcepts(candles, {
  left = STRUCTURE_SWING_LENGTH,
  right = STRUCTURE_SWING_LENGTH,
  slowLeft = STRUCTURE_SLOW_SWING_LENGTH,
  slowRight = STRUCTURE_SLOW_SWING_LENGTH
} = {}) {
  const values = cleanConceptCandles(candles);
  const fastSwings = conceptSwingPoints(values, left, right);
  const slowSwings = conceptSwingPoints(values, slowLeft, slowRight);
  const internal = tracker('INTERNAL', fastSwings, right);
  const major = tracker('MAJOR', slowSwings, slowRight);
  const events = [];

  for (let index = 0; index < values.length; index += 1) {
    for (const state of [internal, major]) {
      updatePivots(state, index);
      if (index === 0) continue;
      detectSweeps(events, values, state, index);
      detectBreaks(events, values, state, index);
    }
  }

  events.sort((a, b) => a.index - b.index || (a.scope === 'MAJOR' ? 1 : -1));
  markFailedBreaks(events, values);
  const structureEvents = events.filter(item => item.kind === 'STRUCTURE_BREAK');
  const sweepEvents = events.filter(item => item.kind === 'LIQUIDITY_SWEEP');
  const trend = latestConfirmedDirection(structureEvents, 'MAJOR');
  const localTrend = latestConfirmedDirection(structureEvents, 'INTERNAL');

  return {
    trend,
    localTrend,
    events,
    structureEvents,
    sweepEvents,
    latestStructure: [...structureEvents].reverse().find(item => item.valid) || structureEvents.at(-1) || null,
    latestSweep: sweepEvents.at(-1) || null,
    fastSwings,
    slowSwings,
    protectedHigh: [...structureEvents].reverse().find(item =>
      item.valid && item.direction === 'BEARISH' && Number.isFinite(item.protectedLevel)
    )?.protectedLevel ?? null,
    protectedLow: [...structureEvents].reverse().find(item =>
      item.valid && item.direction === 'BULLISH' && Number.isFinite(item.protectedLevel)
    )?.protectedLevel ?? null,
    thresholds: {
      penetrationAtr: CONCEPT_THRESHOLDS.structurePenetrationAtr,
      reclaimAtr: CONCEPT_THRESHOLDS.liquidityReclaimAtr,
      failureHorizonBars: CONCEPT_THRESHOLDS.structureFailureHorizonBars
    }
  };
}
