'use strict';
// The puzzle page (puzzle/): every puzzle in puzzle/sets/<id>.json (scripts/build-mate-puzzles.cjs) is a legal position
// whose side to move mates in exactly the moves it says, by a move search with makruk-rules.js and by the endgame
// tables; its tree takes every move that mates as fast or faster (no right move is called wrong) and answers with a
// longest defence. The sets made from the tables on the author's computer only (tablebase-local/) are checked against
// those tables when the local server (makruk-tb serve) is running; elsewhere, as on GitHub, by the move search alone.
// Also puzzle/sets.js, the page's rules (puzzle/puzzle-core.js) and the links between the site's pages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const R = require('../makruk-rules.js');
const T = require('../tablebase.js');
const M = require('../editor-model.js');
const C = require('../puzzle/puzzle-core.js');
const DATA = require('../puzzle/sets.js');
const B = require('../scripts/build-mate-puzzles.cjs');

const root = path.join(__dirname, '..'), dir = path.join(root, 'tablebase');
const open = f => new Uint8Array(zlib.inflateRawSync(fs.readFileSync(f)));
T.use(new Uint8Array(fs.readFileSync(path.join(dir, 'krk.bin'))), open(path.join(dir, 'krrk.bin')));
for (const name of T.NAMES) T.useTable(name, open(path.join(dir, name + '.bin')));
for (const name of ['KRvKM', 'KRvKR', 'KSvKM', 'KRMvKR']) {
  const info = JSON.parse(fs.readFileSync(path.join(dir, 'rs', name, 'info.json'), 'utf8')), parts = {};
  if (info.single) parts[0] = open(path.join(dir, 'rs', name, 'all.bin'));
  else for (let k = 0; k < info.positions / info.part; k++) if (!info.zero.includes(k)) parts[k] = open(path.join(dir, 'rs', name, k + '.bin'));
  T.useRs(name, info, parts);
}
const other = C.other, key = C.moveKey;

// A move search of its own (memoised): can side, to move, mate within n moves?
const memo = new Map();
const pkey = (ps, side) => side + ps.map(p => p.side[0] + p.piece + p.at.r + p.at.c).sort().join();
function wins(ps, side, n) {
  if (n <= 0) return false;
  const k = pkey(ps, side) + n;
  if (!memo.has(k)) memo.set(k, R.legalMoves(ps, side).some(m => mates(R.applyMove(ps, m.from, m.to), side, n)));
  return memo.get(k);
}
function mates(after, side, n) {
  const st = R.gameStatus(after, other(side)).state;
  if (st === 'checkmate') return true;
  if (st !== 'playing' || n <= 1) return false;
  return R.legalMoves(after, other(side)).every(r => wins(R.applyMove(after, r.from, r.to), side, n - 1));
}
const depth = (ps, side, max) => { for (let n = 1; n <= max; n++) if (wins(ps, side, n)) return n; return Infinity; };

// A tree node with `left` moves to play: exactly the moves that mate in time, each with a legal longest defence.
let nodes = 0;
function checkNode(ps, side, left, node, where) {
  nodes++;
  const want = R.legalMoves(ps, side).filter(m => mates(R.applyMove(ps, m.from, m.to), side, left)).map(key).sort();
  assert.deepEqual(Object.keys(node).sort(), want, where + ': the tree takes every move that mates within ' + left);
  for (const k of want) {
    const m = C.fromKey(k), after = R.applyMove(ps, m.from, m.to), hit = node[k];
    if (hit === '#') { assert.equal(R.gameStatus(after, other(side)).state, 'checkmate', where + ' ' + k + ' mates'); continue; }
    assert.notEqual(R.gameStatus(after, other(side)).state, 'checkmate', where + ' ' + k + ' is not mate, so it has a reply');
    const replies = R.legalMoves(after, other(side));
    const r = replies.find(x => key(x) === hit.r);
    assert(r, where + ' ' + k + ': the reply ' + hit.r + ' is legal');
    const next = R.applyMove(after, r.from, r.to), got = depth(next, side, left - 1);
    const longest = Math.max(...replies.map(x => depth(R.applyMove(after, x.from, x.to), side, left - 1)));
    assert.equal(got, longest, where + ' ' + k + ': ' + hit.r + ' holds out longest');
    checkNode(next, side, got, hit.n, where + ' ' + k + ' ' + hit.r);
  }
}

