/* Amy FX Trading Practice — responsive Lightweight Charts surface + editable TIME/PRICE drawings. */
(function (root) {
  'use strict';

  if (root.AmyCandleChart) return;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var FIB_LEVELS = Object.freeze([0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 1]);
  var COLORS = Object.freeze({
    horizontal: '#9ca3af', horizontalRay: '#94a3b8', trend: '#60a5fa', parallelChannel: '#38bdf8',
    fibonacci: '#f59e0b', longPosition: '#22c55e', shortPosition: '#ef4444', priceRange: '#facc15',
    rectangle: '#a78bfa', arrow: '#60a5fa', path: '#e2e8f0', circle: '#c084fc', text: '#f8fafc',
    note: '#fbbf24', priceNote: '#fbbf24', entry: '#facc15', stop: '#ef4444', target: '#22c55e'
  });
  var TOOL_LABELS = Object.freeze({
    horizontal: 'Garis Horizontal', horizontalRay: 'Sinar Horizontal', trend: 'Trend Line', parallelChannel: 'Kanal Paralel',
    fibonacci: 'Fibonacci Retracement', longPosition: 'Posisi Pembelian', shortPosition: 'Posisi Penjualan', priceRange: 'Rentang Harga',
    rectangle: 'Rectangle', arrow: 'Panah', path: 'Path / Free Line', circle: 'Lingkaran', text: 'Teks', note: 'Catatan',
    priceNote: 'Catatan Harga', entry: 'Entry', stop: 'Stop', target: 'Target', select: 'Pilih / Edit'
  });

  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  function priceText(value) { return Number(value).toFixed(2); }
  function distance(a, b) { return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y)); }
  function segmentDistance(point, a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    if (dx === 0 && dy === 0) return distance(point, a);
    var ratio = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
    return distance(point, { x: a.x + ratio * dx, y: a.y + ratio * dy });
  }

  function CandleChart(container, options) {
    options = options || {};
    if (!container) throw new Error('Container chart tidak ditemukan.');
    if (!root.LightweightCharts) throw new Error('Lightweight Charts lokal belum dimuat.');
    if (!root.AmyPracticeDrawing) throw new Error('Drawing model Practice belum dimuat.');

    this.container = container;
    this.options = options;
    this.model = root.AmyPracticeDrawing;
    this.drawingStyle = this.model.normalizeStyle();
    this.storageKey = options.storageKey || '';
    this.drawingTimeBoundary = options.drawingTimeBoundary != null && Number.isFinite(Number(options.drawingTimeBoundary))
      ? Number(options.drawingTimeBoundary)
      : null;
    this.activeTool = 'select';
    this.stayInDrawingMode = options.stayInDrawingMode === true;
    this.tapAnchor = null;
    this.selectedId = null;
    this.gestureStart = null;
    this.hoverPoint = null;
    this.draftPoints = [];
    this.draftPath = null;
    this.dragState = null;
    this.textEditor = null;
    this.drawingSyncFrame = null;
    this.drawings = this.loadDrawings();
    this.history = [];
    this.redoHistory = [];
    this.followReplay = options.followReplay !== false;
    this.gesturePointerId = null;
    this.pendingCandles = null;
    this.candles = [];
    this.priceLines = [];
    this.onCrosshair = typeof options.onCrosshair === 'function' ? options.onCrosshair : function () {};
    this.onChartTap = typeof options.onChartTap === 'function' ? options.onChartTap : function () {};
    this.onDrawingState = typeof options.onDrawingState === 'function' ? options.onDrawingState : function () {};

    container.classList.add('practice-chart-shell');
    this.host = document.createElement('div');
    this.host.className = 'practice-chart-canvas';
    this.overlay = document.createElementNS(SVG_NS, 'svg');
    this.overlay.classList.add('practice-chart-overlay', 'is-selecting');
    this.overlay.setAttribute('aria-hidden', 'true');
    container.appendChild(this.host);
    container.appendChild(this.overlay);
    this.deleteButton = document.createElement('button');
    this.deleteButton.type = 'button';
    this.deleteButton.className = 'practice-chart-delete';
    this.deleteButton.textContent = '× Hapus';
    this.deleteButton.setAttribute('aria-label', 'Hapus gambar terpilih');
    this.deleteButton.hidden = true;
    this.deleteButton.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
    this.deleteButton.addEventListener('click', function (event) {
      event.stopPropagation();
      if (this.deleteButton.hidden || this.dragState || this.gesturePointerId != null) return;
      if (this.deleteSelected()) {
        this.container.setAttribute('tabindex', '-1');
        this.container.focus({ preventScroll: true });
      }
    }.bind(this));
    container.appendChild(this.deleteButton);

    this.chart = root.LightweightCharts.createChart(this.host, {
      width: Math.max(280, container.clientWidth || 800),
      height: Math.max(360, Number(options.height || container.clientHeight || 520)),
      layout: { background: { color: '#0b111a' }, textColor: '#a8b3c4', fontSize: 12 },
      grid: { vertLines: { color: '#17202d' }, horzLines: { color: '#17202d' } },
      crosshair: { mode: root.LightweightCharts.CrosshairMode.Normal },
      rightPriceScale: {
        visible: true, borderVisible: true, borderColor: '#263244', minimumWidth: 92,
        entireTextOnly: true, alignLabels: true, scaleMargins: { top: 0.08, bottom: 0.12 }
      },
      timeScale: { borderColor: '#263244', timeVisible: true, secondsVisible: false, rightOffset: 4, shiftVisibleRangeOnNewBar: this.followReplay },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
        mouseWheel: true,
        pinch: true
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true
      },
      localization: {
        locale: 'id-ID',
        priceFormatter: function (price) { return Number.isFinite(Number(price)) ? Number(price).toFixed(2) : '—'; }
      }
    });
    this.series = this.chart.addCandlestickSeries({
      upColor: '#2dd4bf', downColor: '#fb7185', borderVisible: false,
      wickUpColor: '#2dd4bf', wickDownColor: '#fb7185',
      lastValueVisible: true, priceLineVisible: true,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
    });

    this.handleCrosshair = this.handleCrosshair.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.renderDrawings = this.renderDrawings.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.scheduleDrawingSync = this.scheduleDrawingSync.bind(this);
    this.handleChartTransform = this.handleChartTransform.bind(this);
    this.chart.subscribeCrosshairMove(this.handleCrosshair);
    this.chart.subscribeClick(this.handleClick);
    this.chart.timeScale().subscribeVisibleTimeRangeChange(this.scheduleDrawingSync);
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.scheduleDrawingSync);
    this.chart.timeScale().subscribeSizeChange(this.scheduleDrawingSync);
    this.overlay.addEventListener('pointerdown', this.handlePointerDown);
    this.overlay.addEventListener('pointermove', this.handlePointerMove);
    this.overlay.addEventListener('pointerup', this.handlePointerUp);
    this.overlay.addEventListener('pointercancel', this.handlePointerCancel);
    this.handleNavigationStart = function () {
      if (this.followReplay) { this.followReplay = false; this.chart.applyOptions({ timeScale: { shiftVisibleRangeOnNewBar: false } }); this.notify('Posisi chart bebas. Tekan Ke cursor untuk mengikuti replay.'); }
    }.bind(this);
    this.host.addEventListener('pointerdown', this.handleNavigationStart, { passive: true });
    this.host.addEventListener('touchstart', this.handleNavigationStart, { passive: true });
    this.host.addEventListener('wheel', this.handleNavigationStart, { passive: true });
    this.host.addEventListener('wheel', this.handleChartTransform, { passive: true });
    this.host.addEventListener('pointermove', this.handleChartTransform, { passive: true });
    this.host.addEventListener('pointerup', this.handleChartTransform, { passive: true });
    this.host.addEventListener('touchmove', this.handleChartTransform, { passive: true });
    this.host.addEventListener('touchend', this.handleChartTransform, { passive: true });
    document.addEventListener('keydown', this.handleKeyDown);

    var self = this;
    this.resizeObserver = root.ResizeObserver ? new root.ResizeObserver(function () { self.resize(); }) : null;
    if (this.resizeObserver) this.resizeObserver.observe(container);
    root.addEventListener('resize', this.renderDrawings);
    this.resize();
    this.notify('Pilih alat gambar untuk mulai.');
  }

  CandleChart.prototype.loadDrawings = function () {
    if (!this.storageKey) return [];
    try {
      var value = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
      if (!Array.isArray(value)) return [];
      return value.map(this.model.normalizeDrawing).filter(Boolean);
    } catch (_) { return []; }
  };

  CandleChart.prototype.saveDrawings = function () {
    if (!this.storageKey) return;
    try { localStorage.setItem(this.storageKey, JSON.stringify(this.drawings)); } catch (_) {}
  };

  CandleChart.prototype.remember = function () {
    this.redoHistory = [];
    this.history.push(JSON.stringify(this.drawings));
    if (this.history.length > 30) this.history.shift();
  };

  CandleChart.prototype.notify = function (message) {
    this.onDrawingState({
      activeTool: this.activeTool,
      selectedId: this.selectedId,
      count: this.drawings.length,
      followReplay: this.followReplay,
      stayInDrawingMode: this.stayInDrawingMode,
      message: String(message || '')
    });
  };

  CandleChart.prototype.plotWidth = function () {
    var value = Number(this.chart.timeScale().width());
    if (Number.isFinite(value) && value > 0) return value;
    var scaleWidth = Number(this.chart.priceScale('right').width()) || 92;
    return Math.max(1, (this.container.clientWidth || 800) - scaleWidth);
  };

  CandleChart.prototype.plotHeight = function () {
    var height = this.container.clientHeight || Number(this.options.height || 520);
    var axisHeight = Number(this.chart.timeScale().height()) || 26;
    return Math.max(1, height - axisHeight);
  };

  CandleChart.prototype.syncOverlaySize = function () {
    var width = Math.max(1, this.plotWidth());
    var height = Math.max(1, this.plotHeight());
    this.overlay.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    this.overlay.setAttribute('width', width);
    this.overlay.setAttribute('height', height);
    this.overlay.style.width = width + 'px';
    this.overlay.style.height = height + 'px';
  };

  CandleChart.prototype.scheduleDrawingSync = function () {
    if (this.drawingSyncFrame != null) return;
    var self = this;
    var requestFrame = root.requestAnimationFrame || function (callback) { return setTimeout(callback, 0); };
    this.drawingSyncFrame = requestFrame(function () {
      self.drawingSyncFrame = null;
      self.renderDrawings();
    });
  };

  CandleChart.prototype.handleChartTransform = function (event) {
    if (event && event.type === 'pointermove' && !event.buttons && !event.pressure && event.pointerType !== 'touch') return;
    this.scheduleDrawingSync();
  };

  CandleChart.prototype.resize = function () {
    var width = Math.max(280, this.container.clientWidth || 800);
    var height = document.body.classList.contains('replay-fullscreen') ? Math.max(100, this.container.clientHeight) : Math.max(360, Number(this.options.height || this.container.clientHeight || 520));
    this.chart.applyOptions({
      width: width,
      height: height,
      rightPriceScale: { minimumWidth: width <= 420 ? 84 : 92, entireTextOnly: true, visible: true }
    });
    this.syncOverlaySize();
    this.renderDrawings();
  };

  CandleChart.prototype.setCandles = function (candles, fit) {
    var safe = (Array.isArray(candles) ? candles : []).map(function (candle) {
      return { time: Number(candle.time), open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close) };
    }).filter(function (candle) {
      return [candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite);
    }).sort(function (a, b) { return a.time - b.time; });
    // Defer data changes while an object is being dragged: its TIME/PRICE
    // conversion must use one unchanged scale until the pointer is released.
    if (this.dragState || this.gestureStart || this.draftPath) {
      this.pendingCandles = { candles: safe, fit: fit };
      return;
    }
    var scale = this.chart.timeScale();
    var range = scale.getVisibleLogicalRange ? scale.getVisibleLogicalRange() : null;
    var previous = this.candles;
    var unique = [];
    safe.forEach(function (bar) {
      if (unique.length && unique[unique.length - 1].time === bar.time) unique[unique.length - 1] = bar;
      else unique.push(bar);
    });
    safe = unique;
    var incremental = fit === false && previous.length > 0 && safe.length >= previous.length;
    for (var i = 0; incremental && i < previous.length; i += 1) {
      var old = previous[i], next = safe[i];
      if (old.time !== next.time || (i < previous.length - 1 &&
        (old.open !== next.open || old.high !== next.high || old.low !== next.low || old.close !== next.close))) incremental = false;
    }
    this.candles = safe;
    if (incremental) {
      for (var j = previous.length - 1; j < safe.length; j += 1) this.series.update(safe[j]);
    } else this.series.setData(safe);
    if (fit !== false && safe.length) scale.fitContent();
    else if (!incremental && range && scale.setVisibleLogicalRange) {
      // setData on rewind can shift even with shiftVisibleRangeOnNewBar=false.
      // Restore immediately, never in a delayed callback that can undo a swipe.
      var shift = this.followReplay ? safe.length - previous.length : 0;
      scale.setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift });
    }
    this.syncOverlaySize();
    this.renderDrawings();
    var self = this;
    (root.requestAnimationFrame || function (callback) { return setTimeout(callback, 0); })(function () {
      self.syncOverlaySize();
      self.renderDrawings();
    });
  };

  CandleChart.prototype.flushPendingCandles = function () {
    var pending = this.pendingCandles;
    this.pendingCandles = null;
    if (pending) this.setCandles(pending.candles, pending.fit);
  };

  CandleChart.prototype.goToCursor = function () {
    this.followReplay = true;
    this.chart.applyOptions({ timeScale: { shiftVisibleRangeOnNewBar: true } });
    var scale = this.chart.timeScale();
    var range = scale.getVisibleLogicalRange();
    if (range && this.candles.length) {
      var end = this.candles.length - 1 + 4;
      scale.setVisibleLogicalRange({ from: end - (range.to - range.from), to: end });
    }
    this.notify('Chart mengikuti candle replay. Geser chart untuk melepas.');
  };

  CandleChart.prototype.redo = function () {
    if (!this.redoHistory.length) return false;
    this.history.push(JSON.stringify(this.drawings));
    this.drawings = JSON.parse(this.redoHistory.pop()).map(this.model.normalizeDrawing).filter(Boolean);
    this.selectedId = null;
    this.saveDrawings();
    this.renderDrawings();
    this.notify('Perubahan gambar diterapkan kembali.');
    return true;
  };

  CandleChart.prototype.setDrawingTimeBoundary = function (timestamp) {
    var value = Number(timestamp);
    this.drawingTimeBoundary = timestamp != null && Number.isFinite(value) ? value : null;
    var selected = this.drawings.find(function (drawing) { return drawing.id === this.selectedId; }, this);
    var selectionCleared = Boolean(selected && !this.isDrawingVisible(selected));
    if (selectionCleared) this.selectedId = null;
    this.renderDrawings();
    if (selectionCleared) this.notify('Drawing setelah cursor replay disembunyikan.');
  };

  CandleChart.prototype.isDrawingVisible = function (drawing) {
    if (!drawing || this.drawingTimeBoundary == null) return Boolean(drawing);
    if (this.options.allowDrawingProjection && drawing.replayCreatedAt != null) return drawing.replayCreatedAt <= this.drawingTimeBoundary;
    return drawing.points.every(function (point) { return Number(point.time) <= this.drawingTimeBoundary; }, this);
  };

  CandleChart.prototype.updateCandle = function (candle) {
    if (!candle) return;
    var value = { time: Number(candle.time), open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close) };
    if (![value.time, value.open, value.high, value.low, value.close].every(Number.isFinite)) return;
    var last = this.candles.length ? this.candles[this.candles.length - 1] : null;
    if (last && value.time < last.time) return;
    if (last && value.time === last.time) this.candles[this.candles.length - 1] = value;
    else this.candles.push(value);
    this.series.update(value);
    this.syncOverlaySize();
    this.renderDrawings();
  };

  CandleChart.prototype.setTool = function (tool) {
    var requested = tool === 'select' ? 'select' : this.model.normalizeType(tool);
    this.activeTool = requested || null;
    this.tapAnchor = null;
    this.gestureStart = null;
    this.hoverPoint = null;
    this.draftPoints = [];
    this.draftPath = null;
    this.dragState = null;
    this.gesturePointerId = null;
    this.flushPendingCandles();
    if (this.activeTool !== 'select') this.selectedId = null;
    this.overlay.classList.toggle('is-panning', !this.activeTool);
    this.overlay.classList.toggle('is-drawing', Boolean(this.activeTool && this.activeTool !== 'select'));
    this.overlay.classList.toggle('is-selecting', this.activeTool === 'select');
    this.overlay.setAttribute('aria-hidden', this.activeTool ? 'false' : 'true');
    this.renderDrawings();
    this.notify(this.activeTool ? (TOOL_LABELS[this.activeTool] + ' aktif.') : 'Gesture chart aktif.');
  };

  CandleChart.prototype.clearDrawings = function () {
    if (this.drawings.length) this.remember();
    this.drawings = [];
    this.selectedId = null;
    this.saveDrawings();
    this.setTool(null);
    this.notify('Semua gambar dihapus.');
  };

  CandleChart.prototype.selectDrawing = function (id) {
    var drawing = this.drawings.find(function (item) { return item.id === id; });
    if (!drawing || !this.isDrawingVisible(drawing)) return;
    this.selectedId = id;
    this.setTool('select');
    this.notify('Objek dipilih. Seret bagian tengah atau pegangan putih di tepinya.');
  };

  CandleChart.prototype.duplicateSelected = function () {
    var drawing = this.drawings.find(function (item) { return item.id === this.selectedId; }, this);
    if (!drawing) return;
    var copy = this.model.create(drawing.type, drawing.points, { text:drawing.text, style:drawing.style, replayCreatedAt:this.drawingTimeBoundary });
    this.remember();
    this.drawings.push(copy);
    this.saveDrawings();
    this.selectDrawing(copy.id);
  };

  CandleChart.prototype.deleteSelected = function () {
    if (!this.selectedId) {
      this.notify('Pilih satu gambar terlebih dahulu.');
      return false;
    }
    this.remember();
    var id = this.selectedId;
    this.drawings = this.drawings.filter(function (drawing) { return drawing.id !== id; });
    this.selectedId = null;
    this.saveDrawings();
    this.renderDrawings();
    this.notify('Gambar terpilih dihapus.');
    return true;
  };

  CandleChart.prototype.undo = function () {
    if (!this.history.length) {
      this.notify('Belum ada perubahan gambar untuk diurungkan.');
      return false;
    }
    this.redoHistory.push(JSON.stringify(this.drawings));
    var previous = JSON.parse(this.history.pop() || '[]');
    this.drawings = previous.map(this.model.normalizeDrawing).filter(Boolean);
    this.selectedId = null;
    this.saveDrawings();
    this.renderDrawings();
    this.notify('Perubahan gambar diurungkan.');
    return true;
  };

  CandleChart.prototype.addDrawing = function (type, points, text) {
    var drawing = this.model.create(type, points, { text: text, style: this.drawingStyle, replayCreatedAt: this.options.allowDrawingProjection ? this.drawingTimeBoundary : null });
    if (!drawing) {
      this.notify('Titik gambar belum lengkap.');
      return null;
    }
    var position = this.model.positionStats(drawing);
    if (position && !position.valid) {
      this.setTool(type);
      this.notify(type === 'longPosition' ? 'LONG: mulai Entry, lalu TP di atas dan SL di bawah Entry.' : 'SHORT: mulai Entry, lalu TP di bawah dan SL di atas Entry.');
      return null;
    }
    if (!this.isDrawingVisible(drawing)) {
      this.notify('Drawing replay tidak boleh melewati cursor aktif.');
      return null;
    }
    this.remember();
    this.drawings.push(drawing);
    this.saveDrawings();
    this.selectedId = drawing.id;
    this.setTool(this.stayInDrawingMode ? type : 'select');
    this.notify(TOOL_LABELS[drawing.type] + ' tersimpan dan siap digeser atau diedit.');
    return drawing;
  };

  CandleChart.prototype.timeToX = function (timestamp) {
    var target = Number(timestamp);
    if (!Number.isFinite(target)) return null;
    var direct = this.chart.timeScale().timeToCoordinate(target);
    if (direct != null) return Number(direct);
    var items = this.candles;
    if (!items.length) return null;
    if (this.options.allowDrawingProjection) {
      var last = items.length - 1;
      var step = Number(this.options.timeframeSeconds) || (last > 0 ? items[last].time - items[last - 1].time : 60);
      if (target < items[0].time) return this.chart.timeScale().logicalToCoordinate((target - items[0].time) / step);
      if (target > items[last].time) return this.chart.timeScale().logicalToCoordinate(last + (target - items[last].time) / step);
    }
    var low = 0;
    var high = items.length;
    while (low < high) {
      var middle = Math.floor((low + high) / 2);
      if (items[middle].time < target) low = middle + 1;
      else high = middle;
    }
    var rightIndex = clamp(low, 0, items.length - 1);
    var leftIndex = clamp(rightIndex - (items[rightIndex].time > target ? 1 : 0), 0, items.length - 1);
    if (leftIndex === rightIndex) {
      if (rightIndex === 0 && items.length > 1) rightIndex = 1;
      else if (leftIndex === items.length - 1 && items.length > 1) leftIndex -= 1;
    }
    var left = items[leftIndex];
    var right = items[rightIndex];
    var leftX = this.chart.timeScale().timeToCoordinate(left.time);
    var rightX = this.chart.timeScale().timeToCoordinate(right.time);
    if (leftX == null || rightX == null) return null;
    if (right.time === left.time) return Number(leftX);
    return Number(leftX) + (target - left.time) / (right.time - left.time) * (Number(rightX) - Number(leftX));
  };

  CandleChart.prototype.screenPoint = function (point) {
    if (!point) return null;
    var x = this.timeToX(point.time);
    var y = this.series.priceToCoordinate(point.price);
    return x == null || y == null ? null : { x: Number(x), y: Number(y) };
  };

  CandleChart.prototype.pointFromEvent = function (event) {
    var rect = this.overlay.getBoundingClientRect();
    var x = clamp(event.clientX - rect.left, 0, this.plotWidth());
    var y = clamp(event.clientY - rect.top, 0, this.plotHeight());
    var scale = this.chart.timeScale();
    var time = scale.coordinateToTime(x);
    if (this.options.allowDrawingProjection && this.candles.length) {
      var logical = scale.coordinateToLogical(x);
      if (logical != null) {
        var items = this.candles, last = items.length - 1;
        var step = Number(this.options.timeframeSeconds) || (last > 0 ? items[last].time - items[last - 1].time : 60);
        if (logical < 0) time = items[0].time + logical * step;
        else if (logical > last) time = items[last].time + (logical - last) * step;
        else {
          var left = Math.floor(logical), right = Math.min(last, left + 1);
          time = items[left].time + (logical - left) * (items[right].time - items[left].time);
        }
      }
    }
    var price = this.series.coordinateToPrice(y);
    if (time == null || price == null) return null;
    if (typeof time === 'object') time = Date.UTC(time.year, time.month - 1, time.day) / 1000;
    if (this.drawingTimeBoundary != null && !this.options.allowDrawingProjection) time = Math.min(Number(time), this.drawingTimeBoundary);
    return { time: Number(time), price: Number(price), x: x, y: y };
  };

  CandleChart.prototype.svgElement = function (name, attributes) {
    var element = document.createElementNS(SVG_NS, name);
    Object.keys(attributes || {}).forEach(function (key) { element.setAttribute(key, attributes[key]); });
    return element;
  };

  CandleChart.prototype.appendLine = function (group, a, b, attributes) {
    group.appendChild(this.svgElement('line', {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      stroke: 'transparent', 'stroke-width': 28, 'stroke-linecap': 'round',
      'vector-effect': 'non-scaling-stroke', 'pointer-events': 'stroke', class: 'practice-drawing-hit'
    }));
    var line = this.svgElement('line', Object.assign({
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      stroke: '#e2e8f0', 'stroke-width': 2, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke'
    }, attributes || {}));
    group.appendChild(line);
    return line;
  };

  CandleChart.prototype.appendLabel = function (group, x, y, text, options) {
    options = options || {};
    var value = String(text || '').slice(0, 80);
    var width = Math.min(Math.max(34, value.length * 6.6 + 12), Math.max(34, this.plotWidth() - 4));
    var height = 21;
    var left = clamp(Number(x), 2, Math.max(2, this.plotWidth() - width - 2));
    var top = clamp(Number(y) - height / 2, 2, Math.max(2, this.plotHeight() - height - 2));
    group.appendChild(this.svgElement('rect', {
      x: left, y: top, width: width, height: height, rx: 5,
      fill: options.background || 'rgba(8, 15, 25, .92)', stroke: options.stroke || 'rgba(148,163,184,.45)', 'stroke-width': 1
    }));
    var label = this.svgElement('text', {
      x: left + 6, y: top + 14.5, fill: options.color || '#e2e8f0', 'font-size': 11, 'font-weight': 700,
      'font-family': 'Inter, sans-serif', 'pointer-events': 'none'
    });
    label.textContent = value;
    group.appendChild(label);
  };

  CandleChart.prototype.renderPosition = function (group, drawing, points) {
    var entry = points[0];
    var target = points[1];
    var stop = points[2];
    if (!entry || !target || !stop) return;
    var endX = Math.max(entry.x + 12, target.x, stop.x);
    var stats = this.model.positionStats(drawing);
    var targetColor = stats.valid ? '#22c55e' : '#94a3b8';
    var stopColor = stats.valid ? '#ef4444' : '#94a3b8';
    group.appendChild(this.svgElement('rect', {
      x: Math.min(entry.x, endX), y: Math.min(entry.y, target.y), width: Math.abs(endX - entry.x), height: Math.max(1, Math.abs(target.y - entry.y)),
      fill: targetColor, 'fill-opacity': .16, stroke: targetColor, 'stroke-width': 1
    }));
    group.appendChild(this.svgElement('rect', {
      x: Math.min(entry.x, endX), y: Math.min(entry.y, stop.y), width: Math.abs(endX - entry.x), height: Math.max(1, Math.abs(stop.y - entry.y)),
      fill: stopColor, 'fill-opacity': .14, stroke: stopColor, 'stroke-width': 1
    }));
    this.appendLine(group, { x: entry.x, y: entry.y }, { x: endX, y: entry.y }, { stroke: '#facc15', 'stroke-width': 2 });
    var labels = [
      {y:entry.y,text:(drawing.type === 'longPosition' ? 'LONG' : 'SHORT') + ' · Entry ' + priceText(stats.entry) + (stats.valid ? ' · '+stats.rr.toFixed(2)+'R' : ' · TIDAK VALID'),color:'#facc15'},
      {y:target.y,text:'TP '+priceText(stats.target),color:targetColor},
      {y:stop.y,text:'SL '+priceText(stats.stop),color:stopColor}
    ].sort(function(a,b){return a.y-b.y;});
    var bottom = this.plotHeight()-13;
    labels.forEach(function(label,i){label.labelY=Math.max(13,Math.min(bottom,label.y),i?labels[i-1].labelY+24:13);});
    if(labels[2].labelY>bottom){labels[2].labelY=bottom;for(var i=1;i>=0;i--)labels[i].labelY=Math.min(labels[i].labelY,labels[i+1].labelY-24);}
    labels.forEach(function(label){this.appendLabel(group,entry.x+5,label.labelY,label.text,{stroke:label.color,color:label.color});},this);
  };

  CandleChart.prototype.renderDrawing = function (drawing, draft) {
    var width = this.plotWidth();
    var points = drawing.points.map(this.screenPoint.bind(this));
    var domain = drawing.points;
    var group = this.svgElement('g', {
      class: 'practice-drawing' + (drawing.id === this.selectedId ? ' is-selected' : '') + (draft ? ' is-draft' : ''),
      'data-drawing-id': draft ? '' : drawing.id
    });
    var style = this.model.normalizeStyle(drawing.style);
    var color = style.color || COLORS[drawing.type] || '#e2e8f0';
    var a = points[0];
    var b = points[1];
    var c = points[2];
    if (!a) return null;

    if (['horizontal', 'entry', 'stop', 'target'].indexOf(drawing.type) >= 0) {
      this.appendLine(group, { x: 0, y: a.y }, { x: width, y: a.y }, {
        stroke: color, 'stroke-width': drawing.type === 'horizontal' ? 1.5 : 2,
        'stroke-dasharray': drawing.type === 'horizontal' ? '6 5' : 'none'
      });
      this.appendLabel(group, width - 90, a.y, (TOOL_LABELS[drawing.type] || 'Harga') + ' ' + priceText(domain[0].price), { stroke: color, color: color });
    } else if (drawing.type === 'horizontalRay') {
      this.appendLine(group, a, { x: width, y: a.y }, { stroke: color, 'stroke-width': 2, 'stroke-dasharray': '7 4' });
      this.appendLabel(group, a.x + 7, a.y - 13, 'Ray ' + priceText(domain[0].price), { stroke: color });
    } else if (drawing.type === 'trend' && b) {
      this.appendLine(group, a, b, { stroke: color, 'stroke-width': 2.2 });
    } else if (drawing.type === 'arrow' && b) {
      var markerId = 'arrow-' + drawing.id.replace(/[^a-zA-Z0-9_-]/g, '');
      var marker = this.svgElement('marker', { id: markerId, markerWidth: 8, markerHeight: 8, refX: 7, refY: 3, orient: 'auto', markerUnits: 'strokeWidth' });
      marker.appendChild(this.svgElement('path', { d: 'M0,0 L0,6 L8,3 z', fill: color }));
      group.appendChild(marker);
      this.appendLine(group, a, b, { stroke: color, 'stroke-width': 2.2, 'marker-end': 'url(#' + markerId + ')' });
    } else if (drawing.type === 'rectangle' && b) {
      group.appendChild(this.svgElement('rect', {
        x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.max(1, Math.abs(a.x - b.x)), height: Math.max(1, Math.abs(a.y - b.y)),
        fill: color, 'fill-opacity': .16, stroke: color, 'stroke-width': 1.6, 'pointer-events': 'stroke'
      }));
      group.appendChild(this.svgElement('rect', {
        x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.max(1, Math.abs(a.x - b.x)), height: Math.max(1, Math.abs(a.y - b.y)),
        fill: 'none', stroke: 'transparent', 'stroke-width': 20, 'pointer-events': 'stroke', class: 'practice-drawing-hit'
      }));
    } else if (drawing.type === 'circle' && b) {
      group.appendChild(this.svgElement('ellipse', {
        cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, rx: Math.max(2, Math.abs(a.x - b.x) / 2), ry: Math.max(2, Math.abs(a.y - b.y) / 2),
        fill: color, 'fill-opacity': .08, stroke: color, 'stroke-width': 1.8
      }));
    } else if (drawing.type === 'path' && points.filter(Boolean).length > 1) {
      group.appendChild(this.svgElement('polyline', {
        points: points.filter(Boolean).map(function (point) { return point.x + ',' + point.y; }).join(' '),
        fill: 'none', stroke: 'transparent', 'stroke-width': 28, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        'vector-effect': 'non-scaling-stroke', 'pointer-events': 'stroke', class: 'practice-drawing-hit'
      }));
      group.appendChild(this.svgElement('polyline', {
        points: points.filter(Boolean).map(function (point) { return point.x + ',' + point.y; }).join(' '),
        fill: 'none', stroke: color, 'stroke-width': 2.3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }));
    } else if (drawing.type === 'priceRange' && b) {
      this.appendLine(group, a, b, { stroke: color, 'stroke-width': 2 });
      this.appendLine(group, { x: a.x - 7, y: a.y }, { x: a.x + 7, y: a.y }, { stroke: color });
      this.appendLine(group, { x: b.x - 7, y: b.y }, { x: b.x + 7, y: b.y }, { stroke: color });
      var delta = domain[1].price - domain[0].price;
      var percent = domain[0].price === 0 ? 0 : delta / domain[0].price * 100;
      this.appendLabel(group, (a.x + b.x) / 2 + 7, (a.y + b.y) / 2, (delta >= 0 ? '+' : '') + priceText(delta) + ' · ' + percent.toFixed(2) + '%', { stroke: color, color: color });
    } else if (drawing.type === 'fibonacci' && b) {
      var left = Math.min(a.x, b.x);
      var right = Math.max(a.x, b.x);
      var self = this;
      FIB_LEVELS.forEach(function (level) {
        var levelPrice = domain[0].price + (domain[1].price - domain[0].price) * level;
        var y = self.series.priceToCoordinate(levelPrice);
        if (y == null) return;
        self.appendLine(group, { x: left, y: y }, { x: right, y: y }, {
          stroke: level === .5 || level === .705 ? '#fbbf24' : color,
          'stroke-width': level === .5 || level === .705 ? 1.7 : 1,
          'stroke-opacity': .9
        });
        self.appendLabel(group, right + 4, y, Math.round(level * 1000) / 10 + '% ' + priceText(levelPrice), { stroke: color });
      });
    } else if (drawing.type === 'parallelChannel' && b && c) {
      var dDomain = { time: domain[2].time + (domain[1].time - domain[0].time), price: domain[2].price + (domain[1].price - domain[0].price) };
      var d = this.screenPoint(dDomain);
      if (d) {
        group.appendChild(this.svgElement('polygon', {
          points: [a, b, d, c].map(function (point) { return point.x + ',' + point.y; }).join(' '),
          fill: color, 'fill-opacity': .09, stroke: 'none'
        }));
        this.appendLine(group, a, b, { stroke: color, 'stroke-width': 2 });
        this.appendLine(group, c, d, { stroke: color, 'stroke-width': 2 });
        this.appendLine(group, a, c, { stroke: color, 'stroke-width': 1, 'stroke-dasharray': '4 4', 'stroke-opacity': .7 });
      }
    } else if ((drawing.type === 'longPosition' || drawing.type === 'shortPosition') && b && c) {
      this.renderPosition(group, drawing, points);
    } else if (drawing.type === 'text') {
      this.appendLabel(group, a.x, a.y, drawing.text || 'Teks', { stroke: color, color: color });
    } else if (drawing.type === 'note') {
      group.appendChild(this.svgElement('circle', { cx: a.x, cy: a.y, r: 7, fill: color, stroke: '#111827', 'stroke-width': 2 }));
      this.appendLabel(group, a.x + 11, a.y, drawing.text || 'Catatan', { stroke: color });
    } else if (drawing.type === 'priceNote') {
      this.appendLine(group, a, { x: width, y: a.y }, { stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '4 4' });
      this.appendLabel(group, a.x + 7, a.y, (drawing.text || 'Harga') + ' · ' + priceText(domain[0].price), { stroke: color, color: color });
    }
    group.querySelectorAll('[stroke]').forEach(function (element) {
      if (element.getAttribute('stroke') === 'transparent' || element.getAttribute('stroke') === 'none') return;
      element.setAttribute('stroke-width', style.width);
      if (style.color) element.setAttribute('stroke', style.color);
    });
    group.setAttribute('opacity', style.opacity);
    return group;
  };

  CandleChart.prototype.setDrawingStyle = function (patch) {
    var selected = this.drawings.find(function (item) { return item.id === this.selectedId; }, this);
    this.drawingStyle = this.model.normalizeStyle(Object.assign({}, selected ? selected.style : this.drawingStyle, patch));
    if (selected) {
      this.remember();
      selected.style = this.model.normalizeStyle(this.drawingStyle);
      this.saveDrawings();
    }
    this.renderDrawings();
    this.notify(selected ? 'Style gambar tersimpan.' : 'Style untuk gambar berikutnya.');
  };

  CandleChart.prototype.renderHandles = function (drawing) {
    var self = this;
    var handles = drawing.points.map(function (point, index) { return { point: point, timeIndex: index, priceIndex: index }; });
    if (drawing.type === 'path' && handles.length > 2) handles = [handles[0], handles[handles.length - 1]];
    if (drawing.type === 'rectangle') {
      var a = drawing.points[0], b = drawing.points[1];
      handles = [
        {point:a,timeIndex:0,priceIndex:0}, {point:b,timeIndex:1,priceIndex:1},
        {point:{time:a.time,price:b.price},timeIndex:0,priceIndex:1},
        {point:{time:b.time,price:a.price},timeIndex:1,priceIndex:0},
        {point:{time:(a.time+b.time)/2,price:a.price},timeIndex:-1,priceIndex:0},
        {point:{time:(a.time+b.time)/2,price:b.price},timeIndex:-1,priceIndex:1},
        {point:{time:a.time,price:(a.price+b.price)/2},timeIndex:0,priceIndex:-1},
        {point:{time:b.time,price:(a.price+b.price)/2},timeIndex:1,priceIndex:-1}
      ];
    }
    handles.forEach(function (handle) {
      var point = self.screenPoint(handle.point);
      if (!point) return;
      var attrs = { cx:point.x, cy:point.y, 'data-drawing-id':drawing.id,
        'data-point-index':handle.timeIndex, 'data-time-index':handle.timeIndex, 'data-price-index':handle.priceIndex };
      self.overlay.appendChild(self.svgElement('circle', Object.assign({}, attrs, {
        r:18, fill:'transparent', 'pointer-events':'all', class:'practice-drawing-handle-hit'
      })));
      self.overlay.appendChild(self.svgElement('circle', Object.assign({}, attrs, {
        r:6, fill:'#f8fafc', stroke:'#0ea5e9', 'stroke-width':2, class:'practice-drawing-handle'
      })));
    });
  };

  CandleChart.prototype.renderDrawings = function () {
    if (!this.overlay || !this.series) return;
    this.syncOverlaySize();
    while (this.overlay.firstChild) this.overlay.removeChild(this.overlay.firstChild);
    var defs = this.svgElement('defs');
    var marker = this.svgElement('marker', { id: 'amy-practice-arrow', markerWidth: 8, markerHeight: 8, refX: 7, refY: 3, orient: 'auto', markerUnits: 'strokeWidth' });
    marker.appendChild(this.svgElement('path', { d: 'M0,0 L0,6 L8,3 z', fill: '#60a5fa' }));
    defs.appendChild(marker);
    this.overlay.appendChild(defs);
    var self = this;
    this.drawings.filter(function (drawing) { return self.isDrawingVisible(drawing); }).forEach(function (drawing) {
      var group = self.renderDrawing(drawing, false);
      if (group) self.overlay.appendChild(group);
    });
    if (this.draftPath && this.draftPath.length > 1) {
      var pathDraft = this.model.create('path', this.draftPath, { style: this.drawingStyle });
      var pathGroup = pathDraft && this.renderDrawing(pathDraft, true);
      if (pathGroup) this.overlay.appendChild(pathGroup);
    } else if (this.gestureStart && this.hoverPoint && this.activeTool && this.activeTool !== 'select') {
      var previewPoints = this.draftPoints.length ? this.draftPoints.concat([this.hoverPoint]) : [this.gestureStart, this.hoverPoint];
      var required = this.model.requiredPoints(this.activeTool);
      if (previewPoints.length >= required) {
        var preview = this.model.create(this.activeTool, previewPoints.slice(0, required), { style: this.drawingStyle });
        var previewGroup = preview && this.renderDrawing(preview, true);
        if (previewGroup) this.overlay.appendChild(previewGroup);
      }
    } else if (this.draftPoints.length === 2 && this.hoverPoint && this.activeTool) {
      var thirdPreview = this.model.create(this.activeTool, this.draftPoints.concat([this.hoverPoint]));
      var thirdGroup = thirdPreview && this.renderDrawing(thirdPreview, true);
      if (thirdGroup) this.overlay.appendChild(thirdGroup);
    }
    var selected = this.drawings.find(function (drawing) { return drawing.id === self.selectedId; });
    var selectable = this.activeTool === 'select' && selected && this.isDrawingVisible(selected);
    this.deleteButton.hidden = !selectable || Boolean(this.dragState || this.gestureStart);
    if (selectable) this.renderHandles(selected);
  };

  CandleChart.prototype.findDrawingAt = function (x, y) {
    var hit = { x: x, y: y };
    for (var index = this.drawings.length - 1; index >= 0; index -= 1) {
      var drawing = this.drawings[index];
      if (!this.isDrawingVisible(drawing)) continue;
      var points = drawing.points.map(this.screenPoint.bind(this));
      var a = points[0];
      var b = points[1];
      var c = points[2];
      if (!a) continue;
      if (['horizontal', 'entry', 'stop', 'target'].indexOf(drawing.type) >= 0 && Math.abs(y - a.y) <= 14) return drawing;
      if ((drawing.type === 'horizontalRay' || drawing.type === 'priceNote') && x >= a.x - 14 && Math.abs(y - a.y) <= 14) return drawing;
      if (['text', 'note'].indexOf(drawing.type) >= 0 && distance(hit, a) <= 30) return drawing;
      if (drawing.type === 'path') {
        for (var p = 1; p < points.length; p += 1) if (points[p - 1] && points[p] && segmentDistance(hit, points[p - 1], points[p]) <= 15) return drawing;
      }
      if (['trend', 'arrow', 'priceRange'].indexOf(drawing.type) >= 0 && b && segmentDistance(hit, a, b) <= 15) return drawing;
      if (drawing.type === 'parallelChannel' && b && c && (segmentDistance(hit, a, b) <= 15 || distance(hit, c) <= 25)) return drawing;
      if (drawing.type === 'circle' && b) {
        var rx = Math.max(4, Math.abs(a.x - b.x) / 2);
        var ry = Math.max(4, Math.abs(a.y - b.y) / 2);
        var cx = (a.x + b.x) / 2;
        var cy = (a.y + b.y) / 2;
        if (Math.pow((x - cx) / rx, 2) + Math.pow((y - cy) / ry, 2) <= 1.25) return drawing;
      }
      if (b && ['rectangle', 'fibonacci', 'longPosition', 'shortPosition'].indexOf(drawing.type) >= 0) {
        var xs = points.filter(Boolean).map(function (point) { return point.x; });
        var ys = points.filter(Boolean).map(function (point) { return point.y; });
        if (x >= Math.min.apply(null, xs) - 14 && x <= Math.max.apply(null, xs) + 14 && y >= Math.min.apply(null, ys) - 14 && y <= Math.max.apply(null, ys) + 14) return drawing;
      }
    }
    return null;
  };

  CandleChart.prototype.openTextEditor = function (type, point) {
    this.removeTextEditor();
    var form = document.createElement('form');
    form.className = 'practice-drawing-editor';
    form.setAttribute('role', 'dialog');
    form.setAttribute('aria-modal', 'true');
    form.setAttribute('aria-label', (TOOL_LABELS[type] || 'Anotasi') + ' chart');
    var label = document.createElement('label');
    label.textContent = (TOOL_LABELS[type] || 'Anotasi') + ' chart';
    var input = document.createElement('textarea');
    input.maxLength = 240;
    input.placeholder = type === 'priceNote' ? 'Contoh: Area reaksi' : 'Tulis anotasi…';
    input.setAttribute('aria-label', label.textContent);
    var actions = document.createElement('div');
    var save = document.createElement('button');
    save.type = 'submit'; save.textContent = 'Simpan';
    var cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = 'Batal';
    actions.appendChild(save); actions.appendChild(cancel);
    form.appendChild(label); form.appendChild(input); form.appendChild(actions);
    (document.fullscreenElement || document.body || this.container).appendChild(form);
    this.textEditor = form;
    var self = this;
    this.setTool(null);
    form.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      self.removeTextEditor();
      self.addDrawing(type, [point], input.value || TOOL_LABELS[type]);
    });
    cancel.addEventListener('click', function () {
      self.removeTextEditor();
      self.setTool(self.drawings.length ? 'select' : null);
      self.notify('Anotasi dibatalkan.');
    });
    input.focus();
  };

  CandleChart.prototype.removeTextEditor = function () {
    if (this.textEditor && this.textEditor.parentNode) this.textEditor.parentNode.removeChild(this.textEditor);
    this.textEditor = null;
  };

  CandleChart.prototype.capturePointer = function (event) {
    try { this.overlay.setPointerCapture(event.pointerId); } catch (_) {}
  };

  CandleChart.prototype.handlePointerDown = function (event) {
    if (!this.activeTool || (event.button != null && event.button !== 0)) return;
    if (this.gesturePointerId != null && this.gesturePointerId !== event.pointerId) return;
    this.gesturePointerId = event.pointerId;
    event.preventDefault();
    event.stopPropagation();
    var point = this.pointFromEvent(event);
    if (!point) return;
    this.capturePointer(event);
    if (this.activeTool === 'select') {
      var handle = event.target.closest && event.target.closest('[data-point-index]');
      var painted = event.target.closest && event.target.closest('[data-drawing-id]');
      var targetId = (handle || painted) && (handle || painted).getAttribute('data-drawing-id');
      var drawing = targetId ? this.drawings.find(function (item) { return item.id === targetId; }) : null;
      if (!drawing) drawing = this.findDrawingAt(point.x, point.y);
      this.selectedId = drawing ? drawing.id : null;
      this.dragState = drawing ? {
        id: drawing.id,
        mode: handle ? 'point' : 'move',
        pointIndex: handle ? Number(handle.getAttribute('data-point-index')) : null,
        timeIndex: handle ? Number(handle.getAttribute('data-time-index')) : null,
        priceIndex: handle ? Number(handle.getAttribute('data-price-index')) : null,
        startPoint: point,
        original: this.model.clone(drawing),
        remembered: false
      } : null;
      this.renderDrawings();
      this.notify(drawing ? 'Gambar dipilih. Geser objek atau handle putih untuk mengedit.' : 'Tidak ada gambar pada titik ini.');
      return;
    }
    if (this.activeTool === 'path') {
      this.draftPath = [point];
      this.hoverPoint = point;
      return;
    }
    if (this.model.THREE_POINT.indexOf(this.activeTool) >= 0 && this.draftPoints.length === 2) {
      this.gestureStart = point;
      this.hoverPoint = point;
      return;
    }
    this.gestureStart = this.tapAnchor || point;
    this.hoverPoint = point;
  };

  CandleChart.prototype.handlePointerMove = function (event) {
    if (event.pointerId != null && this.gesturePointerId != null && event.pointerId !== this.gesturePointerId) return;
    if (!this.activeTool) return;
    var point = this.pointFromEvent(event);
    if (!point) return;
    if (this.activeTool === 'select' && this.dragState) {
      event.preventDefault();
      var next;
      if (!this.dragState.remembered && distance(point, this.dragState.startPoint) <= 2) return;
      if (!this.dragState.remembered) {
        this.remember();
        this.dragState.remembered = true;
      }
      if (this.dragState.mode === 'point') {
        next = this.model.clone(this.dragState.original);
        if (this.dragState.timeIndex >= 0) next.points[this.dragState.timeIndex].time = Math.round(point.time);
        if (this.dragState.priceIndex >= 0) next.points[this.dragState.priceIndex].price = point.price;
      }
      else {
        var deltaTime = point.time - this.dragState.startPoint.time;
        if (this.drawingTimeBoundary != null && !this.options.allowDrawingProjection) {
          var latestTime = Math.max.apply(null, this.dragState.original.points.map(function (item) { return Number(item.time); }));
          deltaTime = Math.min(deltaTime, this.drawingTimeBoundary - latestTime);
        }
        next = this.model.move(this.dragState.original, deltaTime, point.price - this.dragState.startPoint.price);
      }
      var position = this.model.positionStats(next);
      if (position && !position.valid) {
        this.notify('Level tidak valid: TP harus di sisi profit dan SL di sisi risiko.');
        return;
      }
      var index = this.drawings.findIndex(function (drawing) { return drawing.id === next.id; });
      if (index >= 0) this.drawings[index] = next;
      this.scheduleDrawingSync();
      return;
    }
    if (this.activeTool === 'path' && this.draftPath) {
      var last = this.draftPath[this.draftPath.length - 1];
      if (!last || distance(point, last) >= 4) this.draftPath.push(point);
      this.hoverPoint = point;
      this.scheduleDrawingSync();
      return;
    }
    if (this.gestureStart || this.draftPoints.length === 2) {
      this.hoverPoint = point;
      this.scheduleDrawingSync();
    }
  };

  CandleChart.prototype.handlePointerUp = function (event) {
    if (event.pointerId != null && this.gesturePointerId != null && event.pointerId !== this.gesturePointerId) return;
    this.gesturePointerId = null;
    try { this.overlay.releasePointerCapture(event.pointerId); } catch (_) {}
    if (!this.activeTool) return;
    event.preventDefault();
    var point = this.pointFromEvent(event);
    if (!point) { this.handlePointerCancel(event); return; }
    try {
    if (this.activeTool === 'select') {
      if (this.dragState && point) this.handlePointerMove(event);
      if (this.dragState && this.dragState.remembered) {
        this.saveDrawings();
        this.notify('Perubahan gambar tersimpan.');
      }
      this.dragState = null;
      this.flushPendingCandles();
      this.renderDrawings();
      return;
    }
    if (this.activeTool === 'path') {
      var path = this.draftPath || [];
      this.draftPath = null;
      if (point && path.length && distance(path[path.length - 1], point) >= 2) path.push(point);
      if (path.length >= 2) this.addDrawing('path', path);
      else this.notify('Seret untuk membuat Path / Free Line.');
      return;
    }
    if (!point || !this.gestureStart) return;
    var tool = this.activeTool;
    if (this.model.SINGLE_POINT.indexOf(tool) >= 0) {
      var anchor = this.gestureStart;
      if (['text', 'note', 'priceNote'].indexOf(tool) >= 0) this.openTextEditor(tool, anchor);
      else this.addDrawing(tool, [anchor]);
      return;
    }
    if (this.model.TWO_POINT.indexOf(tool) >= 0) {
      if (distance(this.gestureStart, point) < 3) {
        var touched = this.findDrawingAt(point.x, point.y);
        if (!this.tapAnchor && touched) { this.selectDrawing(touched.id); return; }
        this.tapAnchor = this.gestureStart;
        this.notify('Titik awal dipasang. Tap titik akhir, atau seret untuk menggambar.');
        this.gestureStart = null;
        this.hoverPoint = null;
        this.renderDrawings();
        return;
      }
      this.addDrawing(tool, [this.gestureStart, point]);
      return;
    }
    if (this.model.THREE_POINT.indexOf(tool) >= 0) {
      if (this.draftPoints.length === 2) {
        this.addDrawing(tool, this.draftPoints.concat([point]));
        return;
      }
      if (distance(this.gestureStart, point) < 3) {
        this.notify('Seret untuk menentukan dua titik pertama.');
        this.gestureStart = null;
        this.hoverPoint = null;
        return;
      }
      this.draftPoints = [this.gestureStart, point];
      this.gestureStart = null;
      this.hoverPoint = point;
      this.renderDrawings();
      this.notify(tool === 'parallelChannel' ? 'Tap titik ketiga untuk menentukan lebar kanal.' : 'Tap titik ketiga untuk menentukan Stop Loss.');
    }
    } finally {
      // Pointer ended: keep multi-tap anchors, but never block queued candles.
      this.gestureStart = null;
      this.draftPath = null;
      this.flushPendingCandles();
    }
  };

  CandleChart.prototype.handlePointerCancel = function (event) {
    if (event && event.pointerId != null && this.gesturePointerId != null && event.pointerId !== this.gesturePointerId) return;
    this.gesturePointerId = null;
    this.tapAnchor = null;
    if(this.dragState && this.dragState.remembered){
      var index=this.drawings.findIndex(function(item){return item.id===this.dragState.id;},this);
      if(index>=0)this.drawings[index]=this.model.clone(this.dragState.original);
      this.history.pop();
    }
    this.gestureStart = null;
    this.hoverPoint = null;
    this.draftPath = null;
    this.dragState = null;
    this.flushPendingCandles();
    this.renderDrawings();
  };

  CandleChart.prototype.handleKeyDown = function (event) {
    if (event.key === 'Escape' && this.textEditor) {
      event.preventDefault();
      this.removeTextEditor();
      this.setTool(this.drawings.length ? 'select' : null);
      this.notify('Anotasi dibatalkan.');
      return;
    }
    if (event.key === 'Escape' && this.activeTool) this.setTool(null);
    var isEditor = Boolean(event.target && event.target.matches && event.target.matches('input, textarea, [contenteditable="true"]'));
    if (!isEditor && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redo(); else this.undo();
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.activeTool === 'select' && this.selectedId && !isEditor) {
      event.preventDefault();
      this.deleteSelected();
    }
  };

  CandleChart.prototype.handleCrosshair = function (parameter) {
    var candle = parameter && parameter.seriesData && parameter.seriesData.get(this.series);
    this.onCrosshair(candle || null, parameter && parameter.time != null ? parameter.time : null);
  };

  CandleChart.prototype.handleClick = function (parameter) {
    if (this.activeTool === 'select') {
      if (this.selectedId) {
        this.selectedId = null;
        this.renderDrawings();
        this.notify('Pilihan drawing dilepas. Area kosong tetap bisa digeser atau di-zoom.');
      }
      return;
    }
    if (!parameter || !parameter.point || this.activeTool) return;
    var time = parameter.time;
    if (typeof time === 'object' && time) time = Date.UTC(time.year, time.month - 1, time.day) / 1000;
    var price = this.series.coordinateToPrice(parameter.point.y);
    this.onChartTap({ time: Number(time), price: Number(price), x: parameter.point.x, y: parameter.point.y });
  };

  CandleChart.prototype.setTradeLevels = function (levels) {
    var self = this;
    this.priceLines.forEach(function (line) { try { self.series.removePriceLine(line); } catch (_) {} });
    this.priceLines = [];
    (Array.isArray(levels) ? levels : []).forEach(function (level) {
      if (!Number.isFinite(Number(level.price))) return;
      self.priceLines.push(self.series.createPriceLine({
        price: Number(level.price), color: level.color || COLORS[level.type] || '#facc15',
        lineWidth: 2, lineStyle: root.LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true, title: String(level.title || level.type || '').toUpperCase()
      }));
    });
  };

  CandleChart.prototype.destroy = function () {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    root.removeEventListener('resize', this.renderDrawings);
    document.removeEventListener('keydown', this.handleKeyDown);
    this.overlay.removeEventListener('pointerdown', this.handlePointerDown);
    this.overlay.removeEventListener('pointermove', this.handlePointerMove);
    this.overlay.removeEventListener('pointerup', this.handlePointerUp);
    this.overlay.removeEventListener('pointercancel', this.handlePointerCancel);
    this.host.removeEventListener('pointerdown', this.handleNavigationStart);
    this.host.removeEventListener('touchstart', this.handleNavigationStart);
    this.host.removeEventListener('wheel', this.handleNavigationStart);
    this.host.removeEventListener('wheel', this.handleChartTransform);
    this.host.removeEventListener('pointermove', this.handleChartTransform);
    this.host.removeEventListener('pointerup', this.handleChartTransform);
    this.host.removeEventListener('touchmove', this.handleChartTransform);
    this.host.removeEventListener('touchend', this.handleChartTransform);
    this.chart.timeScale().unsubscribeVisibleTimeRangeChange(this.scheduleDrawingSync);
    this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.scheduleDrawingSync);
    this.chart.timeScale().unsubscribeSizeChange(this.scheduleDrawingSync);
    if (this.drawingSyncFrame != null) {
      var cancelFrame = root.cancelAnimationFrame || clearTimeout;
      cancelFrame(this.drawingSyncFrame);
      this.drawingSyncFrame = null;
    }
    this.chart.unsubscribeCrosshairMove(this.handleCrosshair);
    this.chart.unsubscribeClick(this.handleClick);
    this.removeTextEditor();
    this.deleteButton.remove();
    this.chart.remove();
  };

  root.AmyCandleChart = Object.freeze({ CandleChart: CandleChart, COLORS: COLORS, TOOL_LABELS: TOOL_LABELS, FIB_LEVELS: FIB_LEVELS });
})(typeof window !== 'undefined' ? window : globalThis);

