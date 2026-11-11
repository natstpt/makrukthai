'use strict';
// Builds the mate-in-1/2/3 puzzles of the puzzle page (https://natstpt.github.io/makrukthai/puzzle):
// puzzle/sets/<id>.json, one file per piece set, and puzzle/sets.js, the list of sets with their counts.
// Positions are drawn at random for each piece set, kept when the endgame tables say the side to move mates in 1, 2 or
// 3 moves, then searched again move by move with makruk-rules.js: the mate must take exactly that many moves, and at
// most 2 first moves may mate that fast. Each puzzle keeps a solution tree: every attacking move that still mates in
// the moves left (so any move as good as the book one is right), and for each one the defence that holds out longest.
// The tables: tablebase/ (on the website) for the `web` sets; for the `local` sets, the tables only on this computer
// (tablebase-local/, too big for GitHub Pages), asked through the local server (tools/makruk-tb: makruk-tb serve).
// Only the puzzles go on the website, never those tables. The local sets also drop easy positions: no piece of either
// side may stand attacked and unguarded, and no first move of the solution may be a capture.
//   node scripts/build-mate-puzzles.cjs              every set (local ones only when the local server is running)
//   node scripts/build-mate-puzzles.cjs rr-r rmf-r   just these sets; the other files stay as they are
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const R = require('../makruk-rules.js');
const T = require('../tablebase.js');
const M = require('../editor-model.js');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'tablebase');
const out = path.join(root, 'puzzle', 'sets');
const LOCAL = 'http://127.0.0.1:8765';
const open = f => new Uint8Array(zlib.inflateRawSync(fs.readFileSync(f)));

