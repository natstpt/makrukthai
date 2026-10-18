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

// By what the move gave away (centipawns for the side that moved).
eq(grade(50, 50), 'best', 'no loss');
eq(grade(50, 40), 'best', '0.1');
eq(grade(50, 30), 'excellent', '0.2');
eq(grade(50, 0), 'good', '0.5');
eq(grade(50, -50), 'inaccuracy', '1.0');
eq(grade(50, -150), 'mistake', '2.0');
eq(grade(300, -100), 'blunder', 'more than 3');
eq(grade(0, -320), 'blunder', 'level to lost');
eq(grade(10000 - 3, 200), 'blunder', 'a mate thrown away');
eq(grade(-10000 + 5, -10000 + 3), 'best', 'lost anyway');

// แต้มเด็ด: the only move (the second best at least 1.5 worse), not when the game was already won.
eq(grade(40, 40, { second: -150 }), 'great', 'only move');
eq(grade(40, 40, { second: -60 }), 'best', 'others nearly as good');
eq(grade(700, 700, { second: -200 }), 'best', 'already winning');
eq(grade(40, 40, { second: null }), 'best', 'no second move');
// แต้มเซียน: the best move offering a piece, the game still level or better.
eq(grade(20, 20, { sacrifice: true }), 'brilliant', 'sacrifice');
eq(grade(-200, -200, { sacrifice: true }), 'best', 'sacrifice while losing');
eq(grade(20, -100, { sacrifice: true }), 'inaccuracy', 'a sacrifice that loses 1.2');
// พลาดโอกาส: the opponent had just erred and this move let it go (without losing the game).
eq(grade(400, 100, { prevLoss: 300 }), 'miss', 'missed the punishment');
eq(grade(400, -400, { prevLoss: 300 }), 'blunder', 'and lost the game too');
eq(grade(100, -100, { prevLoss: 50 }), 'mistake', 'no chance before');

eq([G.isTop('great'), G.isTop('excellent'), G.isBad('miss'), G.isBad('inaccuracy')], [true, false, true, false], 'groups');

// Accuracy: 100 for moves that lose nothing, less the more the chance of winning drops.
eq(Math.round(G.moveAccuracy(30, 30)), 100, 'no loss 100');
assert.ok(G.moveAccuracy(0, -100) < G.moveAccuracy(0, -30)); checks++;
assert.ok(G.moveAccuracy(0, -900) < 20); checks++;
eq(G.accuracy([]), null, 'nothing graded');
eq(Math.round(G.accuracy([{ before: 0, after: 0 }, { before: 0, after: 0 }])), 100, 'all best');
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
