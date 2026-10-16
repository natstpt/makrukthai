/* Endgame table for king + rook against a lone king (tablebase/krk.bin, built by scripts/build-krk.cjs): for every
   position with the rook side to move, how many of its moves the fastest mate takes against the best defence.
   bestMove(pieces, side) answers at once from the table, for either side:
   - the rook side plays the move that mates soonest against the best defence;
   - the lone king plays the move that holds out longest (taking the rook, or a draw, if it can).
   It returns {move: {from, to}, mateIn} (mateIn: moves to mate for the rook side, 0 when it cannot win), or null when
   the position is not king + rook against king, the table is not loaded, or the rook side cannot win. */
(function (root, factory) {
  var tb = factory(root && root.MakrukRules ? root.MakrukRules : (typeof require === 'function' ? require('./makruk-rules.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = tb;
  if (root) root.MakrukTablebase = tb;
})(typeof window !== 'undefined' ? window : null, function (R) {
  'use strict';
  var table = null, loading = null;
  // a1 b1 c1 d1 b2 c2 d2 c3 d3 d4: where the table keeps the strong king.
  var TRI = [0, 1, 2, 3, 9, 10, 11, 18, 19, 27];
  function square(at) { return (7 - at.r) * 8 + at.c; }
  // One of the 8 symmetries of the board, as a function on 0..63.
  function transform(t) {
    return function (s) {
      var f = s & 7, r = s >> 3;
      if (t & 1) f = 7 - f;
      if (t & 2) r = 7 - r;
      if (t & 4) { var x = f; f = r; r = x; }
      return r * 8 + f;
    };
  }
  var TRANSFORMS = [0, 1, 2, 3, 4, 5, 6, 7].map(transform);
  // Moves to mate with the rook side to move (0: no win). wk, wr, bk are squares 0..63.
  function value(wk, wr, bk) {
    for (var t = 0; t < 8; t++) {
      var f = TRANSFORMS[t], k = TRI.indexOf(f(wk));
      if (k >= 0) return table[k * 4096 + f(wr) * 64 + f(bk)];
    }
    return 0;
  }
  // The pieces as {strong side, wk, wr, bk}, or null when they are not king + rook against a lone king.
  function material(pieces) {
    if (pieces.length !== 3) return null;
    var rook = pieces.filter(function (p) { return p.piece === 'rook'; });
    if (rook.length !== 1) return null;
    var side = rook[0].side, wk = pieces.find(function (p) { return p.piece === 'king' && p.side === side; });
    var bk = pieces.find(function (p) { return p.piece === 'king' && p.side !== side; });
    if (!wk || !bk) return null;
    return { side: side, wk: square(wk.at), wr: square(rook[0].at), bk: square(bk.at) };
  }
  // Rook side to move in pieces: its mate distance (Infinity when it cannot win).
  function strongToMove(pieces) {
    var m = material(pieces);
    if (!m) return Infinity;
    var v = value(m.wk, m.wr, m.bk);
    return v ? v : Infinity;
  }
  // Lone king to move in pieces: moves the rook side still needs (0 if mated; Infinity: a draw).
  function loneToMove(pieces, lone) {
    var status = R.gameStatus(pieces, lone);
    if (status.state === 'checkmate') return 0;
    if (status.state !== 'playing') return Infinity;
    var worst = 0;
    R.legalMoves(pieces, lone).forEach(function (m) {
      var after = R.applyMove(pieces, m.from, m.to);
      worst = Math.max(worst, strongToMove(after));
    });
    return worst;
  }
  function bestMove(pieces, side) {
    if (!table) return null;
    var m = material(pieces);
    if (!m) return null;
    var moves = R.legalMoves(pieces, side), best = null;
    if (side === m.side) {
      moves.forEach(function (mv) {
        var left = loneToMove(R.applyMove(pieces, mv.from, mv.to), side === 'white' ? 'black' : 'white');
        if (left < Infinity && (!best || left < best.left)) best = { move: mv, left: left };
      });
      return best ? { move: { from: best.move.from, to: best.move.to }, mateIn: best.left + 1 } : null;
    }
    // The lone king: take the rook or reach a drawn position if it can, else hold out longest.
    if (!value(m.wk, m.wr, m.bk)) return null; // a draw already: no need for the table
    moves.forEach(function (mv) {
      var left = strongToMove(R.applyMove(pieces, mv.from, mv.to));
      if (!best || left > best.left) best = { move: mv, left: left };
    });
    return best ? { move: { from: best.move.from, to: best.move.to }, mateIn: best.left === Infinity ? 0 : best.left } : null;
  }
  // Loads the table once (the browser fetches it; Node passes the bytes to use()).
  function load(url) {
    if (table) return Promise.resolve(true);
    if (!loading) loading = fetch(url || 'tablebase/krk.bin').then(function (res) {
      if (!res.ok) throw Error('krk.bin ' + res.status);
      return res.arrayBuffer();
    }).then(function (buf) { table = new Uint8Array(buf); return true; }, function () { loading = null; return false; });
    return loading;
  }
  function use(bytes) { table = bytes; }
  return { load: load, use: use, ready: function () { return !!table; }, bestMove: bestMove, value: function (pieces) { return strongToMove(pieces); } };
});
