import { CONCEPT_THRESHOLDS } from './concept-config.js';
import { cleanConceptCandles, conceptNumber } from './concept-candles.js';
import { detectFvgConcepts } from './concept-fvg.js';
import { detectLiquidityConcepts, evaluateLiquidityReclaim } from './concept-liquidity.js';
import { detectOrderBlockConcepts } from './concept-ob.js';
import { detectPreviousPeriodLevels, previousPeriodSnapshot } from './concept-reference-levels.js';
import { structureDisplacementMetrics } from './concept-structure-metrics.js';
import { detectStructureConcepts } from './concept-structure.js';
import {
  conceptZoneLiveStatus,
  evaluateZoneLifecycle,
  nearestConceptZones
} from './concept-zone-lifecycle.js';

export {
  CONCEPT_THRESHOLDS,
  conceptZoneLiveStatus,
  evaluateLiquidityReclaim,
  evaluateZoneLifecycle,
  structureDisplacementMetrics
};

function latestByIndex(items, predicate = () => true) {
  return (Array.isArray(items) ? items : [])
    .filter(predicate)
    .sort((a, b) => Number(a.index || -1) - Number(b.index || -1))
    .at(-1) || null;
}

function structureEventAdapter(event, candles, trend) {
  if (!event) return null;
  const candle = candles[event.index] || {};
  const sweep = event.kind === 'LIQUIDITY_SWEEP';
  const failed = event.status === 'FAILED';
  const direction = sweep ? event.brokenSide : event.direction;
  const valid = !sweep && !failed && event.valid === true && event.status === 'CONFIRMED_BREAK';
  return {
    ...event,
    eventId: event.id,
    kind: sweep ? 'SWEEP' : event.concept,
    dir: direction,
    price: event.level,
    valid,
    sweepOnly: sweep,
    failed,
    hasDisplacement: !sweep && Boolean(event.hasDisplacement),
    breakType: sweep
      ? 'SWEEP_ONLY'
      : failed
        ? 'BREAK_FAILED'
        : valid
          ? 'VALID_BREAK'
          : 'BREAK_CANDIDATE',
    structureScope: event.scope || 'INTERNAL',
    confirmationStage: failed
      ? 'FAILED'
      : valid && event.scope === 'MAJOR'
        ? 'CONFIRMED'
        : valid
          ? 'TRANSITION'
          : 'WAIT',
    trendConfirmed: Boolean(valid && event.scope === 'MAJOR'),
    trendAfter: trend,
    candleClose: conceptNumber(candle.close, 0),
    candleHigh: conceptNumber(candle.high, 0),
    candleLow: conceptNumber(candle.low, 0),
    bodyRatio: conceptNumber(event.bodyRatio, 0),
    localAtr: conceptNumber(event.localAtr, 0),
    penetration: conceptNumber(event.penetration, 0),
    liveStatus: event.status,
    atRisk: false
  };
}

export function buildConceptStructureAdapter(snapshot, candles) {
  const values = cleanConceptCandles(candles);
  const rawEvents = Array.isArray(snapshot?.events) ? snapshot.events : [];
  const adapted = rawEvents.map(event => structureEventAdapter(event, values, snapshot?.trend || 'NEUTRAL'));
  const latest = latestByIndex(adapted);
  const confirmed = latestByIndex(adapted, event => event.breakType === 'VALID_BREAK' && event.valid);
  const major = latestByIndex(adapted, event => event.breakType === 'VALID_BREAK' && event.structureScope === 'MAJOR');
  const internal = latestByIndex(adapted, event => event.breakType === 'VALID_BREAK' && event.structureScope === 'INTERNAL');
  const sweep = latestByIndex(adapted, event => event.breakType === 'SWEEP_ONLY');
  const failed = latestByIndex(adapted, event => event.breakType === 'BREAK_FAILED');
  const transition = internal?.kind === 'MSS' && !internal.failed ? internal : null;
  return {
    trend: snapshot?.trend || 'NEUTRAL',
    confirmedTrend: snapshot?.trend || 'NEUTRAL',
    localTrend: snapshot?.localTrend || confirmed?.dir || snapshot?.trend || 'NEUTRAL',
    transitionDirection: transition?.dir || 'NEUTRAL',
    transitionBreak: transition,
    transitionConfirmationLevel: null,
    liveStatus: latest?.liveStatus || 'WAIT',
    atRisk: false,
    last: latest,
    lastEvent: latest,
    lastConfirmedBreak: confirmed,
    lastMajorBreak: major,
    lastInternalBreak: internal,
    lastSweep: sweep,
    lastFailedBreak: failed,
    events: adapted.slice(-30),
    source: 'AMY_CONCEPT_ENGINE_V3'
  };
}

