/* Amy FX Trading Practice — packaged sample + scalable local historical pack provider. */
(function (root) {
  'use strict';

  if (root.AmyPracticeData) return;
  var scriptUrl = document.currentScript && document.currentScript.src ? document.currentScript.src : location.href;
  var sampleUrl = new URL('../data/xauusd-m1-sample.json', scriptUrl).href;
  var core = root.AmyPracticeCore;
  var storage = root.AmyPracticeStorage;
  var SAMPLE_ID = 'packaged:XAUUSD:M1';
  var SELECTED_KEY = 'amy.practice.v2.selectedSource';
  var samplePromise = null;
  var candleCache = new Map();
  var CACHE_LIMIT = 2;

  function unpackSample(payload) {
    var candles = core.normalizeCandles((payload && payload.candles) || []);
    return {
      id: SAMPLE_ID,
      kind: 'sample',
      symbol: String(payload.symbol || 'XAUUSD').toUpperCase(),
      timeframe: String(payload.baseTimeframe || 'M1').toUpperCase(),
      source: payload.source || 'Packaged sample',
      sampleOnly: true,
      timezone: payload.timezone || 'UTC',
      start: candles.length ? candles[0].time : null,
      end: candles.length ? candles[candles.length - 1].time : null,
      rowCount: candles.length,
      candles: candles
    };
  }

  function loadSample() {
    if (!samplePromise) {
      samplePromise = fetch(sampleUrl, { cache: 'no-store' })
        .then(function (response) {
          if (!response.ok) throw new Error('Dataset sample tidak dapat dibaca.');
          return response.json();
        })
        .then(unpackSample);
    }
    return samplePromise;
  }

  function selectedSourceId() {
    try { return localStorage.getItem(SELECTED_KEY) || SAMPLE_ID; }
    catch (_) { return SAMPLE_ID; }
  }

  function setSelectedSourceId(value) {
    var id = String(value || SAMPLE_ID);
    try { localStorage.setItem(SELECTED_KEY, id); } catch (_) {}
    return id;
  }

  function timeframeRank(timeframe) { return core.timeframeSeconds(timeframe) || Number.MAX_SAFE_INTEGER; }

  function sourceLabel(meta) {
    var date = meta && meta.start ? new Date(Number(meta.start) * 1000) : null;
    var ym = date && Number.isFinite(date.getTime())
      ? date.toISOString().slice(0, 7)
      : 'tanpa tanggal';
    return ym + ' · ' + Number(meta && meta.rowCount || 0).toLocaleString('id-ID') + ' M1';
  }

  function cachePut(id, value) {
    if (candleCache.has(id)) candleCache.delete(id);
    candleCache.set(id, value);
    while (candleCache.size > CACHE_LIMIT) candleCache.delete(candleCache.keys().next().value);
    return value;
  }

  function cacheDelete(id) { candleCache.delete(id); }

  function compatibleCsv(text) {
    var value = String(text || '').replace(/^\uFEFF/, '');
    var newline = value.indexOf('\n');
    var head = newline >= 0 ? value.slice(0, newline) : value;
    var rest = newline >= 0 ? value.slice(newline) : '';
    head = head.replace(/^(timestamp_utc|datetime_utc|time_utc)(?=,|;|\t)/i, 'timestamp');
    return head + rest;
  }

  function meaningfulLines(text) {
    return compatibleCsv(text).split(/\r?\n/).filter(function (line) { return line.trim() !== ''; });
  }

  function metadataFromCsv(text) {
    var lines = meaningfulLines(text);
    if (lines.length < 3) throw new Error('CSV harus berisi header dan minimal 2 candle.');
    var first = core.parseCsv(lines[0] + '\n' + lines[1]);
    var last = core.parseCsv(lines[0] + '\n' + lines[lines.length - 1]);
    if (!first.length || !last.length) throw new Error('CSV tidak memiliki candle OHLC valid.');
    return { start: first[0].time, end: last[last.length - 1].time, rowCount: lines.length - 1 };
  }

  function metadataFromJson(text) {
    var parsed = JSON.parse(text);
    var candles = core.normalizeCandles(Array.isArray(parsed) ? parsed : parsed && parsed.candles);
    if (candles.length < 20) throw new Error('Dataset JSON harus berisi minimal 20 candle OHLC valid.');
    return { start: candles[0].time, end: candles[candles.length - 1].time, rowCount: candles.length, candles: candles };
  }

  function packMeta(options) {
    var meta = {
      symbol: String(options.symbol || 'XAUUSD').toUpperCase(),
      timeframe: String(options.timeframe || 'M1').toUpperCase(),
      source: options.source,
      fileName: options.fileName,
      format: options.format,
      entryPath: options.entryPath || null,
      start: Number(options.start),
      end: Number(options.end),
      rowCount: Number(options.rowCount || 0),
      size: Number(options.size || 0),
      provenance: options.provenance || options.source,
      repairedAudited: /REPAIRED[_ -]?AUDITED/i.test(String(options.provenance || options.source || options.fileName || '')),
      importedAt: Date.now()
    };
    meta.id = storage.packId(meta);
    meta.label = sourceLabel(meta);
    return meta;
  }

  async function saveZipPack(blob, entry, provenance, results) {
    var archive = await root.AmyZipArchive.open(blob);
    var text = await archive.text(entry);
    var info = metadataFromCsv(text);
    var meta = packMeta({
      symbol: 'XAUUSD', timeframe: 'M1', source: provenance,
      provenance: provenance, fileName: blob.name || entry.name.replace(/\.csv$/i, '.zip'),
      format: 'zip', entryPath: entry.name,
      start: info.start, end: info.end, rowCount: info.rowCount, size: blob.size
    });
    await storage.saveHistoricalPack(meta, blob);
    results.push(meta);
    return meta;
  }

  async function saveTextPack(blob, options, results) {
    var text = await blob.text();
    var info;
    if (options.format === 'json') info = metadataFromJson(text);
    else info = metadataFromCsv(text);
    if (info.rowCount < 20) throw new Error('Dataset harus berisi minimal 20 candle OHLC valid.');
    var meta = packMeta({
      symbol: options.symbol || 'XAUUSD', timeframe: options.timeframe || 'M1',
      source: options.source, provenance: options.source, fileName: options.fileName,
      format: options.format, start: info.start, end: info.end, rowCount: info.rowCount, size: blob.size
    });
    await storage.saveHistoricalPack(meta, blob);
    results.push(meta);
    return meta;
  }

  async function scanZip(blob, context, depth, results, onProgress) {
    if (!root.AmyZipArchive) throw new Error('ZIP reader Practice belum dimuat.');
    if (depth > 5) throw new Error('Struktur ZIP terlalu dalam. Maksimal 5 lapisan.');
    var archive = await root.AmyZipArchive.open(blob);
    var entries = archive.list();
    var m1Entries = entries.filter(root.AmyZipArchive.isM1CsvEntry);

    if (m1Entries.length === 1) {
      if (onProgress) onProgress({ stage: 'validate', fileName: context.name, message: 'Memvalidasi M1 ' + context.name });
      await saveZipPack(blob, m1Entries[0], context.provenance, results);
      if (onProgress) onProgress({ stage: 'saved', fileName: context.name, packCount: results.length, message: results[results.length - 1].label + ' tersimpan' });
      return;
    }

    if (m1Entries.length > 1) {
      for (var m = 0; m < m1Entries.length; m += 1) {
        var csvBytes = await archive.extract(m1Entries[m]);
        var csvBlob = new Blob([csvBytes], { type: 'text/csv' });
        var childSource = context.provenance + ' → ' + m1Entries[m].name;
        await saveTextPack(csvBlob, { symbol: 'XAUUSD', timeframe: 'M1', source: childSource, fileName: m1Entries[m].name, format: 'csv' }, results);
        if (onProgress) onProgress({ stage: 'saved', fileName: m1Entries[m].name, packCount: results.length, message: results[results.length - 1].label + ' tersimpan' });
      }
      return;
    }

    var nested = entries.filter(root.AmyZipArchive.isZipEntry);
    if (!nested.length) throw new Error('Tidak ditemukan CSV M1 atau ZIP turunan di ' + context.name + '.');
    for (var i = 0; i < nested.length; i += 1) {
      if (onProgress) onProgress({ stage: 'extract', fileName: nested[i].name, message: 'Membuka ' + nested[i].name });
      var bytes = await archive.extract(nested[i]);
      var childBlob = new Blob([bytes], { type: 'application/zip' });
      try { Object.defineProperty(childBlob, 'name', { value: nested[i].name }); } catch (_) {}
      await scanZip(childBlob, {
        name: nested[i].name,
        provenance: context.provenance + ' → ' + nested[i].name
      }, depth + 1, results, onProgress);
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
    }
  }

  async function importFiles(files, options, onProgress) {
    options = options || {};
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) throw new Error('Pilih file ZIP, CSV, atau JSON terlebih dahulu.');
    var results = [];
    for (var i = 0; i < list.length; i += 1) {
      var file = list[i];
      var name = String(file.name || 'dataset-' + (i + 1));
      if (onProgress) onProgress({ stage: 'file', fileName: name, index: i + 1, total: list.length, message: 'Memproses ' + name });
      if (/\.zip$/i.test(name) || file.type === 'application/zip') {
        await scanZip(file, { name: name, provenance: name }, 0, results, onProgress);
      } else if (/\.json$/i.test(name) || file.type === 'application/json') {
        await saveTextPack(file, { symbol: options.symbol || 'XAUUSD', timeframe: options.timeframe || 'M1', source: 'Imported local: ' + name, fileName: name, format: 'json' }, results);
      } else {
        await saveTextPack(file, { symbol: options.symbol || 'XAUUSD', timeframe: options.timeframe || 'M1', source: 'Imported local: ' + name, fileName: name, format: 'csv' }, results);
      }
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
    }
    if (!results.length) throw new Error('Tidak ada pack candle yang berhasil ditemukan.');
    return results;
  }

  async function loadPackCandles(id) {
    if (candleCache.has(id)) return candleCache.get(id);
    var stored = await storage.loadHistoricalPack(id);
    if (!stored) throw new Error('Pack historis tidak ditemukan di perangkat.');
    var meta = stored.meta;
    var text;
    var candles;
    if (meta.format === 'zip') {
      if (!root.AmyZipArchive) throw new Error('ZIP reader Practice belum dimuat.');
      var archive = await root.AmyZipArchive.open(stored.blob);
      text = await archive.text(meta.entryPath);
      candles = core.parseCsv(compatibleCsv(text));
    } else if (meta.format === 'json') {
      text = await stored.blob.text();
      var parsed = JSON.parse(text);
      candles = core.normalizeCandles(Array.isArray(parsed) ? parsed : parsed && parsed.candles);
    } else {
      text = await stored.blob.text();
      candles = core.parseCsv(compatibleCsv(text));
    }
    if (candles.length < 20) throw new Error('Pack historis rusak atau tidak lagi memiliki candle valid.');
    return cachePut(id, {
      id: id, kind: 'pack', symbol: meta.symbol, timeframe: meta.timeframe,
      source: meta.source, sampleOnly: false, start: meta.start, end: meta.end,
      rowCount: meta.rowCount, candles: candles
    });
  }

  async function legacySources(symbol) {
    var requested = String(symbol || 'XAUUSD').toUpperCase();
    var items = await storage.listDatasets();
    return items.filter(function (item) { return item.symbol === requested; }).map(function (item) {
      return {
        id: 'legacy:' + item.id, kind: 'legacy', symbol: item.symbol, timeframe: item.timeframe,
        source: item.source || 'Imported legacy dataset', sampleOnly: false,
        start: item.start || (item.candles && item.candles[0] && item.candles[0].time),
        end: item.end || (item.candles && item.candles.length && item.candles[item.candles.length - 1].time),
        rowCount: item.rowCount || (item.candles && item.candles.length) || 0
      };
    });
  }

  async function listSources(symbol) {
    var requested = String(symbol || 'XAUUSD').toUpperCase();
    var sample = await loadSample();
    var packs = (await storage.listHistoricalPacks()).filter(function (item) { return item.symbol === requested; }).map(function (item) {
      return Object.assign({ kind: 'pack', sampleOnly: false }, item);
    });
    var legacy = await legacySources(requested);
    var output = [];
    if (sample.symbol === requested) output.push({
      id: sample.id, kind: 'sample', symbol: sample.symbol, timeframe: sample.timeframe,
      source: sample.source, sampleOnly: true, start: sample.start, end: sample.end, rowCount: sample.rowCount,
      label: 'Sample · Maret 2009'
    });
    return output.concat(packs, legacy);
  }

  async function resolveSource(symbol, sourceId) {
    var requested = String(symbol || 'XAUUSD').toUpperCase();
    var id = String(sourceId || selectedSourceId() || SAMPLE_ID);
    if (id === SAMPLE_ID) return loadSample();
    if (id.indexOf('pack:') === 0) return loadPackCandles(id);
    if (id.indexOf('legacy:') === 0) {
      var rawId = id.slice(7);
      var items = await storage.listDatasets();
      var item = items.find(function (candidate) { return candidate.id === rawId && candidate.symbol === requested; });
      if (item) return Object.assign({ id: id, kind: 'legacy', sampleOnly: false }, item);
    }
    setSelectedSourceId(SAMPLE_ID);
    return loadSample();
  }

  async function sourceFor(symbol, timeframe, sourceId) {
    var targetSeconds = timeframeRank(timeframe);
    var source = await resolveSource(symbol, sourceId);
    var sourceSeconds = timeframeRank(source.timeframe || 'M1');
    if (sourceSeconds > targetSeconds || targetSeconds % sourceSeconds !== 0) {
      throw new Error('Pack ' + (source.timeframe || 'M1') + ' tidak dapat dipakai untuk ' + timeframe + '.');
    }
    return source;
  }

  async function getCandles(options) {
    options = options || {};
    var timeframe = String(options.timeframe || 'M15').toUpperCase();
    var source = await sourceFor(options.symbol || 'XAUUSD', timeframe, options.sourceId);
    var cursor = options.cursor == null ? null : core.finite(options.cursor);
    var candles = cursor == null
      ? core.aggregateCandles(source.candles, timeframe, { sourceTimeframe: source.timeframe })
      : core.visibleCandles(source.candles, cursor, timeframe, source.timeframe);
    return {
      sourceId: source.id,
      symbol: source.symbol,
      timeframe: timeframe,
      sourceTimeframe: source.timeframe,
      source: source.source,
      sampleOnly: Boolean(source.sampleOnly),
      start: source.start,
      end: source.end,
      rowCount: source.rowCount || source.candles.length,
      candles: candles.map(function (candle) { return Object.assign({}, candle); })
    };
  }

  async function getTimeline(options) {
    var result = await getCandles(Object.assign({}, options, { cursor: null }));
    return result.candles.map(function (candle) { return candle.lastSourceTime == null ? candle.time : candle.lastSourceTime; });
  }

  async function range(options) {
    var result = await getCandles(Object.assign({}, options, { cursor: null }));
    return {
      sourceId: result.sourceId,
      start: result.candles.length ? result.candles[0].time : null,
      end: result.candles.length ? result.candles[result.candles.length - 1].time : null,
      count: result.candles.length,
      rowCount: result.rowCount,
      source: result.source,
      sampleOnly: result.sampleOnly
    };
  }

  async function deleteSource(id) {
    if (String(id || '').indexOf('pack:') !== 0) return false;
    await storage.deleteHistoricalPack(id);
    cacheDelete(id);
    if (selectedSourceId() === id) setSelectedSourceId(SAMPLE_ID);
    return true;
  }

  async function importFile(file, options) {
    var results = await importFiles([file], options || {});
    return results[0];
  }

  root.AmyPracticeData = Object.freeze({
    SAMPLE_ID: SAMPLE_ID,
    loadSample: loadSample,
    listSources: listSources,
    selectedSourceId: selectedSourceId,
    setSelectedSourceId: setSelectedSourceId,
    getCandles: getCandles,
    getTimeline: getTimeline,
    range: range,
    importFile: importFile,
    importFiles: importFiles,
    deleteSource: deleteSource,
    sourceFor: sourceFor
  });
})(typeof window !== 'undefined' ? window : globalThis);