// ---- The puzzles ----
const ids = DATA.sets.map(s => s.id);
assert(DATA.sets.length >= 25, 'at least 25 piece sets');
assert.equal(new Set(ids).size, ids.length, 'set ids are unique');
const files = {}, ALL = [];
let bytes = 0;
for (const s of DATA.sets) {
  const f = path.join(root, 'puzzle', 'sets', s.id + '.json');
  bytes += fs.statSync(f).size;
  files[s.id] = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const n of [1, 2, 3]) assert.equal(files[s.id].filter(p => p.mate === n).length, s.count[n], s.id + ': sets.js counts its mate-in-' + n + ' puzzles');
  assert.deepEqual(files[s.id].map(p => p.mate), files[s.id].map(p => p.mate).sort(), s.id + ': its file is in mate order');
  assert.equal(s.on, s.defend.length < 2, s.id + ': chosen by default unless the defender has two pieces');
  const def = B.SETS.find(x => x.id === s.id);
  assert(def && def.label === s.label, s.id + ': a set of the build script');
  for (const p of files[s.id]) ALL.push(Object.assign({ set: s.id }, p));
}
assert(bytes <= 1024 * 1024, 'the puzzle files stay under 1 MB (' + Math.round(bytes / 1024) + ' KB)');
const big = DATA.sets.find(s => s.id === 'rmf-r');
assert(big && [1, 2, 3].every(n => big.count[n] > 30), 'rook, met and promoted pawn against a rook has more puzzles than the others');
const fens = new Set(), forLocal = [];
const count = {};
for (const p of ALL) {
  const where = p.set + ' ' + p.fen, set = B.SETS.find(s => s.id === p.set);
  assert([1, 2, 3].includes(p.mate), where + ': mate in 1, 2 or 3');
  assert(!fens.has(p.fen), where + ': no puzzle twice'); fens.add(p.fen);
  const st = M.parse(p.fen), ps = st.pieces, side = st.turn;
  assert.equal(M.validate(st), '', where + ': a legal position');
  assert(!R.inCheck(ps, side), where + ': the attacker is not in check');
  const kings = ps.filter(x => x.piece === 'king');
  assert(Math.max(Math.abs(kings[0].at.r - kings[1].at.r), Math.abs(kings[0].at.c - kings[1].at.c)) > 1, where + ': kings apart');
  // The pieces are the set's.
  const mine = ps.filter(x => x.side === side && x.piece !== 'king').map(x => x.piece).sort();
  const theirs = ps.filter(x => x.side !== side && x.piece !== 'king').map(x => x.piece).sort();
  assert.deepEqual(mine, set.attack.slice().sort(), where + ': attacking pieces');
  assert.deepEqual(theirs, set.defend.slice().sort(), where + ': defending pieces');
  // The tables (the local ones further down), then the move search.
  if (set.local) forLocal.push({ ps, side, mate: p.mate, where });
  else assert.deepEqual(set.defend.length ? T.result(ps, side) : { res: 'win', n: T.value(ps) }, { res: 'win', n: p.mate }, where + ': the tables say mate in ' + p.mate);
  assert.equal(depth(ps, side, 3), p.mate, where + ': the move search finds mate in exactly ' + p.mate);
  assert(Object.keys(p.tree).length <= 2, where + ': at most two first moves mate in time');
  checkNode(ps, side, p.mate, p.tree, where);
  // The local sets' quality rule: nothing hanging, and no first move of the solution a capture.
  if (set.local) {
    assert(!B.hanging(ps), where + ': no piece hangs');
    assert(Object.keys(p.tree).every(k => !ps.some(x => C.square(x.at) === k.slice(2))), where + ': the first move takes nothing');
  }
  count[p.set + p.mate] = (count[p.set + p.mate] || 0) + 1;
  if (memo.size > 2e6) memo.clear();
}
for (const s of DATA.sets) assert(files[s.id].length >= 10, s.id + ': at least ten puzzles');
for (const n of [1, 2, 3]) assert(ALL.filter(p => p.mate === n).length >= 100, 'plenty of mate-in-' + n + ' puzzles');
assert(ALL.some(p => M.parse(p.fen).turn === 'black') && ALL.some(p => M.parse(p.fen).turn === 'white'), 'both colours attack');
assert([0, 1, 2].every(g => DATA.sets.some(s => s.defend.length === g)), 'sets in all three groups of the settings');

