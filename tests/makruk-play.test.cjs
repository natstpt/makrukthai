'use strict';
// Games outside the lessons: counting to a draw (กติกา 2569 ข้อ ก 5) and the computer player in makruk-play.js.
const assert = require('node:assert/strict');
const R = require('../makruk-rules.js');
const P = require('../makruk-play.js');
const M = require('../editor-model.js');
const N = require('../makruk-notation.js');

const KIND = { K: 'king', R: 'rook', B: 'khon', N: 'knight', M: 'met', F: 'promoted', P: 'pawn' };
const at = sq => ({ r: 8 - Number(sq[1]), c: 'abcdefgh'.indexOf(sq[0]) });
const board = text => text.split(' ').map(t => { const [k, sq] = t.split(':'); return { piece: KIND[k.toUpperCase()], side: k === k.toUpperCase() ? 'white' : 'black', at: at(sq) }; });
const key = m => 'abcdefgh'[m.from.c] + (8 - m.from.r) + 'abcdefgh'[m.to.c] + (8 - m.to.r);
const fixed = () => 0;
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };

// Ceilings: the lowest of the chasing side's pieces.
eq(P.ceilingFor(board('K:e1 R:a1 R:h1 k:e8'), 'white'), 8, 'two rooks 8');
eq(P.ceilingFor(board('K:e1 R:a1 k:e8'), 'white'), 16, 'one rook 16');
eq(P.ceilingFor(board('K:e1 B:a1 B:h1 k:e8'), 'white'), 22, 'two khon 22');
eq(P.ceilingFor(board('K:e1 B:a1 k:e8'), 'white'), 44, 'one khon 44');
eq(P.ceilingFor(board('K:e1 N:a1 N:h1 k:e8'), 'white'), 32, 'two knights 32');
eq(P.ceilingFor(board('K:e1 N:a1 k:e8'), 'white'), 64, 'one knight 64');
eq(P.ceilingFor(board('K:e1 F:a1 F:b1 M:c1 k:e8'), 'white'), 64, 'promoted pawns and met 64');
eq(P.ceilingFor(board('K:e1 R:a1 R:h1 B:c3 F:f4 k:e8'), 'white'), 8, 'mixed pieces use the lowest');

// Piece count: rook vs lone king. Red says 4 (3 pieces + 1) on its first move, up to 16; then white has one more move.
let pieces = board('K:e1 R:a1 k:e8'), c = P.nextCount(null, pieces, 'white');
eq([c.kind, c.counter, c.value, c.ceiling], ['piece', 'black', null, 16], 'lone king starts a piece count');
c = P.nextCount(c, pieces, 'black'); eq(c.value, 4, 'first count is pieces + 1');
for (let n = 5; n <= 16; n++) { c = P.nextCount(c, pieces, 'white'); c = P.nextCount(c, pieces, 'black'); }
eq([c.value, c.extra, c.draw], [16, true, false], 'count reaches the ceiling: white has one move left');
c = P.nextCount(c, pieces, 'white'); eq([c.value, c.draw], [16, false], 'white used its last move without mate: still 16');
c = P.nextCount(c, pieces, 'black'); eq([c.value, c.draw], [17, true], 'red moves and says 17: draw');
// Two rooks: red counts 5, 6, 7, 8; white's next move is the last, then red would say 9 = draw.
{ const two = board('K:e1 R:a1 R:h1 k:e8'); let t = P.nextCount(null, two, 'white');
  for (let n = 5; n <= 8; n++) { t = P.nextCount(t, two, 'black'); if (n < 8) t = P.nextCount(t, two, 'white'); }
  eq([t.value, t.extra, t.draw], [8, true, false], 'red says 8: white has one move left');
  t = P.nextCount(t, two, 'white'); eq(t.draw, false, 'white used its last move: red still to say 9');
  t = P.nextCount(t, two, 'black'); eq(t.draw, true, 'red moves and says 9: draw');
  eq(P.countText(t, s => s === 'white' ? 'ขาว' : 'แดง'), 'แดงนับเกิน 8 · เสมอ', 'draw text'); }
// A capture never restarts the piece count.
c = P.nextCount(null, board('K:e1 R:a1 R:h1 k:e8'), 'white'); c = P.nextCount(c, board('K:e1 R:a1 R:h1 k:e8'), 'black');
c = P.nextCount(c, board('K:e1 R:a1 k:h1'), 'black');
eq([c.value, c.ceiling], [6, 8], 'after the king takes a rook the count and ceiling carry on');
// A capture on the lone king's first counting move lowers the start: 8 pieces, the king takes one, 7 left, says 8.
{ const before = board('K:b6 R:d6 N:e2 B:f2 F:a6 F:c6 F:a8 k:b8'), after = board('K:b6 R:d6 N:e2 B:f2 F:a6 F:c6 k:a8');
  let t = P.nextCount({ kind: 'board', counter: 'black', value: 13, start: 1, ceiling: 64, extra: false, draw: false }, before, 'white');
  eq([t.kind, t.start, t.ceiling], ['piece', 9, 16], 'board count switches to the piece count');
  t = P.nextCount(t, after, 'black'); eq([t.value, t.ceiling], [8, 16], 'king captures on its first count: 7 pieces left, says 8'); }

