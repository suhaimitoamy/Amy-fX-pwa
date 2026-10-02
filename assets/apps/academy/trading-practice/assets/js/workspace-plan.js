/* Manual analysis drafts are separate from imported candles and trade outcomes. */
(function (root) {
  'use strict';
  var form = document.getElementById('workspacePlan');
  if (!form) return;
  var status = document.getElementById('workspaceStatus');
  var loadedKey = '';
  function key() {
    return 'amy.practice.v1.plans.' + encodeURIComponent(document.getElementById('datasetSource').value) + '.' + document.getElementById('timeframe').value;
  }
  function save() {
    if (!loadedKey) return;
    var value = { symbol: 'XAUUSD', timeframe: document.getElementById('timeframe').value, updatedAt: Date.now() };
    new FormData(form).forEach(function (valueItem, name) { value[name] = String(valueItem).slice(0,4000); });
    try { localStorage.setItem(loadedKey, JSON.stringify(value)); status.textContent = 'Rencana tersimpan di perangkat ini.'; }
    catch (_) { status.textContent = 'Penyimpanan penuh/tidak tersedia. Rencana belum tersimpan.'; }
  }
  function load() {
    var next = key();
    if (next === loadedKey) return;
    loadedKey = next; form.reset();
    try {
      var value = JSON.parse(localStorage.getItem(next) || '{}');
      ['bias','area','notes','scenario','invalidation'].forEach(function (name) { if (value[name] != null) form.elements[name].value = value[name]; });
      status.textContent = value.updatedAt ? 'Rencana sebelumnya dimuat.' : 'Tulis analisis dan skenario untuk dataset serta timeframe ini.';
    } catch (_) { status.textContent = 'Draft lama tidak dapat dibaca. Candle tetap tersedia.'; }
  }
  form.addEventListener('submit', function (event) { event.preventDefault(); save(); });
  form.addEventListener('input', save);
  root.addEventListener('amy-practice-source-ready', load);
})(window);
