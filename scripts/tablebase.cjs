'use strict';
// Endgame tablebase for the long chases (ไล่ยาว): white king plus one or two pieces against the lone red king.
// Squares are r*8+c with the same r/c as makruk-rules.js (r 0 = rank 8). White pieces: rook, khon, knight, promoted,
// pawn (เบี้ยคว่ำ: steps forward towards rank 8 onto an empty square, attacks the two squares diagonally ahead, and
// on reaching rank 6 (r 2) becomes a promoted pawn: that move is looked up in the table with the pawn promoted).
// wtm[i] = n > 0: white to move mates in n white moves; 0 = no forced mate (draw or illegal).
// btm[i] = n + 1: red to move, white mates in n more white moves (1 = red is already mated); 0 = no forced mate.
// Captures by the red king are looked up in the table for the smaller piece set.

const fs = require('node:fs');
const path = require('node:path');
const N = 64;
// Optional cache: MAKRUK_TABLEBASE_DIR keeps built tables (<types>.wtm / .btm) between runs.
const CACHE_DIR = process.env.MAKRUK_TABLEBASE_DIR;
const sq = (r, c) => r * 8 + c;
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const stepTable = steps => Array.from({ length: N }, (_, s) => {
  const r = s >> 3, c = s & 7;
  return steps.filter(([dr, dc]) => inside(r + dr, c + dc)).map(([dr, dc]) => sq(r + dr, c + dc));
});
const KING = stepTable([[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]);
const DIAG = stepTable([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
// White khon: four diagonals and one step forward (towards rank 8, r - 1).
const KHON = stepTable([[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0]]);
const KNIGHT = stepTable([[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]);
// White pawn: the squares it attacks (diagonally ahead).
const PAWN = stepTable([[-1, -1], [-1, 1]]);
const STEPS = { khon: KHON, knight: KNIGHT, promoted: DIAG, pawn: PAWN };
// Piece order inside a table's name and index (as scripts/build-endgame-tables.cjs and tablebase.js).
const ORDER = ['rook', 'knight', 'khon', 'promoted', 'pawn'];
// A white pawn stands on ranks 1–5 (r 3..7): on rank 6 it has already been promoted.
const pawnSquare = s => (s >> 3) >= 3;
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const adjacent = (a, b) => Math.max(Math.abs((a >> 3) - (b >> 3)), Math.abs((a & 7) - (b & 7))) === 1;

// Does a white piece of this type on `from` attack `to`? `blocked(s)` says whether a square holds a piece.
function attacks(type, from, to, blocked) {
  if (type !== 'rook') return STEPS[type][from].includes(to);
  const fr = from >> 3, fc = from & 7, tr = to >> 3, tc = to & 7;
  if (fr !== tr && fc !== tc || from === to) return false;
  const dr = Math.sign(tr - fr), dc = Math.sign(tc - fc);
  for (let r = fr + dr, c = fc + dc; r !== tr || c !== tc; r += dr, c += dc) if (blocked(sq(r, c))) return false;
  return true;
}

function build(types, cache = new Map()) {
  const name = types.join('+');
  if (cache.has(name)) return cache.get(name);
  const n = types.length, size = N ** (2 + n);
  const files = CACHE_DIR && ['wtm', 'btm'].map(ext => path.join(CACHE_DIR, name + '.' + ext));
  const stored = files && files.every(f => fs.existsSync(f));
  const sub = types.map((_, j) => n > 1 ? build(types.filter((__, k) => k !== j), cache) : null);
  // A pawn of the table promoting: the table with it as a promoted pawn, and where its pieces go in that table's order.
  const promotion = types.map((t, j) => {
    if (t !== 'pawn') return null;
    const order = types.map((u, k) => ({ type: k === j ? 'promoted' : u, k })).sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
    return { table: build(order.map(o => o.type), cache), from: order.map(o => o.k) };
  });
  const index = (wk, bk, ps) => ps.reduce((i, p) => i * N + p, wk * N + bk);
  const decode = i => { const ps = []; for (let k = 0; k < n; k++) { ps.unshift(i % N); i = Math.floor(i / N); } return { bk: i % N, wk: Math.floor(i / N), ps }; };
  // Red king on `s` (with white piece `skip` captured, or -1) is attacked by white?
  function attacked(s, wk, ps, skip) {
    if (s === wk || adjacent(s, wk)) return true;
    const blocked = q => q === wk || ps.some((p, k) => k !== skip && p === q);
    return ps.some((p, k) => k !== skip && p !== s && attacks(types[k], p, s, blocked));
  }
  function legal(wk, bk, ps) {
    const all = [wk, bk, ...ps];
    return new Set(all).size === all.length && !adjacent(wk, bk) && ps.every((p, k) => types[k] !== 'pawn' || pawnSquare(p));
  }
  // White moves: [pieceIndex (-1 king), to].
  function whiteMoves(wk, bk, ps) {
    const out = [], occupied = q => q === wk || q === bk || ps.includes(q);
    for (const to of KING[wk]) if (!ps.includes(to) && to !== bk && !adjacent(to, bk)) out.push([-1, to]);
    ps.forEach((p, k) => {
      if (types[k] === 'rook') {
        for (const [dr, dc] of ROOK_DIRS) {
          for (let r = (p >> 3) + dr, c = (p & 7) + dc; inside(r, c); r += dr, c += dc) {
            const to = sq(r, c);
            if (occupied(to)) break;
            out.push([k, to]);
          }
        }
      } else if (types[k] === 'pawn') { if (p >= 8 && !occupied(p - 8)) out.push([k, p - 8]); }
      else for (const to of STEPS[types[k]][p]) if (!occupied(to)) out.push([k, to]);
    });
    return out;
  }
  // Red king moves: [to, capturedIndex or -1].
  function blackMoves(wk, bk, ps) {
    const out = [];
    for (const to of KING[bk]) {
      if (to === wk) continue;
      const cap = ps.indexOf(to);
      if (!attacked(to, wk, ps, cap)) out.push([to, cap]);
    }
    return out;
  }
  if (stored) {
    const [wtm, btm] = files.map(f => new Uint8Array(fs.readFileSync(f)));
    const table = { types, index, decode, wtm, btm, whiteMoves, blackMoves, attacked };
    cache.set(name, table);
    return table;
  }
  const wtm = new Uint8Array(size), btm = new Uint8Array(size), valid = new Uint8Array(size);
  // Enumerate legal positions once; remember red-to-move mates.
  for (let i = 0; i < size; i++) {
    const d = decode(i);
    if (!legal(d.wk, d.bk, d.ps)) continue;
    valid[i] = 1;
    const check = attacked(d.bk, d.wk, d.ps, -1);
    if (check) valid[i] = 2; // red in check: legal only with red to move
    if (check && blackMoves(d.wk, d.bk, d.ps).length === 0) btm[i] = 1;
  }
  for (let depth = 1; depth < 255; depth++) {
    let changed = 0;
    for (let i = 0; i < size; i++) {
      if (valid[i] !== 1 || wtm[i]) continue;
      const d = decode(i);
      for (const [k, to] of whiteMoves(d.wk, d.bk, d.ps)) {
        const moved = k < 0 ? d.ps : d.ps.map((p, j) => j === k ? to : p);
        let v;
        if (k >= 0 && promotion[k] && !pawnSquare(to)) { const pr = promotion[k]; v = pr.table.btm[pr.table.index(d.wk, d.bk, pr.from.map(j => moved[j]))]; }
        else v = btm[k < 0 ? index(to, d.bk, d.ps) : index(d.wk, d.bk, moved)];
        if (v === depth) { wtm[i] = depth; changed++; break; }
      }
    }
    for (let i = 0; i < size; i++) {
      if (!valid[i] || btm[i]) continue;
      const d = decode(i), moves = blackMoves(d.wk, d.bk, d.ps);
      if (!moves.length) continue; // stalemate: draw
      let worst = 0;
      for (const [to, cap] of moves) {
        const v = cap < 0 ? wtm[index(d.wk, to, d.ps)] : sub[cap] ? sub[cap].wtm[sub[cap].index(d.wk, to, d.ps.filter((_, j) => j !== cap))] : 0;
        if (!v) { worst = -1; break; }
        if (v > worst) worst = v;
      }
      if (worst === depth) { btm[i] = depth + 1; changed++; }
    }
    if (process.env.MAKRUK_TABLEBASE_LOG) console.error(name, 'depth', depth, 'new', changed);
    if (!changed && depth > 2) break;
  }
  if (files) { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(files[0], wtm); fs.writeFileSync(files[1], btm); }
  const table = { types, index, decode, wtm, btm, whiteMoves, blackMoves, attacked };
  cache.set(name, table);
  return table;
}

module.exports = { build, KING, sq, ORDER };
