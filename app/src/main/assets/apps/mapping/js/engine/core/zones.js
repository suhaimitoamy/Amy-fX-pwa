import { atrAt, bodyRatio, clamp, detectStructure, p2, swings } from './math-structure.js';

export function detectFvg(candles, htfNarrative) {
  const output = [];
  for (let index = Math.max(2, candles.length - 80); index < candles.length; index += 1) {
    const first = candles[index - 2];
    const middle = candles[index - 1];
    const third = candles[index];
    if (!first || !middle || !third) continue;
    const localAtr = Math.max(atrAt(candles, index - 1), 0.1);
    const body = Math.abs(middle.close - middle.open);
    const bullish = first.high < third.low;
    const bearish = first.low > third.high;
    if ((!bullish && !bearish) || body < localAtr * 0.55 || bodyRatio(middle) < 0.5) continue;

    const zone = {
      type: bullish ? 'BULLISH' : 'BEARISH',
      bottom: bullish ? first.high : third.high,
      top: bullish ? third.low : first.low,
      index,
      mid: 0,
      status: 'FRESH',
      age: candles.length - 1 - index,
      hasDisplacement: true,
      htfAligned: false,
      qualityScore: 50,
      qualityLabel: 'MEDIUM',
      localAtr,
      reason: ''
    };
    zone.mid = (zone.top + zone.bottom) / 2;
    if (Math.abs(zone.top - zone.bottom) < localAtr * 0.08) continue;

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let minClose = Infinity;
    let maxClose = -Infinity;
    for (let cursor = index + 1; cursor < candles.length; cursor += 1) {
      minPrice = Math.min(minPrice, candles[cursor].low);
      maxPrice = Math.max(maxPrice, candles[cursor].high);
      minClose = Math.min(minClose, candles[cursor].close);
      maxClose = Math.max(maxClose, candles[cursor].close);
    }
    if (bullish) {
      if (minClose < zone.bottom) zone.status = 'BROKEN';
      else if (minPrice < zone.mid) zone.status = 'MITIGATED';
      else if (minPrice <= zone.top) zone.status = 'TESTED';
    } else {
      if (maxClose > zone.top) zone.status = 'BROKEN';
      else if (maxPrice > zone.mid) zone.status = 'MITIGATED';
      else if (maxPrice >= zone.bottom) zone.status = 'TESTED';
    }

    zone.htfAligned = (bullish && htfNarrative?.htfBias === 'BULLISH')
      || (bearish && htfNarrative?.htfBias === 'BEARISH');
    let quality = 50;
    if (zone.status === 'FRESH') quality += 20;
    if (zone.status === 'TESTED') quality += 10;
    if (zone.status === 'MITIGATED') quality -= 10;
    if (zone.status === 'BROKEN') quality -= 50;
    if (zone.htfAligned) quality += 20;
    else if (htfNarrative?.htfBias && htfNarrative.htfBias !== 'NEUTRAL') quality -= 20;
    zone.qualityScore = quality;
    zone.qualityLabel = quality >= 70 ? 'STRONG' : quality >= 50 ? 'MEDIUM' : 'WEAK';
    const stateText = zone.status === 'FRESH' ? 'belum disentuh'
      : zone.status === 'TESTED' ? 'baru disentuh tipis'
        : zone.status === 'MITIGATED' ? 'sudah terisi lebih dari setengah' : 'sudah tidak valid';
    const alignText = zone.htfAligned ? 'Arah FVG sejalan dengan struktur timeframe besar.'
      : htfNarrative?.htfBias !== 'NEUTRAL' ? 'Arah FVG berlawanan dengan struktur timeframe besar.'
        : 'Struktur timeframe besar masih netral.';
    zone.reason = `Celah harga ${bullish ? 'bullish' : 'bearish'} ini ${stateText}. ${alignText}`;
    if (zone.status !== 'BROKEN') output.push(zone);
  }
  return output.slice(-8);
}

