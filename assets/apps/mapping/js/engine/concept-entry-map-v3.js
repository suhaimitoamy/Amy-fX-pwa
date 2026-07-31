import {
  cleanConceptCandles,
  conceptAtrAtClean,
  conceptNumber
} from './concept-candles.js';
import {
  entryProfileFor,
  normalizeMappingTimeframe,
  timeframeDurationMs
} from './mapping-timeframes.js';

function timestampMs(value) {
  const numeric = conceptNumber(value);
  if (!Number.isFinite(numeric)) return 0;
  return numeric > 10_000_000_000 ? numeric : numeric * 1000;
}

function witaMinute(value) {
  const ms = timestampMs(value);
  if (!ms) return -1;
  const local = new Date(ms + 8 * 60 * 60 * 1000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

function inSession(minute, start, end) {
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

function validExecutionSession(candle, mode = 'NONE') {
  if (mode === 'NONE') return true;
  const minute = witaMinute(candle?.time);
  const london = inSession(minute, 14 * 60, 18 * 60);
  const newYork = inSession(minute, 19 * 60 + 30, 4 * 60);
  return mode === 'NEW_YORK_ONLY' ? newYork : london || newYork;
}

function normalizedDirection(value) {
  const text = String(value || '').toUpperCase();
  if (text.includes('BULL') || text.includes('BUY')) return 'BULLISH';
  if (text.includes('BEAR') || text.includes('SELL')) return 'BEARISH';
  return 'NEUTRAL';
}

function expectedSweepType(direction) {
  return direction === 'BULLISH' ? 'SSL' : direction === 'BEARISH' ? 'BSL' : '';
}

function targetType(direction) {
  return direction === 'BULLISH' ? 'BSL' : direction === 'BEARISH' ? 'SSL' : '';
}

function emaSeries(values, length) {
  const output = Array(values.length).fill(NaN);
  if (!values.length) return output;
  const alpha = 2 / (Math.max(1, length) + 1);
  let average = values[0];
  output[0] = average;
  for (let index = 1; index < values.length; index += 1) {
    average = alpha * values[index] + (1 - alpha) * average;
    output[index] = average;
  }
  return output;
}

function contextTrendAt({
  contextCandles,
  contextTimeframe,
  triggerCloseMs,
  direction
}) {
  if (!contextTimeframe) {
    return {
      required: false,
      ready: true,
      aligned: true,
      timeframe: null,
      candleTime: null,
      close: null,
      ema20: null,
      ema20Previous: null
    };
  }
  const duration = timeframeDurationMs(contextTimeframe);
  const values = cleanConceptCandles(contextCandles)
    .filter(candle => timestampMs(candle.time) + duration <= triggerCloseMs)
    .sort((a, b) => timestampMs(a.time) - timestampMs(b.time));
  if (!duration || values.length < 21) {
    return {
      required: true,
      ready: false,
      aligned: false,
      timeframe: contextTimeframe,
      candleTime: null,
      close: null,
      ema20: null,
      ema20Previous: null
    };
  }
  const averages = emaSeries(values.map(candle => candle.close), 20);
  const index = values.length - 1;
  const close = values[index].close;
  const ema20 = averages[index];
  const ema20Previous = averages[index - 1];
  const aligned = direction === 'BULLISH'
    ? close > ema20 && ema20 >= ema20Previous
    : close < ema20 && ema20 <= ema20Previous;
  return {
    required: true,
    ready: true,
    aligned,
    timeframe: contextTimeframe,
    candleTime: values[index].time,
    close,
    ema20,
    ema20Previous
  };
}

export function entryTrendFiltersAt(candles, {
  tf,
  index,
  direction,
  atr,
  htfCandles = {},
  profile = entryProfileFor(tf)
} = {}) {
  const timeframe = normalizeMappingTimeframe(tf);
  const values = cleanConceptCandles(candles)
    .filter(candle => candle.isClosed !== false);
  const trigger = values[index];
  const normalized = normalizedDirection(direction);
  if (!profile || !trigger || normalized === 'NEUTRAL') {
    return {
      ready: false,
      emaStack: false,
      emaDistance: false,
      emaDistanceRequired: timeframe === 'H1',
      context: contextTrendAt({
        contextCandles: [],
        contextTimeframe: profile?.contextTimeframe || null,
        triggerCloseMs: 0,
        direction: normalized
      })
    };
  }
  const closes = values.slice(0, index + 1).map(candle => candle.close);
  const ema21 = emaSeries(closes, 21).at(-1);
  const ema34 = emaSeries(closes, 34).at(-1);
  const ema90 = emaSeries(closes, 90).at(-1);
  const emaReady = closes.length >= 90 && [ema21, ema34, ema90].every(Number.isFinite);
  const emaStack = emaReady && (
    normalized === 'BULLISH'
      ? ema21 > ema34 && ema34 > ema90
      : ema21 < ema34 && ema34 < ema90
  );
  const emaDistanceRequired = timeframe === 'H1';
  const emaDistance = !emaDistanceRequired || (
    Number.isFinite(atr)
    && atr > 0
    && Number.isFinite(ema21)
    && Math.abs(trigger.close - ema21) <= atr * 2
  );
  const triggerCloseMs = timestampMs(trigger.time) + timeframeDurationMs(timeframe);
  const context = contextTrendAt({
    contextCandles: htfCandles?.[profile.contextTimeframe] || [],
    contextTimeframe: profile.contextTimeframe,
    triggerCloseMs,
    direction: normalized
  });
  return {
    ready: emaStack && emaDistance && context.ready && context.aligned,
    emaStack,
    emaReady,
    ema21,
    ema34,
    ema90,
    emaDistance,
    emaDistanceRequired,
    emaDistanceAtr: Number.isFinite(atr) && atr > 0
      ? Math.abs(trigger.close - ema21) / atr
      : null,
    context,
    evaluatedIndex: index,
    evaluatedTime: trigger.time
  };
}

function confirmedSweeps(marketConcepts, direction) {
  const expected = expectedSweepType(direction);
  const fromLevels = (marketConcepts?.liquidityLevels || [])
    .filter(level =>
      level.type === expected
      && level.confirmed === true
      && level.status === 'CONFIRMED_REACTION'
      && Number.isInteger(level.interactionIndex)
      && level.interactionIndex >= 0
    )
    .map(level => ({
      id: level.id,
      index: level.interactionIndex,
      time: level.interactionTime,
      type: level.type,
      level: level.level,
      subtype: level.subtype,
      tier: level.tier || (
        ['PDH', 'PDL', 'PWH', 'PWL'].includes(level.subtype)
          ? 'EXTERNAL_KEY'
          : level.subtype === 'EQUAL'
            ? 'EQUAL_POOL'
            : 'INTERNAL_SWING'
      ),
      reclaimDepthAtr: level.reclaimDepthAtr,
      source: 'LIQUIDITY_LEVEL'
    }));
  const fromStructure = (marketConcepts?.structureSnapshot?.sweepEvents || [])
    .filter(event => event.valid && event.concept === expected)
    .map(event => ({
      id: event.id,
      index: event.index,
      time: event.time,
      type: event.concept,
      level: event.level,
      subtype: event.scope === 'MAJOR' ? 'EXTERNAL_SWING' : 'INTERNAL_SWING',
      tier: event.scope === 'MAJOR' ? 'EXTERNAL_KEY' : 'INTERNAL_SWING',
      reclaimDepthAtr: event.reclaimDepthAtr,
      source: 'STRUCTURE_SWEEP'
    }));
  const unique = new Map();
  for (const sweep of [...fromLevels, ...fromStructure]) {
    const key = `${sweep.index}:${sweep.type}:${Number(sweep.level).toFixed(5)}`;
    if (!unique.has(key)) unique.set(key, sweep);
  }
  return [...unique.values()].sort((a, b) => b.index - a.index);
}

function validMssEvents(marketConcepts, direction, afterIndex, forecastStartIndex = 0) {
  return (marketConcepts?.structureSnapshot?.structureEvents || [])
    .filter(event =>
      event.concept === 'MSS'
      && event.direction === direction
      && event.valid === true
      && event.hasDisplacement === true
      && event.status === 'CONFIRMED_BREAK'
      && event.index > afterIndex
      && event.index >= forecastStartIndex
    )
    .sort((a, b) => {
      if (b.index !== a.index) return b.index - a.index;
      if (a.scope === b.scope) return 0;
      return a.scope === 'INTERNAL' ? -1 : 1;
    });
}

function dealingPosition(price, low, high) {
  if (![price, low, high].every(Number.isFinite) || high <= low) {
    return {
      price: Number.isFinite(price) ? price : null,
      rawPosition: null,
      position: null,
      zone: 'UNKNOWN'
    };
  }
  const rawPosition = (price - low) / (high - low);
  const position = Math.max(0, Math.min(1, rawPosition));
  return {
    price,
    rawPosition,
    position,
    zone: position < 0.45
      ? 'DISCOUNT'
      : position > 0.55
        ? 'PREMIUM'
        : 'EQUILIBRIUM'
  };
}

export function pairedStructuralLeg(marketConcepts, values, {
  availableAtIndex,
  confirmationBars = 6
} = {}) {
  const slow = marketConcepts?.structureSnapshot?.slowSwings || { highs: [], lows: [] };
  const confirmedAt = Number.isInteger(availableAtIndex)
    ? availableAtIndex
    : values.length - 1;
  const pivots = [
    ...(slow.highs || []).map(item => ({
      kind: 'HIGH',
      index: Number(item.index),
      time: item.time ?? values[item.index]?.time ?? null,
      price: Number(item.high),
      availableIndex: Number(item.index) + confirmationBars
    })),
    ...(slow.lows || []).map(item => ({
      kind: 'LOW',
      index: Number(item.index),
      time: item.time ?? values[item.index]?.time ?? null,
      price: Number(item.low),
      availableIndex: Number(item.index) + confirmationBars
    }))
  ]
    .filter(item =>
      Number.isInteger(item.index)
      && Number.isFinite(item.price)
      && item.availableIndex <= confirmedAt
    )
    .sort((a, b) => a.index - b.index || a.kind.localeCompare(b.kind));

  const zigzag = [];
  for (const pivot of pivots) {
    const previous = zigzag.at(-1);
    if (!previous) {
      zigzag.push(pivot);
      continue;
    }
    if (previous.kind === pivot.kind) {
      const moreExtreme = pivot.kind === 'HIGH'
        ? pivot.price >= previous.price
        : pivot.price <= previous.price;
      if (moreExtreme) zigzag[zigzag.length - 1] = pivot;
      continue;
    }
    if (pivot.index > previous.index) zigzag.push(pivot);
  }

  if (zigzag.length < 2) return null;
  const start = zigzag.at(-2);
  const end = zigzag.at(-1);
  const highAnchor = start.kind === 'HIGH' ? start : end;
  const lowAnchor = start.kind === 'LOW' ? start : end;
  if (!(highAnchor.price > lowAnchor.price)) return null;

  return {
    type: start.kind === 'LOW' ? 'UP_LEG' : 'DOWN_LEG',
    start,
    end,
    highAnchor,
    lowAnchor,
    high: highAnchor.price,
    low: lowAnchor.price,
    availableIndex: Math.max(start.availableIndex, end.availableIndex)
  };
}

export function dealingLocationAssessment({
  marketConcepts,
  values,
  sweep,
  mss,
  poi,
  direction,
  confirmationBars = 6
}) {
  const leg = pairedStructuralLeg(marketConcepts, values, {
    availableAtIndex: sweep?.index,
    confirmationBars
  });
  if (!leg || !sweep || !mss) {
    return {
      zone: 'UNKNOWN',
      rawPosition: null,
      position: null,
      high: null,
      low: null,
      referenceType: 'SWEEP_LEVEL',
      structuralLeg: null,
      anchors: { high: null, low: null },
      sweepLocation: null,
      poiLocation: null,
      entryLocation: null,
      mssLocation: null,
      passed: false,
      reason: 'FAIL · NO PAIRED CAUSAL STRUCTURAL LEG AVAILABLE BY SWEEP'
    };
  }

  const sweepCandle = values[sweep.index];
  const mssCandle = values[mss.index];
  const sweepLocation = {
    ...dealingPosition(Number(sweep.level), leg.low, leg.high),
    candleIndex: sweep.index,
    candleTime: sweep.time ?? sweepCandle?.time ?? null,
    extreme: dealingPosition(
      direction === 'BULLISH'
        ? Number(sweepCandle?.low)
        : Number(sweepCandle?.high),
      leg.low,
      leg.high
    )
  };
  const poiPrice = [Number(poi?.bottom), Number(poi?.top)].every(Number.isFinite)
    ? (Number(poi.bottom) + Number(poi.top)) / 2
    : NaN;
  const poiLocation = poi
    ? {
        ...dealingPosition(poiPrice, leg.low, leg.high),
        id: poi.id || null,
        kind: poi.kind || null,
        bottom: Number(poi.bottom),
        top: Number(poi.top)
      }
    : null;
  const entryLocation = {
    ...dealingPosition(Number(mssCandle?.close), leg.low, leg.high),
    candleIndex: mss.index,
    candleTime: mssCandle?.time ?? null
  };
  const bullish = direction === 'BULLISH';
  const passed = Number.isFinite(sweepLocation.position) && (
    bullish
      ? sweepLocation.position <= 0.60
      : sweepLocation.position >= 0.40
  );
  const comparison = bullish ? '≤ 0.60' : '≥ 0.40';
  const reason = `${passed ? 'PASS' : 'FAIL'} ${bullish ? 'BUY' : 'SELL'} · `
    + `SWEEP ${Number(sweepLocation.position).toFixed(4)} ${comparison} · ${leg.type}`;

  return {
    zone: sweepLocation.zone,
    rawPosition: sweepLocation.rawPosition,
    position: sweepLocation.position,
    high: leg.high,
    low: leg.low,
    referenceType: 'SWEEP_LEVEL',
    structuralLeg: {
      type: leg.type,
      startIndex: leg.start.index,
      startTime: leg.start.time,
      endIndex: leg.end.index,
      endTime: leg.end.time,
      availableIndex: leg.availableIndex
    },
    anchors: {
      high: {
        index: leg.highAnchor.index,
        time: leg.highAnchor.time,
        price: leg.highAnchor.price,
        availableIndex: leg.highAnchor.availableIndex
      },
      low: {
        index: leg.lowAnchor.index,
        time: leg.lowAnchor.time,
        price: leg.lowAnchor.price,
        availableIndex: leg.lowAnchor.availableIndex
      }
    },
    sweepLocation,
    poiLocation,
    entryLocation,
    mssLocation: {
      ...entryLocation,
      closeStrengthPassed: closeLocationValid(mssCandle, direction)
    },
    passed,
    reason
  };
}

function closeLocationValid(candle, direction) {
  if (!candle) return false;
  const range = Math.max(candle.high - candle.low, 0.0000001);
  return direction === 'BULLISH'
    ? candle.close >= candle.low + range * 0.70
    : candle.close <= candle.high - range * 0.70;
}

function locationValid(location, direction) {
  if (typeof location?.passed === 'boolean') return location.passed;
  if (location.zone === 'UNKNOWN') return false;
  return direction === 'BULLISH'
    ? location.position <= 0.60
    : location.position >= 0.40;
}

function zoneDirectionAt(zone, index) {
  const inverseConfirmedIndex = Number(zone?.inverseConfirmedIndex ?? -1);
  if (zone?.converted && inverseConfirmedIndex >= 0 && inverseConfirmedIndex <= index) {
    return normalizedDirection(zone.direction);
  }
  return normalizedDirection(zone?.originalDirection || zone?.direction);
}

function zoneAvailableAt(zone, index) {
  if (Number(zone?.availableIndex ?? Infinity) > index) return false;
  const breakIndex = Number(zone?.breakIndex ?? -1);
  const inverseConfirmedIndex = Number(zone?.inverseConfirmedIndex ?? -1);
  if (breakIndex < 0 || breakIndex > index) return true;
  return Boolean(zone?.converted && inverseConfirmedIndex >= 0 && inverseConfirmedIndex <= index);
}

function pointOfInterest(marketConcepts, values, sweep, mss, direction) {
  const zones = [
    ...(marketConcepts?.orderBlocks || []),
    ...(marketConcepts?.fairValueGaps || [])
  ].filter(zone =>
    zoneDirectionAt(zone, mss.index) === direction
    && zoneAvailableAt(zone, mss.index)
  );
  const relevantCandles = values.slice(
    Math.max(0, sweep.index),
    Math.min(values.length, mss.index + 1)
  );
  return zones.find(zone =>
    relevantCandles.some(candle => candle.high >= zone.bottom && candle.low <= zone.top)
  ) || null;
}

function protectedSwing(values, sweep, mss, direction) {
  const rows = values.slice(Math.max(0, sweep.index), mss.index + 1);
  if (!rows.length) return NaN;
  return direction === 'BULLISH'
    ? Math.min(...rows.map(candle => candle.low))
    : Math.max(...rows.map(candle => candle.high));
}

function targetAvailableAt(level, index) {
  const available = Number(level?.availableIndex ?? -1);
  const interaction = Number(level?.interactionIndex ?? -1);
  return available <= index && (interaction < 0 || interaction > index);
}

export function structuralTargetAssessment({
  marketConcepts,
  direction,
  entry,
  risk,
  atr,
  triggerIndex,
  profile
}) {
  const expected = targetType(direction);
  const candidates = (marketConcepts?.liquidityLevels || [])
    .filter(level =>
      level.type === expected
      && targetAvailableAt(level, triggerIndex)
      && Number.isFinite(Number(level.level))
      && (direction === 'BULLISH' ? Number(level.level) > entry : Number(level.level) < entry)
    )
    .map(level => {
      const levelPrice = Number(level.level);
      const reward = direction === 'BULLISH' ? levelPrice - entry : entry - levelPrice;
      return {
        ...level,
        reward,
        rr: risk > 0 ? reward / risk : 0
      };
    })
    .sort((a, b) => a.reward - b.reward);
  const firstObstacle = candidates[0] || null;
  const riskAtr = Number.isFinite(atr) && atr > 0 ? risk / atr : null;

  let code = 'NO TARGET';
  if (Number.isFinite(riskAtr) && riskAtr > profile.maximumRiskAtr) {
    code = 'RISK > 6 ATR';
  } else if (firstObstacle?.rr < profile.minimumTargetR) {
    code = 'TARGET < 2R';
  } else if (firstObstacle?.rr > profile.maximumTargetR) {
    code = 'TARGET > 8R';
  } else if (firstObstacle) {
    code = 'TARGET VALID 2R–8R';
  }

  const valid = code === 'TARGET VALID 2R–8R';
  return {
    code,
    valid,
    target: valid ? firstObstacle : null,
    firstObstacle,
    riskAtr
  };
}

function targetAssessmentDetail(assessment) {
  const obstacle = assessment?.firstObstacle;
  const obstacleDetail = obstacle
    ? `${obstacle.type} ${Number(obstacle.level).toFixed(2)} · ${Number(obstacle.rr).toFixed(2)}R`
    : 'Tidak ada obstacle struktural aktif di sisi target';
  if (assessment?.code === 'RISK > 6 ATR') {
    return `${assessment.code} · ${Number(assessment.riskAtr).toFixed(2)} ATR · ${obstacleDetail}`;
  }
  return `${assessment?.code || 'NO TARGET'} · ${obstacleDetail}`;
}

export function createTimeframeEntryPlan({
  tf,
  direction,
  candle,
  index,
  atr,
  protectedLevel,
  sweep,
  mss,
  target,
  poi = null,
  trendFilters = null,
  profile = entryProfileFor(tf)
}) {
  if (!profile || !candle || !target) return null;
  const bullish = direction === 'BULLISH';
  const entry = Number(candle.close);
  const rawStop = bullish
    ? Math.min(candle.low, protectedLevel) - atr * profile.slAtrPad
    : Math.max(candle.high, protectedLevel) + atr * profile.slAtrPad;
  const risk = bullish ? entry - rawStop : rawStop - entry;
  if (!(risk > 0) || risk > atr * profile.maximumRiskAtr) return null;
  const targetPrice = Number(target.level);
  const reward = bullish ? targetPrice - entry : entry - targetPrice;
  const targetR = reward / risk;
  if (targetR < profile.minimumTargetR || targetR > profile.maximumTargetR) return null;
  const sign = bullish ? 1 : -1;

  return {
    id: `CAUSAL_ENTRY_MAP:${tf}:${direction}:${index}:${entry.toFixed(5)}`,
    type: `${tf} CAUSAL ENTRY MAP`,
    direction,
    dir: bullish ? 'BUY' : 'SELL',
    tf,
    sourceTf: tf,
    triggerTf: tf,
    startIndex: index,
    startTime: candle.time,
    timestamp: timestampMs(candle.time),
    entry,
    entryLow: entry,
    entryHigh: entry,
    initialSl: rawStop,
    sl: rawStop,
    risk,
    tp1: entry + sign * risk * profile.tp1R,
    tp2: targetPrice,
    singleTarget: false,
    entryConfirmedAtClose: true,
    targetR,
    targetType: target.type,
    targetSubtype: target.subtype,
    targetTier: target.tier || 'UNCLASSIFIED',
    tp1Hit: false,
    tp1Index: -1,
    tp1Time: null,
    endIndex: -1,
    endTime: null,
    live: true,
    lifecycleStatus: bullish ? 'LONG ACTIVE' : 'SHORT ACTIVE',
    sweepType: sweep.type,
    sweepSubtype: sweep.subtype,
    sweepIndex: sweep.index,
    mssIndex: mss.index,
    mssScope: mss.scope,
    poiId: poi?.id || null,
    poiKind: poi?.kind || null,
    trendFilters,
    expiryBars: profile.expiryBars,
    profile: tf,
    executionMode: 'CAUSAL_ENTRY_MAP_ALL_TF',
    scoreMode: 'RULE_BASED_MANUAL_VALIDATION',
    tradeManagement: {
      tp1R: profile.tp1R,
      moveStopToBreakEven: true,
      tp2R: targetR,
      expiryBars: profile.expiryBars
    }
  };
}

export function advanceTimeframeEntryLifecycle(plan, candle, index, profile = entryProfileFor(plan?.tf)) {
  if (!plan?.live || !profile || index <= plan.startIndex) return plan;
  const bullish = plan.direction === 'BULLISH';
  const slHit = bullish ? candle.low <= plan.sl : candle.high >= plan.sl;
  const tp1Hit = bullish ? candle.high >= plan.tp1 : candle.low <= plan.tp1;
  const tp2Hit = bullish ? candle.high >= plan.tp2 : candle.low <= plan.tp2;
  const breakEvenHit = bullish ? candle.low <= plan.entry : candle.high >= plan.entry;

  if (!plan.tp1Hit) {
    if (slHit) {
      plan.live = false;
      plan.lifecycleStatus = 'SL HIT';
      plan.endIndex = index;
      plan.endTime = timestampMs(candle.time);
    } else if (tp2Hit) {
      plan.tp1Hit = true;
      plan.live = false;
      plan.lifecycleStatus = 'TP2 HIT';
      plan.endIndex = index;
      plan.endTime = timestampMs(candle.time);
    } else if (tp1Hit) {
      plan.tp1Hit = true;
      plan.tp1Index = index;
      plan.tp1Time = timestampMs(candle.time);
      plan.lifecycleStatus = 'TP1 HIT / BE';
      plan.sl = plan.entry;
    }
  } else if (tp2Hit) {
    plan.live = false;
    plan.lifecycleStatus = 'TP2 HIT';
    plan.endIndex = index;
    plan.endTime = timestampMs(candle.time);
  } else if (breakEvenHit) {
    plan.live = false;
    plan.lifecycleStatus = 'TP1 / BE';
    plan.endIndex = index;
    plan.endTime = timestampMs(candle.time);
  }

  if (plan.live && index - plan.startIndex >= profile.expiryBars) {
    plan.live = false;
    plan.lifecycleStatus = 'EXPIRED';
    plan.endIndex = index;
    plan.endTime = timestampMs(candle.time);
  }
  return plan;
}

export function causalEntryLifecycleContract(setup) {
  if (!setup) {
    return {
      status: 'WAIT',
      lifecycleStage: 'WAITING_CONFIRMATION',
      active: false,
      terminal: false
    };
  }

  const terminal = setup.live === false;
  const status = terminal
    ? String(setup.lifecycleStatus || setup.status || 'TERMINAL')
    : setup.tp1Hit
      ? 'TP1 HIT / BE'
      : 'ENTRY CONFIRMED';
  const lifecycleStage = terminal
    ? status === 'TP2 HIT'
      ? 'TARGET_HIT'
      : status === 'EXPIRED'
        ? 'EXPIRED'
        : status === 'SL HIT' || status === 'TP1 / BE'
          ? 'STOPPED'
          : 'TERMINAL'
    : setup.tp1Hit
      ? 'RUNNER_ACTIVE'
      : 'ENTRY_ACTIVE';

  return {
    status,
    lifecycleStage,
    active: !terminal,
    terminal
  };
}

function setupView(plan, values) {
  if (!plan) return null;
  const terminal = !plan.live;
  return {
    ...plan,
    price: values.at(-1)?.close || plan.entry,
    status: terminal
      ? plan.lifecycleStatus
      : plan.tp1Hit
        ? 'TP1 HIT / BE'
        : 'READY SETUP',
    grade: plan.poiId ? 'CAUSAL + POI' : 'CAUSAL',
    score: 0,
    reason: `${plan.sweepType} disapu, ${plan.mssScope} MSS ${plan.direction} terkonfirmasi dengan displacement pada ${plan.tf}.`,
    components: {
      model: 'Liquidity Sweep → Displaced MSS → Structural Target',
      sweep: `${plan.sweepType} ${plan.sweepSubtype || ''}`.trim(),
      mss: `${plan.mssScope} VALID`,
      trend: `${plan.trendFilters?.context?.timeframe || 'LOCAL'} + EMA 21/34/90`,
      poi: plan.poiKind || 'CONFLUENCE OPTIONAL',
      entry: `Close candle MSS ${plan.tf}`,
      target: `${plan.targetType} ${plan.targetSubtype || ''}`.trim()
    },
    conflictCheck: {
      hasFatalConflict: false,
      conflictLevel: 'NONE',
      conflicts: [],
      recommendation: plan.live ? 'VALID' : 'CLOSED',
      rr: plan.targetR,
      plannedEntry: plan.entry,
      mainTarget: plan.tp2
    },
    lifecycle: {
      status: plan.lifecycleStatus,
      live: plan.live,
      tp1Hit: plan.tp1Hit,
      startIndex: plan.startIndex,
      startTime: plan.startTime,
      tp1Index: plan.tp1Index,
      endIndex: plan.endIndex,
      barsElapsed: (plan.endIndex >= 0 ? plan.endIndex : values.length - 1) - plan.startIndex
    }
  };
}

function requirement(label, passed, detail) {
  return { label, passed: Boolean(passed), detail };
}

export function detectTimeframeEntryMap(candles, {
  tf,
  marketConcepts,
  validatedContext,
  htfCandles = {},
  profile = entryProfileFor(tf)
} = {}) {
  const timeframe = normalizeMappingTimeframe(tf);
  const values = cleanConceptCandles(candles)
    .filter(candle => candle.isClosed !== false);
  if (!profile || values.length < (profile?.minimumCandles || 100)) {
    return {
      supported: Boolean(profile),
      profile: timeframe,
      setup: null,
      activeSetup: null,
      setupCount: 0,
      history: [],
      status: profile ? 'INSUFFICIENT_DATA' : 'UNSUPPORTED_TIMEFRAME',
      scenario: {
        tf: timeframe,
        direction: 'WAIT',
        status: profile ? 'DATA BELUM CUKUP' : 'TIMEFRAME TIDAK DIDUKUNG',
        requirements: [],
        missing: ['DATA']
      }
    };
  }

  const forecast = validatedContext?.directionForecast;
  const direction = forecast?.active
    ? normalizedDirection(forecast.direction)
    : 'NEUTRAL';
  const forecastStartIndex = Number.isInteger(forecast?.startIndex)
    ? forecast.startIndex
    : 0;
  const latestIndex = values.length - 1;
  const sweeps = direction === 'NEUTRAL' ? [] : confirmedSweeps(marketConcepts, direction);
  const sweepsInMemory = sweeps.filter(item =>
    item.index <= latestIndex
    && latestIndex - item.index <= profile.sweepMemoryBars
  );
  const rejectedPreForecastSweeps = sweepsInMemory
    .filter(item => item.index < forecastStartIndex);
  const eligibleSweeps = sweepsInMemory
    .filter(item => item.index >= forecastStartIndex);
  const sweep = eligibleSweeps[0] || null;
  const mss = sweep
    ? validMssEvents(marketConcepts, direction, sweep.index, forecastStartIndex).find(event =>
        event.index <= latestIndex
        && event.index - sweep.index <= profile.sweepMemoryBars
      ) || null
    : null;
  const triggerCandle = mss ? values[mss.index] : null;
  const poi = sweep && mss
    ? pointOfInterest(marketConcepts, values, sweep, mss, direction)
    : null;
  const location = sweep && mss
    ? dealingLocationAssessment({
        marketConcepts,
        values,
        sweep,
        mss,
        poi,
        direction,
        confirmationBars: profile.slowSwingLength
      })
    : dealingLocationAssessment({
        marketConcepts,
        values,
        sweep: null,
        mss: null,
        poi: null,
        direction,
        confirmationBars: profile.slowSwingLength
      });
  const sessionOk = mss
    ? validExecutionSession(triggerCandle, profile.sessionMode)
    : false;
  const closeOk = mss ? closeLocationValid(triggerCandle, direction) : false;
  const locationOk = mss ? locationValid(location, direction) : false;
  const protectedLevel = sweep && mss
    ? protectedSwing(values, sweep, mss, direction)
    : NaN;
  const atr = mss
    ? Math.max(conceptAtrAtClean(values, mss.index), 0.0000001)
    : NaN;
  const trendFilters = mss
    ? entryTrendFiltersAt(values, {
        tf: timeframe,
        index: mss.index,
        direction,
        atr,
        htfCandles,
        profile
      })
    : null;
  const entry = Number(triggerCandle?.close);
  const provisionalStop = direction === 'BULLISH'
    ? Math.min(Number(triggerCandle?.low), protectedLevel) - atr * profile.slAtrPad
    : Math.max(Number(triggerCandle?.high), protectedLevel) + atr * profile.slAtrPad;
  const risk = direction === 'BULLISH' ? entry - provisionalStop : provisionalStop - entry;
  const targetDiagnosis = mss && risk > 0
    ? structuralTargetAssessment({
        marketConcepts,
        direction,
        entry,
        risk,
        atr,
        triggerIndex: mss.index,
        profile
      })
    : {
        code: 'NO TARGET',
        valid: false,
        target: null,
        firstObstacle: null,
        riskAtr: null
      };
  const target = targetDiagnosis.target;

  const requirements = [
    requirement('DATA', true, `${values.length} closed candles ${timeframe}`),
    requirement('DIRECTION', direction !== 'NEUTRAL', forecast?.triggerRule || 'NO CLEAR DIRECTION'),
    requirement('OPPOSING LIQUIDITY SWEEP', Boolean(sweep), sweep ? `${sweep.type} ${sweep.subtype || ''}`.trim() : 'Belum ada sweep terkonfirmasi'),
    requirement('DISPLACED MSS', Boolean(mss), mss ? `${mss.scope} MSS @ ${Number(mss.level).toFixed(2)}` : 'Menunggu MSS setelah sweep'),
    requirement(
      'HTF ALIGNMENT',
      Boolean(mss && trendFilters?.context?.ready && trendFilters?.context?.aligned),
      profile.contextTimeframe
        ? trendFilters?.context?.ready
          ? `${profile.contextTimeframe} close + EMA20 slope ${trendFilters.context.aligned ? 'selaras' : 'berlawanan'}`
          : `${profile.contextTimeframe} closed candles belum cukup`
        : 'Local weekly structure'
    ),
    requirement(
      'EMA STACK',
      Boolean(mss && trendFilters?.emaStack),
      trendFilters?.emaReady
        ? `EMA21 ${Number(trendFilters.ema21).toFixed(2)} · EMA34 ${Number(trendFilters.ema34).toFixed(2)} · EMA90 ${Number(trendFilters.ema90).toFixed(2)}`
        : 'Minimal 90 closed candles sebelum trigger'
    ),
    requirement(
      'EMA DISTANCE',
      Boolean(mss && trendFilters?.emaDistance),
      timeframe === 'H1'
        ? Number.isFinite(trendFilters?.emaDistanceAtr)
          ? `${trendFilters.emaDistanceAtr.toFixed(2)} ATR dari EMA21 · maksimum 2.00 ATR`
          : 'Jarak ke EMA21 belum tersedia'
        : 'Tidak menjadi hard gate'
    ),
    requirement(
      'SESSION',
      Boolean(mss && sessionOk),
      profile.sessionMode === 'NEW_YORK_ONLY'
        ? 'New York 19:30–04:00 WITA'
        : profile.sessionRequired
          ? 'London 14:00–18:00 / New York 19:30–04:00 WITA'
          : 'Tidak menjadi hard gate'
    ),
    requirement('DEALING LOCATION', Boolean(mss && locationOk), location.reason),
    requirement('CLOSE LOCATION', Boolean(mss && closeOk), closeOk ? 'Close mendukung arah' : 'Close belum kuat'),
    requirement(
      'STRUCTURAL TARGET ≥ 2R',
      Boolean(target),
      targetAssessmentDetail(targetDiagnosis)
    )
  ];
  const hardRequirements = requirements.filter(item =>
    (item.label !== 'SESSION' || profile.sessionRequired)
    && (item.label !== 'EMA DISTANCE' || timeframe === 'H1')
  );
  const ready = direction !== 'NEUTRAL'
    && sweep
    && mss
    && trendFilters?.ready
    && sessionOk
    && locationOk
    && closeOk
    && target
    && Number.isFinite(protectedLevel);

  let plan = ready
    ? createTimeframeEntryPlan({
        tf: timeframe,
        direction,
        candle: triggerCandle,
        index: mss.index,
        atr,
        protectedLevel,
        sweep,
        mss,
        target,
        poi,
        trendFilters,
        profile
      })
    : null;
  if (plan) {
    for (let index = plan.startIndex + 1; index < values.length; index += 1) {
      advanceTimeframeEntryLifecycle(plan, values[index], index, profile);
      if (!plan.live) break;
    }
  }

  const setup = setupView(plan, values);
  const activeSetup = setup?.live ? setup : null;
  const missing = hardRequirements.filter(item => !item.passed).map(item => item.label);
  const scenarioStatus = activeSetup
    ? 'ENTRY CONFIRMED'
    : setup
      ? setup.status
      : direction === 'NEUTRAL'
        ? 'NO CLEAR DIRECTION'
        : sweep
          ? mss
            ? 'MENUNGGU FILTER TERAKHIR'
            : 'MENUNGGU DISPLACED MSS'
          : 'MENUNGGU OPPOSING LIQUIDITY SWEEP';

  return {
    supported: true,
    profile: timeframe,
    source: 'AMY_CAUSAL_ENTRY_MAP_V3',
    setup,
    activeSetup,
    setupCount: setup ? 1 : 0,
    history: setup ? [setup] : [],
    status: scenarioStatus.replaceAll(' ', '_'),
    scenario: {
      tf: timeframe,
      sourceTf: timeframe,
      triggerTf: timeframe,
      contextTf: profile.contextTimeframe,
      direction: direction === 'BULLISH' ? 'BUY' : direction === 'BEARISH' ? 'SELL' : 'WAIT',
      status: scenarioStatus,
      requirements,
      missing,
      sweep,
      mss,
      causalOrdering: {
        forecastStartIndex,
        latestClosedIndex: latestIndex,
        sweepMemoryBars: profile.sweepMemoryBars,
        sweepsInMemory: sweepsInMemory.length,
        eligibleSweeps: eligibleSweeps.length,
        rejectedBeforeForecast: rejectedPreForecastSweeps.map(item => ({
          id: item.id,
          index: item.index,
          time: item.time,
          type: item.type,
          subtype: item.subtype,
          source: item.source
        })),
        valid: Boolean(
          !sweep
          || (
            sweep.index >= forecastStartIndex
            && (!mss || mss.index > sweep.index)
            && (!mss || mss.index <= latestIndex)
          )
        )
      },
      poi,
      trendFilters,
      location,
      target: target ? {
        type: target.type,
        subtype: target.subtype,
        level: target.level,
        rr: target.rr
      } : null,
      targetDiagnosis: {
        code: targetDiagnosis.code,
        riskAtr: targetDiagnosis.riskAtr,
        firstObstacle: targetDiagnosis.firstObstacle ? {
          type: targetDiagnosis.firstObstacle.type,
          subtype: targetDiagnosis.firstObstacle.subtype,
          tier: targetDiagnosis.firstObstacle.tier,
          level: targetDiagnosis.firstObstacle.level,
          rr: targetDiagnosis.firstObstacle.rr
        } : null
      },
      protectedLevel: Number.isFinite(protectedLevel) ? protectedLevel : null,
      reason: activeSetup
        ? `Sequence ${timeframe} lengkap: HTF + EMA → sweep → displaced MSS → target struktural.`
        : missing.length
          ? `Belum lengkap: ${missing.join(', ')}.`
          : scenarioStatus
    }
  };
}
