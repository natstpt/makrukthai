'use strict';
// The AI asks need() → ensure() → need() … until need() says no; for five-piece lone-king positions (KRMMvK,
// KNMMvK …, read from the two-sided tables) need() used to say yes for ever when the old lone-king list had never
// been loaded, and the hard AI thought for ever. Tables are fetched from disk as the browser would.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
global.fetch = async url => {
  const f = path.join(ROOT, url);
  return fs.existsSync(f) ? new Response(fs.readFileSync(f)) : new Response(null, { status: 404 });
};
const T = require('../tablebase.js');
const sq = s => ({ r: 8 - Number(s[1]), c: 'abcdefgh'.indexOf(s[0]) });
const P = (piece, side, at) => ({ piece, side, at: sq(at) });
const cases = [
  { name: 'red KRMM (promoted pawn) v K, red to move', stm: 'black', ps: [P('king', 'white', 'b2'), P('king', 'black', 'c5'), P('met', 'black', 'd6'), P('rook', 'black', 'd3'), P('promoted', 'black', 'b3')] },
  { name: 'white KNMM (two promoted pawns) v K, white to move', stm: 'white', ps: [P('king', 'white', 'd5'), P('knight', 'white', 'g4'), P('promoted', 'white', 'h6'), P('promoted', 'white', 'e6'), P('king', 'black', 'd8')] },
];
(async () => {
  for (const c of cases) {
    let rounds = 0;
    while (T.need(c.ps, false, c.stm)) { assert(++rounds <= 3, c.name + ': still needs tables after ' + rounds + ' loads'); await T.ensure(c.ps, false, c.stm); }
    const best = T.bestMove(c.ps, c.stm);
    assert(best && best.mateIn > 0, c.name + ': a winning table move');
  }
  console.log('Five-piece table positions load once and give the AI its move.');
})().catch(e => { console.error(e); process.exit(1); });
