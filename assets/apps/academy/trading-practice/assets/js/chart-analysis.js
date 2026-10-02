(function () {
  'use strict';
  var ui = window.AmyPracticeUI;
  var core = window.AmyPracticeCore;
  var provider = window.AmyPracticeData;
  var chart;
  var candles = [];
  var historicalCandles = [];
  var liveCandles = [];
  var live = null;
  var isLive = false;

  function timeframe() { return ui.byId('timeframe').value; }
  function sourceId() { return ui.byId('datasetSource').value || provider.SAMPLE_ID; }

  function renderLiveToggle(enabled) {
    var button = ui.byId('liveToggle');
    button.textContent = enabled ? 'Kembali ke Historis' : 'Aktifkan Live';
    button.classList.toggle('active', enabled);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>\"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function bytes(value) {
    var number = Number(value || 0);
    if (number < 1024) return number + ' B';
    if (number < 1024 * 1024) return (number / 1024).toFixed(1) + ' KB';
    return (number / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function dateLabel(timestamp) {
    var value = Number(timestamp || 0);
    if (!value) return 'tanpa tanggal';
    return new Date(value * 1000).toISOString().slice(0, 7);
  }

  function optionLabel(item) {
    if (item.sampleOnly) return 'Sample · Maret 2009';
    return dateLabel(item.start) + ' · ' + Number(item.rowCount || 0).toLocaleString('id-ID') + ' M1' + (item.repairedAudited ? ' · audited' : '');
  }

  async function renderPackLibrary(sources) {
    var host = ui.byId('packLibrary');
    var packs = sources.filter(function (item) { return item.kind === 'pack'; });
    var total = packs.reduce(function (sum, item) { return sum + Number(item.size || 0); }, 0);
    ui.text('packSummary', packs.length + ' pack terpasang · ' + bytes(total));
    if (!packs.length) {
      host.innerHTML = '<div class="pack-empty">Belum ada pack historis. Pilih ZIP tahunan/bulanan repaired-audited, CSV, atau JSON.</div>';
      return;
    }
    host.innerHTML = packs.map(function (item) {
      return '<div class="pack-row"><div><strong>' + escapeHtml(optionLabel(item)) + '</strong><small>' + escapeHtml(String(item.fileName || item.source || '')) + ' · ' + bytes(item.size) + '</small></div><button type="button" data-delete-pack="' + escapeHtml(item.id) + '">Hapus</button></div>';
    }).join('');
  }

  async function refreshSources(preferredId) {
    var select = ui.byId('datasetSource');
    var sources = await provider.listSources('XAUUSD');
    select.innerHTML = sources.map(function (item) {
      return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(optionLabel(item)) + '</option>';
    }).join('');
    var desired = preferredId || provider.selectedSourceId();
    if (!sources.some(function (item) { return item.id === desired; })) desired = provider.SAMPLE_ID;
    select.value = desired;
    provider.setSelectedSourceId(desired);
    await renderPackLibrary(sources);
    return sources;
  }

  async function loadHistorical(fit) {
    ui.tradeReady(false);
    try {
      var result = await provider.getCandles({ symbol: 'XAUUSD', timeframe: timeframe(), sourceId: sourceId() });
      candles = result.candles;
      historicalCandles = result.candles.slice();
      window.dispatchEvent(new Event('amy-practice-source-ready'));
      chart.setCandles(candles, fit !== false);
      var last = ui.currentCandle(candles);
      ui.renderOhlc('ohlc', last, last && last.time);
      ui.tradeReady(Boolean(last));
      ui.decisionState('idle', 'Siap disimpan', last ? ('Candle ' + core.formatWita(last.time, true)) : 'Dataset tidak memiliki candle.');
      ui.text('chartMode', 'Historis');
      ui.status('chartStatus', candles.length + ' candle ' + timeframe() + ' siap. Zoom, pan, atau pilih alat gambar.');
      ui.text('sourceNote', 'Sumber: ' + result.source + (result.sampleOnly ? ' · sample UI, bukan hasil backtest.' : ' · pack historis lokal.'));
    } catch (error) {
      ui.decisionState('error', 'Dataset gagal dimuat', error.message);
      ui.status('chartStatus', error.message, true);
    }
  }

  function nativeRows(symbol, tf) {
    if (!window.Android || typeof window.Android.getNativeCandles !== 'function') return [];
    try {
      var raw = window.Android.getNativeCandles(symbol, tf, '400');
      var parsed = JSON.parse(raw || '[]');
      return core.normalizeCandles(Array.isArray(parsed) ? parsed : []);
    } catch (_) { return []; }
  }

  function nativeClosedContext(tf) {
    var exact = nativeRows('XAU/USD', tf);
    if (!exact.length) exact = nativeRows('XAUUSD', tf);
    if (exact.length) return exact.slice(-400);
    if (tf === 'M1') return [];
    var m1 = nativeRows('XAU/USD', 'M1');
    if (!m1.length) m1 = nativeRows('XAUUSD', 'M1');
    if (!m1.length) return [];
    try { return core.aggregateCandles(m1, tf, { sourceTimeframe: 'M1' }).slice(-400); }
    catch (_) { return []; }
  }

  async function seedLiveContext(fit) {
    var result = await provider.getCandles({ symbol: 'XAUUSD', timeframe: timeframe(), sourceId: sourceId() });
    historicalCandles = result.candles.slice();
    var nativeContext = nativeClosedContext(timeframe()).filter(function (item) {
      return !historicalCandles.length || item.time > historicalCandles[historicalCandles.length - 1].time;
    });
    liveCandles = core.mergeCandleSeries(historicalCandles, nativeContext);
    candles = liveCandles;
    chart.setCandles(liveCandles, fit !== false);
    window.dispatchEvent(new Event('amy-practice-source-ready'));
    var last = ui.currentCandle(liveCandles);
    if (last) ui.renderOhlc('ohlc', last, last.time);
    ui.tradeReady(Boolean(last));
    ui.decisionState('idle', 'Siap disimpan', last ? ('Candle ' + core.formatWita(last.time, true)) : 'Menunggu candle live.');
    return { total: liveCandles.length, historical: historicalCandles.length, source: result.source };
  }

  async function setLive(enabled) {
    var button = ui.byId('liveToggle');
    var nextLive = null;
    button.disabled = true;
    if (!enabled) {
      try {
        if (live) live.stop();
        live = null;
        isLive = false;
        renderLiveToggle(false);
        await loadHistorical(true);
      } finally {
        button.disabled = false;
      }
      return;
    }

    try {
      if (live) live.stop();
      live = null;
      var context = await seedLiveContext(false);
      var historicalEnd = historicalCandles.length ? historicalCandles[historicalCandles.length - 1].time : null;
      var seed = liveCandles.length ? liveCandles[liveCandles.length - 1] : null;
      nextLive = new window.AmyPracticeLive.LivePriceAdapter({
        timeframe: timeframe(),
        seedCandle: seed,
        onCandle: function (update) {
          var current = update.current;
          var merged = core.upsertLatestCandle(liveCandles, current, {
            immutableThrough: historicalEnd,
            trustedSeries: true,
            mutate: true
          });
          if (!merged.candle) return;
          liveCandles = merged.candles;
          candles = liveCandles;
          chart.updateCandle(merged.candle);
          ui.renderOhlc('ohlc', merged.candle, merged.candle.time);
        },
        onStatus: function (value) {
          var suffix = context.historical ? ' · ' + context.historical + ' candle historis tetap tampil' : '';
          ui.status('chartStatus', value.message + suffix, /ERROR|FAILED/.test(value.status));
        }
      });
      nextLive.start();
      live = nextLive;
      isLive = true;
      renderLiveToggle(true);
      ui.text('chartMode', 'Live WebSocket');
      ui.text('sourceNote', 'Konteks: ' + context.historical + ' candle dari pack aktif ' + context.source + ' → dilanjutkan AmyLivePrice / Twelve Data WebSocket. Gap tidak diisi candle sintetis.');
    } catch (error) {
      if (nextLive) nextLive.stop();
      else if (live) live.stop();
      live = null;
      isLive = false;
      renderLiveToggle(false);
      await loadHistorical(false);
      throw error;
    } finally {
      button.disabled = false;
    }
  }

  async function importDataset() {
    var files = ui.byId('datasetFile').files;
    var button = ui.byId('importButton');
    try {
      button.disabled = true;
      ui.status('importStatus', 'Memindai arsip…');
      var records = await provider.importFiles(files, {
        symbol: 'XAUUSD', timeframe: ui.byId('importTimeframe').value
      }, function (progress) {
        if (progress && progress.message) ui.status('importStatus', progress.message);
      });
      var selected = records[records.length - 1];
      await refreshSources(selected && selected.id);
      ui.byId('datasetFile').value = '';
      ui.status('importStatus', records.length + ' pack historis tersimpan. Data tetap lokal dan tidak menambah ukuran APK.');
      if (isLive) await setLive(false); else await loadHistorical(true);
    } catch (error) { ui.status('importStatus', error.message, true); }
    finally { button.disabled = false; }
  }

  async function deletePack(id) {
    try {
      var wasSelected = sourceId() === id;
      await provider.deleteSource(id);
      await refreshSources(wasSelected ? provider.SAMPLE_ID : sourceId());
      if (!isLive) await loadHistorical(true);
      else {
        if (live) live.stop();
        live = null;
        await setLive(true);
      }
      ui.status('importStatus', 'Pack dihapus dari perangkat.');
    } catch (error) { ui.status('importStatus', error.message, true); }
  }

  async function saveTrade(event) {
    event.preventDefault();
    var current = ui.currentCandle(candles);
    var submit = ui.byId('tradeSubmit');
    if (!current) {
      ui.status('tradeStatus', 'Belum ada candle aktif untuk dicatat.', true);
      return;
    }
    try {
      ui.tradeReady(false);
      if (submit) submit.textContent = 'Menyimpan setup…';
      ui.decisionState('saving', 'Sedang menyimpan', 'Menunggu commit penyimpanan lokal…');
      var record = await ui.saveTrade(event.currentTarget, {
        symbol: 'XAUUSD', timeframe: timeframe(), tradeTime: current.time,
        replayStartTime: current.time, currentPrice: current.close, sourceId: sourceId()
      });
      var persisted = await window.AmyPracticeStorage.getTrade(record.id);
      if (!persisted || persisted.tradeTime !== record.tradeTime) throw new Error('Setup belum terverifikasi di penyimpanan lokal. Coba lagi.');
      chart.setTradeLevels(record.bias === 'WAIT' ? [] : [
        { type: 'entry', price: record.entry, title: 'Entry' }, { type: 'stop', price: record.stopLoss, title: 'SL' }, { type: 'target', price: record.takeProfit, title: 'TP' }
      ]);
      ui.decisionState('locked', 'Setup tersimpan ✓', record.bias + ' · ' + core.formatWita(record.tradeTime, true));
      ui.status('tradeStatus', '✓ Setup tersedia di Riwayat. Planned R: ' + (record.plannedR == null ? '—' : record.plannedR.toFixed(2)) + '.', false, true);
    } catch (error) {
      ui.decisionState('error', 'Gagal menyimpan', error.message);
      ui.status('tradeStatus', error.message, true);
    } finally {
      ui.tradeReady(Boolean(ui.currentCandle(candles)));
      if (submit) submit.textContent = 'Simpan ke riwayat lokal';
    }
  }

  async function init() {
    ui.tradeReady(false);
    ui.byId('tradeForm').addEventListener('submit', saveTrade);
    chart = new window.AmyCandleChart.CandleChart(ui.byId('chart'), {
      storageKey: 'amy.practice.v1.drawings.analysis',
      onCrosshair: function (candle, time) { if (candle) ui.renderOhlc('ohlc', candle, Number(time)); }
    });
    ui.bindDrawingToolbar(chart);
    await refreshSources();
    ui.byId('timeframe').addEventListener('change', async function () {
      try {
        if (isLive) {
          if (live) live.stop();
          live = null;
          await setLive(true);
        } else await loadHistorical(true);
      } catch (error) { ui.status('chartStatus', error.message, true); }
    });
    ui.byId('datasetSource').addEventListener('change', async function () {
      try {
        provider.setSelectedSourceId(this.value);
        if (!isLive) await loadHistorical(true);
        else {
          if (live) live.stop();
          live = null;
          await setLive(true);
        }
      } catch (error) { ui.status('chartStatus', error.message, true); }
    });
    ui.byId('liveToggle').addEventListener('click', function () { setLive(!isLive).catch(function (error) { ui.status('chartStatus', error.message, true); }); });
    ui.byId('importButton').addEventListener('click', importDataset);
    ui.byId('packLibrary').addEventListener('click', function (event) {
      var button = event.target.closest('[data-delete-pack]');
      if (button) deletePack(button.dataset.deletePack);
    });
    window.addEventListener('pagehide', function () { if (live) live.stop(); chart.destroy(); }, { once: true });
    await loadHistorical(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init().catch(function (error) { ui.status('chartStatus', error.message, true); }); }, { once: true });
  else init().catch(function (error) { ui.status('chartStatus', error.message, true); });
})();
