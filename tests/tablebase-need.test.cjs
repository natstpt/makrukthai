'use strict';
// A position the two-sided tables hold (king, knight and two เบี้ยหงาย against a lone king) needs no more loading once
// they are loaded: need() turned false. It stayed true before (an older one-sided table that is never loaded was asked
// for), and the hard AI asked again and again, its bar stuck at 0%.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
global.fetch = async url => {
  const file = path.join(root, url.replace(/^\.?\//, ''));
  if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => { throw Error('404'); } };
  const b = fs.readFileSync(file);
  return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length), json: async () => JSON.parse(b), body: new Blob([b]).stream() };
};
const T = require('../tablebase.js');
const at = s => ({ r: 8 - Number(s[1]), c: 'abcdefgh'.indexOf(s[0]) });
const P = (piece, side, sq) => ({ piece, side, at: at(sq) });
const pieces = [P('king', 'white', 'd5'), P('knight', 'white', 'g4'), P('promoted', 'white', 'h6'), P('promoted', 'white', 'e6'), P('king', 'black', 'd8')];
(async () => {
  await T.load('tablebase/');
  assert.equal(T.need(pieces, false, 'white'), true, 'first: the tables are wanted');
  assert.equal(await T.ensure(pieces, false, 'white'), true, 'they load');
  assert.equal(T.need(pieces, false, 'white'), false, 'then nothing more is needed');
  const best = T.bestMove(pieces, 'white');
  assert.ok(best && best.mateIn > 0, 'and the table gives a mating move');
  console.log('tablebase-need: 4 checks passed (mate in ' + best.mateIn + ')');
})().catch(e => { console.error(e); process.exit(1); });
