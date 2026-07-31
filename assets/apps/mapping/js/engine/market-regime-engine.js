import {
  EPSILON,
  adxSeries,
  atrSeries,
  candleCharacter,
  clamp,
  cleanCandles,
  directionValue,
  emaSeries,
  median,
  movementStats,
  numeric,
  softmaxPercent
} from './market-math.js';

export const MARKET_REGIMES = Object.freeze([
  'TRENDING',
  'RANGING',
  'MANIPULATION',
  'EXPANSION',
  'TRANSITION'
]);

export const STRATEGY_BY_REGIME = Object.freeze({
  TRENDING: 'TREND_PULLBACK',
  RANGING: 'RANGE_MEAN_REVERSION',
  MANIPULATION: 'SWEEP_MSS_REVERSAL',
  EXPANSION: 'BREAKOUT_CONTINUATION',
  TRANSITION: 'NO_TRADE'
});

function eventIndex(event) {
  return numeric(event?.index ?? event?.availableIndex ?? event?.originIndex, -Infinity);
}

function conceptFeatures(marketConcepts, candles, atr) {
  const structure = marketConcepts?.structure || marketConcepts?.structureSnapshot || null;
  const last = structure?.lastEvent || structure?.last || null;
  const sweep = marketConcepts?.latestConfirmedSweep || structure?.lastSweep || null;
  const failed = structure?.lastFailedBreak || null;
  const transition = structure?.transitionBreak || null;
  const currentIndex = candles.length - 1;
  const age = event => currentIndex - eventIndex(event);
  const trend = directionValue(structure?.confirmedTrend || structure?.trend);
  const transitionDirection = directionValue(transition?.dir || transition?.direction);
  const lastDirection = directionValue(last?.dir || last?.direction);
  const displacement = last?.hasDisplacement
    ? 1
    : clamp(numeric(last?.bodyRatio, 0) * Math.max(0.4, numeric(last?.penetrationAtr, 0)), 0, 1);

  const recentWindow = candles.slice(-21, -1);
  const recentHigh = recentWindow.length ? Math.max(...recentWindow.map(candle => candle.high)) : NaN;
  const recentLow = recentWindow.length ? Math.min(...recentWindow.map(candle => candle.low)) : NaN;
  const current = candles.at(-1);
  const failedContinuation = trend > 0
    ? current.high >= recentHigh && current.close < recentHigh
    : trend < 0
      ? current.low <= recentLow && current.close > recentLow
      : false;

  return {
    trend,
    lastDirection,
    displacement,
    recentSweep: Boolean(sweep && age(sweep) <= 12),
    sweepAge: sweep ? age(sweep) : Infinity,
    failedBreak: Boolean(failed && age(failed) <= 8),
    oppositeTransition: Boolean(transition && age(transition) <= 10 && trend && transitionDirection && transitionDirection !== trend),
    transitionDirection,
    failedContinuation,
    eventAge: Math.min(age(last), age(sweep), age(failed), age(transition)),
    atr
  };
}

function htfFeatures(htfBiases = {}) {
  const weights = { M15: 0.10, M30: 0.15, H1: 0.25, H4: 0.30, D1: 0.15, W1: 0.20 };
  let weighted = 0;
  let coverageWeight = 0;
  const directions = [];
  for (const [timeframe, value] of Object.entries(htfBiases || {})) {
    const direction = directionValue(value);
    if (!direction) continue;
    const weight = weights[timeframe] || 0.10;
    weighted += direction * weight;
    coverageWeight += weight;
    directions.push(direction);
  }
  const score = coverageWeight ? weighted / coverageWeight : 0;
  const leader = Math.sign(score);
  const aligned = directions.filter(direction => direction === leader).length;
  return {
    score,
    direction: leader,
    consensus: directions.length ? aligned / directions.length : 0,
    disagreement: directions.length ? 1 - aligned / directions.length : 0,
    coverage: clamp(directions.length / 3, 0, 1)
  };
}

