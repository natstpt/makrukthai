/* The computer player: Fairy-Stockfish (WebAssembly) in one of two builds. The hard AI searches toward 20 plies for at
 * most 3 seconds a move; easy and medium search a fixed shallow depth on the lite build.
 * - full (engine/): multi-threaded, SIMD, with the makruk NNUE network (48 MB download, about 320 MB of memory).
 *   It needs SharedArrayBuffer, so the page must be cross-origin isolated; on GitHub Pages coi-sw.js adds the headers
 *   (registered by start(), which reloads the page once). Used only on computers with enough cores and memory.
 * - lite (engine/lite/): single-threaded, plain WebAssembly without SIMD, classical evaluation, run in a Web Worker
 *   (about 1.4 MB download, 32 MB of memory to start). No SharedArrayBuffer and no service worker, so it runs on old
 *   phones and light browsers (Safari 11+, Chrome 58+). Phones, tablets and anything the full build cannot run use it.
 * The game page sets each level's limits (editor.js AI_LIMITS); the engine stops itself at the time limit. */
(function (root) {
  'use strict';
  var NET = 'makruk-a8c621e24a8c.nnue';
  var phone = /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var tier = null, starting = null, line = null, listener = null, busy = Promise.resolve();
  // A failure carries a short Thai reason for the page to show, so a learner can tell the teacher what went wrong.
  function fail(reason) { var e = Error(reason); e.reason = reason; return e; }
  function withTimeout(promise, ms, reason) {
    return Promise.race([promise, new Promise(function (_, reject) { setTimeout(function () { reject(fail(reason)); }, ms); })]);
  }
  // The full build uses WebAssembly SIMD: a tiny module using v128 must validate.
  function simdSupported() {
    try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); }
    catch (e) { return false; }
  }
  // Why no engine can run in this browser, or '' when the lite one can.
  function unsupported() {
    if (typeof WebAssembly !== 'object') return 'เบราว์เซอร์นี้ไม่รองรับ WebAssembly (ลองเปิดใน Chrome หรือ Safari)';
    if (typeof Worker !== 'function') return 'เบราว์เซอร์นี้ไม่รองรับ Web Worker';
    return '';
  }
  // The full build only on a computer with 4+ cores and (where the browser says) 4 GB+ of memory.
  function fullWanted() {
    var memory = navigator.deviceMemory, cores = navigator.hardwareConcurrency || 1;
    return !phone && cores >= 4 && (memory === undefined || memory >= 4) && 'serviceWorker' in navigator && simdSupported();
  }

  // Registers coi-sw.js and reloads once so the page gets the isolation headers. Resolves true when isolated.
  function ensureIsolation() {
    if (root.crossOriginIsolated) return Promise.resolve(true);
    var tried = false;
    try { tried = sessionStorage.getItem('makrukIsolationReload') === location.href; } catch (e) {}
    return navigator.serviceWorker.register('coi-sw.js').then(function (reg) {
      if (tried) return false;
      try { sessionStorage.setItem('makrukIsolationReload', location.href); } catch (e) {}
      var reload = function () { location.reload(); return new Promise(function () {}); };
      if (reg.active) return reload();
      return new Promise(function (resolve) {
        var worker = reg.installing || reg.waiting;
        if (!worker) { resolve(false); return; }
        worker.addEventListener('statechange', function () { if (worker.state === 'activated') reload(); });
      });
    }).catch(function () { return false; });
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = function () { reject(fail('โหลดไฟล์ AI ไม่สำเร็จ')); };
      document.head.appendChild(s);
    });
  }
  // Downloads the network, reporting progress as a fraction (0–1), straight into one buffer.
  function fetchNet(onProgress) {
    return fetch('engine/' + NET).then(function (res) {
      if (!res.ok) throw fail('โหลดไฟล์ AI ไม่สำเร็จ (' + res.status + ')');
      var total = +res.headers.get('Content-Length') || 0;
      if (!res.body || !total) return res.arrayBuffer().then(function (b) { return new Uint8Array(b); });
      var reader = res.body.getReader(), out = new Uint8Array(total), got = 0;
      var pump = function () {
        return reader.read().then(function (r) {
          if (r.done) return got === total ? out : out.slice(0, got);
          if (got + r.value.length > total) { var bigger = new Uint8Array(got + r.value.length); bigger.set(out.subarray(0, got)); out = bigger; }
          out.set(r.value, got); got += r.value.length; if (onProgress) onProgress(Math.min(1, got / total));
          return pump();
        });
      };
      return pump();
    }, function () { throw fail('โหลดไฟล์ AI ไม่สำเร็จ (ตรวจอินเทอร์เน็ตแล้วลองใหม่)'); });
  }
  function waitFor(word) {
    return new Promise(function (resolve) { listener = function (text) { if (text.indexOf(word) === 0) { listener = null; resolve(text); } }; });
  }
  function hear(text) { if (listener) listener(text); }
  // Sends the set-up commands and a depth-1 search (which reads the evaluation), then resolves.
  function setUp(post, options) {
    var ok = waitFor('readyok');
    ['uci', 'setoption name UCI_Variant value makruk'].concat(options, ['isready']).forEach(post);
    return ok.then(function () { var warm = waitFor('bestmove'); post('position startpos'); post('go depth 1'); return warm; });
  }

  function startFull(onProgress) {
    return Promise.all([loadScript('engine/stockfish.js?v=mem2g'), fetchNet(onProgress)]).then(function (r) {
      // The engine reports a crash (for example out of memory) through onAbort; without it the page would wait forever.
      var started = {};
      var aborted = new Promise(function (_, reject) { started.onAbort = function (what) { reject(fail('หน่วยความจำของเครื่องไม่พอ (' + String(what).slice(0, 60) + ')')); }; });
      var run = root.Stockfish(started).then(function (sf) {
        sf.FS.writeFile('/' + NET, r[1]); r[1] = null;
        sf.addMessageListener(hear);
        line = { post: function (c) { sf.postMessage(c); }, stops: true, think: 800 };
        var threads = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
        return setUp(line.post, ['setoption name EvalFile value /' + NET, 'setoption name Hash value 16', 'setoption name Threads value ' + threads])
          .then(function () { try { sf.FS.unlink('/' + NET); } catch (e) {} });
      });
      return withTimeout(Promise.race([run, aborted]), 60000, 'เครื่องยนต์เริ่มทำงานไม่สำเร็จภายใน 1 นาที');
    });
  }
  function startLite() {
    return new Promise(function (resolve, reject) {
      var worker;
      try { worker = new Worker('engine/lite/lite-worker.js?v=1'); } catch (e) { reject(fail('เปิดเครื่องยนต์ไม่ได้ (' + e.message + ')')); return; }
      worker.onmessage = function (e) { hear(String(e.data)); };
      worker.onerror = function (e) { reject(fail('เครื่องยนต์หยุดทำงาน (' + (e.message || 'error') + ')')); };
      // The lite engine searches on one thread and cannot be stopped early: it is given 0.7 s.
      line = { post: function (c) { worker.postMessage(c); }, stops: false, think: 700 };
      resolve(setUp(line.post, ['setoption name Use NNUE value false', 'setoption name Hash value 8']));
    }).then(function (p) { return withTimeout(p, 30000, 'เครื่องยนต์เริ่มทำงานไม่สำเร็จภายใน 30 วินาที'); });
  }

  // Starts the engine once (later calls share the promise) and resolves with 'full' or 'lite'. The full build may
  // reload the page once to become cross-origin isolated; if it fails, the lite build is used instead.
  // preferLite: use the lite build even where the full one could run (the easy and medium AI search shallowly).
  function start(onProgress, preferLite) {
    if (starting) return starting;
    var why = unsupported();
    if (why) { starting = Promise.reject(fail(why)); starting.catch(function () {}); return starting; }
    var lite = function () { listener = null; return startLite().then(function () { tier = 'lite'; return tier; }); };
    starting = preferLite || !fullWanted() ? lite() : ensureIsolation().then(function (isolated) {
      if (!isolated || typeof SharedArrayBuffer !== 'function') return lite();
      return startFull(onProgress).then(function () { tier = 'full'; return tier; }, lite);
    });
    starting.catch(function () {});
    return starting;
  }

  // The best move for the side to move in fen, as 'e3e4' (promotion suffixes dropped); null when the engine has not
  // answered in time. Searches run one at a time, so a late answer never reaches the next search.
  // moves (optional, 'e3e4' keys played from fen) let the engine see positions that already stood, so it knows a
  // third repetition is a draw. limits (optional): depth (plies to search), time (ms at most; the engine stops itself),
  // skill (Stockfish Skill Level 0–20: below 20 it now and then picks a weaker move among its best lines). Without
  // limits the search is told 0.8 s (lite 0.7 s). lastDepth() is the depth the last search reached.
  var skillLevel = 20, reached = 0;
  function bestMove(fen, moves, limits) {
    limits = limits || {};
    var searched, searchDone = new Promise(function (r) { searched = r; }), before = busy;
    busy = searchDone;
    return before.then(function () { return start(); }).then(function () {
      return new Promise(function (resolve) {
        var skill = limits.skill === undefined ? 20 : limits.skill, time = limits.time || (limits.depth ? 0 : line.think);
        if (skill !== skillLevel) { line.post('setoption name Skill Level value ' + skill); skillLevel = skill; }
        reached = 0;
        listener = function (text) {
          if (text.indexOf('info depth ') === 0) { reached = Math.max(reached, +text.split(/\s+/)[2] || 0); return; }
          if (text.indexOf('bestmove') !== 0) return;
          listener = null; clearTimeout(give); searched();
          var m = text.split(/\s+/)[1]; resolve(m && m !== '(none)' ? m.slice(0, 4) : null);
        };
        // Given up a little after the engine's own limit (3 s for a depth search without a time).
        var give = setTimeout(function () { resolve(null); }, (time || 3000) + 500);
        line.post('position fen ' + fen + (moves && moves.length ? ' moves ' + moves.join(' ') : ''));
        line.post('go' + (limits.depth ? ' depth ' + limits.depth : '') + (time ? ' movetime ' + time : ''));
      });
    }, function (e) { searched(); throw e; });
  }

  // Analysis (the ถอดหมาก page): searches fen with two lines (MultiPV 2) and calls onUpdate({depth, lines, done})
  // with each new depth; a line is {score: {cp}|{mate}, pv: ['e3e4', …]} from the side to move. A new call replaces
  // the running search: the full build is stopped at once, the lite one (which cannot be stopped) finishes first.
  // The full build searches 4 s, the lite one 1.5 s; stop() ends the analysis.
  var analysis = { running: false, next: null, multipv: false };
  function parseInfo(text) {
    var t = text.split(/\s+/), info = {}, i;
    for (i = 1; i < t.length; i++) {
      if (t[i] === 'depth') info.depth = +t[++i];
      else if (t[i] === 'multipv') info.multipv = +t[++i];
      else if (t[i] === 'score') { var kind = t[++i], value = +t[++i]; info.score = kind === 'mate' ? { mate: value } : { cp: value }; }
      else if (t[i] === 'pv') { info.pv = t.slice(i + 1).map(function (m) { return m.slice(0, 4); }); break; }
    }
    return info;
  }
  function runAnalysis() {
    var job = analysis.next; analysis.next = null;
    if (!job) { analysis.running = false; return; }
    analysis.running = true;
    var lines = [], depth = 0;
    listener = function (text) {
      if (text.indexOf('info') === 0 && text.indexOf(' pv ') > 0 && text.indexOf('lowerbound') < 0 && text.indexOf('upperbound') < 0) {
        var info = parseInfo(text);
        if (!info.pv || !info.score) return;
        if (info.depth > depth) depth = info.depth;
        lines[(info.multipv || 1) - 1] = { score: info.score, pv: info.pv };
        if (!analysis.next) job.onUpdate({ depth: depth, lines: lines.filter(Boolean), done: false });
      } else if (text.indexOf('bestmove') === 0) {
        listener = null;
        if (!analysis.next) job.onUpdate({ depth: depth, lines: lines.filter(Boolean), done: true });
        runAnalysis();
      }
    };
    if (!analysis.multipv) { line.post('setoption name MultiPV value 2'); analysis.multipv = true; }
    line.post('position fen ' + job.fen);
    line.post('go movetime ' + (line.stops ? 4000 : 1500));
  }
  function analyse(fen, onUpdate) {
    return start().then(function () {
      analysis.next = { fen: fen, onUpdate: onUpdate };
      if (analysis.running) { if (line.stops) line.post('stop'); return; }
      runAnalysis();
    });
  }
  function stopAnalysis() { analysis.next = null; if (analysis.running && line && line.stops) line.post('stop'); }

  root.MakrukEngine = { start: start, unsupported: unsupported, bestMove: bestMove, lastDepth: function () { return reached; }, analyse: analyse, stopAnalysis: stopAnalysis, tier: function () { return tier; }, ready: function () { return !!tier; } };
})(window);
