import { clamp, directionValue, numeric } from '../market-math.js';
import { disabledEngine, setupContract, strategyContext, waitEngine } from './strategy-common.js';

export const MANIPULATION_ENGINE = 'SWEEP_MSS_REVERSAL';

function eventIndex(event) {
  return numeric(event?.index ?? event?.availableIndex ?? event?.originIndex, -Infinity);
}

function adaptEntryMap(setup, quality) {
  if (!setup) return null;
  return {
    ...setup,
    id: setup.id || `REGIME:MANIPULATION:${setup.startTime || setup.timestamp || Date.now()}`,
    type: 'SWEEP MSS REVERSAL',
    strategy: MANIPULATION_ENGINE,
    status: setup.lifecycle?.live === false || setup.live === false ? setup.status : 'READY',
    score: Math.round(clamp(quality, 0, 100)),
    scoreMode: 'QUALITY_SCORE',
    grade: quality >= 80 ? 'A' : quality >= 65 ? 'B' : 'C',
    executionMode: 'REGIME_ROUTED_M15',
    conflictCheck: {
      ...(setup.conflictCheck || {}),
      hasFatalConflict: false,
      conflictLevel: 'NONE',
      recommendation: 'READY',
      rr: numeric(setup?.conflictCheck?.rr, numeric(setup?.tradeManagement?.tp2R, 1.75))
    },
    components: { ...(setup.components || {}), source: 'ICT_ENTRY_MAP_ROUTED_BY_REGIME' }
  };
}

