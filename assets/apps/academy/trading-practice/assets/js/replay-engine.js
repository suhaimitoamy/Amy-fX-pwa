/* Amy FX Trading Practice — timestamp-owned replay controller with selectable historical packs. */
(function (root) {
  'use strict';

  if (root.AmyReplayEngine) return;
  var core = root.AmyPracticeCore;

  function lowerBound(items, value) {
    var low = 0;
    var high = items.length;
    while (low < high) {
      var middle = Math.floor((low + high) / 2);
      if (items[middle] < value) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function ReplayController(options) {
    options = options || {};
    this.provider = options.provider || root.AmyPracticeData;
    this.symbol = options.symbol || 'XAUUSD';
    this.timeframe = options.timeframe || 'M15';
    this.sourceId = options.sourceId || null;
    this.cursor = null;
    this.startTime = null;
    this.timeline = [];
    this.playTimer = null;
    this.requestSequence = 0;
    this.movePending = false;
    this.speedMs = Number(options.speedMs || 900);
    this.onChange = typeof options.onChange === 'function' ? options.onChange : function () {};
    this.onEnd = typeof options.onEnd === 'function' ? options.onEnd : function () {};
  }

  ReplayController.prototype.loadTimeline = async function () {
    this.timeline = await this.provider.getTimeline({ symbol: this.symbol, timeframe: this.timeframe, sourceId: this.sourceId });
    if (!this.timeline.length) throw new Error('Timeline replay kosong.');
    return this.timeline.slice();
  };

  ReplayController.prototype.start = async function (timestamp) {
    this.pause();
    await this.loadTimeline();
    var requested = core.finite(timestamp);
    var index = requested == null ? Math.min(80, this.timeline.length - 1) : lowerBound(this.timeline, requested);
    if (requested != null && this.timeline[index] !== requested && index > 0) index -= 1;
    index = Math.max(0, Math.min(index, this.timeline.length - 1));
    this.cursor = this.timeline[index];
    this.startTime = this.cursor;
    return this.emit('start', null);
  };

  ReplayController.prototype.setTimeframe = async function (timeframe) {
    this.pause();
    this.requestSequence += 1;
    this.timeframe = String(timeframe || 'M15').toUpperCase();
    await this.loadTimeline();
    if (this.cursor == null) this.cursor = this.timeline[Math.min(80, this.timeline.length - 1)];
    return this.emit('timeframe', this.cursor);
  };

  ReplayController.prototype.setSource = async function (sourceId, timestamp) {
    this.pause();
    this.requestSequence += 1;
    this.sourceId = sourceId || null;
    this.cursor = null;
    this.startTime = null;
    this.timeline = [];
    return this.start(timestamp == null ? null : timestamp);
  };

  ReplayController.prototype.move = async function (count) {
    if (!this.timeline.length) await this.loadTimeline();
    var previous = this.cursor;
    var insertion = lowerBound(this.timeline, this.cursor == null ? this.timeline[0] : this.cursor);
    var currentIndex = this.timeline[insertion] === this.cursor ? insertion : insertion - 1;
    var targetIndex = Math.max(0, Math.min(this.timeline.length - 1, currentIndex + Number(count || 0)));
    this.cursor = this.timeline[targetIndex];
    if (targetIndex === this.timeline.length - 1 && Number(count || 0) > 0) { this.pause(); this.onEnd(); }
    return this.emit(count < 0 ? 'previous' : 'advance', previous);
  };

  ReplayController.prototype.seek = async function (timestamp) {
    this.pause();
    if (!this.timeline.length) await this.loadTimeline();
    var requested = core.finite(timestamp);
    if (requested == null) throw new Error('Timestamp replay tidak valid.');
    var previous = this.cursor;
    var index = lowerBound(this.timeline, requested);
    index = Math.max(0, Math.min(index, this.timeline.length - 1));
    this.cursor = this.timeline[index];
    if (this.startTime == null) this.startTime = this.cursor;
    return this.emit('seek', previous);
  };

  ReplayController.prototype.emit = async function (reason, previousCursor) {
    var sequence = ++this.requestSequence;
    var cursor = this.cursor;
    var timeframe = this.timeframe;
    var sourceId = this.sourceId;
    var result = await this.provider.getCandles({
      symbol: this.symbol,
      timeframe: this.timeframe,
      sourceId: this.sourceId,
      cursor: cursor
    });
    if (sequence !== this.requestSequence || cursor !== this.cursor || timeframe !== this.timeframe || sourceId !== this.sourceId) return null;
    this.sourceId = result.sourceId || this.sourceId;
    if (result.candles.some(function (candle) { return candle.time > this.cursor || Number(candle.lastSourceTime || candle.time) > this.cursor; }, this)) {
      throw new Error('NO FUTURE LEAK invariant gagal.');
    }
    var payload = {
      reason: reason,
      sourceId: this.sourceId,
      symbol: this.symbol,
      timeframe: this.timeframe,
      cursor: this.cursor,
      previousCursor: previousCursor,
      startTime: this.startTime,
      source: result.source,
      sampleOnly: result.sampleOnly,
      candles: result.candles
    };
    await this.onChange(payload);
    return payload;
  };

  ReplayController.prototype.play = function () {
    var self = this;
    if (self.playTimer) return;
    self.playTimer = setInterval(function () {
      if (self.movePending) return;
      self.movePending = true;
      self.move(1).catch(function () { self.pause(); self.onEnd(); }).finally(function () { self.movePending = false; });
    }, self.speedMs);
  };

  ReplayController.prototype.pause = function () {
    if (this.playTimer) clearInterval(this.playTimer);
    this.playTimer = null;
  };

  ReplayController.prototype.setSpeed = function (milliseconds) {
    var wasPlaying = Boolean(this.playTimer);
    this.pause();
    this.speedMs = Math.max(120, Number(milliseconds || 900));
    if (wasPlaying) this.play();
  };

  ReplayController.prototype.destroy = function () { this.pause(); this.requestSequence += 1; };

  root.AmyReplayEngine = Object.freeze({ ReplayController: ReplayController, lowerBound: lowerBound });
})(typeof window !== 'undefined' ? window : globalThis);

