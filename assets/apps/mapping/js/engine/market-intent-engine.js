import { cleanCandles, directionValue, numeric } from './market-math.js';

function normalizeTarget(target, price) {
  const level = numeric(target?.level ?? target?.price);
  if (!Number.isFinite(level) || level <= 0) return null;
  const text = `${target?.type || ''} ${target?.label || ''} ${target?.subtype || ''}`.toUpperCase();
  const type = text.includes('BSL') || text.includes('HIGH') || text.includes('PDH') || text.includes('PWH')
    ? 'BSL'
    : text.includes('SSL') || text.includes('LOW') || text.includes('PDL') || text.includes('PWL')
      ? 'SSL' : '';
  if (!type) return null;
  return {
    ...target,
    type,
    level,
    label: String(target?.label || target?.subtype || type).toUpperCase(),
    distance: Number.isFinite(price) ? level - price : 0,
    distanceAbs: Number.isFinite(price) ? Math.abs(level - price) : Infinity
  };
}

function localTargets(candles, price) {
  const values = candles.slice(-48, -1);
  if (!values.length || !(price > 0)) return [];
  const high = Math.max(...values.map(candle => candle.high));
  const low = Math.min(...values.map(candle => candle.low));
  return [
    high > price ? { type: 'BSL', label: 'BSL LOKAL', level: high, source: 'LOCAL_RANGE' } : null,
    low < price ? { type: 'SSL', label: 'SSL LOKAL', level: low, source: 'LOCAL_RANGE' } : null
  ].filter(Boolean).map(target => normalizeTarget(target, price));
}

export function deriveLiquidityContext({ result = null, regime = null, candles = [] } = {}) {
  const values = cleanCandles(candles);
  const price = numeric(result?.price, values.at(-1)?.close);
  const waiting = {
    version: '4.0.0-preview',
    status: 'WAITING',
    price,
    nearestLiquidity: null,
    htfAlignedLiquidity: null,
    upperLiquidity: null,
    lowerLiquidity: null,
    destination: 'BELUM TERSEDIA',
    confidenceScore: null,
    confidenceMeaning: 'CONTEXT_SCORE_NOT_PROBABILITY',
    statement: 'Liquidity context belum tersedia.',
    warning: 'Bukan sinyal BUY/SELL dan tidak menentukan timing entry.'
  };
  if (!result || values.length < 30 || !(price > 0)) return waiting;

  const hierarchy = result?.marketConcepts?.liquidityHierarchy || result?.liquidityHierarchy || {};
  const supplied = Array.isArray(hierarchy.activeTargets)
    ? hierarchy.activeTargets
    : Array.isArray(result?.activeLiquidityTargets) ? result.activeLiquidityTargets : [];
  let targets = supplied.map(target => normalizeTarget(target, price)).filter(Boolean)
    .filter(target => target.type === 'BSL' ? target.level > price : target.level < price);
  if (!targets.length) targets = localTargets(values, price);
  targets.sort((a, b) => a.distanceAbs - b.distanceAbs);

  const upperLiquidity = targets.find(target => target.type === 'BSL') || null;
  const lowerLiquidity = targets.find(target => target.type === 'SSL') || null;
  const nearestLiquidity = targets[0] || null;
  const htfDirection = Math.sign(numeric(regime?.features?.htfScore, 0))
    || directionValue(result?.htfNarrative?.htfBias || result?.st?.confirmedTrend || result?.st?.trend);
  const htfAlignedLiquidity = htfDirection > 0 ? upperLiquidity : htfDirection < 0 ? lowerLiquidity : null;
  const auditedDraw = result?.liquidityDraw || result?.liquidityPrediction || null;
  const drawText = String(auditedDraw?.direction || auditedDraw?.prediction || '').toUpperCase();
  const auditedTarget = drawText.includes('BSL') ? upperLiquidity : drawText.includes('SSL') ? lowerLiquidity : null;
  const confidenceScore = Number.isFinite(Number(auditedDraw?.confidence)) ? Math.round(Number(auditedDraw.confidence)) : null;
  const destinationTarget = auditedTarget || nearestLiquidity;
  const destination = destinationTarget
    ? `${destinationTarget.type === 'BSL' ? 'UPPER LIQUIDITY' : 'LOWER LIQUIDITY'} (${destinationTarget.type})`
    : 'BELUM TERSEDIA';

  return {
    version: '4.0.0-preview',
    status: destinationTarget ? 'READY' : 'NO_TARGET',
    price,
    nearestLiquidity,
    htfAlignedLiquidity,
    upperLiquidity,
    lowerLiquidity,
    destination,
    destinationTarget,
    confidenceScore,
    confidenceMeaning: 'CONTEXT_SCORE_NOT_PROBABILITY',
    statement: destinationTarget
      ? `${destination} di ${destinationTarget.level.toFixed(2)} adalah objective konteks yang sedang diprioritaskan.`
      : 'Tidak ada liquidity aktif yang valid pada sisi harga sekarang.',
    warning: 'Destination first-hit bukan arah transaksi. BSL-first bukan BUY dan SSL-first bukan SELL.',
    distinctions: {
      nearestLiquidity: 'Target aktif dengan jarak paling dekat dari harga.',
      htfAlignedLiquidity: 'Target pada sisi yang sama dengan konteks HTF.',
      auditedDestination: auditedTarget ? 'Output model Liquidity Draw first-hit.' : 'Belum ada output Liquidity Draw yang lolos threshold.'
    }
  };
}

export const deriveMarketIntent = deriveLiquidityContext;
