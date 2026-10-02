function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function directionOf(event) {
  const value = event?.direction ?? event?.dir ?? event?.directionValue;
  if (value === 1 || String(value).toUpperCase().includes('BULL')) return 'BULLISH';
  if (value === -1 || String(value).toUpperCase().includes('BEAR')) return 'BEARISH';
  return 'NEUTRAL';
}

function eventLevel(event) {
  return number(event?.level ?? event?.price ?? event?.brokenLevel ?? event?.broken_level);
}

export function classifySweepAcceptance({ amySmcD = null, sourceCandle = null } = {}) {
  const descriptive = amySmcD?.descriptive || {};
  const predictive = amySmcD?.predictive || {};
  const candle = sourceCandle || amySmcD?.sourceCandle || {};
  const rawSweep = descriptive?.liquidity?.rawSweep || predictive?.sweepContinuation?.rawSweep || null;
  const validBreak = predictive?.qualifiedValidBreak || predictive?.rawValidBreak || null;

  if (rawSweep) {
    const level = eventLevel(rawSweep);
    const close = number(candle?.close);
    const side = String(rawSweep?.side || rawSweep?.liquiditySide || rawSweep?.kind || '').toUpperCase();
    const reclaimed = level == null || close == null
      ? true
      : side.includes('BSL') || side.includes('HIGH')
        ? close < level
        : side.includes('SSL') || side.includes('LOW')
          ? close > level
          : true;
    return {
      state: reclaimed ? 'SWEEP_REJECTION' : 'SWEEP_UNCONFIRMED',
      label: reclaimed ? 'Sweep + Rejection' : 'Sweep belum reclaim',
      direction: directionOf(rawSweep),
      level,
      authority: 'CONTEXT_ONLY',
      entryAuthority: false,
      source: 'AMY_SMC_D_LIQUIDITY',
      summary: reclaimed
        ? 'Liquidity sudah diambil dan candle kembali ke sisi level; tunggu displacement/MSS/retest sebelum entry.'
        : 'Liquidity tersapu tetapi reclaim belum cukup jelas; konteks tetap menunggu.'
    };
  }

  if (validBreak) {
    const direction = directionOf(validBreak);
    const level = eventLevel(validBreak);
    return {
      state: predictive?.qualifiedValidBreak ? 'BREAK_ACCEPTANCE' : 'BREAK_CANDIDATE',
      label: predictive?.qualifiedValidBreak ? 'Break + Acceptance' : 'Break terdeteksi',
      direction,
      level,
      authority: 'CONTEXT_ONLY',
      entryAuthority: false,
      source: predictive?.qualifiedValidBreak ? 'AMY_SMC_D_QUALIFIED_VALID_BREAK' : 'AMY_SMC_D_RAW_VALID_BREAK',
      summary: predictive?.qualifiedValidBreak
        ? 'Break sudah lolos qualifier baseline; tunggu retest/continuation evidence, bukan mengejar candle break.'
        : 'Break raw sudah terlihat tetapi belum lolos qualifier; jangan diperlakukan sebagai acceptance final.'
    };
  }

  return {
    state: 'WAITING_LEVEL_REACTION',
    label: 'Menunggu reaksi level',
    direction: 'NEUTRAL',
    level: null,
    authority: 'CONTEXT_ONLY',
    entryAuthority: false,
    source: 'AMY_SMC_D',
    summary: 'Belum ada sweep/rejection atau break/acceptance baru. Context struktur dan level tetap aktif.'
  };
}
