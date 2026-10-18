/* How good a move was, for วิเคราะห์การเดิน (the game review after a game against the AI).
 * A move is graded from the evaluations before and after it, both in centipawns for the side that moved (a mate as
 * ±10000 less its moves), into one of nine grades, from แต้มเซียน down to พลาดหนัก; the accuracy of a side (0–100)
 * comes from the chance of winning each of its moves gave away, as on the chess sites.
 */
(function (root, factory) {
  'use strict';
  var grades = factory();
  if (typeof module === 'object' && module.exports) module.exports = grades;
  if (root) root.MakrukGrades = grades;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // In order from best to worst; icon and Thai name as the summary and the move record show them.
  var KINDS = ['brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder'];
  var INFO = {
    brilliant: { icon: '!!', name: 'แต้มเซียน' },
    great: { icon: '!', name: 'แต้มเด็ด' },
    best: { icon: '★', name: 'ดีที่สุด' },
    excellent: { icon: '👍', name: 'ดีมาก' },
    good: { icon: '✓', name: 'ดี' },
    inaccuracy: { icon: '?!', name: 'ยังไม่แม่น' },
    mistake: { icon: '?', name: 'พลาด' },
    miss: { icon: '✗', name: 'พลาดโอกาส' },
    blunder: { icon: '??', name: 'พลาดหนัก' }
  };
  // The top three: the move kept the game where the best move would have (no better move to show).
  function isTop(kind) { return kind === 'brilliant' || kind === 'great' || kind === 'best'; }
  // A move worth looking at again (the danger and the better move).
  function isBad(kind) { return kind === 'mistake' || kind === 'miss' || kind === 'blunder'; }

  // Piece values (เบี้ย = 1) for telling a sacrifice.
  var VALUE = { pawn: 1, promoted: 2, met: 2, khon: 2.5, knight: 3, rook: 5, king: 0 };
  function clamp(v) { return Math.max(-1000, Math.min(1000, v)); }

  // The chance of winning (0–100) at an evaluation, as the chess sites estimate it.
  function winChance(v) {
    if (v >= 9000) return 100;
    if (v <= -9000) return 0;
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * v)) - 1);
  }
  // One move's accuracy (0–100) from the chance of winning it gave away.
  function moveAccuracy(before, after) {
    var lost = Math.max(0, winChance(before) - winChance(after));
    return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * lost) - 3.1669));
  }
  // A side's accuracy over its graded moves ({before, after}); null without any.
  function accuracy(moves) {
    if (!moves.length) return null;
    return moves.reduce(function (sum, m) { return sum + moveAccuracy(m.before, m.after); }, 0) / moves.length;
  }

  // The grade of a move. m: before and after (for the side that moved), second (the second best move's value before
  // it, when searched; null when there was none), sacrifice (the move offers a piece), prevLoss (what the opponent's
  // move just before gave away).
  //   ดีที่สุด: within 0.1 of the best; แต้มเซียน when it offers a piece and the game is still at least level;
  //   แต้มเด็ด when every other move was at least 1.5 worse (the only move), and the game was not already won;
  //   ดีมาก ≤ 0.3, ดี ≤ 0.6, ยังไม่แม่น ≤ 1.2; above that พลาดโอกาส when the opponent had just erred (and this move
  //   did not lose the game), พลาดหนัก above 3 (or from level to lost), พลาด otherwise.
  function classify(m) {
    var b = clamp(m.before), a = clamp(m.after), loss = Math.max(0, b - a);
    if (loss <= 10) {
      if (m.sacrifice && a >= -50 && b < 600) return 'brilliant';
      if (m.second !== null && m.second !== undefined && b - clamp(m.second) >= 150 && a >= -300 && b < 600) return 'great';
      return 'best';
    }
    if (loss <= 30) return 'excellent';
    if (loss <= 60) return 'good';
    if (loss <= 120) return 'inaccuracy';
    if ((m.prevLoss || 0) >= 120 && a > -150) return 'miss';
    if (loss > 300 || (b >= -50 && a <= -300)) return 'blunder';
    return 'mistake';
  }

  // Whether the move from→to offers a piece: a piece worth more than a เบี้ย stands where the opponent can take it,
  // for less than it is worth (not defended, or the cheapest taker is worth less), and it did not just take as much.
  function sacrifice(R, pieces, from, to) {
    var at = function (list, s) { return list.find(function (p) { return p.at.r === s.r && p.at.c === s.c; }); };
    var mover = at(pieces, from), took = at(pieces, to);
    if (!mover || mover.piece === 'king') return false;
    var after = R.applyMove(pieces, from, to), moved = at(after, to);
    if (!moved) return false;
    // Worth what it was before moving (a เบี้ย that promotes on the square is still only a เบี้ย offered).
    var worth = VALUE[mover.piece] || 0, gained = took ? VALUE[took.piece] || 0 : 0;
    if (worth < 2 || gained >= worth) return false;
    var them = moved.side === 'white' ? 'black' : 'white';
    var takers = after.filter(function (p) {
      return p.side === them && R.legalDestinations(after, p.at).some(function (s) { return s.r === to.r && s.c === to.c; });
    });
    if (!takers.length) return false;
    var cheapest = Math.min.apply(null, takers.map(function (p) { return VALUE[p.piece] || 0; }));
    // Defended: after the cheapest taker takes, the square can be taken back.
    var taker = takers.find(function (p) { return (VALUE[p.piece] || 0) === cheapest; });
    var defended = R.isAttacked(R.applyMove(after, taker.at, to), to, moved.side);
    return !defended || cheapest < worth;
  }

  return { KINDS: KINDS, INFO: INFO, isTop: isTop, isBad: isBad, classify: classify, sacrifice: sacrifice, winChance: winChance, moveAccuracy: moveAccuracy, accuracy: accuracy };
});