export function detectOB(cs, st, htfNarrative) {
  const confirmed = st?.lastConfirmedBreak || (st?.last?.breakType === 'VALID_BREAK' ? st.last : null);
  if (!confirmed?.valid || confirmed.failed || confirmed.breakType !== 'VALID_BREAK' || !confirmed.hasDisplacement) return [];

  const breakIndex = confirmed.index;
  const direction = confirmed.dir;
  const start = Math.max(0, breakIndex - 12);
  let origin = null;
  let originIndex = -1;

  for (let index = breakIndex - 1; index >= start; index -= 1) {
    const candle = cs[index];
    const isOpposite = direction === 'BULLISH'
      ? candle.close < candle.open
      : candle.close > candle.open;
    if (isOpposite) {
      origin = candle;
      originIndex = index;
      break;
    }
  }
  if (!origin) return [];

  let createdImbalance = false;
  for (let index = Math.max(2, originIndex); index <= Math.min(cs.length - 1, breakIndex + 2); index += 1) {
    if (direction === 'BULLISH' && cs[index - 2].high < cs[index].low) createdImbalance = true;
    if (direction === 'BEARISH' && cs[index - 2].low > cs[index].high) createdImbalance = true;
  }

  const ob = {
    type: direction,
    bottom: origin.low,
    top: origin.high,
    index: originIndex,
    confirmedAt: breakIndex,
    mid: (origin.high + origin.low) / 2,
    status: 'FRESH',
    causedValidBreak: true,
    originDisplacement: true,
    createdImbalance,
    htfAligned: false,
    qualityScore: 50,
    qualityLabel: 'MEDIUM',
    reason: ''
  };

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let minClose = Infinity;
  let maxClose = -Infinity;
  for (let index = breakIndex + 1; index < cs.length; index += 1) {
    minPrice = Math.min(minPrice, cs[index].low);
    maxPrice = Math.max(maxPrice, cs[index].high);
    minClose = Math.min(minClose, cs[index].close);
    maxClose = Math.max(maxClose, cs[index].close);
  }

  if (direction === 'BULLISH') {
    if (minClose < ob.bottom) ob.status = 'BROKEN';
    else if (minPrice < ob.mid) ob.status = 'MITIGATED';
    else if (minPrice <= ob.top) ob.status = 'TESTED';
  } else {
    if (maxClose > ob.top) ob.status = 'BROKEN';
    else if (maxPrice > ob.mid) ob.status = 'MITIGATED';
    else if (maxPrice >= ob.bottom) ob.status = 'TESTED';
  }

  ob.htfAligned = direction === htfNarrative?.htfBias;
  let quality = 45;
  if (ob.status === 'FRESH') quality += 20;
  if (ob.status === 'TESTED') quality += 10;
  if (ob.status === 'MITIGATED') quality -= 15;
  if (ob.status === 'BROKEN') quality -= 50;
  quality += 15;
  if (createdImbalance) quality += 10;
  if (ob.htfAligned) quality += 15;
  else if (htfNarrative?.htfBias && htfNarrative.htfBias !== 'NEUTRAL') quality -= 20;
  ob.qualityScore = quality;
  ob.qualityLabel = quality >= 70 ? 'STRONG' : quality >= 50 ? 'MEDIUM' : 'WEAK';

  const stateText = ob.status === 'FRESH' ? 'belum disentuh kembali'
    : ob.status === 'TESTED' ? 'baru diuji tipis'
      : ob.status === 'MITIGATED' ? 'sudah dimitigasi lebih dari setengah'
        : 'sudah ditembus';
  const imbalanceText = createdImbalance
    ? 'Pergerakannya juga meninggalkan ketidakseimbangan harga.'
    : 'Tidak ada FVG yang jelas sehingga kualitasnya lebih rendah.';
  const alignText = ob.htfAligned
    ? 'Arah zona sejalan dengan struktur timeframe besar.'
    : htfNarrative?.htfBias !== 'NEUTRAL'
      ? 'Arah zona berlawanan dengan struktur timeframe besar.'
      : 'Struktur timeframe besar masih netral.';
  ob.reason = `Zona ini adalah candle berlawanan terakhir sebelum break struktur valid dan ${stateText}. ${imbalanceText} ${alignText}`;

  return ob.status === 'BROKEN' ? [] : [ob];
}

export function setupObj(type, dir, tf, score, price, entryLow, entryHigh, sl, tp1, tp2, reason, extra = {}) {
  const normalizedScore = Math.round(clamp(score, 0, 100));
  return {
    type,
    dir,
    tf,
    score: normalizedScore,
    status: normalizedScore >= 70 ? 'READY SETUP' : normalizedScore >= 55 ? 'WATCH SETUP' : 'WAIT',
    price,
    entryLow,
    entryHigh,
    sl,
    tp1,
    tp2,
    reason,
    timestamp: Date.now(),
    ...extra
  };
}

export function resolveHtfBias(zone, structureTrend) {
  if (structureTrend === 'BULLISH') return { bias: 'BULLISH', draw: 'BSL', aligned: zone === 'DISCOUNT' };
  if (structureTrend === 'BEARISH') return { bias: 'BEARISH', draw: 'SSL', aligned: zone === 'PREMIUM' };
  return { bias: 'NEUTRAL', draw: 'NEAREST', aligned: false };
}

