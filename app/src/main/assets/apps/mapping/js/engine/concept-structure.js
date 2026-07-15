import { CONCEPT_THRESHOLDS } from './concept-config.js';
import { liquiditySweepEvent, structureDisplacementMetrics } from './concept-structure-metrics.js';
import { cleanConceptCandles, conceptAtrAtClean, conceptSwingPoints } from './concept-candles.js';

export function detectStructureConcepts(candles, { left = 3, right = 3 } = {}) {
  const values = cleanConceptCandles(candles);
  const swings = conceptSwingPoints(values, left, right);
  const brokenHighs = new Set();
  const brokenLows = new Set();
  const events = [];
  let trend = 'NEUTRAL';
  let transition = null;

  for (let index = 1; index < values.length; index += 1) {
    const candle = values[index];
    const previousHigh = [...swings.highs].reverse().find(item => item.index < index - 1);
    const previousLow = [...swings.lows].reverse().find(item => item.index < index - 1);
    let breaksHigh = Boolean(previousHigh && !brokenHighs.has(previousHigh.index) && candle.high > previousHigh.high);
    let breaksLow = Boolean(previousLow && !brokenLows.has(previousLow.index) && candle.low < previousLow.low);

    if (breaksHigh && breaksLow) {
      if (candle.close > previousHigh.high) breaksLow = false;
      else if (candle.close < previousLow.low) breaksHigh = false;
      else {
        breaksHigh = false;
        breaksLow = false;
      }
    }

    const register = (direction, swing, level, brokenSet) => {
      const closedBeyond = direction === 'BULLISH' ? candle.close > level : candle.close < level;
      const localAtr = Math.max(conceptAtrAtClean(values, index), 0.0000001);
      const metrics = structureDisplacementMetrics(candle, localAtr, level, direction);

      if (!closedBeyond) {
        events.push(liquiditySweepEvent({ direction, candle, level, index, localAtr }));
        return;
      }
      if (!metrics.valid) return;

      const opposite = trend !== 'NEUTRAL' && trend !== direction;
      let scope = 'MAJOR';
      const concept = opposite ? 'CHOCH' : 'BOS';
      if (opposite) {
        const extendsTransition = transition
          && transition.direction === direction
          && (direction === 'BULLISH' ? level > transition.level : level < transition.level);
        if (!extendsTransition) {
          scope = 'INTERNAL';
          transition = { direction, level, index };
        } else {
          trend = direction;
          transition = null;
        }
      } else {
        trend = direction;
        transition = null;
      }

      const event = {
        id: `${concept}:${scope}:${direction}:${index}:${level.toFixed(5)}`,
        concept,
        kind: 'STRUCTURE_BREAK',
        scope,
        direction,
        level,
        index,
        localAtr,
        ...metrics,
        status: 'CONFIRMED_BREAK',
        valid: true,
        failureIndex: -1
      };
      for (let cursor = index + 1; cursor < values.length; cursor += 1) {
        const failed = direction === 'BULLISH'
          ? values[cursor].close < level
          : values[cursor].close > level;
        if (failed) {
          event.failureIndex = cursor;
          event.status = 'FAILED';
          break;
        }
      }
      events.push(event);
      brokenSet.add(swing.index);
    };

    if (breaksHigh) register('BULLISH', previousHigh, previousHigh.high, brokenHighs);
    if (breaksLow) register('BEARISH', previousLow, previousLow.low, brokenLows);
  }

  const structureEvents = events.filter(item => item.kind === 'STRUCTURE_BREAK');
  const sweepEvents = events.filter(item => item.kind === 'LIQUIDITY_SWEEP');
  return {
    trend,
    events,
    structureEvents,
    sweepEvents,
    latestStructure: structureEvents.at(-1) || null,
    latestSweep: sweepEvents.at(-1) || null,
    thresholds: {
      penetrationAtr: CONCEPT_THRESHOLDS.structurePenetrationAtr,
      reclaimAtr: CONCEPT_THRESHOLDS.liquidityReclaimAtr
    }
  };
}
