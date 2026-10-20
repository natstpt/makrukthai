'use strict';
// The nine grades of วิเคราะห์การเดิน and the accuracy (review-grades.js).
const assert = require('node:assert/strict');
const R = require('../makruk-rules.js');
const G = require('../review-grades.js');

const KIND = { K: 'king', R: 'rook', B: 'khon', N: 'knight', M: 'met', F: 'promoted', P: 'pawn' };
const at = sq => ({ r: 8 - Number(sq[1]), c: 'abcdefgh'.indexOf(sq[0]) });
const board = text => text.split(' ').map(t => { const [k, sq] = t.split(':'); return { piece: KIND[k.toUpperCase()], side: k === k.toUpperCase() ? 'white' : 'black', at: at(sq) }; });
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const grade = (before, after, more) => G.classify(Object.assign({ before, after, second: null, sacrifice: false, prevLoss: 0 }, more));

// The order and names the summary shows.
eq(G.KINDS, ['brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder'], 'nine grades');
eq(G.KINDS.map(k => G.INFO[k].name), ['แต้มเซียน', 'แต้มเด็ด', 'ดีที่สุด', 'ดีมาก', 'ดี', 'ยังไม่แม่น', 'พลาด', 'พลาดโอกาส', 'พลาดหนัก'], 'Thai names');

// By the chance of winning given away (1 pawn near a level game is about 9%).
eq(grade(50, 50), 'best', 'no loss');
eq(grade(50, 40), 'best', '0.1');
eq(grade(50, 30), 'excellent', 'under 2%');
eq(grade(50, 0), 'good', 'under 5%');
eq(grade(50, -50), 'inaccuracy', 'under 10%');
eq(grade(50, -150), 'mistake', 'under 20%');
eq(grade(300, -100), 'blunder', 'more than 20%');
// The same two pawns cost little in a won game.
eq(grade(900, 700), 'good', 'won game, two pawns');
// Mates: walking into one, letting one go, keeping one, or lost anyway.
eq(grade(0, -9995), 'blunder', 'walks into a mate');
eq(grade(10000 - 3, 200), 'miss', 'a mate let go');
eq(grade(10000 - 3, 1500), 'good', 'a mate let go, still as good as won');
eq(grade(10000 - 3, 10000 - 4), 'best', 'the mate kept');
eq(grade(10000 - 3, 10000 - 10), 'excellent', 'a slower mate');
eq(grade(-10000 + 5, -10000 + 3), 'best', 'lost anyway');
eq(G.mateIn(10000 - 3), 3, 'mate in 3');
eq(G.mateIn(-10000 + 4), -4, 'mated in 4');

// แต้มเด็ด: the only move (the second best gives away 15% or more), not when the game was already won.
eq(grade(40, 40, { second: -150 }), 'great', 'only move');
eq(grade(40, 40, { second: -60 }), 'best', 'others nearly as good');
eq(grade(700, 700, { second: -200 }), 'best', 'already winning');
eq(grade(40, 40, { second: null }), 'best', 'no second move');
// แต้มเซียน: the best move offering a piece the engine would take, the game still level or better.
eq(grade(20, 20, { sacrifice: true, replyTakes: true }), 'brilliant', 'sacrifice taken');
eq(grade(20, 20, { sacrifice: true, replyTakes: null }), 'brilliant', 'sacrifice, reply not known');
eq(grade(20, 20, { sacrifice: true, replyTakes: false }), 'best', 'the engine would not take it');
eq(grade(-200, -200, { sacrifice: true, replyTakes: true }), 'best', 'sacrifice while losing');
eq(grade(20, -60, { sacrifice: true }), 'inaccuracy', 'a sacrifice that gives away 7%');
// พลาดโอกาส: the opponent had just erred, the best move took a piece or mated, and this move let it go.
eq(grade(400, 100, { prevDrop: 20, bestWins: true }), 'miss', 'missed the punishment');
eq(grade(400, 100, { prevDrop: 20, bestWins: false }), 'blunder', 'no shot there, just a big loss');
eq(grade(400, -400, { prevDrop: 20, bestWins: true }), 'blunder', 'and lost the game too');
eq(grade(100, -100, { prevDrop: 2, bestWins: true }), 'mistake', 'no chance before');

eq([G.isTop('great'), G.isTop('excellent'), G.isBad('miss'), G.isBad('inaccuracy')], [true, false, true, false], 'groups');

// Accuracy: 100 for moves that give nothing away; one big blunder among good moves pulls it down clearly.
eq(Math.round(G.moveAccuracy(30, 30)), 100, 'no loss 100');
assert.ok(G.moveAccuracy(0, -100) < G.moveAccuracy(0, -30)); checks++;
assert.ok(G.moveAccuracy(0, -900) < 20); checks++;
eq(G.accuracy([]), null, 'nothing graded');
const calm = Array.from({ length: 20 }, () => ({ before: 20, after: 20 }));
eq(Math.round(G.accuracy(calm)), 100, 'all best');
const oneBlunder = calm.slice(0, 19).concat([{ before: 20, after: -700 }]);
assert.ok(G.accuracy(oneBlunder) < 88, 'one blunder (the plain average would be 95.6): ' + G.accuracy(oneBlunder).toFixed(1)); checks++;
eq(G.winChance(10000 - 2), 100, 'mate is certain');

// A sacrifice: a rook left where a pawn can take it.
const pos = board('K:e1 R:d3 P:a3 k:e8 p:e5');
eq(G.sacrifice(R, pos, at('d3'), at('d4')), true, 'rook to a pawn-attacked square');
eq(G.sacrifice(R, pos, at('d3'), at('d2')), false, 'a safe square');
eq(G.sacrifice(R, pos, at('a3'), at('a4')), false, 'a pawn is never a sacrifice');
// A knight that only a rook can take: offered when nothing takes back, not when a pawn guards it.
eq(G.sacrifice(R, board('K:e1 N:c3 P:e4 k:h8 r:d8'), at('c3'), at('d5')), false, 'guarded knight, dearer taker');
eq(G.sacrifice(R, board('K:e1 N:c3 k:h8 r:d8'), at('c3'), at('d5')), true, 'unguarded knight');

// A เบี้ย that takes and promotes where it can be taken back is not a sacrifice.
eq(G.sacrifice(R, board('K:e1 P:c2 P:d3 k:h8 p:c4'), at('c4'), at('d3')), false, 'promoting pawn');

console.log('review-grades: ' + checks + ' checks passed');
