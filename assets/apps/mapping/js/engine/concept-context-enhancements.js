import {
  cleanConceptCandles,
  conceptAtrAtClean,
  conceptNumber
} from './concept-candles.js';

export const MAPPING_EVIDENCE_CLASS = Object.freeze({
  RAW_OBSERVATION: 'RAW_OBSERVATION',
  VALIDATED_CONTEXT: 'VALIDATED_CONTEXT',
  VALIDATED_CLAIM: 'VALIDATED_CLAIM',
  EXECUTION_AUTHORITY: 'EXECUTION_AUTHORITY'
});

const VALIDATED_ZONE_STATUSES = new Set([
  'CONFIRMED_REACTION',
  'IFVG_CONFIRMED_REACTION',
  'BREAKER_CONFIRMED_REACTION'
]);

const TERMINAL_ZONE_STATUSES = new Set([
  'MITIGATED',
  'ACCEPTED_BROKEN',
  'CONVERSION_RETEST_UNCONFIRMED',
  'INVALID'
]);

function timestampMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return number > 10_000_000_000 ? number : number * 1000;
}

function toSourceTimestamp(milliseconds, reference) {
  return Number(reference) > 10_000_000_000 ? milliseconds : milliseconds / 1000;
}

function utcMonthStart(value) {
  const milliseconds = timestampMs(value);
  if (!Number.isFinite(milliseconds)) return NaN;
  const date = new Date(milliseconds);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function previousMonthStart(currentMonthStart) {
  const date = new Date(currentMonthStart);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1);
}

function interactionStatus(values, type, level, startMs, tolerance) {
  const rows = values
    .map((candle, index) => ({ candle, index, timeMs: timestampMs(candle.time) }))
    .filter(item => item.timeMs >= startMs);
  const hit = rows.find(({ candle }) => type === 'BSL'
    ? candle.high > level + tolerance
    : candle.low < level - tolerance);
  if (!hit) {
    return {
      active: true,
      status: 'DETECTED',
      confirmed: false,
      interactionIndex: -1,
      interactionTime: null,
      reclaimDepthAtr: 0
    };
  }
  const candle = hit.candle;
  const exactSweep = type === 'BSL'
    ? candle.close < level - tolerance
    : candle.close > level + tolerance;
  const closedThrough = type === 'BSL'
    ? candle.close > level + tolerance
    : candle.close < level - tolerance;
  const localAtr = Math.max(conceptAtrAtClean(values, hit.index), 0.0000001);
  const reclaimDepthAtr = type === 'BSL'
    ? (level - candle.close) / localAtr
    : (candle.close - level) / localAtr;
  return {
    active: false,
    status: exactSweep
      ? 'CONFIRMED_REACTION'
      : closedThrough
        ? 'CLOSED_THROUGH'
        : 'SWEPT_UNCONFIRMED',
    confirmed: exactSweep,
    interactionIndex: hit.index,
    interactionTime: candle.time,
    reclaimDepthAtr
  };
}

export function detectPreviousMonthLevels(candles, dailyCandles, {
  currentPrice = null
} = {}) {
  const values = cleanConceptCandles(candles);
  const daily = cleanConceptCandles(dailyCandles);
  if (!values.length || !daily.length) return [];
  const reference = values.at(-1).time;
  const currentStart = utcMonthStart(reference);
  const priorStart = previousMonthStart(currentStart);
  const priorRows = daily.filter(candle => {
    const time = timestampMs(candle.time);
    return time >= priorStart && time < currentStart;
  });
  if (!priorRows.length) return [];
  const high = Math.max(...priorRows.map(candle => candle.high));
  const low = Math.min(...priorRows.map(candle => candle.low));
  const latestAtr = Math.max(conceptAtrAtClean(values, values.length - 1), 0.0000001);
  const tolerance = latestAtr * 0.03;
  const availableIndex = values.findIndex(candle => timestampMs(candle.time) >= currentStart);
  const price = conceptNumber(currentPrice, values.at(-1).close);
  const build = (label, type, level) => {
    const interaction = interactionStatus(values, type, level, currentStart, tolerance);
    return {
      id: `${label}:${priorStart}:${level.toFixed(5)}`,
      type,
      subtype: label,
      label,
      level,
      source: label,
      sourcePeriod: 'PREVIOUS_MONTH',
      sourceStart: toSourceTimestamp(priorStart, reference),
      sourceEnd: toSourceTimestamp(currentStart, reference),
      originIndex: -1,
      availableIndex: availableIndex >= 0 ? availableIndex : values.length,
      tolerance,
      localAtr: latestAtr,
      tier: 'EXTERNAL_KEY',
      distance: Math.abs(level - price),
      evidenceClass: MAPPING_EVIDENCE_CLASS.VALIDATED_CONTEXT,
      directionalAuthority: false,
      executionAuthority: false,
      ...interaction
    };
  };
  return [
    build('PMH', 'BSL', high),
    build('PML', 'SSL', low)
  ];
}

