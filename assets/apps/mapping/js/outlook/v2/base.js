export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

export const OUTLOOK_HORIZONS = [
  {
    id: 'INTRADAY',
    label: '1–4 Jam',
    horizonMs: 4 * HOUR,
    weights: { M15: 0.45, M30: 0.25, H1: 0.25, H4: 0.05 },
    contextTfs: ['M15', 'M30', 'H1'],
    levelTfs: ['M15', 'M30', 'H1']
  },
  {
    id: 'SESSION',
    label: 'Sesi Berjalan',
    horizonMs: 8 * HOUR,
    weights: { M30: 0.2, H1: 0.45, H4: 0.35 },
    contextTfs: ['H1', 'M30', 'H4'],
    levelTfs: ['M30', 'H1', 'H4']
  },
  {
    id: 'DAILY',
    label: '24 Jam',
    horizonMs: DAY,
    weights: { H1: 0.15, H4: 0.45, D1: 0.4 },
    contextTfs: ['H4', 'D1', 'H1'],
    levelTfs: ['H1', 'H4', 'D1']
  }
];

export const num = (value, fallback = NaN) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const signOf = value => {
  const normalized = String(value || '').toUpperCase();
  if (normalized.includes('BULL')) return 1;
  if (normalized.includes('BEAR')) return -1;
  return 0;
};
export const directionName = score => Math.abs(score) < 0.18 ? 'RANGE' : score > 0 ? 'BULLISH' : 'BEARISH';

function trueRange(candle, previousClose) {
  if (!candle) return 0;
  const high = num(candle.high, 0);
  const low = num(candle.low, 0);
  if (!Number.isFinite(previousClose)) return Math.max(0, high - low);
  return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
}

export function localAtr(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < 2) return 0;
  const start = Math.max(1, candles.length - period);
  const values = [];
  for (let index = start; index < candles.length; index += 1) {
    values.push(trueRange(candles[index], num(candles[index - 1]?.close)));
  }
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function volatilityState(candles) {
  if (!Array.isArray(candles) || candles.length < 30) {
    return { atr: localAtr(candles), ratio: 1, recentRangeAtr: 0 };
  }
  const currentAtr = localAtr(candles, 14);
  const historical = [];
  for (let end = Math.max(16, candles.length - 70); end <= candles.length; end += 7) {
    historical.push(localAtr(candles.slice(0, end), 14));
  }
  const baseline = median(historical) || currentAtr || 1;
  const recent = candles.slice(-20);
  const high = Math.max(...recent.map(item => num(item.high, -Infinity)));
  const low = Math.min(...recent.map(item => num(item.low, Infinity)));
  return {
    atr: currentAtr,
    ratio: currentAtr > 0 ? currentAtr / baseline : 1,
    recentRangeAtr: currentAtr > 0 && Number.isFinite(high) && Number.isFinite(low) ? (high - low) / currentAtr : 0
  };
}

export function confirmedTrend(result) {
  return signOf(result?.st?.confirmedTrend || result?.st?.trend);
}

export function confirmedBreak(result) {
  const item = result?.st?.lastConfirmedBreak
    || (result?.st?.last?.breakType === 'VALID_BREAK' ? result.st.last : null);
  return item?.valid && !item.failed && item.breakType === 'VALID_BREAK' ? item : null;
}

function latestSweep(result) {
  return result?.st?.lastSweep
    || (result?.st?.last?.breakType === 'SWEEP_ONLY' ? result.st.last : null);
}

export function collectVotes(analyses, weights) {
  let score = 0;
  let maximum = 0;
  let agreeingWeight = 0;
  let presentWeight = 0;
  const entries = [];

  for (const [tf, weight] of Object.entries(weights || {})) {
    const result = analyses?.[tf];
    if (!result) continue;
    const trend = confirmedTrend(result);
    if (!trend) continue;
    const breakInfo = confirmedBreak(result);
    const failedBreak = Boolean(result?.st?.lastConfirmedBreak?.failed || result?.st?.lastFailedBreak);
    const reliability = failedBreak ? 0.45 : breakInfo && signOf(breakInfo.dir) === trend ? 1 : 0.78;
    const effectiveWeight = weight * reliability;
    score += trend * effectiveWeight;
    maximum += effectiveWeight;
    presentWeight += weight;
    entries.push({ tf, trend, weight: effectiveWeight });
  }

  const normalized = maximum > 0 ? clamp(score / maximum, -1, 1) : 0;
  const direction = Math.sign(normalized);
  for (const entry of entries) {
    if (entry.trend === direction) agreeingWeight += entry.weight;
  }
  return {
    normalized,
    direction,
    consensus: maximum > 0 ? agreeingWeight / maximum : 0,
    coverage: Object.values(weights || {}).reduce((sum, value) => sum + value, 0) > 0
      ? presentWeight / Object.values(weights || {}).reduce((sum, value) => sum + value, 0)
      : 0,
    entries
  };
}