// Board count: no pawns and both sides still have pieces. It only starts when the weaker side asks; that side
// says 1 on its next move and counts alone. After it says 64 the other side has one more move; then 65 = draw.
pieces = board('K:e1 R:a1 M:c4 k:e8 r:h8');
eq(P.nextCount(null, pieces, 'black'), null, 'no board count unless asked');
eq(P.canRequestBoardCount(pieces, null), true, 'the weaker side may ask');
eq(P.canRequestBoardCount(board('K:e1 R:a1 P:c3 k:e8 r:h8'), null), false, 'not while pawns are left');
c = P.requestBoardCount('black');
eq([c.kind, c.counter, c.value], ['board', 'black', null], 'red asked for the board count');
c = P.nextCount(c, pieces, 'white'); eq(c.value, null, 'only the counting side counts');
c = P.nextCount(c, pieces, 'black'); eq(c.value, 1, 'red says 1 on its move');
for (let n = 2; n <= 64; n++) { c = P.nextCount(c, pieces, 'white'); c = P.nextCount(c, pieces, 'black'); }
eq([c.value, c.extra, c.draw], [64, true, false], 'red says 64: white has one more move');
c = P.nextCount(c, pieces, 'white'); eq([c.value, c.draw], [64, false], 'white used its last move: red to move at 64');
c = P.nextCount(c, pieces, 'black'); eq([c.value, c.draw], [65, true], 'red moves and says 65: a draw');
pieces = board('K:e1 R:a1 k:e8 r:h8');
// A capture that leaves a lone king switches to the piece count.
c = P.requestBoardCount('black'); c = P.nextCount(c, pieces, 'black');
c = P.nextCount(c, board('K:e1 R:h8 k:e8'), 'white');
eq([c.kind, c.counter, c.value, c.ceiling], ['piece', 'black', null, 16], 'lone king: switch to the piece count');
// No counting while unpromoted pawns are on the board.
eq(P.nextCount(null, board('K:e1 R:a1 P:c3 k:e8'), 'white'), null, 'no count with pawns');

