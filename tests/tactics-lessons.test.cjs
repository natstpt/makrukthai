'use strict';
// Tactics chapter (tactics-lessons.js): tactic-trees.js matches a fresh build, every move in it is legal, every
// solved "win" line really wins the material asked for, and every position is a sensible board.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../makruk-rules.js');
const B = require('../scripts/build-tactic-trees.cjs');

const root = path.join(__dirname, '..'), ctx = { window: {} };
vm.createContext(ctx);
for (const file of ['tactics-lessons.js', 'tactic-trees.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx);
const plain = v => JSON.parse(JSON.stringify(v));
const lessons = plain(ctx.window.buildTacticsLessons()), trees = plain(ctx.window.MakrukTacticTrees);
const key = m => 'abcdefgh'[m.from.c] + (8 - m.from.r) + 'abcdefgh'[m.to.c] + (8 - m.to.r);
const find = (ps, side, k) => R.legalMoves(ps, side).find(m => key(m) === k);

assert.deepEqual(lessons.map(l => l.id), ['tactic-center', 'tactic-develop', 'tactic-king-safety', 'tactic-fork', 'tactic-pin', 'tactic-skewer', 'tactic-trapped', 'tactic-discovered']);
assert.deepEqual(trees, plain(B.build()), 'tactic-trees.js is up to date (node scripts/build-tactic-trees.cjs)');

// A board must have one king a side and kings apart; a task also starts with red not in check (teaching boards may
// show a check on purpose).
function sensible(ps, label, task) {
  for (const side of ['white', 'black']) assert.equal(ps.filter(p => p.side === side && p.piece === 'king').length, 1, label + ': one ' + side + ' king');
  const [a, b] = ['white', 'black'].map(s => ps.find(p => p.side === s && p.piece === 'king').at);
  assert(Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c)) > 1, label + ': kings apart');
  if (task) assert(!R.inCheck(ps, 'black'), label + ': red is not in check');
  const keys = ps.map(p => p.at.r + ',' + p.at.c);
  assert.equal(new Set(keys).size, keys.length, label + ': one piece a square');
  assert(!ps.some(p => p.piece === 'pawn' && (p.side === 'white' ? p.at.r >= 6 || p.at.r <= 2 : p.at.r <= 1 || p.at.r >= 5)), label + ': pawns on squares they can reach unpromoted');
}

let tasks = 0, lines = 0;
for (const l of lessons) {
  assert(l.teachingBoards.length >= 3, l.id + ': at least three teaching boards');
  l.teachingBoards.forEach((s, i) => sensible(s.pieces, l.id + ' board ' + (i + 1)));
  assert(l.games.length >= 2 && l.requiredCorrect === l.games.length, l.id + ': two or more tasks, all required');
  for (const t of l.games) {
    const label = l.id + ' ' + t.key, tree = trees[t.key];
    sensible(t.pieces, label, true);
    assert(!R.inCheck(t.pieces, 'white'), label + ': white is not in check');
    assert(t.success && t.wrong, label + ': success and wrong-move texts');
    const legal = R.legalMoves(t.pieces, 'white').map(key);
    assert(Object.keys(tree).length < legal.length, label + ': some moves are wrong');
    const walk = (ps, node, left) => {
      for (const [mv, child] of Object.entries(node)) {
        const m = find(ps, 'white', mv);
        assert(m, label + ': ' + mv + ' is legal');
        const after = R.applyMove(ps, m.from, m.to);
        if (child === '#') { assert.equal(R.gameStatus(after, 'black').state, 'checkmate', label + ': ' + mv + ' mates'); lines++; continue; }
        if (child === '!') {
          if (t.kind === 'win') assert(B.gainSince(t.pieces, after) >= t.gain, label + ': ' + mv + ' wins ' + t.gain);
          lines++; continue;
        }
        assert(t.kind === 'win' && left > 1, label + ': lines stay within ' + t.moves + ' moves');
        const r = find(after, 'black', child.r);
        assert(r, label + ': red reply ' + child.r + ' is legal');
        walk(R.applyMove(after, r.from, r.to), child.n, left - 1);
      }
    };
    walk(t.pieces, tree, t.moves);
    tasks++;
  }
}
console.log('Tactics verified: ' + lessons.length + ' lessons, ' + tasks + ' tasks, ' + lines + ' solved lines.');