export function evaluateManipulationSweep(input = {}) {
  const activeRegime = String(input?.activeRegime || input?.regime?.regime || 'TRANSITION').toUpperCase();
  if (activeRegime !== 'MANIPULATION') return disabledEngine(MANIPULATION_ENGINE, 'MANIPULATION', activeRegime);
  const context = strategyContext(input);
  if (context.values.length < 100 || !context.current) {
    return waitEngine(MANIPULATION_ENGINE, 'MANIPULATION', 'Data M15 belum cukup untuk sweep memory dan MSS.');
  }

  const concepts = context.result?.marketConcepts || {};
  const structure = concepts.structure || context.result?.st || {};
  const sweep = concepts.latestConfirmedSweep || structure.lastSweep || null;
  const lastBreak = structure.lastConfirmedBreak || structure.lastEvent || structure.last || null;
  const currentIndex = context.values.length - 1;
  const sweepAge = sweep ? currentIndex - eventIndex(sweep) : Infinity;
  const sweepText = `${sweep?.type || ''} ${sweep?.brokenSide || ''} ${sweep?.dir || ''}`.toUpperCase();
  const sweptSide = sweepText.includes('SSL') || sweepText.includes('LOW') || sweepText.includes('BEAR') ? 'SSL'
    : sweepText.includes('BSL') || sweepText.includes('HIGH') || sweepText.includes('BULL') ? 'BSL' : '';
  const expectedDirection = sweptSide === 'SSL' ? 1 : sweptSide === 'BSL' ? -1 : 0;
  const breakDirection = directionValue(lastBreak?.dir || lastBreak?.direction);
  const mssConfirmed = Boolean(expectedDirection && breakDirection === expectedDirection
    && (lastBreak?.valid !== false)
    && (lastBreak?.breakType === 'VALID_BREAK' || lastBreak?.kind === 'MSS' || lastBreak?.kind === 'CHOCH' || lastBreak?.concept === 'MSS'));
  const displacement = lastBreak?.hasDisplacement ? 1 : numeric(context.regime?.features?.displacement, 0);
  const activeEntryMap = context.result?.entryMap?.activeSetup
    || (context.result?.entryMap?.setup?.live ? context.result.entryMap.setup : null);
  const entryDirection = directionValue(activeEntryMap?.dir || activeEntryMap?.direction);
  const entryAligned = activeEntryMap && (!expectedDirection || entryDirection === expectedDirection);
  const reclaim = numeric(sweep?.reclaimDepthAtr, 0);

  const quality = Math.round(clamp(
    (sweep && sweepAge <= 12 ? 28 : 0)
      + (mssConfirmed ? 24 : 0)
      + displacement * 16
      + clamp(reclaim / 0.8, 0, 1) * 10
      + (entryAligned ? 16 : 0)
      + numeric(context.regime?.probabilities?.MANIPULATION, 0) * 0.12
      - numeric(context.regime?.shift?.risk, 0) * 0.10,
    0,
    100
  ));

  const reasons = [];
  if (!sweep || sweepAge > 12) reasons.push('Belum ada liquidity sweep yang masih berada dalam memory 12 candle M15.');
  if (!expectedDirection) reasons.push('Sisi liquidity yang disapu belum dapat ditentukan.');
  if (!mssConfirmed) reasons.push('Sweep belum diikuti MSS/CHOCH valid ke arah reversal.');
  if (displacement < 0.45) reasons.push('MSS belum memiliki displacement yang cukup kuat.');
  if (!activeEntryMap) reasons.push('Entry Map belum menghasilkan setup Sweep → MSS aktif.');
  if (activeEntryMap && !entryAligned) reasons.push('Arah Entry Map berlawanan dengan reversal setelah sweep.');

  if (entryAligned && quality >= 68) {
    const setup = adaptEntryMap(activeEntryMap, quality);
    return {
      engine: MANIPULATION_ENGINE,
      requiredRegime: 'MANIPULATION',
      enabled: true,
      status: 'READY',
      direction: setup.dir,
      quality,
      setup,
      watchSetup: setup,
      reasons: ['Sweep, MSS, displacement, dan Entry Map aktif berada pada arah yang sama.'],
      metrics: { sweepAge, sweptSide, mssConfirmed, displacement, reclaim, entryAligned }
    };
  }

  const prerequisite = sweep && sweepAge <= 12 && expectedDirection && mssConfirmed && displacement >= 0.45;
  if (!prerequisite || quality < 62) {
    return {
      ...waitEngine(MANIPULATION_ENGINE, 'MANIPULATION', reasons.length ? reasons : 'Manipulation terdeteksi, tetapi reversal belum terkonfirmasi.', {
        sweepAge, sweptSide, mssConfirmed, displacement, reclaim
      }),
      quality,
      status: prerequisite ? 'WATCH' : 'WAIT'
    };
  }

  const sweepLevel = numeric(sweep?.level ?? sweep?.price, expectedDirection > 0 ? context.current.low : context.current.high);
  const stop = sweepLevel - expectedDirection * context.atr * 0.20;
  const riskAtr = Math.abs(context.price - stop) / context.atr;
  if (riskAtr < 0.30 || riskAtr > 2.30) {
    reasons.push(`Stop di luar sweep menghasilkan risk ${riskAtr.toFixed(2)} ATR.`);
    return { ...waitEngine(MANIPULATION_ENGINE, 'MANIPULATION', reasons, { sweepAge, sweptSide, riskAtr }), quality, status: 'WATCH' };
  }

  const setup = setupContract({
    id: `REGIME:MANIPULATION:${context.current.time}:${context.price.toFixed(3)}`,
    type: 'SWEEP MSS REVERSAL',
    strategy: MANIPULATION_ENGINE,
    direction: expectedDirection,
    entry: context.price,
    stop,
    targetR: 1.75,
    quality,
    status: 'READY',
    timestamp: context.current.time > 10_000_000_000 ? context.current.time : context.current.time * 1000,
    reason: `${sweptSide} disapu dan MSS ${expectedDirection > 0 ? 'bullish' : 'bearish'} terkonfirmasi; entry hanya mengikuti reversal setelah reclaim.`,
    metadata: { source: 'ICT_SWEEP_MSS', sweepAge, sweptSide, displacement, reclaim, riskAtr }
  });
  return {
    engine: MANIPULATION_ENGINE,
    requiredRegime: 'MANIPULATION',
    enabled: true,
    status: 'READY',
    direction: expectedDirection > 0 ? 'BUY' : 'SELL',
    quality,
    setup,
    watchSetup: setup,
    reasons: ['Liquidity sweep dan MSS reversal sudah terkonfirmasi.'],
    metrics: { sweepAge, sweptSide, mssConfirmed, displacement, reclaim, riskAtr }
  };
}