// Special board count (ข้อ ข 4.2): unpromoted pawns are still on the board but the shape no longer changes.
{ // Quiet moves that never come back to a square (from and to are all different).
  const quiet = n => Array.from({ length: n }, (_, i) => ({ piece: 'knight', capture: null, from: 'a' + i, to: 'b' + i }));
  // A king walking to and fro: ข2-ก2, ก2-ข2, …; every move after the first comes back to a square.
  const shuffle = n => Array.from({ length: n }, (_, i) => ({ piece: 'king', capture: null, from: i % 2 ? 'ก2' : 'ข2', to: i % 2 ? 'ข2' : 'ก2' }));
  eq(P.quietPlies([{ piece: 'pawn' }, ...quiet(3)]), 3, 'plies since the last pawn move');
  eq(P.quietPlies([...quiet(4), { piece: 'rook', capture: 'knight' }]), 0, 'a capture changes the shape');
  // Pawns head to head (ง4 against ง5) cannot move: the shape is locked, so the count may be asked for after
  // 3 moves each without a capture.
  const locked = board('K:e1 R:a1 P:d4 k:e8 n:b8 p:d5');
  eq(P.pawnsLocked(locked), true, 'pawns head to head are locked');
  eq(P.canRequestSpecialCount(locked, null, quiet(P.LOCKED_PLIES - 1)), false, 'locked pawns: not before 3 moves each');
  eq(P.canRequestSpecialCount(locked, null, quiet(P.LOCKED_PLIES)), true, 'locked pawns: 3 moves each without a capture');
  // The reported game: all six pawns locked, even material (either side may ask on its turn).
  const reported = M.parse('8/8/8/1km1p1p1/s1p1P1P1/2P1M3/1KS5/8 w - - 0 1').pieces;
  eq([P.pawnsLocked(reported), P.canRequestSpecialCount(reported, null, quiet(6))], [true, true], 'reported position qualifies');
  // A pawn whose way is blocked stays locked even when it could capture diagonally.
  eq(P.pawnsLocked(board('K:e1 P:d4 k:e8 p:d5 n:c5')), true, 'a capture does not unlock a blocked pawn');
  eq(P.pawnsLocked(board('K:e1 P:d4 P:a3 k:e8 p:d5')), false, 'a pawn with a free square ahead is not locked');
  eq(P.canRequestBoardCount(locked, null), false, 'not the ordinary board count while pawns are left');
  // Free pawns: pieces moving on to new squares do not change the count's chances; walking to and fro does.
  const free = board('K:h1 k:a8 n:d3 b:e2 p:g5');
  eq(P.pawnsLocked(free), false, 'a free pawn is not locked');
  eq(P.canRequestSpecialCount(free, null, quiet(40)), false, 'free pawns, pieces going somewhere: no special count');
  eq(P.shuffleMoves(shuffle(4)), 3, 'every move after the first comes back');
  eq(P.canRequestSpecialCount(free, null, shuffle(4)), false, '3 moves back: not yet');
  eq(P.canRequestSpecialCount(free, null, shuffle(5)), true, 'more than 3 moves back: the button comes up');
  eq(P.canRequestSpecialCount(free, null, [...shuffle(5), { piece: 'pawn', capture: null, from: 'ช5', to: 'ช4' }]), false, 'a pawn move starts again');
  // Exact repeats (the same positions again) do not count: the threefold-repetition draw handles them.
  { let ps = free, side = 'white'; const recs = [];
    const walk = (list) => list.forEach(m => { const from = at(m.slice(0, 2)), to = at(m.slice(2)), rec = N.formatMove(ps, from, to);
      ps = R.applyMove(ps, from, to); side = side === 'white' ? 'black' : 'white'; rec.fen = M.fen({ pieces: ps, turn: side }); recs.push(rec); });
    walk(['h1g1', 'a8b8', 'g1h1', 'b8a8', 'h1g1', 'a8b8', 'g1h1']);
    eq(P.shuffleMoves(recs, M.fen({ pieces: free, turn: 'white' })), 1, 'kings to and fro on the same squares: only the first return is a new position');
    eq(P.canRequestSpecialCount(free, null, recs, M.fen({ pieces: free, turn: 'white' })), false, 'exact repeats: no button');
    // Red's king wanders while white's goes back and forth: returns into new positions count.
    recs.length = 0; ps = free; side = 'white';
    walk(['h1g1', 'a8b8', 'g1h1', 'b8b7', 'h1g1', 'b7c7', 'g1h1', 'c7c8', 'h1g1']);
    eq(P.shuffleMoves(recs, M.fen({ pieces: free, turn: 'white' })), 4, 'to and fro without repeating a position');
    eq(P.canRequestSpecialCount(free, null, recs, M.fen({ pieces: free, turn: 'white' })), true, 'more than 3: the button comes up'); }
  eq(P.canRequestSpecialCount(free, null, [...shuffle(5), { piece: 'knight', capture: 'khon', from: 'ง3', to: 'จ2' }]), false, 'a capture starts again');
  // The reported opening (8 moves each, pawns still free, pieces developing): no special count, and equal
  // material compares equal.
  const opening = M.parse('r3k1nr/2sns3/pppm1ppp/3pp3/4PP2/PPPPMSPP/2SN4/R2K2NR b - - 0 1').pieces;
  { let ps = M.initial().pieces; const recs = [];
    for (const m of 'e1f2 d6d5 e3e4 e6e5 f3f4 b8d7 c1c2 d8c7 f2e3 c7d6 b1d2 c8c7 f1f2 f8e7 f2f3'.split(' ')) {
      const from = at(m.slice(0, 2)), to = at(m.slice(2)); recs.push(N.formatMove(ps, from, to)); ps = R.applyMove(ps, from, to); }
    eq(P.shuffleMoves(recs), 0, 'developing pieces never come back');
    eq(P.canRequestSpecialCount(opening, null, recs), false, 'opening with free pawns: no special count'); }
  eq(P.material(opening, 'white'), P.material(opening, 'black'), 'equal material is equal');
  eq(P.canRequestSpecialCount(board('K:e1 R:a1 k:e8 r:h8'), null, shuffle(20)), false, 'no pawns: the ordinary board count instead');
  // Counting once the special count is on (asked for here directly): white says 1 on its move, up to 64, then draw.
  let s = P.requestSpecialCount('white', free);
  eq([s.kind, s.special, s.counter, s.lone], ['board', true, 'white', 'white'], 'special count asked by the lone king');
  s = P.nextCount(s, free, 'white'); eq(s.value, 1, 'counts 1 even with pawns on the board');
  eq(P.countText(s, x => x === 'white' ? 'ขาว' : 'แดง'), 'ขาวนับศักดิ์กระดานกรณีพิเศษ 1/64', 'special count text');
  for (let n = 2; n <= 64; n++) { s = P.nextCount(s, free, 'black'); s = P.nextCount(s, free, 'white'); }
  eq([s.value, s.extra, s.draw], [64, true, false], 'white says 64: red has one more move');
  s = P.nextCount(s, free, 'black'); eq([s.value, s.draw], [64, false], 'red used its last move: white to move at 64/64');
  s = P.nextCount(s, free, 'white'); eq([s.value, s.draw], [65, true], 'white moves and says 65: a draw');
  eq(P.countText(s, x => x === 'white' ? 'ขาว' : 'แดง'), 'ขาวนับเกิน 64 · เสมอ', 'count over text');
  // The pawn is promoted after the count began: the count carries on, it does not start again or switch.
  s = P.nextCount(P.nextCount(P.requestSpecialCount('white', free), free, 'white'), board('K:h1 k:a8 n:d3 b:e2 f:g3'), 'black');
  eq([s.kind, s.value], ['board', 1], 'no pawns left: the special count goes on');
  // Both sides had pieces: a capture leaves a lone king but pawns are still on the board: the special count goes on.
  s = P.nextCount(P.requestSpecialCount('white', locked), locked, 'white');
  s = P.nextCount(s, board('K:e1 k:e8 n:a1 p:d5'), 'black');
  eq([s.kind, s.special, s.counter, s.value], ['board', true, 'white', 1], 'lone king with pawns left: the special count goes on');
  s = P.nextCount(s, board('K:e2 k:e8 n:a1 p:d5'), 'white'); eq([s.kind, s.value], ['board', 2], 'special count keeps counting');
  // With no pawns left, a capture that leaves a lone king switches to the piece count.
  s = P.nextCount(P.requestSpecialCount('white', locked), locked, 'white');
  s = P.nextCount(s, board('K:e1 k:e8 n:a1'), 'black');
  eq([s.kind, s.counter], ['piece', 'white'], 'no pawns left: switch to the piece count');
  // The reported game: red counts the special count; white's king takes red's last piece (pawn a4) and white's pawn
  // a3 is still unpromoted, so red keeps counting (45, 46) instead of switching to the piece count.
  { let g = Object.assign(P.requestSpecialCount('black', board('K:b4 R:g7 R:h7 P:a3 k:a8 p:a4')), { value: 45 });
    g = P.nextCount(g, board('K:a4 R:g7 R:h7 P:a3 k:a8'), 'white');
    eq([g.kind, g.special, g.counter, g.value], ['board', true, 'black', 45], 'lone king, a pawn left: no switch');
    g = P.nextCount(g, board('K:a4 R:g7 R:h7 P:a3 k:b8'), 'black'); eq(g.value, 46, 'red says 46');
    // Once the last pawn is gone (here promoted), the lone king switches to the piece count.
    g = P.nextCount(g, board('K:a4 R:g7 R:h7 F:a3 k:b8'), 'white');
    eq([g.kind, g.counter, g.ceiling], ['piece', 'black', 8], 'pawn gone: switch to the piece count'); } }

