'use strict';
// Checks the tables in tablebase-local/ (built by tools/makruk-tb) with the site's own rules (makruk-rules.js), which
// share no code with the Rust builder:
//   - sampled positions of every table, with either side to move, agree with their moves one step on (a capture is
//     looked up in the smaller table, with the colours swapped when that table keeps the other side as white);
//   - from sampled won positions, both sides playing from the tables, the winner mates in exactly the moves given.
// Reads each table's <name>.json for how it numbers positions. Run: node scripts/check-local-tables.cjs [names…]
// (default: every table there); MAKRUK_SAMPLES=n checks n positions a table (default 3000). Values, one byte with the side to move: 0 draw, 1–127 mates in n, 128+n mated after n.
const fs = require('node:fs');
const path = require('node:path');
const R = require('../makruk-rules.js');

const DIR = path.join(__dirname, '..', 'tablebase-local');
const KIND = { R: 'rook', N: 'knight', S: 'khon', M: 'met' };
const LETTER = { rook: 'R', knight: 'N', khon: 'S', met: 'M', promoted: 'M' };
const ORDER = 'RNSM';
const TF = [0, 1, 2, 3, 4, 5, 6, 7].map(t => Array.from({ length: 64 }, (_, s) => {
  let r = s >> 3, c = s & 7;
  if (t & 1) c = 7 - c; if (t & 2) r = 7 - r; if (t & 4) [r, c] = [c, r];
  return r * 8 + c;
}));
const binom = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); };

