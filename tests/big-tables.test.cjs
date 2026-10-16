'use strict';
// Bigger endgame tables (scripts/build-big-tables.cjs, read by tablebase.js):
// - the builder agrees, position for position, with tables built before by scripts/build-endgame-tables.cjs;
// - a table in its chunked format reads correctly in tablebase.js (white or red strong, one move on from the rules),
//   and table play mates in exactly the moves it gives;
// - every table already in tablebase/big.json (built on your own computer) passes the same sampled checks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const R = require('../makruk-rules.js');
const T = require('../tablebase.js');
const B = require('../scripts/build-big-tables.cjs');

const root = path.join(__dirname, '..'), dir = path.join(root, 'tablebase');
const open = f => new Uint8Array(zlib.inflateRawSync(fs.readFileSync(f)));
T.use(new Uint8Array(fs.readFileSync(path.join(dir, 'krk.bin'))), open(path.join(dir, 'krrk.bin')));
for (const name of T.NAMES) T.useTable(name, open(path.join(dir, name + '.bin')));

const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'makruk-big-')), quiet = () => {};
// The builder against the old tables: a rook line piece and a khon (the 2-symmetry layout, the khon's direction).
const agreed = B.check('rook-promoted', cache, quiet) + B.check('khon', cache, quiet);
assert(agreed > 6000000, 'the builder agrees with the old tables');

const loadBig = from => {
  const info = JSON.parse(fs.readFileSync(path.join(from, 'info.json'), 'utf8')), chunks = {};
  info.kings.forEach((_, k) => { chunks[k] = open(path.join(from, k + '.bin')); });
  return { info, chunks };
};
// rook-promoted written in the big format, then read through tablebase.js's big path.
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'makruk-big-out-'));
B.write(B.tableFor('rook-promoted', cache, quiet), out);
const sample = loadBig(path.join(out, 'rook-promoted'));
assert.equal(sample.info.symmetry, 8);
T.useBig('rook-promoted', sample.info, sample.chunks);

const other = s => s === 'white' ? 'black' : 'white';
let seed = 5;
const rand = n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };
const sq = i => ({ r: i >> 3, c: i & 7 });
function randomPosition(name) {
  const types = name.split('-');
  for (;;) {
    const squares = Array.from({ length: types.length + 2 }, () => rand(64));
    if (new Set(squares).size !== squares.length) continue;
    const side = rand(2) ? 'white' : 'black';
    const ps = [{ piece: 'king', side, at: sq(squares[0]) }, { piece: 'king', side: other(side), at: sq(squares[1]) }];
    types.forEach((t, k) => ps.push({ piece: t, side, at: sq(squares[k + 2]) }));
    if (Math.max(Math.abs(ps[0].at.r - ps[1].at.r), Math.abs(ps[0].at.c - ps[1].at.c)) <= 1 || R.inCheck(ps, other(side))) continue;
    return { ps, side };
  }
}
function loneLeft(ps, lone) {
  const st = R.gameStatus(ps, lone);
  if (st.state === 'checkmate') return 0;
  if (st.state !== 'playing') return Infinity;
  return Math.max(...R.legalMoves(ps, lone).map(m => T.value(R.applyMove(ps, m.from, m.to))));
}
function verify(name, count) {
  let wins = 0, played = 0;
  for (let i = 0; i < count; i++) {
    const { ps, side } = randomPosition(name), v = T.value(ps);
    const best = Math.min(...R.legalMoves(ps, side).map(m => loneLeft(R.applyMove(ps, m.from, m.to), other(side))));
    assert.equal(v, best === Infinity ? Infinity : best + 1, name + ' ' + side + ' ' + JSON.stringify(ps));
    if (v === Infinity) continue;
    wins++;
    if (played >= 20) continue;
    let pos = ps, turn = side, moves = 0;
    for (;;) {
      const st = R.gameStatus(pos, turn);
      if (st.state !== 'playing') { assert.equal(st.state, 'checkmate', name + ' ends in mate'); break; }
      const b = T.bestMove(pos, turn);
      assert(b, name + ': a table move for ' + turn);
      if (turn === side) moves++;
      pos = R.applyMove(pos, b.move.from, b.move.to); turn = other(turn);
    }
    assert.equal(moves, v, name + ': mates in the moves the table gives');
    played++;
  }
  return { wins, played };
}
const small = verify('rook-promoted', 400);
assert(small.wins > 100 && small.played === 20, 'rook-promoted read from the big format');

// Tables you built (tablebase/big.json).
const listFile = path.join(dir, 'big.json'), built = fs.existsSync(listFile) ? JSON.parse(fs.readFileSync(listFile, 'utf8')) : [];
const done = [];
for (const name of built) {
  const t = loadBig(path.join(dir, name));
  T.useBig(name, t.info, t.chunks);
  const r = verify(name, 150);
  done.push(name + ' (' + r.wins + ' wins sampled)');
}
fs.rmSync(cache, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true });
console.log('Big tables verified: builder agrees on ' + agreed.toLocaleString('en') + ' positions; big format read back (' + small.wins + ' wins sampled, ' + small.played + ' played out)' + (done.length ? '; built: ' + done.join(', ') : '; no big tables built yet (tablebase/big.json)') + '.');