// Repetition: a move that would bring a position back a third time counts as a draw for the computer.
{ const ps = board('K:a1 R:h1 k:a8 r:h8 P:c3 p:c6');
  const avoid = key(P.chooseMove(ps, 'white', { random: fixed, repeats: (after) => after.some(p => p.piece === 'rook' && p.side === 'white' && p.at.r === 7 && p.at.c === 6) ? 2 : 0 }));
  assert.notEqual(avoid, 'h1g1', 'ahead: avoids the move that repeats a third time'); checks++; }

// The computer player.
eq(key(P.chooseMove(board('K:f6 R:a1 k:h8'), 'white', { random: fixed })), 'a1a8', 'mates in one');
eq(key(P.chooseMove(board('K:e1 R:a1 k:e8 n:a5'), 'white', { random: fixed })), 'a1a5', 'takes a free knight');
// The pawn on d5 is defended by the pawn on c6: a rook for a pawn is a bad trade.
assert.notEqual(key(P.chooseMove(board('K:e1 R:d1 P:h3 k:e8 p:d5 p:c6'), 'white', { random: fixed })), 'd1d5', 'does not trade a rook for a defended pawn'); checks++;
// The exchange value: a rook for a defended pawn does not pay (0); an undefended pawn wins 1; a knight for a
// defended rook still wins 5 - 3.6.
eq(P.exchange(board('K:e1 R:d1 k:e8 p:d5 p:c6'), at('d5'), 'white', 0), 0, 'a rook does not take a defended pawn');
eq(P.exchange(board('K:e1 R:d1 k:e8 p:d5'), at('d5'), 'white', 0), 1, 'an undefended pawn wins 1');
eq(Math.round(P.exchange(board('K:a1 N:c3 k:h8 r:d5 p:c6'), at('d5'), 'white', 0) * 10) / 10, 1.4, 'knight takes a defended rook: 5 - 3.6');
// Easy level: a mistake replaces the best move (here the free knight is left), but a mate in one is never missed.
assert.notEqual(key(P.chooseMove(board('K:e1 R:a1 k:e8 n:a5'), 'white', { random: fixed, mistakes: 1 })), 'a1a5', 'easy level can miss a free knight'); checks++;
eq(key(P.chooseMove(board('K:f6 R:a1 k:h8'), 'white', { random: fixed, mistakes: 1 })), 'a1a8', 'easy level still mates in one');
eq(key(P.chooseMove(board('K:e1 R:a1 k:e8 n:a5'), 'white', { random: fixed, mistakes: 0 })), 'a1a5', 'no mistakes at the medium level');
// Moves the rook away from an attack instead of leaving it to a knight.
const saved = key(P.chooseMove(board('K:a1 R:d4 P:h3 k:h8 n:f5'), 'white', { random: fixed }));
assert(!R.isAttacked(R.applyMove(board('K:a1 R:d4 P:h3 k:h8 n:f5'), at(saved.slice(0, 2)), at(saved.slice(2))), at(saved.slice(2)), 'black'), 'rook moves to a safe square, played ' + saved); checks++;

