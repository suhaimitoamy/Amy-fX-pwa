(function () {
  'use strict';
  var ui = window.AmyPracticeUI;
  var core = window.AmyPracticeCore;
  var allTrades = [];

  function esc(value) {
    var node = document.createElement('span'); node.textContent = String(value == null ? '' : value); return node.innerHTML;
  }
  function resultClass(result) { return result === 'WIN' ? 'result-win' : (result === 'LOSS' ? 'result-loss' : 'result-open'); }
  function level(value) { return value == null ? '—' : core.price(value); }
  function rValue(value) { return value == null ? '—' : Number(value).toFixed(2) + 'R'; }
  function decision(trade) {
    return esc(trade.bias) + (trade.locked ? '<small class="history-lock">TERKUNCI</small>' : '');
  }
  function outcome(trade) {
    var evidence = trade && trade.outcomeEvidence;
    if (!evidence || !['SL', 'TP'].includes(evidence.type)) return esc(trade.result);
    var label = evidence.type + ' tersentuh';
    var detail = 'Level ' + level(evidence.level) + ' · candle ' + core.formatWita(evidence.candleTime, true) +
      ' · L/H ' + level(evidence.candleLow) + ' / ' + level(evidence.candleHigh);
    if (evidence.ambiguous) detail += ' · SL diprioritaskan karena SL dan TP tersentuh pada candle yang sama';
    return '<strong>' + esc(label) + '</strong><small class="history-evidence">' + esc(detail) + '</small>';
  }

  function renderTrades() {
    var result = ui.byId('resultFilter').value;
    var timeframe = ui.byId('timeframeFilter').value;
    var filtered = allTrades.filter(function (trade) { return (!result || trade.result === result) && (!timeframe || trade.timeframe === timeframe); });
    var rows = ui.byId('historyRows');
    rows.innerHTML = filtered.map(function (trade) {
      return '<tr data-trade-id="' + esc(trade.id) + '"><td>' + esc(core.formatWita(trade.tradeTime, true)) + '</td><td>' + esc(trade.timeframe) + '</td><td>' + decision(trade) + '</td><td>' + level(trade.entry) + ' / ' + level(trade.stopLoss) + ' / ' + level(trade.takeProfit) + '</td><td class="' + resultClass(trade.result) + '">' + outcome(trade) + '</td><td>' + rValue(trade.plannedR) + ' / ' + rValue(trade.r) + '</td><td title="' + esc(trade.notes) + '">' + esc((trade.notes || '—').slice(0, 60)) + '</td><td><button type="button" data-delete-trade="' + esc(trade.id) + '">Hapus</button></td></tr>';
    }).join('');
    if (!filtered.length) rows.innerHTML = '<tr><td colspan="8" class="empty-state">Belum ada catatan yang cocok.</td></tr>';
    rows.querySelectorAll('[data-delete-trade]').forEach(function (button) {
      button.addEventListener('click', async function () {
        if (!confirm('Hapus catatan lokal ini?')) return;
        await window.AmyPracticeStorage.deleteTrade(button.dataset.deleteTrade);
        await load();
      });
    });
    ui.status('historyStatus', filtered.length + ' dari ' + allTrades.length + ' catatan ditampilkan.');
  }

  async function renderGuided() {
    var items = await window.AmyPracticeStorage.listGuidedResults();
    items.sort(function (a, b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); });
    ui.byId('guidedHistory').innerHTML = items.length ? '<table class="practice-table"><thead><tr><th>Waktu</th><th>Latihan</th><th>Jawaban</th><th>Hasil</th></tr></thead><tbody>' + items.slice(0, 30).map(function (item) {
      return '<tr><td>' + esc(new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))) + ' WITA</td><td>' + esc(item.title) + '</td><td>' + esc(item.answer) + '</td><td class="' + (item.correct ? 'result-win' : 'result-loss') + '">' + (item.correct ? 'TEPAT' : 'COBA LAGI') + '</td></tr>';
    }).join('') + '</tbody></table>' : '<div class="empty-state">Belum ada hasil Guided Practice.</div>';
  }

  async function load() {
    allTrades = await window.AmyPracticeStorage.listTrades();
    ui.text('metricTotal', allTrades.length);
    ui.text('metricWin', allTrades.filter(function (item) { return item.result === 'WIN'; }).length);
    ui.text('metricLoss', allTrades.filter(function (item) { return item.result === 'LOSS'; }).length);
    ui.text('metricOpen', allTrades.filter(function (item) { return item.result === 'OPEN'; }).length);
    renderTrades(); await renderGuided();
  }
  function init() {
    ui.byId('resultFilter').addEventListener('change', renderTrades);
    ui.byId('timeframeFilter').addEventListener('change', renderTrades);
    load().catch(function (error) { ui.status('historyStatus', error.message, true); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
