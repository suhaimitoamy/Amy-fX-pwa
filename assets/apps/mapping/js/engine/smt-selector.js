function seconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number > 100_000_000_000 ? Math.floor(number / 1000) : Math.floor(number);
}

function normalize(rows) {
  const unique = new Map();
  for (const raw of Array.isArray(rows) ? rows : []) {
    if (!raw || raw.isClosed === false || raw.is_closed === false) continue;
    const openTime = seconds(raw.open_time ?? raw.time ?? raw.timestamp);
    const closeTime = seconds(raw.close_time ?? raw.amyfxClosedAt) || openTime + 900;
    const open = Number(raw.open), high = Number(raw.high), low = Number(raw.low), close = Number(raw.close);
    if (!openTime || ![open, high, low, close].every(Number.isFinite)) continue;
    unique.set(openTime, { open_time: openTime, close_time: closeTime, open, high, low, close });
  }
  return [...unique.values()].sort((a, b) => a.open_time - b.open_time);
}

function strictPivot(rows, index, side) {
  if (index < 1 || index + 1 >= rows.length) return false;
  const value = side === 'HIGH' ? rows[index].high : rows[index].low;
  return side === 'HIGH'
    ? value > rows[index - 1].high && value > rows[index + 1].high
    : value < rows[index - 1].low && value < rows[index + 1].low;
}

function latestConfirmedPivot(rows, beforeIndex, side) {
  for (let index = beforeIndex - 1; index >= 1; index -= 1) {
    if (strictPivot(rows, index, side)) {
      return { index, level: side === 'HIGH' ? rows[index].high : rows[index].low, time: rows[index].close_time };
    }
  }
  return null;
}

function unavailable(reason, extra = {}) {
  return {
    state: 'UNAVAILABLE',
    label: 'SMT unavailable',
    direction: 'NEUTRAL',
    authority: 'EVIDENCE_ONLY',
    entryAuthority: false,
    mayOverrideMapping: false,
    reason,
    ...extra
  };
}

export function classifyXauDxySmt({ xauM15 = [], dxyM15 = [] } = {}) {
  const xau = normalize(xauM15);
  const dxy = normalize(dxyM15);
  if (xau.length < 5) return unavailable('XAU M15 belum cukup untuk SMT.');
  if (dxy.length < 5) return unavailable('DXY M15 belum tersedia; engine lain tetap berjalan normal.');

  const signal = xau.at(-1);
  const dxyIndex = dxy.findIndex(row => row.close_time === signal.close_time);
  if (dxyIndex < 2) return unavailable('DXY M15 tidak sinkron pada completed bar XAU yang sama.', { sourceCandleTime: signal.close_time });

  const xauIndex = xau.length - 1;
  const xauHigh = latestConfirmedPivot(xau, xauIndex, 'HIGH');
  const xauLow = latestConfirmedPivot(xau, xauIndex, 'LOW');
  const dxyHigh = latestConfirmedPivot(dxy, dxyIndex, 'HIGH');
  const dxyLow = latestConfirmedPivot(dxy, dxyIndex, 'LOW');
  if (!xauHigh || !xauLow || !dxyHigh || !dxyLow) {
    return unavailable('Confirmed swing XAU/DXY belum lengkap.', { sourceCandleTime: signal.close_time });
  }

  const dxySignal = dxy[dxyIndex];
  const xauTookHigh = signal.high > xauHigh.level;
  const xauTookLow = signal.low < xauLow.level;
  if (xauTookHigh === xauTookLow) {
    return {
      state: xauTookHigh ? 'AMBIGUOUS' : 'NO_OPPORTUNITY',
      label: xauTookHigh ? 'SMT ambiguous' : 'Tidak ada SMT opportunity',
      direction: 'NEUTRAL',
      authority: 'EVIDENCE_ONLY',
      entryAuthority: false,
      mayOverrideMapping: false,
      sourceCandleTime: signal.close_time,
      reason: xauTookHigh ? 'XAU menembus dua sisi swing pada bar yang sama.' : 'XAU belum melakukan first penetration swing pada bar ini.'
    };
  }

  const expectedInversePenetration = xauTookHigh
    ? dxySignal.low < dxyLow.level
    : dxySignal.high > dxyHigh.level;
  const direction = xauTookHigh ? 'BEARISH' : 'BULLISH';
  const state = expectedInversePenetration ? 'SYNC_CONFIRM_CONTROL' : direction === 'BULLISH' ? 'SMT_BULLISH' : 'SMT_BEARISH';
  return {
    state,
    label: state === 'SYNC_CONFIRM_CONTROL' ? 'XAU–DXY synchronized' : state.replace('_', ' '),
    direction: state === 'SYNC_CONFIRM_CONTROL' ? 'NEUTRAL' : direction,
    authority: 'EVIDENCE_ONLY',
    entryAuthority: false,
    mayOverrideMapping: false,
    source: 'XAU_DXY_M15_SAME_COMPLETED_BAR',
    sourceCandleTime: signal.close_time,
    xauOpportunity: xauTookHigh ? 'XAU_HIGH_PENETRATION' : 'XAU_LOW_PENETRATION',
    xauLevel: xauTookHigh ? xauHigh.level : xauLow.level,
    dxyExpectedLevel: xauTookHigh ? dxyLow.level : dxyHigh.level,
    dxyExpectedInversePenetration: expectedInversePenetration,
    summary: state === 'SYNC_CONFIRM_CONTROL'
      ? 'DXY ikut melakukan penetrasi inverse pada completed M15 yang sama; tidak ada divergence SMT.'
      : `${state === 'SMT_BULLISH' ? 'Bullish' : 'Bearish'} SMT terdeteksi sebagai evidence reversal saja; tidak mengubah Final Bias, Next Move, Entry Map, atau engine lain.`
  };
}
