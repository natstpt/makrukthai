/* The hard computer player: Fairy-Stockfish (WebAssembly) with the makruk NNUE network in engine/.
 * The engine needs SharedArrayBuffer, so the page must be cross-origin isolated; on GitHub Pages coi-sw.js adds the
 * headers (registered by ensureIsolation, which reloads the page once). Each move is searched for at most 1 second. */
(function (root) {
  'use strict';
  var NET = 'makruk-a8c621e24a8c.nnue', THINK_MS = 800, STOP_MS = 950;
  var engine = null, ready = false, loading = null, listener = null, busy = Promise.resolve();

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
  // Downloads the network, reporting progress as a fraction (0–1).
  function fetchNet(onProgress) {
    return fetch('engine/' + NET).then(function (res) {
      if (!res.ok) throw Error('network ' + res.status);
      var total = +res.headers.get('Content-Length') || 0;
      if (!res.body || !total) return res.arrayBuffer().then(function (b) { return new Uint8Array(b); });
      var reader = res.body.getReader(), parts = [], got = 0;
      var pump = function () {
        return reader.read().then(function (r) {
          if (r.done) { var out = new Uint8Array(got), at = 0; parts.forEach(function (p) { out.set(p, at); at += p.length; }); return out; }
          parts.push(r.value); got += r.value.length; if (onProgress) onProgress(Math.min(1, got / total));
          return pump();
        });
      };
      return pump();
    });
  }
  function waitFor(word) {
    return new Promise(function (resolve) { listener = function (line) { if (line.indexOf(word) === 0) { listener = null; resolve(line); } }; });
  }

  // Starts the engine once; later calls share the same promise.
  function load(onProgress) {
    if (loading) return loading;
    loading = (root.crossOriginIsolated && typeof SharedArrayBuffer === 'function' ? Promise.resolve() : Promise.reject(Error('not isolated')))
      .then(function () { return Promise.all([loadScript('engine/stockfish.js'), fetchNet(onProgress)]); })
      .then(function (r) {
        return root.Stockfish().then(function (sf) {
          sf.FS.writeFile('/' + NET, r[1]);
          sf.addMessageListener(function (line) { if (listener) listener(line); });
          engine = sf;
          var ready = waitFor('readyok');
          var threads = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
          ['uci', 'setoption name UCI_Variant value makruk', 'setoption name EvalFile value /' + NET,
           'setoption name Threads value ' + threads, 'isready'].forEach(function (c) { sf.postMessage(c); });
          // A short first search reads the network, so the first real move is not slowed down by it.
          return ready.then(function () { var warm = waitFor('bestmove'); sf.postMessage('position startpos'); sf.postMessage('go depth 1'); return warm; });
        });
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

  root.MakrukEngine = { ensureIsolation: ensureIsolation, load: load, bestMove: bestMove, ready: function () { return ready; } };
})(window);
