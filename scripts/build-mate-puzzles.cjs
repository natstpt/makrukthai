'use strict';
// Builds puzzle/mate-puzzles.js, the mate-in-1/2/3 puzzles of the puzzle page (https://natstpt.github.io/makrukthai/puzzle).
// Positions are drawn at random for each piece set, kept when the endgame tables (tablebase/) say the side to move
// mates in 1, 2 or 3 moves, then searched again move by move with makruk-rules.js: the mate must take exactly that
// many moves, and at most 2 first moves may mate that fast. Each puzzle keeps a solution tree: every attacking move
// that still mates in the moves left (so any move as good as the book one is right), and for each one the defence
// that holds out longest.
//   node scripts/build-mate-puzzles.cjs          writes puzzle/mate-puzzles.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const R = require('../makruk-rules.js');
const T = require('../tablebase.js');
const M = require('../editor-model.js');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'tablebase');
const open = f => new Uint8Array(zlib.inflateRawSync(fs.readFileSync(f)));

// Piece sets: the attacker's pieces besides the king, and the defender's. `label` is shown on the page.
const SETS = [
  { id: 'r', label: 'เรือ', attack: ['rook'], defend: [] },
  { id: 'rr', label: 'เรือ 2 ลำ', attack: ['rook', 'rook'], defend: [] },
  { id: 'rn', label: 'เรือ + ม้า', attack: ['rook', 'knight'], defend: [] },
  { id: 'rs', label: 'เรือ + โคน', attack: ['rook', 'khon'], defend: [] },
  { id: 'rm', label: 'เรือ + เม็ด', attack: ['rook', 'met'], defend: [] },
  { id: 'rp', label: 'เรือ + เบี้ย', attack: ['rook', 'pawn'], defend: [] },
  { id: 'ns', label: 'ม้า + โคน', attack: ['knight', 'khon'], defend: [] },
  { id: 'nm', label: 'ม้า + เม็ด', attack: ['knight', 'met'], defend: [] },
  { id: 'nn', label: 'ม้า 2 ตัว', attack: ['knight', 'knight'], defend: [] },
  { id: 'ss', label: 'โคน 2 ตัว', attack: ['khon', 'khon'], defend: [] },
  { id: 'sm', label: 'โคน + เม็ด', attack: ['khon', 'met'], defend: [] },
  { id: 'mf', label: 'เม็ด + เบี้ยหงาย', attack: ['met', 'promoted'], defend: [] },
  { id: 'r-m', label: 'เรือ ปะทะ เม็ด', attack: ['rook'], defend: ['met'] },
  { id: 'r-r', label: 'เรือ ปะทะ เรือ', attack: ['rook'], defend: ['rook'] },
  { id: 's-m', label: 'โคน ปะทะ เม็ด', attack: ['khon'], defend: ['met'] },
  { id: 'rm-r', label: 'เรือ + เม็ด ปะทะ เรือ', attack: ['rook', 'met'], defend: ['rook'] }
];
const PER = 30, MATES = [1, 2, 3], MAX_FIRST = 2;

function loadTables() {
  T.use(new Uint8Array(fs.readFileSync(path.join(dir, 'krk.bin'))), open(path.join(dir, 'krrk.bin')));
  for (const name of T.NAMES) T.useTable(name, open(path.join(dir, name + '.bin')));
  for (const name of ['KRvKM', 'KRvKR', 'KSvKM', 'KRMvKR']) {
    const info = JSON.parse(fs.readFileSync(path.join(dir, 'rs', name, 'info.json'), 'utf8')), parts = {};
    if (info.single) parts[0] = open(path.join(dir, 'rs', name, 'all.bin'));
    else for (let k = 0; k < info.positions / info.part; k++) if (!info.zero.includes(k)) parts[k] = open(path.join(dir, 'rs', name, k + '.bin'));
    T.useRs(name, info, parts);
  }
}

const other = s => s === 'white' ? 'black' : 'white';
const square = at => 'abcdefgh'[at.c] + (8 - at.r);
const moveKey = m => square(m.from) + square(m.to);

// Mate search with makruk-rules.js only (the ground truth the tables are checked against).
function createSolver() {
  const memo = new Map();
  const key = (ps, side) => side[0] + ps.map(p => p.side[0] + p.piece + square(p.at)).sort().join();
  // Can `side` (to move) mate within n of its moves?
  function wins(ps, side, n) {
    if (n <= 0) return false;
    const k = key(ps, side) + n;
    if (memo.has(k)) return memo.get(k);
    let result = false;
    for (const m of R.legalMoves(ps, side)) if (mates(R.applyMove(ps, m.from, m.to), side, n)) { result = true; break; }
    memo.set(k, result);
    return result;
  }
  // After a move by `side`: mate now, or every reply still loses within n-1 moves?
  function mates(after, side, n) {
    const st = R.gameStatus(after, other(side)).state;
    if (st === 'checkmate') return true;
    if (st !== 'playing' || n <= 1) return false;
    return R.legalMoves(after, other(side)).every(r => wins(R.applyMove(after, r.from, r.to), side, n - 1));
  }
  function depth(ps, side, max) { for (let n = 1; n <= max; n++) if (wins(ps, side, n)) return n; return Infinity; }
  // Every move that mates within n, each with the longest defence: {key: '#' | {r: reply, n: node}}.
  function tree(ps, side, n) {
    const node = {};
    for (const m of R.legalMoves(ps, side)) {
      const after = R.applyMove(ps, m.from, m.to);
      if (!mates(after, side, n)) continue;
      if (R.gameStatus(after, other(side)).state === 'checkmate') { node[moveKey(m)] = '#'; continue; }
      let best = null;
      for (const r of R.legalMoves(after, other(side))) {
        const next = R.applyMove(after, r.from, r.to), left = depth(next, side, n - 1);
        if (!best || left > best.left) best = { key: moveKey(r), next, left };
      }
      node[moveKey(m)] = { r: best.key, n: tree(best.next, side, best.left) };
    }
    return node;
  }
  return { wins, mates, depth, tree, clear: () => memo.clear() };
}