// Piece sets: the attacker's pieces besides the king, and the defender's. `label` is shown on the page; `per` is how
// many puzzles of each mate count to find (more for endings that come up often in real games); `off`: not in the
// default choice (the defender has two pieces).
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
  // Driving the lone king into a corner with pawns, promoted pawns and knights (from the move search alone, no tables):
  // the king starts in a 3x3 corner, the attackers near it. `colours`: the promoted pawns on one colour ('same'), on
  // both ('split'), or two on one colour and one on the other ('pair', as three promoted pawns must be to mate).
  // `corner`: the promoted pawns (the pair, for 'pair') walk on the colour of that corner (true) or the other (false);
  // `cornerMate`: the king is mated on the corner square itself (true) or beside it (false). `mix`: each pawn may
  // already be promoted. The pawns' corner is on the far side, where they promote.
  { id: 'pp', label: 'เบี้ย 2 ตัว', attack: ['pawn', 'pawn'], defend: [], search: true, mix: true },
  { id: 'fff-c', label: 'เบี้ยหงาย 3 ตัว (2 ตัวผูกกัน เบี้ยตรงมุม)', attack: ['promoted', 'promoted', 'promoted'], defend: [], search: true, colours: 'pair', corner: true },
  { id: 'fff-x', label: 'เบี้ยหงาย 3 ตัว (2 ตัวผูกกัน เบี้ยไม่ตรงมุม)', attack: ['promoted', 'promoted', 'promoted'], defend: [], search: true, colours: 'pair', corner: false },
  { id: 'nff-c', label: 'ม้า + เบี้ยหงาย 2 ตัว (ผูกกัน เบี้ยตรงมุม)', attack: ['knight', 'promoted', 'promoted'], defend: [], search: true, colours: 'same', corner: true },
  { id: 'nff-x', label: 'ม้า + เบี้ยหงาย 2 ตัว (ผูกกัน เบี้ยไม่ตรงมุม)', attack: ['knight', 'promoted', 'promoted'], defend: [], search: true, colours: 'same', corner: false },
  // Two promoted pawns on both colours: one always walks on the corner's colour, so no corner split (twice as many).
  { id: 'nff2', label: 'ม้า + เบี้ยหงาย 2 ตัว (เทียมกัน)', attack: ['knight', 'promoted', 'promoted'], defend: [], search: true, colours: 'split', per: 60 },
  { id: 'nnf-c', label: 'ม้า 2 ตัว + เบี้ยหงาย (เบี้ยตรงมุม)', attack: ['knight', 'knight', 'promoted'], defend: [], search: true, corner: true },
  { id: 'nnf-x', label: 'ม้า 2 ตัว + เบี้ยหงาย (เบี้ยไม่ตรงมุม)', attack: ['knight', 'knight', 'promoted'], defend: [], search: true, corner: false },
  // A khon and a promoted pawn: `facing` puts the lone king's corner in front of the khon (where it moves) or behind it.
  { id: 'sf-fc', label: 'โคน + เบี้ยหงาย (หน้าโคน เบี้ยตรงมุม)', attack: ['khon', 'promoted'], defend: [], search: true, facing: 'front', corner: true },
  { id: 'sf-fx', label: 'โคน + เบี้ยหงาย (หน้าโคน เบี้ยไม่ตรงมุม)', attack: ['khon', 'promoted'], defend: [], search: true, facing: 'front', corner: false },
  { id: 'sf-bc', label: 'โคน + เบี้ยหงาย (หลังโคน เบี้ยตรงมุม)', attack: ['khon', 'promoted'], defend: [], search: true, facing: 'back', corner: true },
  { id: 'sf-bx', label: 'โคน + เบี้ยหงาย (หลังโคน เบี้ยไม่ตรงมุม)', attack: ['khon', 'promoted'], defend: [], search: true, facing: 'back', corner: false },
  { id: 'r-m', label: 'เรือ ปะทะ เม็ด', attack: ['rook'], defend: ['met'] },
  { id: 'r-r', label: 'เรือ ปะทะ เรือ', attack: ['rook'], defend: ['rook'] },
  { id: 's-m', label: 'โคน ปะทะ เม็ด', attack: ['khon'], defend: ['met'] },
  { id: 'rm-r', label: 'เรือ + เม็ด ปะทะ เรือ', attack: ['rook', 'met'], defend: ['rook'] },
  // From the tables on this computer only.
  { id: 'r-n', label: 'เรือ ปะทะ ม้า', attack: ['rook'], defend: ['knight'], local: true },
  { id: 'r-s', label: 'เรือ ปะทะ โคน', attack: ['rook'], defend: ['khon'], local: true },
  { id: 'rr-r', label: 'เรือ 2 ลำ ปะทะ เรือ', attack: ['rook', 'rook'], defend: ['rook'], local: true },
  { id: 'rr-n', label: 'เรือ 2 ลำ ปะทะ ม้า', attack: ['rook', 'rook'], defend: ['knight'], local: true },
  { id: 'rr-s', label: 'เรือ 2 ลำ ปะทะ โคน', attack: ['rook', 'rook'], defend: ['khon'], local: true },
  { id: 'rn-m', label: 'เรือ + ม้า ปะทะ เม็ด', attack: ['rook', 'knight'], defend: ['met'], local: true },
  { id: 'rn-n', label: 'เรือ + ม้า ปะทะ ม้า', attack: ['rook', 'knight'], defend: ['knight'], local: true },
  { id: 'rs-m', label: 'เรือ + โคน ปะทะ เม็ด', attack: ['rook', 'khon'], defend: ['met'], local: true },
  { id: 'rs-s', label: 'เรือ + โคน ปะทะ โคน', attack: ['rook', 'khon'], defend: ['khon'], local: true },
  { id: 'rm-n', label: 'เรือ + เม็ด ปะทะ ม้า', attack: ['rook', 'met'], defend: ['knight'], local: true },
  { id: 'rm-m', label: 'เรือ + เม็ด ปะทะ เม็ด', attack: ['rook', 'met'], defend: ['met'], local: true },
  // Rook and two mets (a met and a promoted pawn) against a rook: common in real games, so more of them.
  { id: 'rmf-r', label: 'เรือ + เม็ด + เบี้ยหงาย ปะทะ เรือ', attack: ['rook', 'met', 'promoted'], defend: ['rook'], local: true, per: 80 },
  { id: 'rm-nm', label: 'เรือ + เม็ด ปะทะ ม้า + เม็ด', attack: ['rook', 'met'], defend: ['knight', 'met'], local: true, searchFirst: true },
  { id: 'rm-sm', label: 'เรือ + เม็ด ปะทะ โคน + เม็ด', attack: ['rook', 'met'], defend: ['khon', 'met'], local: true, searchFirst: true },
  { id: 'rr-rs', label: 'เรือ 2 ลำ ปะทะ เรือ + โคน', attack: ['rook', 'rook'], defend: ['rook', 'khon'], local: true, searchFirst: true }
];
const PER = 30, MATES = [1, 2, 3], MAX_FIRST = 2, MIN_SET = 10;

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
// The local server's tables, or null when it is not running.
async function localTables() {
  try { const res = await fetch(LOCAL + '/status', { signal: AbortSignal.timeout(1500) }); return res.ok ? (await res.json()).tables : null; } catch (e) { return null; }
}
// The local table name of a set, as makruk-tb names it (KRMMvKR).
const LETTER = { rook: 'R', knight: 'N', khon: 'S', met: 'M', promoted: 'M' };
const tableName = set => 'K' + set.attack.map(p => LETTER[p]).join('') + 'vK' + set.defend.map(p => LETTER[p]).join('');

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