// Opening: from the start the computer takes the centre with two pawns, then builds the shape on both sides,
// the met ending on จ3 (ง6 for red).
{
  const N = require('../makruk-notation.js');
  let ps = M.initial().pieces, side = 'white';
  const played = [];
  for (let i = 0; i < 18; i++) {
    const m = P.chooseMove(ps, side, { random: fixed });
    played.push(key(m)); ps = R.applyMove(ps, m.from, m.to); side = side === 'white' ? 'black' : 'white';
  }
  eq(played, ['e3e4', 'd6d5', 'd3d4', 'e6e5', 'g1e2', 'b8d7', 'b1d2', 'g8e7', 'e1f2', 'd8c7', 'f2e3', 'c7d6', 'f1f2', 'c8c7', 'c1c2', 'f8f7', 'c2d3', 'f7e6'], 'opening shape for both sides');
  eq(M.fen({ pieces: ps, turn: side }).split(' ')[0], 'r3k2r/2snn3/pppmsppp/3pp3/3PP3/PPPSMPPP/3NNS2/R2K3R', 'the position in the example picture');
  // The pawn in the centre is not given away: with a red pawn able to win it for free, the pawn step waits.
  const guarded = P.openingMoves(M.initial().pieces, 'white').map(key);
  eq(guarded.slice(0, 2), ['e3e4', 'd3d4'], 'pawns to the centre come first');
  eq(P.openingMove(ps, 'white'), null, 'shape complete: no more opening moves');
  // A free piece comes first: the shape waits.
  const hung = board('K:d1 M:e1 R:a1 R:h1 N:b1 N:g1 B:c1 B:f1 P:a3 P:b3 P:c3 P:d3 P:e3 P:f3 P:g3 P:h3 k:e8 n:a5');
  assert.notEqual(key(P.chooseMove(hung, 'white', { random: fixed })), 'e3e4', 'takes the free knight instead of the opening move'); checks++;
  // The hard AI's opening: the same shape move, or null when the shape is done or must wait (here a free knight).
  eq(key(P.openingChoice(M.initial().pieces, 'white')), 'e3e4', 'hard AI opens with the centre pawn');
  eq(P.openingChoice(ps, 'white'), null, 'shape complete: the engine takes over');
  eq(P.openingChoice(hung, 'white'), null, 'a capture to make: the engine takes over');
}

// The flank shape (white only: บ.จ4 บ.ฉ4, then the met and a knight behind them, the khon on ฉ1 left to the AI)
// against red's centre shape, move for move; red asked for the flank shape plays the centre one; both pairings get
// through the opening without losing material.
{
  let ps = M.initial().pieces, side = 'white';
  const played = [];
  for (let i = 0; i < 14; i++) {
    const m = P.chooseMove(ps, side, { random: fixed, shape: side === 'white' ? 'flank' : 'centre' });
    played.push(key(m)); ps = R.applyMove(ps, m.from, m.to); side = side === 'white' ? 'black' : 'white';
  }
  eq(played, ['e3e4', 'd6d5', 'f3f4', 'e6e5', 'g1f3', 'b8d7', 'e1f2', 'g8e7', 'f2e3', 'd8c7', 'c1c2', 'c7d6', 'b1d2', 'c8c7'], 'flank shape against the centre shape');
  eq(M.fen({ pieces: ps, turn: side }).split(' ')[0], 'r3ks1r/2snn3/pppm1ppp/3pp3/4PP2/PPPPMNPP/2SN4/R2K1S1R', 'flank shape built, the khon still on ฉ1');
  eq(P.openingMove(ps, 'white', 'flank'), null, 'flank shape complete');
  eq(key(P.openingChoice(M.initial().pieces, 'white', 'flank')), 'e3e4', 'engine AI opens the flank shape with บ.จ4');
  eq(key(P.openingMove(M.initial().pieces, 'black', 'flank')), 'd6d5', 'red has no flank shape: the centre one');
  for (const [ws, bs] of [['flank', 'centre'], ['centre', 'centre']]) {
    let q = M.initial().pieces, s = 'white';
    for (let i = 0; i < 20; i++) { const m = P.chooseMove(q, s, { random: fixed, shape: s === 'white' ? ws : bs }); q = R.applyMove(q, m.from, m.to); s = s === 'white' ? 'black' : 'white'; }
    eq(P.material(q, 'white'), P.material(q, 'black'), ws + ' against ' + bs + ': material stays even');
  }
}

