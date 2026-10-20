/* How good a move was, for วิเคราะห์การเดิน (the game review after a game against the AI).
 * A move is graded from the evaluations before and after it, both in centipawns for the side that moved (a mate as
 * ±10000 less its moves), into one of nine grades, from แต้มเซียน down to พลาดหนัก; the accuracy of a side (0–100)
 * comes from the chance of winning each of its moves gave away, weighted as on the chess sites.
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
  // A side's accuracy over its graded moves ({before, after}, in game order); null without any. As on the chess sites:
  // each move's accuracy, weighted by how much the game was swinging around it (a quiet move counts less than one in a
  // tense position), and averaged with the harmonic mean (one bad move pulls the score down as it should); the two
  // averaged.
  function accuracy(moves) {
    if (!moves.length) return null;
    var accs = moves.map(function (m) { return moveAccuracy(m.before, m.after); });
    var chances = moves.map(function (m) { return winChance(m.before); });
    var weights = chances.map(function (_, i) {
      var w = chances.slice(Math.max(0, i - 2), i + 3), mean = w.reduce(function (s, x) { return s + x; }, 0) / w.length;
      var sd = Math.sqrt(w.reduce(function (s, x) { return s + (x - mean) * (x - mean); }, 0) / w.length);
      return Math.max(0.5, Math.min(12, sd));
    });
    var total = weights.reduce(function (s, x) { return s + x; }, 0);
    var weighted = accs.reduce(function (s, x, i) { return s + x * weights[i]; }, 0) / total;
    var harmonic = accs.length / accs.reduce(function (s, x) { return s + 1 / Math.max(1, x); }, 0);
    return (weighted + harmonic) / 2;
  }
  // A mate in an evaluation: moves to it for the side it is given for (positive: it mates; negative: it is mated).
  function mateIn(v) { return v >= 9000 ? 10000 - v : v <= -9000 ? -(10000 + v) : 0; }

  // The grade of a move. m: before and after (for the side that moved), second (the second best move's value before
  // it, when searched; null when there was none), sacrifice (the move offers a piece), replyTakes (the engine's best
  // reply takes it: true, false, or null when not known), prevDrop (the chance of winning the opponent's move just
  // before gave away, 0–100), bestWins (the best move here took a piece or mated).
  // Graded on the chance of winning given away (the chess sites' scale), so a pawn lost in a won game costs little:
  //   ดีที่สุด: within 0.1 of the best (or a mate kept); แต้มเซียน when it offers a piece the engine would take, and the
  //   game stays at least level; แต้มเด็ด when every other move was much worse (the only move) and the game was not
  //   already won; ดีมาก up to 2% given away, ดี up to 5, ยังไม่แม่น up to 10; then พลาดโอกาส when the opponent had just
  //   erred and this move let a capture or a mate go, พลาด up to 20, พลาดหนัก beyond (or walking into a mate).
  //   A forced mate let go is พลาดโอกาส (ดี when the game is still as good as won).
  function classify(m) {
    var wb = winChance(m.before), wa = winChance(m.after), drop = Math.max(0, wb - wa);
    var loss = Math.max(0, clamp(m.before) - clamp(m.after));
    if (m.after <= -9000 && m.before > -9000) return 'blunder';
    if (m.before >= 9000 && m.after < 9000) return wa >= 97 ? 'good' : 'miss';
    var kept = m.before >= 9000 ? mateIn(m.after) <= mateIn(m.before) + 2 : loss <= 10;
    if (kept) {
      if (m.sacrifice && m.replyTakes !== false && wa >= 45 && wb < 90) return 'brilliant';
      if (m.second !== null && m.second !== undefined && wb - winChance(m.second) >= 15 && wb < 90 && wa >= 25) return 'great';
      return 'best';
    }
    if (m.before >= 9000) return 'excellent';
    if (drop <= 2) return 'excellent';
    if (drop <= 5) return 'good';
    if (drop <= 10) return 'inaccuracy';
    if ((m.prevDrop || 0) >= 10 && m.bestWins && wa >= 30) return 'miss';
    return drop <= 20 ? 'mistake' : 'blunder';
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

  return { KINDS: KINDS, INFO: INFO, isTop: isTop, isBad: isBad, classify: classify, sacrifice: sacrifice, winChance: winChance, moveAccuracy: moveAccuracy, accuracy: accuracy, mateIn: mateIn };
});
