import { classifySweepAcceptance } from './sweep-acceptance.js';

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function direction(value) {
  const text = String(value ?? '').toUpperCase();
  const numeric = Number(value);
  if (numeric === 1 || text.includes('BULL') || text === 'BUY') return 'BULLISH';
  if (numeric === -1 || text.includes('BEAR') || text === 'SELL') return 'BEARISH';
  return 'NEUTRAL';
}

function levelText(value) {
  const parsed = number(value);
  return parsed == null ? '-' : parsed.toFixed(2);
}

function eventDirection(event) {
  return direction(event?.direction ?? event?.dir ?? event?.directionValue);
}

function eventLevel(event) {
  return number(event?.level ?? event?.price ?? event?.brokenLevel ?? event?.broken_level);
}

function eventName(event) {
  return String(event?.kind || event?.type || event?.concept || event?.name || 'EVENT');
}

function eventSummary(event) {
  if (!event) return 'Belum ada event yang cocok.';
  const level = eventLevel(event);
  return `${eventName(event)} ${eventDirection(event)}${level == null ? '' : ` @ ${level.toFixed(2)}`}`;
}

function latestMatching(result, matcher) {
  const pools = [
    ...(result?.amySmcD?.raw?.predictiveEvents || []),
    ...(result?.amySmcD?.raw?.structureEvents || []),
    ...(result?.amySmcD?.descriptive?.eventHistory || [])
  ];
  for (let index = pools.length - 1; index >= 0; index -= 1) {
    const item = pools[index];
    if (matcher(item)) return item;
  }
  return null;
}

function eventState(name, freshEvent, matcher, note = '') {
  const last = freshEvent || null;
  return {
    name,
    fresh: Boolean(freshEvent),
    status: freshEvent ? 'FRESH' : 'NO_FRESH_EVENT',
    current: freshEvent || null,
    last,
    summary: freshEvent ? eventSummary(freshEvent) : note || 'Tidak ada event baru pada candle sumber.'
  };
}

function zoneState(zone, kind) {
  if (!zone) return { kind, status: 'NONE_ACTIVE', direction: 'NEUTRAL', bottom: null, top: null, summary: `Tidak ada ${kind} aktif terdekat.` };
  const bottom = number(zone.bottom ?? zone.low);
  const top = number(zone.top ?? zone.high);
  return {
    kind,
    status: String(zone.status || 'DETECTED'),
    direction: direction(zone.direction),
    bottom,
    top,
    summary: `${direction(zone.direction)} ${kind} ${levelText(bottom)}–${levelText(top)} · ${String(zone.status || 'DETECTED')}`
  };
}

function deriveMarketState(d) {
  const htf = direction(d?.htfSwing?.direction);
  const swing = direction(d?.swingStructure?.direction);
  const internal = direction(d?.internalStructure?.direction);
  if (htf === 'BULLISH' && swing === 'BULLISH' && internal === 'BULLISH') return { state: 'BULLISH_TREND', label: 'Bullish Trend', direction: 'BULLISH' };
  if (htf === 'BEARISH' && swing === 'BEARISH' && internal === 'BEARISH') return { state: 'BEARISH_TREND', label: 'Bearish Trend', direction: 'BEARISH' };
  if (htf === 'BULLISH' && swing === 'BULLISH' && internal === 'BEARISH') return { state: 'BULLISH_PULLBACK', label: 'Bullish Pullback', direction: 'BULLISH' };
  if (htf === 'BEARISH' && swing === 'BEARISH' && internal === 'BULLISH') return { state: 'BEARISH_PULLBACK', label: 'Bearish Pullback', direction: 'BEARISH' };
  if (swing !== 'NEUTRAL' && internal !== 'NEUTRAL' && swing !== internal) return { state: 'STRUCTURE_TRANSITION', label: 'Structure Transition', direction: swing };
  return { state: 'RANGE_OR_MIXED', label: 'Range / Mixed Context', direction: swing !== 'NEUTRAL' ? swing : htf };
}

