(function (root) {
  'use strict';
  function shuffle(items, random) {
    var result = items.slice(); random = random || Math.random;
    for (var i = result.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var value = result[i]; result[i] = result[j]; result[j] = value;
    }
    return result;
  }
  function select(bank, difficulty, count, seen, random) {
    var eligible = bank.filter(function (q) { return difficulty === 'ALL' || q.difficulty === difficulty; });
    var unseen = shuffle(eligible.filter(function (q) { return !seen.includes(q.id); }), random);
    var old = shuffle(eligible.filter(function (q) { return seen.includes(q.id); }), random);
    // Exhaust unseen questions first across sessions; no duplicate ID within a session.
    return unseen.concat(old).slice(0, Math.min(count, eligible.length));
  }
  function summary(results) {
    var topics = {};
    results.forEach(function (r) {
      if (r.correct) return;
      var key = r.exercise.topic;
      if (!topics[key]) topics[key] = { lesson: r.exercise.lesson, mistakes: [] };
      topics[key].mistakes.push(r);
    });
    return { total: results.length, correct: results.filter(function (r) { return r.correct; }).length, topics: Object.values(topics) };
  }
  root.AmyGuidedSession = { shuffle: shuffle, select: select, summary: summary };
})(typeof window === 'undefined' ? globalThis : window);
