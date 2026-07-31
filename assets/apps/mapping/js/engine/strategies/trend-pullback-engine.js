import { clamp, numeric } from '../market-math.js';
import { disabledEngine, setupContract, strategyContext, waitEngine } from './strategy-common.js';

export const TREND_ENGINE = 'TREND_PULLBACK';

export function evaluateTrendPullback(input = {}) {
  const activeRegime = String(input?.activeRegime || input?.regime?.regime || 'TRANSITION').toUpperCase();
  if (activeRegime !== 'TRENDING') return disabledEngine(TREND_ENGINE, 'TRENDING', activeRegime);
  const context = strategyContext(input);
  if (context.values.length < 210 || !context.current || !context.previous) {
    return waitEngine(TREND_ENGINE, 'TRENDING', 'Data M15 belum cukup untuk EMA200 dan struktur pullback.');
  }

  const direction = context.contextDirection;
  if (!direction) return waitEngine(TREND_ENGINE, 'TRENDING', 'HTF dan struktur belum memiliki arah yang sama.');
  const index = context.values.length - 1;
  const ema9 = context.ema9[index];
  const ema21 = context.ema21[index];
  const ema34 = context.ema34[index];
  const ema90 = context.ema90[index];
  const ema200 = context.ema200[index];
  const rsi = numeric(context.rsi[index], 50);
  const adx = numeric(context.regime?.features?.adx, 0);
  const aligned = direction > 0
    ? ema21 > ema34 && ema34 > ema90 && context.price > ema200
    : ema21 < ema34 && ema34 < ema90 && context.price < ema200;
  const pullbackDistance = Math.min(Math.abs(context.price - ema21), Math.abs(context.price - ema34)) / context.atr;
  const pullbackValid = pullbackDistance <= 0.65;
  const rsiValid = direction > 0 ? rsi >= 46 && rsi <= 70 : rsi <= 54 && rsi >= 30;
  const momentumTrigger = direction > 0
    ? (context.current.close > context.previous.high || (ema9 > ema21 && context.ema9[index - 1] <= context.ema21[index - 1]))
    : (context.current.close < context.previous.low || (ema9 < ema21 && context.ema9[index - 1] >= context.ema21[index - 1]));
  const structureAligned = !context.structureDirection || context.structureDirection === direction;
  const htfAligned = !context.htfDirection || context.htfDirection === direction;

  const quality = Math.round(clamp(
    (aligned ? 24 : 0)
      + clamp((adx - 15) / 20, 0, 1) * 18
      + (pullbackValid ? 18 : Math.max(0, 12 - pullbackDistance * 8))
      + (rsiValid ? 12 : 0)
      + (structureAligned ? 12 : 0)
      + (htfAligned ? 10 : 0)
      + (momentumTrigger ? 14 : 0)
      - numeric(context.regime?.shift?.risk, 0) * 0.22,
    0,
    100
  ));

  const reasons = [];
  if (!aligned) reasons.push('EMA 21/34/90 dan EMA200 belum tersusun searah.');
  if (adx < 18) reasons.push(`ADX ${adx.toFixed(1)} masih di bawah 18.`);
  if (!pullbackValid) reasons.push(`Harga belum pullback ke value EMA; jarak ${pullbackDistance.toFixed(2)} ATR.`);
  if (!rsiValid) reasons.push(`RSI ${rsi.toFixed(1)} berada di luar band momentum pullback.`);
  if (!structureAligned || !htfAligned) reasons.push('Struktur lokal atau HTF belum mendukung arah trend.');
  if (!momentumTrigger) reasons.push('Timing Kronos belum aktif: tunggu cross EMA9/21 atau break candle momentum.');

  const prerequisite = aligned && adx >= 18 && pullbackValid && rsiValid && structureAligned && htfAligned;
  if (!prerequisite || quality < 62) {
    return {
      ...waitEngine(TREND_ENGINE, 'TRENDING', reasons.length ? reasons : 'Trend ada, tetapi pullback belum berkualitas.', {
        adx, rsi, pullbackDistance, aligned, momentumTrigger
      }),
      quality,
      status: prerequisite ? 'WATCH' : 'WAIT'
    };
  }

  const recent = context.values.slice(-10);
  const protectedSwing = direction > 0
    ? Math.min(...recent.map(candle => candle.low))
    : Math.max(...recent.map(candle => candle.high));
  const stop = protectedSwing - direction * context.atr * 0.20;
  const riskAtr = Math.abs(context.price - stop) / context.atr;
  if (riskAtr < 0.35 || riskAtr > 2.20) {
    reasons.push(`Stop struktural ${riskAtr.toFixed(2)} ATR berada di luar batas 0,35–2,20 ATR.`);
    return { ...waitEngine(TREND_ENGINE, 'TRENDING', reasons, { adx, rsi, pullbackDistance, riskAtr }), quality, status: 'WATCH' };
  }

  const status = momentumTrigger && quality >= 72 ? 'READY' : 'WATCH';
  const setup = setupContract({
    id: `REGIME:TREND:${context.current.time}:${context.price.toFixed(3)}`,
    type: 'TREND PULLBACK',
    strategy: TREND_ENGINE,
    direction,
    entry: context.price,
    stop,
    targetR: 1.75,
    quality,
    status,
    timestamp: context.current.time > 10_000_000_000 ? context.current.time : context.current.time * 1000,
    reason: `Trend ${direction > 0 ? 'bullish' : 'bearish'}; pullback ke EMA value dengan ADX ${adx.toFixed(1)} dan timing momentum ${momentumTrigger ? 'aktif' : 'menunggu'}.`,
    metadata: { source: 'KRONOS_TIMING_GCX_RISK', adx, rsi, pullbackDistance, emaAlignment: aligned, riskAtr }
  });

  return {
    engine: TREND_ENGINE,
    requiredRegime: 'TRENDING',
    enabled: true,
    status,
    direction: direction > 0 ? 'BUY' : 'SELL',
    quality,
    setup: status === 'READY' ? setup : null,
    watchSetup: setup,
    reasons: reasons.length ? reasons : ['Trend, HTF, EMA, pullback, dan momentum sudah selaras.'],
    metrics: { adx, rsi, pullbackDistance, riskAtr, aligned, momentumTrigger }
  };
}
