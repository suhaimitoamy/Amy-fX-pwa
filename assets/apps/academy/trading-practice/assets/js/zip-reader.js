/* Amy FX Trading Practice — minimal ZIP reader for local audited candle archives. */
(function (root) {
  'use strict';

  if (root.AmyZipArchive) return;

  var SIG_EOCD = 0x06054b50;
  var SIG_CENTRAL = 0x02014b50;
  var SIG_LOCAL = 0x04034b50;
  var MAX_EOCD_SCAN = 0xffff + 22;

  function asUint8(value) {
    if (value instanceof Uint8Array) return Promise.resolve(value);
    if (value instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(value));
    if (ArrayBuffer.isView(value)) return Promise.resolve(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    if (value && typeof value.arrayBuffer === 'function') {
      return value.arrayBuffer().then(function (buffer) { return new Uint8Array(buffer); });
    }
    return Promise.reject(new Error('Arsip ZIP tidak dapat dibaca.'));
  }

  function decodeName(bytes, utf8) {
    try { return new TextDecoder(utf8 ? 'utf-8' : 'windows-1252').decode(bytes); }
    catch (_) { return new TextDecoder('utf-8').decode(bytes); }
  }

  function findEocd(bytes, view) {
    var floor = Math.max(0, bytes.length - MAX_EOCD_SCAN);
    for (var offset = bytes.length - 22; offset >= floor; offset -= 1) {
      if (view.getUint32(offset, true) === SIG_EOCD) return offset;
    }
    throw new Error('ZIP tidak valid: End of Central Directory tidak ditemukan.');
  }

  function parseEntries(bytes) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var eocd = findEocd(bytes, view);
    var total = view.getUint16(eocd + 10, true);
    var centralOffset = view.getUint32(eocd + 16, true);
    if (total === 0xffff || centralOffset === 0xffffffff) throw new Error('ZIP64 belum didukung untuk Practice.');
    var entries = [];
    var offset = centralOffset;
    for (var i = 0; i < total; i += 1) {
      if (offset + 46 > bytes.length || view.getUint32(offset, true) !== SIG_CENTRAL) {
        throw new Error('ZIP rusak: central directory tidak konsisten.');
      }
      var flags = view.getUint16(offset + 8, true);
      var method = view.getUint16(offset + 10, true);
      var compressedSize = view.getUint32(offset + 20, true);
      var uncompressedSize = view.getUint32(offset + 24, true);
      var nameLength = view.getUint16(offset + 28, true);
      var extraLength = view.getUint16(offset + 30, true);
      var commentLength = view.getUint16(offset + 32, true);
      var localOffset = view.getUint32(offset + 42, true);
      if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
        throw new Error('ZIP64 entry belum didukung untuk Practice.');
      }
      var nameStart = offset + 46;
      var name = decodeName(bytes.subarray(nameStart, nameStart + nameLength), Boolean(flags & 0x0800));
      entries.push({
        name: name,
        flags: flags,
        method: method,
        compressedSize: compressedSize,
        uncompressedSize: uncompressedSize,
        localOffset: localOffset,
        directory: /\/$/.test(name)
      });
      offset = nameStart + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  async function inflateRaw(data) {
    if (typeof root.DecompressionStream !== 'function') {
      throw new Error('WebView ini belum mendukung decompression ZIP. Perbarui Android System WebView atau impor CSV/JSON.');
    }
    var stream;
    try { stream = new root.DecompressionStream('deflate-raw'); }
    catch (_) { throw new Error('WebView ini belum mendukung deflate-raw untuk ZIP. Perbarui Android System WebView.'); }
    var output = await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer();
    return new Uint8Array(output);
  }

  function Archive(bytes) {
    this.bytes = bytes;
    this.entries = parseEntries(bytes);
    this.byName = new Map();
    this.entries.forEach(function (entry) { this.byName.set(entry.name, entry); }, this);
  }

  Archive.prototype.list = function () { return this.entries.slice(); };

  Archive.prototype.find = function (predicate) {
    for (var i = 0; i < this.entries.length; i += 1) if (predicate(this.entries[i])) return this.entries[i];
    return null;
  };

  Archive.prototype.extract = async function (entryOrName) {
    var entry = typeof entryOrName === 'string' ? this.byName.get(entryOrName) : entryOrName;
    if (!entry || entry.directory) throw new Error('Entry ZIP tidak ditemukan.');
    if (entry.flags & 0x0001) throw new Error('ZIP terenkripsi tidak didukung.');
    var view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    var offset = entry.localOffset;
    if (offset + 30 > this.bytes.length || view.getUint32(offset, true) !== SIG_LOCAL) {
      throw new Error('ZIP rusak: local header tidak ditemukan.');
    }
    var nameLength = view.getUint16(offset + 26, true);
    var extraLength = view.getUint16(offset + 28, true);
    var start = offset + 30 + nameLength + extraLength;
    var end = start + entry.compressedSize;
    if (end > this.bytes.length) throw new Error('ZIP rusak: data entry melewati ukuran arsip.');
    var compressed = this.bytes.subarray(start, end);
    var output;
    if (entry.method === 0) output = compressed.slice();
    else if (entry.method === 8) output = await inflateRaw(compressed);
    else throw new Error('Metode kompresi ZIP ' + entry.method + ' belum didukung.');
    if (entry.uncompressedSize && output.length !== entry.uncompressedSize) {
      throw new Error('ZIP rusak: ukuran hasil ekstraksi tidak cocok untuk ' + entry.name + '.');
    }
    return output;
  };

  Archive.prototype.text = async function (entryOrName) {
    return new TextDecoder('utf-8').decode(await this.extract(entryOrName));
  };

  async function open(input) { return new Archive(await asUint8(input)); }

  function isZipEntry(entry) { return entry && !entry.directory && /\.zip$/i.test(entry.name); }
  function isCsvEntry(entry) { return entry && !entry.directory && /\.csv$/i.test(entry.name); }
  function isM1CsvEntry(entry) {
    return isCsvEntry(entry) && /(?:^|[_/.-])M1(?:[_/.-]|$)/i.test(entry.name);
  }

  root.AmyZipArchive = Object.freeze({
    open: open,
    isZipEntry: isZipEntry,
    isCsvEntry: isCsvEntry,
    isM1CsvEntry: isM1CsvEntry
  });
})(typeof window !== 'undefined' ? window : globalThis);
