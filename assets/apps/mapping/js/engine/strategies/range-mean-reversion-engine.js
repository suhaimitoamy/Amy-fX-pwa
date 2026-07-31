import { clamp, numeric } from '../market-math.js';
import { disabledEngine, setupContract, strategyContext, waitEngine } from './strategy-common.js';

export const RANGE_ENGINE = 'RANGE_MEAN_REVERSION';

function zoneSupport(result, direction, price) {
  const concepts = result?.marketConcepts || {};
  const zones = [
    ...(Array.isArray(concepts.nearestOrderBlocks) ? concepts.nearestOrderBlocks : []),
    ...(Array.isArray(concepts.nearestFairValueGaps) ? concepts.nearestFairValueGaps : [])
  ].filter(zone => zone && zone.status !== 'INVALIDATED');
  return zones.find(zone => {
    const zoneDirection = String(zone.direction || '').toUpperCase();
    const middle = (Number(zone.top) + Number(zone.bottom)) / 2;
    return Number.isFinite(middle)
      && (direction > 0 ? zoneDirection.includes('BULL') && middle <= price : zoneDirection.includes('BEAR') && middle >= price);
  }) || null;
}

export function evaluateRangeMeanReversion(input = {}) {
  const activeRegime = String(input?.activeRegime || input?.regime?.regime || 'TRANSITION').toUpperCase();
  if (activeRegime !== 'RANGING') return disabledEngine(RANGE_ENGINE, 'RANGING', activeRegime);
  const context = strategyContext(input);
  if (context.values.length < 100 || !context.current || !context.previous) {
    return waitEngine(RANGE_ENGINE, 'RANGING', 'Data M15 belum cukup untuk membentuk batas range.');
  }

  const window = context.values.slice(-32, -1);
  const rangeHigh = Math.max(...window.map(candle => candle.high));
  const rangeLow = Math.min(...window.map(candle => candle.low));
  const width = Math.max(rangeHigh - rangeLow, context.atr);
  const location = clamp((context.price - rangeLow) / width, 0, 1);
  const direction = location <= 0.30 ? 1 : location >= 0.70 ? -1 : 0;
  const adx = numeric(context.regime?.features?.adx, 0);
  const rsi = numeric(context.rsi.at(-1), 50);
  const candleRange = Math.max(context.current.high - context.current.low, 1e-9);
  const lowerWick = (Math.min(context.current.open, context.current.close) - context.current.low) / candleRange;
  const upperWick = (context.current.high - Math.max(context.current.open, context.current.close)) / candleRange;
  const rejection = direction > 0
    ? lowerWick >= 0.30 && context.current.close > context.current.open
    : direction < 0
      ? upperWick >= 0.30 && context.current.close < context.current.open
      : false;
  const rsiValid = direction > 0 ? rsi <= 45 : direction < 0 ? rsi >= 55 : false;
  const emaCompression = numeric(context.regime?.features?.emaCompression, 0);
  const rangeScore = numeric(context.regime?.health?.rangeProbability, numeric(context.regime?.probabilities?.RANGING, 0));
  const zone = direction ? zoneSupport(context.result, direction, context.price) : null;
  const edgeDistance = direction > 0 ? location : direction < 0 ? 1 - location : 1;
  const insideRange = context.current.close <= rangeHigh && context.current.close >= rangeLow;

  const quality = Math.round(clamp(
    (direction ? 20 : 0)
      + clamp((22 - adx) / 12, 0, 1) * 16
      + clamp((0.34 - edgeDistance) / 0.34, 0, 1) * 18
      + (rejection ? 18 : 0)
      + (rsiValid ? 12 : 0)
      + emaCompression * 8
      + (zone ? 8 : 0)
      + rangeScore * 0.12
      - numeric(context.regime?.shift?.risk, 0) * 0.18,
    0,
    100
  ));

  const reasons = [];
  if (!direction) reasons.push('Harga masih di tengah range; mean reversion hanya aktif di sisi luar.');
  if (adx > 23) reasons.push(`ADX ${adx.toFixed(1)} terlalu tinggi untuk strategi range.`);
  if (!insideRange) reasons.push('Harga sudah close di luar batas range; jangan fade breakout.');
  if (!rejection) reasons.push('Belum ada wick rejection dan close kembali ke dalam range.');
  if (!rsiValid) reasons.push(`RSI ${rsi.toFixed(1)} belum mendukung reversal dari sisi range.`);

  const prerequisite = direction && adx <= 23 && insideRange && edgeDistance <= 0.34;
  if (!prerequisite || quality < 62) {
    return {
      ...waitEngine(RANGE_ENGINE, 'RANGING', reasons.length ? reasons : 'Range terbaca, tetapi harga belum berada di area reversal.', {
        rangeHigh, rangeLow, location, adx, rsi, rejection
      }),
      quality,
      status: prerequisite ? 'WATCH' : 'WAIT'
    };
  }

  const stop = direction > 0 ? rangeLow - context.atr * 0.20 : rangeHigh + context.atr * 0.20;
  const riskAtr = Math.abs(context.price - stop) / context.atr;
  if (riskAtr > 2.20) {
    reasons.push(`Stop range terlalu lebar: ${riskAtr.toFixed(2)} ATR.`);
    return { ...waitEngine(RANGE_ENGINE, 'RANGING', reasons, { rangeHigh, rangeLow, location, riskAtr }), quality, status: 'WATCH' };
  }
  const trigger = rejection && rsiValid;
  const status = trigger && quality >= 70 ? 'READY' : 'WATCH';
  const setup = setupContract({
    id: `REGIME:RANGE:${context.current.time}:${context.price.toFixed(3)}`,
    type: 'RANGE REVERSAL',
    strategy: RANGE_ENGINE,
    direction,
    entry: context.price,
    stop,
    targetR: 1.5,
    quality,
    status,
    timestamp: context.current.time > 10_000_000_000 ? context.current.time : context.current.time * 1000,
    reason: `Harga berada di ${direction > 0 ? 'demand/support' : 'supply/resistance'} range, menunggu rotasi menuju equilibrium atau sisi lawan.`,
    metadata: { source: 'SUPPLY_DEMAND_MEAN_REVERSION', rangeHigh, rangeLow, location, adx, rsi, zone, riskAtr }
  });

  return {
    engine: RANGE_ENGINE,
    requiredRegime: 'RANGING',
    enabled: true,
    status,
    direction: direction > 0 ? 'BUY' : 'SELL',
    quality,
    setup: status === 'READY' ? setup : null,
    watchSetup: setup,
    reasons: reasons.length ? reasons : ['Harga menyentuh sisi range dan memberi rejection yang valid.'],
    metrics: { rangeHigh, rangeLow, location, adx, rsi, rejection, riskAtr, zone: Boolean(zone) }
  };
}
