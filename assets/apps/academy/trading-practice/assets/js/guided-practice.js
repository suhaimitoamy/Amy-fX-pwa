(function () {
  'use strict';
  var ui = window.AmyPracticeUI, session = window.AmyGuidedSession;
  var chart, bank = [], exercises = [], results = [], index = 0, answered = false;
  var SEEN_KEY = 'amy-guided-v2-seen', SUMMARY_KEY = 'amy-guided-v2-summary';
  var seen = [];
  try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); if (!Array.isArray(seen)) seen = []; } catch (_) {}
  function remember(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function element(tag, text, parent) {
    var node = document.createElement(tag); node.textContent = text; if (parent) parent.appendChild(node); return node;
  }
  function answer(choice) {
    if (answered) return;
    answered = true;
    var q = exercises[index], correct = choice === q.answer;
    results.push({ exercise: q, answer: choice, correct: correct });
    if (!seen.includes(q.id)) seen.push(q.id);
    remember(SEEN_KEY, seen);
    ui.byId('exerciseChoices').querySelectorAll('button').forEach(function (button) {
      button.disabled = true;
      if (button.textContent === q.answer) button.dataset.result = 'correct';
      else if (button.textContent === choice) button.dataset.result = 'wrong';
    });
    ui.text('exercisePrinciple', q.principle);
    ui.status('guidedStatus', (correct ? 'Benar. ' : 'Belum tepat. Jawaban: ' + q.answer + '. ') + q.principle, !correct);
    ui.byId('exerciseLesson').hidden = false;
    ui.byId('nextExercise').hidden = false;
    ui.byId('nextExercise').textContent = index === exercises.length - 1 ? 'Lihat rangkuman sesi' : 'Soal berikutnya';
    ui.byId('guidedProgress').style.width = ((index + 1) / exercises.length * 100) + '%';
    window.AmyPracticeStorage.saveGuidedResult({ exerciseId: q.id, title: q.title, answer: choice, correct: correct, timeframe: q.timeframe, source: q.source }).catch(function () {
      ui.text('saveNotice', 'Riwayat tidak dapat disimpan di perangkat ini. Rangkuman sesi tetap tersedia.');
    });
  }
  function loadExercise() {
    answered = false;
    var q = exercises[index];
    ui.byId('nextExercise').hidden = true;
    ui.text('exerciseLabel', 'SOAL ' + (index + 1) + ' / ' + exercises.length + ' · ' + q.difficulty.toUpperCase());
    ui.text('exerciseTitle', q.title);
    ui.text('exercisePrompt', q.prompt);
    ui.text('exercisePrinciple', 'Jawab satu kali. Penjelasan dan materi terkait terbuka setelah menjawab.');
    ui.text('chartGuide', q.chartGuide);
    ui.text('exerciseTimeframe', q.timeframe);
    ['Time','Open','High','Low','Close'].forEach(function (key) { ui.text('ohlc' + key, '—'); });
    ui.byId('exerciseLesson').href = q.lesson.href;
    ui.byId('exerciseLesson').textContent = q.lesson.title + ' →';
    ui.byId('exerciseLesson').hidden = true;
    ui.byId('guidedProgress').style.width = (index / exercises.length * 100) + '%';
    ui.status('guidedStatus', 'Amati penanda dan level chart, lalu pilih jawaban.');
    var host = ui.byId('exerciseChoices'); host.replaceChildren();
    chart.series.setMarkers([]);
    var prices = q.candles.flatMap(function (c) { return [c.low, c.high]; }).concat(q.levels.map(function (l) { return l.price; }));
    var low = Math.min.apply(null, prices), high = Math.max.apply(null, prices), padding = (high - low) * 0.15;
    chart.series.applyOptions({ autoscaleInfoProvider: function () { return { priceRange: { minValue: low - padding, maxValue: high + padding } }; } });
    chart.setCandles(q.candles, true);
    chart.setTradeLevels(q.levels);
    chart.series.setMarkers(q.markers);
    session.shuffle(q.choices).forEach(function (choice) {
      var button = element('button', choice, host); button.type = 'button';
      button.addEventListener('click', function () { answer(choice); });
    });
  }
  function showSummary() {
    var report = session.summary(results), host = ui.byId('reviewTopics'); host.replaceChildren();
    ui.byId('guidedWorkspace').hidden = true;
    ui.byId('guidedSummary').hidden = false;
    ui.text('summaryScore', report.correct + ' / ' + report.total + ' benar · ' + Math.round(report.correct / report.total * 100) + '%');
    ui.text('summaryIntro', report.topics.length ? 'Pelajari kembali materi berikut berdasarkan jawaban pertama yang salah.' : 'Semua jawaban benar. Lanjutkan ke tingkat berikutnya atau mulai sesi baru.');
    report.topics.forEach(function (topic) {
      var card = element('article', '', host); card.className = 'practice-panel';
      element('h3', topic.lesson.title + ' · ' + topic.mistakes.length + ' perlu ditinjau', card);
      var link = element('a', 'Buka materi ini →', card); link.href = topic.lesson.href; link.className = 'btn primary'; link.addEventListener('click', saveReport);
      topic.mistakes.forEach(function (r) {
        var detail = element('details', '', card);
        element('summary', r.exercise.prompt, detail);
        element('p', 'Jawaban Anda: ' + r.answer + ' · Jawaban benar: ' + r.exercise.answer, detail);
        element('p', r.exercise.principle, detail);
      });
    });
    saveReport();
    ui.byId('guidedSummary').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function saveReport() {
    remember(SUMMARY_KEY, { review: session.summary(results).topics.map(function(t){return {title:t.lesson.title,href:t.lesson.href};}), results: results.map(function (r) { return { id: r.exercise.id, answer: r.answer, correct: r.correct }; }) });
  }
  function start() {
    exercises = session.select(bank, ui.byId('exerciseCategory').value, Number(ui.byId('sessionLength').value), seen);
    if (!exercises.length) { ui.status('guidedStatus', 'Tidak ada soal untuk tingkat ini.', true); return; }
    index = 0; results = [];
    ui.byId('guidedSummary').hidden = true;
    ui.byId('guidedWorkspace').hidden = false;
    loadExercise();
  }
  async function init() {
    try {
      chart = new window.AmyCandleChart.CandleChart(ui.byId('chart'), { storageKey: '', onCrosshair: function (candle, time) { if (candle) ui.renderOhlc('ohlc', candle, Number(time)); } });
      var response = await fetch('assets/data/guided-exercises.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Bank soal gagal dimuat. Buka ulang latihan.');
      var data = await response.json(); bank = data.exercises || [];
      if (data.schemaVersion !== 2 || bank.length !== 60 || bank.some(function (q) { return !q.candles.length || !q.choices.includes(q.answer); })) throw new Error('Bank soal tidak lengkap.');
      ui.byId('startSession').disabled = false;
      ui.byId('startSession').addEventListener('click', start);
      ui.byId('restartSession').addEventListener('click', start);
      ui.byId('nextExercise').addEventListener('click', function () { if (!answered) return; if (index === exercises.length - 1) showSummary(); else { index++; loadExercise(); } });
      ui.byId('endSession').addEventListener('click', function () { if (results.length) showSummary(); else ui.status('guidedStatus', 'Jawab minimal satu soal untuk membuat rangkuman.'); });
      start();
      // Preserve the last report after opening a lesson and returning to this page.
      try {
        var last = JSON.parse(localStorage.getItem(SUMMARY_KEY) || 'null');
        if (last && last.results && last.results.length) {
          ui.byId('lastSummary').hidden = false;
          ui.byId('lastSummary').addEventListener('click', function () {
            var stored = JSON.parse(localStorage.getItem(SUMMARY_KEY) || 'null');
            if (!stored || !Array.isArray(stored.results)) return;
            results = stored.results.map(function (r) { return { exercise: bank.find(function (q) { return q.id === r.id; }), answer: r.answer, correct: r.correct }; }).filter(function (r) { return r.exercise; });
            if (results.length) showSummary();
          });
        }
      } catch (_) {}
    } catch (error) { ui.status('guidedStatus', error.message, true); }
    window.addEventListener('pagehide', function () { if (chart) chart.destroy(); }, { once: true });
    window.addEventListener('pageshow', function (event) { if (event.persisted) location.reload(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
