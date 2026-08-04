const BUY = 'BUY';
const SELL = 'SELL';
const WAIT = 'WAIT';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDirection(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'BUY' || text === 'BULLISH' || text === 'BULL') return BUY;
  if (text === 'SELL' || text === 'BEARISH' || text === 'BEAR') return SELL;
  return WAIT;
}

function latestPair(values, field) {
  const rows = (Array.isArray(values) ? values : [])
    .map(item => ({ ...item, value: finite(item?.[field]) }))
    .filter(item => item.value !== null)
    .sort((a, b) => Number(a.index ?? a.time ?? 0) - Number(b.index ?? b.time ?? 0));
  if (rows.length < 2) return null;
  return [rows.at(-2), rows.at(-1)];
}

export function classifySwingSequence(result) {
  const swings = result?.structureSwings || result?.swings || {};
  const highs = latestPair(swings.highs, 'high');
  const lows = latestPair(swings.lows, 'low');
  const highShape = highs
    ? highs[1].value > highs[0].value ? 'HH' : highs[1].value < highs[0].value ? 'LH' : 'EQH'
    : 'UNKNOWN';
  const lowShape = lows
    ? lows[1].value > lows[0].value ? 'HL' : lows[1].value < lows[0].value ? 'LL' : 'EQL'
    : 'UNKNOWN';

  let bias = WAIT;
  if (highShape === 'HH' && lowShape === 'HL') bias = BUY;
  else if (highShape === 'LH' && lowShape === 'LL') bias = SELL;

  return {
    bias,
    highShape,
    lowShape,
    latestHigh: highs?.[1]?.value ?? null,
    latestLow: lows?.[1]?.value ?? null,
    bullishInvalidation: lows?.[1]?.value ?? null,
    bearishInvalidation: highs?.[1]?.value ?? null
  };
}

function existingMappingBias(result) {
  const candidates = [
    result?.mappingBias?.direction,
    result?.mappingBias?.bias,
    result?.final,
    result?.biasEvidence?.mappingBias,
    result?.biasEvidence?.final,
    result?.bias
  ];
  for (const candidate of candidates) {
    const direction = normalizeDirection(candidate);
    if (direction !== WAIT) return direction;
  }
  return WAIT;
}

function confirmedStructureBias(result) {
  const structure = result?.st || result?.structure || {};
  const major = structure?.lastMajorBreak;
  if (major && major.failed !== true && major.valid !== false) {
    const majorDirection = normalizeDirection(major.dir || major.direction);
    if (majorDirection !== WAIT) return majorDirection;
  }
  return normalizeDirection(structure?.confirmedTrend || structure?.trend);
}

function closedPrice(result) {
  return finite(
    result?.sourceCandleClose
    ?? result?.mappingBias?.sourceCandleClose
    ?? result?.lastClosedCandle?.close
  );
}

function previousDirection(previous) {
  return normalizeDirection(previous?.bias || previous?.direction || previous);
}

export function resolveMappingBias(result, previous = null) {
  if (!result) {
    return {
      bias: WAIT,
      source: 'NO_DATA',
      structure: classifySwingSequence(null),
      invalidationLevel: null,
      previousInvalidated: false,
      reason: 'Data Mapping belum tersedia.'
    };
  }

  const sequence = classifySwingSequence(result);
  const mappingBias = existingMappingBias(result);
  const structureBias = confirmedStructureBias(result);
  const prior = previousDirection(previous);
  const close = closedPrice(result);

  let selected = mappingBias !== WAIT
    ? mappingBias
    : sequence.bias !== WAIT
      ? sequence.bias
      : structureBias !== WAIT
        ? structureBias
        : prior;
  let source = mappingBias !== WAIT
    ? 'EXISTING_MAPPING_BIAS'
    : sequence.bias !== WAIT
      ? 'HH_HL_LH_LL'
      : structureBias !== WAIT
        ? 'CONFIRMED_STRUCTURE'
        : prior !== WAIT
          ? 'LAST_VALID_BIAS'
          : 'NO_CLEAR_STRUCTURE';
  let previousInvalidated = false;

  if (prior === BUY && close !== null && sequence.bullishInvalidation !== null && close < sequence.bullishInvalidation) {
    previousInvalidated = true;
    if (structureBias === SELL || sequence.bias === SELL) {
      selected = SELL;
      source = 'BULLISH_HL_INVALIDATED';
    }
  }
  if (prior === SELL && close !== null && sequence.bearishInvalidation !== null && close > sequence.bearishInvalidation) {
    previousInvalidated = true;
    if (structureBias === BUY || sequence.bias === BUY) {
      selected = BUY;
      source = 'BEARISH_LH_INVALIDATED';
    }
  }

  const invalidationLevel = selected === BUY
    ? sequence.bullishInvalidation
    : selected === SELL
      ? sequence.bearishInvalidation
      : null;
  const reason = selected === WAIT
    ? 'Struktur HH/HL atau LH/LL belum cukup terbentuk.'
    : `${selected} dari ${source}; struktur ${sequence.highShape}/${sequence.lowShape}${invalidationLevel !== null ? `, invalidasi close ${selected === BUY ? 'di bawah' : 'di atas'} ${invalidationLevel}` : ''}.`;

  return {
    bias: selected,
    source,
    structure: sequence,
    invalidationLevel,
    previousInvalidated,
    reason
  };
}

export { normalizeDirection as normalizeBiasDirection };