export function previousMonthSnapshot(levels) {
  const byLabel = Object.fromEntries((levels || []).map(level => [level.label, level]));
  return {
    pmh: byLabel.PMH?.level || 0,
    pml: byLabel.PML?.level || 0,
    pmhStatus: byLabel.PMH?.status || 'WAIT',
    pmlStatus: byLabel.PML?.status || 'WAIT'
  };
}

function protectedValue(value, side) {
  if (Number.isFinite(Number(value))) return Number(value);
  const keys = side === 'HIGH'
    ? ['price', 'level', 'high', 'value']
    : ['price', 'level', 'low', 'value'];
  for (const key of keys) {
    const candidate = Number(value?.[key]);
    if (Number.isFinite(candidate)) return candidate;
  }
  return null;
}

export function buildStrongWeakStructure(structureSnapshot, liquidityHierarchy) {
  const bias = String(structureSnapshot?.bias || structureSnapshot?.trend || 'NEUTRAL').toUpperCase();
  const protectedHigh = protectedValue(structureSnapshot?.protectedHigh, 'HIGH');
  const protectedLow = protectedValue(structureSnapshot?.protectedLow, 'LOW');
  const weakHigh = liquidityHierarchy?.activeTargets?.find(item => item.type === 'BSL') || null;
  const weakLow = liquidityHierarchy?.activeTargets?.find(item => item.type === 'SSL') || null;
  const bullish = bias.includes('BULL');
  const bearish = bias.includes('BEAR');
  const output = {
    bias,
    strongHigh: bearish && Number.isFinite(protectedHigh)
      ? { label: 'STRONG HIGH', level: protectedHigh, role: 'PROTECTED_STRUCTURE' }
      : null,
    strongLow: bullish && Number.isFinite(protectedLow)
      ? { label: 'STRONG LOW', level: protectedLow, role: 'PROTECTED_STRUCTURE' }
      : null,
    weakHigh: bullish && weakHigh
      ? { label: 'WEAK HIGH', level: weakHigh.level, role: 'DRAW_ON_LIQUIDITY', source: weakHigh.label }
      : null,
    weakLow: bearish && weakLow
      ? { label: 'WEAK LOW', level: weakLow.level, role: 'DRAW_ON_LIQUIDITY', source: weakLow.label }
      : null,
    evidenceClass: MAPPING_EVIDENCE_CLASS.VALIDATED_CONTEXT,
    directionalAuthority: false,
    executionAuthority: false
  };
  output.summary = bullish
    ? output.strongLow && output.weakHigh
      ? `Strong Low ${output.strongLow.level.toFixed(2)} harus bertahan; Weak High ${output.weakHigh.level.toFixed(2)} adalah liquidity context, bukan jaminan target.`
      : 'Struktur bullish belum memiliki pasangan Strong Low dan Weak High yang lengkap.'
    : bearish
      ? output.strongHigh && output.weakLow
        ? `Strong High ${output.strongHigh.level.toFixed(2)} harus bertahan; Weak Low ${output.weakLow.level.toFixed(2)} adalah liquidity context, bukan jaminan target.`
        : 'Struktur bearish belum memiliki pasangan Strong High dan Weak Low yang lengkap.'
      : 'Struktur netral: Strong/Weak High-Low tidak dipaksakan.';
  return output;
}