// Red's opening for the engine AI (aiOpening): the centre pawns ง5 จ5, the knights side by side on ง7 จ7, then the
// met ง8-ค7-ง6, each step losing no material; a move where white threatens something is the engine's ({free}, here
// chooseMove), and the plan goes on after it. Against the games that went wrong (ค5; ม.ช8-จ7 letting white take จ5;
// ค.ฉ7 and the king to ฉ8 after จ4 ฉ4 ม.ฉ3) red builds the whole shape and keeps material even.
{
  const line = (white) => {
    let ps = M.initial().pieces; const out = [];
    for (const w of white) {
      const m = R.legalMoves(ps, 'white').find(x => key(x) === w); ps = R.applyMove(ps, m.from, m.to);
      const r = P.aiOpening(ps, 'black');
      const mv = r && r.move ? r.move : r && r.moves ? r.moves[0] : P.chooseMove(ps, 'black', { random: fixed, opening: false });
      out.push((r && r.move ? '' : r && r.free ? 'free ' : r ? 'engine ' : 'done ') + key(mv)); ps = R.applyMove(ps, mv.from, mv.to);
    }
    return { out, even: P.material(ps, 'white') === P.material(ps, 'black'), fen: M.fen({ pieces: ps, turn: 'white' }).split(' ')[0] };
  };
  const shape = fen => /^r1s1ks1r\/3nn3\/pppm1ppp\/3pp3\//.test(fen);
  let g = line(['e3e4', 'f3f4', 'g1f3', 'b1d2', 'e1f2', 'c1c2']);
  eq(g.out, ['d6d5', 'e6e5', 'free b8d7', 'g8e7', 'd8c7', 'c7d6'], 'against จ4 ฉ4 ม.ฉ3: pawns, knight pair, met to ง6');
  assert.ok(g.even && shape(g.fen), g.fen); checks++;
  g = line(['f3f4', 'g1f3', 'e3e4', 'b1d2', 'e1f2', 'c1c2']);
  eq(g.out, ['d6d5', 'b8d7', 'e6e5', 'g8e7', 'd8c7', 'c7d6'], 'จ5 not safe yet: ม.ข8-ง7 first, then จ5');
  assert.ok(g.even && shape(g.fen), g.fen); checks++;
  g = line(['c3c4', 'b1c3', 'd3d4', 'g1e2', 'e1d2', 'f3f4']);
  eq(g.out, ['d6d5', 'g8e7', 'e6e5', 'b8d7', 'd8c7', 'c7d6'], 'ง5 attacked by ค4 ม.ค3: ม.ช8-จ7 first');
  assert.ok(g.even && shape(g.fen), g.fen); checks++;
  // After the met, the khon ฉ8-ฉ7-จ6 and the other khon one up, ค8-ค7 (not the king); then the plan is done.
  g = line(['e3e4', 'd3d4', 'g1e2', 'b1d2', 'e1f2', 'f2e3', 'c1c2', 'c2d3', 'f1f2', 'h1h2']);
  eq(g.out.slice(6, 9), ['f8f7', 'f7e6', 'c8c7'], 'the khon to จ6, then ค7');
  assert.ok(g.out[9].startsWith('done '), 'the plan ends with the khon on ค7: ' + g.out[9]); checks++;
  // White's edge pawn up to ญ4: red meets it at once with ญ6-ญ5 (the game that let white take ญ5 and ฉ5).
  g = line(['e3e4', 'h3h4', 'f3f4']);
  eq(g.out, ['d6d5', 'h6h5', 'e6e5'], 'ญ4 met by ญ5');
  // White threatens something (a capture to make): the engine answers that move.
  const ps = board('K:d1 R:a1 R:h1 N:b1 N:g1 B:c1 B:f1 M:e1 P:a3 P:b3 P:c3 P:d3 P:e5 P:f3 P:g3 P:h3 k:e8 r:a8 r:h8 n:b8 n:g8 b:c8 b:f8 m:d8 p:a6 p:b6 p:c6 p:d5 p:e6 p:f6 p:g6 p:h6');
  eq(P.aiOpening(ps, 'black'), { free: true }, 'a threat or a capture: the engine plays');
}

// The plan is not left in the middle of an exchange (openingOver): after ค4×ง5 the white pawn stands on ง5 (past its
// 4th rank) and material is uneven, but red takes back and goes on with the plan (the game where red left it and
// played ม.ข8-ค6, ค.ฉ8-จ7).
{
  let ps = M.initial().pieces, took = false; const out = [];
  for (const w of ['c3c4', 'c4d5', 'b1c3', 'd3d4', 'f1e2', 'e2d3', 'c1c2', 'e1f2', 'g1e2']) {
    const m = R.legalMoves(ps, 'white').find(x => key(x) === w);
    took = ps.some(p => p.at.r === m.to.r && p.at.c === m.to.c); ps = R.applyMove(ps, m.from, m.to);
    if (P.openingOver(ps, 'black', took)) { out.push('over'); break; }
    const r = P.aiOpening(ps, 'black', 'centre');
    const mv = r && r.move ? r.move : r && r.moves ? r.moves[0] : P.chooseMove(ps, 'black', { random: fixed, opening: false });
    out.push(key(mv)); ps = R.applyMove(ps, mv.from, mv.to);
  }
  eq(out, ['d6d5', 'c6d5', 'g8e7', 'e6e5', 'b8d7', 'd8c7', 'c7d6', 'f8f7', 'f7e6'], 'the plan goes on after the exchange on ง5');
  eq(P.openingOver(board('K:d1 P:d5 k:e8 p:e6'), 'black', false), true, 'an advanced pawn after the exchange ends the plan');
}

