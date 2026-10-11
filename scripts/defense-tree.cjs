'use strict';
// Solution graph for playing the red king (เป็นฝ่ายหนี). The learner moves the red king; white answers from the
// tablebase with its fastest mate (or, when it cannot win, the move that leaves red the fewest safe replies).
// mode 'count': red survives while white cannot mate before the count runs out (white moves left < mate distance).
// mode 'fortress': red must keep the position a draw (white has no forced mate at all).
// Nodes use the chase-tree format: "e5e4" + white reply "d1d2" + next node (base 36), or "e5e4!" when red has survived.
const { build } = require('./tablebase.cjs');

const name = s => 'abcdefgh'[s & 7] + (8 - (s >> 3));
const ORDER = ['rook', 'knight', 'khon', 'promoted'];

function defenseTree(pieces, mode, whiteMoves, cache = new Map()) {
  const at = p => p.at.r * 8 + p.at.c;
  const white = pieces.filter(p => p.side === 'white' && p.piece !== 'king').sort((a, b) => ORDER.indexOf(a.piece) - ORDER.indexOf(b.piece));
  const start = {
    table: build(white.map(p => p.piece), cache),
    wk: at(pieces.find(p => p.side === 'white' && p.piece === 'king')),
    bk: at(pieces.find(p => p.side === 'black')),
    ps: white.map(at)
  };
  const reduce = (pos, cap) => cap < 0 ? pos : {
    table: build(pos.table.types.filter((_, j) => j !== cap), cache),
    wk: pos.wk, bk: pos.bk, ps: pos.ps.filter((_, j) => j !== cap)
  };
  const wtm = pos => pos.table.types.length ? pos.table.wtm[pos.table.index(pos.wk, pos.bk, pos.ps)] : 0;
  const btm = pos => pos.table.btm[pos.table.index(pos.wk, pos.bk, pos.ps)];
  const survives = (d, left) => d === 0 || (mode === 'count' && d > left);
  // Red moves from a red-to-move position, with the white-to-move position each one leads to.
  const redMoves = pos => pos.table.blackMoves(pos.wk, pos.bk, pos.ps).map(([to, cap]) => ({ key: name(pos.bk) + name(to), after: reduce({ ...pos, bk: to }, cap) }));
  const safeCount = (pos, left) => redMoves(pos).filter(m => survives(wtm(m.after), left)).length;
  const nodes = [], seen = new Map();
  function visit(pos, left) {
    const key = pos.table.types.join('+') + ':' + pos.table.index(pos.wk, pos.bk, pos.ps) + ':' + left;
    if (seen.has(key)) return seen.get(key);
    const id = nodes.length, entries = [];
    nodes.push(''); seen.set(key, id);
    for (const { key: moveKey, after } of redMoves(pos)) {
      const d = wtm(after);
      if (!survives(d, left)) continue;
      if (left === 0 || !after.table.types.length) { entries.push(moveKey + '!'); continue; }
      // White's reply: fastest mate when it can still win, otherwise the move that leaves red the fewest safe moves.
      let best = null;
      for (const [k, to] of after.table.whiteMoves(after.wk, after.bk, after.ps)) {
        const next = { table: after.table, wk: k < 0 ? to : after.wk, bk: after.bk, ps: after.ps.map((p, j) => j === k ? to : p) };
        const replies = redMoves(next);
        if (!replies.length) continue; // never stalemate or mate outside the plan
        const v = btm(next), safe = safeCount(next, left - 1);
        if (!safe) continue;
        const hanging = replies.some(r => r.after.table !== next.table) ? 1 : 0;
        const score = (d ? -(v || 999) * 1000 : 0) - safe * 10 - hanging * 100;
        if (!best || score > best.score) best = { score, key: name(k < 0 ? after.wk : after.ps[k]) + name(to), next };
      }
      if (!best) { entries.push(moveKey + '!'); continue; }
      entries.push(moveKey + best.key + visit(best.next, left - 1).toString(36));
    }
    nodes[id] = entries.join(',');
    return id;
  }
  visit(start, whiteMoves);
  return { nodes };
}

module.exports = { defenseTree };
