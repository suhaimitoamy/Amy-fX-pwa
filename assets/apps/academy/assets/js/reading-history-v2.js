/* Amy FX Academy reading history and resume position. */
(function () {
  'use strict';
  if (window.__amyAcademyReadingHistoryV2) return;
  window.__amyAcademyReadingHistoryV2 = true;

  var LAST_KEY = 'amy_academy_last_read_v2';
  var HISTORY_KEY = 'amy_academy_reading_history_v2';
  var POSITION_KEY = 'amy_academy_reading_positions_v2';
  var MAX_HISTORY = 8;
  var saveTimer = 0;

  function readJson(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function academyRoot() {
    try {
      return new URL((typeof ROOT_PATH !== 'undefined' ? ROOT_PATH : './'), location.href);
    } catch (_) {
      return new URL('./', location.href);
    }
  }

  function relativePath(url) {
    try {
      var root = academyRoot();
      var target = new URL(url || location.href, location.href);
      var rootPath = decodeURIComponent(root.pathname || '');
      var targetPath = decodeURIComponent(target.pathname || '');
      var lessonQuery = /\/backtest-learning\/lesson\.html$/i.test(targetPath) && target.searchParams.get('lesson')
        ? '?lesson=' + encodeURIComponent(target.searchParams.get('lesson')) : '';
      if (rootPath && targetPath.indexOf(rootPath) === 0) return targetPath.slice(rootPath.length).replace(/^\/+/, '') + lessonQuery;
      var marker = '/apps/academy/';
      var index = targetPath.indexOf(marker);
      return (index >= 0 ? targetPath.slice(index + marker.length) : targetPath.replace(/^\/+/, '')) + lessonQuery;
    } catch (_) {
      return String(url || '').replace(/^.*\/apps\/academy\//, '').replace(/^\/+/, '');
    }
  }

  function absolutePath(path) {
    try { return new URL(String(path || ''), academyRoot()).href; }
    catch (_) { return String(path || ''); }
  }

  function cleanTitle() {
    var heading = document.querySelector('.article h1, .article-layout h1, main h1');
    var title = heading && heading.textContent ? heading.textContent.trim() : '';
    if (title) return title;
    return String(document.title || 'Materi Trading').replace(/\s+[—|-]\s+Tutorial Trading.*$/i, '').trim();
  }

  function sectionLabel(path) {
    var eyebrow = document.querySelector('.article .eyebrow, .article-layout .eyebrow, .lesson-content .eyebrow');
    if (eyebrow && eyebrow.textContent.trim()) return eyebrow.textContent.trim();
    if (/^backtest-learning\/lesson\.html\?lesson=\d{2}$/i.test(String(path || ''))) return 'ICT Berbasis Backtest';
    var match = String(path || '').match(/bagian-(\d+)-([^/]+)/i);
    if (!match) return 'Amy FX Academy';
    return 'Bagian ' + match[1] + ' — ' + match[2].replace(/-/g, ' ');
  }

  function isLessonPage(path) {
    if (/^backtest-learning\/lesson\.html\?lesson=\d{2}$/i.test(String(path || ''))) return true;
    if (!/bagian-\d+[^/]+\/.+\.html$/i.test(String(path || ''))) return false;
    return Boolean(document.querySelector('.article, .article-layout'));
  }

  function currentHeading() {
    var headings = Array.prototype.slice.call(document.querySelectorAll('.article h2, .article h3, .article-layout h2, .article-layout h3, .lesson-content h2, .lesson-content h3'));
    var current = null;
    headings.forEach(function (heading, index) {
      var top = heading.getBoundingClientRect().top;
      if (top <= 140) current = { index: index, text: heading.textContent.trim() };
    });
    return current;
  }

  function progressPercent() {
    var height = Math.max(1, document.documentElement.scrollHeight - document.documentElement.clientHeight);
    return Math.max(0, Math.min(100, Math.round((window.scrollY / height) * 100)));
  }

  function saveLessonPosition() {
    var path = relativePath(location.href);
    if (!isLessonPage(path)) return;
    var previous = readJson(LAST_KEY, {});
    var positions = readJson(POSITION_KEY, {});
    var priorPosition = positions[path] || {};
    var heading = currentHeading();
    var progress = progressPercent();
    var record = {
      version: 2,
      path: path,
      title: cleanTitle(),
      section: sectionLabel(path),
      scrollY: Math.max(0, Math.round(window.scrollY || 0)),
      progress: progress,
      headingIndex: heading ? heading.index : null,
      headingText: heading ? heading.text : null,
      namespace: /^backtest-learning\//i.test(path) ? 'ict-backtest' : 'academy-main',
      status: priorPosition.completed || progress >= 95 ? 'completed' : (progress > 0 ? 'reading' : 'unread'),
      completed: Boolean(priorPosition.completed || progress >= 95),
      updatedAt: Date.now()
    };
    if (previous.path === path && previous.updatedAt && Date.now() - previous.updatedAt < 250 && previous.scrollY === record.scrollY) return;
    writeJson(LAST_KEY, record);

    positions[path] = { scrollY: record.scrollY, progress: record.progress, headingIndex: record.headingIndex, completed: record.completed, status: record.status, namespace: record.namespace, updatedAt: record.updatedAt };
    var positionKeys = Object.keys(positions).sort(function (a, b) { return Number(positions[b].updatedAt || 0) - Number(positions[a].updatedAt || 0); });
    // Keep enough positions for all 36 main sections plus the separate 00–08 track.
    positionKeys.slice(80).forEach(function (key) { delete positions[key]; });
    writeJson(POSITION_KEY, positions);

    var history = readJson(HISTORY_KEY, []);
    history = Array.isArray(history) ? history.filter(function (item) { return item && item.path !== path; }) : [];
    history.unshift(record);
    writeJson(HISTORY_KEY, history.slice(0, MAX_HISTORY));

    localStorage.setItem('amy_last_opened_title', record.title);
    localStorage.setItem('amy_last_opened_url', absolutePath(record.path));

    try {
      if (window.AmyLearningReminder && typeof window.AmyLearningReminder.recordLesson === 'function') {
        window.AmyLearningReminder.recordLesson(record.title, absolutePath(record.path), record.section || '');
      } else if (window.Android && typeof window.Android.recordLastStudiedLesson === 'function') {
        window.Android.recordLastStudiedLesson(record.title, absolutePath(record.path), record.section || '');
      }
    } catch (_) {}
  }

  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveLessonPosition, 350);
  }

  function restorePosition() {
    var path = relativePath(location.href);
    if (!isLessonPage(path)) return;
    var positions = readJson(POSITION_KEY, {});
    var last = readJson(LAST_KEY, null);
    var saved = positions[path] || (last && last.path === path ? last : null);
    var y = Number(saved && saved.scrollY);
    if (!Number.isFinite(y) || y < 80) return;
    var restore = function () {
      var maxY = Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight);
      window.scrollTo(0, Math.min(y, maxY));
    };
    setTimeout(restore, 120);
    setTimeout(restore, 500);
    window.addEventListener('load', function () { setTimeout(restore, 120); }, { once: true });
  }

  function formatTime(timestamp) {
    try {
      return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Makassar',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date(timestamp)) + ' WITA';
    } catch (_) {
      return '';
    }
  }

  function resumeCardHtml(last, history) {
    var recent = history.filter(function (item) { return item && item.path !== last.path; }).slice(0, 3);
    var recentHtml = recent.length
      ? '<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border)"><strong style="display:block;margin-bottom:8px">Riwayat baca terbaru</strong>' + recent.map(function (item) {
          return '<a class="chapter-row" style="margin-top:8px" href="' + absolutePath(item.path) + '"><span><strong>' + escapeHtml(item.title) + '</strong><br><small>' + escapeHtml(item.section) + ' · ' + Number(item.progress || 0) + '%</small></span><span>→</span></a>';
        }).join('') + '</div>'
      : '';
    return '<div class="course-card" style="padding:24px;background:var(--accent-soft);border-color:var(--accent)">' +
      '<div class="num" style="color:var(--accent)">TERAKHIR DIBACA</div>' +
      '<h3 style="margin:8px 0;font-size:18px">' + escapeHtml(last.title) + '</h3>' +
      '<p style="margin:0 0 4px">' + escapeHtml(last.section) + '</p>' +
      '<small style="display:block;color:var(--muted)">Posisi ' + Number(last.progress || 0) + '% · ' + escapeHtml(formatTime(last.updatedAt)) + (last.headingText ? ' · ' + escapeHtml(last.headingText) : '') + '</small>' +
      '<a class="btn primary" href="' + absolutePath(last.path) + '" style="margin-top:14px;width:fit-content">Lanjutkan dari posisi terakhir →</a>' +
      recentHtml + '</div>';
  }

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = String(value == null ? '' : value);
    return div.innerHTML;
  }

  function renderResumeCard() {
    var page = relativePath(location.href);
    if (!/^(?:index\.html)?$/i.test(page)) return;
    var last = readJson(LAST_KEY, null);
    if (!last || !last.path || !last.title) return;
    var history = readJson(HISTORY_KEY, []);
    history = Array.isArray(history) ? history : [];
    var container = document.getElementById('lanjutBelajarContainer');
    if (container) {
      container.style.display = 'block';
      container.innerHTML = resumeCardHtml(last, history);
      return;
    }
    var host = document.querySelector('main.container');
    var hero = host && host.querySelector('.hero, .section-heading');
    if (!host) return;
    container = document.createElement('div');
    container.id = 'lanjutBelajarContainer';
    container.style.margin = '0 0 32px';
    container.innerHTML = resumeCardHtml(last, history);
    if (hero) hero.insertAdjacentElement('afterend', container);
    else host.insertAdjacentElement('afterbegin', container);
  }

  function getRecord(path) {
    var resolved = path || relativePath(location.href);
    var positions = readJson(POSITION_KEY, {});
    var history = readJson(HISTORY_KEY, []);
    var item = Array.isArray(history) ? history.find(function (entry) { return entry && entry.path === resolved; }) : null;
    return Object.assign({}, item || {}, positions[resolved] || {}, { path: resolved });
  }

  function markCompleted(path) {
    saveLessonPosition();
    var resolved = path || relativePath(location.href);
    var positions = readJson(POSITION_KEY, {});
    var current = Object.assign({}, positions[resolved] || {}, {
      completed: true, status: 'completed', progress: 100,
      namespace: /^backtest-learning\//i.test(resolved) ? 'ict-backtest' : 'academy-main', updatedAt: Date.now()
    });
    positions[resolved] = current;
    writeJson(POSITION_KEY, positions);
    var history = readJson(HISTORY_KEY, []);
    history = Array.isArray(history) ? history : [];
    history = history.map(function (item) {
      return item && item.path === resolved ? Object.assign({}, item, current) : item;
    });
    writeJson(HISTORY_KEY, history);
    var last = readJson(LAST_KEY, null);
    if (last && last.path === resolved) writeJson(LAST_KEY, Object.assign({}, last, current));
    document.dispatchEvent(new CustomEvent('amy:reading-progress-changed', { detail: { path: resolved, record: current } }));
    return current;
  }

  function getTrackProgress(namespace) {
    var positions = readJson(POSITION_KEY, {});
    return Object.keys(positions).filter(function (path) {
      var item = positions[path] || {};
      return item.namespace === namespace || (namespace === 'ict-backtest' && /^backtest-learning\//i.test(path));
    }).reduce(function (result, path) { result[path] = Object.assign({}, positions[path]); return result; }, {});
  }

  function init() {
    restorePosition();
    renderResumeCard();
    saveLessonPosition();
    window.addEventListener('scroll', queueSave, { passive: true });
    window.addEventListener('pagehide', saveLessonPosition);
    document.addEventListener('visibilitychange', function () { if (document.hidden) saveLessonPosition(); });
    document.addEventListener('amy:lesson-ready', function () { restorePosition(); saveLessonPosition(); });
  }

  window.AmyAcademyReading = Object.freeze({
    capture: saveLessonPosition,
    markCompleted: markCompleted,
    getRecord: getRecord,
    getTrackProgress: getTrackProgress,
    relativePath: relativePath
  });
  document.dispatchEvent(new CustomEvent('amy:reading-history-ready'));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