// A piece standing attacked by the other side and guarded by none of its own (a free capture).
function hanging(ps) {
  return ps.some(p => p.piece !== 'king' && R.isAttacked(ps, p.at, other(p.side)) && !R.isAttacked(ps.filter(x => x !== p), p.at, p.side));
}
// The quality rule of the local sets: nothing hanging, and no first move of the solution a capture.
function plain(ps, tree) {
  if (hanging(ps)) return false;
  return Object.keys(tree).every(k => !ps.some(p => square(p.at) === k.slice(2)));
}

// Each set draws from its own sequence, so adding a set leaves the others' puzzles as they are.
function seeded(id) {
  let seed = 20261104;
  for (const ch of id) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  return n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };
}
// A random legal position for the set, attacker (either colour) to move, neither king in check. Mates come soon only
// with the defending king near the edge and the attacking pieces close by, so most draws put them there.
const EDGE = Array.from({ length: 64 }, (_, s) => s).filter(s => (s >> 3) % 7 === 0 || (s & 7) % 7 === 0);
function randomPosition(set, rand) {
  const near = (at, d) => { for (;;) { const r = at.r + rand(2 * d + 1) - d, c = at.c + rand(2 * d + 1) - d; if (r >= 0 && r < 8 && c >= 0 && c < 8) return r * 8 + c; } };
  for (;;) {
    const attacker = rand(2) ? 'white' : 'black', defender = other(attacker);
    const pieces = set.mix ? set.attack.map(p => p === 'pawn' && rand(3) === 0 ? 'promoted' : p) : set.attack;
    const slots = [['king', defender], ['king', attacker]].concat(pieces.map(p => [p, attacker]), set.defend.map(p => [p, defender]));
    // The corner sets: the lone king in a 3x3 corner (for pawns, and 'front', on the side the attacker moves towards;
    // 'back' on its own side).
    const far = attacker === 'white' ? 0 : 7, row = set.facing === 'back' ? 7 - far : set.facing === 'front' || set.attack.includes('pawn') ? far : rand(2) * 7;
    const corner = set.search ? { r: row, c: rand(2) * 7 } : null;
    const used = new Set(), ps = [];
    let ok = true;
    for (const [piece, side] of slots) {
      const lone = ps[0] && ps[0].at;
      const s = corner && !lone ? (Math.abs(corner.r - rand(3)) * 8 + Math.abs(corner.c - rand(3))) : corner ? near(lone, piece === 'king' ? 2 : 3)
        : !lone ? (rand(4) ? EDGE[rand(EDGE.length)] : rand(64)) : rand(4) ? near(lone, piece === 'king' ? 2 : 3) : rand(64);
      const at = { r: s >> 3, c: s & 7 };
      if (used.has(s)) { ok = false; break; }
      used.add(s);
      // An unpromoted pawn stands on its own side's ranks 3–5; a met keeps the colour of its first square (d1/e8).
      if (piece === 'pawn' && (side === 'white' ? at.r < 3 || at.r > 5 : at.r < 2 || at.r > 4)) { ok = false; break; }
      if (piece === 'met' && (at.r + at.c) % 2 !== 1) { ok = false; break; }
      ps.push({ piece, side, at });
    }
    if (!ok) continue;
    if (set.search && !colours(set, ps, corner)) continue;
    const [k1, k2] = ps;
    if (Math.max(Math.abs(k1.at.r - k2.at.r), Math.abs(k1.at.c - k2.at.c)) <= 1) continue;
    if (R.inCheck(ps, attacker) || R.inCheck(ps, defender)) continue;
    return { ps, attacker, corner };
  }
}
// The corner sets' colour rules: the promoted pawns on one colour, both, or two and one, and the colour (of the pair,
// for 'pair') against the corner's.
const parity = at => (at.r + at.c) % 2;
function colours(set, ps, corner) {
  const f = ps.filter(p => p.piece === 'promoted').map(p => parity(p.at)), ones = f.filter(x => x === 1).length;
  if (set.colours === 'same' && f.some(x => x !== f[0])) return false;
  if (set.colours === 'split' && f.every(x => x === f[0])) return false;
  if (set.colours === 'pair' && !(f.length === 3 && (ones === 1 || ones === 2))) return false;
  const walk = set.colours === 'pair' ? (ones === 2 ? 1 : 0) : f[0];
  if (set.corner !== undefined && f.length && (walk === parity(corner)) !== set.corner) return false;
  return true;
}
const fromSquare = k => ({ r: 8 - +k[1], c: k.charCodeAt(0) - 97 });
// Where the lone king ends: the squares it is mated on along every line of the solution tree.
function mateSquares(ps, side, node, out) {
  for (const k of Object.keys(node)) {
    const after = R.applyMove(ps, fromSquare(k.slice(0, 2)), fromSquare(k.slice(2)));
    if (node[k] === '#') { out.push(after.find(p => p.piece === 'king' && p.side !== side).at); continue; }
    const r = node[k].r;
    mateSquares(R.applyMove(after, fromSquare(r.slice(0, 2)), fromSquare(r.slice(2))), side, node[k].n, out);
  }
  return out;
}
// cornerMate sets: the king is mated on the corner square in every line (true), or never (false).
function cornerMateOk(set, ps, side, tree, corner) {
  if (set.cornerMate === undefined) return true;
  const at = mateSquares(ps, side, tree, []), on = a => a.r === corner.r && a.c === corner.c;
  return set.cornerMate ? at.every(on) : !at.some(on);
}
// Moves to mate for the attacker (to move) from the tables, or Infinity. The pawn tables are read through value().
async function tableMate(ps, attacker, set) {
  if (set.local) {
    const res = await fetch(LOCAL + '/probe?fen=' + encodeURIComponent(T.fenOf(ps, attacker)));
    const a = await res.json();
    if (!a.covered) throw Error(set.id + ': the local server has no table for ' + T.fenOf(ps, attacker));
    return a.result && a.result.res === 'win' ? a.result.n : Infinity;
  }
  if (!set.defend.length) return T.value(ps);
  const r = T.result(ps, attacker);
  return r && r.res === 'win' ? r.n : Infinity;
}

