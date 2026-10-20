'use strict';
// King, khon and promoted pawn against king and promoted pawn on the website (tablebase/rs/KSMvKM, with KSvKM and
// KMvKM for a piece taken; from makruk-tb export): with white or red as the side with two pieces and either side to
// move, sampled positions agree with their moves one step on, and table play from won positions mates in exactly the
// moves given. Parts are loaded from disk as tablebase.js asks for them (T.wanted), as the page fetches them.
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
const listed = JSON.parse(fs.readFileSync(path.join(dir, 'rs', 'index.json'), 'utf8'));
const names = ['KSMvKM', 'KSvKM', 'KMvKM'];
assert(names.every(n => listed.includes(n)), 'index.json lists them');
const info = {};
for (const name of listed) { info[name] = JSON.parse(fs.readFileSync(path.join(dir, 'rs', name, 'info.json'), 'utf8')); T.useRs(name, info[name], {}); }
function load(ps) {
  for (let round = 0; round < 4; round++) {
    const want = T.wanted(ps).filter(w => !w.pieces && w.part !== null);
    if (!want.length) return;
    for (const w of want) T.useRsPart(w.name, w.part, open(path.join(dir, 'rs', w.name, info[w.name].single ? 'all.bin' : w.part + '.bin')));
  }
}
const KIND = { S: 'khon', M: 'promoted' };
const other = s => s === 'white' ? 'black' : 'white';
let seed = 77;
const rand = n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };
function randomPosition(i) {
  for (;;) {
    const slots = i.white.map(k => ['w', k]).concat(i.black.map(k => ['b', k]));
    const squares = Array.from({ length: slots.length + 2 }, () => rand(64));
    if (new Set(squares).size !== squares.length) continue;
    const at = s => ({ r: s >> 3, c: s & 7 }), swap = rand(2) === 1, col = c => (c === 'w') !== swap ? 'white' : 'black';
    const ps = [{ piece: 'king', side: col('w'), at: at(squares[0]) }, { piece: 'king', side: col('b'), at: at(squares[1]) }];
    slots.forEach(([c, k], j) => ps.push({ piece: KIND[k], side: col(c), at: at(squares[j + 2]) }));
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
for (const [name, samples] of [['KSMvKM', 60], ['KSvKM', 60], ['KMvKM', 40]]) {
  let decided = 0;
  for (let k = 0; k < samples; k++) {
    const { ps, stm } = randomPosition(info[name]);
    load(ps);
    const got = T.result(ps, stm), want = fromMoves(ps, stm);
    assert(got && got.res === want.res && (got.res === 'draw' || got.n === want.n), name + ' ' + stm + ' ' + JSON.stringify(ps) + ': ' + JSON.stringify(got) + ' in the table, ' + JSON.stringify(want) + ' from its moves');
    if (got.res !== 'draw') decided++;
  }
  done.push(name + ' (' + decided + '/' + samples + ' decided)');
}
// Table play: from won KSMvKM positions, both sides playing the table, the mate comes in exactly the moves given.
let played = 0;
for (let k = 0; k < 400 && played < 6; k++) {
  const { ps, stm } = randomPosition(info.KSMvKM);
  load(ps);
  const start = T.result(ps, stm);
  if (!start || start.res !== 'win' || start.n > 30) continue;
  let pos = ps, turn = stm, moves = 0;
  for (;;) {
    const st = R.gameStatus(pos, turn);
    if (st.state !== 'playing') { assert.equal(st.state, 'checkmate', 'ends in mate'); break; }
    load(pos);
    const b = T.bestMove(pos, turn);
    assert(b, 'a table move for ' + turn);
    if (turn === stm) moves++;
    pos = R.applyMove(pos, b.move.from, b.move.to); turn = other(turn);
  }
  assert.equal(moves, start.n, 'mates in the moves the table gives');
  played++;
}
assert(played >= 3, 'won positions played out');
// The position from the request: ข.ง4 ค.จ4 ง.ง5 against ข.ง6 ง.ง7, white to move: a win.
{
  const at = s => ({ r: 8 - Number(s[1]), c: 'abcdefgh'.indexOf(s[0]) });
  const ps = [{ piece: 'king', side: 'white', at: at('d4') }, { piece: 'khon', side: 'white', at: at('e4') }, { piece: 'promoted', side: 'white', at: at('d5') },
    { piece: 'king', side: 'black', at: at('d6') }, { piece: 'promoted', side: 'black', at: at('d7') }];
  load(ps);
  const r = T.result(ps, 'white');
  assert(r && r.res === 'win', 'white wins: ' + JSON.stringify(r));
  done.push('ข.ง4 ค.จ4 ง.ง5 v ข.ง6 ง.ง7: white mates in ' + r.n);
}
console.log('KSMvKM tables verified: ' + done.join(', ') + ', ' + played + ' played out.');