export function relevantFreshness(freshness, tfs) {
  const values = tfs.map(tf => freshness?.[tf]).filter(Boolean);
  const stale = values.filter(item => String(item?.state || '').includes('STALE')).length;
  const cache = values.filter(item => String(item?.state || '').includes('CACHE')).length;
  return { stale, cache, total: values.length };
}

export function newsSeverity(newsRisk) {
  const value = String(newsRisk || 'UNKNOWN').toUpperCase();
  if (value === 'HIGH') return 1;
  if (value === 'ELEVATED') return 0.6;
  if (value === 'UNKNOWN') return 0.35;
  return 0;
}

export function detectMarketRegime({ analyses = {}, candlesByTf = {}, newsRisk = 'UNKNOWN', freshness = {} } = {}) {
  const trends = ['M15', 'M30', 'H1', 'H4', 'D1']
    .map(tf => confirmedTrend(analyses?.[tf]))
    .filter(Boolean);
  const consensus = trends.length
    ? Math.max(trends.filter(value => value === 1).length, trends.filter(value => value === -1).length) / trends.length
    : 0;
  const vol = volatilityState(candlesByTf.M15 || candlesByTf.H1 || []);
  const stale = Object.values(freshness || {}).some(item => String(item?.state || '').includes('STALE'));
  const hasTransition = Object.values(analyses || {}).some(result => {
    const sweep = latestSweep(result);
    const failed = result?.st?.lastFailedBreak;
    return Boolean(sweep || failed);
  });

  if (String(newsRisk).toUpperCase() === 'HIGH' && vol.ratio >= 1.2) return { id: 'NEWS_DRIVEN', label: 'NEWS-DRIVEN', consensus, ...vol };
  if (stale) return { id: 'DATA_RISK', label: 'DATA RISK', consensus, ...vol };
  if (vol.ratio >= 1.55) return { id: 'HIGH_VOLATILITY', label: 'HIGH VOLATILITY', consensus, ...vol };
  if (hasTransition || (consensus > 0 && consensus < 0.66)) return { id: 'TRANSITION', label: 'TRANSITION / REVERSAL RISK', consensus, ...vol };
  if (consensus >= 0.75 && vol.recentRangeAtr >= 2.8) return { id: 'TRENDING', label: 'TRENDING', consensus, ...vol };
  if (consensus <= 0.55 || (vol.recentRangeAtr > 0 && vol.recentRangeAtr < 2.2)) return { id: 'RANGING', label: 'RANGING', consensus, ...vol };
  return { id: 'BALANCED', label: 'BALANCED / MIXED', consensus, ...vol };
}

function sessionDuration(session, now) {
  const value = String(session?.id || session?.name || '').toUpperCase();
  if (!value || value.includes('OFF')) return 6 * HOUR;
  const date = new Date(now);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false
  });
  const [hour, minute] = formatter.format(date).split(':').map(Number);
  const currentMinutes = hour * 60 + minute;
  const endMinutes = value.includes('ASIA') ? 12 * 60
    : value.includes('LONDON') ? 17 * 60
      : value.includes('NEW') ? 23 * 60 : currentMinutes + 6 * 60;
  return clamp((endMinutes - currentMinutes) * 60 * 1000, HOUR, 8 * HOUR);
}

export function configuredHorizon(horizon, session, now) {
  return horizon.id === 'SESSION' ? { ...horizon, horizonMs: sessionDuration(session, now) } : horizon;
}

export function contextResult(config, analyses) {
  for (const tf of config.contextTfs) {
    if (analyses?.[tf]) return analyses[tf];
  }
  return null;
}
