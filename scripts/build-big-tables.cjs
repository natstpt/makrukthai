'use strict';
// Builds bigger endgame tables, a king with up to three pieces (rook, knight, khon, met/promoted pawn) against a
// lone king, on your own computer, with little memory:
//   - the board's symmetries: all 8 when there is no khon (the strong king on 10 squares), else the left–right mirror
//     (the strong king on files ก–ง, 32 squares);
//   - pieces of the same type counted once (any order), e.g. three promoted pawns: C(64,3) = 41 664 ways;
//   - no move lists kept: every pass generates the moves again, so memory is three bytes a position.
// The strong side is white (its khon steps towards rank 8); tablebase.js reads red as the strong side by flipping
// ranks. For every position with the strong side to move it keeps how many of its moves the fastest mate takes
// against the best defence (0: no forced mate). A piece the lone king takes goes on in the smaller table, which this
// script builds first (and keeps in the cache folder).
//
// Output, read by tablebase.js:
//   tablebase/<name>/info.json   types, symmetry, the strong king's squares, sizes, longest mate
//   tablebase/<name>/<k>.bin     the values with the strong king on its k-th square, deflate-compressed:
//                                value[loneKing * COMB + pieces], pieces numbered type by type in the order of the name
//   tablebase/big.json           the names built so far
// Squares are r*8+c as in makruk-rules.js (r 0 = rank 8).
//
// Run (Node 18 or newer):   node scripts/build-big-tables.cjs promoted-promoted-promoted knight-promoted-promoted
//   names: the pieces in the order rook, knight, khon, promoted, joined with '-' (a met is a promoted pawn).
//   --cache <dir>   where finished tables are kept between runs (default: tablebase-cache next to the repository)
//   --check <name>  build a 1- or 2-piece table and compare it with tablebase/<name>.bin (checks this script)
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ORDER = ['rook', 'knight', 'khon', 'promoted'];
const ROOT = path.join(__dirname, '..');
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const near = (a, b) => Math.max(Math.abs((a >> 3) - (b >> 3)), Math.abs((a & 7) - (b & 7))) <= 1;
function steps(list) {
  return Array.from({ length: 64 }, (_, s) => list.map(([dr, dc]) => [(s >> 3) + dr, (s & 7) + dc]).filter(([r, c]) => inside(r, c)).map(([r, c]) => r * 8 + c));
}
const KING = steps([[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]);
const MOVES = {
  knight: steps([[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]),
  khon: steps([[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0]]), // white: diagonals and one step forward (r - 1)
  promoted: steps([[-1, -1], [-1, 1], [1, -1], [1, 1]])
};
const ATTACK = {};
for (const t of Object.keys(MOVES)) { ATTACK[t] = new Uint8Array(4096); MOVES[t].forEach((to, s) => to.forEach(q => { ATTACK[t][s * 64 + q] = 1; })); }
// Rook rays from each square, and the squares strictly between two squares on a line.
const RAYS = Array.from({ length: 64 }, (_, s) => [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => {
  const out = []; for (let r = (s >> 3) + dr, c = (s & 7) + dc; inside(r, c); r += dr, c += dc) out.push(r * 8 + c); return out;
}));
const BETWEEN = [];
for (let a = 0; a < 64; a++) for (let b = 0; b < 64; b++) {
  const ar = a >> 3, ac = a & 7, br = b >> 3, bc = b & 7;
  if (a === b || (ar !== br && ac !== bc)) { BETWEEN.push(null); continue; }
  const dr = Math.sign(br - ar), dc = Math.sign(bc - ac), out = [];
  for (let r = ar + dr, c = ac + dc; r !== br || c !== bc; r += dr, c += dc) out.push(r * 8 + c);
  BETWEEN.push(out);
}
// The 8 symmetries on squares; with a khon only 0 (none) and 1 (left–right mirror) keep its moves.
const TF = [0, 1, 2, 3, 4, 5, 6, 7].map(t => {
  const out = new Uint8Array(64);
  for (let s = 0; s < 64; s++) { let r = s >> 3, c = s & 7; if (t & 1) c = 7 - c; if (t & 2) r = 7 - r; if (t & 4) { const x = r; r = c; c = x; } out[s] = r * 8 + c; }
  return out;
});
const binom = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); };
// Combinations of k squares (k = 1..3) in increasing order, ranked by the combinatorial number system.
const UNRANK = { 1: null, 2: new Uint8Array(2 * 2016), 3: new Uint8Array(3 * 41664) };
for (let b = 1, n = 0; b < 64; b++) for (let a = 0; a < b; a++) { UNRANK[2][2 * (a + b * (b - 1) / 2)] = a; UNRANK[2][2 * (a + b * (b - 1) / 2) + 1] = b; n++; }
for (let c = 2; c < 64; c++) for (let b = 1; b < c; b++) for (let a = 0; a < b; a++) { const i = a + b * (b - 1) / 2 + c * (c - 1) * (c - 2) / 6; UNRANK[3].set([a, b, c], 3 * i); }