let seed = 20261104;
const rand = n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };

// A random legal position for the set, attacker (either colour) to move, neither king in check. Mates come soon only
// with the lone king near the edge and the attacking pieces close by, so most draws put them there.
const near = (at, d) => { for (;;) { const r = at.r + rand(2 * d + 1) - d, c = at.c + rand(2 * d + 1) - d; if (r >= 0 && r < 8 && c >= 0 && c < 8) return r * 8 + c; } };
const EDGE = Array.from({ length: 64 }, (_, s) => s).filter(s => (s >> 3) % 7 === 0 || (s & 7) % 7 === 0);
function randomPosition(set) {
  for (;;) {
    const attacker = rand(2) ? 'white' : 'black', defender = other(attacker);
    const slots = [['king', defender], ['king', attacker]].concat(set.attack.map(p => [p, attacker]), set.defend.map(p => [p, defender]));
    const used = new Set(), ps = [];
    let ok = true;
    for (const [piece, side] of slots) {
      const lone = ps[0] && ps[0].at;
      const s = !lone ? (rand(4) ? EDGE[rand(EDGE.length)] : rand(64)) : rand(4) ? near(lone, piece === 'king' ? 2 : 3) : rand(64);
      const at = { r: s >> 3, c: s & 7 };
      if (used.has(s)) { ok = false; break; }
      used.add(s);
      // An unpromoted pawn stands on its own side's ranks 3–5; a met keeps the colour of its first square (d1/e8).
      if (piece === 'pawn' && (side === 'white' ? at.r < 3 || at.r > 5 : at.r < 2 || at.r > 4)) { ok = false; break; }
      if (piece === 'met' && (at.r + at.c) % 2 !== 1) { ok = false; break; }
      ps.push({ piece, side, at });
    }
    if (!ok) continue;
    const [k1, k2] = ps;
    if (Math.max(Math.abs(k1.at.r - k2.at.r), Math.abs(k1.at.c - k2.at.c)) <= 1) continue;
    if (R.inCheck(ps, attacker) || R.inCheck(ps, defender)) continue;
    return { ps, attacker };
  }
}
// Moves to mate for the attacker (to move) from the tables, or Infinity. The pawn tables are read through value().
function tableMate(ps, attacker, set) {
  if (!set.defend.length) return T.value(ps);
  const r = T.result(ps, attacker);
  return r && r.res === 'win' ? r.n : Infinity;
}

function build(options) {
  const per = (options && options.per) || PER, tries = (options && options.tries) || 1500000;
  loadTables();
  const solver = createSolver(), puzzles = [], report = [], seen = new Set();
  let disagree = 0;
  for (const set of SETS) {
    const got = { 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < tries && MATES.some(n => got[n] < per); i++) {
      const { ps, attacker } = randomPosition(set);
      const n = tableMate(ps, attacker, set);
      if (n > 3 || got[n] >= per) continue;
      const fen = M.fen({ pieces: ps, turn: attacker });
      if (seen.has(fen)) continue;
      seen.add(fen);
      if (solver.depth(ps, attacker, 3) !== n) { disagree++; continue; }
      const tree = solver.tree(ps, attacker, n);
      if (Object.keys(tree).length > MAX_FIRST) continue;
      puzzles.push({ set: set.id, mate: n, fen, tree });
      got[n]++;
      if (solver.clear && puzzles.length % 50 === 0) solver.clear();
    }
    report.push(set.id + ' ' + MATES.map(n => got[n]).join('/'));
  }
  if (disagree) throw Error(disagree + ' positions where the tables and the move search disagree');
  return { sets: SETS.map(s => ({ id: s.id, label: s.label, attack: s.attack, defend: s.defend })), puzzles, report };
}

function write() {
  const { sets, puzzles, report } = build();
  // A set with only a handful of puzzles is left off the page.
  const usable = sets.filter(s => puzzles.filter(p => p.set === s.id).length >= 10);
  const kept = puzzles.filter(p => usable.some(s => s.id === p.set));
  const body = '/* Generated by scripts/build-mate-puzzles.cjs — do not edit by hand.\n' +
    ' * Mate-in-1/2/3 puzzles from the endgame tables, checked move by move with makruk-rules.js.\n' +
    ' * tree: every move that mates in the moves left → "#" (mate) or {r: the defence, n: the next node}. */\n' +
    '(function (root) {\n  var data = ' + JSON.stringify({ sets: usable, puzzles: kept }) + ';\n' +
    "  if (typeof module === 'object' && module.exports) module.exports = data;\n  if (root) root.MakrukMatePuzzles = data;\n" +
    "})(typeof window !== 'undefined' ? window : null);\n";
  fs.mkdirSync(path.join(root, 'puzzle'), { recursive: true });
  fs.writeFileSync(path.join(root, 'puzzle', 'mate-puzzles.js'), body);
  console.log('puzzle/mate-puzzles.js written: ' + kept.length + ' puzzles (' + report.join(', ') + ').');
}

module.exports = { SETS, build, createSolver };
if (require.main === module) write();
