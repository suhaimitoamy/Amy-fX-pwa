/* Amy FX Trading Practice — native Twelve Data WebSocket event adapter. No REST/polling. */
(function (root) {
  'use strict';
  if (root.AmyPracticeLive) return;

  function LivePriceAdapter(options) {
    options = options || {};
    this.timeframe = options.timeframe || 'M1';
    this.aggregator = new root.AmyPracticeCore.TickAggregator(this.timeframe);
    if (options.seedCandle) this.aggregator.seed(options.seedCandle);
    this.onCandle = typeof options.onCandle === 'function' ? options.onCandle : function () {};
    this.onStatus = typeof options.onStatus === 'function' ? options.onStatus : function () {};
    this.connected = false;
    this.retryIndex = 0;
    this.retryTimer = null;
    this.started = false;
    this.handlePrice = this.handlePrice.bind(this);
    this.handleStatus = this.handleStatus.bind(this);
    this.handleAvailability = this.handleAvailability.bind(this);
  }

  LivePriceAdapter.prototype.bridge = function () { return root.AmyLivePrice || null; };

  LivePriceAdapter.prototype.start = function () {
    if (this.started) return;
    this.started = true;
    root.addEventListener('amyfx:twelvedata-price', this.handlePrice);
    root.addEventListener('amyfx:twelvedata-status', this.handleStatus);
    root.addEventListener('online', this.handleAvailability);
    document.addEventListener('visibilitychange', this.handleAvailability);
    this.connect();
  };

  LivePriceAdapter.prototype.connect = function () {
    if (!this.started) return;
    clearTimeout(this.retryTimer);
    var bridge = this.bridge();
    if (!bridge || typeof bridge.connect !== 'function') {
      this.onStatus({ status: 'UNAVAILABLE', message: 'Bridge live hanya tersedia di aplikasi Android.' });
      return;
    }
    try {
      bridge.connect();
      this.onStatus({ status: 'CONNECTING', message: 'Menghubungkan Twelve Data WebSocket…' });
    } catch (_) { this.scheduleReconnect(); }
  };

  LivePriceAdapter.prototype.scheduleReconnect = function () {
    var self = this;
    if (!this.started || document.hidden || root.navigator.onLine === false) return;
    var delays = [1000, 2000, 5000, 10000, 20000];
    var delay = delays[Math.min(this.retryIndex, delays.length - 1)];
    this.retryIndex += 1;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(function () { self.connect(); }, delay);
    this.onStatus({ status: 'RECONNECTING', message: 'Mencoba tersambung lagi dalam ' + Math.round(delay / 1000) + ' detik.' });
  };

  LivePriceAdapter.prototype.handlePrice = function (event) {
    var detail = event && event.detail ? event.detail : {};
    if (detail.source && detail.source !== 'TWELVE_DATA_WEBSOCKET') return;
    if (detail.symbol && !/^XAU\/?USD$/i.test(String(detail.symbol))) return;
    var update = this.aggregator.push({ price: detail.price, timestamp: detail.timestamp });
    if (!update) return;
    this.connected = true;
    this.retryIndex = 0;
    this.onStatus({ status: 'CONNECTED', message: 'Live · Twelve Data WebSocket' });
    this.onCandle(update);
  };

  LivePriceAdapter.prototype.handleStatus = function (event) {
    var detail = event && event.detail ? event.detail : {};
    var status = String(detail.status || detail.state || 'UNKNOWN').toUpperCase();
    this.onStatus({ status: status, message: detail.message || status });
    if (/DISCONNECT|ERROR|CLOSED|FAILED/.test(status)) {
      this.connected = false;
      this.scheduleReconnect();
    }
  };

  LivePriceAdapter.prototype.handleAvailability = function () {
    if (this.started && !document.hidden && root.navigator.onLine !== false && !this.connected) this.connect();
  };

  LivePriceAdapter.prototype.setTimeframe = function (timeframe, seedCandle) {
    this.timeframe = timeframe;
    this.aggregator.setTimeframe(timeframe);
    if (seedCandle) this.aggregator.seed(seedCandle);
  };

  LivePriceAdapter.prototype.seed = function (candle) {
    return this.aggregator.seed(candle);
  };

  LivePriceAdapter.prototype.stop = function () {
    clearTimeout(this.retryTimer);
    this.started = false;
    this.connected = false;
    this.retryIndex = 0;
    root.removeEventListener('amyfx:twelvedata-price', this.handlePrice);
    root.removeEventListener('amyfx:twelvedata-status', this.handleStatus);
    root.removeEventListener('online', this.handleAvailability);
    document.removeEventListener('visibilitychange', this.handleAvailability);
    var bridge = this.bridge();
    try { if (bridge && typeof bridge.disconnect === 'function') bridge.disconnect(); } catch (_) {}
  };

  root.AmyPracticeLive = Object.freeze({ LivePriceAdapter: LivePriceAdapter });
})(typeof window !== 'undefined' ? window : globalThis);
