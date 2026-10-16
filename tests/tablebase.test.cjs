'use strict';
// King + rook against a lone king (tablebase.js, tablebase/krk.bin): the table matches a fresh build, agrees with
// the makruk rules (makruk-rules.js) on sampled positions, and table play mates in exactly the moves it says.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../makruk-rules.js');
const T = require('../tablebase.js');
const B = require('../scripts/build-krk.cjs');

const bytes = new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'tablebase', 'krk.bin')));
const fresh = B.build();
assert.deepEqual(bytes, fresh.bytes, 'tablebase/krk.bin is up to date (node scripts/build-krk.cjs)');
assert.equal(fresh.longest, 16, 'longest king + rook mate is 16 moves');
T.use(bytes);

const at = s => ({ r: 8 - Number(s[1]), c: 'abcdefgh'.indexOf(s[0]) });
const other = s => s === 'white' ? 'black' : 'white';
let seed = 7;
const rand = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const sq = i => ({ r: i >> 3, c: i & 7 });
// A legal position with the rook side (white or red) to move.
function randomPosition() {
  for (;;) {
    const [a, b, c] = [rand(64), rand(64), rand(64)];
    if (a === b || a === c || b === c) continue;
    const side = rand(2) ? 'white' : 'black';
    const ps = [{ piece: 'king', side, at: sq(a) }, { piece: 'rook', side, at: sq(b) }, { piece: 'king', side: other(side), at: sq(c) }];
    if (Math.max(Math.abs(sq(a).r - sq(c).r), Math.abs(sq(a).c - sq(c).c)) <= 1) continue;
    if (R.inCheck(ps, other(side))) continue;
    return { ps, side };
  }
}
// Moves the rook side still needs with the lone king to move, from the rules alone and the table one move on.
function loneLeft(ps, lone) {
  const st = R.gameStatus(ps, lone);
  if (st.state === 'checkmate') return 0;
  if (st.state !== 'playing') return Infinity;
  return Math.max(...R.legalMoves(ps, lone).map(m => T.value(R.applyMove(ps, m.from, m.to))));
}
let checked = 0, wins = 0;
for (let i = 0; i < 1500; i++) {
  const { ps, side } = randomPosition(), v = T.value(ps);
  const best = Math.min(...R.legalMoves(ps, side).map(m => loneLeft(R.applyMove(ps, m.from, m.to), other(side))));
  // The table's distance is one more than the best the rules allow after the rook side's move (Infinity: no win).
  assert.equal(v, best === Infinity ? Infinity : best + 1, 'position ' + JSON.stringify(ps) + ' ' + side);
  if (v < Infinity) wins++;
  checked++;
}
// Table play from both sides mates in exactly the moves the table gives, and the lone king never escapes.
function playOut(ps, side) {
  const strong = side, start = T.value(ps);
  let pos = ps, turn = side, moves = 0;
  for (;;) {
    const st = R.gameStatus(pos, turn);
    if (st.state !== 'playing') return { start, moves, state: st.state };
    const b = T.bestMove(pos, turn);
    assert(b, 'a table move for ' + turn);
    if (turn === strong) moves++;
    pos = R.applyMove(pos, b.move.from, b.move.to); turn = other(turn);
  }
}
const pictured = playOut([{ piece: 'king', side: 'white', at: at('a1') }, { piece: 'rook', side: 'white', at: at('d4') }, { piece: 'king', side: 'black', at: at('e6') }], 'white');
assert.deepEqual(pictured, { start: 14, moves: 14, state: 'checkmate' }, 'ขุน ก1 เรือ ง4 against ขุน จ6: mate in 14');
let played = 0;
for (let i = 0; i < 150; i++) {
  const { ps, side } = randomPosition();
  if (T.value(ps) === Infinity) continue;
  const r = playOut(ps, side);
  assert.equal(r.state, 'checkmate'); assert.equal(r.moves, r.start, 'mates in the moves the table gives');
  played++;
}
// Not king + rook against king: no table move.
assert.equal(T.bestMove([{ piece: 'king', side: 'white', at: at('a1') }, { piece: 'met', side: 'white', at: at('d4') }, { piece: 'king', side: 'black', at: at('e6') }], 'white'), null);
console.log('KRK table verified: ' + fresh.won + ' wins, longest 16; ' + checked + ' positions agree with the rules (' + wins + ' wins); ' + played + ' games mate on time.');
