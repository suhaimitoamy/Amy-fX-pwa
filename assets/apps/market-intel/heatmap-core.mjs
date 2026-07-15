const DEFAULT_SWING_WINDOW = 2;
const DEFAULT_MAX_ZONES_PER_SIDE = 6;

function number(value, fallback = NaN) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundToStep(value, step) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}

export function cleanHeatmapCandles(candles) {
  return (Array.isArray(candles) ? candles : [])
    .map((candle, index) => ({
      time: candle?.time ?? candle?.datetime ?? index,
      open: number(candle?.open),
      high: number(candle?.high),
      low: number(candle?.low),
      close: number(candle?.close),
      sourceIndex: index
    }))
    .filter(candle =>
      [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
      && candle.high >= Math.max(candle.open, candle.close, candle.low)
      && candle.low <= Math.min(candle.open, candle.close, candle.high)
    );
}

function trueRange(candle, previousClose) {
  if (!candle) return 0;
  if (!Number.isFinite(previousClose)) return Math.max(0, candle.high - candle.low);
  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - previousClose),
    Math.abs(candle.low - previousClose)
  );
}

export function heatmapAtr(candles, period = 20) {
  const values = cleanHeatmapCandles(candles);
  if (values.length < 2) return 0;
  const start = Math.max(1, values.length - Math.max(2, period));
  const ranges = [];
  for (let index = start; index < values.length; index += 1) {
    ranges.push(trueRange(values[index], values[index - 1]?.close));
  }
  return ranges.length ? ranges.reduce((sum, value) => sum + value, 0) / ranges.length : 0;
}

export function adaptiveBucketSize(candles) {
  const atr = heatmapAtr(candles, 20);
  if (!atr) return 2;
  return clamp(roundToStep(atr * 0.32, 0.5), 1, 4);
}

export function detectHeatmapSwings(candles, swingWindow = DEFAULT_SWING_WINDOW) {
  const values = cleanHeatmapCandles(candles);
  const window = clamp(Math.round(number(swingWindow, DEFAULT_SWING_WINDOW)), 1, 5);
  const swings = [];

  for (let index = window; index < values.length - window; index += 1) {
    const candle = values[index];
    let isHigh = true;
    let isLow = true;
    for (let offset = 1; offset <= window; offset += 1) {
      if (candle.high <= values[index - offset].high || candle.high <= values[index + offset].high) isHigh = false;
      if (candle.low >= values[index - offset].low || candle.low >= values[index + offset].low) isLow = false;
    }
    if (isHigh) swings.push({ type: 'RESISTANCE', price: candle.high, index });
    if (isLow) swings.push({ type: 'SUPPORT', price: candle.low, index });
  }
  return swings;
}

function swingLifecycle(swing, candles, halfBucket) {
  let wickSwept = false;
  let broken = false;
  let breakIndex = -1;
  let polarityRetest = false;
  let retestIndex = -1;

  for (let index = swing.index + 1; index < candles.length; index += 1) {
    const candle = candles[index];
    if (swing.type === 'SUPPORT') {
      if (!broken) {
        if (candle.close < swing.price - halfBucket) {
          broken = true;
          breakIndex = index;
        } else if (candle.low < swing.price - halfBucket) {
          wickSwept = true;
        }
      } else if (candle.high >= swing.price - halfBucket && candle.low <= swing.price + halfBucket) {
        polarityRetest = true;
        retestIndex = index;
      }
    } else if (!broken) {
      if (candle.close > swing.price + halfBucket) {
        broken = true;
        breakIndex = index;
      } else if (candle.high > swing.price + halfBucket) {
        wickSwept = true;
      }
    } else if (candle.low <= swing.price + halfBucket && candle.high >= swing.price - halfBucket) {
      polarityRetest = true;
      retestIndex = index;
    }
  }

  return { wickSwept, broken, breakIndex, polarityRetest, retestIndex };
}