const tables = new Map();
function table(name) {
  if (tables.has(name)) return tables.get(name);
  const info = JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8'));
  // Files over 1 GB (the six-piece tables) are read a byte at a time from disk instead of into memory.
  info.v = info.files.map(f => {
    const file = path.join(DIR, f);
    if (fs.statSync(file).size < 1 << 30) return fs.readFileSync(file);
    const fd = fs.openSync(file, 'r'), one = Buffer.alloc(1);
    return { at: i => { fs.readSync(fd, one, 0, 1, i); return one[0]; } };
  });
  info.kidx = Array(64).fill(-1); info.kings.forEach((s, i) => { info.kidx[s] = i; });
  info.slots = info.white.map(k => ['white', k]).concat(info.black.map(k => ['black', k]));
  tables.set(name, info);
  return info;
}
const sideKey = list => list.slice().sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
// Tables keep the side with more (or stronger) pieces as white, as tools/makruk-tb does.
const rankOf = list => list.map(l => ORDER.indexOf(l));
function canonical(w, b) {
  if (w.length !== b.length) return w.length > b.length;
  const x = rankOf(w), y = rankOf(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return true;
}
const sq = at => at.r * 8 + at.c;

// The value of a position (pieces as makruk-rules.js has them) with `stm` to move, or null if it is king against king.
function value(pieces, stm) {
  const others = pieces.filter(p => p.piece !== 'king');
  if (!others.length) return 0;
  let w = sideKey(others.filter(p => p.side === 'white').map(p => LETTER[p.piece]));
  let b = sideKey(others.filter(p => p.side === 'black').map(p => LETTER[p.piece]));
  let flip = false;
  if (!canonical(w, b)) { [w, b] = [b, w]; flip = true; }
  const t = table('K' + w.join('') + 'vK' + b.join(''));
  const conv = p => ({ side: flip ? (p.side === 'white' ? 'black' : 'white') : p.side, letter: LETTER[p.piece] || 'K', s: flip ? (7 - p.at.r) * 8 + p.at.c : sq(p.at) });
  const ps = pieces.map(conv);
  const wk = ps.find(p => p.letter === 'K' && p.side === 'white').s, bk = ps.find(p => p.letter === 'K' && p.side === 'black').s;
  let best = Infinity;
  for (const tf of t.symmetries) {
    const f = TF[tf], k = t.kidx[f[wk]];
    if (k < 0) continue;
    let m = 0;
    for (const g of t.groups) {
      const [color, letter] = t.slots[g.start];
      const squares = ps.filter(p => p.side === color && p.letter === letter).map(p => f[p.s]).sort((a, b) => a - b);
      let rank = 0; squares.forEach((s, j) => { rank += binom(s, j + 1); });
      m = m * g.size + rank;
    }
    best = Math.min(best, (k * 64 + f[bk]) * t.comb + m);
  }
  const side = flip ? (stm === 'white' ? 1 : 0) : (stm === 'white' ? 0 : 1);
  const v = t.v[side];
  return v.at ? v.at(best) : v[best];
}
const isWin = x => x >= 1 && x <= 127, isLoss = x => x >= 128 && x <= 253;
const other = s => s === 'white' ? 'black' : 'white';

// The value a position should have from its moves.
function fromMoves(pieces, stm) {
  const st = R.gameStatus(pieces, stm);
  if (st.state === 'checkmate') return 128;
  if (st.state === 'stalemate') return 0;
  let bestWin = Infinity, worst = 0, allLose = true;
  for (const m of R.legalMoves(pieces, stm)) {
    const x = value(R.applyMove(pieces, m.from, m.to), other(stm));
    if (isLoss(x)) bestWin = Math.min(bestWin, x - 128 + 1);
    if (isWin(x)) worst = Math.max(worst, x); else allLose = false;
  }
  return bestWin < Infinity ? bestWin : allLose ? 128 + worst : 0;
}

let seed = 2026;
const rand = n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };
function randomPosition(t) {
  for (;;) {
    const squares = Array.from({ length: t.slots.length + 2 }, () => rand(64));
    if (new Set(squares).size !== squares.length) continue;
    const at = s => ({ r: s >> 3, c: s & 7 });
    const ps = [{ piece: 'king', side: 'white', at: at(squares[0]) }, { piece: 'king', side: 'black', at: at(squares[1]) }];
    t.slots.forEach(([color, letter], j) => ps.push({ piece: KIND[letter], side: color, at: at(squares[j + 2]) }));
    if (Math.max(Math.abs(ps[0].at.r - ps[1].at.r), Math.abs(ps[0].at.c - ps[1].at.c)) <= 1) continue;
    const stm = rand(2) ? 'white' : 'black';
    if (R.inCheck(ps, other(stm))) continue;
    return { ps, stm };
  }
}
// Both sides play from the tables: the winner the quickest mate, the loser the longest defence.
function playOut(ps, stm) {
  const v = value(ps, stm), winner = stm;
  let pos = ps, turn = stm, moves = 0;
  for (let ply = 0; ply < 600; ply++) {
    const st = R.gameStatus(pos, turn);
    if (st.state !== 'playing') return { v, moves, end: st.state, loser: turn };
    let best = null, key = null;
    for (const m of R.legalMoves(pos, turn)) {
      const after = R.applyMove(pos, m.from, m.to), x = value(after, other(turn));
      const k = turn === winner ? (isLoss(x) ? x - 128 : 1000) : (isWin(x) ? -x : 1000);
      if (best === null || k < key) { best = after; key = k; }
    }
    if (turn === winner) moves++;
    pos = best; turn = other(turn);
  }
  return { v, moves, end: 'too long' };
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
let failures = 0;
for (const name of names) {
  const t = table(name), t0 = Date.now(), samples = Number(process.env.MAKRUK_SAMPLES) || 3000;
  let wins = 0, losses = 0, played = 0;
  for (let i = 0; i < samples; i++) {
    const { ps, stm } = randomPosition(t), got = value(ps, stm), want = fromMoves(ps, stm);
    if (got !== want) { failures++; console.log(name + ': ' + stm + ' to move ' + JSON.stringify(ps) + ': ' + got + ' in the table, ' + want + ' from its moves'); continue; }
    if (isWin(got)) wins++; if (isLoss(got)) losses++;
    if (isWin(got) && played < 30) {
      const r = playOut(ps, stm);
      if (r.end !== 'checkmate' || r.moves !== got) { failures++; console.log(name + ': play-out from ' + JSON.stringify(ps) + ' ' + stm + ': ' + JSON.stringify(r)); }
      played++;
    }
  }
  console.log(name + ': ' + samples + ' positions agree with makruk-rules.js (' + wins + ' wins, ' + losses + ' losses for the side to move), ' + played + ' played out to mate in the moves given, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
}
if (failures) { console.log(failures + ' disagreements'); process.exit(1); }
console.log('All ' + names.length + ' tables agree.');