async function buildSet(set, solver, tries) {
  const per = set.per || PER, got = { 1: 0, 2: 0, 3: 0 }, rand = seeded(set.id), seen = new Set(), puzzles = [];
  let disagree = 0;
  for (let i = 0; i < tries && MATES.some(n => got[n] < per); i++) {
    if (i && i % (set.searchFirst ? 2000 : 50000) === 0 && process.env.MAKRUK_PROGRESS) console.log(set.id + ': ' + i + ' tries, ' + MATES.map(n => got[n]).join('/'));
    const { ps, attacker, corner } = randomPosition(set, rand);
    // The quality rule's first half is cheap: test it before asking the tables.
    if ((set.local || set.search) && hanging(ps)) continue;
    // The six-piece tables answer slowly (a probe takes 0.2–1 s), so those sets search first and ask the tables only
    // about the puzzles they keep; the others ask the tables first.
    const n = set.searchFirst || set.search ? solver.depth(ps, attacker, 3) : await tableMate(ps, attacker, set);
    if (n > 3 || got[n] >= per) continue;
    const fen = M.fen({ pieces: ps, turn: attacker });
    if (seen.has(fen)) continue;
    seen.add(fen);
    if (!set.searchFirst && !set.search && solver.depth(ps, attacker, 3) !== n) { disagree++; continue; }
    const tree = solver.tree(ps, attacker, n);
    if (Object.keys(tree).length > MAX_FIRST || ((set.local || set.search) && !plain(ps, tree))) continue;
    if (set.search && !cornerMateOk(set, ps, attacker, tree, corner)) continue;
    if (set.searchFirst && await tableMate(ps, attacker, set) !== n) { disagree++; continue; }
    if ((set.searchFirst || set.search) && i % 200 === 0) solver.clear();
    puzzles.push({ mate: n, fen, tree });
    got[n]++;
    if (puzzles.length % 50 === 0) solver.clear();
  }
  if (disagree) throw Error(set.id + ': ' + disagree + ' positions where the tables and the move search disagree');
  return puzzles.sort((a, b) => a.mate - b.mate);
}

