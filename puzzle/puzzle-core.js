/* The rules of the puzzle page (puzzle/index.html), apart from the screen, so tests can run them in Node:
 * - plan() and fill(): which 10 puzzles a set holds for the chosen mate counts and piece sets;
 * - step(): is a move right? Any move in the solution tree is (every move that mates as fast as the book one, or
 *   faster), with the defence the tree keeps;
 * - refute(): after a wrong move, the defence that shows why it is wrong, and the reason in words. */
(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports ? require('../makruk-rules.js') : root.MakrukRules);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MakrukPuzzleCore = api;
})(typeof window !== 'undefined' ? window : null, function (R) {
  'use strict';
  var FILES = 'abcdefgh';
  var NAME = { king: 'ขุน', rook: 'เรือ', knight: 'ม้า', khon: 'โคน', met: 'เม็ด', pawn: 'เบี้ย', promoted: 'เบี้ยหงาย' };
  var WORTH = { rook: 5, knight: 3, khon: 2.5, met: 2, promoted: 2, pawn: 1 };
  var SIZE = 10;
  function other(side) { return side === 'white' ? 'black' : 'white'; }
  function square(at) { return FILES[at.c] + (8 - at.r); }
  function moveKey(m) { return square(m.from) + square(m.to); }
  function fromKey(key) {
    return { from: { r: 8 - Number(key[1]), c: FILES.indexOf(key[0]) }, to: { r: 8 - Number(key[3]), c: FILES.indexOf(key[2]) } };
  }
  function sideName(side) { return side === 'white' ? 'ขาว' : 'แดง'; }

  // How many puzzles of each mate count a set of 10 holds: 1 → 4, 2 → 4, 3 → 2 with all three chosen (easy first),
  // otherwise shared out as evenly as they go, the smaller counts first.
  function shares(mates) {
    mates = mates.slice().sort();
    if (mates.join() === '1,2,3') return [4, 4, 2];
    var base = Math.floor(SIZE / mates.length), extra = SIZE % mates.length;
    return mates.map(function (_, i) { return base + (i < extra ? 1 : 0); });
  }
  // A set of up to 10 puzzles for filters {mates: [1, 2, 3], sets: [ids]}, from index (puzzle/sets.js: each set's
  // count by mate count), ordered by mate count: [{set, mate, i}], the i-th puzzle of that mate count in the set's file.
  // random() is Math.random unless a test passes its own. A mate count with too few puzzles is topped up from the others.
  function plan(index, filters, random) {
    random = random || Math.random;
    var mates = (filters.mates || []).slice().sort(), sets = filters.sets || [];
    var pool = {};
    mates.forEach(function (n) {
      pool[n] = [];
      index.sets.forEach(function (s) {
        if (sets.indexOf(s.id) < 0) return;
        for (var i = 0; i < (s.count[n] || 0); i++) pool[n].push({ set: s.id, mate: n, i: i });
      });
    });
    // Draw from the pool of n, a piece set at random first so the sets take turns.
    var used = [];
    function draw(n) {
      var left = pool[n].filter(function (p) { return used.indexOf(p) < 0; });
      if (!left.length) return null;
      var bySet = {};
      left.forEach(function (p) { (bySet[p.set] = bySet[p.set] || []).push(p); });
      var ids = Object.keys(bySet), list = bySet[ids[Math.floor(random() * ids.length)]];
      var pick = list[Math.floor(random() * list.length)];
      used.push(pick);
      return pick;
    }
    var want = shares(mates), out = [];
    mates.forEach(function (n, i) { for (var k = 0; k < want[i]; k++) { var p = draw(n); if (p) out.push(p); } });
    for (var guard = 0; out.length < SIZE && guard < SIZE; guard++) {
      var more = null;
      for (var j = 0; j < mates.length && !more; j++) more = draw(mates[j]);
      if (!more) break;
      out.push(more);
    }
    return out.sort(function (a, b) { return a.mate - b.mate; });
  }
  // The planned puzzles from the loaded set files (files: {id: [{mate, fen, tree}]}): [{set, mate, fen, tree}].
  function fill(slots, files) {
    return slots.map(function (s) {
      var p = files[s.set].filter(function (x) { return x.mate === s.mate; })[s.i];
      return { set: s.set, mate: s.mate, fen: p.fen, tree: p.tree };
    });
  }
  // How many puzzles the filters can give (for the settings dialog).
  function available(index, filters) {
    return index.sets.reduce(function (a, s) {
      if ((filters.sets || []).indexOf(s.id) < 0) return a;
      return a + (filters.mates || []).reduce(function (b, n) { return b + (s.count[n] || 0); }, 0);
    }, 0);
  }

  // The learner's move in a tree node: {ok: false} if it is not one of the tree's moves, else {ok: true, mate: true}
  // when it mates, or {ok: true, reply: {from, to}, node: next node}.
  function step(node, move) {
    var hit = node && node[moveKey(move)];
    if (!hit) return { ok: false };
    if (hit === '#') return { ok: true, mate: true };
    return { ok: true, reply: fromKey(hit.r), node: hit.n };
  }
  // The book line from a node: [{from, to}, ...], the attacker's moves and the replies in turn, ending in mate.
  function line(node) {
    var out = [];
    while (node) {
      var key = Object.keys(node)[0];
      if (!key) break;
      out.push(fromKey(key));
      if (node[key] === '#') break;
      out.push(fromKey(node[key].r));
      node = node[key].n;
    }
    return out;
  }

  // Can side (to move) mate within n of its moves?
  function wins(ps, side, n) {
    if (n <= 0) return false;
    return R.legalMoves(ps, side).some(function (m) {
      var after = R.applyMove(ps, m.from, m.to), st = R.gameStatus(after, other(side)).state;
      if (st === 'checkmate') return true;
      if (st !== 'playing' || n <= 1) return false;
      return R.legalMoves(after, other(side)).every(function (r) { return wins(R.applyMove(after, r.from, r.to), side, n - 1); });
    });
  }
  // After a wrong move by side with `left` moves of the puzzle still to play (this one included): the defence and the
  // reason. {reply: {from, to} | null, kind: 'stalemate' | 'capture' | 'escape', text}.
  function refute(after, side, left) {
    var def = other(side), st = R.gameStatus(after, def).state;
    if (st === 'stalemate') return { reply: null, kind: 'stalemate', text: 'อับแล้ว! ขุน' + sideName(def) + 'ไม่โดนรุก แต่ไม่มีที่เดิน เกมจึงเสมอ' };
    var moves = R.legalMoves(after, def), later = left - 1;
    var holds = function (m) { return !wins(R.applyMove(after, m.from, m.to), side, later); };
    var taken = function (m) { var p = after.find(function (x) { return x.at.r === m.to.r && x.at.c === m.to.c; }); return p && p.side === side ? p : null; };
    var captures = moves.filter(taken).sort(function (a, b) { return WORTH[taken(b).piece] - WORTH[taken(a).piece]; });
    for (var i = 0; i < captures.length; i++) {
      if (holds(captures[i])) return { reply: captures[i], kind: 'capture', text: 'ฝ่าย' + sideName(def) + 'กิน' + NAME[taken(captures[i]).piece] + 'ได้ จนไม่ได้แล้ว' };
    }
    // A king move first: it shows the king getting away.
    var king = after.find(function (p) { return p.side === def && p.piece === 'king'; });
    var order = moves.slice().sort(function (a, b) {
      var ka = a.from.r === king.at.r && a.from.c === king.at.c, kb = b.from.r === king.at.r && b.from.c === king.at.c;
      return kb - ka;
    });
    var reply = order.filter(holds)[0] || order[0];
    var text = left <= 1 ? 'ยังไม่จน ขุน' + sideName(def) + 'ยังเดินหนีได้' : 'ขุน' + sideName(def) + 'หนีได้ จนไม่ทันใน ' + left + ' ตาแล้ว';
    return { reply: reply, kind: 'escape', text: text };
  }

  return { SIZE: SIZE, NAME: NAME, other: other, square: square, moveKey: moveKey, fromKey: fromKey, sideName: sideName,
    shares: shares, plan: plan, fill: fill, available: available, step: step, line: line, wins: wins, refute: refute };
});