function zonedParts(value, timeZone) {
  const milliseconds = timestampMs(value);
  if (!Number.isFinite(milliseconds)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(milliseconds));
  const read = type => Number(parts.find(item => item.type === type)?.value || 0);
  return {
    year: read('year'), month: read('month'), day: read('day'),
    hour: read('hour'), minute: read('minute')
  };
}

function dateKey(parts) {
  return parts
    ? `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
    : '';
}

export function detectMidnightOpenContext(m5Candles, {
  currentPrice = null
} = {}) {
  const values = cleanConceptCandles(m5Candles);
  if (!values.length) {
    return {
      status: 'NO_DATA',
      active: false,
      evidenceClass: MAPPING_EVIDENCE_CLASS.RAW_OBSERVATION,
      executionAuthority: false,
      summary: 'Candle M5 Midnight Open belum tersedia.'
    };
  }
  const zone = 'America/New_York';
  const latestParts = zonedParts(values.at(-1).time, zone);
  const latestKey = dateKey(latestParts);
  const rows = values
    .map((candle, index) => ({ candle, index, parts: zonedParts(candle.time, zone) }))
    .filter(item => dateKey(item.parts) === latestKey);
  const openRow = rows.find(item => item.parts.hour === 0 && item.parts.minute === 0)
    || rows.find(item => item.parts.hour === 0);
  if (!openRow) {
    return {
      status: 'WAITING_FOR_MIDNIGHT_CANDLE',
      active: false,
      date: latestKey,
      evidenceClass: MAPPING_EVIDENCE_CLASS.RAW_OBSERVATION,
      executionAuthority: false,
      summary: 'Menunggu candle M5 pertama pada 00:00 New York.'
    };
  }
  const open = openRow.candle.open;
  const atr = Math.max(conceptAtrAtClean(values, openRow.index), 0.0000001);
  const tolerance = atr * 0.10;
  const after = rows.filter(item => item.index > openRow.index);
  const departure = after.find(({ candle }) =>
    candle.low > open + tolerance || candle.high < open - tolerance);
  const direction = departure
    ? departure.candle.low > open + tolerance ? 'ABOVE' : 'BELOW'
    : 'NONE';
  const afterDeparture = departure
    ? after.filter(item => item.index > departure.index)
    : [];
  const retest = afterDeparture.find(({ candle }) => direction === 'ABOVE'
    ? candle.low <= open + tolerance && candle.close > open
    : candle.high >= open - tolerance && candle.close < open);
  const testing = !retest && afterDeparture.find(({ candle }) =>
    candle.low <= open + tolerance && candle.high >= open - tolerance);
  const status = retest
    ? 'RETEST_CONFIRMED'
    : testing
      ? 'RETEST_TESTING'
      : departure
        ? 'DEPARTED'
        : 'WAITING_FOR_DEPARTURE';
  const price = conceptNumber(currentPrice, values.at(-1).close);
  return {
    date: latestKey,
    timeZone: zone,
    open,
    sourceTime: openRow.candle.time,
    sourceIndex: openRow.index,
    tolerance,
    departureDirection: direction,
    departureIndex: departure?.index ?? -1,
    retestIndex: retest?.index ?? -1,
    status,
    active: status !== 'NO_DATA',
    distance: Math.abs(price - open),
    evidenceClass: retest
      ? MAPPING_EVIDENCE_CLASS.VALIDATED_CONTEXT
      : MAPPING_EVIDENCE_CLASS.RAW_OBSERVATION,
    directionalAuthority: false,
    executionAuthority: false,
    summary: retest
      ? `Midnight Open ${open.toFixed(2)} sudah diretest dan ditolak kembali ${direction === 'ABOVE' ? 'ke atas' : 'ke bawah'}; tetap hanya konteks.`
      : departure
        ? `Harga sudah berangkat ${direction === 'ABOVE' ? 'di atas' : 'di bawah'} Midnight Open ${open.toFixed(2)}; menunggu retest terkonfirmasi.`
        : `Midnight Open ${open.toFixed(2)} tersedia; belum ada departure yang bersih.`
  };
}

const ADAPTIVE_EQUAL_PROFILES = Object.freeze({
  M1: Object.freeze({ toleranceAtr: 0.025, strength: 4 }),
  M5: Object.freeze({ toleranceAtr: 0.030, strength: 4 }),
  M15: Object.freeze({ toleranceAtr: 0.040, strength: 4 }),
  M30: Object.freeze({ toleranceAtr: 0.040, strength: 4 }),
  H1: Object.freeze({ toleranceAtr: 0.050, strength: 3 }),
  H4: Object.freeze({ toleranceAtr: 0.060, strength: 3 }),
  D1: Object.freeze({ toleranceAtr: 0.080, strength: 2 }),
  W1: Object.freeze({ toleranceAtr: 0.100, strength: 2 })
});

function confirmedPivots(values, strength) {
  const highs = [];
  const lows = [];
  for (let index = strength; index < values.length - strength; index += 1) {
    const high = values[index].high;
    const low = values[index].low;
    let pivotHigh = true;
    let pivotLow = true;
    for (let offset = 1; offset <= strength; offset += 1) {
      pivotHigh = pivotHigh
        && high > values[index - offset].high
        && high > values[index + offset].high;
      pivotLow = pivotLow
        && low < values[index - offset].low
        && low < values[index + offset].low;
    }
    if (pivotHigh) highs.push({ index, time: values[index].time, price: high });
    if (pivotLow) lows.push({ index, time: values[index].time, price: low });
  }
  return { highs, lows };
}

function clusterPivots(items, tolerance, type) {
  const clusters = [];
  for (const item of items.slice(-120)) {
    let cluster = clusters.find(candidate => Math.abs(candidate.level - item.price) <= tolerance);
    if (!cluster) {
      cluster = { type, level: item.price, touches: 0, pivots: [] };
      clusters.push(cluster);
    }
    cluster.pivots.push(item);
    cluster.touches += 1;
    cluster.level = cluster.pivots.reduce((sum, pivot) => sum + pivot.price, 0) / cluster.pivots.length;
  }
  return clusters
    .filter(cluster => cluster.touches >= 2)
    .sort((a, b) => b.pivots.at(-1).index - a.pivots.at(-1).index)
    .slice(0, 8)
    .map(cluster => ({
      ...cluster,
      firstIndex: cluster.pivots[0].index,
      lastIndex: cluster.pivots.at(-1).index,
      availableIndex: cluster.pivots.at(-1).index
    }));
}

export function detectAdaptiveEqualHighLow(candles, tf = 'M15') {
  const values = cleanConceptCandles(candles);
  const timeframe = String(tf || 'M15').toUpperCase();
  const profile = ADAPTIVE_EQUAL_PROFILES[timeframe] || ADAPTIVE_EQUAL_PROFILES.M15;
  if (!values.length) {
    return {
      timeframe,
      profile,
      appliedToProduction: false,
      authority: 'EXPERIMENTAL_ADVISORY',
      eqh: [],
      eql: []
    };
  }
  const atr = Math.max(conceptAtrAtClean(values, values.length - 1), 0.0000001);
  const tolerance = atr * profile.toleranceAtr;
  const pivots = confirmedPivots(values, profile.strength);
  return {
    timeframe,
    profile,
    atr,
    tolerance,
    productionToleranceAtr: 0.03,
    appliedToProduction: false,
    directionalAuthority: false,
    executionAuthority: false,
    authority: 'EXPERIMENTAL_ADVISORY',
    eqh: clusterPivots(pivots.highs, tolerance, 'EQH'),
    eql: clusterPivots(pivots.lows, tolerance, 'EQL'),
    note: 'Kandidat adaptif tidak mengganti cluster liquidity produksi sebelum validasi out-of-sample.'
  };
}

function originCandidate(candle, index, direction, breakIndex) {
  if (!candle) return null;
  const opposite = direction === 'BULLISH'
    ? candle.close < candle.open
    : candle.close > candle.open;
  if (!opposite) return null;
  const body = Math.abs(candle.close - candle.open);
  const range = Math.max(candle.high - candle.low, 0.0000001);
  return {
    index,
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    bodyRatio: body / range,
    distanceBars: breakIndex - index,
    bottom: direction === 'BULLISH' ? candle.low : candle.open,
    top: direction === 'BULLISH' ? candle.open : candle.high
  };
}

export function reviewOrderBlockOrigins(orderBlocks, candles) {
  const values = cleanConceptCandles(candles);
  return (orderBlocks || []).map(zone => {
    const breakIndex = Number(zone.structureBreakIndex);
    const primaryIndex = Number(zone.originIndex);
    if (!Number.isInteger(breakIndex) || breakIndex <= 0) {
      return {
        zoneId: zone.id,
        applied: false,
        authority: 'EXPERIMENTAL_ADVISORY',
        lockedPrimaryIndex: primaryIndex,
        alternative: null
      };
    }
    const start = Math.max(0, breakIndex - (zone.structureScope === 'MAJOR' ? 20 : 12));
    const candidates = [];
    for (let index = start; index < breakIndex; index += 1) {
      const candidate = originCandidate(values[index], index, zone.direction, breakIndex);
      if (candidate) candidates.push(candidate);
    }
    const alternative = [...candidates].sort((a, b) => zone.direction === 'BULLISH'
      ? a.low - b.low || a.distanceBars - b.distanceBars
      : b.high - a.high || a.distanceBars - b.distanceBars)[0] || null;
    return {
      zoneId: zone.id,
      direction: zone.direction,
      applied: false,
      authority: 'EXPERIMENTAL_ADVISORY',
      selectionMode: 'LOCKED_PRIMARY_WITH_EXTREME_CAUSAL_REVIEW',
      lockedPrimaryIndex: primaryIndex,
      alternative: alternative && alternative.index !== primaryIndex ? alternative : null,
      candidates,
      note: 'Alternatif tidak mengubah batas OB produksi sampai lulus validasi.'
    };
  });
}

function evidenceForZone(zone) {
  const status = String(zone?.status || 'DETECTED').toUpperCase();
  return VALIDATED_ZONE_STATUSES.has(status)
    ? MAPPING_EVIDENCE_CLASS.VALIDATED_CONTEXT
    : MAPPING_EVIDENCE_CLASS.RAW_OBSERVATION;
}

function freshnessForZone(zone) {
  const status = String(zone?.status || 'DETECTED').toUpperCase();
  const touchIndex = Number(zone?.touchIndex);
  const visibleIndex = Number(zone?.displayAvailableIndex ?? zone?.availableIndex);
  const staleAtBirth = Number.isInteger(touchIndex)
    && touchIndex >= 0
    && Number.isInteger(visibleIndex)
    && touchIndex <= visibleIndex;
  const fresh = status === 'DETECTED'
    && !staleAtBirth
    && !(Number.isInteger(touchIndex) && touchIndex >= 0)
    && !(Number.isInteger(Number(zone?.fullMitigationIndex)) && Number(zone.fullMitigationIndex) >= 0);
  return {
    zoneId: zone?.id,
    status,
    staleAtBirth,
    freshAtSnapshot: fresh,
    allowFreshLabel: fresh,
    displayState: fresh
      ? 'FRESH'
      : TERMINAL_ZONE_STATUSES.has(status)
        ? 'TERMINAL_OR_USED'
        : VALIDATED_ZONE_STATUSES.has(status)
          ? 'VALIDATED_REACTION'
          : 'TOUCHED_OR_TESTING'
  };
}

export function buildEvidenceCatalog({
  structureSnapshot,
  liquidityLevels,
  fairValueGaps,
  orderBlocks
}) {
  const structures = (structureSnapshot?.events || []).map(event => ({
    id: event.id,
    kind: event.concept || event.kind,
    status: event.status,
    evidenceClass: event.valid && event.status === 'CONFIRMED_BREAK'
      ? MAPPING_EVIDENCE_CLASS.VALIDATED_CONTEXT
      : MAPPING_EVIDENCE_CLASS.RAW_OBSERVATION,
    directionalAuthority: false,
    executionAuthority: false
  }));
  const liquidity = (liquidityLevels || []).map(level => ({
    id: level.id,
    kind: level.subtype || level.type,
    status: level.status,
    evidenceClass: level.confirmed && level.status === 'CONFIRMED_REACTION'
      ? MAPPING_EVIDENCE_CLASS.VALIDATED_CONTEXT
      : MAPPING_EVIDENCE_CLASS.RAW_OBSERVATION,
    directionalAuthority: false,
    executionAuthority: false
  }));
  const zones = [...(fairValueGaps || []), ...(orderBlocks || [])].map(zone => ({
    id: zone.id,
    kind: zone.kind,
    status: zone.status,
    evidenceClass: evidenceForZone(zone),
    directionalAuthority: false,
    executionAuthority: false
  }));
  return { structures, liquidity, zones };
}

export function buildMappingContextEnhancements({
  tf = 'M15',
  candles = [],
  dailyCandles = [],
  m5Candles = [],
  currentPrice = null,
  structureSnapshot = {},
  liquidityLevels = [],
  liquidityHierarchy = {},
  fairValueGaps = [],
  orderBlocks = []
} = {}) {
  const values = cleanConceptCandles(candles);
  const monthlyLevels = detectPreviousMonthLevels(values, dailyCandles, { currentPrice });
  const monthlySnapshot = previousMonthSnapshot(monthlyLevels);
  const strongWeak = buildStrongWeakStructure(structureSnapshot, liquidityHierarchy);
  const midnightSource = cleanConceptCandles(m5Candles).length
    ? m5Candles
    : String(tf).toUpperCase() === 'M5'
      ? values
      : [];
  const midnightOpen = detectMidnightOpenContext(midnightSource, { currentPrice });
  const adaptiveEqualHighLow = detectAdaptiveEqualHighLow(values, tf);
  const orderBlockOriginReview = reviewOrderBlockOrigins(orderBlocks, values);
  const zoneFreshnessAudit = [...fairValueGaps, ...orderBlocks].map(freshnessForZone);
  const evidenceCatalog = buildEvidenceCatalog({
    structureSnapshot,
    liquidityLevels,
    fairValueGaps,
    orderBlocks
  });
  const monthlyText = monthlySnapshot.pmh > 0
    ? `PMH ${monthlySnapshot.pmh.toFixed(2)} (${monthlySnapshot.pmhStatus}) · PML ${monthlySnapshot.pml.toFixed(2)} (${monthlySnapshot.pmlStatus}) · context only`
    : 'Data previous month belum tersedia.';
  const adaptiveCount = adaptiveEqualHighLow.eqh.length + adaptiveEqualHighLow.eql.length;
  return {
    version: '1.0.0',
    source: 'AMY_MAPPING_CONTEXT_ENHANCEMENTS_V1',
    evidenceContract: {
      classes: MAPPING_EVIDENCE_CLASS,
      rule: 'RAW dan VALIDATED CONTEXT tidak boleh membuka entry. EXECUTION AUTHORITY tetap hanya setupExecution resmi.',
      executionAuthoritySource: 'SETUP_EXECUTION_ONLY',
      directionForecastChanged: false,
      entryFormulaChanged: false,
      slTpFormulaChanged: false
    },
    evidenceCatalog,
    monthlyLevels,
    monthlySnapshot,
    strongWeak,
    midnightOpen,
    adaptiveEqualHighLow,
    orderBlockOriginReview,
    zoneFreshnessAudit,
    conceptRows: [
      ['Previous Month Liquidity', monthlySnapshot.pmhStatus, monthlyText],
      ['Strong / Weak Structure', strongWeak.bias, strongWeak.summary],
      ['Midnight Open', midnightOpen.status, midnightOpen.summary],
      ['Adaptive EQH / EQL', 'ADVISORY ONLY', `${adaptiveCount} kandidat adaptif · belum dipakai oleh Entry Map`],
      ['Evidence Contract', 'ENFORCED', 'RAW → VALIDATED CONTEXT → VALIDATED CLAIM; otoritas entry tetap setup resmi']
    ]
  };
}
