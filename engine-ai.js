/* The hard computer player: Fairy-Stockfish (WebAssembly) with the makruk NNUE network in engine/.
 * The engine needs SharedArrayBuffer, so the page must be cross-origin isolated; on GitHub Pages coi-sw.js adds the
 * headers (registered by ensureIsolation, which reloads the page once). Each move is searched for at most 1 second. */
(function (root) {
  'use strict';
  var NET = 'makruk-a8c621e24a8c.nnue', THINK_MS = 800, STOP_MS = 950;
  var engine = null, ready = false, loading = null, listener = null, busy = Promise.resolve();
  var phone = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // A failure carries a short Thai reason for the page to show, so a learner can tell the teacher what went wrong.
  function fail(reason) { var e = Error(reason); e.reason = reason; return e; }
  function withTimeout(promise, ms, reason) {
    return Promise.race([promise, new Promise(function (_, reject) { setTimeout(function () { reject(fail(reason)); }, ms); })]);
  }
  // The engine is built with WebAssembly SIMD (Safari 16.4+, iOS 16.4+): a tiny module using v128 must validate.
  function simdSupported() {
    try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); }
    catch (e) { return false; }
  }
  // Why the engine cannot run in this browser, or '' when it can.
  function unsupported() {
    if (typeof WebAssembly !== 'object') return 'เบราว์เซอร์นี้ไม่รองรับ WebAssembly';
    if (!simdSupported()) return 'ต้องใช้ iOS 16.4 / Safari 16.4 ขึ้นไป (อัปเดตระบบแล้วลองใหม่)';
    if (!root.crossOriginIsolated || typeof SharedArrayBuffer !== 'function') return 'เบราว์เซอร์ไม่เปิดให้ใช้ SharedArrayBuffer (ลองเปิดใน Safari หรือ Chrome รุ่นล่าสุด)';
    return '';
  }

  // Registers coi-sw.js and reloads once so the page gets the isolation headers. Resolves true when isolated.
  function ensureIsolation() {
    if (root.crossOriginIsolated) return Promise.resolve(true);
    if (!('serviceWorker' in navigator)) return Promise.resolve(false);
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
      var s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = function () { reject(Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }
  // Downloads the network, reporting progress as a fraction (0–1), straight into one buffer (no second copy:
  // memory is tight on phones).
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
    return new Promise(function (resolve) { listener = function (line) { if (line.indexOf(word) === 0) { listener = null; resolve(line); } }; });
  }

  // Starts the engine once; later calls share the same promise.
  function load(onProgress) {
    if (loading) return loading;
    var why = unsupported();
    loading = (why ? Promise.reject(fail(why)) : Promise.resolve())
      .then(function () { return Promise.all([loadScript('engine/stockfish.js?v=mem512'), fetchNet(onProgress)]); })
      .then(function (r) {
        // The engine reports a crash (for example out of memory) through onAbort; without it the page would wait forever.
        var started = {};
        var aborted = new Promise(function (_, reject) { started.onAbort = function (what) { reject(fail('หน่วยความจำของเครื่องไม่พอ หรือเครื่องยนต์หยุดทำงาน (' + String(what).slice(0, 60) + ')')); }; });
        var run = root.Stockfish(started).then(function (sf) {
          sf.FS.writeFile('/' + NET, r[1]); r[1] = null;
          sf.addMessageListener(function (line) { if (listener) listener(line); });
          engine = sf;
          var ok = waitFor('readyok');
          // Phones get fewer threads and a small hash table: each thread and the hash use shared memory.
          var threads = Math.max(1, Math.min(phone ? 2 : 4, (navigator.hardwareConcurrency || 2) - 1));
          ['uci', 'setoption name UCI_Variant value makruk', 'setoption name EvalFile value /' + NET, 'setoption name Hash value ' + (phone ? 8 : 16),
           'setoption name Threads value ' + threads, 'isready'].forEach(function (c) { sf.postMessage(c); });
          // A short first search reads the network, so the first real move is not slowed down by it; then the file copy
          // is no longer needed.
          return ok.then(function () { var warm = waitFor('bestmove'); sf.postMessage('position startpos'); sf.postMessage('go depth 1'); return warm; })
            .then(function () { try { sf.FS.unlink('/' + NET); } catch (e) {} });
        });
        return withTimeout(Promise.race([run, aborted]), 60000, 'เครื่องยนต์เริ่มทำงานไม่สำเร็จภายใน 1 นาที');
      })
      .then(function () { ready = true; return true; });
    loading.catch(function () {});
    return loading;
  }

  // The best move for the side to move in fen, as 'e3e4' (promotion suffixes dropped), within 1 second; null when
  // the engine has not answered by then. Searches run one at a time, so a late answer never reaches the next search.
  function bestMove(fen) {
    var searched, searchDone = new Promise(function (r) { searched = r; }), before = busy;
    busy = searchDone;
    return before.then(function () { return load(); }).then(function () {
      return new Promise(function (resolve) {
        listener = function (line) {
          if (line.indexOf('bestmove') !== 0) return;
          listener = null; clearTimeout(stop); clearTimeout(give); searched();
          var m = line.split(/\s+/)[1]; resolve(m && m !== '(none)' ? m.slice(0, 4) : null);
        };
        var stop = setTimeout(function () { engine.postMessage('stop'); }, STOP_MS);
        var give = setTimeout(function () { resolve(null); }, 1000);
        engine.postMessage('position fen ' + fen);
        engine.postMessage('go movetime ' + THINK_MS);
      });
    }, function (e) { searched(); throw e; });
  }

  root.MakrukEngine = { ensureIsolation: ensureIsolation, unsupported: unsupported, load: load, bestMove: bestMove, ready: function () { return ready; } };
})(window);
