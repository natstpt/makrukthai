/* The level map's progress on the puzzle page (puzzle/): stars per level, which level is next, the learner's title
 * (rank) and LV, kept on this device (localStorage, key makrukPuzzleProgress). Apart from the screen so tests can run
 * it in Node. Levels unlock in order: a level opens when the one before it is passed (at least one star).
 * Stars for a set of 10: 7 solved passes (1 star), 9 solved gives 2, all 10 solved with no hint gives 3. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MakrukPuzzleProgress = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var KEY = 'makrukPuzzleProgress', PASS = 7;

  // results: 'ok' (solved first try), 'hint' (solved with a hint) or 'miss', one per puzzle.
  function starsFor(results) {
    var ok = results.filter(function (r) { return r === 'ok'; }).length;
    var solved = ok + results.filter(function (r) { return r === 'hint'; }).length;
    if (results.length && ok === results.length) return 3;
    return solved >= 9 ? 2 : solved >= PASS ? 1 : 0;
  }
  function fresh() { return { stars: {} }; }
  // Anything unreadable (no storage, another format, broken JSON) starts again from level 1.
  function clean(raw) {
    var out = fresh();
    if (!raw || typeof raw !== 'object' || !raw.stars || typeof raw.stars !== 'object') return out;
    Object.keys(raw.stars).forEach(function (k) {
      var n = Number(k), s = raw.stars[k];
      if (n >= 1 && Math.floor(n) === n && (s === 1 || s === 2 || s === 3)) out.stars[n] = s;
    });
    return out;
  }
  function storage(win) {
    try { return (win || (typeof window !== 'undefined' ? window : {})).localStorage || null; } catch (e) { return null; }
  }
  function load(store) {
    try { var s = store === undefined ? storage() : store; return clean(s ? JSON.parse(s.getItem(KEY) || 'null') : null); } catch (e) { return fresh(); }
  }
  function save(state, store) {
    try { var s = store === undefined ? storage() : store; if (s) s.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }
  function reset(store) { var s = fresh(); save(s, store); return s; }
  function passed(state, n) { return (state.stars[n] || 0) > 0; }
  // The level to play next: the first one not passed (levels open in order).
  function current(state) { var n = 1; while (passed(state, n)) n++; return n; }
  function open(state, n) { return n >= 1 && n <= current(state); }
  function totalStars(state) { return Object.keys(state.stars).reduce(function (a, k) { return a + state.stars[k]; }, 0); }
  // Chapters done: all their levels passed (perChapter levels each, chapters of the level map in order).
  function chaptersDone(state, levels) {
    var per = levels.perChapter, done = 0;
    for (var c = 0; c < levels.chapters.length; c++) {
      var all = true;
      for (var k = 1; k <= per; k++) if (!passed(state, c * per + k)) all = false;
      if (!all) break;
      done++;
    }
    return done;
  }
  function rank(state, levels) { return levels.ranks[Math.min(chaptersDone(state, levels), levels.ranks.length - 1)]; }
  // Stores a played level, keeping its best stars: {state, stars, passed, best, rankUp (the new rank or null)}.
  function record(state, n, results, levels) {
    var stars = starsFor(results), before = chaptersDone(state, levels);
    var next = { stars: Object.assign({}, state.stars) };
    if (stars > (next.stars[n] || 0)) next.stars[n] = stars;
    var after = chaptersDone(next, levels);
    return { state: next, stars: stars, passed: stars > 0, best: next.stars[n] || 0, rankUp: after > before ? rank(next, levels) : null };
  }
  return {
    KEY: KEY, PASS: PASS, starsFor: starsFor, load: load, save: save, reset: reset, clean: clean,
    passed: passed, current: current, open: open, totalStars: totalStars, chaptersDone: chaptersDone, rank: rank, record: record
  };
});