function nameOf(types) { return types.slice().sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join('-'); }
function layout(name) {
  const types = name ? name.split('-') : [];
  if (types.some(t => !ORDER.includes(t))) throw Error('unknown piece in ' + name + ' (use rook, knight, khon, promoted)');
  if (nameOf(types) !== name) throw Error('write the pieces in the order rook, knight, khon, promoted: ' + nameOf(types));
  const groups = [];
  types.forEach(t => { const g = groups[groups.length - 1]; if (g && g.type === t) g.count++; else groups.push({ type: t, count: 1 }); });
  groups.forEach(g => { g.size = binom(64, g.count); });
  const symmetry = types.includes('khon') ? 2 : 8, ts = symmetry === 8 ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1];
  const kings = [];
  for (let s = 0; s < 64; s++) { const r = s >> 3, c = s & 7; if (symmetry === 8 ? r <= 3 && c <= 3 && r <= c : c <= 3) kings.push(s); }
  const kingIndex = new Int8Array(64).fill(-1); kings.forEach((s, i) => { kingIndex[s] = i; });
  const comb = groups.reduce((m, g) => m * g.size, 1);
  return { name, types, groups, symmetry, ts, kings, kingIndex, comb, chunk: 64 * comb, size: kings.length * 64 * comb };
}

// A table being built, or loaded from the cache: A[i] for the strong side to move (0: no forced mate).
function Table(name, cacheDir, log) {
  const L = layout(name), n = L.types.length, { groups, ts, kingIndex, comb } = L;
  const subs = L.types.map((_, j) => n ? tableFor(nameOf(L.types.filter((__, k) => k !== j)), cacheDir, log) : null);
  // Index of a position (strong to move or not), the pieces in `ps` with types L.types (any order within a type).
  const tmp = new Int32Array(3);
  function index(wk, bk, ps) {
    let t = 0; while (kingIndex[TF[ts[t]][wk]] < 0) t++;
    const f = TF[ts[t]];
    let m = 0, at = 0;
    for (const g of groups) {
      for (let j = 0; j < g.count; j++) tmp[j] = f[ps[at + j]];
      if (g.count === 2 && tmp[0] > tmp[1]) { const x = tmp[0]; tmp[0] = tmp[1]; tmp[1] = x; }
      if (g.count === 3) { tmp.subarray(0, 3).sort(); }
      const rank = g.count === 1 ? tmp[0] : g.count === 2 ? tmp[0] + tmp[1] * (tmp[1] - 1) / 2 : tmp[0] + tmp[1] * (tmp[1] - 1) / 2 + tmp[2] * (tmp[2] - 1) * (tmp[2] - 2) / 6;
      m = m * g.size + rank; at += g.count;
    }
    return (kingIndex[f[wk]] * 64 + f[bk]) * comb + m;
  }
  function decode(i, ps) { // fills ps, returns [wk, bk]
    let m = i % comb; const rest = (i - m) / comb, bk = rest % 64, wk = L.kings[(rest - bk) / 64];
    let at = n;
    for (let gi = groups.length - 1; gi >= 0; gi--) {
      const g = groups[gi], rank = m % g.size; m = (m - rank) / g.size; at -= g.count;
      if (g.count === 1) ps[at] = rank; else for (let j = 0; j < g.count; j++) ps[at + j] = UNRANK[g.count][g.count * rank + j];
    }
    return [wk, bk];
  }
  // Is square q attacked by the strong side (its king, and its pieces but `skip`)? The lone king is not a blocker.
  function attacked(q, wk, ps, skip) {
    if (near(q, wk)) return true;
    for (let k = 0; k < n; k++) {
      if (k === skip || ps[k] === q) continue;
      const t = L.types[k], from = ps[k];
      if (t !== 'rook') { if (ATTACK[t][from * 64 + q]) return true; continue; }
      const between = BETWEEN[from * 64 + q];
      if (!between) continue;
      let clear = true;
      for (const s of between) { if (s === wk) { clear = false; break; } for (let j = 0; j < n; j++) if (j !== skip && ps[j] === s) { clear = false; break; } if (!clear) break; }
      if (clear) return true;
    }
    return false;
  }
  const file = cacheDir && path.join(cacheDir, name + '.bin');
  if (file && fs.existsSync(file)) {
    const A = new Uint8Array(fs.readFileSync(file));
    if (A.length === L.size) return { L, A, index, value: (wk, bk, ps) => A[index(wk, bk, ps)] };
  }
  const t0 = Date.now(), N = L.size;
  log(name + ': ' + N.toLocaleString('en') + ' positions, ' + (3 * N / 1048576).toFixed(0) + ' MB of memory');
  const A = new Uint8Array(N), D = new Uint8Array(N).fill(255), S = new Uint8Array(N); // S: 1 lone-to-move legal, 2 strong-to-move legal, 4 stalemate
  const ps = new Int32Array(Math.max(1, n)), q2 = new Int32Array(Math.max(1, n));
  const occupied = (s, wk, bk) => { if (s === wk || s === bk) return true; for (let k = 0; k < n; k++) if (ps[k] === s) return true; return false; };
  // The value after the lone king goes to `to` (taking the piece `cap`, or -1): strong side to move.
  function afterLone(wk, to, cap) {
    if (cap < 0) return A[index(wk, to, ps)];
    if (n === 1) return 0;
    let j = 0; for (let k = 0; k < n; k++) if (k !== cap) q2[j++] = ps[k];
    return subs[cap].value(wk, to, q2.subarray(0, n - 1));
  }
  for (let i = 0; i < N; i++) {
    const [wk, bk] = decode(i, ps);
    if (wk === bk || near(wk, bk)) continue;
    let clash = false;
    for (let k = 0; k < n && !clash; k++) { if (ps[k] === wk || ps[k] === bk) clash = true; for (let j = k + 1; j < n; j++) if (ps[j] === ps[k]) clash = true; }
    if (clash) continue;
    S[i] = 1;
    const check = attacked(bk, wk, ps, -1);
    if (!check) S[i] |= 2;
    let any = false;
    for (const to of KING[bk]) { if (to === wk) continue; const cap = ps.indexOf(to); if (!attacked(to, wk, ps, cap)) { any = true; break; } }
    if (!any) { if (check) D[i] = 0; else S[i] |= 4; }
  }
  log('  positions set up in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  for (let depth = 1; depth < 255; depth++) {
    let newA = 0, newD = 0;
    for (let i = 0; i < N; i++) {
      if (!(S[i] & 2) || A[i]) continue;
      const [wk, bk] = decode(i, ps);
      let found = false;
      for (const to of KING[wk]) {
        if (to === bk || near(to, bk) || occupied(to, -1, -1)) continue;
        if (D[index(to, bk, ps)] === depth - 1) { found = true; break; }
      }
      for (let k = 0; k < n && !found; k++) {
        const from = ps[k], t = L.types[k];
        const targets = t === 'rook' ? null : MOVES[t][from];
        const tryTo = to => { ps[k] = to; const hit = D[index(wk, bk, ps)] === depth - 1; ps[k] = from; return hit; };
        if (targets) { for (const to of targets) if (!occupied(to, wk, bk) && tryTo(to)) { found = true; break; } }
        else for (const ray of RAYS[from]) { for (const to of ray) { if (occupied(to, wk, bk)) break; if (tryTo(to)) { found = true; break; } } if (found) break; }
      }
      if (found) { A[i] = depth; newA++; }
    }
    for (let i = 0; i < N; i++) {
      if (S[i] !== 1 && S[i] !== 3 || D[i] !== 255) continue;
      const [wk, bk] = decode(i, ps);
      let worst = 0, ok = true;
      for (const to of KING[bk]) {
        if (to === wk || near(to, wk)) continue;
        const cap = ps.indexOf(to);
        if (attacked(to, wk, ps, cap)) continue;
        const v = afterLone(wk, to, cap);
        if (!v) { ok = false; break; }
        if (v > worst) worst = v;
      }
      if (ok) { D[i] = worst; newD++; }
    }
    log('  depth ' + depth + ': ' + newA.toLocaleString('en') + ' + ' + newD.toLocaleString('en') + ' positions, ' + ((Date.now() - t0) / 60000).toFixed(1) + ' min');
    if (!newA && !newD) break;
  }
  if (file) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(file, A); }
  return { L, A, index, value: (wk, bk, q) => A[index(wk, bk, q)] };
}
const tables = new Map();
function tableFor(name, cacheDir, log) {
  if (!name) return { value: () => 0 };
  if (!tables.has(name)) tables.set(name, Table(name, cacheDir, log));
  return tables.get(name);
}

