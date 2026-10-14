'use strict';
// Games outside the lessons: counting to a draw (กติกา 2569 ข้อ ก 5) and the computer player in makruk-play.js.
const assert = require('node:assert/strict');
const R = require('../makruk-rules.js');
const P = require('../makruk-play.js');
const M = require('../editor-model.js');

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
{ const quiet = n => Array.from({ length: n }, () => ({ piece: 'knight', capture: null }));
  eq(P.quietPlies([{ piece: 'pawn' }, ...quiet(3)]), 3, 'plies since the last pawn move');
  eq(P.quietPlies([...quiet(4), { piece: 'rook', capture: 'knight' }]), 0, 'a capture changes the shape');
  // Pawns head to head (ง4 against ง5) cannot move: the shape is locked, so the count may be asked for after
  // 3 moves each without a capture.
  const locked = board('K:e1 R:a1 P:d4 k:e8 n:b8 p:d5');
  eq(P.pawnsLocked(locked), true, 'pawns head to head are locked');
  eq(P.canRequestSpecialCount(locked, null, P.LOCKED_PLIES - 1), false, 'locked pawns: not before 3 moves each');
  eq(P.canRequestSpecialCount(locked, null, P.LOCKED_PLIES), true, 'locked pawns: 3 moves each without a capture');
  // The reported game: all six pawns locked, even material (either side may ask on its turn).
  const reported = M.parse('8/8/8/1km1p1p1/s1p1P1P1/2P1M3/1KS5/8 w - - 0 1').pieces;
  eq([P.pawnsLocked(reported), P.canRequestSpecialCount(reported, null, 6)], [true, true], 'reported position qualifies');
  // A pawn whose way is blocked stays locked even when it could capture diagonally.
  eq(P.pawnsLocked(board('K:e1 P:d4 k:e8 p:d5 n:c5')), true, 'a capture does not unlock a blocked pawn');
  eq(P.pawnsLocked(board('K:e1 P:d4 P:a3 k:e8 p:d5')), false, 'a pawn with a free square ahead is not locked');
  eq(P.canRequestBoardCount(locked, null), false, 'not the ordinary board count while pawns are left');
  // A pawn that could still move: only after QUIET_PLIES plies without a pawn move or capture.
  const free = board('K:h1 k:a8 n:d3 b:e2 p:g5');
  eq(P.pawnsLocked(free), false, 'a free pawn is not locked');
  eq(P.canRequestSpecialCount(free, null, P.QUIET_PLIES - 1), false, 'the shape still changed recently');
  eq(P.canRequestSpecialCount(free, null, P.QUIET_PLIES), true, 'the shape has not changed for 5 moves each');
  eq(P.canRequestSpecialCount(board('K:e1 R:a1 k:e8 r:h8'), null, 20), false, 'no pawns: the ordinary board count instead');
  // White's lone king asks (the red pawn on ช4 is never promoted): white says 1 on its move, up to 64, then draw.
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
  // Both sides had pieces: a capture that leaves a lone king switches to the piece count.
  s = P.nextCount(P.requestSpecialCount('white', locked), locked, 'white');
  s = P.nextCount(s, board('K:e1 k:e8 n:a1 p:d5'), 'black');
  eq([s.kind, s.counter, s.ceiling], ['piece', 'white', 64], 'lone king: switch to the piece count');
  s = P.nextCount(s, board('K:e2 k:e8 n:a1 p:d5'), 'white'); eq(s.value, 5, 'piece count goes on with pawns left'); }

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
  eq(played, ['e3e4', 'd6d5', 'd3d4', 'e6e5', 'g1e2', 'b8d7', 'e1f2', 'd8c7', 'f2e3', 'c7d6', 'f1f2', 'c8c7', 'c1d2', 'f8e7', 'd2d3', 'e7e6', 'b1d2', 'g8e7'], 'opening shape for both sides');
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
