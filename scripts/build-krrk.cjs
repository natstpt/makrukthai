'use strict';
// Builds tablebase/krrk.bin: king + two rooks against a lone king, with the rooks' side to move: how many of its
// moves the fastest mate takes against the best defence. When the lone king takes a rook, play goes on as king +
// rook against king (scripts/build-krk.cjs), so those mates count too. Squares 0..63 from ก1 (a1) along each rank.
// A position is kept once: the strong king on a1 b1 c1 d1 b2 c2 d2 c3 d3 d4 (by the board's 8 symmetries; on the
// diagonal the smaller of the two mirror images), the rooks in either order as one (the lower square first).
// Layout: value[(tri * 2016 + pair(r1 < r2)) * 64 + loneKing], one byte each, then compressed with deflate
// (the browser opens it with DecompressionStream).
// Run: node scripts/build-krrk.cjs
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const KRK = require('./build-krk.cjs');

const file = s => s & 7, rank = s => s >> 3, sq = (f, r) => r * 8 + f;
const near = (a, b) => Math.max(Math.abs(file(a) - file(b)), Math.abs(rank(a) - rank(b))) <= 1;
const KING = [];
for (let s = 0; s < 64; s++) {
  KING[s] = [];
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    const f = file(s) + df, r = rank(s) + dr;
    if ((df || dr) && f >= 0 && f < 8 && r >= 0 && r < 8) KING[s].push(sq(f, r));
  }
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// Squares a rook on `rook` reaches, stopping at (and including) the first occupied square.
function rays(rook, occupied) {
  const out = [];
  for (const [df, dr] of DIRS) {
    let f = file(rook) + df, r = rank(rook) + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) { const s = sq(f, r); out.push(s); if (occupied(s)) break; f += df; r += dr; }
  }
  return out;
}
const hits = (rook, target, occupied) => rays(rook, occupied).includes(target);
const TRI = [sq(0, 0), sq(1, 0), sq(2, 0), sq(3, 0), sq(1, 1), sq(2, 1), sq(3, 1), sq(2, 2), sq(3, 2), sq(3, 3)];
const TRI_INDEX = new Int8Array(64).fill(-1); TRI.forEach((s, i) => { TRI_INDEX[s] = i; });
const TF = [];
for (let t = 0; t < 8; t++) {
  TF[t] = new Uint8Array(64);
  for (let s = 0; s < 64; s++) {
    let f = file(s), r = rank(s);
    if (t & 1) f = 7 - f;
    if (t & 2) r = 7 - r;
    if (t & 4) { const x = f; f = r; r = x; }
    TF[t][s] = sq(f, r);
  }
}
// Rook pairs r1 < r2 numbered 0..2015.
const PAIR = new Int16Array(64 * 64).fill(-1), PAIRS = [];
for (let a = 0; a < 64; a++) for (let b = a + 1; b < 64; b++) { PAIR[a * 64 + b] = PAIRS.length; PAIRS.push([a, b]); }
const N = TRI.length * PAIRS.length * 64;
// The one stored index of a position (any order of the rooks).
function canon(wk, ra, rb, bk) {
  let best = -1;
  for (let t = 0; t < 8; t++) {
    const f = TF[t], k = TRI_INDEX[f[wk]];
    if (k < 0) continue;
    let a = f[ra], b = f[rb]; if (a > b) { const x = a; a = b; b = x; }
    const i = (k * PAIRS.length + PAIR[a * 64 + b]) * 64 + f[bk];
    if (best < 0 || i < best) best = i;
  }
  return best;
}
function decode(i) { const bk = i & 63, rest = i >> 6, p = rest % PAIRS.length, k = (rest - p) / PAIRS.length; return [TRI[k], PAIRS[p][0], PAIRS[p][1], bk]; }