function recencyWeight(age) {
  return 0.15 + 0.85 * Math.exp(-Math.max(0, age) / 58);
}

function bucketKey(price, bucketSize) {
  return round(roundToStep(price, bucketSize), 4);
}

function createBucket(price, bucketSize) {
  return {
    price,
    bottom: price - bucketSize / 2,
    top: price + bucketSize / 2,
    rawSupportCount: 0,
    rawResistanceCount: 0,
    activeSupportCount: 0,
    activeResistanceCount: 0,
    polaritySupportCount: 0,
    polarityResistanceCount: 0,
    sweptReclaimedCount: 0,
    brokenCount: 0,
    supportStrength: 0,
    resistanceStrength: 0,
    historicalStrength: 0,
    latestSwingIndex: -1,
    latestEventIndex: -1
  };
}

function addSwingToBucket(bucket, swing, lifecycle, lastIndex) {
  const age = lastIndex - swing.index;
  const weight = recencyWeight(age);
  bucket.latestSwingIndex = Math.max(bucket.latestSwingIndex, swing.index);

  if (swing.type === 'SUPPORT') bucket.rawSupportCount += 1;
  else bucket.rawResistanceCount += 1;

  if (!lifecycle.broken) {
    const reclaimedBoost = lifecycle.wickSwept ? 1.18 : 1;
    if (swing.type === 'SUPPORT') {
      bucket.activeSupportCount += 1;
      bucket.supportStrength += weight * reclaimedBoost;
    } else {
      bucket.activeResistanceCount += 1;
      bucket.resistanceStrength += weight * reclaimedBoost;
    }
    if (lifecycle.wickSwept) {
      bucket.sweptReclaimedCount += 1;
      bucket.latestEventIndex = Math.max(bucket.latestEventIndex, lastIndex);
    }
    return;
  }

  bucket.brokenCount += 1;
  bucket.latestEventIndex = Math.max(bucket.latestEventIndex, lifecycle.retestIndex, lifecycle.breakIndex);
  if (lifecycle.polarityRetest) {
    if (swing.type === 'SUPPORT') {
      bucket.polarityResistanceCount += 1;
      bucket.resistanceStrength += weight * 0.82;
    } else {
      bucket.polaritySupportCount += 1;
      bucket.supportStrength += weight * 0.82;
    }
  } else {
    bucket.historicalStrength += weight * 0.18;
  }
}

function interactionMetrics(bucket, candles, role) {
  const start = Math.max(0, candles.length - 48);
  let touchScore = 0;
  let rejectionScore = 0;
  let recentTouches = 0;
  let latestTouchIndex = -1;

  for (let index = start; index < candles.length; index += 1) {
    const candle = candles[index];
    if (candle.high < bucket.bottom || candle.low > bucket.top) continue;
    const age = candles.length - 1 - index;
    const weight = 0.2 + 0.8 * Math.exp(-age / 16);
    touchScore += weight;
    recentTouches += 1;
    latestTouchIndex = index;

    if (role === 'SUPPORT' && candle.low <= bucket.top && candle.close > bucket.price) {
      rejectionScore += weight;
    }
    if (role === 'RESISTANCE' && candle.high >= bucket.bottom && candle.close < bucket.price) {
      rejectionScore += weight;
    }
  }

  return { touchScore, rejectionScore, recentTouches, latestTouchIndex };
}