function targetFromLevel(level, price) {
  const value = conceptNumber(level?.level);
  if (!Number.isFinite(value) || value <= 0) return null;
  return {
    id: level.id,
    type: level.type,
    level: value,
    price: value,
    subtype: level.subtype,
    tier: level.tier || (
      ['PDH', 'PDL', 'PWH', 'PWL', 'ASIA_HIGH', 'ASIA_LOW'].includes(level.subtype)
        ? 'EXTERNAL_KEY'
        : level.subtype === 'EQUAL'
          ? 'EQUAL_POOL'
          : 'INTERNAL_SWING'
    ),
    status: level.status || 'DETECTED',
    strength: level.subtype === 'EQUAL' ? 'STRONG' : 'MEDIUM',
    source: level.source || 'AMY_CONCEPT_ENGINE_V3',
    distance: Number.isFinite(price) ? value - price : 0,
    distanceFromPrice: Number.isFinite(price) ? Math.abs(value - price) : Infinity,
    originIndex: level.originIndex,
    availableIndex: level.availableIndex,
    interactionIndex: level.interactionIndex,
    interactionTime: level.interactionTime,
    reclaimDepthAtr: conceptNumber(level.reclaimDepthAtr, 0),
    tolerance: conceptNumber(level.tolerance, conceptNumber(level.localAtr, 0) * 0.03),
    label: level.label || level.subtype || level.type
  };
}

export function buildConceptLiquidityHierarchy(levels, currentPrice, htfBias = 'NEUTRAL') {
  const price = conceptNumber(currentPrice);
  const all = (Array.isArray(levels) ? levels : [])
    .map(level => ({ level, target: targetFromLevel(level, price) }))
    .filter(item => item.target);
  const activeTargets = all
    .filter(({ level, target }) => level.active !== false
      && level.status === 'DETECTED'
      && (!Number.isFinite(price)
        || (target.type === 'BSL' ? target.level > price : target.level < price)))
    .map(item => item.target)
    .sort((a, b) => {
      const rank = { EXTERNAL_KEY: 0, EQUAL_POOL: 1, INTERNAL_SWING: 2 };
      return (rank[a.tier] ?? 3) - (rank[b.tier] ?? 3)
        || a.distanceFromPrice - b.distanceFromPrice;
    });
  const swept = all
    .filter(({ level }) => level.active === false)
    .map(item => item.target)
    .sort((a, b) =>
      Number(b.interactionIndex ?? b.availableIndex ?? -1)
      - Number(a.interactionIndex ?? a.availableIndex ?? -1)
    );
  const confirmedSweeps = swept.filter(item => item.status === 'CONFIRMED_REACTION');
  const drawTarget = activeTargets[0] || null;
  const bslTarget = activeTargets.find(item => item.type === 'BSL') || null;
  const sslTarget = activeTargets.find(item => item.type === 'SSL') || null;
  const tolerances = all.map(({ target }) => target.tolerance).filter(Number.isFinite);
  return {
    activeTargets,
    swept,
    confirmedSweeps,
    drawTarget,
    directionalUse: false,
    targetRole: 'LIQUIDITY_TARGET_ONLY',
    htfBiasContext: htfBias,
    tolerance: {
      mode: 'ATR_SCALED_PER_LEVEL',
      minimum: tolerances.length ? Math.min(...tolerances) : 0,
      maximum: tolerances.length ? Math.max(...tolerances) : 0
    },
    summary: drawTarget
      ? `Prioritas liquidity aktif adalah ${drawTarget.label || drawTarget.type} di ${drawTarget.level.toFixed(2)}; level ini bukan sinyal arah.`
      : 'Tidak ada BSL/SSL aktif yang belum tersapu pada sisi harga sekarang.',
    bsl: bslTarget?.level || 0,
    ssl: sslTarget?.level || 0
  };
}

function zoneText(zone) {
  if (!zone) return 'Tidak ada zona yang lolos filter konfirmasi.';
  return `${zone.direction} ${zone.bottom.toFixed(2)} - ${zone.top.toFixed(2)} · ${zone.kind} · ${zone.status}`;
}

function structureText(structure) {
  const event = structure?.lastEvent;
  if (!event) return 'Belum ada BOS/MSS atau sweep yang terkonfirmasi.';
  if (event.breakType === 'SWEEP_ONLY') {
    return `${event.kind} ${event.dir} @ ${event.price.toFixed(2)} · reclaim ${conceptNumber(event.reclaimDepthAtr, 0).toFixed(2)} ATR`;
  }
  const displacement = event.hasDisplacement ? 'displacement valid' : 'close-cross tanpa displacement kuat';
  return `${event.kind} ${event.structureScope} ${event.dir} @ ${event.price.toFixed(2)} · ${displacement} · penetration ${conceptNumber(event.penetrationAtr, 0).toFixed(2)} ATR`;
}

