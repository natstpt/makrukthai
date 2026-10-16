'use strict';
// Builds tablebase/krk.bin: every king + rook vs lone king position with the rook side to move, and how many of its
// moves the fastest mate takes against the best defence (0 = no win: drawn, or the rook is lost). Makruk king and
// rook move as in chess, and a stalemate (อับ) is a draw, so the table is the usual KRK retrograde analysis.
// Squares are 0..63 from ก1 (a1) along each rank. The table keeps the strong king on 10 squares (a1 b1 c1 d1 b2 c2
// d2 c3 d3 d4); any position maps there by one of the 8 symmetries of the board. Layout:
// value[tri(strongKing) * 4096 + rook * 64 + loneKing], one byte each (40 960 bytes).
// Run: node scripts/build-krk.cjs
const fs = require('node:fs');
const path = require('node:path');

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
// Squares the rook attacks, blocked by the given squares (it stops on a blocker, which it could take).
function rookRays(rook, blockers) {
  const out = [];
  for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let f = file(rook) + df, r = rank(rook) + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) { const s = sq(f, r); out.push(s); if (blockers.includes(s)) break; f += df; r += dr; }
  }
  return out;
}
const rookHits = (rook, target, blockers) => rookRays(rook, blockers).includes(target);
const idx = (wk, wr, bk) => wk * 4096 + wr * 64 + bk;

// Positions with the rook side to move (A) and with the lone king to move (D).
function build() {
const N = 64 * 64 * 64;
const legalA = new Uint8Array(N), legalD = new Uint8Array(N);
for (let wk = 0; wk < 64; wk++) for (let wr = 0; wr < 64; wr++) for (let bk = 0; bk < 64; bk++) {
  if (wk === wr || wk === bk || wr === bk || near(wk, bk)) continue;
  const i = idx(wk, wr, bk);
  legalD[i] = 1;
  if (!rookHits(wr, bk, [wk])) legalA[i] = 1; // the lone king just moved: it cannot be in check
}
// Rook side's moves from A position (wk, wr, bk) → D positions.
function attackerMoves(wk, wr, bk) {
  const out = [];
  for (const t of KING[wk]) if (t !== wr && !near(t, bk)) out.push(idx(t, wr, bk));
  for (const t of rookRays(wr, [wk, bk])) if (t !== wk && t !== bk) out.push(idx(wk, t, bk));
  return out;
}
// Lone king's moves from D position: A positions, or -1 for taking the rook (a draw).
function defenderMoves(wk, wr, bk) {
  const out = [];
  for (const t of KING[bk]) {
    if (near(t, wk) || t === wk) continue;
    if (t === wr) { out.push(-1); continue; } // takes the rook (not guarded: not next to the strong king)
    if (rookHits(wr, t, [wk])) continue;
    out.push(idx(wk, wr, t));
  }
  return out;
}
const A = new Uint8Array(N), D = new Int16Array(N).fill(-1); // A: moves to mate (0 unknown); D: moves left (-1 unknown)
const dMoves = new Array(N);
for (let i = 0; i < N; i++) if (legalD[i]) {
  const wk = i >> 12, wr = (i >> 6) & 63, bk = i & 63, m = defenderMoves(wk, wr, bk);
  dMoves[i] = m;
  if (!m.length && rookHits(wr, bk, [wk])) D[i] = 0; // checkmate
}
for (let n = 1; ; n++) {
  let changed = 0;
  for (let i = 0; i < N; i++) if (legalA[i] && !A[i]) {
    const wk = i >> 12, wr = (i >> 6) & 63, bk = i & 63;
    if (attackerMoves(wk, wr, bk).some(d => D[d] === n - 1)) { A[i] = n; changed++; }
  }
  for (let i = 0; i < N; i++) if (legalD[i] && D[i] < 0 && dMoves[i].length) {
    let worst = 0, ok = true;
    for (const a of dMoves[i]) { if (a < 0 || !A[a]) { ok = false; break; } worst = Math.max(worst, A[a]); }
    if (ok) D[i] = worst;
  }
  if (!changed) break;
}
// The 8 symmetries; tri(): index of a strong-king square in a1 b1 c1 d1 b2 c2 d2 c3 d3 d4.
const TRI = [sq(0, 0), sq(1, 0), sq(2, 0), sq(3, 0), sq(1, 1), sq(2, 1), sq(3, 1), sq(2, 2), sq(3, 2), sq(3, 3)];
const out = new Uint8Array(TRI.length * 4096);
TRI.forEach((wk, t) => { for (let wr = 0; wr < 64; wr++) for (let bk = 0; bk < 64; bk++) out[t * 4096 + wr * 64 + bk] = A[idx(wk, wr, bk)]; });
let won = 0, longest = 0;
for (let i = 0; i < N; i++) if (A[i]) { won++; longest = Math.max(longest, A[i]); }
return { bytes: out, won, longest, full: A };
}
if (require.main === module) {
  const { bytes, won, longest } = build();
  fs.mkdirSync(path.join(__dirname, '..', 'tablebase'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'tablebase', 'krk.bin'), bytes);
  console.log('KRK: ' + won + ' winning positions (rook side to move), longest mate ' + longest + ' moves, ' + bytes.length + ' bytes.');
}
module.exports = { build };
