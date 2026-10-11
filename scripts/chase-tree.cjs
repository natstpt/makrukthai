'use strict';
// Solution graph for a long chase (ไล่ยาว) from the tablebase: every white move that still mates within the moves
// left is accepted, and the red king answers with the move that delays mate longest. Positions reached by different
// move orders share one node, so the graph is a flat list of strings. Each node lists its accepted white moves,
// fastest mate first, as "e2e4#" (mate) or "e2e4" + red reply "d8c8" + child node index in base 36, joined by commas.
const { build } = require('./tablebase.cjs');

const name = s => 'abcdefgh'[s & 7] + (8 - (s >> 3));
const square = text => (8 - Number(text[1])) * 8 + 'abcdefgh'.indexOf(text[0]);
const centre = s => Math.max(Math.abs((s >> 3) - 3.5), Math.abs((s & 7) - 3.5));

// pieces: [{piece, side, at:{r,c}}] with the two kings and one or two white pieces.
function chaseTree(pieces, budget, cache = new Map()) {
  const at = p => p.at.r * 8 + p.at.c;
  // One table per piece set: keep the white pieces in a fixed order (rook, knight, khon, promoted).
  const ORDER = ['rook', 'knight', 'khon', 'promoted'];
  const white = pieces.filter(p => p.side === 'white' && p.piece !== 'king').sort((a, b) => ORDER.indexOf(a.piece) - ORDER.indexOf(b.piece));
  const start = {
    table: build(white.map(p => p.piece), cache),
    wk: at(pieces.find(p => p.side === 'white' && p.piece === 'king')),
    bk: at(pieces.find(p => p.side === 'black')),
    ps: white.map(at)
  };
  const nodes = [], seen = new Map();
  const reduce = (pos, cap) => cap < 0 ? pos : {
    table: build(pos.table.types.filter((_, j) => j !== cap), cache),
    wk: pos.wk, bk: pos.bk, ps: pos.ps.filter((_, j) => j !== cap)
  };
  const wtm = pos => pos.table.wtm[pos.table.index(pos.wk, pos.bk, pos.ps)];
  function visit(pos, left) {
    const key = pos.table.types.join('+') + ':' + pos.table.index(pos.wk, pos.bk, pos.ps) + ':' + left;
    if (seen.has(key)) return seen.get(key);
    const id = nodes.length, entries = [];
    nodes.push(''); seen.set(key, id);
    const { table, wk, bk, ps } = pos;
    const moves = table.whiteMoves(wk, bk, ps).map(([k, to]) => {
      const next = { table, wk: k < 0 ? to : wk, bk, ps: ps.map((p, j) => j === k ? to : p) };
      return { key: name(k < 0 ? wk : ps[k]) + name(to), next, v: table.btm[table.index(next.wk, next.bk, next.ps)] };
    }).filter(m => m.v && m.v - 1 <= left - 1).sort((a, b) => a.v - b.v);
    for (const { key: moveKey, next, v } of moves) {
      if (v === 1) { entries.push(moveKey + '#'); continue; }
      let best = null;
      for (const [rto, cap] of table.blackMoves(next.wk, next.bk, next.ps)) {
        const after = reduce({ table, wk: next.wk, bk: rto, ps: next.ps }, cap);
        const value = wtm(after);
        const score = value * 100 - centre(rto) * 10 + (cap < 0 ? 0 : -1);
        if (!best || score > best.score) best = { score, value, rto, after };
      }
      entries.push(moveKey + name(bk) + name(best.rto) + visit(best.after, left - 1).toString(36));
    }
    nodes[id] = entries.join(',');
    return id;
  }
  const dtm = wtm(start);
  if (!dtm || dtm > budget) throw new Error('no mate within ' + budget + ' (dtm ' + dtm + ')');
  visit(start, budget);
  return { dtm, nodes };
}

module.exports = { chaseTree, square, name };
