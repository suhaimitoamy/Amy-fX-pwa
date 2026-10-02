/* Amy FX Trading Practice — local-first IndexedDB storage with archive-pack support. */
(function (root) {
  'use strict';

  if (root.AmyPracticeStorage) return;

  var DB_NAME = 'amy_fx_trading_practice_v1';
  var DB_VERSION = 2;
  var FALLBACK_PREFIX = 'amy.practice.v1.';
  var STORES = Object.freeze({
    datasets: 'datasets',
    trades: 'trades',
    guided: 'guidedResults',
    packs: 'historicalPacks',
    packFiles: 'historicalPackFiles'
  });
  var dbPromise = null;

  function fallbackKey(store) { return FALLBACK_PREFIX + store; }

  function readFallback(store) {
    try {
      var value = JSON.parse(localStorage.getItem(fallbackKey(store)) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }

  function writeFallback(store, items) {
    localStorage.setItem(fallbackKey(store), JSON.stringify(items));
  }

  function openDb() {
    if (!root.indexedDB) return Promise.reject(new Error('IndexedDB unavailable'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORES.datasets)) db.createObjectStore(STORES.datasets, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORES.trades)) {
          var trades = db.createObjectStore(STORES.trades, { keyPath: 'id' });
          trades.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(STORES.guided)) db.createObjectStore(STORES.guided, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORES.packs)) {
          var packs = db.createObjectStore(STORES.packs, { keyPath: 'id' });
          packs.createIndex('start', 'start');
          packs.createIndex('importedAt', 'importedAt');
        }
        if (!db.objectStoreNames.contains(STORES.packFiles)) db.createObjectStore(STORES.packFiles, { keyPath: 'id' });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('IndexedDB gagal dibuka')); };
      request.onblocked = function () { reject(new Error('Upgrade database Practice terblokir. Tutup halaman Practice lain lalu coba lagi.')); };
    });
    return dbPromise;
  }

  async function withStore(store, mode, operation) {
    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(store, mode);
      var objectStore = transaction.objectStore(store);
      var request;
      var result;
      transaction.oncomplete = function () { resolve(result); };
      transaction.onerror = function () { reject(transaction.error || new Error('Transaksi penyimpanan gagal')); };
      transaction.onabort = function () { reject(transaction.error || new Error('Transaksi penyimpanan dibatalkan')); };
      try { request = operation(objectStore); }
      catch (error) {
        try { transaction.abort(); } catch (_) {}
        reject(error);
        return;
      }
      request.onsuccess = function () { result = request.result; };
      request.onerror = function () { reject(request.error || new Error('Operasi penyimpanan gagal')); };
    });
  }

  async function put(store, value) {
    try {
      await withStore(store, 'readwrite', function (objectStore) { return objectStore.put(value); });
      return value;
    } catch (_) {
      if (store === STORES.packs || store === STORES.packFiles) throw _;
      var items = readFallback(store).filter(function (item) { return item && item.id !== value.id; });
      items.push(value);
      writeFallback(store, items);
      return value;
    }
  }

  function newest(primary, fallback) {
    if (!primary) return fallback || null;
    if (!fallback) return primary;
    return Number(fallback.updatedAt || fallback.createdAt || 0) > Number(primary.updatedAt || primary.createdAt || 0) ? fallback : primary;
  }

  async function get(store, id) {
    try {
      var value = await withStore(store, 'readonly', function (objectStore) { return objectStore.get(id); });
      if (store === STORES.packs || store === STORES.packFiles) return value || null;
      return newest(value, readFallback(store).find(function (item) { return item && item.id === id; }));
    }
    catch (_) {
      if (store === STORES.packs || store === STORES.packFiles) return null;
      return readFallback(store).find(function (item) { return item && item.id === id; }) || null;
    }
  }

  async function getAll(store) {
    try {
      var primary = await withStore(store, 'readonly', function (objectStore) { return objectStore.getAll(); });
      if (store === STORES.packs || store === STORES.packFiles) return primary;
      var merged = new Map();
      readFallback(store).forEach(function (item) { if (item && item.id) merged.set(item.id, item); });
      primary.forEach(function (item) { if (item && item.id) merged.set(item.id, newest(item, merged.get(item.id))); });
      return Array.from(merged.values());
    }
    catch (_) {
      if (store === STORES.packs || store === STORES.packFiles) return [];
      return readFallback(store);
    }
  }

  async function remove(store, id) {
    try {
      await withStore(store, 'readwrite', function (objectStore) { return objectStore.delete(id); });
      if (store !== STORES.packs && store !== STORES.packFiles) {
        writeFallback(store, readFallback(store).filter(function (item) { return item && item.id !== id; }));
      }
    }
    catch (_) {
      if (store === STORES.packs || store === STORES.packFiles) throw _;
      writeFallback(store, readFallback(store).filter(function (item) { return item && item.id !== id; }));
    }
  }

  function identifier(prefix) {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return prefix + '-' + root.crypto.randomUUID();
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function cleanSymbol(symbol) { return String(symbol || 'XAUUSD').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  function datasetId(symbol, timeframe) {
    return cleanSymbol(symbol) + ':' + String(timeframe || 'M1').toUpperCase();
  }

  function packId(record) {
    var start = Number(record && record.start || 0);
    var end = Number(record && record.end || 0);
    return 'pack:' + cleanSymbol(record && record.symbol) + ':' + String(record && record.timeframe || 'M1').toUpperCase() + ':' + start + ':' + end;
  }

  async function saveDataset(record) {
    var value = Object.assign({}, record, {
      id: datasetId(record.symbol, record.timeframe),
      symbol: String(record.symbol || 'XAUUSD').toUpperCase(),
      timeframe: String(record.timeframe || 'M1').toUpperCase(),
      importedAt: Number(record.importedAt || Date.now())
    });
    return put(STORES.datasets, value);
  }

  async function listDatasets() {
    var items = await getAll(STORES.datasets);
    return items.sort(function (a, b) { return Number(b.importedAt || 0) - Number(a.importedAt || 0); });
  }

  async function saveHistoricalPack(record, blob) {
    if (!blob || typeof blob.arrayBuffer !== 'function') throw new Error('File pack historis tidak valid.');
    var meta = Object.assign({}, record);
    meta.id = meta.id || packId(meta);
    meta.symbol = String(meta.symbol || 'XAUUSD').toUpperCase();
    meta.timeframe = String(meta.timeframe || 'M1').toUpperCase();
    meta.importedAt = Number(meta.importedAt || Date.now());
    meta.size = Number(meta.size || blob.size || 0);
    delete meta.blob;

    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction([STORES.packs, STORES.packFiles], 'readwrite');
      transaction.oncomplete = function () { resolve(meta); };
      transaction.onerror = function () { reject(transaction.error || new Error('Pack historis gagal disimpan.')); };
      transaction.onabort = function () { reject(transaction.error || new Error('Penyimpanan pack historis dibatalkan.')); };
      transaction.objectStore(STORES.packs).put(meta);
      transaction.objectStore(STORES.packFiles).put({ id: meta.id, blob: blob });
    });
  }

  async function loadHistoricalPack(id) {
    var pair = await Promise.all([get(STORES.packs, id), get(STORES.packFiles, id)]);
    if (!pair[0] || !pair[1] || !pair[1].blob) return null;
    return { meta: pair[0], blob: pair[1].blob };
  }

  async function listHistoricalPacks() {
    var items = await getAll(STORES.packs);
    return items.sort(function (a, b) {
      var byTime = Number(a.start || 0) - Number(b.start || 0);
      return byTime || Number(a.importedAt || 0) - Number(b.importedAt || 0);
    });
  }

  async function deleteHistoricalPack(id) {
    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction([STORES.packs, STORES.packFiles], 'readwrite');
      transaction.oncomplete = function () { resolve(true); };
      transaction.onerror = function () { reject(transaction.error || new Error('Pack historis gagal dihapus.')); };
      transaction.objectStore(STORES.packs).delete(id);
      transaction.objectStore(STORES.packFiles).delete(id);
    });
  }

  async function historicalPackBytes() {
    var items = await listHistoricalPacks();
    return items.reduce(function (sum, item) { return sum + Number(item.size || 0); }, 0);
  }

  async function saveTrade(record) {
    var value = Object.assign({}, record);
    if (!value.id) value.id = identifier('trade');
    if (!value.createdAt) value.createdAt = Date.now();
    value.updatedAt = Date.now();
    return put(STORES.trades, value);
  }

  async function listTrades() {
    var items = await getAll(STORES.trades);
    return items.sort(function (a, b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); });
  }

  async function saveGuidedResult(record) {
    var value = Object.assign({}, record);
    if (!value.id) value.id = identifier('guided');
    if (!value.createdAt) value.createdAt = Date.now();
    return put(STORES.guided, value);
  }

  function saveReplayState(value) {
    try { localStorage.setItem(FALLBACK_PREFIX + 'replayState', JSON.stringify(value)); } catch (_) {}
  }

  function loadReplayState() {
    try { return JSON.parse(localStorage.getItem(FALLBACK_PREFIX + 'replayState') || 'null'); }
    catch (_) { return null; }
  }

  root.AmyPracticeStorage = Object.freeze({
    datasetId: datasetId,
    saveDataset: saveDataset,
    loadDataset: function (symbol, timeframe) { return get(STORES.datasets, datasetId(symbol, timeframe)); },
    listDatasets: listDatasets,
    packId: packId,
    saveHistoricalPack: saveHistoricalPack,
    loadHistoricalPack: loadHistoricalPack,
    listHistoricalPacks: listHistoricalPacks,
    deleteHistoricalPack: deleteHistoricalPack,
    historicalPackBytes: historicalPackBytes,
    saveTrade: saveTrade,
    getTrade: function (id) { return get(STORES.trades, id); },
    listTrades: listTrades,
    deleteTrade: function (id) { return remove(STORES.trades, id); },
    saveGuidedResult: saveGuidedResult,
    listGuidedResults: function () { return getAll(STORES.guided); },
    saveReplayState: saveReplayState,
    loadReplayState: loadReplayState,
    identifier: identifier
  });
})(typeof window !== 'undefined' ? window : globalThis);