// White's plans for the engine AI (aiOpening): the centre one mirrors red's (จ4 ง4, the knights on จ2 ง2, the met
// จ1-ฉ2-จ3); the flank one is จ4 ฉ4, ม.ช1-ฉ3, the met to จ3, one khon up (the engine choosing ค2, ฉ2 or จ2), and only
// then the third pawn ง4.
{
  const play = (shape, black, skip) => {
    let ps = M.initial().pieces; const out = [];
    for (const b of black) {
      const r = P.aiOpening(ps, 'white', shape, skip); if (!r || r.free) { out.push(r ? 'free' : 'done'); break; }
      const mv = r.move || r.moves[0]; out.push(r.check ? 'check ' + key(mv) : r.move ? key(mv) : r.moves.map(key)); ps = R.applyMove(ps, mv.from, mv.to);
      const m = R.legalMoves(ps, 'black').find(x => key(x) === b); ps = R.applyMove(ps, m.from, m.to);
    }
    return out;
  };
  eq(play('centre', ['d6d5', 'e6e5', 'b8d7', 'g8e7', 'd8c7', 'c7d6', 'f8f7', 'f7e6', 'c8c7', 'h8g8']), ['e3e4', 'd3d4', 'g1e2', 'b1d2', 'e1f2', 'f2e3', 'c1c2', 'c2d3', 'f1f2', 'done'], 'white centre plan');
  // Red's edge pawns up to ก5 ญ5 are met by ก4 ญ4 first.
  const passive = ['a6a5', 'h6h5', 'a8a7', 'h8h7', 'a7a6', 'h7h6', 'a6a7', 'h6h7', 'a7a6', 'h7h6'];
  // With the shape ready, จ4-จ5 comes first, for the engine to check; turned down (skip), the third pawn ง4.
  eq(play('flank', passive).slice(0, 9), ['e3e4', 'a3a4', 'h3h4', 'f3f4', 'g1f3', 'e1f2', 'f2e3', ['c1c2', 'f1f2', 'f1e2'], 'check e4e5'], 'white flank plan: จ5 when the engine agrees');
  eq(play('flank', passive, { e4e5: true }), ['e3e4', 'a3a4', 'h3h4', 'f3f4', 'g1f3', 'e1f2', 'f2e3', ['c1c2', 'f1f2', 'f1e2'], 'd3d4', 'done'], 'จ5 turned down: the third pawn last');
  // The game in the picture: the flank shape ready (ค.ค2 up), จ5 guarded as well as attacked: จ4-จ5 for the engine.
  const ready = board('R:a1 N:b1 K:d1 B:f1 R:h1 B:c2 P:a3 P:b3 P:c3 P:d3 M:e3 N:f3 P:g3 P:h3 P:e4 P:f4 r:a8 b:c8 k:e8 r:h8 m:c7 n:d7 n:e7 b:f7 p:a6 p:b6 p:c6 p:e6 p:f6 p:h6 p:d5 p:g5');
  const offer = P.aiOpening(ready, 'white', 'flank');
  eq([key(offer.move), offer.check], ['e4e5', true], 'จ4-จ5 when the shape is ready');
  const after = P.aiOpening(ready, 'white', 'flank', { e4e5: true });
  assert.ok(!(after && after.move && key(after.move) === 'e4e5'), 'turned down: not offered again'); checks++;
  // Red's pawns ค5 ง5 guard ง4: the third pawn is not played as a step; the engine moves (no king move, no flank pawn
  // push).
  const wait = play('flank', ['c6c5', 'b8c6', 'd6d5', 'g8e7', 'd8c7', 'b6b5', 'c8b7'], { e4e5: true });
  eq(wait.slice(0, 6).map(x => Array.isArray(x) ? 'khon' : x), ['e3e4', 'f3f4', 'g1f3', 'e1f2', 'f2e3', 'khon'], 'flank shape before the third pawn');
  assert.ok(Array.isArray(wait[6]) && !wait[6].some(k => k.startsWith('d1') || /^([abcgh])3\14$/.test(k)), 'ง4 waits: ' + wait[6]); checks++;
}

// An advanced pawn against the flank shape (เบี้ยสูง): red stands on ง5 ค5 with a knight on ค6 and pushes the
// supported pawn to ง4 on its 4th move. White answers ค.ค1-ค2, บ.ข3-ข4, บ.ข4×ค5, without losing material.
for (const [ai, script, answer] of [['white', ['d6d5', 'c6c5', 'b8c6', 'd5d4'], ['c1c2', 'b3b4', 'b4c5']]]) {
  let ps = M.initial().pieces, side = 'white', other = 0;
  const aiMoves = [];
  for (let i = 0; i < 24; i++) {
    let m;
    if (side !== ai) {
      const p = other < script.length && R.legalMoves(ps, side).find(x => key(x) === script[other]);
      other++;
      m = p || P.chooseMove(ps, side, { random: fixed });
    } else { m = P.chooseMove(ps, side, { random: fixed, shape: 'flank' }); aiMoves.push(key(m)); }
    ps = R.applyMove(ps, m.from, m.to); side = side === 'white' ? 'black' : 'white';
  }
  const at0 = aiMoves.indexOf(answer[0]);
  assert(at0 >= 0, ai + ' answers the advanced pawn with ' + answer[0] + ': ' + aiMoves.join(' ')); checks++;
  eq(aiMoves.slice(at0, at0 + 3), answer, ai + ': khon first, then the pawn up, then it takes');
  assert(P.material(ps, ai) >= P.material(ps, ai === 'white' ? 'black' : 'white'), ai + ' loses no material'); checks++;
}

