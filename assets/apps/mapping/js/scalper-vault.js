import { isScalperTerminal, newestScalperSetup } from './scalper-shadow-state.js';

export const LEGACY_SCALPER_HISTORY_KEY = 'amyfx.preview.scalper.permanent-history.v1';
export const SCALPER_VAULT_DB_NAME = 'amyfx.pro.scalper.vault.v1';
export const SCALPER_VAULT_SCHEMA_VERSION = 1;

const DB_VERSION = 1;
const STORE_NAME = 'terminal-setups';

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

export function mergeScalperHistory(...collections) {
  const byId = new Map();
  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    for (const setup of collection) {
      const id = String(setup?.id || '');
      if (!id || !isScalperTerminal(setup?.status)) continue;
      byId.set(id, newestScalperSetup(byId.get(id), setup));
    }
  }
  return [...byId.values()].sort((a, b) => setupTime(b) - setupTime(a));
}

export function scalperTradeOutcome(setup) {
  const current = String(setup?.status || '').toUpperCase();
  if (setup?.engineVersion === 'amyfx-six-drivers-pro382') {
    if (setup.outcomeAmbiguous || !['TP_HIT','SL_HIT','BE_HIT','TIME_EXIT'].includes(current) || setup.resultR == null || !Number.isFinite(Number(setup.resultR))) return null;
    return Number(setup.resultR) > 0 ? 'WIN' : Number(setup.resultR) < 0 ? 'LOSS' : 'BE';
  }
  if (current === 'TP_HIT') return 'WIN';
  if (current === 'SL_HIT') return 'LOSS';
  if (current === 'BE_HIT') return 'BE';
  if (current !== 'TIME_EXIT') return null;

  const result = Number(setup?.resultR);
  if (Number.isFinite(result) && result > 0) return 'WIN';
  if (Number.isFinite(result) && result < 0) return 'LOSS';
  return 'BE';
}

export function scalperVaultStats(history) {
  const archive = mergeScalperHistory(history);
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let netR = 0;
  let resultSamples = 0;

  for (const setup of archive) {
    const outcome = scalperTradeOutcome(setup);
    if (outcome === 'WIN') wins += 1;
    else if (outcome === 'LOSS') losses += 1;
    else if (outcome === 'BE') breakeven += 1;
    else continue;

    const result = Number(setup?.resultR);
    if (Number.isFinite(result)) {
      netR += result;
      resultSamples += 1;
    }
  }

  const resolved = wins + losses;
  const totalTrades = resolved + breakeven;
  const denominator = archive.some(s => s.engineVersion === 'amyfx-six-drivers-pro382') ? totalTrades : resolved;
  return Object.freeze({
    archiveCount: archive.length,
    totalTrades,
    wins,
    losses,
    breakeven,
    excludedSetups: Math.max(0, archive.length - totalTrades),
    resolved,
    winRate: denominator > 0 ? (wins / denominator) * 100 : null,
    netR: resultSamples > 0 ? netR : null,
    resultSamples
  });
}

export function readLegacyScalperHistory() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(LEGACY_SCALPER_HISTORY_KEY) || '{}');
    return mergeScalperHistory(Array.isArray(parsed?.history) ? parsed.history : []);
  } catch (_) {
    return [];
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('indexeddb_unavailable'));
      return;
    }
    const request = globalThis.indexedDB.open(SCALPER_VAULT_DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('indexeddb_open_failed'));
    request.onblocked = () => reject(new Error('indexeddb_blocked'));
  });
}

async function readIndexedHistory() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(mergeScalperHistory(request.result || []));
      request.onerror = () => reject(request.error || new Error('indexeddb_read_failed'));
    });
  } finally {
    db.close();
  }
}

async function writeIndexedHistory(history) {
  const archive = mergeScalperHistory(history);
  if (!archive.length) return 0;
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      for (const setup of archive) store.put(setup);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('indexeddb_write_failed'));
      transaction.onabort = () => reject(transaction.error || new Error('indexeddb_write_aborted'));
    });
    return archive.length;
  } finally {
    db.close();
  }
}

function mirrorLegacyHistory(history, generatedAt = new Date().toISOString()) {
  const archive = mergeScalperHistory(history);
  if (!archive.length) return false;
  try {
    globalThis.localStorage?.setItem(LEGACY_SCALPER_HISTORY_KEY, JSON.stringify({ generatedAt, history: archive }));
    return true;
  } catch (_) {
    // Never clear or truncate the old key on quota failure. IndexedDB remains authoritative.
    return false;
  }
}

export async function loadScalperVault() {
  const legacy = readLegacyScalperHistory();
  let indexed = [];
  try {
    indexed = await readIndexedHistory();
  } catch (_) {}

  const archive = mergeScalperHistory(indexed, legacy);
  if (archive.length && archive.length > indexed.length) {
    try { await writeIndexedHistory(archive); } catch (_) {}
  }
  return archive;
}

export async function persistScalperVault(history, generatedAt = new Date().toISOString()) {
  const current = mergeScalperHistory(history);
  if (!current.length) return { saved: 0, indexed: false, mirrored: false };

  let existing = [];
  try { existing = await readIndexedHistory(); } catch (_) {}
  const archive = mergeScalperHistory(existing, readLegacyScalperHistory(), current);

  let indexed = false;
  try {
    await writeIndexedHistory(archive);
    indexed = true;
  } catch (_) {}

  const mirrored = mirrorLegacyHistory(archive, generatedAt);
  return { saved: archive.length, indexed, mirrored };
}