// ---- puzzle-core: the set of 10 ----
let seed = 9;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) / 16777216; };
const all = { mates: [1, 2, 3], sets: ids };
const plan = C.plan(DATA, all, rnd);
assert.deepEqual(plan.map(p => p.mate), [1, 1, 1, 1, 2, 2, 2, 2, 3, 3], 'by default: 4 × mate in 1, 4 × in 2, 2 × in 3, easy first');
assert.equal(new Set(plan.map(p => p.set + p.mate + ':' + p.i)).size, 10, 'no puzzle twice in a set');
const filled = C.fill(plan, files);
assert(filled.every((p, i) => p.mate === plan[i].mate && files[p.set].some(x => x.fen === p.fen && x.mate === p.mate)), 'fill takes the planned puzzles from the set files');
assert.deepEqual(C.plan(DATA, { mates: [3, 2], sets: ids }, rnd).map(p => p.mate), [2, 2, 2, 2, 2, 3, 3, 3, 3, 3], 'two counts share the ten');
assert(C.plan(DATA, { mates: [2], sets: ['r', 'rr'] }, rnd).every(p => p.mate === 2 && ['r', 'rr'].includes(p.set)), 'only the chosen sets and counts');
assert.deepEqual(C.plan(DATA, { mates: [1], sets: [] }, rnd), [], 'no sets, no puzzles');
assert.deepEqual(C.plan(DATA, { mates: [], sets: ids }, rnd), [], 'no mate counts, no puzzles');
// A set with no mate in 3 for knights (only mate in 1): mate in 1 tops the ten up.
const nn = DATA.sets.find(s => s.id === 'nn');
if (nn) {
  const few = C.plan(DATA, { mates: [1, 3], sets: ['nn'] }, rnd);
  assert.equal(few.length, Math.min(10, ALL.filter(p => p.set === 'nn' && [1, 3].includes(p.mate)).length), 'topped up from the other count');
}
assert.equal(C.available(DATA, all), ALL.length);

// ---- puzzle-core: moves ----
{
  const p = ALL.find(x => x.mate === 2), st = M.parse(p.fen);
  const k = Object.keys(p.tree)[0], res = C.step(p.tree, C.fromKey(k));
  assert(res.ok && !res.mate && res.reply && res.node, 'a tree move gets its reply');
  const bad = R.legalMoves(st.pieces, st.turn).find(m => !p.tree[key(m)]);
  assert.deepEqual(C.step(p.tree, bad), { ok: false }, 'any other move is wrong');
  const why = C.refute(R.applyMove(st.pieces, bad.from, bad.to), st.turn, 2);
  assert(['stalemate', 'capture', 'escape'].includes(why.kind) && why.text, 'a wrong move gets a reason');
  if (why.reply) assert(!wins(R.applyMove(R.applyMove(st.pieces, bad.from, bad.to), why.reply.from, why.reply.to), st.turn, 1), 'the shown defence stops mate in time');
  const line = C.line(p.tree);
  assert.equal(line.length, 3, 'the book line of mate in 2: move, reply, mate');
  let ps = st.pieces;
  line.forEach(m => { ps = R.applyMove(ps, m.from, m.to); });
  assert.equal(R.gameStatus(ps, other(st.turn)).state, 'checkmate', 'the book line ends in mate');
}
{
  // A move that stalemates is named so (the first such move among the puzzles).
  let stale = null;
  for (const p of ALL) {
    const st = M.parse(p.fen);
    const m = R.legalMoves(st.pieces, st.turn).find(x => R.gameStatus(R.applyMove(st.pieces, x.from, x.to), other(st.turn)).state === 'stalemate');
    if (m) { stale = { after: R.applyMove(st.pieces, m.from, m.to), side: st.turn }; break; }
  }
  assert(stale, 'some puzzle has a stalemating move');
  assert.deepEqual([C.refute(stale.after, stale.side, 1).kind, C.refute(stale.after, stale.side, 1).reply], ['stalemate', null], 'stalemate is named');
  // A hanging rook is taken.
  const ps2 = [{ piece: 'king', side: 'black', at: { r: 0, c: 4 } }, { piece: 'king', side: 'white', at: { r: 7, c: 0 } }, { piece: 'rook', side: 'white', at: { r: 5, c: 3 } }];
  const after2 = R.applyMove(ps2, { r: 5, c: 3 }, { r: 1, c: 3 });
  const why2 = C.refute(after2, 'white', 2);
  assert.equal(why2.kind, 'capture'); assert.equal(key(why2.reply), 'e8d7');
}

