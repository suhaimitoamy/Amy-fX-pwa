export const SUPPORTED_MAPPING_TIMEFRAMES = Object.freeze([
  'M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'
]);

export const TIMEFRAME_SECONDS = Object.freeze({
  M1: 60,
  M5: 5 * 60,
  M15: 15 * 60,
  M30: 30 * 60,
  H1: 60 * 60,
  H4: 4 * 60 * 60,
  D1: 24 * 60 * 60,
  W1: 7 * 24 * 60 * 60
});

export const TIMEFRAME_CONTEXT = Object.freeze({
  M1: 'M5',
  M5: 'H4',
  M15: 'H4',
  M30: 'H4',
  H1: 'H4',
  H4: 'D1',
  D1: 'W1',
  W1: null
});

const profile = ({
  tf,
  sweepMemoryBars,
  expiryBars,
  sessionMode = 'NONE',
  contextTimeframe = TIMEFRAME_CONTEXT[tf]
}) => Object.freeze({
  timeframe: tf,
  sourceTimeframe: tf,
  triggerTimeframe: tf,
  contextTimeframe,
  swingLength: 4,
  slowSwingLength: 6,
  atrLength: 14,
  sweepMemoryBars,
  expiryBars,
  sessionMode,
  sessionRequired: sessionMode !== 'NONE',
  slAtrPad: 0.50,
  tp1R: 1,
  minimumTargetR: 2,
  maximumTargetR: 8,
  maximumRiskAtr: 6,
  minimumCandles: 100
});

export const TIMEFRAME_ENTRY_PROFILES = Object.freeze({
  M1: profile({ tf: 'M1', sweepMemoryBars: 36, expiryBars: 48, sessionMode: 'LONDON_OR_NEW_YORK' }),
  M5: profile({ tf: 'M5', sweepMemoryBars: 36, expiryBars: 48, sessionMode: 'LONDON_OR_NEW_YORK' }),
  M15: profile({ tf: 'M15', sweepMemoryBars: 12, expiryBars: 36, sessionMode: 'LONDON_OR_NEW_YORK' }),
  M30: profile({ tf: 'M30', sweepMemoryBars: 12, expiryBars: 36, sessionMode: 'LONDON_OR_NEW_YORK' }),
  H1: profile({ tf: 'H1', sweepMemoryBars: 18, expiryBars: 36, sessionMode: 'NEW_YORK_ONLY' }),
  H4: profile({ tf: 'H4', sweepMemoryBars: 12, expiryBars: 24 }),
  D1: profile({ tf: 'D1', sweepMemoryBars: 8, expiryBars: 12 }),
  W1: profile({ tf: 'W1', sweepMemoryBars: 6, expiryBars: 8, contextTimeframe: null })
});

export function normalizeMappingTimeframe(value) {
  const text = String(value || '').toUpperCase().replaceAll(' ', '');
  const aliases = {
    '1': 'M1',
    '1MIN': 'M1',
    '5': 'M5',
    '5MIN': 'M5',
    '15': 'M15',
    '15MIN': 'M15',
    '30': 'M30',
    '30MIN': 'M30',
    '60': 'H1',
    '1H': 'H1',
    '1HOUR': 'H1',
    '4H': 'H4',
    '4HOUR': 'H4',
    '1DAY': 'D1',
    '1D': 'D1',
    '1WEEK': 'W1',
    '1W': 'W1'
  };
  return aliases[text] || text;
}

export function isSupportedMappingTimeframe(value) {
  return SUPPORTED_MAPPING_TIMEFRAMES.includes(normalizeMappingTimeframe(value));
}

export function entryProfileFor(value) {
  return TIMEFRAME_ENTRY_PROFILES[normalizeMappingTimeframe(value)] || null;
}

export function timeframeDurationMs(value) {
  return (TIMEFRAME_SECONDS[normalizeMappingTimeframe(value)] || 0) * 1000;
}

export function expectedClosedCandleOpenTime(value, nowMs = Date.now(), graceMs = 10_000) {
  const timeframe = normalizeMappingTimeframe(value);
  const seconds = TIMEFRAME_SECONDS[timeframe] || 0;
  if (!seconds) return 0;
  const safeNowSeconds = Math.floor((nowMs - graceMs) / 1000);
  if (timeframe === 'W1') {
    const mondayUtcAnchorSeconds = 4 * 24 * 60 * 60;
    const currentWeekOpen = Math.floor(
      (safeNowSeconds - mondayUtcAnchorSeconds) / seconds
    ) * seconds + mondayUtcAnchorSeconds;
    return currentWeekOpen - seconds;
  }
  return Math.floor(safeNowSeconds / seconds) * seconds - seconds;
}