// Writes tablebase/<name>/ and adds the name to tablebase/big.json.
function write(table, outDir) {
  const { L, A } = table, dir = path.join(outDir, L.name);
  fs.mkdirSync(dir, { recursive: true });
  let won = 0, longest = 0, bytes = 0;
  for (let k = 0; k < L.kings.length; k++) {
    const part = A.subarray(k * L.chunk, (k + 1) * L.chunk);
    for (const v of part) if (v) { won++; if (v > longest) longest = v; }
    const packed = zlib.deflateRawSync(part, { level: 9 });
    fs.writeFileSync(path.join(dir, k + '.bin'), packed); bytes += packed.length;
  }
  fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify({ name: L.name, types: L.types, symmetry: L.symmetry, kings: L.kings, comb: L.comb, groups: L.groups.map(g => ({ type: g.type, count: g.count, size: g.size })), won, longest, bytes }, null, 1) + '\n');
  const listFile = path.join(outDir, 'big.json');
  const list = fs.existsSync(listFile) ? JSON.parse(fs.readFileSync(listFile, 'utf8')) : [];
  if (!list.includes(L.name)) list.push(L.name);
  list.sort(); fs.writeFileSync(listFile, JSON.stringify(list) + '\n');
  return { won, longest, bytes };
}

// Compares a freshly built 1- or 2-piece table with tablebase/<name>.bin (scripts/build-endgame-tables.cjs).
function check(name, cacheDir, log) {
  const table = tableFor(name, cacheDir, log), n = table.L.types.length;
  const old = new Uint8Array(zlib.inflateRawSync(fs.readFileSync(path.join(ROOT, 'tablebase', name + '.bin'))));
  const ps = new Int32Array(n);
  let compared = 0;
  for (let i = 0; i < old.length; i++) {
    let x = i; for (let k = n - 1; k >= 0; k--) { ps[k] = x % 64; x = (x - ps[k]) / 64; }
    const bk = x % 64, h = (x - bk) / 64, wk = (h >> 2) * 8 + (h & 3);
    const all = [wk, bk, ...ps];
    if (new Set(all).size !== all.length || near(wk, bk)) continue;
    const v = table.value(wk, bk, ps);
    if (v !== old[i]) throw Error(name + ': differs at king ' + wk + ', lone king ' + bk + ', pieces ' + Array.from(ps) + ': ' + v + ' here, ' + old[i] + ' in the old table');
    compared++;
  }
  return compared;
}

if (require.main === module) {
  const args = process.argv.slice(2), names = [], log = s => console.log(s);
  let cacheDir = path.join(ROOT, 'tablebase-cache'), checkName = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cache') cacheDir = args[++i];
    else if (args[i] === '--check') checkName = args[++i];
    else names.push(args[i]);
  }
  if (checkName) { console.log(checkName + ': ' + check(checkName, cacheDir, log).toLocaleString('en') + ' positions agree with tablebase/' + checkName + '.bin'); }
  for (const name of names) {
    const t = Date.now(), table = tableFor(name, cacheDir, log), r = write(table, path.join(ROOT, 'tablebase'));
    console.log(name + ': ' + r.won.toLocaleString('en') + ' winning positions, longest mate ' + r.longest + ' moves, ' + (r.bytes / 1048576).toFixed(1) + ' MB in tablebase/' + name + '/, ' + ((Date.now() - t) / 60000).toFixed(1) + ' min.');
  }
  if (!names.length && !checkName) console.log('Usage: node scripts/build-big-tables.cjs promoted-promoted-promoted knight-promoted-promoted [--cache dir] [--check knight-promoted]');
}
module.exports = { layout, tableFor, write, check, nameOf };
