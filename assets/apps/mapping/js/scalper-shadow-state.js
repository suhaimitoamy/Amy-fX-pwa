export const SCALPER_TERMINAL_STATUSES = Object.freeze([
  'TP_HIT',
  'SL_HIT',
  'BE_HIT',
  'TIME_EXIT',
  'INVALIDATED',
  'CANCELLED'
]);

const TERMINAL = new Set(SCALPER_TERMINAL_STATUSES);
const STATUS_SEQUENCE = Object.freeze({
  WAITING_NEXT_OPEN: 10,
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
    ...(Array.isArray(payload?.recent) ? payload.recent : []),
    payload?.primary
  ].filter(Boolean));
}

export function reconcileScalperPayload(previous, incoming) {
  if (!incoming || incoming.ok !== true) return previous || null;
  if (!previous || previous.ok !== true) return incoming;

  const previousGenerated = timestamp(previous.generatedAt);
  const incomingGenerated = timestamp(incoming.generatedAt);
  if (previousGenerated && incomingGenerated && incomingGenerated < previousGenerated) return previous;

  const previousById = new Map(payloadSetups(previous).map(setup => [String(setup.id), setup]));
  const reconciledById = new Map();
  for (const setup of payloadSetups(incoming)) {
    const id = String(setup.id);
    reconciledById.set(id, newestScalperSetup(previousById.get(id), setup));
  }

  const incomingActiveIds = (incoming.active || []).map(setup => String(setup?.id || '')).filter(Boolean);
  const incomingRecentIds = (incoming.recent || []).map(setup => String(setup?.id || '')).filter(Boolean);
  const active = uniqueById(incomingActiveIds
    .map(id => reconciledById.get(id))
    .filter(setup => setup && !isScalperTerminal(setup.status)));
  const recent = uniqueById([
    ...incomingRecentIds.map(id => reconciledById.get(id)),
    ...incomingActiveIds.map(id => reconciledById.get(id)).filter(setup => isScalperTerminal(setup?.status))
  ].filter(setup => setup && isScalperTerminal(setup.status)));

  const primaryId = String(incoming.primary?.id || '');
  const primary = (primaryId ? reconciledById.get(primaryId) : null) || active[0] || recent[0] || null;
  return { ...incoming, primary, active, recent };
}

export function scalperFreshness(payload, error = '', now = Date.now()) {
  if (error) return 'DATA BELUM TERSEDIA';
  if (!payload?.ok) return 'DATA BELUM TERSEDIA';
  if (String(payload?.engine?.status || '').toUpperCase() === 'FAILED') return 'DATA BELUM TERSEDIA';
  const sourceTime = timestamp(payload?.engine?.completed_at || payload?.engine?.started_at || payload.generatedAt);
  if (!sourceTime || now - sourceTime > 150_000) return 'STALE';
  if (!payload.primary && !(payload.active || []).length && !(payload.recent || []).length) return 'MENUNGGU SETUP';
  return 'LIVE';
}

export function scalperPayloadSignature(payload, availability = '') {
  const setupShape = setup => setup ? {
    id: setup.id,
    status: setup.status,
    recommendationStatus: setup.recommendationStatus,
    updatedAt: setup.updatedAt,
    entry: setup.entry,
    stopLoss: setup.stopLoss,
    target: setup.target,
    resultR: setup.resultR,
    barsElapsed: setup.barsElapsed,
    stopBasis: setup.stopBasis
  } : null;
  return JSON.stringify({
    availability,
    primary: setupShape(payload?.primary),
    active: (payload?.active || []).map(setupShape),
    recent: (payload?.recent || []).map(setupShape)
  });
}
