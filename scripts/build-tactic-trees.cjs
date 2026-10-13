'use strict';
// Builds tactic-trees.js: for every task of the tactics chapter (tactics-lessons.js), the white moves that solve it
// and red's answer to each. A "win" task is solved when white has won `gain` points of material (after red's best
// capture back, by static exchange) or mated, within `moves` moves, against every red reply; red answers with the
// reply that keeps the most material (preferring a king move when equal). Throws when a task has no solution.
// Run: node scripts/build-tactic-trees.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../makruk-rules.js');
const P = require('../makruk-play.js');

const repo = path.join(__dirname, '..');
const key = m => 'abcdefgh'[m.from.c] + (8 - m.from.r) + 'abcdefgh'[m.to.c] + (8 - m.to.r);
const material = (ps, side) => ps.filter(p => p.side === side).reduce((s, p) => s + P.VALUES[p.piece], 0);
// The most red can win by capturing now (best static exchange on any white piece).
function redGrab(ps) {
  let best = 0;
  for (const p of ps) if (p.side === 'white' && p.piece !== 'king') best = Math.max(best, P.exchange(ps, p.at, 'black', 0));
  return best;
}
// White's material gain since the start, after red's best capture back.
const gainSince = (start, ps) => (material(start, 'black') - material(ps, 'black')) - (material(start, 'white') - material(ps, 'white')) - redGrab(ps);

// The most white wins along a solution tree (a mate counts as 100).
function bestGain(start, ps, node) {
  let best = -Infinity;
  for (const [mv, child] of Object.entries(node)) {
    const m = R.legalMoves(ps, 'white').find(x => key(x) === mv), after = R.applyMove(ps, m.from, m.to);
    if (child === '#') best = Math.max(best, 100);
    else if (child === '!') best = Math.max(best, gainSince(start, after));
    else { const r = R.legalMoves(after, 'black').find(x => key(x) === child.r); best = Math.max(best, bestGain(start, R.applyMove(after, r.from, r.to), child.n)); }
  }
  return best;
}
function winTree(start, ps, left, gain) {
  const node = {};
  for (const m of R.legalMoves(ps, 'white')) {
    const after = R.applyMove(ps, m.from, m.to), status = R.gameStatus(after, 'black');
    if (status.state === 'checkmate') { node[key(m)] = '#'; continue; }
    if (status.state !== 'playing') continue;
    if (gainSince(start, after) >= gain) { node[key(m)] = '!'; continue; }
    if (left <= 1) continue;
    let answer = null, ok = true;
    for (const r of R.legalMoves(after, 'black')) {
      const next = R.applyMove(after, r.from, r.to), child = winTree(start, next, left - 1, gain);
      if (!child) { ok = false; break; }
      // Red loses as little as it can: the least white can still win after this reply.
      const lost = bestGain(start, next, child);
      const king = after.find(p => p.at.r === r.from.r && p.at.c === r.from.c).piece === 'king';
      if (!answer || lost < answer.lost - 1e-9 || (Math.abs(lost - answer.lost) < 1e-9 && king && !answer.king)) answer = { r: key(r), n: child, lost, king };
    }
    if (ok && answer) node[key(m)] = { r: answer.r, n: answer.n };
  }
  return Object.keys(node).length ? node : null;
}
// develop: a knight, khon or met still on the back row moves off it, not to the a or h file.
function developMoves(ps) {
  return R.legalMoves(ps, 'white').filter(m => {
    const p = ps.find(x => x.at.r === m.from.r && x.at.c === m.from.c);
    return ['knight', 'khon', 'met'].includes(p.piece) && m.from.r === 7 && m.to.r < 7 && m.to.c > 0 && m.to.c < 7;
  });
}
// safe: a king move after which red has no checking move.
function safeMoves(ps) {
  return R.legalMoves(ps, 'white').filter(m => {
    const p = ps.find(x => x.at.r === m.from.r && x.at.c === m.from.c);
    if (p.piece !== 'king') return false;
    const after = R.applyMove(ps, m.from, m.to);
    return !R.legalMoves(after, 'black').some(r => R.inCheck(R.applyMove(after, r.from, r.to), 'white'));
  });
}

function build() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repo, 'tactics-lessons.js'), 'utf8'), context);
  const trees = {};
  for (const lesson of context.window.buildTacticsLessons()) for (const task of lesson.games) {
    const ps = JSON.parse(JSON.stringify(task.pieces));
    let tree = null;
    if (task.kind === 'win') tree = winTree(ps, ps, task.moves, task.gain);
    else {
      const legal = R.legalMoves(ps, 'white').map(key);
      const moves = task.kind === 'accept' ? task.accept : (task.kind === 'develop' ? developMoves(ps) : safeMoves(ps)).map(key);
      moves.forEach(m => { if (!legal.includes(m)) throw new Error(task.key + ': ' + m + ' is not legal'); });
      if (moves.length && moves.length < legal.length) tree = Object.fromEntries(moves.map(m => [m, '!']));
    }
    if (!tree) throw new Error(task.key + ': no solution (or every move solves it)');
    trees[task.key] = tree;
  }
  return trees;
}

if (require.main === module) {
  const trees = build();
  const out = '/* Generated by scripts/build-tactic-trees.cjs — do not edit by hand.\n' +
    '   For each tactics task: the white moves that solve it → red reply (r) and the next node (n); "!" solved, "#" mate. */\n' +
    '(function(root){root.MakrukTacticTrees=' + JSON.stringify(trees) + ';})(typeof window===\'object\'?window:globalThis);\n';
  fs.writeFileSync(path.join(repo, 'tactic-trees.js'), out);
  for (const [k, t] of Object.entries(trees)) console.log(k.padEnd(20), JSON.stringify(t).slice(0, 150));
}
module.exports = { build, winTree, developMoves, safeMoves, gainSince };