// Two passes over the positions: count each one's moves, then fill flat typed arrays (keeps memory low).
function build() {
  const krk = KRK.build().full;
  const legalA = new Uint8Array(N), legalD = new Uint8Array(N), mate = new Uint8Array(N);
  const occOf = (a, b, c, d) => s => s === a || s === b || s === c || s === d;
  for (let i = 0; i < N; i++) {
    const [wk, ra, rb, bk] = decode(i);
    if (canon(wk, ra, rb, bk) !== i) continue;
    if (wk === bk || ra === bk || rb === bk || wk === ra || wk === rb || near(wk, bk)) continue;
    legalD[i] = 1;
    const occ = occOf(wk, ra, rb, bk);
    if (!hits(ra, bk, occ) && !hits(rb, bk, occ)) legalA[i] = 1;
  }
  function attackerKids(i, push) {
    const [wk, ra, rb, bk] = decode(i), occ = occOf(wk, ra, rb, bk);
    for (const t of KING[wk]) if (t !== ra && t !== rb && !near(t, bk)) push(canon(t, ra, rb, bk));
    for (const t of rays(ra, occ)) if (!occ(t)) push(canon(wk, t, rb, bk));
    for (const t of rays(rb, occ)) if (!occ(t)) push(canon(wk, ra, t, bk));
  }
  function defenderKids(i, push) {
    const [wk, ra, rb, bk] = decode(i), occNoBk = s => s === wk || s === ra || s === rb;
    for (const t of KING[bk]) {
      if (t === wk || near(t, wk)) continue;
      if (t === ra || t === rb) {
        const other = t === ra ? rb : ra;
        if (hits(other, t, s => s === wk || s === other)) continue; // the other rook guards it
        push(-1 - krk[wk * 4096 + other * 64 + t]); continue;
      }
      if (hits(ra, t, occNoBk) || hits(rb, t, occNoBk)) continue;
      push(canon(wk, ra, rb, t));
    }
  }
  const aStart = new Uint32Array(N + 1), dStart = new Uint32Array(N + 1);
  let na = 0, nd = 0;
  for (let i = 0; i < N; i++) {
    aStart[i] = na; dStart[i] = nd;
    if (legalA[i]) attackerKids(i, () => na++);
    if (legalD[i]) defenderKids(i, () => nd++);
  }
  aStart[N] = na; dStart[N] = nd;
  const aKids = new Int32Array(na), dKids = new Int32Array(nd);
  for (let i = 0; i < N; i++) {
    let x = aStart[i], y = dStart[i];
    if (legalA[i]) attackerKids(i, v => { aKids[x++] = v; });
    if (legalD[i]) defenderKids(i, v => { dKids[y++] = v; });
    if (legalD[i] && dStart[i + 1] === dStart[i]) {
      const [wk, ra, rb, bk] = decode(i), occ = occOf(wk, ra, rb, bk);
      if (hits(ra, bk, occ) || hits(rb, bk, occ)) mate[i] = 1;
    }
  }
  // A: moves to mate with the rooks' side to move (0: unknown or no win). D: with the lone king to move (255 unknown).
  const A = new Uint8Array(N), D = new Uint8Array(N).fill(255);
  for (let i = 0; i < N; i++) if (mate[i]) D[i] = 0;
  for (let n = 1; ; n++) {
    let changed = 0;
    for (let i = 0; i < N; i++) if (legalA[i] && !A[i]) {
      for (let j = aStart[i]; j < aStart[i + 1]; j++) if (D[aKids[j]] === n - 1) { A[i] = n; changed++; break; }
    }
    for (let i = 0; i < N; i++) if (legalD[i] && D[i] === 255 && dStart[i + 1] > dStart[i]) {
      let worst = 0, ok = true;
      for (let j = dStart[i]; j < dStart[i + 1]; j++) {
        const k = dKids[j], v = k < 0 ? -1 - k : A[k];
        if (!v) { ok = false; break; }
        worst = Math.max(worst, v);
      }
      if (ok) { D[i] = worst; changed++; }
    }
    if (!changed && n > 40) break;
  }
  let won = 0, longest = 0;
  for (let i = 0; i < N; i++) if (A[i]) { won++; longest = Math.max(longest, A[i]); }
  return { bytes: A, won, longest };
}

if (require.main === module) {
  const t = Date.now(), { bytes, won, longest } = build();
  const packed = zlib.deflateRawSync(bytes, { level: 9 });
  fs.writeFileSync(path.join(__dirname, '..', 'tablebase', 'krrk.bin'), packed);
  console.log('KRRK: ' + won + ' winning positions (rooks\' side to move), longest mate ' + longest + ' moves, ' + bytes.length + ' bytes → ' + packed.length + ' compressed, ' + ((Date.now() - t) / 1000).toFixed(1) + ' s.');
}
module.exports = { build, canon };