function classifyBucket(bucket, currentPrice) {
  const support = bucket.supportStrength;
  const resistance = bucket.resistanceStrength;
  let role = 'MIXED';
  if (support > resistance * 1.12) role = 'SUPPORT';
  else if (resistance > support * 1.12) role = 'RESISTANCE';
  else if (bucket.activeSupportCount > bucket.activeResistanceCount) role = 'SUPPORT';
  else if (bucket.activeResistanceCount > bucket.activeSupportCount) role = 'RESISTANCE';
  else role = bucket.price <= currentPrice ? 'SUPPORT' : 'RESISTANCE';

  const polarity = role === 'SUPPORT'
    ? bucket.polaritySupportCount > 0
    : bucket.polarityResistanceCount > 0;
  const activeCount = role === 'SUPPORT' ? bucket.activeSupportCount : bucket.activeResistanceCount;
  const priceInside = currentPrice >= bucket.bottom && currentPrice <= bucket.top;

  let status = 'ACTIVE';
  if (priceInside) status = 'PRICE_INSIDE';
  else if (polarity) status = 'POLARITY_FLIP';
  else if (bucket.sweptReclaimedCount > 0 && activeCount > 0) status = 'SWEPT_RECLAIMED';
  else if (activeCount === 0 && bucket.brokenCount > 0) status = 'BROKEN';
  else if (activeCount === 0) status = 'HISTORICAL';

  const liquidityType = status === 'BROKEN' || status === 'HISTORICAL'
    ? null
    : role === 'RESISTANCE' ? 'BSL' : role === 'SUPPORT' ? 'SSL' : null;

  return { role, status, polarity, activeCount, priceInside, liquidityType };
}

function labelFor(bucket, classification) {
  const { role, status } = classification;
  if (status === 'POLARITY_FLIP') return role === 'RESISTANCE' ? 'POLARITY RESISTANCE' : 'POLARITY SUPPORT';
  if (status === 'SWEPT_RECLAIMED') return role === 'RESISTANCE' ? 'EQH · RECLAIMED' : 'EQL · RECLAIMED';
  if (status === 'BROKEN') return role === 'RESISTANCE' ? 'BROKEN RESISTANCE' : 'BROKEN SUPPORT';
  if (role === 'RESISTANCE') {
    return bucket.rawResistanceCount + bucket.polarityResistanceCount >= 2 ? 'EQH · BUY-SIDE' : 'SWING HIGH';
  }
  if (role === 'SUPPORT') {
    return bucket.rawSupportCount + bucket.polaritySupportCount >= 2 ? 'EQL · SELL-SIDE' : 'SWING LOW';
  }
  return 'CONFLUENCE';
}

function scoreBucket(bucket, classification, interactions, lastIndex) {
  const directionalStrength = classification.role === 'SUPPORT'
    ? bucket.supportStrength
    : classification.role === 'RESISTANCE'
      ? bucket.resistanceStrength
      : bucket.supportStrength + bucket.resistanceStrength;
  const freshBonus = bucket.latestSwingIndex >= lastIndex - 16 ? 1.2 : 0;
  const transitionBonus = classification.status === 'POLARITY_FLIP' ? 1.5
    : classification.status === 'SWEPT_RECLAIMED' ? 1.2
      : classification.status === 'PRICE_INSIDE' ? 1.4 : 0;
  const brokenPenalty = classification.status === 'BROKEN' ? 0.35
    : classification.status === 'HISTORICAL' ? 0.2 : 1;

  return Math.max(0.05,
    (directionalStrength * 3.2
      + interactions.touchScore * 0.55
      + interactions.rejectionScore * 0.8
      + freshBonus
      + transitionBonus
      + bucket.historicalStrength) * brokenPenalty
  );
}

function selectZones(zones, currentPrice, atr, bucketSize, maxPerSide) {
  const maximumDistance = Math.max(atr * 9, bucketSize * 14, 20);
  const eligible = zones.filter(zone =>
    Math.abs(zone.price - currentPrice) <= maximumDistance
    || zone.status === 'PRICE_INSIDE'
    || zone.status === 'POLARITY_FLIP'
  );

  const rank = (a, b) => {
    const activeA = a.active ? 1 : 0;
    const activeB = b.active ? 1 : 0;
    if (activeA !== activeB) return activeB - activeA;
    const distanceA = Math.abs(a.price - currentPrice);
    const distanceB = Math.abs(b.price - currentPrice);
    return distanceA - distanceB || b.score - a.score;
  };

  const above = eligible.filter(zone => zone.price > currentPrice).sort(rank).slice(0, maxPerSide);
  const below = eligible.filter(zone => zone.price < currentPrice).sort(rank).slice(0, maxPerSide);
  const inside = eligible.filter(zone => currentPrice >= zone.bottom && currentPrice <= zone.top).sort((a, b) => b.score - a.score).slice(0, 2);
  const selected = [...above, ...below, ...inside];
  const unique = [];
  for (const zone of selected) {
    if (!unique.some(item => item.key === zone.key)) unique.push(zone);
  }
  return unique.sort((a, b) => b.price - a.price);
}

