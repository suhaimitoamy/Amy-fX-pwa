(function () {
  'use strict';
  var descriptions = {
    '00': 'Peta urutan belajar, lima fungsi inti, dan batas interpretasi status PASS/FAIL.',
    '01': 'Session sebagai konteks kapan market aktif—bukan penentu arah otomatis.',
    '02': 'SMT XAUUSD–DXY sebagai selector reversal dengan definisi swing yang frozen.',
    '03': 'HTF alignment sebagai filter konteks yang stabil lintas tahun dan regime.',
    '04': 'FVG/OB sebagai lokasi dan first valid retest sebagai timing entry.',
    '05': 'SMR/MMXM sebagai sequence lengkap dari context hingga retest.',
    '06': 'Menguji klaim populer: apa yang gagal ketika berdiri sendiri.',
    '07': 'Mengintegrasikan lima lapis tanpa menumpuk filter secara serampangan.',
    '08': 'Rule map dan state machine untuk memisahkan fungsi setiap konsep.'
  };
  function readPositions() { try { return JSON.parse(localStorage.getItem('amy_academy_reading_positions_v2') || '{}'); } catch (_) { return {}; } }
  function stateFor(id, positions) {
    var item = positions['backtest-learning/lesson.html?lesson=' + id] || {};
    if (item.completed || item.status === 'completed') return { label: 'Selesai', css: 'completed', progress: 100 };
    if (Number(item.progress || 0) > 0) return { label: 'Sedang dibaca · ' + Number(item.progress) + '%', css: 'reading', progress: Number(item.progress) };
    return { label: 'Belum dibaca', css: '', progress: 0 };
  }
  function render() {
    var positions = readPositions();
    var completed = 0; var firstOpen = null;
    document.getElementById('backtestCatalog').innerHTML = window.AmyBacktestLessons.map(function (lesson) {
      var state = stateFor(lesson.id, positions); if (state.css === 'completed') completed += 1;
      if (!firstOpen && state.css !== 'completed') firstOpen = lesson;
      return '<a class="backtest-card" href="lesson.html?lesson=' + lesson.id + '"><span class="backtest-card-number">DOKUMEN ' + lesson.id + '</span><h2>' + lesson.title + '</h2><p>' + descriptions[lesson.id] + '</p><div class="backtest-card-footer"><span class="lesson-state ' + state.css + '">' + state.label + '</span><span class="btn">Baca →</span></div></a>';
    }).join('');
    document.getElementById('progressLabel').textContent = completed + ' dari 9 materi selesai';
    document.getElementById('progressBar').style.width = ((completed / 9) * 100) + '%';
    var button = document.getElementById('continueLesson');
    if (!firstOpen) { button.href = 'lesson.html?lesson=00'; button.textContent = 'Ulangi dari 00 →'; }
    else { button.href = 'lesson.html?lesson=' + firstOpen.id; button.textContent = (completed ? 'Lanjut ke ' : 'Mulai dari ') + firstOpen.id + ' →'; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true }); else render();
  document.addEventListener('amy:reading-progress-changed', render);
})();