// After the engine AI has left the shape, the advanced-pawn answer still comes first (flankAnswer), and only then.
{
  const advanced = M.parse('r1smksnr/8/ppn1pppp/2p5/3pPP2/PPPP1NPP/5M2/RNSK1S1R w - - 0 1').pieces;
  eq(key(P.flankAnswer(advanced, 'white', 'flank')), 'c1c2', 'engine AI: the khon to ค2 first');
  eq(P.flankAnswer(advanced, 'white', 'centre'), null, 'only with the flank shape');
  eq(P.flankAnswer(M.initial().pieces, 'white', 'flank'), null, 'no advanced pawn: nothing to answer');
  eq(P.flankAnswer(advanced, 'black', 'flank'), null, 'red has no flank shape');
}

// Red not standing in the centre (side moves only): after its shape, white also brings up the third centre pawn, to
// ง4 จ4 ฉ4 (บ.ง3-ง4 after the flank shape, บ.ฉ3-ฉ4 after the centre one). With a red pawn on ง5 it does not.
for (const [shape, extra] of [['flank', 'd3d4'], ['centre', 'f3f4']]) {
  const red = ['g6g5', 'g8e7', 'f8f7', 'b8d7', 'd8c7', 'f7g6', 'a6a5', 'h6h5', 'b6b5', 'a8a7', 'h8h7'];
  let ps = M.initial().pieces, side = 'white', o = 0;
  const white = [];
  for (let i = 0; i < 22; i++) {
    let m;
    if (side === 'black') { const k = red[o++]; m = R.legalMoves(ps, side).find(x => key(x) === k) || P.chooseMove(ps, side, { random: fixed, opening: false }); }
    else { m = P.chooseMove(ps, side, { random: fixed, shape }); white.push(key(m)); }
    ps = R.applyMove(ps, m.from, m.to); side = side === 'white' ? 'black' : 'white';
  }
  assert(white.includes(extra), shape + ': the third centre pawn goes up (' + white.join(' ') + ')'); checks++;
  assert(['d4', 'e4', 'f4'].every(sq => ps.some(p => p.side === 'white' && p.piece === 'pawn' && p.at.r === at(sq).r && p.at.c === at(sq).c)), shape + ': pawns on ง4 จ4 ฉ4'); checks++;
}
eq(P.openingMoves(M.parse('rnsmksnr/8/ppp1pppp/3p4/3PP3/PPP2PPP/8/RNSKMSNR w - - 0 1').pieces, 'white', 'centre').map(key).includes('f3f4'), false, 'a red pawn on ง5: no third centre pawn');

// เบี้ยสูง: a pawn of the other side past its 4th rank (white on rank 5, red on rank 4) ends the engine AI's shape.
{
  eq(P.pawnAdvanced(M.initial().pieces, 'black'), false, 'opening position: no advanced pawn');
  eq(P.pawnAdvanced(M.parse('rnsmksnr/8/pppppp1p/6pP/8/PPPPPPP1/8/RNSKMSNR b - - 0 1').pieces, 'black'), true, 'white pawn on ญ5: red leaves its shape');
  eq(P.pawnAdvanced(M.parse('rnsmksnr/8/pppppp1p/6pP/8/PPPPPPP1/8/RNSKMSNR b - - 0 1').pieces, 'white'), false, 'own pawns do not count');
  eq(P.pawnAdvanced(M.parse('rnsmksnr/8/ppp1pppp/8/3p4/PPPPPPPP/8/RNSKMSNR w - - 0 1').pieces, 'white'), true, 'red pawn on ง4: white leaves its shape');
}

// Whole games: the computer plays both sides with counting; every game ends (mate or a draw) within the count limits.
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const endings = {};
for (let g = 0; g < 3; g++) {
  let ps = M.initial().pieces, side = 'white', cnt = P.nextCount(null, ps, 'black'), state = 'playing', plies = 0;
  while (plies < 1200) {
    // The weaker side asks for the board count, as the editor's computer player does.
    if (P.canRequestBoardCount(ps, cnt) && P.material(ps, side) < P.material(ps, side === 'white' ? 'black' : 'white')) cnt = P.requestBoardCount(side);
    const move = P.chooseMove(ps, side, { random: rnd, count: cnt });
    assert(R.legalMoves(ps, side).some(m => key(m) === key(move)), 'legal computer move');
    ps = R.applyMove(ps, move.from, move.to); cnt = P.nextCount(cnt, ps, side); side = side === 'white' ? 'black' : 'white'; plies++;
    state = R.gameStatus(ps, side).state;
    if (state === 'playing' && cnt && cnt.draw) state = 'count draw';
    if (state !== 'playing') break;
  }
  // Counting only starts once the unpromoted pawns are gone, so a game with locked pawns can go on.
  if (state === 'playing') state = ps.some(p => p.piece === 'pawn') ? 'pawns locked' : state;
  assert.notEqual(state, 'playing', 'game ' + g + ' ends once counting applies'); checks++;
  endings[state] = (endings[state] || 0) + 1;
}
console.log('Play verified: ' + checks + ' checks; computer games ended: ' + JSON.stringify(endings));
