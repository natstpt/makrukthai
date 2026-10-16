'use strict';
// Builds the endgame tables for a king with one or two pieces against a lone king, for every mix of rook (เรือ),
// knight (ม้า), khon (โคน) and met/promoted pawn (เม็ด/เบี้ยหงาย, which move alike) that the rook tables
// (krk.bin, krrk.bin) do not cover. The retrograde analysis is scripts/tablebase.cjs (the strong side as white, its
// khon stepping forward towards rank 8); each table keeps, for the strong side to move, how many of its moves the
// fastest mate takes against the best defence (0: no forced mate).
// Squares are r*8+c as in makruk-rules.js (r 0 = rank 8). The table keeps the strong king on files ก–ง (c < 4); a
// position with it on จ–ญ is mirrored left–right first (every piece moves the same in a mirror). Layout, one byte each:
//   value[((r*4 + c of the strong king) * 64 + loneKing) * 64 + piece1 (* 64 + piece2)]
// with the pieces in the order of the file name, then compressed with deflate (the browser opens it with
// DecompressionStream). tablebase.js reads them.
// Run: node scripts/build-endgame-tables.cjs [name ...]   (names as in TABLES, e.g. rook-khon; default: all)
// MAKRUK_TABLEBASE_DIR=<dir> keeps the raw tables between runs (scripts/tablebase.cjs).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { build } = require('./tablebase.cjs');

const ORDER = ['rook', 'knight', 'khon', 'promoted'];
const TABLES = [['knight'], ['khon'], ['promoted'],
  ['rook', 'knight'], ['rook', 'khon'], ['rook', 'promoted'],
  ['knight', 'knight'], ['knight', 'khon'], ['knight', 'promoted'],
  ['khon', 'khon'], ['khon', 'promoted'], ['promoted', 'promoted']];
const nameOf = types => types.join('-');

// The strong side's table, folded to the strong king on files ก–ง.
function fold(tb, n) {
  const rest = 64 ** (1 + n), out = new Uint8Array(32 * rest);
  for (let h = 0; h < 32; h++) {
    const wk = (h >> 2) * 8 + (h & 3);
    out.set(tb.wtm.subarray(wk * rest, (wk + 1) * rest), h * rest);
  }
  return out;
}

function main(names) {
  const cache = new Map(), dir = path.join(__dirname, '..', 'tablebase');
  for (const types of TABLES) {
    const name = nameOf(types);
    if (names.length && !names.includes(name)) continue;
    const t = Date.now(), bytes = fold(build(types, cache), types.length);
    let won = 0, longest = 0;
    for (const v of bytes) if (v) { won++; if (v > longest) longest = v; }
    const packed = zlib.deflateRawSync(bytes, { level: 9 });
    fs.writeFileSync(path.join(dir, name + '.bin'), packed);
    console.log(name + ': ' + won + ' winning positions, longest mate ' + longest + ' moves, ' + bytes.length + ' bytes → ' + packed.length + ' compressed, ' + ((Date.now() - t) / 1000).toFixed(1) + ' s.');
  }
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { TABLES, ORDER, nameOf, fold };
