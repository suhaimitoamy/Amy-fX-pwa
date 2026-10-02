(function () {
  'use strict';
  function esc(value) { var node = document.createElement('span'); node.textContent = String(value == null ? '' : value); return node.innerHTML; }
  function inline(value) {
    return esc(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  }
  function slug(value, index) { return 'bagian-' + index + '-' + String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 46); }
  function renderParagraph(paragraph, index, toc) {
    var text = paragraph.text;
    var heading = text.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      if (heading[1].length === 1 && index === 0) return '';
      var level = heading[1].length === 1 ? 2 : Math.min(3, heading[1].length);
      var id = slug(heading[2], index); toc.push({ id: id, text: heading[2], level: level });
      return '<h' + level + ' id="' + id + '">' + inline(heading[2]) + '</h' + level + '>';
    }
    var marker = text.match(/^\s*((?:[-*]|\d+[.)]))\s+/);
    var list = paragraph.list || Boolean(marker);
    var clean = marker ? text.slice(marker[0].length) : text;
    var evidence = /\b(?:PASS|FAIL|\d{1,2}[,.]\d{2,4}%|BT\d{2})\b/.test(text);
    return '<p class="' + (list ? 'lesson-list ' : '') + (evidence && !list ? 'evidence-line' : '') + '">' + (list ? '<span class="lesson-marker">' + esc(marker ? marker[1] : '•') + '</span><span>' : '') + inline(clean) + (list ? '</span>' : '') + '</p>';
  }
  function init() {
    var requested = new URLSearchParams(location.search).get('lesson') || '00';
    var lesson = window.AmyBacktestLessons.find(function (item) { return item.id === requested; }) || window.AmyBacktestLessons[0];
    history.replaceState(null, '', 'lesson.html?lesson=' + lesson.id);
    document.body.dataset.backtestLesson = lesson.id;
    document.title = lesson.id + ' — ' + lesson.title + ' — Amy FX Academy';
    var toc = [];
    var body = lesson.paragraphs.map(function (paragraph, index) { return renderParagraph(paragraph, index, toc); }).join('');
    var ctaLinks = (lesson.ctas || []).map(function (cta) { return '<a class="btn primary" href="' + esc(cta.href) + '">' + esc(cta.label) + ' →</a>'; }).join('');
    document.getElementById('lessonContent').innerHTML = '<div class="eyebrow">DOKUMEN ' + lesson.id + ' · ICT BERBASIS BACKTEST</div><h1>' + esc(lesson.title) + '</h1><div class="source-meta">Materi sumber Google Drive · Dokumen ID <code>' + esc(lesson.sourceDocId) + '</code> · <a href="' + esc(lesson.sourceUrl) + '">Buka sumber</a></div>' + body + '<section class="lesson-cta"><h2>Selesaikan materi ini</h2><p>Tandai selesai ketika Anda dapat menjelaskan fungsi konsep dan batas buktinya tanpa mengubahnya menjadi klaim profit.</p><div class="lesson-actions"><button id="completeLesson" class="btn primary" type="button">Tandai selesai</button>' + ctaLinks + '</div><div id="completeStatus" style="margin-top:10px;color:var(--muted)"></div></section>';
    document.getElementById('lessonToc').innerHTML = '<strong>Di materi ini</strong>' + toc.map(function (item) { return '<a href="#' + item.id + '" style="padding-left:' + (item.level === 3 ? 12 : 0) + 'px">' + esc(item.text) + '</a>'; }).join('');
    var currentIndex = window.AmyBacktestLessons.indexOf(lesson); var previous = window.AmyBacktestLessons[currentIndex - 1]; var next = window.AmyBacktestLessons[currentIndex + 1];
    document.getElementById('lessonNav').innerHTML = (previous ? '<a href="lesson.html?lesson=' + previous.id + '">← ' + previous.id + ' · ' + esc(previous.title) + '</a>' : '<a href="index.html">← Daftar materi</a>') + (next ? '<a href="lesson.html?lesson=' + next.id + '">' + next.id + ' · ' + esc(next.title) + ' →</a>' : '<a href="../trading-practice/index.html">Lanjut ke Trading Practice →</a>');
    document.getElementById('completeLesson').addEventListener('click', function () {
      if (!window.AmyAcademyReading) { document.getElementById('completeStatus').textContent = 'Pencatatan progres belum siap. Coba lagi.'; return; }
      window.AmyAcademyReading.markCompleted('backtest-learning/lesson.html?lesson=' + lesson.id);
      this.textContent = 'Selesai ✓'; this.disabled = true;
      document.getElementById('completeStatus').textContent = 'Progress tersimpan di perangkat ini.';
    });
    document.dispatchEvent(new CustomEvent('amy:lesson-ready', { detail: { namespace: 'ict-backtest', lesson: lesson.id } }));
    if (window.AmyAcademyReading) {
      var record = window.AmyAcademyReading.getRecord('backtest-learning/lesson.html?lesson=' + lesson.id);
      if (record.completed) { var button = document.getElementById('completeLesson'); button.textContent = 'Selesai ✓'; button.disabled = true; }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