export function detectMarketConcepts(candles, {
  tf = 'M15',
  currentPrice = null,
  htfCandles = {},
  htfBias = 'NEUTRAL'
} = {}) {
  const values = cleanConceptCandles(candles);
  const price = conceptNumber(currentPrice, values.at(-1)?.close);
  const structureSnapshot = detectStructureConcepts(values);
  const structure = buildConceptStructureAdapter(structureSnapshot, values);
  const fairValueGaps = detectFvgConcepts(values, { currentPrice: price, lookback: 500 });
  const orderBlocks = detectOrderBlockConcepts(values, structureSnapshot, {
    currentPrice: price,
    htfCandles,
    maxZones: 16
  });
  const swingLiquidityLevels = detectLiquidityConcepts(values, {
    currentPrice: price,
    maxLevels: 100
  });
  const previousPeriodLevels = detectPreviousPeriodLevels(values, htfCandles?.D1, { currentPrice: price });
  const previousPeriods = previousPeriodSnapshot(previousPeriodLevels);
  const liquidityLevels = [...swingLiquidityLevels, ...previousPeriodLevels];
  const liquidityHierarchy = buildConceptLiquidityHierarchy(liquidityLevels, price, htfBias);
  const nearestFairValueGaps = nearestConceptZones(fairValueGaps, price, 4);
  const nearestOrderBlocks = nearestConceptZones(orderBlocks, price, 4);
  const nearestFvg = nearestFairValueGaps[0] || null;
  const nearestOb = nearestOrderBlocks[0] || null;
  const latestConfirmedSweep = liquidityHierarchy.confirmedSweeps[0]
    || structureSnapshot.sweepEvents?.filter(event => event.valid).at(-1)
    || null;

  const previousDayText = previousPeriods.pdh > 0
    ? `PDH ${previousPeriods.pdh.toFixed(2)} (${previousPeriods.pdhStatus}) · PDL ${previousPeriods.pdl.toFixed(2)} (${previousPeriods.pdlStatus})`
    : 'Data previous day belum tersedia.';
  const previousWeekText = previousPeriods.pwh > 0
    ? `PWH ${previousPeriods.pwh.toFixed(2)} (${previousPeriods.pwhStatus}) · PWL ${previousPeriods.pwl.toFixed(2)} (${previousPeriods.pwlStatus})`
    : 'Data previous week belum tersedia.';

  const concepts = [
    ['Structure', structure.trend, structureText(structure)],
    ['Latest Event', structure.lastEvent?.liveStatus || 'WAIT', structureText(structure)],
    ['OB', nearestOb?.status || 'WAIT', zoneText(nearestOb)],
    ['FVG', nearestFvg?.status || 'WAIT', zoneText(nearestFvg)],
    ['Previous Day Liquidity', previousPeriods.pdhStatus, previousDayText],
    ['Previous Week Liquidity', previousPeriods.pwhStatus, previousWeekText],
    ['Liquidity Hierarchy', liquidityHierarchy.summary, liquidityHierarchy.drawTarget
      ? `Draw Target: ${liquidityHierarchy.drawTarget.label || liquidityHierarchy.drawTarget.type} @ ${liquidityHierarchy.drawTarget.level.toFixed(2)}`
      : 'Belum ada Draw Target aktif'],
    ['BSL / SSL Sweep', latestConfirmedSweep?.status || 'WAIT', latestConfirmedSweep
      ? `${latestConfirmedSweep.type || latestConfirmedSweep.concept} @ ${Number(latestConfirmedSweep.level).toFixed(2)} · reclaim ${conceptNumber(latestConfirmedSweep.reclaimDepthAtr, 0).toFixed(2)} ATR`
      : `Belum ada sweep terkonfirmasi dengan reclaim minimum ${CONCEPT_THRESHOLDS.liquidityReclaimAtr.toFixed(2)} ATR.`],
    ['Concept Filter', 'CONFIRMATION REQUIRED', `BOS/MSS valid memakai close swing 4/4 + buffer ${CONCEPT_THRESHOLDS.structurePenetrationAtr.toFixed(2)} ATR + displacement body ${CONCEPT_THRESHOLDS.displacementBodyAtr.toFixed(2)} ATR · reclaim sweep ≥ ${CONCEPT_THRESHOLDS.liquidityReclaimAtr.toFixed(2)} ATR`]
  ];

  return {
    version: '3.0.0',
    source: 'AMY_CONCEPT_ENGINE_V3',
    tf,
    price,
    thresholds: CONCEPT_THRESHOLDS,
    structureSnapshot,
    structure,
    fairValueGaps,
    orderBlocks,
    liquidityLevels,
    swingLiquidityLevels,
    previousPeriodLevels,
    previousPeriods,
    pdh: previousPeriods.pdh,
    pdl: previousPeriods.pdl,
    pwh: previousPeriods.pwh,
    pwl: previousPeriods.pwl,
    liquidityHierarchy,
    nearestFairValueGaps,
    nearestOrderBlocks,
    latestConfirmedSweep,
    bsl: liquidityHierarchy.bsl,
    ssl: liquidityHierarchy.ssl,
    concepts,
    mappingZones: {
      source: 'AMY_CONCEPT_ENGINE_V3',
      nearestFairValueGaps,
      nearestOrderBlocks,
      allFairValueGaps: fairValueGaps,
      allOrderBlocks: orderBlocks
    }
  };
}
