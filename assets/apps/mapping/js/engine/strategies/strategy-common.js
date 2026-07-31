import {
  EPSILON,
  atrSeries,
  clamp,
  cleanCandles,
  directionValue,
  emaSeries,
  numeric,
  rsiSeries
} from '../market-math.js';

export function strategyContext({ candles = [], result = null, regime = null, currentPrice = null } = {}) {
  const values = cleanCandles(candles);
  const closes = values.map(candle => candle.close);
  const atrValues = atrSeries(values, 14);
  const atr = numeric(regime?.features?.atr, atrValues.at(-1));
  const price = numeric(currentPrice, numeric(result?.price, values.at(-1)?.close));
  const ema9 = emaSeries(closes, 9);
  const ema21 = emaSeries(closes, 21);
  const ema34 = emaSeries(closes, 34);
  const ema90 = emaSeries(closes, 90);
  const ema200 = emaSeries(closes, 200);
  const rsi = rsiSeries(closes, 14);
  const current = values.at(-1) || null;
  const previous = values.at(-2) || null;
  const structureDirection = directionValue(result?.st?.confirmedTrend || result?.st?.trend);
  const htfDirection = Math.sign(numeric(regime?.features?.htfScore, 0));
  const contextDirection = htfDirection || structureDirection || Math.sign(numeric(regime?.features?.emaSlopeAtr, 0));
  return {
    values,
    closes,
    atrValues,
    atr: Math.max(numeric(atr, 0), Math.abs(price || 1) * 0.00025, EPSILON),
    price,
    current,
    previous,
    ema9,
    ema21,
    ema34,
    ema90,
    ema200,
    rsi,
    structureDirection,
    htfDirection,
    contextDirection,
    result,
    regime
  };
}

export function setupContract({
  id,
  type,
  strategy,
  direction,
  entry,
  stop,
  targetR = 1.5,
  quality = 0,
  reason = '',
  timestamp = Date.now(),
  status = 'WATCH',
  metadata = {}
}) {
  const dir = direction > 0 ? 'BUY' : direction < 0 ? 'SELL' : 'WAIT';
  const risk = direction > 0 ? entry - stop : direction < 0 ? stop - entry : 0;
  if (!direction || !(risk > 0)) return null;
  const tp1 = entry + direction * risk;
  const tp2 = entry + direction * risk * targetR;
  return {
    id,
    type,
    strategy,
    tf: 'M15',
    dir,
    direction: direction > 0 ? 'BULLISH' : 'BEARISH',
    status,
    live: true,
    timestamp,
    entry,
    entryLow: entry,
    entryHigh: entry,
    initialSl: stop,
    sl: stop,
    tp1,
    tp2,
    risk,
    score: Math.round(clamp(quality, 0, 100)),
    scoreMode: 'QUALITY_SCORE',
    grade: quality >= 80 ? 'A' : quality >= 65 ? 'B' : 'C',
    executionMode: 'REGIME_ROUTED_M15',
    reason,
    lifecycle: { status, live: true, startTime: timestamp },
    conflictCheck: {
      hasFatalConflict: false,
      conflictLevel: 'NONE',
      recommendation: status,
      rr: targetR,
      plannedEntry: entry,
      mainTarget: tp2
    },
    components: metadata
  };
}

export function disabledEngine(name, requiredRegime, activeRegime) {
  return {
    engine: name,
    requiredRegime,
    enabled: false,
    status: 'DISABLED',
    direction: 'WAIT',
    quality: 0,
    setup: null,
    reasons: [`Dinonaktifkan karena regime aktif ${activeRegime}, bukan ${requiredRegime}.`]
  };
}

export function waitEngine(name, requiredRegime, reasons, metrics = {}) {
  return {
    engine: name,
    requiredRegime,
    enabled: true,
    status: 'WAIT',
    direction: 'WAIT',
    quality: 0,
    setup: null,
    reasons: Array.isArray(reasons) ? reasons : [reasons],
    metrics
  };
}
