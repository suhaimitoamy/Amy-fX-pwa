const TF_INTERVAL_MS = {
  '1min': 60_000,
  '5min': 5 * 60_000,
  '15min': 15 * 60_000,
  '30min': 30 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1day': 24 * 60 * 60_000,
  '1week': 7 * 24 * 60 * 60_000
};

const TF_FRESH_MS = {
  M1: 3 * 60_000,
  M5: 10 * 60_000,
  M15: 20 * 60_000,
  M30: 45 * 60_000,
  H1: 90 * 60_000,
  H4: 6 * 60 * 60_000,
  D1: 36 * 60 * 60_000,
  W1: 9 * 24 * 60 * 60_000
};

const ACTIONABLE_TYPES = new Set([
  'ORDER BLOCK',
  'FAIR VALUE GAP',
  'SWEEP_MSS_FVG'
]);

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseTime(value) {
  const normalized = String(value || '').trim().replace(' ', 'T');
  const stamp = Date.parse(/(?:Z|[+-]\d\d:?\d\d)$/.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isFinite(stamp) ? stamp : 0;
}

function isValidOhlc(row) {
  const open = number(row?.open);
  const high = number(row?.high);
  const low = number(row?.low);
  const close = number(row?.close);
  return Boolean(row?.datetime)
    && [open, high, low, close].every(Number.isFinite)
    && open > 0
    && high >= Math.max(open, close, low)
    && low <= Math.min(open, close, high);
}

function normalizeRow(row) {
  return {
    ...row,
    open: String(number(row.open)),
    high: String(number(row.high)),
    low: String(number(row.low)),
    close: String(number(row.close))
  };
}

function frozenRunIndexes(rows) {
  const marked = new Set();
  let start = 0;

  const finish = end => {
    const length = end - start;
    if (length < 8) return;
    const slice = rows.slice(start, end);
    const opens = slice.map(row => number(row.open));
    const highs = slice.map(row => number(row.high));
    const lows = slice.map(row => number(row.low));
    const anchor = opens[0] || 1;
    const openSpread = Math.max(...opens) - Math.min(...opens);
    const totalBand = Math.max(...highs) - Math.min(...lows);
    const openTolerance = Math.max(0.03, Math.abs(anchor) * 0.00001);
    const bandTolerance = Math.max(1, Math.abs(anchor) * 0.00025);
    const sameRoundedOpen = new Set(opens.map(value => value.toFixed(2))).size <= 2;
    if (sameRoundedOpen && openSpread <= openTolerance && totalBand <= bandTolerance) {
      for (let index = start; index < end; index += 1) marked.add(index);
    }
  };

  for (let index = 1; index <= rows.length; index += 1) {
    if (index === rows.length) {
      finish(index);
      break;
    }
    const previous = rows[index - 1];
    const current = rows[index];
    const anchor = number(rows[start]?.open) || 1;
    const tolerance = Math.max(0.03, Math.abs(anchor) * 0.00001);
    const continues = Math.abs(number(current.open) - number(previous.open)) <= tolerance;
    if (!continues) {
      finish(index);
      start = index;
    }
  }

  return marked;
}

export function sanitizeCandleValues(values, interval = '15min') {
  const input = Array.isArray(values) ? values : [];
  const chronological = [...input].sort((a, b) => String(a?.datetime || '').localeCompare(String(b?.datetime || '')));
  const seen = new Set();
  const valid = [];
  let malformed = 0;
  let duplicates = 0;

  for (const row of chronological) {
    if (!isValidOhlc(row) || !parseTime(row.datetime)) {
      malformed += 1;
      continue;
    }
    const key = String(row.datetime);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    valid.push(normalizeRow(row));
  }

  const frozen = frozenRunIndexes(valid);
  let clean = valid.filter((_, index) => !frozen.has(index));
  if (clean.length < 30 && valid.length >= 30) clean = valid;

  const intervalMs = TF_INTERVAL_MS[interval] || 0;
  let gaps = 0;
  if (intervalMs > 0) {
    for (let index = 1; index < clean.length; index += 1) {
      const difference = parseTime(clean[index].datetime) - parseTime(clean[index - 1].datetime);
      if (difference > intervalMs * 2.2) gaps += 1;
    }
  }

  const output = [...clean].sort((a, b) => String(b.datetime).localeCompare(String(a.datetime)));
  return {
    values: output,
    quality: {
      interval,
      rawCount: input.length,
      cleanCount: output.length,
      malformed,
      duplicates,
      frozenRemoved: valid.length - clean.length,
      gaps,
      fetchedAt: Date.now(),
      latestDatetime: output[0]?.datetime || '',
      status: malformed || duplicates || valid.length - clean.length ? 'CLEANED' : 'OK'
    }
  };
}

export function classifyBreak(breakInfo, confirmedTrend = 'NEUTRAL') {
  if (!breakInfo) {
    return {
      state: 'WAIT',
      title: 'BELUM ADA BREAK VALID',
      attempt: 'NONE',
      confirmedTrend,
      isConfirmed: false,
      explanation: 'Belum ada candle close yang mengonfirmasi BOS atau CHOCH.'
    };
  }

  const failed = breakInfo.breakType === 'BREAK_FAILED' || breakInfo.failed;
  const sweep = breakInfo.breakType === 'SWEEP_ONLY' || breakInfo.sweepOnly;
  const valid = breakInfo.breakType === 'VALID_BREAK' && breakInfo.valid;
  const attempt = breakInfo.dir === 'BEARISH' ? 'BEARISH' : breakInfo.dir === 'BULLISH' ? 'BULLISH' : 'NONE';
  const liquidity = attempt === 'BEARISH' ? 'SSL' : attempt === 'BULLISH' ? 'BSL' : 'LIQUIDITY';

  if (failed) {
    return {
      state: 'FAILED',
      title: 'BREAK GAGAL DIPERTAHANKAN',
      attempt,
      confirmedTrend,
      isConfirmed: false,
      explanation: 'Break sebelumnya gagal dipertahankan karena harga kembali close melewati level konfirmasi.'
    };
  }

  if (sweep) {
    return {
      state: 'SWEEP',
      title: `${liquidity} SWEEP — BELUM ADA BOS`,
      attempt,
      confirmedTrend,
      isConfirmed: false,
      explanation: `Harga menyapu ${liquidity} dengan wick, tetapi candle close kembali ke dalam struktur. Dorongan candle tidak mengesahkan BOS tanpa body close yang valid.`
    };
  }

  if (valid) {
    return {
      state: 'CONFIRMED',
      title: `VALID ${breakInfo.kind || 'STRUCTURE BREAK'} ${attempt}`,
      attempt,
      confirmedTrend: attempt,
      isConfirmed: true,
      explanation: `Candle sudah close melewati level struktur${breakInfo.hasDisplacement ? ' dan didukung displacement' : ''}.`
    };
  }

  return {
    state: 'WAIT',
    title: 'BELUM ADA BREAK VALID',
    attempt,
    confirmedTrend,
    isConfirmed: false,
    explanation: 'Belum ada BOS atau CHOCH yang memenuhi syarat body close.'
  };
}

function setupRr(setup) {
  const direct = number(setup?.conflictCheck?.rr);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const isBuy = String(setup?.dir || '').includes('BUY');
  const plannedEntry = isBuy
    ? Math.max(number(setup?.entryLow), number(setup?.entryHigh))
    : Math.min(number(setup?.entryLow), number(setup?.entryHigh));
  const risk = isBuy ? plannedEntry - number(setup?.sl) : number(setup?.sl) - plannedEntry;
  const target = isBuy
    ? Math.max(number(setup?.tp1), number(setup?.tp2))
    : Math.min(number(setup?.tp1), number(setup?.tp2));
  const reward = isBuy ? target - plannedEntry : plannedEntry - target;
  return risk > 0 && reward > 0 ? reward / risk : 0;
}

export function isActionableSetup(setup, now = Date.now(), livePrice = 0) {
  if (!setup || setup.tf !== 'M15' || !ACTIONABLE_TYPES.has(setup.type)) return false;
  const status = String(setup.status || '');
  if (!/(READY|WATCH|PANTAU|VALID)/.test(status) || /(WAIT|INVALID|BROKEN)/.test(status)) return false;
  if (setup.executionMode && setup.executionMode !== 'M15_PRECISION') return false;
  const conflict = String(setup.conflictCheck?.conflictLevel || 'NONE');
  if (conflict === 'FATAL' || conflict === 'HIGH') return false;
  if (setupRr(setup) < 2) return false;
  if (setup.timestamp && now - Number(setup.timestamp) > 24 * 60 * 60 * 1000) return false;

  const price = number(livePrice);
  const sl = number(setup.sl);
  if (Number.isFinite(price) && price > 0 && Number.isFinite(sl)) {
    if (String(setup.dir).includes('BUY') && price <= sl) return false;
    if (String(setup.dir).includes('SELL') && price >= sl) return false;
  }
  return true;
}

export function filterActionableSetups(setups, now = Date.now(), livePrice = 0) {
  return (Array.isArray(setups) ? setups : []).filter(setup => isActionableSetup(setup, now, livePrice));
}

export function deriveBiasView(result) {
  const local = result?.st?.trend || 'NEUTRAL';
  const htf = result?.htfNarrative?.htfBias || 'NEUTRAL';
  const composite = result?.final || 'NEUTRAL';
  const alignment = local === 'NEUTRAL' || htf === 'NEUTRAL'
    ? 'MIXED'
    : local === htf ? 'ALIGNED' : 'CONFLICT';
  return { local, htf, composite, alignment };
}

export function applyLiveLiquidity(result, live = {}) {
  if (!result) return result;
  const price = number(live.price || result.price);
  if (!Number.isFinite(price) || price <= 0) return result;
  const liveHigh = Math.max(price, number(live.high) || price);
  const liveLow = Math.min(price, number(live.low) || price);
  const hierarchy = result.liquidityHierarchy || {};
  const original = Array.isArray(hierarchy.activeTargets)
    ? hierarchy.activeTargets
    : Array.isArray(result.activeLiquidityTargets) ? result.activeLiquidityTargets : [];
  const tolerance = Math.max(number(hierarchy.tolerance?.sweep) || 0.01, 0.01);
  const touched = [];
  const active = [];

  for (const target of original) {
    const level = number(target.level);
    if (!Number.isFinite(level) || level <= 0) continue;
    const crossed = target.type === 'BSL'
      ? liveHigh >= level + tolerance
      : target.type === 'SSL' ? liveLow <= level - tolerance : false;
    const wrongSide = target.type === 'BSL' ? level <= price : target.type === 'SSL' ? level >= price : true;
    if (crossed || wrongSide) {
      touched.push({ ...target, status: 'LIVE_TOUCHED', touchedAt: Date.now() });
      continue;
    }
    active.push({ ...target, distanceFromPrice: Math.abs(level - price) });
  }

  active.sort((a, b) => a.distanceFromPrice - b.distanceFromPrice);
  const bslTarget = active.find(target => target.type === 'BSL');
  const sslTarget = active.find(target => target.type === 'SSL');
  const htf = result.htfNarrative?.htfBias || 'NEUTRAL';
  const drawTarget = htf === 'BULLISH'
    ? bslTarget || active[0] || null
    : htf === 'BEARISH'
      ? sslTarget || active[0] || null
      : active[0] || null;

  hierarchy.activeTargets = active;
  hierarchy.liveTouched = [
    ...(Array.isArray(hierarchy.liveTouched) ? hierarchy.liveTouched : []),
    ...touched
  ].slice(-30);
  hierarchy.drawTarget = drawTarget;
  hierarchy.summary = drawTarget
    ? `${htf === 'NEUTRAL' ? 'Target aktif terdekat' : `Target sesuai HTF ${htf.toLowerCase()}`} adalah ${drawTarget.type} di ${Number(drawTarget.level).toFixed(2)}.`
    : 'Tidak ada level BSL/SSL aktif yang masih berada pada sisi harga yang benar.';

  result.price = price;
  result.bsl = bslTarget?.level || 0;
  result.ssl = sslTarget?.level || 0;
  result.drawTarget = drawTarget;
  result.activeLiquidityTargets = active;
  result.liquidityHierarchy = hierarchy;
  return result;
}

export function zoneLiveStatus(zone, livePrice) {
  if (!zone) return 'TIDAK ADA';
  if (zone.status === 'BROKEN') return 'INVALID';
  const price = number(livePrice);
  const bottom = number(zone.bottom);
  const top = number(zone.top);
  if (![price, bottom, top].every(Number.isFinite)) return zone.status || 'UNKNOWN';
  if (zone.type === 'BEARISH' && price > top) return 'INVALID LIVE';
  if (zone.type === 'BULLISH' && price < bottom) return 'INVALID LIVE';
  if (price >= bottom && price <= top) return 'SEDANG DIUJI';
  if (zone.type === 'BEARISH' && price < bottom) return zone.status === 'FRESH' ? 'BELUM RETEST' : 'SUDAH DILEWATI';
  if (zone.type === 'BULLISH' && price > top) return zone.status === 'FRESH' ? 'BELUM RETEST' : 'SUDAH DILEWATI';
  return zone.status || 'AKTIF';
}

export function executionGuidance(htfBias, zone, hasActionableSetup = false) {
  if (hasActionableSetup) return 'Ada setup M15 yang lolos seluruh filter. Tunggu harga masuk area; jangan mengejar.';
  if (htfBias === 'BEARISH' && zone === 'DISCOUNT') {
    return 'HTF masih bearish, tetapi harga sudah di discount. Jangan mengejar SELL; tunggu retracement ke premium atau konfirmasi struktur baru.';
  }
  if (htfBias === 'BULLISH' && zone === 'PREMIUM') {
    return 'HTF masih bullish, tetapi harga sudah di premium. Jangan mengejar BUY; tunggu retracement ke discount atau konfirmasi struktur baru.';
  }
  if (zone === 'EQUILIBRIUM') return 'Harga berada dekat equilibrium. Tunggu harga memilih sisi range dan membentuk konfirmasi M15.';
  return 'Bias market hanya konteks, bukan perintah entry. Tunggu setup M15 yang memiliki area, invalidasi, dan target minimal 2R.';
}

export function candleFreshness(meta, tf, now = Date.now()) {
  if (!meta?.fetchedAt) return { state: 'CACHE', ageMs: Infinity, label: 'CACHE / BELUM DIVERIFIKASI' };
  const ageMs = Math.max(0, now - Number(meta.fetchedAt));
  const threshold = TF_FRESH_MS[tf] || 60 * 60_000;
  const fresh = ageMs <= threshold;
  return {
    state: fresh ? (meta.status === 'CLEANED' ? 'FRESH_CLEANED' : 'FRESH') : 'STALE',
    ageMs,
    label: fresh
      ? meta.status === 'CLEANED' ? 'FRESH • DATA DIBERSIHKAN' : 'FRESH'
      : 'STALE'
  };
}

export function timeframeRole(tf) {
  if (tf === 'M15') return 'EXECUTION';
  if (tf === 'M1' || tf === 'M5') return 'KONFIRMASI';
  return 'KONTEKS';
}
