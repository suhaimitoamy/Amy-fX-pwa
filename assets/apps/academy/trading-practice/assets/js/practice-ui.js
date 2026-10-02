/* Amy FX Trading Practice — small shared UI helpers. */
(function (root) {
  'use strict';
  if (root.AmyPracticeUI) return;
  var core = root.AmyPracticeCore;

  function byId(id) { return document.getElementById(id); }
  function text(id, value) { var node = byId(id); if (node) node.textContent = value == null ? '' : String(value); }
  function status(id, message, error, success) {
    var node = byId(id);
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('error', Boolean(error));
    node.classList.toggle('success', !error && Boolean(success));
  }
  function decisionState(state, label, detail) {
    var node = byId('decisionLockState');
    if (!node) return;
    node.dataset.state = state || 'idle';
    var title = node.querySelector('span');
    var body = node.querySelector('strong');
    if (title) title.textContent = label || '';
    if (body) body.textContent = detail || '';
  }
  function tradeReady(ready) {
    var button = byId('tradeSubmit');
    if (!button) return;
    button.disabled = !ready;
    button.setAttribute('aria-disabled', ready ? 'false' : 'true');
  }
  function renderOhlc(prefix, candle, time) {
    text(prefix + 'Time', time == null ? '—' : core.formatWita(time, true));
    ['Open', 'High', 'Low', 'Close'].forEach(function (key) {
      text(prefix + key, candle ? core.price(candle[key.toLowerCase()]) : '—');
    });
  }
  function currentCandle(candles) { return candles && candles.length ? candles[candles.length - 1] : null; }
  function readTradeForm(form) {
    var data = new FormData(form);
    return {
      bias: data.get('bias'), entry: data.get('entry'), stopLoss: data.get('stopLoss'),
      takeProfit: data.get('takeProfit'), notes: data.get('notes')
    };
  }
  async function saveTrade(form, context) {
    var input = Object.assign(readTradeForm(form), context || {});
    var record = root.AmyPracticeTrades.create(input);
    await root.AmyPracticeStorage.saveTrade(record);
    return record;
  }
  function bindDrawingToolbar(chart) {
    function sync(state) {
      document.querySelectorAll('[data-drawing-tool]').forEach(function (item) {
        item.classList.toggle('active', item.dataset.drawingTool === state.activeTool);
      });
      var remove = byId('deleteDrawing');
      if (remove) remove.disabled = !state.selectedId;
      text('drawingStatus', state.message || (state.activeTool ? 'Alat gambar aktif.' : 'Gesture chart aktif.'));
    }
    var toolbar = document.querySelector('.drawing-menu');
    function closeTools() {
      if (!toolbar) return;
      toolbar.removeAttribute('open');
      toolbar.querySelector('summary')?.focus();
    }
    if (toolbar) {
      var grid = toolbar.querySelector('.drawing-menu-grid') || toolbar;
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'drawing-menu-close';
      close.textContent = '× Tutup';
      close.setAttribute('aria-label', 'Tutup alat gambar');
      close.addEventListener('click', closeTools);
      grid.insertBefore(close, grid.firstChild);
      var styles = document.createElement('div');
      styles.className = 'drawing-style-controls';
      styles.innerHTML = '<label>Warna <input type="color" data-style="color" value="#60a5fa"></label><label>Ketebalan <input type="range" data-style="width" min="1" max="8" value="2"></label><label>Opasitas <input type="range" data-style="opacity" min="0.1" max="1" step="0.1" value="1"></label>';
      (toolbar.querySelector('.drawing-menu-grid') || toolbar).appendChild(styles);
      styles.addEventListener('change', function (event) {
        var key = event.target.dataset.style;
        if (!key) return;
        var patch = {}; patch[key] = key === 'color' ? event.target.value : Number(event.target.value);
        chart.setDrawingStyle(patch);
      });
    }
    chart.onDrawingState = function (state) {
      sync(state);
      var selected = chart.drawings.find(function (item) { return item.id === state.selectedId; });
      var style = selected ? selected.style : chart.drawingStyle;
      if (chart.refreshObjectControls) chart.refreshObjectControls(state);
      if (toolbar && style) toolbar.querySelectorAll('[data-style]').forEach(function (input) {
        input.value = style[input.dataset.style] == null ? '#60a5fa' : style[input.dataset.style];
      });
    };
    document.querySelectorAll('[data-drawing-tool]').forEach(function (button) {
      button.addEventListener('click', function () {
        chart.setTool(button.dataset.drawingTool);
        closeTools();
      });
    });
    var clear = byId('clearDrawings');
    if (clear) clear.addEventListener('click', function () {
      chart.clearDrawings();
    });
    var remove = byId('deleteDrawing');
    if (remove) remove.addEventListener('click', function () { chart.deleteSelected(); });
    var undo = byId('undoDrawing');
    if (undo) undo.addEventListener('click', function () { chart.undo(); });
    var finish = byId('finishDrawing');
    if (finish) finish.addEventListener('click', function () { chart.setTool(null); closeTools(); });
    if (byId('replayWorkspace')) bindReplayWorkspace(chart);
    sync({ activeTool: chart.activeTool, selectedId: chart.selectedId, message: 'Gesture chart aktif. ' + chart.drawings.length + ' gambar tersimpan.' });
  }

  function bindReplayWorkspace(chart) {
    var workspace = byId('replayWorkspace');
    var quick = document.createElement('div');
    quick.className = 'replay-drawing-actions';
    quick.innerHTML = '<button type="button" data-quick="pan">Geser</button><button type="button" data-quick="select">Pilih</button><button type="button" data-quick="rectangle">Kotak +</button><button type="button" data-quick="arrow">Panah +</button><details id="replayObjectMenu" class="replay-object-menu"><summary id="replayObjectSummary">Objek</summary><div class="replay-object-controls"><button type="button" id="closeObjectMenu" class="drawing-menu-close" aria-label="Tutup menu objek">× Tutup</button><label class="drawing-repeat"><input type="checkbox" id="repeatDrawing"> Gambar berulang</label><select id="drawingObjects" aria-label="Daftar semua objek"><option value="">Pilih objek</option></select><button type="button" id="replayFollow" aria-pressed="true">Ke cursor</button><button type="button" id="replayAutoPrice" aria-pressed="true">Auto harga</button><button type="button" id="redoObject">Ulangi edit</button><button type="button" id="duplicateObject">Duplikat</button><button type="button" id="removeObject">Hapus</button><input id="objectColor" type="color" value="#60a5fa" aria-label="Warna objek"></div></details><button type="button" id="replayFullscreen" aria-pressed="false">Layar penuh</button>';
    chart.container.parentNode.insertBefore(quick, chart.container);
    byId('closeObjectMenu').addEventListener('click', function () {
      byId('replayObjectMenu').open = false;
      byId('replayObjectSummary').focus({ preventScroll: true });
    });
    var list = byId('drawingObjects');
    chart.refreshObjectControls = function (state) {
      var key = chart.drawings.map(function (d) { return d.id + ':' + chart.isDrawingVisible(d); }).join('|');
      if (list.dataset.objects !== key) {
        list.replaceChildren();
        var empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Objek (' + chart.drawings.length + ')'; list.appendChild(empty);
        chart.drawings.forEach(function (drawing, index) {
          var option = document.createElement('option'); option.value = drawing.id;
          option.textContent = (index + 1) + '. ' + drawing.type;
          option.disabled = !chart.isDrawingVisible(drawing);
          list.appendChild(option);
        });
        list.dataset.objects = key;
      }
      byId('replayFollow').setAttribute('aria-pressed', String(chart.followReplay));
      list.value = state.selectedId || '';
      byId('duplicateObject').disabled = byId('removeObject').disabled = !state.selectedId;
      byId('repeatDrawing').checked = chart.stayInDrawingMode;
      quick.querySelectorAll('[data-quick]').forEach(function (button) { button.classList.toggle('active', button.dataset.quick === (state.activeTool || 'pan')); });
      var selected = chart.drawings.find(function (d) { return d.id === state.selectedId; });
      byId('objectColor').value = (selected && selected.style.color) || chart.drawingStyle.color || '#60a5fa';
    };
    quick.querySelectorAll('[data-quick]').forEach(function (button) { button.addEventListener('click', function () { chart.setTool(button.dataset.quick); }); });
    byId('replayFollow').addEventListener('click', function () { chart.goToCursor(); });
    byId('redoObject').addEventListener('click', function () { chart.redo(); });
    byId('replayAutoPrice').addEventListener('click', function () {
      var enabled = this.getAttribute('aria-pressed') !== 'true';
      chart.chart.priceScale('right').applyOptions({ autoScale: enabled });
      this.setAttribute('aria-pressed', String(enabled));
      this.textContent = enabled ? 'Auto harga' : 'Harga manual';
      chart.scheduleDrawingSync();
    });
    list.addEventListener('change', function () { chart.selectDrawing(list.value); });
    byId('repeatDrawing').addEventListener('change', function (event) { chart.stayInDrawingMode = event.target.checked; chart.notify(event.target.checked ? 'Buat objek berulang. Pilih / Geser untuk mengedit.' : 'Selesai menggambar langsung masuk mode edit.'); });
    byId('duplicateObject').addEventListener('click', function () { chart.duplicateSelected(); });
    byId('removeObject').addEventListener('click', function () { chart.deleteSelected(); });
    byId('objectColor').addEventListener('change', function (event) { chart.setDrawingStyle({color:event.target.value}); });
    var full = byId('replayFullscreen');
    var scrollY = 0;
    var placeholder = document.createComment('replay workspace position');
    var nativeActive = false;
    function layout(enabled) {
      if (enabled === workspace.classList.contains('is-fullscreen')) return;
      if (enabled) {
        scrollY = root.scrollY;
        workspace.parentNode.insertBefore(placeholder, workspace);
        // Academy's animated container retains a transform, trapping fixed children.
        // Move the existing nodes, preserving the chart, listeners and drawing state.
        document.body.appendChild(workspace);
      } else if (placeholder.parentNode) {
        placeholder.parentNode.replaceChild(workspace, placeholder);
      }
      document.body.classList.toggle('replay-fullscreen', enabled);
      workspace.classList.toggle('is-fullscreen', enabled);
      full.textContent = enabled ? 'Keluar' : 'Layar penuh';
      full.setAttribute('aria-label', enabled ? 'Keluar layar penuh' : 'Buka layar penuh');
      full.setAttribute('aria-pressed', String(enabled));
      root.requestAnimationFrame(function () {
        chart.resize();
        if (!enabled) root.scrollTo(0, scrollY);
        full.focus({ preventScroll: true });
      });
    }
    function leaveFullscreen() {
      if (document.fullscreenElement === workspace && document.exitFullscreen) {
        try { Promise.resolve(document.exitFullscreen()).catch(function () {}); } catch (_) {}
      }
      nativeActive = false;
      layout(false);
    }
    full.addEventListener('click', function () {
      if (workspace.classList.contains('is-fullscreen')) { leaveFullscreen(); return; }
      layout(true);
      // Android WebView uses the viewport fallback; unsupported native requests
      // must never undo a working full-screen layout.
      if (!root.Android && workspace.requestFullscreen) {
        try { Promise.resolve(workspace.requestFullscreen()).catch(function () {}); } catch (_) {}
      }
    });
    document.addEventListener('fullscreenchange', function () {
      if (document.fullscreenElement === workspace) nativeActive = true;
      else if (nativeActive) { nativeActive = false; layout(false); }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && workspace.classList.contains('is-fullscreen') && !chart.textEditor) leaveFullscreen();
    });
    root.addEventListener('resize', function () {
      if (workspace.classList.contains('is-fullscreen')) root.requestAnimationFrame(function () { chart.resize(); });
    });
    chart.refreshObjectControls({activeTool:chart.activeTool,selectedId:chart.selectedId});
  }

  root.AmyPracticeUI = Object.freeze({
    byId: byId, text: text, status: status, decisionState: decisionState, tradeReady: tradeReady, renderOhlc: renderOhlc,
    currentCandle: currentCandle, saveTrade: saveTrade, bindDrawingToolbar: bindDrawingToolbar
  });
})(typeof window !== 'undefined' ? window : globalThis);