function dataRiskValue(freshness = {}) {
  const values = Object.values(freshness || {});
  if (!values.length) return 0;
  const stale = values.filter(value => String(value?.state || value?.status || value || '').toUpperCase().includes('STALE')).length;
  const cache = values.filter(value => String(value?.state || value?.status || value || '').toUpperCase().includes('CACHE')).length;
  const gaps = values.reduce((sum, value) => sum + Math.min(1, numeric(value?.gaps, 0) / 4), 0);
  return clamp((stale + cache * 0.45 + gaps * 0.35) / values.length, 0, 1);
}

function newsRiskValue(newsRisk) {
  const value = String(newsRisk || '').toUpperCase();
  if (value === 'HIGH') return 1;
  if (value === 'ELEVATED') return 0.6;
  if (value === 'UNKNOWN') return 0.25;
  return 0;
}

function healthStatus(health) {
  if (health.transitionRisk >= 72) return 'SHIFT_CONFIRMED';
  if (health.transitionRisk >= 55) return 'TRANSITION_RISK';
  if (health.transitionRisk >= 30) return 'EARLY_WARNING';
  return 'STABLE';
}

export function detectMarketRegimeV3({
  candles = [],
  tf = 'M15',
  htfBiases = {},
  marketConcepts = null,
  entryMap = null,
  newsRisk = 'NORMAL',
  freshness = {},
  currentPrice = null
} = {}) {
  const values = cleanCandles(candles);
  const insufficient = {
    version: '3.0.0-preview',
    source: 'AMY_MARKET_REGIME_V3',
    tf,
    status: 'INSUFFICIENT_DATA',
    regime: 'TRANSITION',
    probabilities: Object.fromEntries(MARKET_REGIMES.map(name => [name, name === 'TRANSITION' ? 100 : 0])),
    confidence: 0,
    strategy: STRATEGY_BY_REGIME.TRANSITION,
    strategyGateEnabled: true,
    automaticTradeExecution: false,
    shift: { risk: 100, status: 'TRANSITION_RISK', confirmed: false, reasons: ['Minimal 120 candle tertutup diperlukan.'] },
    health: { trendStrength: 0, trendStability: 0, transitionRisk: 100, manipulationRisk: 0, rangeProbability: 0, expansionProbability: 0 },
    features: {},
    reasons: ['Data candle belum cukup untuk Market Regime Engine.'],
    entryMap
  };
  if (values.length < 120) return insufficient;

  const closes = values.map(candle => candle.close);
  const ema9 = emaSeries(closes, 9);
  const ema21 = emaSeries(closes, 21);
  const ema34 = emaSeries(closes, 34);
  const ema90 = emaSeries(closes, 90);
  const ema200 = emaSeries(closes, 200);
  const atrValues = atrSeries(values, 14);
  const adxValues = adxSeries(values, 14);
  const atr = numeric(atrValues.at(-1), 0);
  if (!(atr > 0)) return { ...insufficient, reasons: ['ATR14 belum tersedia.'] };

  const current = values.at(-1);
  const previousAtrBaseline = median(atrValues.slice(-100, -10).filter(Number.isFinite)) || atr;
  const atrRatio = atr / Math.max(previousAtrBaseline, EPSILON);
  const movement20 = movementStats(values, 20);
  const movement10 = movementStats(values, 10);
  const priorMicro = movementStats(values.slice(0, -5), 5);
  const micro = movementStats(values, 5);
  const character = candleCharacter(values, 12);
  const concepts = conceptFeatures(marketConcepts, values, atr);
  const htf = htfFeatures(htfBiases);
  const dataRisk = dataRiskValue(freshness);
  const news = newsRiskValue(newsRisk);

  const emaSpread = Math.abs(ema21.at(-1) - ema90.at(-1)) / atr;
  const priorEmaSpread = Math.abs(ema21.at(-7) - ema90.at(-7)) / atr;
  const emaCompression = clamp((priorEmaSpread - emaSpread) / Math.max(priorEmaSpread, 0.15), 0, 1);
  const emaSlope = (ema21.at(-1) - ema21.at(-6)) / atr;
  const previousSlope = (ema21.at(-6) - ema21.at(-11)) / atr;
  const direction = concepts.trend || Math.sign(ema21.at(-1) - ema90.at(-1));
  const slopeDecay = direction ? clamp(direction * (previousSlope - emaSlope) / 0.9, 0, 1) : 0;
  const oppositeImpulse = direction ? clamp(-direction * micro.net / Math.max(atr * 1.2, EPSILON), 0, 1) : 0;
  const efficiencyDrop = clamp(priorMicro.efficiency - micro.efficiency, 0, 1);
  const htfConflict = direction && htf.direction && direction !== htf.direction ? 1 : 0;
  const adx = numeric(adxValues.at(-1), 0);
  const adxTrend = clamp((adx - 15) / 25, 0, 1);
  const rangeWindow = values.slice(-20);
  const rangeAtr = (Math.max(...rangeWindow.map(candle => candle.high)) - Math.min(...rangeWindow.map(candle => candle.low))) / atr;
  const recentRange = Math.max(current.high - current.low, EPSILON);
  const bodyFraction = Math.abs(current.close - current.open) / recentRange;
  const closeLocation = (current.close - current.low) / recentRange;
  const previousHigh = Math.max(...values.slice(-21, -1).map(candle => candle.high));
  const previousLow = Math.min(...values.slice(-21, -1).map(candle => candle.low));
  const breakout = current.close > previousHigh || current.close < previousLow;
  const breakoutDirection = current.close > previousHigh ? 1 : current.close < previousLow ? -1 : 0;
  const expansionCandle = bodyFraction >= 0.58 && (breakout || recentRange / atr >= 1.25);

  let transitionRisk = 0;
  const shiftReasons = [];
  const addRisk = (condition, weight, reason) => {
    const amount = typeof condition === 'number' ? clamp(condition, 0, 1) : condition ? 1 : 0;
    if (!amount) return;
    transitionRisk += weight * amount;
    shiftReasons.push(reason);
  };
  addRisk(concepts.oppositeTransition, 26, 'Internal shift bergerak berlawanan dengan tren terkonfirmasi.');
  addRisk(concepts.failedBreak, 22, 'Break terakhir gagal dipertahankan.');
  addRisk(concepts.failedContinuation, 18, 'Kelanjutan pada ekstrem terbaru gagal dipertahankan.');
  addRisk(concepts.recentSweep && concepts.displacement < 0.45, 12, 'Sweep terbaru belum diikuti displacement yang kuat.');
  addRisk(oppositeImpulse, 16, 'Dorongan mikro bergerak berlawanan dengan tren aktif.');
  addRisk(slopeDecay, 13, 'Kemiringan EMA melambat dibanding jendela sebelumnya.');
  addRisk(efficiencyDrop, 10, 'Efisiensi gerak mikro menurun.');
  addRisk(emaCompression, 11, 'Jarak EMA menyempit.');
  addRisk(htf.disagreement, 10, 'Arah lintas timeframe mulai berbeda.');
  addRisk(htfConflict, 10, 'Struktur lokal berlawanan dengan konteks timeframe tinggi.');
  addRisk(movement20.alternation, 7, 'Pergantian arah candle meningkat.');
  addRisk(dataRisk, 15, 'Kualitas data tidak sepenuhnya fresh.');
  addRisk(news * clamp((atrRatio - 1) / 0.7, 0, 1), 10, 'Risiko berita muncul bersama lonjakan volatilitas.');

  const baseTrendQuality = clamp(
    0.30 * adxTrend
      + 0.24 * movement20.efficiency
      + 0.18 * clamp(emaSpread / 1.5, 0, 1)
      + 0.16 * clamp(Math.abs(emaSlope) / 1.1, 0, 1)
      + 0.12 * htf.consensus,
    0,
    1
  );
  if (!concepts.oppositeTransition && !concepts.failedBreak) transitionRisk *= 0.40 + 0.60 * baseTrendQuality;
  if (baseTrendQuality < 0.25) transitionRisk = Math.min(transitionRisk, 45);
  transitionRisk = Math.round(clamp(transitionRisk, 0, 100));

  const trendStrength = Math.round(clamp(baseTrendQuality * 100 - transitionRisk * 0.20, 0, 100));
  const trendStability = Math.round(clamp(
    trendStrength * 0.72 + htf.consensus * 22 - emaCompression * 22 - movement20.alternation * 18 - transitionRisk * 0.22,
    0,
    100
  ));
  const manipulationRisk = Math.round(clamp(
    (concepts.recentSweep ? 38 : 0)
      + character.wickDominance * 28
      + movement20.alternation * 18
      + (concepts.failedBreak ? 18 : 0)
      + (concepts.failedContinuation ? 12 : 0)
      - concepts.displacement * 12,
    0,
    100
  ));
  const expansionStrength = Math.round(clamp(
    clamp((atrRatio - 0.95) / 0.75, 0, 1) * 32
      + character.bodyEfficiency * 22
      + movement10.efficiency * 20
      + concepts.displacement * 16
      + (expansionCandle ? 18 : 0)
      - movement20.alternation * 10,
    0,
    100
  ));
  const rangeStrength = Math.round(clamp(
    (1 - baseTrendQuality) * 38
      + movement20.alternation * 22
      + character.wickDominance * 18
      + clamp((2.7 - rangeAtr) / 2.7, 0, 1) * 18
      + clamp((1.08 - atrRatio) / 0.45, 0, 1) * 12
      - expansionStrength * 0.18,
    0,
    100
  ));

  const scores = {
    TRENDING: 0.20 + trendStrength / 42 + trendStability / 85 - transitionRisk / 85,
    RANGING: 0.15 + rangeStrength / 43 - expansionStrength / 120,
    MANIPULATION: 0.10 + manipulationRisk / 40 + (concepts.recentSweep ? 0.45 : 0) + (concepts.failedBreak ? 0.35 : 0),
    EXPANSION: 0.10 + expansionStrength / 40 + (breakout ? 0.35 : 0) + clamp((atrRatio - 1) / 0.8, 0, 1) * 0.35,
    TRANSITION: 0.10 + transitionRisk / 38 + emaCompression * 0.35 + htf.disagreement * 0.30
  };
  const probabilities = softmaxPercent(scores);
  let regime = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0];
  if (transitionRisk >= 60 && probabilities.TRANSITION >= Math.max(20, probabilities[regime] - 10)) regime = 'TRANSITION';
  if (concepts.recentSweep && manipulationRisk >= 62 && probabilities.MANIPULATION >= probabilities[regime] - 7) regime = 'MANIPULATION';
  if (expansionCandle && expansionStrength >= 65 && probabilities.EXPANSION >= probabilities[regime] - 7) regime = 'EXPANSION';

  const sorted = Object.values(probabilities).sort((a, b) => b - a);
  const confidence = Math.round(clamp((sorted[0] - sorted[1]) * 1.8 + sorted[0] * 0.65, 0, 92));
  const health = {
    trendStrength,
    trendStability,
    transitionRisk,
    manipulationRisk,
    rangeProbability: probabilities.RANGING,
    expansionProbability: probabilities.EXPANSION
  };
  const shiftStatus = healthStatus(health);
  const confirmedShift = Boolean(concepts.oppositeTransition && (concepts.failedBreak || htfConflict || emaCompression >= 0.55) && transitionRisk >= 60);
  if (confirmedShift) regime = 'TRANSITION';

  const reasons = [];
  reasons.push(`Regime ${regime} memimpin dengan ${probabilities[regime]} dari 100 poin distribusi.`);
  if (regime === 'TRENDING') reasons.push(`Trend strength ${trendStrength}/100 dan stability ${trendStability}/100.`);
  if (regime === 'RANGING') reasons.push(`EMA/arah kurang efisien dan rotasi candle mendominasi; range score ${rangeStrength}/100.`);
  if (regime === 'EXPANSION') reasons.push(`ATR ratio ${atrRatio.toFixed(2)} dan expansion strength ${expansionStrength}/100.`);
  if (regime === 'MANIPULATION') reasons.push(`Sweep/failed continuation dan wick menghasilkan manipulation risk ${manipulationRisk}/100.`);
  if (transitionRisk >= 30) reasons.push(`Transition risk ${transitionRisk}/100: ${shiftReasons[0] || 'karakter market mulai berubah.'}`);

  return {
    version: '3.0.0-preview',
    source: 'AMY_MARKET_REGIME_V3',
    tf,
    status: 'READY',
    calculatedAt: numeric(values.at(-1)?.time, Date.now()),
    price: numeric(currentPrice, current.close),
    regime,
    probabilities,
    confidence,
    confidenceMeaning: 'REGIME_CLARITY_SCORE_NOT_WIN_PROBABILITY',
    strategy: STRATEGY_BY_REGIME[regime],
    strategyGateEnabled: true,
    automaticTradeExecution: false,
    shift: {
      risk: transitionRisk,
      status: confirmedShift ? 'SHIFT_CONFIRMED' : shiftStatus,
      confirmed: confirmedShift,
      warningRecommended: transitionRisk >= 30,
      blockRecommended: confirmedShift || regime === 'TRANSITION' || transitionRisk >= 72,
      reasons: shiftReasons.slice(0, 5)
    },
    health,
    reasons: reasons.slice(0, 5),
    features: {
      atr,
      atrRatio,
      adx,
      rangeAtr,
      bodyFraction,
      closeLocation,
      breakout,
      breakoutDirection,
      expansionCandle,
      directionalEfficiency: movement20.efficiency,
      microEfficiency: micro.efficiency,
      efficiencyDrop,
      alternation: movement20.alternation,
      bodyEfficiency: character.bodyEfficiency,
      wickDominance: character.wickDominance,
      ema9: ema9.at(-1),
      ema21: ema21.at(-1),
      ema34: ema34.at(-1),
      ema90: ema90.at(-1),
      ema200: ema200.at(-1),
      emaSpreadAtr: emaSpread,
      emaCompression,
      emaSlopeAtr: emaSlope,
      slopeDecay,
      oppositeImpulse,
      htfScore: htf.score,
      htfDirection: htf.direction,
      htfConsensus: htf.consensus,
      htfDisagreement: htf.disagreement,
      localDirection: direction,
      recentSweep: concepts.recentSweep,
      failedBreak: concepts.failedBreak,
      failedContinuation: concepts.failedContinuation,
      oppositeTransition: concepts.oppositeTransition,
      displacement: concepts.displacement,
      dataRisk,
      newsRisk: news,
      rangeStrength,
      expansionStrength
    },
    entryMap
  };
}

export const detectMarketRegimeV2 = detectMarketRegimeV3;

export function regimeSummary(result) {
  if (!result || result.status !== 'READY') {
    return { headline: 'DATA BELUM CUKUP', action: 'WAIT', strategy: 'NO TRADE', reason: result?.reasons?.[0] || 'Mapping belum siap.' };
  }
  return {
    headline: `${result.regime.replaceAll('_', ' ')} · ${result.shift.status.replaceAll('_', ' ')}`,
    action: result.shift.blockRecommended ? 'WAIT' : 'ROUTE',
    strategy: result.strategy.replaceAll('_', ' '),
    reason: result.reasons?.[0] || 'Belum ada alasan tambahan.'
  };
}