function normalizeIntensity(zones) {
  const scores = zones.filter(zone => !zone.isCurrent).map(zone => zone.score).sort((a, b) => a - b);
  if (!scores.length) return zones;
  const capIndex = Math.min(scores.length - 1, Math.max(0, Math.floor((scores.length - 1) * 0.85)));
  const cap = Math.max(scores[capIndex], 0.1);
  const logCap = Math.log1p(cap);
  return zones.map(zone => ({
    ...zone,
    intensity: zone.isCurrent ? 1 : clamp(Math.log1p(Math.min(zone.score, cap)) / logCap, 0.08, 1)
  }));
}

function marketSummary(zones, currentPrice) {
  const active = zones.filter(zone => zone.active && !zone.isCurrent);
  const bsl = active
    .filter(zone => zone.liquidityType === 'BSL' && zone.price > currentPrice)
    .sort((a, b) => a.price - b.price || b.score - a.score);
  const ssl = active
    .filter(zone => zone.liquidityType === 'SSL' && zone.price < currentPrice)
    .sort((a, b) => b.price - a.price || b.score - a.score);
  const aboveStrength = bsl.reduce((sum, zone) => sum + zone.score / Math.max(1, Math.abs(zone.price - currentPrice)), 0);
  const belowStrength = ssl.reduce((sum, zone) => sum + zone.score / Math.max(1, Math.abs(zone.price - currentPrice)), 0);
  const pressure = aboveStrength > belowStrength * 1.15 ? 'ABOVE PRICE'
    : belowStrength > aboveStrength * 1.15 ? 'BELOW PRICE' : 'BALANCED';
  const nearestBsl = bsl[0] || null;
  const nearestSsl = ssl[0] || null;
  const nearestDraw = !nearestBsl ? nearestSsl
    : !nearestSsl ? nearestBsl
      : Math.abs(nearestBsl.price - currentPrice) <= Math.abs(nearestSsl.price - currentPrice)
        ? nearestBsl : nearestSsl;

  return {
    pressure,
    nearestDraw: nearestDraw ? {
      type: nearestDraw.liquidityType,
      price: nearestDraw.price,
      distance: round(nearestDraw.price - currentPrice, 2),
      score: nearestDraw.score
    } : null,
    nearestBsl: nearestBsl ? { price: nearestBsl.price, distance: round(nearestBsl.price - currentPrice, 2), score: nearestBsl.score } : null,
    nearestSsl: nearestSsl ? { price: nearestSsl.price, distance: round(nearestSsl.price - currentPrice, 2), score: nearestSsl.score } : null,
    activeZones: active.length,
    transitionZones: active.filter(zone => zone.status === 'POLARITY_FLIP' || zone.status === 'SWEPT_RECLAIMED').length
  };
}

