import { HOUR, OUTLOOK_HORIZONS, num } from './base.js';

export function predictionSlot(outlook, now = Date.now(), session = {}) {
  if (outlook.id === 'INTRADAY') return `${outlook.id}:${Math.floor(now / HOUR)}`;
  if (outlook.id === 'SESSION') {
    const sessionId = String(session?.id || session?.name || 'OFF').replace(/\s+/g, '_').toUpperCase();
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(now));
    return `${outlook.id}:${date}:${sessionId}`;
  }
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(now));
  return `${outlook.id}:${date}`;
}

export function appendPredictionSnapshots(history, projection, { now = Date.now(), session = {} } = {}) {
  const output = Array.isArray(history) ? [...history] : [];
  if (!projection?.trackable) return output;
  for (const outlook of projection.outlooks || []) {
    const slot = predictionSlot(outlook, now, session);
    if (output.some(item => item.slot === slot)) continue;
    output.push({
      id: `${slot}:${Math.round(outlook.startPrice * 100)}`,
      slot,
      horizonId: outlook.id,
      horizonLabel: outlook.label,
      createdAt: now,
      expiresAt: outlook.expiresAt,
      startPrice: outlook.startPrice,
      direction: outlook.direction,
      probability: outlook.probability,
      target: outlook.primaryTarget,
      targetType: outlook.primaryTargetType,
      invalidation: outlook.invalidation,
      invalidationSource: outlook.invalidationSource,
      directionTolerance: outlook.directionTolerance,
      contextTf: outlook.contextTf,
      regime: outlook.regime,
      status: 'PENDING',
      maxHigh: outlook.startPrice,
      minLow: outlook.startPrice,
      finalPrice: null,
      directionCorrect: null,
      targetHit: false,
      invalidated: false
    });
  }
  return output.slice(-500);
}

function candlePoints(candlesByTf, createdAt, expiresAt, livePrice, now) {
  const preferred = candlesByTf.M1?.length ? candlesByTf.M1
    : candlesByTf.M5?.length ? candlesByTf.M5 : candlesByTf.M15 || [];
  const points = preferred
    .map(candle => ({
      time: num(candle.time) * 1000,
      high: num(candle.high),
      low: num(candle.low),
      close: num(candle.close)
    }))
    .filter(point => point.time >= createdAt && point.time <= Math.min(expiresAt, now))
    .sort((a, b) => a.time - b.time);
  if (Number.isFinite(num(livePrice)) && now >= createdAt) {
    points.push({ time: now, high: num(livePrice), low: num(livePrice), close: num(livePrice) });
  }
  return points;
}

function actualDirection(startPrice, finalPrice, tolerance) {
  const change = finalPrice - startPrice;
  if (Math.abs(change) <= tolerance) return 'RANGE';
  return change > 0 ? 'BULLISH' : 'BEARISH';
}

export function evaluatePredictionHistory(history, { candlesByTf = {}, livePrice, now = Date.now() } = {}) {
  return (Array.isArray(history) ? history : []).map(record => {
    if (record.status !== 'PENDING') return record;
    const points = candlePoints(candlesByTf, record.createdAt, record.expiresAt, livePrice, now);
    if (!points.length) return record;

    let maxHigh = num(record.maxHigh, record.startPrice);
    let minLow = num(record.minLow, record.startPrice);
    let targetAt = 0;
    let invalidAt = 0;

    for (const point of points) {
      maxHigh = Math.max(maxHigh, point.high);
      minLow = Math.min(minLow, point.low);
      if (!targetAt && Number.isFinite(num(record.target))) {
        if (record.direction === 'BULLISH' && point.high >= num(record.target)) targetAt = point.time;
        if (record.direction === 'BEARISH' && point.low <= num(record.target)) targetAt = point.time;
      }
      if (!invalidAt) {
        if (record.direction === 'BULLISH' && point.close <= num(record.invalidation)) invalidAt = point.time;
        if (record.direction === 'BEARISH' && point.close >= num(record.invalidation)) invalidAt = point.time;
        if (record.direction === 'RANGE' && record.invalidation) {
          if (point.close <= num(record.invalidation.lower) || point.close >= num(record.invalidation.upper)) invalidAt = point.time;
        }
      }
    }

    const finalPrice = points.at(-1).close;
    const tolerance = Math.max(num(record.directionTolerance, 0), record.startPrice * 0.0005, 0.5);
    const expired = now >= record.expiresAt;
    const targetFirst = targetAt && (!invalidAt || targetAt < invalidAt);
    const invalidFirst = invalidAt && (!targetAt || invalidAt <= targetAt);

    if (invalidFirst) {
      return { ...record, status: 'RESOLVED', outcome: 'INVALIDATED', resolvedAt: invalidAt, finalPrice, maxHigh, minLow, directionCorrect: false, targetHit: false, invalidated: true };
    }
    if (targetFirst) {
      return { ...record, status: 'RESOLVED', outcome: 'TARGET_HIT', resolvedAt: targetAt, finalPrice, maxHigh, minLow, directionCorrect: true, targetHit: true, invalidated: false };
    }
    if (!expired) return { ...record, finalPrice, maxHigh, minLow };

    const actual = actualDirection(record.startPrice, finalPrice, tolerance);
    return {
      ...record,
      status: 'RESOLVED',
      outcome: actual === record.direction ? 'DIRECTION_CORRECT' : 'DIRECTION_WRONG',
      resolvedAt: now,
      finalPrice,
      maxHigh,
      minLow,
      actualDirection: actual,
      directionCorrect: actual === record.direction,
      targetHit: false,
      invalidated: false,
      absoluteError: Number.isFinite(num(record.target)) ? Math.abs(num(record.target) - finalPrice) : null
    };
  });
}

export function predictionStats(history, minimumSample = 20) {
  const resolved = (Array.isArray(history) ? history : []).filter(item => item.status === 'RESOLVED');
  const summarize = items => {
    const count = items.length;
    const correct = items.filter(item => item.directionCorrect === true).length;
    const targetHits = items.filter(item => item.targetHit).length;
    const invalidated = items.filter(item => item.invalidated).length;
    return {
      count,
      ready: count >= minimumSample,
      needed: Math.max(0, minimumSample - count),
      directionalAccuracy: count ? correct / count * 100 : 0,
      targetHitRate: count ? targetHits / count * 100 : 0,
      invalidationRate: count ? invalidated / count * 100 : 0
    };
  };
  return {
    overall: summarize(resolved),
    byHorizon: Object.fromEntries(OUTLOOK_HORIZONS.map(horizon => [horizon.id, summarize(resolved.filter(item => item.horizonId === horizon.id))])),
    pending: (Array.isArray(history) ? history : []).filter(item => item.status === 'PENDING').length,
    recent: [...resolved].sort((a, b) => num(b.resolvedAt) - num(a.resolvedAt)).slice(0, 8)
  };
}
