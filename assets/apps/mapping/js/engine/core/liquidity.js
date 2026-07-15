import { atr, p2 } from './math-structure.js';

export function isValidLiquiditySweep(candle, type, level) {
  if (!candle || !Number.isFinite(level)) return false;
  return type === 'SSL'
    ? candle.low < level && candle.close > level
    : type === 'BSL' ? candle.high > level && candle.close < level : false;
}

export function liquidityWasSwept(candles, type, level, originIndex, penetration = 0) {
  const start = Math.max(0, Number(originIndex) + 1);
  return candles.slice(start).some(candle => type === 'BSL'
    ? candle.high > level + penetration
    : candle.low < level - penetration);
}

export function buildLiquidityHierarchy(candles, swingPoints, ctx) {
  const price = ctx.price;
  const narrative = ctx.htfNarrative;
  const external = [];
  const internal = [];
  const equalHighs = [];
  const equalLows = [];
  const swept = [];
  const currentAtr = Math.max(atr(candles), 0.1);
  const clusterTolerance = Math.max(currentAtr * 0.03, 0.08);
  const externalTolerance = Math.max(currentAtr * 0.05, 0.12);
  const dedupeTolerance = Math.max(currentAtr * 0.015, 0.04);
  const sweepPenetration = Math.max(currentAtr * 0.005, 0.01);
  const highs = [...swingPoints.highs].reverse().slice(0, 25);
  const lows = [...swingPoints.lows].reverse().slice(0, 25);
  const recentHigh = Math.max(...candles.slice(-30).map(item => item.high));
  const recentLow = Math.min(...candles.slice(-30).map(item => item.low));
  const addSwept = item => {
    if (!swept.find(existing => existing.type === item.type && Math.abs(existing.level - item.level) < dedupeTolerance)) swept.push(item);
  };

  for (const high of highs) {
    const status = liquidityWasSwept(candles, 'BSL', high.high, high.index, sweepPenetration) ? 'SWEPT' : 'ACTIVE';
    const hierarchy = Math.abs(high.high - recentHigh) < externalTolerance
      || (narrative?.dealingHigh && Math.abs(high.high - narrative.dealingHigh) < externalTolerance) ? 'EXTERNAL' : 'INTERNAL';
    const item = { type: 'BSL', level: high.high, source: 'SWING_HIGH', hierarchy, status, strength: 'MEDIUM', distanceFromPrice: Math.abs(high.high - price), index: high.index };
    if (status === 'SWEPT') addSwept(item);
    else if (hierarchy === 'EXTERNAL') external.push(item);
    else internal.push(item);
  }
  for (const low of lows) {
    const status = liquidityWasSwept(candles, 'SSL', low.low, low.index, sweepPenetration) ? 'SWEPT' : 'ACTIVE';
    const hierarchy = Math.abs(low.low - recentLow) < externalTolerance
      || (narrative?.dealingLow && Math.abs(low.low - narrative.dealingLow) < externalTolerance) ? 'EXTERNAL' : 'INTERNAL';
    const item = { type: 'SSL', level: low.low, source: 'SWING_LOW', hierarchy, status, strength: 'MEDIUM', distanceFromPrice: Math.abs(price - low.low), index: low.index };
    if (status === 'SWEPT') addSwept(item);
    else if (hierarchy === 'EXTERNAL') external.push(item);
    else internal.push(item);
  }

  for (let first = 0; first < highs.length - 1; first += 1) {
    for (let second = first + 1; second < Math.min(first + 5, highs.length); second += 1) {
      if (Math.abs(highs[first].high - highs[second].high) > clusterTolerance) continue;
      const level = Math.max(highs[first].high, highs[second].high);
      const index = Math.max(highs[first].index, highs[second].index);
      const status = liquidityWasSwept(candles, 'BSL', level, index, sweepPenetration) ? 'SWEPT' : 'ACTIVE';
      const item = { type: 'BSL', level, source: 'EQUAL_HIGH', hierarchy: 'EXTERNAL', status, strength: 'STRONG', distanceFromPrice: Math.abs(level - price), index };
      if (status === 'SWEPT') addSwept(item);
      else if (!equalHighs.find(existing => Math.abs(existing.level - level) < clusterTolerance)) equalHighs.push(item);
    }
  }
  for (let first = 0; first < lows.length - 1; first += 1) {
    for (let second = first + 1; second < Math.min(first + 5, lows.length); second += 1) {
      if (Math.abs(lows[first].low - lows[second].low) > clusterTolerance) continue;
      const level = Math.min(lows[first].low, lows[second].low);
      const index = Math.max(lows[first].index, lows[second].index);
      const status = liquidityWasSwept(candles, 'SSL', level, index, sweepPenetration) ? 'SWEPT' : 'ACTIVE';
      const item = { type: 'SSL', level, source: 'EQUAL_LOW', hierarchy: 'EXTERNAL', status, strength: 'STRONG', distanceFromPrice: Math.abs(price - level), index };
      if (status === 'SWEPT') addSwept(item);
      else if (!equalLows.find(existing => Math.abs(existing.level - level) < clusterTolerance)) equalLows.push(item);
    }
  }

  let activeTargets = [...external, ...internal, ...equalHighs, ...equalLows]
    .filter(item => item.status === 'ACTIVE')
    .sort((a, b) => a.distanceFromPrice - b.distanceFromPrice);
  const unique = [];
  for (const item of activeTargets) {
    if (!unique.find(existing => existing.type === item.type && Math.abs(existing.level - item.level) < dedupeTolerance)) unique.push(item);
  }
  activeTargets = unique;
  const activeBsl = activeTargets.filter(item => item.type === 'BSL');
  const activeSsl = activeTargets.filter(item => item.type === 'SSL');
  let drawTarget = null;
  let summary = '';
  if (narrative?.htfBias === 'BULLISH' && activeBsl.length) {
    drawTarget = activeBsl.find(item => item.strength === 'STRONG') || activeBsl.find(item => item.hierarchy === 'EXTERNAL') || activeBsl[0];
    summary = `Struktur timeframe besar naik. Likuiditas atas di ${p2(drawTarget.level)} menjadi target utama.`;
  } else if (narrative?.htfBias === 'BEARISH' && activeSsl.length) {
    drawTarget = activeSsl.find(item => item.strength === 'STRONG') || activeSsl.find(item => item.hierarchy === 'EXTERNAL') || activeSsl[0];
    summary = `Struktur timeframe besar turun. Likuiditas bawah di ${p2(drawTarget.level)} menjadi target utama.`;
  } else if (activeTargets.length) {
    drawTarget = activeTargets[0];
    summary = `Arah timeframe besar masih netral. Level aktif terdekat adalah ${drawTarget.type} di ${p2(drawTarget.level)}.`;
  }
  return {
    external,
    internal,
    equalHighs,
    equalLows,
    swept,
    activeTargets,
    drawTarget,
    tolerance: { cluster: clusterTolerance, external: externalTolerance, sweep: sweepPenetration },
    summary
  };
}

