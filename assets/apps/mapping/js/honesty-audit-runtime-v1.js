(function () {
  'use strict';

  var SNAPSHOT_KEY = 'amyfx_honesty_snapshots_v1';
  var ANOMALY_KEY = 'amyfx_honesty_anomalies_v1';
  var MAX_ROWS = 200;
  var lastFingerprint = '';
  var busy = false;
  var tfMs = {
    M1: 60000,
    M5: 300000,
    M15: 900000,
    M30: 1800000,
    H1: 3600000,
    H4: 14400000,
    D1: 86400000,
    W1: 604800000
  };

  function upper(value) {
    return String(value || '').trim().toUpperCase();
  }

  function finite(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function readRows(key) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function writeRows(key, rows) {
    try {
      localStorage.setItem(key, JSON.stringify(rows.slice(-MAX_ROWS)));
    } catch (_) {}
  }

  function scoreOf(result) {
    void result;
    return null;
  }

  function honestForecastText(text, score) {
    if (typeof text !== 'string') return text;
    return text
      .replace(/VALIDATED FORECAST\s*\(\s*\d+(?:\.\d+)?\s*%\s*\)/gi, 'AMY-SMC-D · HISTORICAL REFERENCE ONLY')
      .replace(/Direction Forecast tervalidasi\s+([A-Z]+)\s*\(\s*\d+(?:\.\d+)?\s*%\s*\)/gi, 'Amy-SMC-D Next Move $1 · HISTORICAL REFERENCE ONLY');
  }

  function repairStateLabels() {
    var result = window.state && window.state.result;
    if (!result) return false;
    var score = scoreOf(result);
    var changed = false;
    var targets = [
      [result.directionDecision, 'status'],
      [result.mappingExplanation, 'reason'],
      [result.mappingExplanation, 'headline'],
      [result.mappingExplanation, 'marketContext']
    ];
    targets.forEach(function (item) {
      var object = item[0];
      var key = item[1];
      if (!object || typeof object[key] !== 'string') return;
      var repaired = honestForecastText(object[key], score);
      if (repaired !== object[key]) {
        object[key] = repaired;
        changed = true;
      }
    });
    return changed;
  }

  function repairVisibleLabels() {
    var root = document.getElementById('app');
    if (!root) return;
    var score = scoreOf(window.state && window.state.result);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var repaired = honestForecastText(node.nodeValue, score);
      if (repaired !== node.nodeValue) node.nodeValue = repaired;
    }
  }

  function isoFromSeconds(value, addMs) {
    var number = finite(value);
    if (number == null) return null;
    var millis = number < 10000000000 ? number * 1000 : number;
    var date = new Date(millis + (addMs || 0));
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  function latestClosedTimes(state) {
    var output = {};
    Object.keys(state.candles || {}).forEach(function (tf) {
      var normalized = upper(tf);
      var candles = state.candles[tf];
      var latest = Array.isArray(candles) ? candles[candles.length - 1] : null;
      var closeTime = latest && isoFromSeconds(latest.time, tfMs[normalized] || 0);
      if (closeTime) output[normalized] = closeTime;
    });
    return output;
  }

  function snapshot(reason) {
    var state = window.state;
    var result = state && state.result;
    if (!state || !result) return null;
    repairStateLabels();

    var tf = upper(result.tf || state.tf || 'M15');
    var decision = result.directionDecision || {};
    var validated = result.validatedMarketContext || {};
    var forecast = validated.directionForecast || {};
    var execution = result.setupExecution || {};
    var sourceCandles = latestClosedTimes(state);

    return {
      schema: 'amyfx.honesty.snapshot.v1',
      branch: 'personal/amyfx-private',
      sourceMode: 'LIVE_RUNTIME',
      historicalReplay: false,
      reason: reason || 'automatic',
      capturedAt: new Date().toISOString(),
      timeframe: tf,
      sourceCandleTime: sourceCandles[tf] || null,
      sourceCandles: sourceCandles,
      dataStale: Boolean(result.dataStale),
      mappingReady: Boolean(result.amySmcD && result.amySmcD.ready),
      directionDecision: {
        bias: upper(decision.bias),
        signal: upper(decision.signal),
        source: upper(decision.source),
        status: decision.status || '',
        invalidated: Boolean(decision.invalidated),
        invalidationReason: decision.invalidationReason || ''
      },
      directionForecast: {
        active: Boolean(forecast.active),
        invalidated: Boolean(forecast.invalidated),
        expired: Boolean(forecast.expired),
        direction: upper(forecast.direction),
        directionValue: finite(forecast.directionValue) || 0,
        confidenceScore: scoreOf(result),
        startTime: isoFromSeconds(forecast.startTime, 0),
        expiryTime: isoFromSeconds(forecast.expiryTime, 0),
        confidenceMeaning: forecast.confidenceMeaning || ''
      },
      setupExecution: {
        active: Boolean(execution.active),
        terminal: Boolean(execution.terminal),
        setupId: execution.setupId || '',
        direction: upper(execution.direction),
        status: execution.status || '',
        lifecycleStage: upper(execution.lifecycleStage),
        entryLow: finite(execution.entryLow),
        entryHigh: finite(execution.entryHigh),
        stopLoss: finite(execution.stopLoss),
        target1: finite(execution.target1),
        target2: finite(execution.target2),
        singleTarget: Boolean(execution.singleTarget),
        invalidated: Boolean(execution.invalidated),
        invalidationReason: execution.invalidationReason || ''
      }
    };
  }

  function geometryIssue(execution) {
    var direction = upper(execution.direction);
    if (direction !== 'BUY' && direction !== 'SELL') return null;
    var lo = finite(execution.entryLow);
    var hi = finite(execution.entryHigh);
    var stop = finite(execution.stopLoss);
    var target1 = finite(execution.target1);
    var target2 = finite(execution.target2);
    if ([lo, hi, stop, target1].some(function (value) { return value == null; })) {
      return ['SETUP_GEOMETRY_MISSING', 'Setup BUY/SELL tidak memiliki entry, SL, atau target yang lengkap.'];
    }
    if (lo > hi) return ['ENTRY_RANGE_REVERSED', 'entryLow lebih tinggi daripada entryHigh.'];
    if (direction === 'BUY') {
      if (stop >= lo) return ['BUY_STOP_INVALID', 'SL BUY harus berada di bawah entryLow.'];
      if (target1 <= hi) return ['BUY_TARGET_INVALID', 'Target BUY harus berada di atas entryHigh.'];
      if (!execution.singleTarget && (target2 == null || target2 < target1)) return ['BUY_TARGET2_INVALID', 'Target 2 BUY tidak valid.'];
    } else {
      if (stop <= hi) return ['SELL_STOP_INVALID', 'SL SELL harus berada di atas entryHigh.'];
      if (target1 >= lo) return ['SELL_TARGET_INVALID', 'Target SELL harus berada di bawah entryLow.'];
      if (!execution.singleTarget && (target2 == null || target2 > target1)) return ['SELL_TARGET2_INVALID', 'Target 2 SELL tidak valid.'];
    }
    return null;
  }

  function audit(item) {
    if (!item) return [];
    var issues = [];
    var decision = item.directionDecision || {};
    var forecast = item.directionForecast || {};
    var execution = item.setupExecution || {};
    function add(code, severity, message, details) {
      issues.push({
        schema: 'amyfx.honesty.anomaly.v1',
        code: code,
        severity: severity,
        message: message,
        timestamp: item.sourceCandleTime || item.capturedAt,
        timeframe: item.timeframe,
        details: details || null
      });
    }

    if (item.dataStale && !item.mappingReady && decision.signal && decision.signal !== 'WAIT' && decision.signal !== 'DATA USANG') {
      add('STALE_DATA_DIRECTION', 'critical', 'Data usang menghasilkan arah selain WAIT.', { signal: decision.signal });
    }
    if (item.dataStale && execution.active) {
      add('STALE_DATA_ACTIVE_SETUP', 'critical', 'Data usang masih meninggalkan setup aktif.');
    }
    if ((!forecast.active || forecast.invalidated || forecast.expired) && execution.active) {
      add('INACTIVE_FORECAST_ACTIVE_SETUP', 'critical', 'Forecast tidak aktif atau terminal tetapi setup masih aktif.');
    }
    if (execution.terminal && execution.active) {
      add('TERMINAL_SETUP_ACTIVE', 'critical', 'Setup terminal juga ditandai aktif.');
    }
    var geometry = geometryIssue(execution);
    if (geometry && (execution.active || execution.direction === 'BUY' || execution.direction === 'SELL')) {
      add(geometry[0], 'critical', geometry[1]);
    }
    Object.keys(item.sourceCandles || {}).forEach(function (tf) {
      var time = Date.parse(item.sourceCandles[tf]);
      if (Number.isFinite(time) && time > Date.now() + 1000) {
        add('FUTURE_SOURCE_CANDLE', 'critical', 'Snapshot memakai candle dari masa depan.', { timeframe: tf, time: item.sourceCandles[tf] });
      }
    });
    if (/VALIDATED FORECAST[^\n]{0,80}\d+(?:\.\d+)?\s*%/i.test(decision.status || '')) {
      add('SCORE_PRESENTED_AS_PROBABILITY', 'error', 'Score forecast masih ditampilkan sebagai persentase.');
    }
    return issues;
  }

  function fingerprint(item) {
    var value = JSON.stringify({
      tf: item && item.timeframe,
      candle: item && item.sourceCandleTime,
      stale: item && item.dataStale,
      decision: item && item.directionDecision,
      forecast: item && item.directionForecast,
      setup: item && item.setupExecution
    });
    var hash = 2166136261;
    for (var index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function capture(reason, force) {
    if (busy) return null;
    busy = true;
    try {
      var item = snapshot(reason);
      if (!item) return null;
      var current = fingerprint(item);
      if (!force && current === lastFingerprint) return item;
      lastFingerprint = current;
      item.fingerprint = current;
      var issues = audit(item);
      var snapshots = readRows(SNAPSHOT_KEY);
      var anomalies = readRows(ANOMALY_KEY);
      snapshots.push(item);
      Array.prototype.push.apply(anomalies, issues);
      writeRows(SNAPSHOT_KEY, snapshots);
      writeRows(ANOMALY_KEY, anomalies);
      if (issues.length) {
        console.error('Amy FX honesty anomaly', issues, item);
        window.dispatchEvent(new CustomEvent('amyfx:honesty-audit-anomaly', { detail: { snapshot: item, anomalies: issues } }));
      }
      return item;
    } finally {
      busy = false;
    }
  }

  function download(kind) {
    var key = kind === 'anomalies' ? ANOMALY_KEY : SNAPSHOT_KEY;
    var rows = readRows(key);
    var blob = new Blob([rows.map(JSON.stringify).join('\n') + (rows.length ? '\n' : '')], { type: 'application/x-ndjson;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'amyfx-' + kind + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.jsonl';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return rows.length;
  }

  window.AmyFXHonestyAudit = Object.freeze({
    version: '1.0.0',
    branch: 'personal/amyfx-private',
    capture: function () { return capture('manual', true); },
    audit: audit,
    getSnapshots: function () { return readRows(SNAPSHOT_KEY); },
    getAnomalies: function () { return readRows(ANOMALY_KEY); },
    exportSnapshots: function () { return download('snapshots'); },
    exportAnomalies: function () { return download('anomalies'); },
    clear: function () {
      localStorage.removeItem(SNAPSHOT_KEY);
      localStorage.removeItem(ANOMALY_KEY);
      lastFingerprint = '';
    }
  });

  function tick(reason) {
    repairStateLabels();
    repairVisibleLabels();
    capture(reason || 'automatic', false);
  }

  window.addEventListener('amyfx:candles-updated', function () { setTimeout(function () { tick('candles-updated'); }, 100); });
  window.addEventListener('amyfx:mapping-state-change', function () { tick('mapping-state-change'); });
  window.addEventListener('amyfx:entry-watch-updated', function () { tick('entry-watch-updated'); });
  window.addEventListener('focus', function () { tick('focus'); });
  setTimeout(function () { tick('startup'); }, 500);
})();
