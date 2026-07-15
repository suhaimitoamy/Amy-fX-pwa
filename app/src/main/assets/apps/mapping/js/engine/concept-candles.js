export function conceptNumber(value, fallback = NaN) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function cleanConceptCandles(candles) {
  return (Array.isArray(candles) ? candles : [])
    .map((candle, index) => ({
      ...candle,
      index,
      time: conceptNumber(candle?.time, index),
      open: conceptNumber(candle?.open),
      high: conceptNumber(candle?.high),
      low: conceptNumber(candle?.low),
      close: conceptNumber(candle?.close)
    }))
    .filter(candle =>
      [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
      && candle.high >= Math.max(candle.open, candle.close, candle.low)
      && candle.low <= Math.min(candle.open, candle.close, candle.high)
    );
}

function trueRange(candles, index) {
  const candle = candles[index];
  const previous = candles[index - 1];
  if (!candle) return 0;
  if (!previous) return Math.max(0, candle.high - candle.low);
  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - previous.close),
    Math.abs(candle.low - previous.close)
  );
}

export function conceptAtrAtClean(values, index, period = 14) {
  if (!values.length) return 0;
  const end = Math.min(Math.max(0, Math.round(conceptNumber(index, values.length - 1))), values.length - 1);
  const start = Math.max(0, end - Math.max(2, period) + 1);
  let sum = 0;
  let count = 0;
  for (let cursor = start; cursor <= end; cursor += 1) {
    const range = trueRange(values, cursor);
    if (Number.isFinite(range) && range > 0) {
      sum += range;
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

export function conceptAtrAt(candles, index, period = 14) {
  return conceptAtrAtClean(cleanConceptCandles(candles), index, period);
}

export function averageConceptBody(candles, endIndex, length) {
  const start = Math.max(0, endIndex - length + 1);
  let sum = 0;
  let count = 0;
  for (let index = start; index <= endIndex; index += 1) {
    const candle = candles[index];
    if (!candle) continue;
    sum += Math.abs(candle.close - candle.open);
    count += 1;
  }
  return count ? sum / count : 0;
}

export function conceptSwingPoints(candles, left = 3, right = 3) {
  const highs = [];
  const lows = [];
  for (let index = left; index < candles.length - right; index += 1) {
    let high = true;
    let low = true;
    for (let offset = 1; offset <= left; offset += 1) {
      if (candles[index].high <= candles[index - offset].high) high = false;
      if (candles[index].low >= candles[index - offset].low) low = false;
    }
    for (let offset = 1; offset <= right; offset += 1) {
      if (candles[index].high <= candles[index + offset].high) high = false;
      if (candles[index].low >= candles[index + offset].low) low = false;
    }
    if (high) highs.push({ ...candles[index], index });
    if (low) lows.push({ ...candles[index], index });
  }
  return { highs, lows };
}
