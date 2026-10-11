/* Games outside the lessons (two players, or against the computer): counting to a draw (กติกา 2569 ข้อ ก 5)
 * and a simple computer player. Uses MakrukRules for every move, so the computer only plays legal moves.
 */
(function (root, factory) {
  'use strict';
  var play = factory(root && root.MakrukRules ? root.MakrukRules : (typeof require === 'function' ? require('./makruk-rules.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = play;
  if (root) root.MakrukPlay = play;
})(typeof window !== 'undefined' ? window : null, function (R) {
  'use strict';

  // Rough piece values for the computer: เบี้ย 1, เม็ด/เบี้ยหงาย 1.8, โคน 2.8, ม้า 3.6, เรือ 5.
  var VALUES = { pawn: 1, met: 1.8, promoted: 1.8, khon: 2.8, knight: 3.6, rook: 5, king: 0 };

  function same(a, b) { return a && b && a.r === b.r && a.c === b.c; }
  function opponent(side) { return side === 'white' ? 'black' : 'white'; }
  function count(pieces, side, type) { return pieces.filter(function (p) { return p.side === side && p.piece === type; }).length; }

  // ศักดิ์หมาก ceiling from the chasing side's pieces: the lowest of the pieces it has (ข้อ ก 5.3).
  function ceilingFor(pieces, side) {
    var caps = [], rooks = count(pieces, side, 'rook'), khons = count(pieces, side, 'khon'), knights = count(pieces, side, 'knight');
    if (rooks) caps.push(rooks > 1 ? 8 : 16);
    if (khons) caps.push(khons > 1 ? 22 : 44);
    if (knights) caps.push(knights > 1 ? 32 : 64);
    if (count(pieces, side, 'met') || count(pieces, side, 'promoted')) caps.push(64);
    return caps.length ? Math.min.apply(null, caps) : 64;
  }

  // The count after `mover` has moved and `pieces` is the new position. null = not counting (unpromoted pawns left).
  // Board count (ศักดิ์กระดาน): the side to move when counting begins says 1 on its next move, then one more each
  // move it makes; when it says 64 the game is drawn. Piece count (ศักดิ์หมาก): the lone king says the number of
  // pieces + 1 on its first move, then one more each move; once it reaches the ceiling, the chasing side has one
  // more move to mate, otherwise the game is drawn. A capture never restarts a piece count.
  function nextCount(current, pieces, mover) {
    if (pieces.some(function (p) { return p.piece === 'pawn'; })) return null;
    var white = pieces.filter(function (p) { return p.side === 'white'; }).length;
    var black = pieces.length - white;
    if (white === 1 && black === 1) return current; // bare kings: MakrukRules reports the draw
    var c = current ? Object.assign({}, current) : null;
    var lone = white === 1 ? 'white' : black === 1 ? 'black' : null;
    if (lone) {
      if (!c || c.kind !== 'piece') {
        c = { kind: 'piece', counter: lone, value: null, start: pieces.length + 1, ceiling: ceilingFor(pieces, opponent(lone)), extra: false, draw: false };
        return c;
      }
      if (mover === c.counter) return advance(c);
      if (c.extra) c.draw = true; // the chasing side used its last move
      return c;
    }
    if (!c) return { kind: 'board', counter: opponent(mover), value: null, ceiling: 64, draw: false };
    if (mover === c.counter) {
      c.value = c.value === null ? 1 : c.value + 1;
      if (c.value >= 64) c.draw = true;
    }
    return c;
  }
  function advance(c) {
    c.value = c.value === null ? c.start : c.value + 1;
    if (c.value >= c.ceiling) c.extra = true;
    return c;
  }
  // Short text for the turn line, e.g. "นับศักดิ์หมาก 7/16".
  function countText(c) {
    if (!c) return '';
    var name = c.kind === 'board' ? 'นับศักดิ์กระดาน' : 'นับศักดิ์หมาก';
    return c.value === null ? (c.kind === 'board' ? 'เริ่มนับศักดิ์กระดาน' : 'เริ่มนับศักดิ์หมาก ถึง ' + c.ceiling) : name + ' ' + c.value + '/' + c.ceiling;
  }

  // Static exchange on `square`: what `side` can win there by capturing first with its cheapest piece,
  // when both sides keep recapturing only while it pays.
  function exchange(pieces, square, side, depth) {
    var victim = pieces.find(function (p) { return same(p.at, square); });
    if (!victim || victim.side === side || depth > 6) return 0;
    var best = null, bestValue = Infinity;
    R.legalMoves(pieces, side).forEach(function (m) {
      if (!same(m.to, square)) return;
      var attacker = pieces.find(function (p) { return same(p.at, m.from); });
      var value = attacker.piece === 'king' ? 100 : VALUES[attacker.piece];
      if (value < bestValue) { bestValue = value; best = m; }
    });
    if (!best) return 0;
    var after = R.applyMove(pieces, best.from, best.to);
    return Math.max(0, VALUES[victim.piece] - exchange(after, square, opponent(side), depth + 1));
  }

  // Small positional terms: pieces near the centre, pawns and khon moving forward, the king kept safe.
  function positional(moving, from, to, side) {
    var centre = function (at) { return 3.5 - Math.max(Math.abs(at.r - 3.5), Math.abs(at.c - 3.5)); };
    var forward = side === 'white' ? from.r - to.r : to.r - from.r;
    var score = 0;
    if (moving.piece === 'knight' || moving.piece === 'met' || moving.piece === 'khon') score += (centre(to) - centre(from)) * 0.12;
    if (moving.piece === 'pawn' || moving.piece === 'khon') score += forward * 0.08;
    if (moving.piece === 'king' && to.r > 1 && to.r < 6) score -= 0.15;
    return score;
  }

  // Pick a move for `side`: mate at once, never allow a mate in one, weigh captures by the exchange that follows,
  // keep pieces from hanging, and add a little variety so games differ. options.random: 0..1 (default Math.random).
  function chooseMove(pieces, side, options) {
    options = options || {};
    var random = options.random || Math.random, enemy = opponent(side);
    var mine = pieces.filter(function (p) { return p.side === side; }).reduce(function (s, p) { return s + VALUES[p.piece]; }, 0);
    var theirs = pieces.filter(function (p) { return p.side === enemy; }).reduce(function (s, p) { return s + VALUES[p.piece]; }, 0);
    var ahead = mine - theirs;
    var best = null, bestScore = -Infinity;
    R.legalMoves(pieces, side).forEach(function (move) {
      var moving = pieces.find(function (p) { return same(p.at, move.from); });
      var taken = pieces.find(function (p) { return same(p.at, move.to); });
      var after = R.applyMove(pieces, move.from, move.to), status = R.gameStatus(after, enemy);
      var score;
      if (status.state === 'checkmate') score = 10000;
      else if (status.state !== 'playing') score = ahead > 1 ? -500 : ahead < -1 ? 300 : 0; // a draw: avoid it when ahead
      else {
        var landed = after.find(function (p) { return same(p.at, move.to); });
        var gain = (taken ? VALUES[taken.piece] : 0) + (landed.piece === 'promoted' && moving.piece === 'pawn' ? VALUES.promoted - VALUES.pawn : 0);
        score = gain - exchange(after, move.to, enemy, 0);
        // The worst exchange the opponent can start against our other pieces.
        var replies = R.legalMoves(after, enemy), threatened = [], loss = 0;
        replies.forEach(function (m) {
          var target = after.find(function (p) { return same(p.at, m.to) && p.side === side; });
          if (target && !same(m.to, move.to) && !threatened.some(function (t) { return same(t, m.to); })) threatened.push(m.to);
        });
        threatened.forEach(function (at) { loss = Math.max(loss, exchange(after, at, enemy, 0)); });
        score -= loss * 0.9;
        // Never walk into a mate in one.
        if (replies.some(function (m) { var next = R.applyMove(after, m.from, m.to); return R.inCheck(next, side) && R.gameStatus(next, side).state === 'checkmate'; })) score -= 5000;
        if (status.check) score += 0.3;
        score += positional(moving, move.from, move.to, side);
        // When chasing a lone king, keep it close to the edge and our king close to it.
        if (theirs === 0 && options.count) {
          var king = after.find(function (p) { return p.side === enemy && p.piece === 'king'; });
          var ours = after.find(function (p) { return p.side === side && p.piece === 'king'; });
          var edge = Math.min(king.at.r, 7 - king.at.r, king.at.c, 7 - king.at.c);
          var gap = Math.max(Math.abs(king.at.r - ours.at.r), Math.abs(king.at.c - ours.at.c));
          score -= edge * 0.4 + gap * 0.15 + R.legalMoves(after, enemy).length * 0.1;
        }
      }
      score += random() * 0.35;
      if (score > bestScore) { bestScore = score; best = move; }
    });
    return best;
  }

  return { VALUES: VALUES, ceilingFor: ceilingFor, nextCount: nextCount, countText: countText, exchange: exchange, chooseMove: chooseMove };
});