export function buildHtfNarrative(htfCandles, price) {
  const output = {
    htfBias: 'NEUTRAL',
    htfStructure: 'NEUTRAL',
    dealingHigh: 0,
    dealingLow: 0,
    equilibrium: 0,
    zone: 'EQUILIBRIUM',
    drawOnLiquidity: 'NEUTRAL',
    drawLevel: 0,
    rangeAnchor: 'NONE',
    sourceTf: '',
    structureFailed: false,
    reason: 'Data timeframe besar belum cukup untuk menentukan arah.'
  };
  const source = htfCandles?.D1?.length > 10 ? 'D1' : htfCandles?.H4?.length > 10 ? 'H4' : '';
  const candles = source ? htfCandles[source] : null;
  if (!candles) return output;

  const sw = swings(candles, 2, 2);
  const structure = detectStructure(candles, sw);
  const confirmed = structure.lastConfirmedBreak;
  const currentPrice = Number(price) || candles.at(-1).close;
  let high = sw.highs.at(-1)?.high || Math.max(...candles.slice(-20).map(item => item.high));
  let low = sw.lows.at(-1)?.low || Math.min(...candles.slice(-20).map(item => item.low));

  if (confirmed?.dir === 'BULLISH') {
    const anchorLow = [...sw.lows].reverse().find(item => item.index < confirmed.index);
    const confirmedHigh = [...sw.highs].reverse().find(item => !anchorLow || item.index > anchorLow.index);
    if (anchorLow && confirmedHigh && confirmedHigh.high > anchorLow.low) {
      low = anchorLow.low;
      high = confirmedHigh.high;
      output.rangeAnchor = `${source}_BULLISH_STRUCTURE`;
    }
  } else if (confirmed?.dir === 'BEARISH') {
    const anchorHigh = [...sw.highs].reverse().find(item => item.index < confirmed.index);
    const confirmedLow = [...sw.lows].reverse().find(item => !anchorHigh || item.index > anchorHigh.index);
    if (anchorHigh && confirmedLow && anchorHigh.high > confirmedLow.low) {
      high = anchorHigh.high;
      low = confirmedLow.low;
      output.rangeAnchor = `${source}_BEARISH_STRUCTURE`;
    }
  }

  if (!(high > low)) {
    high = Math.max(...candles.slice(-20).map(item => item.high));
    low = Math.min(...candles.slice(-20).map(item => item.low));
    output.rangeAnchor = `${source}_FALLBACK`;
  } else if (output.rangeAnchor === 'NONE') {
    output.rangeAnchor = `${source}_CONFIRMED_SWINGS`;
  }

  output.sourceTf = source;
  output.dealingHigh = high;
  output.dealingLow = low;
  output.equilibrium = (high + low) / 2;
  output.zone = currentPrice > output.equilibrium ? 'PREMIUM'
    : currentPrice < output.equilibrium ? 'DISCOUNT' : 'EQUILIBRIUM';
  output.htfStructure = structure.trend;
  output.structureFailed = Boolean(structure.lastConfirmedBreak?.failed);
  const resolved = resolveHtfBias(output.zone, structure.trend);
  output.htfBias = resolved.bias;

  if (resolved.draw === 'BSL') {
    output.drawOnLiquidity = 'BSL';
    output.drawLevel = high;
    output.reason = resolved.aligned
      ? `Struktur ${source} naik dan harga berada di bagian bawah range. Fokus utama menuju likuiditas atas ${p2(high)}.`
      : `Struktur ${source} masih naik, tetapi harga sudah berada di ${output.zone.toLowerCase()}. Arah utama tetap ke atas dengan kebutuhan konfirmasi lebih kuat.`;
  } else if (resolved.draw === 'SSL') {
    output.drawOnLiquidity = 'SSL';
    output.drawLevel = low;
    output.reason = resolved.aligned
      ? `Struktur ${source} turun dan harga berada di bagian atas range. Fokus utama menuju likuiditas bawah ${p2(low)}.`
      : `Struktur ${source} masih turun, tetapi harga sudah berada di ${output.zone.toLowerCase()}. Arah utama tetap ke bawah dengan kebutuhan konfirmasi lebih kuat.`;
  } else {
    const distanceHigh = Math.abs(high - currentPrice);
    const distanceLow = Math.abs(currentPrice - low);
    output.drawOnLiquidity = distanceHigh < distanceLow ? 'BSL' : 'SSL';
    output.drawLevel = distanceHigh < distanceLow ? high : low;
    output.reason = `Struktur ${source} netral. Target sementara adalah likuiditas terdekat ${output.drawOnLiquidity} di ${p2(output.drawLevel)}.`;
  }
  return output;
}
