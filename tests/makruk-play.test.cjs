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
c = P.nextCount(c, pieces, 'white'); eq(c.draw, true, 'white used its last move without mate: draw');
// A capture never restarts the piece count.
c = P.nextCount(null, board('K:e1 R:a1 R:h1 k:e8'), 'white'); c = P.nextCount(c, board('K:e1 R:a1 R:h1 k:e8'), 'black');
c = P.nextCount(c, board('K:e1 R:a1 k:h1'), 'black');
eq([c.value, c.ceiling], [6, 8], 'after the king takes a rook the count and ceiling carry on');

// Board count: both sides still have pieces. The side to move says 1 on its next move; at 64 the game is drawn.
pieces = board('K:e1 R:a1 k:e8 r:h8'); c = P.nextCount(null, pieces, 'black');
eq([c.kind, c.counter, c.value], ['board', 'white', null], 'board count starts with the side to move');
for (let n = 1; n <= 63; n++) { c = P.nextCount(c, pieces, 'white'); c = P.nextCount(c, pieces, 'black'); }
eq([c.value, c.draw], [63, false], 'still playing at 63');
c = P.nextCount(c, pieces, 'white'); eq([c.value, c.draw], [64, true], 'count 64: draw');
// A capture that leaves a lone king switches to the piece count.
c = P.nextCount(null, pieces, 'black'); c = P.nextCount(c, pieces, 'white');
c = P.nextCount(c, board('K:e1 R:h8 k:e8'), 'white');
eq([c.kind, c.counter, c.value, c.ceiling], ['piece', 'black', null, 16], 'lone king: switch to the piece count');
// No counting while unpromoted pawns are on the board.
eq(P.nextCount(null, board('K:e1 R:a1 P:c3 k:e8'), 'white'), null, 'no count with pawns');

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
// Moves the rook away from an attack instead of leaving it to a knight.
const saved = key(P.chooseMove(board('K:a1 R:d4 P:h3 k:h8 n:f5'), 'white', { random: fixed }));
assert(!R.isAttacked(R.applyMove(board('K:a1 R:d4 P:h3 k:h8 n:f5'), at(saved.slice(0, 2)), at(saved.slice(2))), at(saved.slice(2)), 'black'), 'rook moves to a safe square, played ' + saved); checks++;

// Whole games: the computer plays both sides with counting; every game ends (mate or a draw) within the count limits.
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const endings = {};
for (let g = 0; g < 3; g++) {
  let ps = M.initial().pieces, side = 'white', cnt = P.nextCount(null, ps, 'black'), state = 'playing', plies = 0;
  while (plies < 1200) {
    const move = P.chooseMove(ps, side, { random: rnd, count: cnt });
    assert(R.legalMoves(ps, side).some(m => key(m) === key(move)), 'legal computer move');
    ps = R.applyMove(ps, move.from, move.to); cnt = P.nextCount(cnt, ps, side); side = side === 'white' ? 'black' : 'white'; plies++;
    state = R.gameStatus(ps, side).state;
    if (state === 'playing' && cnt && cnt.draw) state = 'count draw';
    if (state !== 'playing') break;
  }
  assert.notEqual(state, 'playing', 'game ' + g + ' ends'); checks++;
  endings[state] = (endings[state] || 0) + 1;
}
console.log('Play verified: ' + checks + ' checks; computer games ended: ' + JSON.stringify(endings));
