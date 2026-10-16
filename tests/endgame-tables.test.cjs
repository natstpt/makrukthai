'use strict';
// Endgame tables for a king with one or two of knight, khon, met/promoted pawn (and rook with one of them) against a
// lone king (tablebase/<pieces>.bin, scripts/build-endgame-tables.cjs, read by tablebase.js): on sampled positions,
// with white or red as the strong side, each table agrees with the makruk rules one move on, a met reads like a
// promoted pawn, and table play mates in exactly the moves it gives.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const R = require('../makruk-rules.js');
const T = require('../tablebase.js');
const B = require('../scripts/build-endgame-tables.cjs');

const dir = path.join(__dirname, '..', 'tablebase');
const open = f => new Uint8Array(zlib.inflateRawSync(fs.readFileSync(path.join(dir, f))));
T.use(new Uint8Array(fs.readFileSync(path.join(dir, 'krk.bin'))), open('krrk.bin'));
assert.deepEqual(B.TABLES.map(B.nameOf), T.NAMES, 'tablebase.js knows every table');
const sizes = {};
for (const name of T.NAMES) {
  const bytes = open(name + '.bin'), n = name.split('-').length;
  assert.equal(bytes.length, 32 * 64 ** (1 + n), name + ': one byte per position');
  T.useTable(name, bytes);
  sizes[name] = fs.statSync(path.join(dir, name + '.bin')).size;
}

const other = s => s === 'white' ? 'black' : 'white';
let seed = 11;
const rand = n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };
const sq = i => ({ r: i >> 3, c: i & 7 });
// A legal position for table `name` with its strong side (white or red) to move.
function randomPosition(name) {
  const types = name.split('-');
  for (;;) {
    const squares = Array.from({ length: types.length + 2 }, () => rand(64));
    if (new Set(squares).size !== squares.length) continue;
    const side = rand(2) ? 'white' : 'black';
    const ps = [{ piece: 'king', side, at: sq(squares[0]) }, { piece: 'king', side: other(side), at: sq(squares[1]) }];
    types.forEach((t, k) => ps.push({ piece: t, side, at: sq(squares[k + 2]) }));
    if (Math.max(Math.abs(ps[0].at.r - ps[1].at.r), Math.abs(ps[0].at.c - ps[1].at.c)) <= 1) continue;
    if (R.inCheck(ps, other(side))) continue;
    return { ps, side };
  }
}
function loneLeft(ps, lone) {
  const st = R.gameStatus(ps, lone);
  if (st.state === 'checkmate') return 0;
  if (st.state !== 'playing') return Infinity;
  return Math.max(...R.legalMoves(ps, lone).map(m => T.value(R.applyMove(ps, m.from, m.to))));
}
let checked = 0, wins = 0;
for (const name of T.NAMES) {
  for (let i = 0; i < 400; i++) {
    const { ps, side } = randomPosition(name), v = T.value(ps);
    const best = Math.min(...R.legalMoves(ps, side).map(m => loneLeft(R.applyMove(ps, m.from, m.to), other(side))));
    assert.equal(v, best === Infinity ? Infinity : best + 1, name + ' ' + side + ' ' + JSON.stringify(ps));
    if (v < Infinity) wins++;
    checked++;
  }
}
// A met is read as a promoted pawn: same value.
{
  const ps = [{ piece: 'king', side: 'white', at: { r: 5, c: 2 } }, { piece: 'khon', side: 'white', at: { r: 2, c: 3 } },
    { piece: 'promoted', side: 'white', at: { r: 3, c: 4 } }, { piece: 'king', side: 'black', at: { r: 0, c: 0 } }];
  const met = ps.map(p => p.piece === 'promoted' ? { ...p, piece: 'met' } : p);
  assert.equal(T.value(met), T.value(ps), 'met and promoted pawn share the table');
}
// Table play from both sides mates in exactly the moves the table gives.
let played = 0;
for (const name of ['rook-khon', 'khon-promoted', 'promoted-promoted', 'knight-khon']) {
  for (let i = 0; i < 40; i++) {
    const { ps, side } = randomPosition(name), start = T.value(ps);
    if (start === Infinity) continue;
    let pos = ps, turn = side, moves = 0;
    for (;;) {
      const st = R.gameStatus(pos, turn);
      if (st.state !== 'playing') { assert.equal(st.state, 'checkmate', name + ' ends in mate'); break; }
      const b = T.bestMove(pos, turn);
      assert(b, name + ': a table move for ' + turn);
      if (turn === side) moves++;
      pos = R.applyMove(pos, b.move.from, b.move.to); turn = other(turn);
    }
    assert.equal(moves, start, name + ': mates in the moves the table gives');
    played++;
  }
}
assert(played >= 40, 'enough positions played out');
console.log('Endgame tables verified: ' + T.NAMES.length + ' tables, ' + checked + ' positions (' + wins + ' wins), ' + played + ' played out. Sizes: ' + T.NAMES.map(n => n + ' ' + Math.round(sizes[n] / 1024) + ' KB').join(', '));