// ---- The pages ----
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const home = read('index.html');
for (const href of ['learn/', 'ai/', 'puzzle/']) assert(home.includes('href="' + href + '"'), 'the home page links to ' + href);
assert(home.includes("location.replace('learn/#credits')"), 'old links to the credits go on to the lessons');
const learn = read('learn/index.html'), puzzle = read('puzzle/index.html');
for (const [name, html] of [['learn', learn], ['puzzle', puzzle]]) {
  assert(html.includes('<base href="../">'), name + ' loads its files from the site root');
  for (const [, src] of html.matchAll(/<script src="([^"?]+)/g)) assert(fs.existsSync(path.join(root, src)), name + ': ' + src + ' exists');
}
assert(learn.includes('class="brand" href="./"'), 'the lessons link back home');
assert(read('editor.html').includes('<a href="learn/" class="back">'), 'the editor links to the lessons at learn/');
assert(puzzle.includes('id="settingsBtn"'), 'the puzzle page has the settings button');
assert(!/localStorage/.test(read('puzzle/puzzle.js')), 'the puzzle settings are not remembered');
assert(puzzle.includes('id="musicBtn"') && puzzle.includes('id="effectsBtn"'), 'the puzzle page has the music and effects buttons');
assert(puzzle.indexOf('src="presentation.js') >= 0 && puzzle.indexOf('src="presentation.js') < puzzle.indexOf('src="puzzle/puzzle.js'), 'the puzzle page loads the sounds before its script');
const pjs = read('puzzle/puzzle.js');
for (const kind of ['success', 'failure', 'set', 'perfect']) assert(pjs.includes("'" + kind + "'"), 'the puzzle page plays the ' + kind + ' sound');
assert(puzzle.includes('id="drawLayer"') && /e\.button === 2/.test(pjs) && /contextmenu/.test(pjs), 'the puzzle page draws arrows and marks with the right mouse button, as the AI page does');
// The clock runs until the puzzle is done: a wrong move only settles the result, and the clock stops at mate, when the
// solution is shown or on the next puzzle.
const fn = name => { const i = pjs.indexOf('function ' + name + '('); assert(i >= 0, name + ' exists'); const j = pjs.indexOf('\n  function ', i + 1); return pjs.slice(i, j < 0 ? undefined : j); };
assert(!/elapsed|stopClock|times/.test(fn('settle')), 'settling the result does not stop the clock');
assert(!/stopClock/.test(fn('wrongMove')) && !/stopClock/.test(fn('retry')), 'the clock runs on after a wrong move');
for (const f of ['solved', 'showSolution', 'nextPuzzle']) assert(/stopClock\(\)/.test(fn(f)), f + ' stops the clock');
assert(/session\.times\[session\.index\] = cur\.elapsed/.test(fn('stopClock')), 'the stopped time goes to the summary');
assert(/if \(!cur\.stopped\) cur\.elapsed/.test(fn('tick')), 'the clock counts while not stopped');
// Wide screens: the board beside a column for the coach, clock and buttons, as big as on the AI page.
assert(/@media \(min-width:900px\) and \(orientation:landscape\)\{\s*:root\{--boardSize:min\(65vw,70vh/.test(puzzle) && /\.app:not\(\.onMap\)\{display:grid/.test(puzzle), 'wide screens put the board beside the coach column, as big as on the AI page');
// The board looks as on the AI page: a 2px rounded frame, 1px lines and bold coordinates; tablets get a board as big as
// the screen allows; the map is plain board colour; the words suit anyone (no titles word, no children or teachers).
assert(/\.board\{[^}]*border:2px solid #ab9558;border-radius:6px/.test(puzzle) && /\.sq:before\{[^}]*inset -1px -1px #756332/.test(puzzle), 'the puzzle board has the AI page frame and lines');
assert(/\.coord\{[^}]*font-weight:bold;color:#574819/.test(puzzle) && /\.coord\.rank\{left:4px;top:4px\}\.coord\.file\{right:4px;bottom:4px\}/.test(puzzle), 'coordinates as on the AI page');
assert(/\(min-width:600px\) and \(orientation:portrait\)/.test(puzzle) && /\(pointer:coarse\)/.test(puzzle), 'tablets get a bigger board, upright and lying down');
assert(/\.mapScroll\{[^}]*background-color:var\(--board\)/.test(puzzle) && !/repeating-conic-gradient/.test(puzzle), 'the level map is one plain board colour');
for (const w of ['ยศ', 'เด็ก', 'ครู']) assert(!puzzle.includes(w) && !pjs.includes(w), 'the puzzle page does not say ' + w);
// The coach's box keeps one height and the solved words carry no move list, so the board never moves; the analysis
// page links back to the puzzle, which the puzzle page keeps for that tab and puts back.
assert(/\.coach\{[^}]*height:108px;flex-shrink:0/.test(puzzle) && /\.speech\{[^}]*height:90px;overflow:hidden/.test(puzzle) && /\.say2\{[^}]*-webkit-line-clamp:2/.test(puzzle), 'the speech box has one height');
assert(/\.head\{[^}]*flex-shrink:0/.test(puzzle), 'the header never shrinks (which would move the board)');
assert(!/cur\.lines/.test(pjs), 'no move list in the coach');
assert(/from=puzzle/.test(fn('analyse')) && /sessionStorage\.setItem\(BACK/.test(fn('analyse')), 'the analysis page is opened with the puzzle kept');
assert(/back_forward/.test(fn('cameBack')) && /back=1/.test(fn('cameBack')), 'the puzzle comes back by the link or the browser back');
const ejs = read('editor.js');
assert(/get\('from'\)==='puzzle'/.test(ejs) && ejs.includes("backLink.href='puzzle/?back=1'") && ejs.includes('← กลับไปโจทย์'), 'the analysis page links back to the puzzle');
assert(read('index.html').includes('<small>ลองเลือกได้เลย 🙂</small>'), 'the home page greeting is short');

// ---- The local sets against the tables on this computer, when its server runs ----
(async () => {
  let served = null;
  try { const res = await fetch(B.LOCAL + '/status', { signal: AbortSignal.timeout(1500) }); served = res.ok ? (await res.json()).tables : null; } catch (e) {}
  let local = 'the local sets checked by the move search only (no local server)';
  if (served) {
    for (const q of forLocal) {
      const a = await (await fetch(B.LOCAL + '/probe?fen=' + encodeURIComponent(T.fenOf(q.ps, q.side)))).json();
      assert(a.covered, q.where + ': a local table covers it');
      assert.deepEqual(a.result, { res: 'win', n: q.mate }, q.where + ': the local tables say mate in ' + q.mate);
    }
    local = forLocal.length + ' local-set puzzles also checked against the local tables';
  }
  console.log('Mate puzzles verified: ' + ALL.length + ' puzzles in ' + DATA.sets.length + ' sets (' + Math.round(bytes / 1024) + ' KB), ' + nodes + ' tree nodes checked; ' + local + '.');
})().catch(e => { console.error(e); process.exit(1); });