// puzzle/sets.js: every set with a file of at least MIN_SET puzzles, with its counts by mate count.
function writeIndex() {
  const sets = [];
  for (const s of SETS) {
    const f = path.join(out, s.id + '.json');
    if (!fs.existsSync(f)) continue;
    const list = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (list.length < MIN_SET) continue;
    const count = {};
    MATES.forEach(n => { count[n] = list.filter(p => p.mate === n).length; });
    sets.push({ id: s.id, label: s.label, attack: s.attack, defend: s.defend, on: s.defend.length < 2, count });
  }
  const body = '/* Generated by scripts/build-mate-puzzles.cjs — do not edit by hand.\n' +
    ' * The piece sets of the puzzle page; each set\'s puzzles are in puzzle/sets/<id>.json:\n' +
    ' * [{mate, fen, tree}], tree: every move that mates in the moves left → "#" (mate) or {r: the defence, n: the next node}.\n' +
    ' * on: in the default choice. count: puzzles by mate count. */\n' +
    '(function (root) {\n  var data = ' + JSON.stringify({ sets }) + ';\n' +
    "  if (typeof module === 'object' && module.exports) module.exports = data;\n  if (root) root.MakrukPuzzleSets = data;\n" +
    "})(typeof window !== 'undefined' ? window : null);\n";
  fs.writeFileSync(path.join(root, 'puzzle', 'sets.js'), body);
  return sets;
}

async function main(ids) {
  loadTables();
  fs.mkdirSync(out, { recursive: true });
  const served = await localTables(), solver = createSolver(), report = [];
  for (const set of SETS) {
    if (ids.length && !ids.includes(set.id)) continue;
    if (set.local && !(served && served.includes(tableName(set)))) { report.push(set.id + ' skipped (no local table ' + tableName(set) + ')'); continue; }
    const puzzles = await buildSet(set, solver, set.search ? 400000 : set.searchFirst ? 40000 : set.local ? 3000000 : 1500000);
    fs.writeFileSync(path.join(out, set.id + '.json'), JSON.stringify(puzzles));
    report.push(set.id + ' ' + MATES.map(n => puzzles.filter(p => p.mate === n).length).join('/'));
    console.log(report[report.length - 1]);
  }
  const sets = writeIndex();
  const bytes = sets.reduce((a, s) => a + fs.statSync(path.join(out, s.id + '.json')).size, 0);
  console.log('puzzle/sets.js written: ' + sets.length + ' sets, ' + sets.reduce((a, s) => a + MATES.reduce((b, n) => b + s.count[n], 0), 0) + ' puzzles, ' + Math.round(bytes / 1024) + ' KB (' + report.join(', ') + ').');
}

module.exports = { SETS, MIN_SET, tableName, hanging, plain, createSolver, randomPosition, seeded, LOCAL, colours, mateSquares, parity };
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e.message || e); process.exit(1); });
