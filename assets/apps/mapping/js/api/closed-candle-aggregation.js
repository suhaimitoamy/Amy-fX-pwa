function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizedSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number > 100_000_000_000 ? Math.floor(number / 1000) : Math.floor(number);
}

function validSourceCandle(candle) {
  const time = normalizedSeconds(candle?.time);
  const open = finitePositive(candle?.open);
  const high = finitePositive(candle?.high);
  const low = finitePositive(candle?.low);
  const close = finitePositive(candle?.close);
  return Boolean(
    candle?.isClosed !== false
    && time
    && open != null
    && high != null
    && low != null
    && close != null
    && high >= Math.max(open, close, low)
    && low <= Math.min(open, close, high)
  );
}

export function aggregateClosedCandles(sourceCandles, {
  timeframe,
  durationMs,
  sourceDurationMs = 60_000,
  closeCutoff = Date.now() - 10_000
} = {}) {
  const targetDuration = Number(durationMs);
  const sourceDuration = Number(sourceDurationMs);
  if (
    !Array.isArray(sourceCandles)
    || !Number.isFinite(targetDuration)
    || !Number.isFinite(sourceDuration)
    || targetDuration <= 0
    || sourceDuration <= 0
    || targetDuration % sourceDuration !== 0
  ) return [];

  const expectedCount = targetDuration / sourceDuration;
  const sourceSeconds = sourceDuration / 1000;
  const targetSeconds = targetDuration / 1000;
  const unique = new Map();

  for (const candle of sourceCandles) {
    if (!validSourceCandle(candle)) continue;
    const time = normalizedSeconds(candle.time);
    unique.set(time, {
      time,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      tickCount: Math.max(1, Number(candle.tickCount) || 1),
      isClosed: true
    });
  }

  const sorted = [...unique.values()].sort((a, b) => a.time - b.time);
  const buckets = new Map();
  for (const candle of sorted) {
    const bucketTime = Math.floor(candle.time / targetSeconds) * targetSeconds;
    if (!buckets.has(bucketTime)) buckets.set(bucketTime, []);
    buckets.get(bucketTime).push(candle);
  }

  const output = [];
  for (const [bucketTime, candles] of buckets) {
    const bucketEndMs = bucketTime * 1000 + targetDuration;
    if (bucketEndMs > closeCutoff || candles.length !== expectedCount) continue;

    let continuous = true;
    for (let index = 0; index < expectedCount; index += 1) {
      if (candles[index]?.time !== bucketTime + index * sourceSeconds) {
        continuous = false;
        break;
      }
    }
    if (!continuous) continue;

    output.push({
      time: bucketTime,
      timeframe,
      open: candles[0].open,
      high: Math.max(...candles.map(candle => candle.high)),
      low: Math.min(...candles.map(candle => candle.low)),
      close: candles.at(-1).close,
      tickCount: candles.reduce((total, candle) => total + candle.tickCount, 0),
      sourceTimeframe: 'M1',
      sourceCount: expectedCount,
      isClosed: true
    });
  }

  return output.sort((a, b) => a.time - b.time);
}