function zoneMinutes(nowMs, zone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(nowMs || Date.now()));
  const hour = Number(parts.find(item => item.type === 'hour')?.value || 0);
  const minute = Number(parts.find(item => item.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

export function buildSessionContext(nowMs) {
  const now = nowMs || Date.now();
  const asia = zoneMinutes(now, 'Asia/Tokyo');
  const london = zoneMinutes(now, 'Europe/London');
  const newYork = zoneMinutes(now, 'America/New_York');
  let session = 'OFF_SESSION';
  let killzone = 'NONE';
  let sessionQuality = 'LOW';
  let note = 'Di luar jam aktif, risiko false breakout.';
  if (asia >= 540 && asia < 720) {
    session = 'ASIA';
    note = 'Sesi Asia, pergerakan cenderung lebih lambat dan sideways.';
  } else if (london >= 420 && london < 720) {
    session = 'LONDON';
    sessionQuality = 'NORMAL';
    if (london >= 420 && london < 480) {
      killzone = 'LONDON_JUDAS_SWING';
      sessionQuality = 'ACTIVE';
      note = 'London Judas Swing, risiko manipulasi awal sesi.';
    } else if (london >= 480) {
      killzone = 'LONDON_KILLZONE';
      sessionQuality = 'ACTIVE';
      note = 'London Open Killzone, waktu ekspansi market.';
    } else note = 'Sesi London aktif.';
  } else if (newYork >= 480 && newYork < 960) {
    session = 'NEW_YORK';
    sessionQuality = 'NORMAL';
    if (newYork >= 600 && newYork < 660) {
      killzone = 'SILVER_BULLET';
      sessionQuality = 'ACTIVE';
      note = 'Silver Bullet window aktif.';
    } else if (newYork >= 510 && newYork < 690) {
      killzone = 'NEW_YORK_KILLZONE';
      sessionQuality = 'ACTIVE';
      note = 'New York Killzone aktif.';
    } else note = 'Sesi New York aktif.';
  }
  return { session, killzone, sessionQuality, note };
}

export function buildDealingRange(candles, swingPoints, narrative, hierarchy, price) {
  let high = 0;
  let low = 0;
  let rangeSource = 'FALLBACK';
  let confidence = 'LOW';
  let reason = '';
  const currentAtr = atr(candles) || 1;
  if (narrative?.dealingHigh > 0 && narrative?.dealingLow > 0 && narrative.dealingHigh - narrative.dealingLow > currentAtr * 3) {
    high = narrative.dealingHigh;
    low = narrative.dealingLow;
    rangeSource = 'HTF_SWING';
    confidence = 'HIGH';
    reason = 'Menggunakan dealing range HTF yang valid.';
  } else {
    const externalBsl = hierarchy?.external?.filter(item => item.type === 'BSL').sort((a, b) => a.distanceFromPrice - b.distanceFromPrice)[0];
    const externalSsl = hierarchy?.external?.filter(item => item.type === 'SSL').sort((a, b) => a.distanceFromPrice - b.distanceFromPrice)[0];
    if (externalBsl && externalSsl && externalBsl.level - externalSsl.level > currentAtr * 2) {
      high = externalBsl.level;
      low = externalSsl.level;
      rangeSource = 'LIQUIDITY_RANGE';
      confidence = 'MEDIUM';
      reason = 'Menggunakan batas External Liquidity aktif.';
    } else if (hierarchy?.equalHighs?.length && hierarchy?.equalLows?.length) {
      high = [...hierarchy.equalHighs].sort((a, b) => a.distanceFromPrice - b.distanceFromPrice)[0].level;
      low = [...hierarchy.equalLows].sort((a, b) => a.distanceFromPrice - b.distanceFromPrice)[0].level;
      rangeSource = 'EQUAL_RANGE';
      confidence = 'MEDIUM';
      reason = 'Menggunakan range dari Equal Highs/Lows.';
    }
  }
  if (!(high > low)) {
    const recentHighs = [...swingPoints.highs].reverse().slice(0, 10);
    const recentLows = [...swingPoints.lows].reverse().slice(0, 10);
    high = recentHighs.length ? Math.max(...recentHighs.map(item => item.high)) : Math.max(...candles.slice(-50).map(item => item.high));
    low = recentLows.length ? Math.min(...recentLows.map(item => item.low)) : Math.min(...candles.slice(-50).map(item => item.low));
    rangeSource = 'RECENT_SWING';
    confidence = high - low > currentAtr * 2 ? 'MEDIUM' : 'LOW';
    reason = 'Menggunakan swing mayor terdekat.';
  }
  const equilibrium = (high + low) / 2;
  const neutralBuffer = (high - low) * 0.1;
  const premiumStart = equilibrium + neutralBuffer / 2;
  const discountEnd = equilibrium - neutralBuffer / 2;
  const currentZone = price > premiumStart ? 'PREMIUM' : price < discountEnd ? 'DISCOUNT' : 'EQUILIBRIUM';
  if (confidence === 'LOW') reason += ' (Range sempit, akurasi rendah).';
  return { high, low, equilibrium, premiumStart, discountEnd, currentZone, rangeSource, confidence, reason };
}
