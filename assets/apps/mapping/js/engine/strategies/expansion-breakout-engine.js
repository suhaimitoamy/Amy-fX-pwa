import { clamp, numeric } from '../market-math.js';
import { disabledEngine, setupContract, strategyContext, waitEngine } from './strategy-common.js';

export const EXPANSION_ENGINE = 'BREAKOUT_CONTINUATION';

function findImpulse(values, atr) {
  for (let offset = 0; offset < Math.min(4, values.length - 21); offset += 1) {
    const index = values.length - 1 - offset;
    const candle = values[index];
    const history = values.slice(index - 20, index);
    const high = Math.max(...history.map(item => item.high));
    const low = Math.min(...history.map(item => item.low));
    const range = Math.max(candle.high - candle.low, 1e-9);
    const body = Math.abs(candle.close - candle.open);
    const bodyFraction = body / range;
    const direction = candle.close > high ? 1 : candle.close < low ? -1 : 0;
    if (direction && bodyFraction >= 0.52 && range >= atr * 0.95) {
      return { index, offset, candle, direction, level: direction > 0 ? high : low, bodyFraction, rangeAtr: range / atr };
    }
  }
  return null;
}

export function evaluateExpansionBreakout(input = {}) {
  const activeRegime = String(input?.activeRegime || input?.regime?.regime || 'TRANSITION').toUpperCase();
  if (activeRegime !== 'EXPANSION') return disabledEngine(EXPANSION_ENGINE, 'EXPANSION', activeRegime);
  const context = strategyContext(input);
  if (context.values.length < 100 || !context.current || !context.previous) {
    return waitEngine(EXPANSION_ENGINE, 'EXPANSION', 'Data M15 belum cukup untuk mengukur breakout dan retest.');
  }

  const impulse = findImpulse(context.values, context.atr);
  if (!impulse) return waitEngine(EXPANSION_ENGINE, 'EXPANSION', 'Belum ada candle displacement yang close di luar range 20 candle.');
  const direction = impulse.direction;
  const atrRatio = numeric(context.regime?.features?.atrRatio, 1);
  const adx = numeric(context.regime?.features?.adx, 0);
  const displacement = numeric(context.regime?.features?.displacement, impulse.bodyFraction);
  const retestDistance = Math.abs(context.price - impulse.level) / context.atr;
  const holdingBreak = direction > 0 ? context.current.close >= impulse.level : context.current.close <= impulse.level;
  const retest = impulse.offset > 0 && retestDistance <= 0.45 && holdingBreak;
  const continuationClose = direction > 0
    ? context.current.close > context.previous.high && context.current.close > context.current.open
    : context.current.close < context.previous.low && context.current.close < context.current.open;
  const htfAligned = !context.htfDirection || context.htfDirection === direction;
  const notExhausted = Math.abs(context.price - impulse.level) / context.atr <= 1.8;

  const quality = Math.round(clamp(
    impulse.bodyFraction * 22
      + clamp((impulse.rangeAtr - 0.8) / 1.2, 0, 1) * 16
      + clamp((atrRatio - 0.9) / 0.8, 0, 1) * 16
      + clamp((adx - 15) / 25, 0, 1) * 12
      + displacement * 12
      + (holdingBreak ? 10 : 0)
      + (retest ? 8 : 0)
      + (continuationClose ? 8 : 0)
      + (htfAligned ? 8 : 0)
      - (notExhausted ? 0 : 18)
      - numeric(context.regime?.shift?.risk, 0) * 0.16,
    0,
    100
  ));

  const reasons = [];
  if (!holdingBreak) reasons.push('Harga kembali close ke dalam range; breakout belum bertahan.');
  if (!htfAligned) reasons.push('Arah breakout berlawanan dengan konteks HTF.');
  if (!notExhausted) reasons.push('Harga sudah terlalu jauh dari breakout level; jangan mengejar expansion.');
  if (!retest && impulse.offset > 0) reasons.push(`Retest breakout belum masuk area ${retestDistance.toFixed(2)} ATR.`);
  if (!continuationClose) reasons.push('Belum ada candle continuation setelah breakout/retest.');

  const prerequisite = holdingBreak && htfAligned && notExhausted && atrRatio >= 1.05;
  if (!prerequisite || quality < 64) {
    return {
      ...waitEngine(EXPANSION_ENGINE, 'EXPANSION', reasons.length ? reasons : 'Expansion terdeteksi, tetapi breakout belum dapat diikuti.', {
        direction, atrRatio, adx, retestDistance, impulse
      }),
      quality,
      status: prerequisite ? 'WATCH' : 'WAIT'
    };
  }

  const recent = context.values.slice(Math.max(0, impulse.index - 3));
  const stopAnchor = direction > 0
    ? Math.min(impulse.level, ...recent.map(candle => candle.low))
    : Math.max(impulse.level, ...recent.map(candle => candle.high));
  const stop = stopAnchor - direction * context.atr * 0.18;
  const riskAtr = Math.abs(context.price - stop) / context.atr;
  if (riskAtr < 0.30 || riskAtr > 2.30) {
    reasons.push(`Risk breakout ${riskAtr.toFixed(2)} ATR berada di luar batas 0,30–2,30 ATR.`);
    return { ...waitEngine(EXPANSION_ENGINE, 'EXPANSION', reasons, { atrRatio, adx, retestDistance, riskAtr }), quality, status: 'WATCH' };
  }

  const trigger = (impulse.offset === 0 && quality >= 80) || (retest && continuationClose);
  const status = trigger && quality >= 72 ? 'READY' : 'WATCH';
  const setup = setupContract({
    id: `REGIME:EXPANSION:${impulse.candle.time}:${context.price.toFixed(3)}`,
    type: 'EXPANSION BREAKOUT',
    strategy: EXPANSION_ENGINE,
    direction,
    entry: context.price,
    stop,
    targetR: 1.75,
    quality,
    status,
    timestamp: context.current.time > 10_000_000_000 ? context.current.time : context.current.time * 1000,
    reason: `Breakout ${direction > 0 ? 'bullish' : 'bearish'} bertahan di luar range; strategi hanya mengikuti continuation dan tidak melakukan fade.`,
    metadata: { source: 'BREAKOUT_VOLATILITY_CONTINUATION', impulse, atrRatio, adx, retest, continuationClose, riskAtr }
  });

  return {
    engine: EXPANSION_ENGINE,
    requiredRegime: 'EXPANSION',
    enabled: true,
    status,
    direction: direction > 0 ? 'BUY' : 'SELL',
    quality,
    setup: status === 'READY' ? setup : null,
    watchSetup: setup,
    reasons: reasons.length ? reasons : ['Displacement, breakout, HTF, dan continuation sudah selaras.'],
    metrics: { atrRatio, adx, retestDistance, retest, continuationClose, riskAtr, impulse }
  };
}