function entryReadiness(result) {
  const watch = result?.entryWatch || {};
  const setup = result?.entryMap?.setup || result?.entryMap?.activeSetup || null;
  if (setup?.live || watch?.entryAllowed) {
    return {
      action: String(setup?.dir || setup?.direction || watch?.direction || 'READY').toUpperCase(),
      status: String(watch?.status || setup?.status || 'ENTRY_READY'),
      ready: true,
      reason: String(watch?.reason || result?.entryMap?.scenario?.reason || 'Sequence causal lengkap.')
    };
  }
  return {
    action: 'WAIT',
    status: String(watch?.status || result?.entryMap?.scenario?.status || 'WAITING_CONFIRMATION'),
    ready: false,
    reason: String(watch?.reason || result?.entryMap?.scenario?.reason || 'Menunggu sequence causal berikutnya.')
  };
}

function buildOutlook({ marketState, forecastDirection, drawTarget, fvg, ob, sweepAcceptance, invalidation, entry }) {
  const target = number(drawTarget?.level ?? drawTarget);
  const zone = fvg?.bottom != null ? fvg : ob?.bottom != null ? ob : null;
  const dir = direction(forecastDirection);
  const zoneText = zone ? `${zone.kind} ${levelText(zone.bottom)}–${levelText(zone.top)}` : 'zona retracement terdekat';
  const targetText = target == null ? 'liquidity berikutnya' : `liquidity ${target.toFixed(2)}`;
  const primary = dir === 'BULLISH'
    ? `${marketState.label}: pantau retracement/hold pada ${zoneText}, lalu continuation menuju ${targetText}.`
    : dir === 'BEARISH'
      ? `${marketState.label}: pantau retracement/rejection pada ${zoneText}, lalu continuation menuju ${targetText}.`
      : `${marketState.label}: belum ada directional forecast aktif; gunakan level dan event sebagai context.`;
  const alternative = sweepAcceptance.state === 'SWEEP_REJECTION'
    ? `${sweepAcceptance.label} sedang aktif sebagai context; tunggu confirmation dan first retest sebelum menganggap reversal siap dieksekusi.`
    : sweepAcceptance.state === 'BREAK_ACCEPTANCE'
      ? 'Break + Acceptance terdeteksi; skenario alternatif adalah retest level break lalu continuation.'
      : 'Skenario alternatif menunggu reaksi level: sweep/rejection atau break/acceptance yang baru.';
  return {
    authority: 'SCENARIO_ONLY',
    mayOpenEntry: false,
    primary,
    alternative,
    invalidation: invalidation == null ? 'Invalidasi mengikuti protected structure Amy-SMC-D.' : `Context invalid bila protected structure ${Number(invalidation).toFixed(2)} ditembus sesuai arah invalidasi.`,
    entryStatus: `${entry.action} · ${entry.reason}`
  };
}

