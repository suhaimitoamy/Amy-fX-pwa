export const EPSILON = 1e-9;

export function numeric(value, fallback = NaN) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function directionValue(value) {
  const text = String(value || '').toUpperCase();
  if (text.includes('BULL') || text === 'BUY' || text === 'LONG') return 1;
  if (text.includes('BEAR') || text === 'SELL' || text === 'SHORT') return -1;
  return 0;
}

export function cleanCandles(candles) {
  return (Array.isArray(candles) ? candles : [])
    .map((candle, index) => ({
      index,
      time: numeric(candle?.time, index),
      open: numeric(candle?.open),
      high: numeric(candle?.high),
      low: numeric(candle?.low),
      close: numeric(candle?.close)
    }))
    .filter(candle => [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
      && candle.high >= Math.max(candle.open, candle.close, candle.low)
      && candle.low <= Math.min(candle.open, candle.close, candle.high));
}

export function emaSeries(values, length) {
  if (!values.length) return [];
  const alpha = 2 / (Math.max(2, length) + 1);
  const output = [];
  let average = values[0];
  for (const value of values) {
    average = output.length ? alpha * value + (1 - alpha) * average : value;
    output.push(average);
  }
  return output;
}

export function trueRange(candles, index) {
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

export function atrSeries(candles, length = 14) {
  const output = Array(candles.length).fill(null);
  if (candles.length < length) return output;
  const ranges = candles.map((_, index) => trueRange(candles, index));
  let average = ranges.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
  output[length - 1] = average;
  for (let index = length; index < candles.length; index += 1) {
    average = (average * (length - 1) + ranges[index]) / length;
    output[index] = average;
  }
  return output;
}

export function rsiSeries(values, length = 14) {
  const output = Array(values.length).fill(null);
  if (values.length <= length) return output;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= length; index += 1) {
    const change = values[index] - values[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let averageGain = gains / length;
  let averageLoss = losses / length;
  output[length] = averageLoss <= EPSILON ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  for (let index = length + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = (averageGain * (length - 1) + Math.max(change, 0)) / length;
    averageLoss = (averageLoss * (length - 1) + Math.max(-change, 0)) / length;
    output[index] = averageLoss <= EPSILON ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return output;
}

export function adxSeries(candles, length = 14) {
  const output = Array(candles.length).fill(null);
  if (candles.length <= length * 2) return output;
  const trs = [];
  const plusDm = [];
  const minusDm = [];
  for (let index = 0; index < candles.length; index += 1) {
    if (!index) {
      trs.push(candles[index].high - candles[index].low);
      plusDm.push(0);
      minusDm.push(0);
      continue;
    }
    const up = candles[index].high - candles[index - 1].high;
    const down = candles[index - 1].low - candles[index].low;
    trs.push(trueRange(candles, index));
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
  }
  let tr = trs.slice(1, length + 1).reduce((sum, value) => sum + value, 0);
  let plus = plusDm.slice(1, length + 1).reduce((sum, value) => sum + value, 0);
  let minus = minusDm.slice(1, length + 1).reduce((sum, value) => sum + value, 0);
  const dx = Array(candles.length).fill(null);
  for (let index = length; index < candles.length; index += 1) {
    if (index > length) {
      tr = tr - tr / length + trs[index];
      plus = plus - plus / length + plusDm[index];
      minus = minus - minus / length + minusDm[index];
    }
    const plusDi = tr > EPSILON ? 100 * plus / tr : 0;
    const minusDi = tr > EPSILON ? 100 * minus / tr : 0;
    dx[index] = plusDi + minusDi > EPSILON ? 100 * Math.abs(plusDi - minusDi) / (plusDi + minusDi) : 0;
  }
  const first = dx.slice(length, length * 2).filter(Number.isFinite);
  let adx = first.reduce((sum, value) => sum + value, 0) / Math.max(1, first.length);
  output[length * 2 - 1] = adx;
  for (let index = length * 2; index < candles.length; index += 1) {
    adx = (adx * (length - 1) + numeric(dx[index], adx)) / length;
    output[index] = adx;
  }
  return output;
}

export function median(values) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return 0;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[middle] : (finite[middle - 1] + finite[middle]) / 2;
}

export function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

export function movementStats(candles, length = 20) {
  const values = candles.slice(-Math.max(4, length));
  if (values.length < 3) return { efficiency: 0, net: 0, path: 0, alternation: 0 };
  let path = 0;
  let alternations = 0;
  let previousSign = 0;
  for (let index = 1; index < values.length; index += 1) {
    const change = values[index].close - values[index - 1].close;
    path += Math.abs(change);
    const sign = Math.sign(change);
    if (sign && previousSign && sign !== previousSign) alternations += 1;
    if (sign) previousSign = sign;
  }
  const net = values.at(-1).close - values[0].close;
  return {
    efficiency: path > EPSILON ? Math.abs(net) / path : 0,
    net,
    path,
    alternation: alternations / Math.max(1, values.length - 2)
  };
}

export function candleCharacter(candles, length = 12) {
  const values = candles.slice(-Math.max(3, length));
  const bodies = [];
  const wicks = [];
  const closes = [];
  for (const candle of values) {
    const range = Math.max(candle.high - candle.low, EPSILON);
    const body = Math.abs(candle.close - candle.open);
    bodies.push(body / range);
    wicks.push(Math.max(0, range - body) / range);
    closes.push(Math.max((candle.close - candle.low) / range, (candle.high - candle.close) / range));
  }
  return { bodyEfficiency: mean(bodies), wickDominance: mean(wicks), closeEfficiency: mean(closes) };
}

export function softmaxPercent(scores) {
  const entries = Object.entries(scores);
  const maximum = Math.max(...entries.map(([, value]) => value));
  const exponentials = entries.map(([key, value]) => [key, Math.exp(value - maximum)]);
  const total = exponentials.reduce((sum, [, value]) => sum + value, 0) || 1;
  const raw = Object.fromEntries(exponentials.map(([key, value]) => [key, value / total * 100]));
  const rounded = Object.fromEntries(entries.map(([key]) => [key, Math.round(raw[key])]));
  const delta = 100 - Object.values(rounded).reduce((sum, value) => sum + value, 0);
  const leader = entries.sort((a, b) => raw[b[0]] - raw[a[0]])[0]?.[0];
  if (leader) rounded[leader] += delta;
  return rounded;
}
