export const SCALPER_TERMINAL_STATUSES = Object.freeze([
  'TP_HIT', 'SL_HIT', 'BE_HIT', 'TIME_EXIT', 'INVALIDATED', 'CANCELLED'
]);

const TERMINAL = new Set(SCALPER_TERMINAL_STATUSES);
const STATUS_SEQUENCE = Object.freeze({
  WAITING_TRIGGER: 5,
  WAITING_NEXT_OPEN: 10,
  ENTRY_READY: 15,
  ACTIVE: 20,
  BE_ACTIVE: 30,
  TP_HIT: 100,
  SL_HIT: 100,
  BE_HIT: 100,
  TIME_EXIT: 100,
  INVALIDATED: 100,
  CANCELLED: 100
});

function timestamp(value) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 10_000_000_000) return number;
  if (Number.isFinite(number) && number > 0) return number * 1000;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function setupTime(setup) {
  return timestamp(
    setup?.exitTime
    || setup?.updatedAt
    || setup?.updated_at
    || setup?.signalCandleCloseTime
    || setup?.sourceCandleTimestamp
  );
}

export function isScalperTerminal(status) {
  return TERMINAL.has(String(status || '').toUpperCase());
}

export function newestScalperSetup(current, incoming) {
  if (!current) return incoming || null;
  if (!incoming) return current;
  if (String(current.id || '') !== String(incoming.id || '')) return incoming;

  const currentTerminal = isScalperTerminal(current.status);
  const incomingTerminal = isScalperTerminal(incoming.status);
  if (currentTerminal && !incomingTerminal) return current;
  if (incomingTerminal && !currentTerminal) return incoming;

  const currentUpdated = timestamp(current.updatedAt || current.updated_at);
  const incomingUpdated = timestamp(incoming.updatedAt || incoming.updated_at);
  if (incomingUpdated !== currentUpdated) return incomingUpdated > currentUpdated ? incoming : current;

  const currentSequence = Number(current.lifecycleSequence ?? STATUS_SEQUENCE[current.status] ?? 0);
  const incomingSequence = Number(incoming.lifecycleSequence ?? STATUS_SEQUENCE[incoming.status] ?? 0);
  if (incomingSequence !== currentSequence) return incomingSequence > currentSequence ? incoming : current;

  const currentEntry = timestamp(current.entryTimestamp || current.entryCandleOpenTime);
  const incomingEntry = timestamp(incoming.entryTimestamp || incoming.entryCandleOpenTime);
  if (incomingEntry !== currentEntry) return incomingEntry > currentEntry ? incoming : current;

  const currentSource = timestamp(current.sourceCandleTimestamp || current.signalCandleCloseTime);
  const incomingSource = timestamp(incoming.sourceCandleTimestamp || incoming.signalCandleCloseTime);
  return incomingSource >= currentSource ? incoming : current;
}

function uniqueById(values) {
  const output = [];
  const seen = new Set();
  for (const value of values) {
    const id = String(value?.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(value);
  }
  return output;
}

function payloadSetups(payload) {
  return uniqueById([
    ...(Array.isArray(payload?.active) ? payload.active : []),
    ...(Array.isArray(payload?.history) ? payload.history : []),
    ...(Array.isArray(payload?.recent) ? payload.recent : []),
    payload?.primary,
    payload?.selected
  ].filter(Boolean));
}

function sortedHistory(values) {
  return uniqueById(values)
    .filter(setup => setup && isScalperTerminal(setup.status))
    .sort((a, b) => setupTime(b) - setupTime(a));
}

export function reconcileScalperPayload(previous, incoming) {
  if (!incoming || incoming.ok !== true) return previous || null;
  if (!previous || previous.ok !== true) {
    const history = sortedHistory([
      ...(incoming.history || []),
      ...(incoming.recent || []),
      ...(incoming.active || []).filter(setup => isScalperTerminal(setup?.status)),
      incoming.selected
    ]);
    return { ...incoming, history, recent: history };
  }

  const previousGenerated = timestamp(previous.generatedAt);
  const incomingGenerated = timestamp(incoming.generatedAt);
  if (previousGenerated && incomingGenerated && incomingGenerated < previousGenerated) return previous;

  const mergedById = new Map();
  for (const setup of payloadSetups(previous)) mergedById.set(String(setup.id), setup);
  for (const setup of payloadSetups(incoming)) {
    const id = String(setup.id || '');
    if (!id) continue;
    mergedById.set(id, newestScalperSetup(mergedById.get(id), setup));
  }

  const incomingActiveIds = (incoming.active || [])
    .map(setup => String(setup?.id || ''))
    .filter(Boolean);
  const previousActiveIds = (previous.active || [])
    .map(setup => String(setup?.id || ''))
    .filter(Boolean);
  const activeIds = uniqueById([...incomingActiveIds, ...previousActiveIds].map(id => ({ id }))).map(item => item.id);
  const active = activeIds
    .map(id => mergedById.get(id))
    .filter(setup => setup && !isScalperTerminal(setup.status));

  const history = sortedHistory([...mergedById.values()]);
  const primaryId = String(incoming.primary?.id || previous.primary?.id || '');
  const primary = (primaryId ? mergedById.get(primaryId) : null) || active[0] || null;
  const selectedId = String(incoming.selected?.id || previous.selected?.id || '');
  const selected = selectedId ? mergedById.get(selectedId) || null : null;

  return {
    ...previous,
    ...incoming,
    primary,
    selected,
    active,
    history,
    recent: history,
    historyCount: Math.max(Number(incoming.historyCount || 0), history.length)
  };
}

export function scalperFreshness(payload, error = '', now = Date.now()) {
  if (error || !payload?.ok || String(payload?.engine?.status || '').toUpperCase() === 'FAILED') {
    return payload?.history?.length || payload?.recent?.length ? 'STORED' : 'DATA BELUM TERSEDIA';
  }
  const sourceTime = timestamp(payload?.engine?.completed_at || payload?.engine?.started_at || payload.generatedAt);
  if (!sourceTime || now - sourceTime > 150_000) return 'STALE';
  if (!payload.primary && !(payload.active || []).length && !(payload.history || payload.recent || []).length) return 'MENUNGGU SETUP';
  return 'LIVE';
}

export function scalperPayloadSignature(payload, availability = '') {
  const setupShape = setup => setup ? {
    id: setup.id,
    driverId: setup.driverId,
    driverName: setup.driverName,
    timeframe: setup.timeframe,
    direction: setup.direction,
    status: setup.status,
    recommendationStatus: setup.recommendationStatus,
    updatedAt: setup.updatedAt,
    lifecycleSequence: setup.lifecycleSequence,
    tp1Hit: setup.tp1Hit === true,
    entry: setup.entry,
    stopLoss: setup.stopLoss,
    tp1: setup.tp1,
    target: setup.target,
    resultR: setup.resultR,
    barsElapsed: setup.barsElapsed,
    stopBasis: setup.stopBasis,
    patternGate: setup.patternGate,
    baseConfigVersion: setup.baseConfigVersion,
    repairConfigVersion: setup.repairConfigVersion,
    amdConfigVersion: setup.amdConfigVersion
  } : null;
  return JSON.stringify({
    availability,
    primary: setupShape(payload?.primary),
    selected: setupShape(payload?.selected),
    active: (payload?.active || []).map(setupShape),
    history: (payload?.history || payload?.recent || []).map(setupShape)
  });
}
