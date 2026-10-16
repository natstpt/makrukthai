'use strict';
// The five-piece "three pieces against a lone king" tables on the website (tablebase/rs/K…vK, from makruk-tb export):
// with white or red as the strong side and either side to move, sampled positions agree with their moves one step on
// (red to move worked out by the page, a captured piece going on in the two-piece tables). The parts a position needs
// are loaded from disk as tablebase.js asks for them (T.wanted), so the test does not hold whole tables in memory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const R = require('../makruk-rules.js');
const T = require('../tablebase.js');

const dir = path.join(__dirname, '..', 'tablebase');
const open = f => new Uint8Array(zlib.inflateRawSync(fs.readFileSync(f)));
T.use(new Uint8Array(fs.readFileSync(path.join(dir, 'krk.bin'))), open(path.join(dir, 'krrk.bin')));
for (const name of T.NAMES) T.useTable(name, open(path.join(dir, name + '.bin')));
const all = JSON.parse(fs.readFileSync(path.join(dir, 'rs', 'index.json'), 'utf8'));
const names = all.filter(n => /^K[RNSM]{3}vK$/.test(n));
const info = {};
for (const name of all) { info[name] = JSON.parse(fs.readFileSync(path.join(dir, 'rs', name, 'info.json'), 'utf8')); T.useRs(name, info[name], {}); }
// Load what the position needs (a few rounds: a part's position may lead to another table's part).
function load(ps) {
  for (let round = 0; round < 4; round++) {
    const want = T.wanted(ps).filter(w => !w.pieces && w.part !== null);
    if (!want.length) return;
    for (const w of want) T.useRsPart(w.name, w.part, open(path.join(dir, 'rs', w.name, info[w.name].single ? 'all.bin' : w.part + '.bin')));
  }
}
const KIND = { R: 'rook', N: 'knight', S: 'khon', M: 'met' };
const other = s => s === 'white' ? 'black' : 'white';
let seed = 31;
const rand = n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };
function randomPosition(i) {
  for (;;) {
    const squares = Array.from({ length: 5 }, () => rand(64));
    if (new Set(squares).size !== 5) continue;
    const at = s => ({ r: s >> 3, c: s & 7 }), strong = rand(2) ? 'white' : 'black';
    const ps = [{ piece: 'king', side: strong, at: at(squares[0]) }, { piece: 'king', side: other(strong), at: at(squares[1]) }];
    i.white.forEach((k, j) => ps.push({ piece: KIND[k], side: strong, at: at(squares[j + 2]) }));
    if (Math.max(Math.abs(ps[0].at.r - ps[1].at.r), Math.abs(ps[0].at.c - ps[1].at.c)) <= 1) continue;
    const stm = rand(2) ? 'white' : 'black';
    if (R.inCheck(ps, other(stm))) continue;
    return { ps, stm };
  }
}
function fromMoves(ps, stm) {
  const st = R.gameStatus(ps, stm);
  if (st.state === 'checkmate') return { res: 'loss', n: 0 };
  if (st.state !== 'playing') return { res: 'draw', n: 0 };
  let win = Infinity, worst = 0, held = false;
  for (const m of R.legalMoves(ps, stm)) {
    const after = R.applyMove(ps, m.from, m.to);
    load(after);
    const r = T.result(after, other(stm));
    assert(r, 'every move is covered');
    if (r.res === 'loss') win = Math.min(win, r.n + 1); else if (r.res === 'win') worst = Math.max(worst, r.n); else held = true;
  }
  return win < Infinity ? { res: 'win', n: Math.min(win, 125) } : held ? { res: 'draw', n: 0 } : { res: 'loss', n: Math.min(worst, 125) };
}
const done = [];
for (const name of names) {
  let wins = 0;
  for (let k = 0; k < 40; k++) {
    const { ps, stm } = randomPosition(info[name]);
    load(ps);
    const got = T.result(ps, stm), want = fromMoves(ps, stm);
    assert(got && got.res === want.res && (got.res === 'draw' || got.n === want.n), name + ' ' + stm + ' ' + JSON.stringify(ps) + ': ' + JSON.stringify(got) + ' in the table, ' + JSON.stringify(want) + ' from its moves');
    if (got.res !== 'draw') wins++;
  }
  T.useRs(name, info[name], {}); // let the parts go
  done.push(name + ' (' + wins + '/40 decided)');
}
assert(names.length >= 1, 'three-piece tables are there');
console.log('Five-piece lone-king tables verified: ' + done.join(', ') + '.');