export function buildMappingContextAggregate(result, { smt = null } = {}) {
  const amy = result?.amySmcD || {};
  const d = amy?.descriptive || {};
  const p = amy?.predictive || {};
  const support = result?.executionSupport || {};
  const enhancements = support?.contextEnhancements || {};
  const marketState = deriveMarketState(d);
  const sweepAcceptance = classifySweepAcceptance({ amySmcD: amy, sourceCandle: result?.sourceCandle });
  const rawBreak = p?.rawValidBreak || null;
  const qualifiedBreak = p?.qualifiedValidBreak || null;
  const qualifiedChoch = p?.qualifiedChoch || null;
  const qualifiedBos = p?.qualifiedBos || null;
  const rawPattern = p?.rawPattern?.active ? p.rawPattern : null;
  const qualifiedPattern = p?.qualifiedPattern?.active ? p.qualifiedPattern : null;
  const nearestFvg = zoneState(support?.nearestFairValueGaps?.[0] || support?.nearestFvg, 'FVG');
  const nearestOb = zoneState(support?.nearestOrderBlocks?.[0] || support?.nearestOb, 'OB');
  const drawTarget = result?.liquidityHierarchy?.drawTarget || null;
  const bsl = number(result?.bsl ?? amy?.levels?.bsl);
  const ssl = number(result?.ssl ?? amy?.levels?.ssl);
  const finalBias = direction(d?.finalBias?.direction);
  const nextMove = direction(p?.nextMove?.direction);
  const invalidation = finalBias === 'BULLISH' ? number(amy?.levels?.bullishInvalidation) : finalBias === 'BEARISH' ? number(amy?.levels?.bearishInvalidation) : null;
  const entry = entryReadiness(result);
  const smtState = smt || {
    state: 'UNAVAILABLE', direction: 'NEUTRAL', label: 'SMT unavailable',
    authority: 'EVIDENCE_ONLY', entryAuthority: false, mayOverrideMapping: false,
    reason: 'DXY M15 belum dimuat.'
  };

  const events = {
    sweepAcceptance,
    rawValidBreak: eventState('Raw Valid Break', rawBreak, () => false, rawBreak ? eventSummary(rawBreak) : `Event terakhir: ${eventSummary(latestMatching(result, item => String(eventName(item)).includes('VALID BREAK')))}`),
    qualifiedValidBreak: eventState('Qualified Valid Break', qualifiedBreak, () => false, qualifiedBreak ? eventSummary(qualifiedBreak) : 'Tidak ada qualified Valid Break baru; raw/context lain tetap ditampilkan.'),
    qualifiedChoch: eventState('Qualified CHoCH', qualifiedChoch, () => false, qualifiedChoch ? eventSummary(qualifiedChoch) : `Event struktur terakhir: ${eventSummary(latestMatching(result, item => String(eventName(item)).toUpperCase().includes('CHOCH')))}`),
    qualifiedBos: eventState('Qualified BOS', qualifiedBos, () => false, qualifiedBos ? eventSummary(qualifiedBos) : `Event BOS terakhir: ${eventSummary(latestMatching(result, item => String(eventName(item)).toUpperCase().includes('BOS')))}`),
    rawPattern: { name: 'Raw Pattern', fresh: Boolean(rawPattern), status: rawPattern ? 'FRESH' : 'NO_FRESH_EVENT', current: rawPattern, summary: rawPattern ? `${rawPattern.name} · ${rawPattern.direction}` : `Pattern state: ${d?.pattern?.name || 'NONE'} · ${d?.pattern?.direction || 'NEUTRAL'}` },
    qualifiedPattern: { name: 'Qualified Pattern', fresh: Boolean(qualifiedPattern), status: qualifiedPattern ? 'FRESH' : 'NO_FRESH_EVENT', current: qualifiedPattern, summary: qualifiedPattern ? `${qualifiedPattern.name} · ${qualifiedPattern.direction}` : 'Tidak ada qualified pattern baru; pattern continuous tetap terlihat.' }
  };

  const context = {
    htfSwing: direction(d?.htfSwing?.direction),
    swingStructure: direction(d?.swingStructure?.direction),
    internalStructure: direction(d?.internalStructure?.direction),
    dealingRange: String(d?.dealingRange?.location || 'UNKNOWN'),
    finalBias,
    liquidity: {
      active: Boolean(d?.liquidity?.active),
      direction: direction(d?.liquidity?.direction),
      side: d?.liquidity?.side || null,
      bsl,
      ssl,
      drawTarget
    },
    strongWeak: enhancements?.strongWeakStructure || enhancements?.strongWeak || support?.strongWeakStructure || null,
    previousDay: support?.previousPeriods || null,
    previousMonth: enhancements?.monthlySnapshot || support?.contextEnhancements?.monthlySnapshot || null,
    midnightOpen: enhancements?.midnightOpen || support?.midnightOpen || null,
    adaptiveEqualHighLow: enhancements?.adaptiveEqualHighLow || support?.adaptiveEqualHighLow || null
  };

  const facts = {
    source: 'AMY_MAPPING_CONTEXT_AGGREGATOR_V1',
    timeframe: result?.tf || amy?.tf || null,
    sourceCandleTime: result?.sourceCandleTime || amy?.sourceCandle?.time || null,
    marketState: marketState.state,
    htfSwing: context.htfSwing,
    swingStructure: context.swingStructure,
    internalStructure: context.internalStructure,
    dealingRange: context.dealingRange,
    finalBias,
    nextMove,
    bsl,
    ssl,
    nearestFvg,
    nearestOb,
    sweepAcceptance: sweepAcceptance.state,
    entryAction: entry.action,
    entryReason: entry.reason,
    smt: smtState.state
  };

  const evidence = [
    { engine: 'HTF_SWING', state: context.htfSwing, class: 'VALIDATED_CONTEXT' },
    { engine: 'SWING_STRUCTURE', state: context.swingStructure, class: 'VALIDATED_CONTEXT' },
    { engine: 'INTERNAL_STRUCTURE', state: context.internalStructure, class: 'VALIDATED_CONTEXT' },
    { engine: 'DEALING_RANGE', state: context.dealingRange, class: 'VALIDATED_CONTEXT' },
    { engine: 'LIQUIDITY', state: d?.liquidity?.active ? d?.liquidity?.direction : 'CONTINUOUS_LEVELS', class: 'VALIDATED_CONTEXT' },
    { engine: 'SWEEP_ACCEPTANCE', state: sweepAcceptance.state, direction: sweepAcceptance.direction, class: 'VALIDATED_CONTEXT' },
    { engine: 'RAW_VALID_BREAK', state: rawBreak ? eventDirection(rawBreak) : 'NO_FRESH_EVENT', class: 'RAW_OBSERVATION' },
    { engine: 'QUALIFIED_VALID_BREAK', state: qualifiedBreak ? eventDirection(qualifiedBreak) : 'NO_FRESH_EVENT', class: 'VALIDATED_CLAIM' },
    { engine: 'QUALIFIED_CHOCH', state: qualifiedChoch ? eventDirection(qualifiedChoch) : 'NO_FRESH_EVENT', class: 'VALIDATED_CLAIM' },
    { engine: 'QUALIFIED_BOS', state: qualifiedBos ? eventDirection(qualifiedBos) : 'NO_FRESH_EVENT', class: 'VALIDATED_CLAIM' },
    { engine: 'RAW_PATTERN', state: rawPattern?.name || d?.pattern?.name || 'NONE', class: 'RAW_OBSERVATION' },
    { engine: 'QUALIFIED_PATTERN', state: qualifiedPattern?.name || 'NO_FRESH_EVENT', class: 'VALIDATED_CLAIM' },
    { engine: 'FVG', state: nearestFvg.status, direction: nearestFvg.direction, class: 'VALIDATED_CONTEXT' },
    { engine: 'ORDER_BLOCK', state: nearestOb.status, direction: nearestOb.direction, class: 'VALIDATED_CONTEXT' },
    { engine: 'FINAL_BIAS', state: finalBias, class: 'VALIDATED_CONTEXT' },
    { engine: 'NEXT_MOVE', state: p?.nextMove?.signal || 'WAIT', direction: nextMove, class: 'VALIDATED_CLAIM' },
    { engine: 'SWEEP_CONTINUATION', state: p?.sweepContinuation?.active ? p.sweepContinuation.direction : 'NO_FRESH_EVENT', class: 'VALIDATED_CLAIM' },
    { engine: 'SMT_XAU_DXY', state: smtState.state, direction: smtState.direction, class: 'VALIDATED_CLAIM', authority: 'EVIDENCE_ONLY' },
    { engine: 'ENTRY_MAP', state: entry.status, action: entry.action, class: 'EXECUTION_AUTHORITY' }
  ];

  const outlook = buildOutlook({
    marketState,
    forecastDirection: p?.nextMove?.direction,
    drawTarget,
    fvg: nearestFvg,
    ob: nearestOb,
    sweepAcceptance,
    invalidation,
    entry
  });

  return {
    version: '1.0.0',
    source: 'AMY_MAPPING_CONTEXT_AGGREGATOR_V1',
    context,
    marketState,
    events,
    locations: { fvg: nearestFvg, orderBlock: nearestOb },
    predictive: {
      finalBias,
      nextMove,
      nextMoveSignal: p?.nextMove?.signal || 'WAIT',
      sweepContinuation: p?.sweepContinuation || null,
      smt: smtState
    },
    outlook,
    entryReadiness: entry,
    facts,
    evidence,
    authorityContract: {
      contextMayOpenEntry: false,
      outlookMayOpenEntry: false,
      smtMayOverrideMapping: false,
      executionAuthority: 'ENTRY_MAP_SETUP_EXECUTION_ONLY'
    }
  };
}
