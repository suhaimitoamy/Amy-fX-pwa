const SOURCE_TIMEFRAMES = Object.freeze(['M5', 'M15', 'H1', 'H4']);
const TRIGGER_TIMEFRAME = Object.freeze({ M5: 'M1', M15: 'M5', H1: 'M5', H4: 'M15' });
const TF_SECONDS = Object.freeze({ M1: 60, M5: 300, M15: 900, H1: 3600, H4: 14400 });
const TF_PRIORITY = Object.freeze({ H4: -0.30, H1: -0.20, M15: -0.10, M5: 0 });
const KIND_PRIORITY = Object.freeze({ LIQUIDITY: 0, ORDER_BLOCK: 0.04, FVG: 0.08, IFVG: 0.03, BREAKER_BLOCK: 0.03, VALID_BREAK: 0.02 });
const EXPIRY_BARS = Object.freeze({ M5: 144, M15: 96, H1: 72, H4: 42 });
const CONVERTED_EXPIRY_BARS = Object.freeze({ M5: 72, M15: 64, H1: 48, H4: 24 });

function finite(value, fallback = NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeTimestamp(value) {
  const timestamp = finite(value, 0);
  return timestamp > 10_000_000_000 ? timestamp / 1000 : timestamp;
}

function normalizeCandles(candles) {
  const unique = new Map();
  for (const row of Array.isArray(candles) ? candles : []) {
    const candle = {
      time: normalizeTimestamp(row?.time),
      open: finite(row?.open),
      high: finite(row?.high),
      low: finite(row?.low),
      close: finite(row?.close)
    };
    if (![candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)) continue;
    if (candle.high < Math.max(candle.open, candle.close, candle.low)) continue;
    if (candle.low > Math.min(candle.open, candle.close, candle.high)) continue;
    unique.set(candle.time, candle);
  }
  return [...unique.values()].sort((a, b) => a.time - b.time);
}

function atr14(candles) {
  const values = normalizeCandles(candles);
  if (values.length < 14) return NaN;
  const ranges = values.map((candle, index) => {
    const previous = values[index - 1];
    return previous
      ? Math.max(candle.high - candle.low, Math.abs(candle.high - previous.close), Math.abs(candle.low - previous.close))
      : candle.high - candle.low;
  });
  let current = ranges.slice(0, 14).reduce((sum, value) => sum + value, 0) / 14;
  for (let index = 14; index < ranges.length; index += 1) current = ((current * 13) + ranges[index]) / 14;
  return current;
}

export function normalizeEntryDirection(value) {
  const direction = String(value || '').toUpperCase();
  if (direction.includes('BUY') || direction.includes('BULL')) return 'BUY';
  if (direction.includes('SELL') || direction.includes('BEAR')) return 'SELL';
  return 'WAIT';
}

function oppositeDirection(direction) {
  return direction === 'BUY' ? 'SELL' : direction === 'SELL' ? 'BUY' : 'WAIT';
}

function transformedKind(kind) {
  if (kind === 'FVG') return 'IFVG';
  if (kind === 'ORDER_BLOCK') return 'BREAKER_BLOCK';
  if (kind === 'LIQUIDITY') return 'VALID_BREAK';
  if (kind === 'IFVG') return 'FVG';
  if (kind === 'BREAKER_BLOCK') return 'ORDER_BLOCK';
  return 'VALID_BREAK';
}

function candidateId(tf, kind, direction, id, bottom, top) {
  return ['ENTRY_WATCH', tf, kind, direction, id || '', finite(bottom, 0).toFixed(5), finite(top, 0).toFixed(5)].join(':');
}

function timeframeSeconds(tf) {
  return TF_SECONDS[tf] || 900;
}

function candleCloseTime(candle, tf) {
  return candle ? candle.time + timeframeSeconds(tf) : 0;
}

function itemAvailableTime(item, tf, candles) {
  const values = normalizeCandles(candles);
  const availableIndex = Math.round(finite(item?.availableIndex, -1));
  if (availableIndex >= 0 && values[availableIndex]) return candleCloseTime(values[availableIndex], tf);
  const explicit = normalizeTimestamp(item?.availableTime);
  if (explicit > 0) return explicit;
  const created = normalizeTimestamp(item?.createdAt);
  return created > 0 ? created + timeframeSeconds(tf) : 0;
}

function expiryTimeFor(candidate) {
  const seconds = timeframeSeconds(candidate?.sourceTf);
  const bars = candidate?.converted
    ? (CONVERTED_EXPIRY_BARS[candidate?.sourceTf] || 48)
    : (EXPIRY_BARS[candidate?.sourceTf] || 72);
  const available = normalizeTimestamp(candidate?.availableTime);
  return available > 0 ? available + bars * seconds : 0;
}

function zoneCandidate(zone, tf, direction, kind, currentPrice, atr, candles) {
  const bottom = finite(zone?.bottom);
  const top = finite(zone?.top);
  if (![bottom, top].every(Number.isFinite) || top < bottom) return null;
  const level = direction === 'BUY' ? bottom : top;
  const distance = Math.abs(currentPrice - level);
  const availableTime = itemAvailableTime(zone, tf, candles);
  const candidate = {
    id: candidateId(tf, kind, direction, zone?.id, bottom, top),
    sourceId: zone?.id || '',
    sourceTf: tf,
    triggerTf: TRIGGER_TIMEFRAME[tf] || tf,
    sourceKind: kind,
    sourceLabel: zone?.label || zone?.kind || kind,
    direction,
    bottom,
    top,
    level,
    atr,
    distance,
    distanceAtr: Number.isFinite(atr) && atr > 0 ? distance / atr : Infinity,
    availableTime,
    originIndex: finite(zone?.originIndex, -1),
    sourceStatus: zone?.status || 'DETECTED',
    converted: Boolean(zone?.converted)
  };
  return { ...candidate, expiryTime: expiryTimeFor(candidate) };
}

function liquidityCandidate(levelItem, tf, direction, currentPrice, atr, candles) {
  const level = finite(levelItem?.level);
  if (!Number.isFinite(level)) return null;
  const type = String(levelItem?.type || '').toUpperCase();
  if (direction === 'BUY' && type !== 'SSL') return null;
  if (direction === 'SELL' && type !== 'BSL') return null;
  const distance = Math.abs(currentPrice - level);
  const availableTime = itemAvailableTime(levelItem, tf, candles);
  const candidate = {
    id: candidateId(tf, 'LIQUIDITY', direction, levelItem?.id, level, level),
    sourceId: levelItem?.id || '',
    sourceTf: tf,
    triggerTf: TRIGGER_TIMEFRAME[tf] || tf,
    sourceKind: 'LIQUIDITY',
    sourceLabel: levelItem?.label || levelItem?.subtype || type,
    liquidityType: type,
    direction,
    bottom: level,
    top: level,
    level,
    atr,
    distance,
    distanceAtr: Number.isFinite(atr) && atr > 0 ? distance / atr : Infinity,
    availableTime,
    originIndex: finite(levelItem?.originIndex, -1),
    sourceStatus: levelItem?.status || 'DETECTED',
    converted: false
  };
  return { ...candidate, expiryTime: expiryTimeFor(candidate) };
}

function eligibleSide(candidate, currentPrice) {
  const tolerance = Math.max(finite(candidate.atr, 0) * 0.05, 0.01);
  if (candidate.direction === 'BUY') return candidate.level <= currentPrice + tolerance;
  if (candidate.direction === 'SELL') return candidate.level >= currentPrice - tolerance;
  return false;
}

function candidateScore(candidate) {
  const distance = Number.isFinite(candidate.distanceAtr) ? candidate.distanceAtr : 999;
  return distance + (TF_PRIORITY[candidate.sourceTf] ?? 0.20) + (KIND_PRIORITY[candidate.sourceKind] ?? 0.15);
}

export function buildEntryWatchCandidates({
  conceptsByTf = {},
  candlesByTf = {},
  direction,
  currentPrice
} = {}) {
  const normalizedDirection = normalizeEntryDirection(direction);
  const price = finite(currentPrice);
  if (normalizedDirection === 'WAIT' || !Number.isFinite(price)) return [];
  const candidates = [];

  for (const tf of SOURCE_TIMEFRAMES) {
    const concepts = conceptsByTf?.[tf];
    if (!concepts) continue;
    const candles = candlesByTf?.[tf];
    const atr = atr14(candles);

    for (const zone of Array.isArray(concepts.fairValueGaps) ? concepts.fairValueGaps : []) {
      if (normalizeEntryDirection(zone?.direction) !== normalizedDirection) continue;
      if (!['DETECTED', 'TESTING'].includes(String(zone?.status || 'DETECTED'))) continue;
      const candidate = zoneCandidate(zone, tf, normalizedDirection, 'FVG', price, atr, candles);
      if (candidate && eligibleSide(candidate, price) && candidate.distanceAtr <= 8) candidates.push(candidate);
    }

    for (const zone of Array.isArray(concepts.orderBlocks) ? concepts.orderBlocks : []) {
      if (normalizeEntryDirection(zone?.direction) !== normalizedDirection) continue;
      if (!['DETECTED', 'TESTING'].includes(String(zone?.status || 'DETECTED'))) continue;
      const candidate = zoneCandidate(zone, tf, normalizedDirection, 'ORDER_BLOCK', price, atr, candles);
      if (candidate && eligibleSide(candidate, price) && candidate.distanceAtr <= 8) candidates.push(candidate);
    }

    for (const levelItem of Array.isArray(concepts.liquidityLevels) ? concepts.liquidityLevels : []) {
      if (levelItem?.active === false || String(levelItem?.status || 'DETECTED') !== 'DETECTED') continue;
      const candidate = liquidityCandidate(levelItem, tf, normalizedDirection, price, atr, candles);
      if (candidate && eligibleSide(candidate, price) && candidate.distanceAtr <= 8) candidates.push(candidate);
    }
  }

  const unique = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.sourceTf}:${candidate.sourceKind}:${candidate.direction}:${candidate.level.toFixed(3)}`;
    const previous = unique.get(key);
    if (!previous || candidateScore(candidate) < candidateScore(previous)) unique.set(key, candidate);
  }
  return [...unique.values()].sort((a, b) => candidateScore(a) - candidateScore(b));
}

function latestClosed(candlesByTf, tf) {
  return normalizeCandles(candlesByTf?.[tf]).at(-1) || null;
}

function candidateDetected(candidate, conceptsByTf) {
  if (candidate?.converted) return true;
  const concepts = conceptsByTf?.[candidate?.sourceTf];
  if (!concepts) return false;
  let items = [];
  if (candidate.sourceKind === 'FVG') items = concepts.fairValueGaps || [];
  else if (candidate.sourceKind === 'ORDER_BLOCK') items = concepts.orderBlocks || [];
  else if (candidate.sourceKind === 'LIQUIDITY') items = concepts.liquidityLevels || [];
  return items.some(item => {
    const active = item?.active !== false && ['DETECTED', 'TESTING'].includes(String(item?.status || 'DETECTED'));
    if (!active) return false;
    if (candidate.sourceId && item?.id) return candidate.sourceId === item.id;
    const itemLevel = candidate.sourceKind === 'LIQUIDITY'
      ? finite(item?.level)
      : (candidate.direction === 'BUY' ? finite(item?.bottom) : finite(item?.top));
    return Number.isFinite(itemLevel) && Math.abs(itemLevel - candidate.level) <= Math.max(candidate.atr * 0.01, 0.001);
  });
}

function conversionFor(candidate, breakCandle) {
  const kind = transformedKind(candidate.sourceKind);
  const direction = oppositeDirection(candidate.direction);
  const level = direction === 'BUY' ? candidate.bottom : candidate.top;
  const availableTime = candleCloseTime(breakCandle, candidate.sourceTf);
  const transformed = {
    id: `${candidate.id}:CONVERTED:${kind}:${direction}`,
    sourceId: candidate.sourceId,
    sourceTf: candidate.sourceTf,
    triggerTf: candidate.triggerTf,
    sourceKind: kind,
    sourceLabel: kind === 'IFVG' ? 'Inversion FVG' : kind === 'BREAKER_BLOCK' ? 'Breaker Block' : 'Valid Break',
    direction,
    bottom: candidate.bottom,
    top: candidate.top,
    level,
    atr: candidate.atr,
    distance: 0,
    distanceAtr: 0,
    availableTime,
    originIndex: candidate.originIndex,
    sourceStatus: 'CONVERTED',
    converted: true,
    convertedFrom: candidate.sourceKind
  };
  return { ...transformed, expiryTime: expiryTimeFor(transformed) };
}

function sourceBreaks(direction, candle, level) {
  return direction === 'BUY' ? candle.close < level : candle.close > level;
}

function triggerSweeps(direction, candle, level) {
  return direction === 'BUY'
    ? candle.low < level && candle.close > level
    : candle.high > level && candle.close < level;
}

function triggerApproaches(direction, candle, candidate) {
  return direction === 'BUY' ? candle.low <= candidate.top : candle.high >= candidate.bottom;
}

function eventSequence(candidate, candlesByTf, previous, allowEntry) {
  const sourceValues = normalizeCandles(candlesByTf?.[candidate.sourceTf]);
  const triggerValues = normalizeCandles(candlesByTf?.[candidate.triggerTf]);
  const sourceLast = sourceValues.at(-1) || null;
  const triggerLast = triggerValues.at(-1) || sourceLast;
  if (!sourceLast || !triggerLast) return { sourceLast, triggerLast, event: null };

  const lastSource = finite(previous?.lastEvaluatedSourceTime, -Infinity);
  const lastTrigger = finite(previous?.lastEvaluatedTriggerTime, -Infinity);
  const armedAfter = finite(previous?.armedAfterTriggerTime, Infinity);
  const availableTime = normalizeTimestamp(candidate.availableTime);
  const events = [];

  for (const candle of sourceValues) {
    if (candle.time <= lastSource || candleCloseTime(candle, candidate.sourceTf) < availableTime) continue;
    if (sourceBreaks(candidate.direction, candle, candidate.level)) {
      events.push({ type: 'BREAK', time: candleCloseTime(candle, candidate.sourceTf), candle, priority: 0 });
      break;
    }
  }

  if (allowEntry) {
    for (let index = 0; index < triggerValues.length; index += 1) {
      const candle = triggerValues[index];
      if (candle.time <= lastTrigger || candle.time < availableTime || candle.time <= armedAfter) continue;
      const before = triggerValues[index - 1];
      const fresh = !before || (candidate.direction === 'BUY' ? before.close >= candidate.level : before.close <= candidate.level);
      if (fresh && triggerSweeps(candidate.direction, candle, candidate.level)) {
        events.push({ type: 'SWEEP', time: candleCloseTime(candle, candidate.triggerTf), candle, priority: 1 });
        break;
      }
    }
  }

  const expiryTime = finite(candidate.expiryTime, expiryTimeFor(candidate));
  const latestClose = Math.max(candleCloseTime(sourceLast, candidate.sourceTf), candleCloseTime(triggerLast, candidate.triggerTf));
  if (expiryTime > 0 && latestClose >= expiryTime) events.push({ type: 'EXPIRY', time: expiryTime, candle: sourceLast, priority: 2 });

  events.sort((a, b) => a.time - b.time || a.priority - b.priority);
  return { sourceLast, triggerLast, event: events[0] || null };
}

function terminalState(candidate, base, lifecycleStage, status, reason, sourceLast, extras = {}) {
  return {
    ...base,
    active: false,
    terminal: true,
    entryAllowed: false,
    lifecycleStage,
    status,
    reason,
    terminalAtSourceTime: sourceLast?.time || base.sourceCandleTime || 0,
    ...extras
  };
}

function armCandidate(candidate, candlesByTf) {
  const sourceLast = latestClosed(candlesByTf, candidate.sourceTf);
  const triggerLast = latestClosed(candlesByTf, candidate.triggerTf) || sourceLast;
  if (!sourceLast || !triggerLast) return null;
  const approached = triggerApproaches(candidate.direction, triggerLast, candidate);
  return {
    version: '1.1.0',
    model: 'AMY_MULTI_TF_LEVEL_WATCH',
    ...candidate,
    sourceCandleTime: sourceLast.time,
    triggerCandleTime: triggerLast.time,
    lastEvaluatedSourceTime: sourceLast.time,
    lastEvaluatedTriggerTime: triggerLast.time,
    armedAfterTriggerTime: triggerLast.time,
    watchStartedAt: candleCloseTime(triggerLast, candidate.triggerTf),
    updatedAt: Date.now(),
    entryAllowed: false,
    terminal: false,
    active: true,
    touched: approached,
    sweepDetected: false,
    validBreak: false,
    entryPrice: null,
    breakTime: null,
    transformed: null,
    lifecycleStage: approached ? 'LEVEL_TESTING' : 'WATCHING_LEVEL',
    status: approached ? 'LEVEL SEDANG DIUJI — BELUM ARMED ENTRY' : 'PANTAU HARGA',
    reason: `${candidate.sourceTf} ${candidate.sourceLabel} sudah dikunci. Entry baru boleh mulai candle ${candidate.triggerTf} berikutnya; close ${candidate.sourceTf} menembus level membatalkan entry.`
  };
}

export function evaluateEntryWatchCandidate(candidate, candlesByTf = {}, previous = null, {
  conceptsByTf = null,
  allowEntry = true
} = {}) {
  if (!candidate || normalizeEntryDirection(candidate.direction) === 'WAIT') return null;
  if (!previous || previous.id !== candidate.id) return armCandidate(candidate, candlesByTf);

  const sourceLast = latestClosed(candlesByTf, candidate.sourceTf);
  const triggerLast = latestClosed(candlesByTf, candidate.triggerTf) || sourceLast;
  if (!sourceLast || !triggerLast) return null;

  if (previous.lifecycleStage === 'ENTRY_TRIGGERED') {
    if (triggerLast.time <= finite(previous.entryTime, previous.triggerCandleTime)) return { ...previous, updatedAt: Date.now() };
    return terminalState(candidate, {
      ...previous,
      sourceCandleTime: sourceLast.time,
      triggerCandleTime: triggerLast.time,
      lastEvaluatedSourceTime: sourceLast.time,
      lastEvaluatedTriggerTime: triggerLast.time,
      updatedAt: Date.now()
    }, 'ENTRY_SPENT', 'ENTRY SPENT — MENUNGGU LEVEL BARU', 'Level ini sudah menghasilkan satu entry dan tidak boleh memicu entry kedua.', sourceLast, {
      entrySpent: true,
      spentAt: candleCloseTime(triggerLast, candidate.triggerTf)
    });
  }

  const direction = normalizeEntryDirection(candidate.direction);
  const sequence = eventSequence(candidate, candlesByTf, previous, allowEntry);
  const approached = triggerApproaches(direction, triggerLast, candidate);
  const base = {
    version: '1.1.0',
    model: 'AMY_MULTI_TF_LEVEL_WATCH',
    ...candidate,
    sourceCandleTime: sourceLast.time,
    triggerCandleTime: triggerLast.time,
    lastEvaluatedSourceTime: sourceLast.time,
    lastEvaluatedTriggerTime: triggerLast.time,
    armedAfterTriggerTime: finite(previous.armedAfterTriggerTime, previous.triggerCandleTime),
    watchStartedAt: previous.watchStartedAt || candleCloseTime(triggerLast, candidate.triggerTf),
    updatedAt: Date.now(),
    entryAllowed: false,
    terminal: false,
    active: true,
    touched: approached,
    sweepDetected: false,
    validBreak: false,
    entryPrice: null,
    breakTime: null,
    transformed: previous?.transformed || null
  };

  if (sequence.event?.type === 'BREAK') {
    const transformed = conversionFor(candidate, sequence.event.candle);
    return terminalState(candidate, base, 'VALID_BREAK', 'VALID BREAK — ENTRY BATAL', `${candidate.sourceTf} close menembus ${candidate.sourceLabel} di ${candidate.level.toFixed(2)}. Rencana ${direction} dibatalkan.`, sourceLast, {
      validBreak: true,
      breakTime: sequence.event.candle.time,
      breakCloseTime: sequence.event.time,
      transformed,
      transitionText: `${candidate.sourceKind} → ${transformed.sourceKind}`
    });
  }

  if (sequence.event?.type === 'EXPIRY') {
    return terminalState(candidate, base, 'LEVEL_EXPIRED', 'LEVEL EXPIRED — ENTRY BATAL', `${candidate.sourceTf} ${candidate.sourceLabel} melewati batas usia tanpa sweep entry atau valid break.`, sourceLast, {
      expiredAt: sequence.event.time
    });
  }

  if (sequence.event?.type === 'SWEEP') {
    return {
      ...base,
      entryAllowed: true,
      sweepDetected: true,
      lifecycleStage: 'ENTRY_TRIGGERED',
      status: `ENTRY ${direction} — SWEEP VALID`,
      reason: `${candidate.triggerTf} menyapu ${candidate.level.toFixed(2)} lalu close kembali setelah level selesai di-arm. Entry mengikuti Direction Forecast ${direction}.`,
      entryPrice: sequence.event.candle.close,
      entryTime: sequence.event.candle.time,
      entryCloseTime: sequence.event.time
    };
  }

  if (conceptsByTf && !candidateDetected(candidate, conceptsByTf)) {
    return terminalState(candidate, base, 'LEVEL_RETIRED', 'LEVEL TIDAK LAGI AKTIF', `${candidate.sourceTf} ${candidate.sourceLabel} sudah keluar dari detector aktif tanpa trigger entry yang sah.`, sourceLast);
  }

  return {
    ...base,
    lifecycleStage: approached ? 'LEVEL_TESTING' : 'WATCHING_LEVEL',
    status: approached ? 'LEVEL SEDANG DIUJI' : 'PANTAU HARGA',
    reason: `${candidate.sourceTf} ${candidate.sourceLabel} dipantau. Sweep pada ${candidate.triggerTf} memicu satu entry; close ${candidate.sourceTf} menembus level membatalkan entry.`
  };
}

function convertedCandidate(previous, direction, currentPrice) {
  const transformed = previous?.transformed;
  if (!transformed || normalizeEntryDirection(transformed.direction) !== normalizeEntryDirection(direction)) return null;
  const candidate = { ...transformed };
  candidate.distance = Math.abs(finite(currentPrice, candidate.level) - candidate.level);
  candidate.distanceAtr = Number.isFinite(candidate.atr) && candidate.atr > 0 ? candidate.distance / candidate.atr : Infinity;
  candidate.expiryTime = finite(candidate.expiryTime, expiryTimeFor(candidate));
  return candidate;
}

function sameDirectionPrevious(previous, direction) {
  return previous && normalizeEntryDirection(previous.direction) === normalizeEntryDirection(direction);
}

function terminalHoldActive(previous, candlesByTf) {
  if (!previous?.terminal || !previous?.terminalAtSourceTime || !previous?.sourceTf) return false;
  const sourceLast = latestClosed(candlesByTf, previous.sourceTf);
  return !sourceLast || sourceLast.time <= previous.terminalAtSourceTime;
}

function pausePrevious(previous, candlesByTf) {
  if (!previous?.id || previous.terminal) return null;
  if (previous.lifecycleStage === 'ENTRY_TRIGGERED') {
    return evaluateEntryWatchCandidate(previous, candlesByTf, previous, { allowEntry: false });
  }
  const reconciled = evaluateEntryWatchCandidate(previous, candlesByTf, previous, { allowEntry: false });
  if (!reconciled || reconciled.terminal) return reconciled;
  const triggerLast = latestClosed(candlesByTf, previous.triggerTf) || latestClosed(candlesByTf, previous.sourceTf);
  return {
    ...reconciled,
    active: false,
    entryAllowed: false,
    lifecycleStage: 'FORECAST_PAUSED',
    status: 'FORECAST PAUSED — LEVEL TETAP DIREKONSILIASI',
    reason: 'Direction Forecast tidak aktif. Entry dinonaktifkan, tetapi setiap source-close tetap diperiksa agar hidden break tidak terlewat.',
    lastEvaluatedTriggerTime: triggerLast?.time || reconciled.lastEvaluatedTriggerTime,
    pausedAt: Date.now()
  };
}

function forecastChanged(previous, direction, candlesByTf) {
  const sourceLast = latestClosed(candlesByTf, previous.sourceTf);
  return terminalState(previous, {
    ...previous,
    updatedAt: Date.now(),
    sourceCandleTime: sourceLast?.time || previous.sourceCandleTime
  }, 'FORECAST_CHANGED', 'FORECAST BERUBAH — LEVEL LAMA DITUTUP', `Direction Forecast berubah dari ${previous.direction} menjadi ${direction}. Level lama tidak boleh hidup kembali.`, sourceLast);
}

export function calculateMultiTimeframeEntryWatch({
  conceptsByTf = {},
  candlesByTf = {},
  direction,
  currentPrice,
  previous = null
} = {}) {
  const normalizedDirection = normalizeEntryDirection(direction);
  const price = finite(currentPrice);

  if (terminalHoldActive(previous, candlesByTf)) return { ...previous, updatedAt: Date.now() };

  if (normalizedDirection === 'WAIT' || !Number.isFinite(price)) {
    const paused = pausePrevious(previous, candlesByTf);
    if (paused) return { ...paused, candidates: previous?.candidates || [] };
    return {
      version: '1.1.0',
      model: 'AMY_MULTI_TF_LEVEL_WATCH',
      status: 'WAIT — DIRECTION FORECAST TIDAK AKTIF',
      lifecycleStage: 'WAIT_DIRECTION',
      direction: 'WAIT',
      active: false,
      terminal: false,
      entryAllowed: false,
      candidates: []
    };
  }

  if (previous?.id && !previous.terminal && !sameDirectionPrevious(previous, normalizedDirection)) {
    return forecastChanged(previous, normalizedDirection, candlesByTf);
  }

  const converted = convertedCandidate(previous, normalizedDirection, price);
  if (converted) {
    const evaluated = evaluateEntryWatchCandidate(converted, candlesByTf, previous, { conceptsByTf, allowEntry: true });
    if (evaluated) return { ...evaluated, candidates: [converted] };
  }

  if (sameDirectionPrevious(previous, normalizedDirection) && !previous?.terminal && previous?.id) {
    const evaluated = evaluateEntryWatchCandidate(previous, candlesByTf, previous, { conceptsByTf, allowEntry: true });
    if (evaluated) return { ...evaluated, candidates: previous.candidates || [previous] };
  }

  const candidates = buildEntryWatchCandidates({ conceptsByTf, candlesByTf, direction: normalizedDirection, currentPrice: price });
  const primary = candidates[0];
  if (!primary) {
    return {
      version: '1.1.0',
      model: 'AMY_MULTI_TF_LEVEL_WATCH',
      status: `WAIT — BELUM ADA LEVEL ${normalizedDirection}`,
      lifecycleStage: 'WAIT_LEVEL',
      direction: normalizedDirection,
      active: false,
      terminal: false,
      entryAllowed: false,
      candidates
    };
  }
  const evaluated = evaluateEntryWatchCandidate(primary, candlesByTf, null, { conceptsByTf, allowEntry: true });
  return evaluated ? { ...evaluated, candidates: candidates.slice(0, 12) } : null;
}

export const ENTRY_WATCH_CONFIG = Object.freeze({
  sourceTimeframes: [...SOURCE_TIMEFRAMES],
  triggerTimeframes: { ...TRIGGER_TIMEFRAME },
  expiryBars: { ...EXPIRY_BARS },
  convertedExpiryBars: { ...CONVERTED_EXPIRY_BARS },
  breakRule: 'REPLAY_ALL_SOURCE_CLOSES_BEYOND_LEVEL',
  entryRule: 'ARMED_NEXT_TRIGGER_CANDLE_WICK_SWEEP_AND_CLOSE_RECLAIM',
  reentryRule: 'ONE_ENTRY_PER_LEVEL_THEN_ENTRY_SPENT',
  availabilityRule: 'TRIGGER_OPEN_AT_OR_AFTER_LEVEL_AVAILABLE_CLOSE'
});
