export function avg(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function atr(candles) {
  const ranges = [];
  const start = Math.max(0, (candles?.length || 0) - 14);
  for (let index = start; index < (candles?.length || 0); index += 1) {
    const previous = candles[index - 1];
    const candle = candles[index];
    const range = previous
      ? Math.max(candle.high - candle.low, Math.abs(candle.high - previous.close), Math.abs(candle.low - previous.close))
      : candle.high - candle.low;
    if (Number.isFinite(range) && range > 0) ranges.push(range);
  }
  return avg(ranges) || 0.5;
}

export function atrAt(candles, index, period = 14) {
  const end = Math.max(0, Math.min(index, candles?.length || 0));
  const ranges = [];
  for (let cursor = Math.max(0, end - period); cursor < end; cursor += 1) {
    const previous = candles[cursor - 1];
    const candle = candles[cursor];
    const range = previous
      ? Math.max(candle.high - candle.low, Math.abs(candle.high - previous.close), Math.abs(candle.low - previous.close))
      : candle.high - candle.low;
    if (Number.isFinite(range) && range > 0) ranges.push(range);
  }
  return avg(ranges) || 0.5;
}

export function bodyRatio(candle) {
  return Math.abs(candle.close - candle.open) / Math.max(candle.high - candle.low, 0.0001);
}

export function swings(candles, left = 3, right = 3) {
  const highs = [];
  const lows = [];
  for (let index = left; index < candles.length - right; index += 1) {
    let isHigh = true;
    let isLow = true;
    for (let offset = 1; offset <= left; offset += 1) {
      if (candles[index].high <= candles[index - offset].high) isHigh = false;
      if (candles[index].low >= candles[index - offset].low) isLow = false;
    }
    for (let offset = 1; offset <= right; offset += 1) {
      if (candles[index].high <= candles[index + offset].high) isHigh = false;
      if (candles[index].low >= candles[index + offset].low) isLow = false;
    }
    if (isHigh) highs.push({ ...candles[index], index });
    if (isLow) lows.push({ ...candles[index], index });
  }
  return { highs, lows };
}

export const p2 = value => Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '-';
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const directionSign = value => value === 'BULLISH' ? 1 : value === 'BEARISH' ? -1 : 0;

function displacementMetrics(candle, localAtr, level, direction) {
  const body = Math.abs(candle.close - candle.open);
  const range = Math.max(candle.high - candle.low, 0.0001);
  const ratio = body / range;
  const atrValue = Math.max(localAtr, 0.0001);
  const penetration = direction === 'BULLISH'
    ? candle.close - level
    : level - candle.close;
  const hasSize = body >= atrValue * 0.6 && range >= atrValue * 0.75;
  const hasDominance = ratio >= 0.55;
  const hasPenetration = penetration >= atrValue * 0.05;
  return {
    body,
    range,
    ratio,
    penetration,
    valid: hasSize && hasDominance && hasPenetration
  };
}

function structureEvent({
  candle,
  level,
  index,
  swingIndex,
  direction,
  trendBefore,
  trendAfter,
  metrics,
  type,
  kind,
  scope = 'INTERNAL',
  stage = 'UNCONFIRMED',
  trendConfirmed = false
}) {
  const valid = type === 'VALID_BREAK';
  return {
    eventId: `${index}:${direction}:${Number(level).toFixed(5)}`,
    kind: kind || (valid && trendBefore !== 'NEUTRAL' && trendBefore !== direction ? 'CHOCH' : 'BOS'),
    dir: direction,
    price: level,
    index,
    swingIndex,
    valid,
    sweepOnly: type === 'SWEEP_ONLY',
    failed: type === 'BREAK_FAILED',
    hasDisplacement: metrics?.valid || false,
    breakType: type,
    structureScope: scope,
    confirmationStage: stage,
    trendConfirmed,
    trendBefore,
    trendAfter,
    candleClose: candle.close,
    candleHigh: candle.high,
    candleLow: candle.low,
    bodyRatio: metrics?.ratio ?? bodyRatio(candle),
    localAtr: metrics?.localAtr ?? 0,
    penetration: metrics?.penetration ?? 0
  };
}

function extendsTransition(direction, level, transitionBreak) {
  if (!transitionBreak || transitionBreak.dir !== direction || transitionBreak.failed) return false;
  if (direction === 'BULLISH') return level > transitionBreak.price;
  return level < transitionBreak.price;
}

function nextTransitionLevel(sw, transitionBreak, brokenHighSwings, brokenLowSwings) {
  if (!transitionBreak || transitionBreak.failed) return null;
  if (transitionBreak.dir === 'BULLISH') {
    const candidates = sw.highs
      .filter(item => item.index < transitionBreak.index && item.high > transitionBreak.price && !brokenHighSwings.has(item.index))
      .sort((a, b) => a.high - b.high);
    return candidates[0]?.high ?? null;
  }
  const candidates = sw.lows
    .filter(item => item.index < transitionBreak.index && item.low < transitionBreak.price && !brokenLowSwings.has(item.index))
    .sort((a, b) => b.low - a.low);
  return candidates[0]?.low ?? null;
}

export function detectStructure(cs, sw) {
  let trend = 'NEUTRAL';
  let lastConfirmedBreak = null;
  let lastMajorBreak = null;
  let lastInternalBreak = null;
  let transitionBreak = null;
  let lastSweep = null;
  let lastFailedBreak = null;
  let lastEvent = null;
  const events = [];
  const brokenHighSwings = new Set();
  const brokenLowSwings = new Set();

  const registerValidBreak = ({ candle, level, swingIndex, index, direction, metrics }) => {
    const trendBefore = trend;
    const oppositeToTrend = trendBefore !== 'NEUTRAL' && trendBefore !== direction;
    let scope = 'MAJOR';
    let stage = 'CONFIRMED';
    let kind = oppositeToTrend ? 'CHOCH' : 'BOS';
    let trendConfirmed = true;
    let trendAfter = direction;

    if (oppositeToTrend && !extendsTransition(direction, level, transitionBreak)) {
      scope = 'INTERNAL';
      stage = 'TRANSITION';
      kind = 'CHOCH';
      trendConfirmed = false;
      trendAfter = trendBefore;
    }

    const event = structureEvent({
      candle,
      level,
      index,
      swingIndex,
      direction,
      trendBefore,
      trendAfter,
      metrics,
      type: 'VALID_BREAK',
      kind,
      scope,
      stage,
      trendConfirmed
    });

    if (scope === 'INTERNAL') {
      transitionBreak = event;
      lastInternalBreak = event;
    } else {
      trend = direction;
      lastMajorBreak = event;
      if (transitionBreak && transitionBreak.dir === direction) transitionBreak = null;
      if (transitionBreak && transitionBreak.dir !== direction) transitionBreak = null;
    }

    lastConfirmedBreak = event;
    lastEvent = event;
    events.push(event);
    return event;
  };

  for (let index = 1; index < cs.length; index += 1) {
    const candle = cs[index];
    const previousHigh = [...sw.highs].reverse().find(item => item.index < index - 1);
    const previousLow = [...sw.lows].reverse().find(item => item.index < index - 1);
    const localAtr = Math.max(atrAt(cs, index), 0.0001);

    if (lastConfirmedBreak && !lastConfirmedBreak.failed) {
      const returnedInside = lastConfirmedBreak.dir === 'BULLISH'
        ? candle.close < lastConfirmedBreak.price
        : candle.close > lastConfirmedBreak.price;
      if (returnedInside) {
        const failed = {
          ...lastConfirmedBreak,
          failed: true,
          valid: false,
          breakType: 'BREAK_FAILED',
          confirmationStage: 'FAILED',
          failureIndex: index,
          failureClose: candle.close
        };
        lastConfirmedBreak = failed;
        lastFailedBreak = failed;
        lastEvent = failed;
        events.push(failed);
        if (transitionBreak?.eventId === failed.eventId) transitionBreak = null;
        if (lastInternalBreak?.eventId === failed.eventId) lastInternalBreak = failed;
        if (lastMajorBreak?.eventId === failed.eventId) lastMajorBreak = failed;
      }
    }

    let breaksHigh = Boolean(previousHigh && !brokenHighSwings.has(previousHigh.index) && candle.high > previousHigh.high);
    let breaksLow = Boolean(previousLow && !brokenLowSwings.has(previousLow.index) && candle.low < previousLow.low);

    if (breaksHigh && breaksLow) {
      if (candle.close > previousHigh.high) breaksLow = false;
      else if (candle.close < previousLow.low) breaksHigh = false;
      else {
        breaksHigh = false;
        breaksLow = false;
      }
    }

    if (breaksHigh) {
      const closedBeyond = candle.close > previousHigh.high;
      const metrics = displacementMetrics(candle, localAtr, previousHigh.high, 'BULLISH');
      metrics.localAtr = localAtr;
      const type = closedBeyond && metrics.valid ? 'VALID_BREAK' : !closedBeyond ? 'SWEEP_ONLY' : null;
      if (type === 'VALID_BREAK') {
        registerValidBreak({ candle, level: previousHigh.high, swingIndex: previousHigh.index, index, direction: 'BULLISH', metrics });
        brokenHighSwings.add(previousHigh.index);
      } else if (type === 'SWEEP_ONLY') {
        const event = structureEvent({
          candle,
          level: previousHigh.high,
          swingIndex: previousHigh.index,
          index,
          direction: 'BULLISH',
          trendBefore: trend,
          trendAfter: trend,
          metrics,
          type,
          scope: 'INTERNAL',
          stage: 'SWEEP',
          trendConfirmed: false
        });
        events.push(event);
        lastEvent = event;
        lastSweep = event;
      }
    }

    if (breaksLow) {
      const closedBeyond = candle.close < previousLow.low;
      const metrics = displacementMetrics(candle, localAtr, previousLow.low, 'BEARISH');
      metrics.localAtr = localAtr;
      const type = closedBeyond && metrics.valid ? 'VALID_BREAK' : !closedBeyond ? 'SWEEP_ONLY' : null;
      if (type === 'VALID_BREAK') {
        registerValidBreak({ candle, level: previousLow.low, swingIndex: previousLow.index, index, direction: 'BEARISH', metrics });
        brokenLowSwings.add(previousLow.index);
      } else if (type === 'SWEEP_ONLY') {
        const event = structureEvent({
          candle,
          level: previousLow.low,
          swingIndex: previousLow.index,
          index,
          direction: 'BEARISH',
          trendBefore: trend,
          trendAfter: trend,
          metrics,
          type,
          scope: 'INTERNAL',
          stage: 'SWEEP',
          trendConfirmed: false
        });
        events.push(event);
        lastEvent = event;
        lastSweep = event;
      }
    }
  }

  const transitionConfirmationLevel = nextTransitionLevel(sw, transitionBreak, brokenHighSwings, brokenLowSwings);
  return {
    trend,
    confirmedTrend: trend,
    localTrend: lastConfirmedBreak?.dir || trend,
    transitionDirection: transitionBreak?.dir || 'NEUTRAL',
    transitionBreak,
    transitionConfirmationLevel,
    last: lastEvent,
    lastEvent,
    lastConfirmedBreak,
    lastMajorBreak,
    lastInternalBreak,
    lastSweep,
    lastFailedBreak,
    events: events.slice(-30)
  };
}
