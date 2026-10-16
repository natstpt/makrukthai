/* Endgame tables against a lone king: king + rook (tablebase/krk.bin, scripts/build-krk.cjs) and king + two rooks
   (tablebase/krrk.bin, compressed, scripts/build-krrk.cjs). For every position with the rooks' side to move: how many
   of its moves the fastest mate takes against the best defence (a rook taken goes on in the king + rook table).
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
  var table = null, table2 = null, loading = null;
  // a1 b1 c1 d1 b2 c2 d2 c3 d3 d4: where the tables keep the strong king.
  var TRI = [0, 1, 2, 3, 9, 10, 11, 18, 19, 27];
  function square(at) { return (7 - at.r) * 8 + at.c; }
  // The 8 symmetries of the board, as lookup tables on 0..63.
  var TF = [0, 1, 2, 3, 4, 5, 6, 7].map(function (t) {
    var out = [];
    for (var s = 0; s < 64; s++) {
      var f = s & 7, r = s >> 3;
      if (t & 1) f = 7 - f;
      if (t & 2) r = 7 - r;
      if (t & 4) { var x = f; f = r; r = x; }
      out.push(r * 8 + f);
    }
    return out;
  });
  // Rook pairs r1 < r2 numbered as in scripts/build-krrk.cjs.
  var PAIR = [], PAIRS = 0;
  for (var a = 0; a < 64; a++) for (var b = a + 1; b < 64; b++) PAIR[a * 64 + b] = PAIRS++;
  // Moves to mate with the rook side to move (0: no win). wk, rooks, bk are squares 0..63.
  function value(wk, wr, bk) {
    for (var t = 0; t < 8; t++) {
      var f = TF[t], k = TRI.indexOf(f[wk]);
      if (k >= 0) return table[k * 4096 + f[wr] * 64 + f[bk]];
    }
    return 0;
  }
  function value2(wk, ra, rb, bk) {
    var best = -1;
    for (var t = 0; t < 8; t++) {
      var f = TF[t], k = TRI.indexOf(f[wk]);
      if (k < 0) continue;
      var x = f[ra], y = f[rb]; if (x > y) { var z = x; x = y; y = z; }
      var i = (k * PAIRS + PAIR[x * 64 + y]) * 64 + f[bk];
      if (best < 0 || i < best) best = i;
    }
    return table2[best];
  }
  // The pieces as {strong side, wk, rooks, bk}, or null when they are not king + one or two rooks against a lone king
  // (or that table is not loaded).
  function material(pieces) {
    if (pieces.length !== 3 && pieces.length !== 4) return null;
    var rooks = pieces.filter(function (p) { return p.piece === 'rook'; });
    if (rooks.length !== pieces.length - 2 || (rooks.length === 2 && rooks[0].side !== rooks[1].side)) return null;
    if (rooks.length === 1 ? !table : !table2) return null;
    var side = rooks[0].side, wk = pieces.find(function (p) { return p.piece === 'king' && p.side === side; });
    var bk = pieces.find(function (p) { return p.piece === 'king' && p.side !== side; });
    if (!wk || !bk) return null;
    return { side: side, wk: square(wk.at), rooks: rooks.map(function (p) { return square(p.at); }), bk: square(bk.at) };
  }
  // Rook side to move in pieces: its mate distance (Infinity when it cannot win).
  function strongToMove(pieces) {
    var m = material(pieces);
    if (!m) return Infinity;
    var v = m.rooks.length === 1 ? value(m.wk, m.rooks[0], m.bk) : value2(m.wk, m.rooks[0], m.rooks[1], m.bk);
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
    if (loneToMove(pieces, side) === Infinity) return null; // a draw already: no need for the table
    moves.forEach(function (mv) {
      var left = strongToMove(R.applyMove(pieces, mv.from, mv.to));
      if (!best || left > best.left) best = { move: mv, left: left };
    });
    return best ? { move: { from: best.move.from, to: best.move.to }, mateIn: best.left === Infinity ? 0 : best.left } : null;
  }
  // Every legal move of side with what the table says follows: {move, n}. For the rook side n is the moves it still
  // needs after this one (0: this move mates); for the lone king, the moves the rook side needs from then on.
  // Infinity: no win (a draw, or the rook is taken). null when the table does not apply.
  function outcomes(pieces, side) {
    if (!table) return null;
    var m = material(pieces);
    if (!m) return null;
    return { strong: m.side, moves: R.legalMoves(pieces, side).map(function (mv) {
      var after = R.applyMove(pieces, mv.from, mv.to);
      return { move: { from: mv.from, to: mv.to }, after: after, n: side === m.side ? loneToMove(after, side === 'white' ? 'black' : 'white') : strongToMove(after) };
    }) };
  }
  // Loads the tables once (the browser fetches them; Node passes the bytes to use()). The king + two rooks table is
  // compressed (deflate) and needs DecompressionStream; without it only the king + rook table is used.
  function fetchBytes(url, packed) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw Error(url + ' ' + res.status);
      if (!packed) return res.arrayBuffer();
      return new Response(res.body.pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    }).then(function (buf) { return new Uint8Array(buf); });
  }
  function load(base) {
    base = base || 'tablebase/';
    if (!loading) loading = fetchBytes(base + 'krk.bin').then(function (bytes) {
      table = bytes;
      if (typeof DecompressionStream !== 'function') return true;
      return fetchBytes(base + 'krrk.bin', true).then(function (b2) { table2 = b2; return true; }, function () { return true; });
    }, function () { loading = null; return false; });
    return loading;
  }
  function use(bytes, bytes2) { table = bytes; if (bytes2) table2 = bytes2; }
  return { load: load, use: use, ready: function () { return !!table; }, ready2: function () { return !!table2; }, bestMove: bestMove, outcomes: outcomes, value: function (pieces) { return strongToMove(pieces); } };
});
