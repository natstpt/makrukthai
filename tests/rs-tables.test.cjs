'use strict';
// Tables with pieces on both sides for the website (tablebase/rs/, written by tools/makruk-tb export, read by
// tablebase.js): with either side to move, sampled positions agree with their moves one step on (red to move worked
// out by the page, captures into the smaller tables, the lone-king ones included), and table play from won positions
// mates in exactly the moves given; bestMove leaves drawn positions to the engine.
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
// The tables with pieces on both sides, and KRMMvK (the five-piece lone-king ones have tests/rs5-tables.test.cjs).
const names = ['KMMvKR', 'KRMMvK', 'KRMvKR', 'KRvKM', 'KRvKR'];
const listed = JSON.parse(fs.readFileSync(path.join(dir, 'rs', 'index.json'), 'utf8'));
assert(names.every(n => listed.includes(n)), 'index.json lists them');
const info = {};
for (const name of names) {
  const i = JSON.parse(fs.readFileSync(path.join(dir, 'rs', name, 'info.json'), 'utf8')), parts = {};
  if (i.single) parts[0] = open(path.join(dir, 'rs', name, 'all.bin'));
  else for (let k = 0; k < i.positions / i.part; k++) if (!i.zero.includes(k)) parts[k] = open(path.join(dir, 'rs', name, k + '.bin'));
  T.useRs(name, i, parts);
  info[name] = i;
}

const KIND = { R: 'rook', N: 'knight', S: 'khon', M: 'met' };
const other = s => s === 'white' ? 'black' : 'white';
let seed = 77;
const rand = n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };
function randomPosition(i) {
  const slots = i.white.map(k => ['white', k]).concat(i.black.map(k => ['black', k]));
  for (;;) {
    const squares = Array.from({ length: slots.length + 2 }, () => rand(64));
    if (new Set(squares).size !== squares.length) continue;
    const at = s => ({ r: s >> 3, c: s & 7 });
    // Either colour can hold the table's "white" pieces.
    const swap = rand(2) === 1, col = c => swap ? other(c) : c;
    const ps = [{ piece: 'king', side: 'white', at: at(squares[0]) }, { piece: 'king', side: 'black', at: at(squares[1]) }];
    slots.forEach(([c, k], j) => ps.push({ piece: KIND[k], side: col(c), at: at(squares[j + 2]) }));
    if (Math.max(Math.abs(ps[0].at.r - ps[1].at.r), Math.abs(ps[0].at.c - ps[1].at.c)) <= 1) continue;
    const stm = rand(2) ? 'white' : 'black';
    if (R.inCheck(ps, other(stm))) continue;
    return { ps, stm };
  }
}
const same = (a, b) => a.res === b.res && (a.res === 'draw' || a.n === b.n);
function fromMoves(ps, stm) {
  const st = R.gameStatus(ps, stm);
  if (st.state === 'checkmate') return { res: 'loss', n: 0 };
  if (st.state !== 'playing') return { res: 'draw', n: 0 };
  let win = Infinity, worst = 0, held = false;
  for (const m of R.legalMoves(ps, stm)) {
    const r = T.result(R.applyMove(ps, m.from, m.to), other(stm));
    assert(r, 'every move is covered by a table');
    if (r.res === 'loss') win = Math.min(win, r.n + 1); else if (r.res === 'win') worst = Math.max(worst, r.n); else held = true;
  }
  return win < Infinity ? { res: 'win', n: Math.min(win, 125) } : held ? { res: 'draw', n: 0 } : { res: 'loss', n: Math.min(worst, 125) };
}
const summary = [];
for (const name of names) {
  let wins = 0, losses = 0, played = 0, draws = 0;
  for (let i = 0; i < 1500; i++) {
    const { ps, stm } = randomPosition(info[name]), got = T.result(ps, stm), want = fromMoves(ps, stm);
    assert(got && same(got, want), name + ' ' + stm + ' ' + JSON.stringify(ps) + ': ' + JSON.stringify(got) + ' in the table, ' + JSON.stringify(want) + ' from its moves');
    if (got.res === 'draw') { draws++; if (draws < 5) assert.equal(T.bestMove(ps, stm), null, name + ': a drawn position is left to the engine'); continue; }
    if (got.res === 'loss') { losses++; continue; }
    wins++;
    if (played >= 25) continue;
    let pos = ps, turn = stm, moves = 0;
    for (;;) {
      const st = R.gameStatus(pos, turn);
      if (st.state !== 'playing') { assert.equal(st.state, 'checkmate', name + ' ends in mate'); assert.equal(turn, other(stm), name + ': the winner mates'); break; }
      const b = T.bestMove(pos, turn);
      assert(b, name + ': a table move for ' + turn + ' in ' + JSON.stringify(pos));
      if (turn === stm) moves++;
      pos = R.applyMove(pos, b.move.from, b.move.to); turn = other(turn);
    }
    assert.equal(moves, got.n, name + ': mates in the moves the table gives');
    played++;
  }
  summary.push(name + ' (' + wins + ' wins, ' + losses + ' losses, ' + played + ' played out)');
}
// outcomes() for the game page: one row per move, with the mover's result.
{
  const ps = [{ piece: 'king', side: 'white', at: { r: 7, c: 0 } }, { piece: 'rook', side: 'white', at: { r: 6, c: 7 } },
    { piece: 'king', side: 'black', at: { r: 0, c: 4 } }, { piece: 'rook', side: 'black', at: { r: 1, c: 0 } }];
  const o = T.outcomes(ps, 'white');
  assert(o && o.two && o.moves.length === R.legalMoves(ps, 'white').length, 'outcomes lists every move');
  assert(o.moves.every(x => ['win', 'loss', 'draw'].includes(x.res)));
}
console.log('Two-sided tables verified: ' + summary.join(', ') + '.');
