/* Endgame tables against a lone king: king + rook (tablebase/krk.bin, scripts/build-krk.cjs), king + two rooks
   (tablebase/krrk.bin, compressed, scripts/build-krrk.cjs), and king + one or two of knight, khon and met/promoted
   pawn, or rook with one of them (tablebase/<pieces>.bin, compressed, scripts/build-endgame-tables.cjs; a met and a
   promoted pawn move alike and share the tables). For every position with the strong side to move: how many of its
   moves the fastest mate takes against the best defence (a piece taken goes on in the smaller table). The rook
   tables load with load(); the others only when a game reaches them (need() / ensure()).
   As before, for king + rook (or two rooks):
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
  var table = null, table2 = null, loading = null, base0 = 'tablebase/';
  // The other tables, by name (pieces in ORDER joined with '-'): bytes once loaded, a promise while loading, false if
  // they could not be loaded.
  var ORDER = ['rook', 'knight', 'khon', 'promoted'], extra = {}, fetching = {};
  var NAMES = ['knight', 'khon', 'promoted', 'rook-knight', 'rook-khon', 'rook-promoted', 'knight-knight', 'knight-khon',
    'knight-promoted', 'khon-khon', 'khon-promoted', 'promoted-promoted'];
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
  // King + one or two pieces (no unpromoted pawn) against a lone king: {side, name, tables: the names it needs,
  // pieces: [{type, at}] in ORDER}, or null.
  function kind(pieces) {
    if (pieces.length !== 3 && pieces.length !== 4) return null;
    var kings = pieces.filter(function (p) { return p.piece === 'king'; });
    if (kings.length !== 2) return null;
    var others = pieces.filter(function (p) { return p.piece !== 'king'; });
    if (others.some(function (p) { return p.side !== others[0].side || p.piece === 'pawn'; })) return null;
    var list = others.map(function (p) { return { type: p.piece === 'met' ? 'promoted' : p.piece, at: p.at }; })
      .sort(function (a, b) { return ORDER.indexOf(a.type) - ORDER.indexOf(b.type); });
    var name = list.map(function (p) { return p.type; }).join('-');
    var tables = [name].concat(list.length > 1 ? list.map(function (p) { return p.type; }) : []).filter(function (n, i, a) { return a.indexOf(n) === i; });
    return { side: others[0].side, name: name, tables: tables, pieces: list };
  }
  function isRookTable(name) { return name === 'rook' || name === 'rook-rook'; }
  function loaded(name) { return isRookTable(name) ? (name === 'rook' ? !!table : !!table2) : extra[name] instanceof Uint8Array; }
  // Strong side to move in one of the other tables: its mate distance (0: no win). Squares r*8+c as makruk-rules.js,
  // turned so the strong side is white (red's pieces: ranks flipped) and its king is on files ก–ง (mirrored).
  function extraValue(k, pieces) {
    var bytes = extra[k.name], red = k.side === 'black';
    var wk = pieces.find(function (p) { return p.piece === 'king' && p.side === k.side; }).at;
    var bk = pieces.find(function (p) { return p.piece === 'king' && p.side !== k.side; }).at;
    var flip = wk.c > 3;
    var s = function (at) { return (red ? 7 - at.r : at.r) * 8 + (flip ? 7 - at.c : at.c); };
    var w = s(wk), i = ((w >> 3) * 4 + (w & 7)) * 64 + s(bk);
    k.pieces.forEach(function (p) { i = i * 64 + s(p.at); });
    return bytes[i];
  }
  // The pieces as {strong side, wk, rooks, bk}, or null when they are not king + one or two rooks against a lone king
  // (or that table is not loaded). Other tables: {side, extra: kind} when it and the smaller tables are loaded.
  function material(pieces) {
    if (pieces.length !== 3 && pieces.length !== 4) return null;
    var k = kind(pieces);
    if (k && !isRookTable(k.name)) return k.tables.every(loaded) ? { side: k.side, extra: k } : null;
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
    if (m.extra) { var e = extraValue(m.extra, pieces); return e ? e : Infinity; }
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
    base = base || base0; base0 = base;
    if (!loading) loading = fetchBytes(base + 'krk.bin').then(function (bytes) {
      table = bytes;
      if (typeof DecompressionStream !== 'function') return true;
      return fetchBytes(base + 'krrk.bin', true).then(function (b2) { table2 = b2; return true; }, function () { return true; });
    }, function () { loading = null; return false; });
    return loading;
  }
  function use(bytes, bytes2) { table = bytes; if (bytes2) table2 = bytes2; }
  // Does this position need a table that is not loaded yet (and could be)?
  function need(pieces) {
    var k = kind(pieces);
    if (k && typeof DecompressionStream !== 'function' && k.name !== 'rook') return false;
    return !!k && k.tables.some(function (n) { return !loaded(n) && extra[n] !== false && (!isRookTable(n) || !loading); });
  }
  // Loads every table this position needs (the rook ones through load()); resolves true when they are all there.
  function ensure(pieces) {
    var k = kind(pieces);
    if (!k) return Promise.resolve(false);
    if (typeof DecompressionStream !== 'function' && k.tables.some(function (n) { return n !== 'rook'; })) return Promise.resolve(false);
    return Promise.all(k.tables.map(function (n) {
      if (isRookTable(n)) return load();
      if (loaded(n) || extra[n] === false) return loaded(n);
      if (!fetching[n]) fetching[n] = fetchBytes(base0 + n + '.bin', true).then(function (b) { extra[n] = b; return true; }, function () { extra[n] = false; return false; });
      return fetching[n];
    })).then(function () { return k.tables.every(loaded); });
  }
  // Node and tests: hand over a table's bytes (decompressed) by name.
  function useTable(name, bytes) { extra[name] = bytes; }
  return { load: load, use: use, need: need, ensure: ensure, useTable: useTable, NAMES: NAMES, ready: function () { return !!table; }, ready2: function () { return !!table2; }, bestMove: bestMove, outcomes: outcomes, value: function (pieces) { return strongToMove(pieces); } };
});