export function computeDynamicHeatmap(candles, {
  swingWindow = DEFAULT_SWING_WINDOW,
  maxZonesPerSide = DEFAULT_MAX_ZONES_PER_SIDE,
  bucketSize: requestedBucketSize
} = {}) {
  const values = cleanHeatmapCandles(candles);
  if (values.length < swingWindow * 2 + 5) {
    return {
      currentPrice: values.at(-1)?.close ?? null,
      zones: [],
      summary: { pressure: 'WAITING DATA', nearestDraw: null, activeZones: 0, transitionZones: 0 },
      meta: { candleCount: values.length, bucketSize: null, atr: heatmapAtr(values), sourceCandleTime: values.at(-1)?.time ?? null }
    };
  }

  const currentPrice = values.at(-1).close;
  const atr = heatmapAtr(values, 20);
  const bucketSize = number(requestedBucketSize) > 0
    ? clamp(number(requestedBucketSize), 0.5, 8)
    : adaptiveBucketSize(values);
  const halfBucket = bucketSize / 2;
  const lastIndex = values.length - 1;
  const buckets = new Map();

  for (const swing of detectHeatmapSwings(values, swingWindow)) {
    const price = bucketKey(swing.price, bucketSize);
    const key = String(price);
    const bucket = buckets.get(key) || createBucket(price, bucketSize);
    addSwingToBucket(bucket, swing, swingLifecycle(swing, values, halfBucket), lastIndex);
    buckets.set(key, bucket);
  }

  const rawZones = [...buckets.entries()].map(([key, bucket]) => {
    const classification = classifyBucket(bucket, currentPrice);
    const interactions = interactionMetrics(bucket, values, classification.role);
    const score = scoreBucket(bucket, classification, interactions, lastIndex);
    return {
      key,
      kind: 'LIQUIDITY_ZONE',
      price: round(bucket.price, 2),
      bottom: round(bucket.bottom, 2),
      top: round(bucket.top, 2),
      role: classification.role,
      liquidityType: classification.liquidityType,
      status: classification.status,
      active: !['BROKEN', 'HISTORICAL'].includes(classification.status),
      label: labelFor(bucket, classification),
      score: round(score, 2),
      totalActivity: round(score, 1),
      supportCount: bucket.activeSupportCount + bucket.polaritySupportCount,
      resistCount: bucket.activeResistanceCount + bucket.polarityResistanceCount,
      rawSupportCount: bucket.rawSupportCount,
      rawResistanceCount: bucket.rawResistanceCount,
      recentTouches: interactions.recentTouches,
      latestTouchIndex: interactions.latestTouchIndex,
      latestSwingIndex: bucket.latestSwingIndex,
      distance: round(bucket.price - currentPrice, 2),
      isCurrent: false
    };
  });

  let zones = selectZones(rawZones, currentPrice, atr, bucketSize, clamp(Math.round(maxZonesPerSide), 3, 10));
  zones.push({
    key: 'CURRENT',
    kind: 'CURRENT_PRICE',
    price: round(currentPrice, 2),
    bottom: round(currentPrice, 2),
    top: round(currentPrice, 2),
    role: 'CURRENT',
    liquidityType: null,
    status: 'LIVE_PRICE',
    active: true,
    label: 'HARGA BERJALAN',
    score: 0,
    totalActivity: 0,
    supportCount: 0,
    resistCount: 0,
    rawSupportCount: 0,
    rawResistanceCount: 0,
    recentTouches: 0,
    latestTouchIndex: lastIndex,
    latestSwingIndex: lastIndex,
    distance: 0,
    isCurrent: true
  });
  zones = normalizeIntensity(zones).sort((a, b) => b.price - a.price || Number(b.isCurrent) - Number(a.isCurrent));

  const summary = marketSummary(zones, currentPrice);
  return {
    currentPrice: round(currentPrice, 2),
    zones,
    summary,
    meta: {
      candleCount: values.length,
      sourceCandleTime: values.at(-1)?.time ?? null,
      atr: round(atr, 2),
      bucketSize: round(bucketSize, 2),
      swingCount: detectHeatmapSwings(values, swingWindow).length,
      visibleZoneCount: zones.filter(zone => !zone.isCurrent).length,
      activeZoneCount: zones.filter(zone => zone.active && !zone.isCurrent).length,
      brokenZoneCount: zones.filter(zone => !zone.active && !zone.isCurrent).length
    }
  };
}
