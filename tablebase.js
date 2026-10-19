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
  // Pawn tables (เบี้ยคว่ำ, white's on ranks 1–5): a pawn reaching rank 6 goes on in the table with it promoted.
  var ORDER = ['rook', 'knight', 'khon', 'promoted', 'pawn'], extra = {}, fetching = {};
  var NAMES = ['knight', 'khon', 'promoted', 'rook-knight', 'rook-khon', 'rook-promoted', 'knight-knight', 'knight-khon',
    'knight-promoted', 'khon-khon', 'khon-promoted', 'promoted-promoted',
    'pawn', 'rook-pawn', 'knight-pawn', 'khon-pawn', 'promoted-pawn', 'pawn-pawn'];
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
  // King + one or two pieces against a lone king: {side, name, tables: the names it needs (with a pawn, also the
  // tables after it promotes), pieces: [{type, at}] in ORDER}, or null. Three pieces with a pawn have no table.
  function kind(pieces) {
    if (pieces.length < 3 || pieces.length > 5) return null;
    var kings = pieces.filter(function (p) { return p.piece === 'king'; });
    if (kings.length !== 2) return null;
    var others = pieces.filter(function (p) { return p.piece !== 'king'; });
    if (others.some(function (p) { return p.side !== others[0].side; })) return null;
    var list = others.map(function (p) { return { type: p.piece === 'met' ? 'promoted' : p.piece, at: p.at }; })
      .sort(function (a, b) { return ORDER.indexOf(a.type) - ORDER.indexOf(b.type); });
    var name = list.map(function (p) { return p.type; }).join('-');
    var types = list.map(function (p) { return p.type; }), uniq = function (n, i, a) { return a.indexOf(n) === i; };
    if (list.length > 2 && types.indexOf('pawn') >= 0) return null;
    if (list.length === 3 || (bigList && bigList.indexOf(name) >= 0)) {
      // A bigger table (scripts/build-big-tables.cjs); a piece taken goes on in the two-piece tables.
      var pairs = list.map(function (_, j) { return types.filter(function (_, k) { return k !== j; }).join('-'); }).filter(function (n) { return n; }).filter(uniq);
      return { side: others[0].side, name: name, big: true, tables: pairs.concat(types).filter(uniq), pieces: list };
    }
    var tables = [name].concat(list.length > 1 ? types : []);
    // A pawn's promotion, and what follows a capture after it: those tables too (the moves read two plies ahead).
    for (var t = 0; t < tables.length; t++) {
      var parts = tables[t].split('-');
      parts.forEach(function (x, j) {
        if (x !== 'pawn') return;
        var up = parts.map(function (y, i) { return i === j ? 'promoted' : y; }).sort(function (a, b) { return ORDER.indexOf(a) - ORDER.indexOf(b); });
        tables.push(up.join('-'));
        if (up.length > 1) up.forEach(function (y) { tables.push(y); });
      });
    }
    tables = tables.filter(uniq);
    return { side: others[0].side, name: name, tables: tables, pieces: list };
  }
  // Bigger tables: tablebase/big.json lists the ones built; each is tablebase/<name>/info.json plus one file per square
  // of the strong king (<k>.bin), loaded only for the squares around it.
  var bigList = null, bigListing = null, bigInfo = {}, bigInfoFetch = {}, bigChunks = {};
  function bigLayout(name) {
    var info = bigInfo[name];
    if (info && !info.kingIndex) {
      info.kingIndex = []; for (var s = 0; s < 64; s++) info.kingIndex.push(info.kings.indexOf(s));
      info.ts = info.symmetry === 8 ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1];
    }
    return info;
  }
  // The strong king's chunk for square wk (strong side read as white).
  function bigChunkOf(info, wk) {
    var t = 0; while (info.kingIndex[TF[info.ts[t]][wk]] < 0) t++;
    return { t: info.ts[t], chunk: info.kingIndex[TF[info.ts[t]][wk]] };
  }
  // Where a big-table position is kept: {chunk, offset}, the strong side read as white.
  function bigPlace(k, pieces) {
    var info = bigLayout(k.name), red = k.side === 'black';
    var s = function (at) { return (red ? 7 - at.r : at.r) * 8 + at.c; };
    var wk = s(pieces.find(function (p) { return p.piece === 'king' && p.side === k.side; }).at);
    var bk = s(pieces.find(function (p) { return p.piece === 'king' && p.side !== k.side; }).at);
    var c = bigChunkOf(info, wk), f = TF[c.t], m = 0, at = 0;
    info.groups.forEach(function (g) {
      var q = k.pieces.slice(at, at + g.count).map(function (p) { return f[s(p.at)]; }).sort(function (a, b) { return a - b; });
      var rank = g.count === 1 ? q[0] : g.count === 2 ? q[0] + q[1] * (q[1] - 1) / 2 : q[0] + q[1] * (q[1] - 1) / 2 + q[2] * (q[2] - 1) * (q[2] - 2) / 6;
      m = m * g.size + rank; at += g.count;
    });
    return { chunk: c.chunk, offset: f[bk] * info.comb + m };
  }
  function bigValue(k, pieces) {
    var p = bigPlace(k, pieces), bytes = bigChunks[k.name] && bigChunks[k.name][p.chunk];
    return bytes instanceof Uint8Array ? bytes[p.offset] : null;
  }
  // The chunks a position needs: the strong king's square and the squares around it (where its moves take it).
  function bigNeeds(k, pieces) {
    var info = bigLayout(k.name), red = k.side === 'black', out = [];
    var at = pieces.find(function (p) { return p.piece === 'king' && p.side === k.side; }).at;
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      var r = at.r + dr, c = at.c + dc;
      if (r < 0 || r > 7 || c < 0 || c > 7) continue;
      var chunk = bigChunkOf(info, (red ? 7 - r : r) * 8 + c).chunk;
      if (out.indexOf(chunk) < 0) out.push(chunk);
    }
    return out;
  }
  function bigReady(k, pieces) {
    if (!bigLayout(k.name) || !k.tables.every(loaded)) return false;
    var have = bigChunks[k.name] || {};
    return bigNeeds(k, pieces).every(function (c) { return have[c] instanceof Uint8Array; });
  }
  function listing() {
    if (bigList) return Promise.resolve(bigList);
    if (!bigListing) bigListing = fetch(base0 + 'big.json').then(function (res) { return res.ok ? res.json() : []; }, function () { return []; })
      .then(function (list) { bigList = Array.isArray(list) ? list : []; return bigList; }, function () { bigList = []; return bigList; });
    return bigListing;
  }
  function ensureBig(k, pieces) {
    return listing().then(function (list) {
      if (list.indexOf(k.name) < 0) return false;
      if (!bigInfoFetch[k.name]) bigInfoFetch[k.name] = bigInfo[k.name] ? Promise.resolve(bigInfo[k.name]) : fetch(base0 + k.name + '/info.json').then(function (res) { if (!res.ok) throw Error(res.status); return res.json(); });
      return bigInfoFetch[k.name].then(function (data) {
        bigInfo[k.name] = data;
        var have = bigChunks[k.name] = bigChunks[k.name] || {};
        return Promise.all(bigNeeds(k, pieces).map(function (c) {
          if (have[c] instanceof Uint8Array || have[c] === false) return have[c] !== false;
          if (!have[c]) have[c] = fetchBytes(base0 + k.name + '/' + c + '.bin', true).then(function (b) { have[c] = b; return true; }, function () { have[c] = false; return false; });
          return have[c];
        })).then(function () { return ensureTables(k); }).then(function () { return bigReady(k, pieces); });
      }, function () { bigList.splice(bigList.indexOf(k.name), 1); return false; });
    });
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
    if (pieces.length < 3 || pieces.length > 5) return null;
    var k = kind(pieces);
    if (k && k.big) return bigList && bigList.indexOf(k.name) >= 0 && bigLayout(k.name) && k.tables.every(loaded) ? { side: k.side, big: k } : null;
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
    if (m.big) { var b = bigValue(m.big, pieces); return b ? b : Infinity; }
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
  // ---- Tables with pieces on both sides (tools/makruk-tb export → tablebase/rs/) ----
  // Each keeps white to move only, in the colours where white has more (or stronger) pieces; with red to move the result
  // comes from one move ahead. A value with the side to move: 0 draw, 1..127 it mates in n of its moves, 128 + n it is
  // mated after n of the other side's moves. Big tables are split by the two kings' squares (`part` positions each);
  // only the parts a position needs are fetched. A look-up that meets a missing part stops (RS_MISSING); while ensure()
  // surveys a position (rsWant set) it notes the part and goes on, so one pass finds them all, then fetches them.
  var RS_ORDER = 'RNSM', RS_LETTER = { rook: 'R', knight: 'N', khon: 'S', met: 'M', promoted: 'M' };
  var rsList = null, rsListing = null, rsInfo = {}, rsParts = {}, rsBytes = 0, rsWant = null, RS_MISSING = { missing: true };
  var RS_LIMIT = 96 << 20;
  function rsBinom(n, k) { var r = 1; for (var i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); }
  function rsRanks(list) { return list.map(function (l) { return RS_ORDER.indexOf(l); }); }
  function rsCanonical(w, b) {
    if (w.length !== b.length) return w.length > b.length;
    var x = rsRanks(w), y = rsRanks(b);
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
    return true;
  }
  // The table a position belongs to: {name, flip (colours swapped to read it)}, or null (pawns, or kings alone).
  function rsKey(pieces) {
    var others = pieces.filter(function (p) { return p.piece !== 'king'; });
    if (!others.length || others.some(function (p) { return p.piece === 'pawn'; })) return null;
    var sort = function (a, b) { return RS_ORDER.indexOf(a) - RS_ORDER.indexOf(b); };
    var w = others.filter(function (p) { return p.side === 'white'; }).map(function (p) { return RS_LETTER[p.piece]; }).sort(sort);
    var b = others.filter(function (p) { return p.side === 'black'; }).map(function (p) { return RS_LETTER[p.piece]; }).sort(sort);
    var flip = !rsCanonical(w, b);
    return { name: flip ? 'K' + b.join('') + 'vK' + w.join('') : 'K' + w.join('') + 'vK' + b.join(''), flip: flip };
  }
  function rsCovers(key) { return !!key && !!rsList && rsList.indexOf(key.name) >= 0; }
  function rsNote(name, part) { if (!rsWant) throw RS_MISSING; rsWant.push({ name: name, part: part }); return 0; }
  // The stored value (white to move in the table's colours).
  function rsLookup(key, pieces) {
    var info = rsInfo[key.name];
    if (!info) return rsNote(key.name, null);
    var ps = pieces.map(function (p) {
      var side = key.flip ? (p.side === 'white' ? 'black' : 'white') : p.side;
      return { side: side, letter: p.piece === 'king' ? 'K' : RS_LETTER[p.piece], s: (key.flip ? 7 - p.at.r : p.at.r) * 8 + p.at.c };
    });
    var wk = ps.find(function (p) { return p.letter === 'K' && p.side === 'white'; }).s;
    var bk = ps.find(function (p) { return p.letter === 'K' && p.side === 'black'; }).s;
    var best = Infinity;
    info.symmetries.forEach(function (t) {
      var f = TF[t], k = info.kidx[f[wk]];
      if (k < 0) return;
      var m = 0;
      info.groups.forEach(function (g) {
        var slot = info.slots[g.start];
        var q = ps.filter(function (p) { return p.side === slot[0] && p.letter === slot[1]; }).map(function (p) { return f[p.s]; }).sort(function (a, b) { return a - b; });
        var rank = 0; q.forEach(function (s, j) { rank += rsBinom(s, j + 1); });
        m = m * g.size + rank;
      });
      var i = (k * 64 + f[bk]) * info.comb + m;
      if (i < best) best = i;
    });
    var part = Math.floor(best / info.part);
    if (info.zeroSet[part]) return 0;
    var bytes = rsParts[key.name] && rsParts[key.name].get(part);
    if (!(bytes instanceof Uint8Array)) return rsNote(key.name, part);
    return bytes[best - part * info.part];
  }
  var other = function (s) { return s === 'white' ? 'black' : 'white'; };
  // The result for the side to move: {res: 'win' | 'loss' | 'draw', n}, or null when no table covers the position.
  function rsResult(pieces, stm) {
    var key = rsKey(pieces);
    if (!key) return pieces.every(function (p) { return p.piece === 'king'; }) ? { res: 'draw', n: 0 } : null;
    if (rsCovers(key)) {
      if ((stm === 'white') !== key.flip) {
        var v = rsLookup(key, pieces);
        return v === 0 ? { res: 'draw', n: 0 } : v < 128 ? { res: 'win', n: v } : { res: 'loss', n: v - 128 };
      }
      return rsFromMoves(pieces, stm);
    }
    // A king alone on one side: the tables loaded through load() / ensure().
    var m = material(pieces);
    if (m && !(m.big && !bigReady(m.big, pieces))) {
      if (stm === m.side) { var s = strongToMove(pieces); return s === Infinity ? { res: 'draw', n: 0 } : { res: 'win', n: s }; }
      var l = loneToMove(pieces, stm);
      return l === Infinity ? { res: 'draw', n: 0 } : { res: 'loss', n: l };
    }
    if (need(pieces, true)) { if (!rsWant) throw RS_MISSING; rsWant.push({ pieces: pieces }); return { res: 'draw', n: 0 }; }
    return null;
  }
  function rsFromMoves(pieces, stm) {
    var st = R.gameStatus(pieces, stm);
    if (st.state === 'checkmate') return { res: 'loss', n: 0 };
    if (st.state !== 'playing') return { res: 'draw', n: 0 };
    var win = Infinity, worst = 0, held = false, moves = R.legalMoves(pieces, stm);
    for (var i = 0; i < moves.length; i++) {
      var r = rsResult(R.applyMove(pieces, moves[i].from, moves[i].to), other(stm));
      if (!r) return null;
      if (r.res === 'loss') win = Math.min(win, r.n + 1); else if (r.res === 'win') worst = Math.max(worst, r.n); else held = true;
    }
    // 125: a mate of 125 moves or more (the tables do not count longer ones).
    return win < Infinity ? { res: 'win', n: Math.min(win, 125) } : held ? { res: 'draw', n: 0 } : { res: 'loss', n: Math.min(worst, 125) };
  }
  // Every move of `side` with its result for `side`: win in n of its moves (this one included), loss after n of the
  // other side's moves, or draw.
  function rsOutcomes(pieces, side) {
    var list = [], moves = R.legalMoves(pieces, side);
    for (var i = 0; i < moves.length; i++) {
      var after = R.applyMove(pieces, moves[i].from, moves[i].to), r = rsResult(after, other(side));
      if (!r) return null;
      list.push({ move: { from: moves[i].from, to: moves[i].to }, after: after, res: r.res === 'loss' ? 'win' : r.res === 'win' ? 'loss' : 'draw', n: r.res === 'loss' ? r.n + 1 : r.n });
    }
    return { two: true, moves: list };
  }
  // The table's move: the quickest mate, else (when every move loses) the longest defence. A drawn position gives
  // null, so the engine plays it.
  function rsBest(pieces, side) {
    var o = rsOutcomes(pieces, side);
    if (!o || !o.moves.length) return null;
    var wins = o.moves.filter(function (x) { return x.res === 'win'; });
    if (wins.length) { var w = wins.reduce(function (a, b) { return b.n < a.n ? b : a; }); return { move: w.move, mateIn: w.n }; }
    if (o.moves.some(function (x) { return x.res === 'draw'; })) return null;
    var l = o.moves.reduce(function (a, b) { return b.n > a.n ? b : a; });
    return { move: l.move, mateIn: 0 };
  }
  function rsTry(f) {
    try { return f(); } catch (e) { if (e === RS_MISSING) return null; throw e; }
  }
  function rsListingLoad() {
    if (rsList) return Promise.resolve(rsList);
    if (!rsListing) rsListing = fetch(base0 + 'rs/index.json').then(function (res) { return res.ok ? res.json() : []; }, function () { return []; })
      .then(function (l) { rsList = Array.isArray(l) ? l : []; return rsList; }, function () { rsList = []; return rsList; });
    return rsListing;
  }
  function rsSetInfo(name, info) {
    info.kidx = []; for (var s = 0; s < 64; s++) info.kidx.push(info.kings.indexOf(s));
    info.slots = info.white.map(function (k) { return ['white', k]; }).concat(info.black.map(function (k) { return ['black', k]; }));
    info.zeroSet = {}; info.zero.forEach(function (z) { info.zeroSet[z] = true; });
    rsInfo[name] = info;
    if (!rsParts[name]) rsParts[name] = new Map();
  }
  // What a position still needs for its result and every move's, with either side to move.
  function rsProbe(pieces) {
    rsWant = [];
    try { ['white', 'black'].forEach(function (side) { rsResult(pieces, side); rsOutcomes(pieces, side); }); } finally { var want = rsWant; rsWant = null; }
    return want;
  }
  function rsNeed(pieces) {
    if (typeof DecompressionStream !== 'function') return false;
    var key = rsKey(pieces);
    if (!key || pieces.length > 6) return false;
    if (!rsList) return true;
    if (!rsCovers(key)) return false;
    return rsProbe(pieces).some(function (w) { return w.pieces || !rsFailed(w); });
  }
  var rsFailedParts = {};
  function rsFailed(w) { return !!rsFailedParts[w.name + ':' + w.part]; }
  function rsFetch(w) {
    if (rsFailed(w)) return Promise.resolve(false);
    if (w.part === null) {
      if (rsInfo[w.name]) return Promise.resolve(true);
      return fetch(base0 + 'rs/' + w.name + '/info.json').then(function (res) { if (!res.ok) throw Error(res.status); return res.json(); })
        .then(function (info) { rsSetInfo(w.name, info); return true; }, function () { rsFailedParts[w.name + ':null'] = true; return false; });
    }
    var parts = rsParts[w.name], info = rsInfo[w.name];
    if (parts.get(w.part) instanceof Uint8Array) return Promise.resolve(true);
    if (!parts.get(w.part)) parts.set(w.part, fetchBytes(base0 + 'rs/' + w.name + '/' + (info.single ? 'all' : w.part) + '.bin', true)
      .then(function (b) { parts.set(w.part, b); rsBytes += b.length; return true; }, function () { parts.delete(w.part); rsFailedParts[w.name + ':' + w.part] = true; return false; }));
    return parts.get(w.part);
  }
  function rsEnsure(pieces) {
    if (typeof DecompressionStream !== 'function' || !rsKey(pieces)) return Promise.resolve(false);
    if (rsBytes > RS_LIMIT) { Object.keys(rsParts).forEach(function (n) { rsParts[n] = new Map(); }); rsBytes = 0; }
    return rsListingLoad().then(function () {
      if (!rsCovers(rsKey(pieces))) return false;
      var round = function (left) {
        var want = rsProbe(pieces).filter(function (w) { return w.pieces || !rsFailed(w); });
        if (!want.length || !left) return !want.length;
        var jobs = [], seen = {};
        want.forEach(function (w) {
          var id = w.pieces ? 'old:' + (kind(w.pieces) || {}).name : w.name + ':' + w.part;
          if (seen[id]) return; seen[id] = true;
          jobs.push(w.pieces ? ensure(w.pieces, true) : rsFetch(w));
        });
        return Promise.all(jobs).then(function () { return round(left - 1); });
      };
      return round(4);
    });
  }
  // Node and tests: a table's info.json and its parts (decompressed), by part number.
  // Each call starts the table's parts afresh; useRsPart adds one more (tests that load parts as they need them).
  function useRs(name, info, parts) {
    if (!rsList) rsList = [];
    if (rsList.indexOf(name) < 0) rsList.push(name);
    rsSetInfo(name, info);
    rsParts[name] = new Map();
    Object.keys(parts).forEach(function (k) { rsParts[name].set(Number(k), parts[k]); });
  }
  function useRsPart(name, k, bytes) { rsParts[name].set(Number(k), bytes); }
  // ---- Bigger tables from this computer (tools/makruk-tb serve, http://127.0.0.1:8765) ----
  // Only when the page itself is opened from this computer (localhost / 127.0.0.1). /status is asked once; a position
  // that neither the web tables nor the lone-king tables cover, and whose table the server has, is asked with
  // /probe?fen=… and the answer (every move's result for the mover) is kept by position. No server: nothing changes.
  var LOCAL = { base: 'http://127.0.0.1:8765', on: false, tables: [], answers: new Map(), asking: new Map(), status: null };
  try { LOCAL.on = typeof location === 'object' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname); } catch (e) {}
  var FEN_LETTER = { king: 'k', rook: 'r', knight: 'n', khon: 's', met: 'm', promoted: 'm~', pawn: 'p' };
  function fenOf(pieces, stm) {
    var rows = [];
    for (var r = 0; r < 8; r++) {
      var row = '', empty = 0;
      for (var c = 0; c < 8; c++) {
        var p = pieces.find(function (x) { return x.at.r === r && x.at.c === c; });
        if (!p) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        var l = FEN_LETTER[p.piece];
        row += p.side === 'white' ? l.charAt(0).toUpperCase() + l.slice(1) : l;
      }
      rows.push(row + (empty || ''));
    }
    return rows.join('/') + ' ' + (stm === 'white' ? 'w' : 'b') + ' - - 0 1';
  }
  // Is this a position for the local server (not covered by the web's own tables)?
  function localCandidate(pieces) {
    if (!LOCAL.on || LOCAL.status === false) return false;
    var key = rsKey(pieces);
    if (!key || rsCovers(key) || material(pieces) || need(pieces, true)) return false;
    return LOCAL.status === null || LOCAL.tables.indexOf(key.name) >= 0;
  }
  function localStatus() {
    if (LOCAL.status !== null) return Promise.resolve(LOCAL.status);
    if (!LOCAL.asking.has('status')) {
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, 800) : 0;
      LOCAL.asking.set('status', fetch(LOCAL.base + '/status', ctl ? { signal: ctl.signal } : undefined)
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (s) { LOCAL.status = !!(s && s.ok); LOCAL.tables = (s && s.tables) || []; return LOCAL.status; },
          function () { LOCAL.status = false; return false; })
        .then(function (ok) { clearTimeout(timer); return ok; }));
    }
    return LOCAL.asking.get('status');
  }
  function localAsk(pieces, stm) {
    var fen = fenOf(pieces, stm);
    if (LOCAL.answers.has(fen)) return Promise.resolve(true);
    if (!LOCAL.asking.has(fen)) LOCAL.asking.set(fen, fetch(LOCAL.base + '/probe?fen=' + encodeURIComponent(fen))
      .then(function (res) { return res.json(); })
      .then(function (a) { LOCAL.answers.set(fen, a); LOCAL.asking.delete(fen); return true; },
        function () { LOCAL.asking.delete(fen); return false; }));
    return LOCAL.asking.get(fen);
  }
  function localNeed(pieces, stm) {
    if (!localCandidate(pieces)) return false;
    if (LOCAL.status === null) return true;
    return (stm ? [stm] : ['white', 'black']).some(function (s) { return !LOCAL.answers.has(fenOf(pieces, s)); });
  }
  function localEnsure(pieces, stm) {
    if (!localCandidate(pieces)) return Promise.resolve(false);
    return localStatus().then(function (ok) {
      if (!ok || !localCandidate(pieces)) return false;
      return Promise.all((stm ? [stm] : ['white', 'black']).map(function (s) { return localAsk(pieces, s); }))
        .then(function (all) { return all.every(Boolean); });
    });
  }
  function localOutcomes(pieces, side) {
    var a = LOCAL.on && LOCAL.answers.get(fenOf(pieces, side));
    if (!a || !a.covered) return null;
    return { two: true, local: true, moves: a.moves.map(function (x) {
      var from = { r: x.from[0], c: x.from[1] }, to = { r: x.to[0], c: x.to[1] };
      return { move: { from: from, to: to }, after: R.applyMove(pieces, from, to), res: x.res, n: x.n };
    }) };
  }
  function localBest(pieces, side) {
    var o = localOutcomes(pieces, side);
    if (!o || !o.moves.length) return null;
    var wins = o.moves.filter(function (x) { return x.res === 'win'; });
    if (wins.length) { var w = wins.reduce(function (a, b) { return b.n < a.n ? b : a; }); return { move: w.move, mateIn: w.n }; }
    if (o.moves.some(function (x) { return x.res === 'draw'; })) return null;
    var l = o.moves.reduce(function (a, b) { return b.n > a.n ? b : a; });
    return { move: l.move, mateIn: 0 };
  }
  // Node and tests: turn the local server on (as if the page were opened from this computer).
  function useLocal(base) { LOCAL.on = true; if (base) LOCAL.base = base; LOCAL.status = null; LOCAL.tables = []; LOCAL.answers = new Map(); LOCAL.asking = new Map(); }
  function bestMove(pieces, side) {
    var key = rsKey(pieces);
    if (rsCovers(key)) return rsTry(function () { return rsBest(pieces, side); });
    var m = material(pieces);
    if (!m) return localBest(pieces, side);
    if (m.big && !bigReady(m.big, pieces)) return null;
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
  // Tables with pieces on both sides answer {two: true, moves: [{move, after, res, n}]} instead (rsOutcomes).
  function outcomes(pieces, side) {
    if (rsCovers(rsKey(pieces))) return rsTry(function () { return rsOutcomes(pieces, side); });
    var m = material(pieces);
    if (!m) return localOutcomes(pieces, side);
    if (m.big && !bigReady(m.big, pieces)) return null;
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
  // Does this position need a table that is not loaded yet (and could be)? (oldOnly: the lone-king tables only;
  // stm: the side to move, for the local server's answers.)
  function need(pieces, oldOnly, stm) {
    if (!oldOnly && (rsNeed(pieces) || localNeed(pieces, stm))) return true;
    // A position the two-sided tables cover is read from them only: ensure() then never loads the lone-king tables
    // (or their list), so asking about those would say "needed" for ever and the AI would wait for ever.
    if (!oldOnly && typeof DecompressionStream === 'function' && rsCovers(rsKey(pieces))) return false;
    var k = kind(pieces);
    if (k && typeof DecompressionStream !== 'function' && k.name !== 'rook') return false;
    if (k && k.big) {
      if (!bigList) return true;
      if (bigList.indexOf(k.name) < 0) return false;
      if (!bigInfo[k.name]) return true;
      var have = bigChunks[k.name] || {};
      return bigNeeds(k, pieces).some(function (c) { return !(have[c] instanceof Uint8Array) && have[c] !== false; }) ||
        k.tables.some(function (n) { return !loaded(n) && extra[n] !== false && (!isRookTable(n) || !loading); });
    }
    return !!k && k.tables.some(function (n) { return !loaded(n) && extra[n] !== false && (!isRookTable(n) || !loading); });
  }
  // Loads every table this position needs (the rook ones through load()); resolves true when they are all there.
  function ensure(pieces, oldOnly, stm) {
    // The two-sided tables first (their list says which there are), then the lone-king ones, then the local server.
    if (!oldOnly && rsKey(pieces)) return rsEnsure(pieces).then(function (ok) { return ok || ensure(pieces, true); })
      .then(function (ok) { return ok || localEnsure(pieces, stm); });
    var k = kind(pieces);
    if (!k) return Promise.resolve(false);
    if (typeof DecompressionStream !== 'function' && k.tables.some(function (n) { return n !== 'rook'; })) return Promise.resolve(false);
    if (k.big) return ensureBig(k, pieces);
    return ensureTables(k);
  }
  function ensureTables(k) {
    return Promise.all(k.tables.map(function (n) {
      if (isRookTable(n)) return load();
      if (loaded(n) || extra[n] === false) return loaded(n);
      if (!fetching[n]) fetching[n] = fetchBytes(base0 + n + '.bin', true).then(function (b) { extra[n] = b; return true; }, function () { extra[n] = false; return false; });
      return fetching[n];
    })).then(function () { return k.tables.every(loaded); });
  }
  // Node and tests: hand over a table's bytes (decompressed) by name.
  function useTable(name, bytes) { extra[name] = bytes; }
  // Node and tests: hand over a big table (its info.json and decompressed chunks, by chunk number).
  function useBig(name, info, chunks) {
    if (!bigList) bigList = [];
    if (bigList.indexOf(name) < 0) bigList.push(name);
    bigInfo[name] = info; bigChunks[name] = chunks;
  }
  return { load: load, use: use, need: need, ensure: ensure, useTable: useTable, useBig: useBig, useRs: useRs, useRsPart: useRsPart, useLocal: useLocal, fenOf: fenOf,
    result: function (pieces, stm) { return rsTry(function () { return rsResult(pieces, stm); }); },
    // What a two-sided position still needs (for tests and debugging): [{name, part} | {pieces}].
    wanted: function (pieces) { return rsProbe(pieces); }, NAMES: NAMES, ready: function () { return !!table; }, ready2: function () { return !!table2; }, bestMove: bestMove, outcomes: outcomes, value: function (pieces) { return strongToMove(pieces); } };
});
