'use strict';
// The level map of the puzzle page: puzzle/levels.js is what scripts/build-puzzle-levels.cjs builds (60 levels in 6
// chapters, 10 puzzles each, easy first, no puzzle in two levels, each chapter from its group of piece sets), and
// puzzle/progress.js gives the stars, the order levels open in, the title and the stored progress.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const DATA = require('../puzzle/sets.js'), LEVELS = require('../puzzle/levels.js'), P = require('../puzzle/progress.js');
const B = require('../scripts/build-puzzle-levels.cjs');

// ---- The levels ----
assert.deepEqual(JSON.parse(JSON.stringify(B.build().levels)), LEVELS.levels, 'puzzle/levels.js is what the build script makes (rerun it)');
assert.equal(LEVELS.levels.length, 60, '60 levels');
assert.equal(LEVELS.chapters.length, 6, 'in 6 chapters');
assert.equal(LEVELS.perChapter, 10);
assert.equal(LEVELS.ranks.length, LEVELS.chapters.length + 1, 'a title to begin with and one for each chapter');
const sets = Object.fromEntries(DATA.sets.map(s => [s.id, s])), seen = new Set();
LEVELS.levels.forEach((lv, k) => {
  const n = k + 1, where = 'level ' + n;
  assert.equal(lv.chapter, Math.floor(k / 10), where + ': its chapter');
  assert.equal(lv.slots.length, 10, where + ': ten puzzles');
  const mates = lv.slots.map(x => x[1]);
  assert.deepEqual(mates, mates.slice().sort(), where + ': easy first');
  for (const [id, mate, i] of lv.slots) {
    assert(sets[id], where + ': set ' + id + ' exists');
    assert(i >= 0 && i < sets[id].count[mate], where + ': ' + id + ' has a mate-in-' + mate + ' puzzle number ' + i);
    const key = id + mate + ':' + i;
    assert(!seen.has(key), where + ': ' + key + ' is in no other level');
    seen.add(key);
    const defend = sets[id].defend.length, ch = lv.chapter;
    if (ch < 2) assert.equal(defend, 0, where + ': chapters 1–2 chase a lone king');
    else if (ch < 4) assert.equal(defend, 1, where + ': chapters 3–4 have one defending piece');
    else if (ch === 4) assert.equal(defend, 2, where + ': chapter 5 has two defending pieces');
    if (ch === 0 || ch === 2) assert.equal(mate, 1, where + ': chapters 1 and 3 are mate in 1');
    if (ch === 1 || ch === 3) assert(mate > 1, where + ': chapters 2 and 4 are mate in 2–3');
  }
});
// Rook, met and promoted pawn against a rook (met often in real games) has more levels than any other one-piece set.
const per = id => LEVELS.levels.flatMap(l => l.slots).filter(x => x[0] === id).length;
const one = DATA.sets.filter(s => s.defend.length === 1).map(s => s.id);
assert(one.every(id => id === 'rmf-r' || per(id) < per('rmf-r')), 'rmf-r has the most puzzles among the one-piece sets');
// The puzzle files hold every slot (the page fetches them).
for (const lv of LEVELS.levels) for (const [id, mate, i] of lv.slots) {
  const file = JSON.parse(fs.readFileSync(path.join(root, 'puzzle', 'sets', id + '.json'), 'utf8'));
  assert(file.filter(p => p.mate === mate)[i], id + ' mate-in-' + mate + ' #' + i + ' is in its file');
}

// ---- Stars ----
const r = (ok, hint, miss) => [].concat(Array(ok).fill('ok'), Array(hint).fill('hint'), Array(miss).fill('miss'));
assert.equal(P.starsFor(r(10, 0, 0)), 3, 'all 10 with no hint: 3 stars');
assert.equal(P.starsFor(r(9, 1, 0)), 2, 'all 10 with a hint: 2 stars');
assert.equal(P.starsFor(r(0, 10, 0)), 2);
assert.equal(P.starsFor(r(9, 0, 1)), 2, '9 solved: 2 stars');
assert.equal(P.starsFor(r(7, 0, 3)), 1, '7 solved: passed with 1 star');
assert.equal(P.starsFor(r(5, 1, 4)), 0, '6 solved: not passed');

// ---- Progress ----
let s = P.load(null);
assert.deepEqual(s, { stars: {} }, 'nothing stored: level 1');
assert.equal(P.current(s), 1);
assert(P.open(s, 1) && !P.open(s, 2), 'only level 1 is open at first');
assert.equal(P.rank(s, LEVELS).name, LEVELS.ranks[0].name);
let rec = P.record(s, 1, r(6, 0, 4), LEVELS);
assert(!rec.passed && P.current(rec.state) === 1, 'a fail keeps the level');
rec = P.record(rec.state, 1, r(8, 0, 2), LEVELS);
assert(rec.passed && rec.stars === 1 && P.current(rec.state) === 2 && P.open(rec.state, 2), 'a pass opens the next level');
rec = P.record(rec.state, 1, r(6, 0, 4), LEVELS);
assert.equal(rec.best, 1, 'a worse replay keeps the best stars');
rec = P.record(rec.state, 1, r(10, 0, 0), LEVELS);
assert.equal(rec.state.stars[1], 3, 'a better replay raises them');
assert.equal(P.totalStars(rec.state), 3);
s = rec.state;
for (let n = 2; n <= 9; n++) { rec = P.record(s, n, r(7, 0, 3), LEVELS); s = rec.state; assert.equal(rec.rankUp, null); }
rec = P.record(s, 10, r(7, 0, 3), LEVELS);
assert.equal(rec.rankUp && rec.rankUp.name, LEVELS.ranks[1].name, 'passing the last level of chapter 1 gives the next title');
assert.equal(P.record(rec.state, 10, r(10, 0, 0), LEVELS).rankUp, null, 'a replay gives no title twice');
assert.equal(P.chaptersDone(rec.state, LEVELS), 1);
assert.equal(P.current(rec.state), 11, 'LV 11 after ten levels');
// Storage: round trip, broken data, reset.
const mem = { data: {}, getItem(k) { return k in this.data ? this.data[k] : null; }, setItem(k, v) { this.data[k] = String(v); } };
assert(P.save(rec.state, mem));
assert.deepEqual(P.load(mem), rec.state, 'progress is stored and read back');
mem.data[P.KEY] = '{not json';
assert.deepEqual(P.load(mem), { stars: {} }, 'broken data starts again at level 1');
mem.data[P.KEY] = JSON.stringify({ stars: { 1: 3, 2: 7, x: 2, 3: '2', 4: 0 } });
assert.deepEqual(P.load(mem), { stars: { 1: 3 } }, 'only whole level numbers with 1–3 stars are kept');
assert.deepEqual(P.reset(mem), { stars: {} });
assert.deepEqual(P.load(mem), { stars: {} }, 'reset starts again at level 1');
const broken = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
assert.deepEqual(P.load(broken), { stars: {} }, 'blocked storage still plays');
assert.equal(P.save(s, broken), false);
// Endless levels past 60 open in turn too.
const all = { stars: {} };
for (let n = 1; n <= 60; n++) all.stars[n] = 1;
assert.equal(P.current(all), 61);
assert.equal(P.rank(all, LEVELS).name, LEVELS.ranks[6].name, 'all six chapters: the last title');

// ---- The page ----
const html = fs.readFileSync(path.join(root, 'puzzle', 'index.html'), 'utf8'), js = fs.readFileSync(path.join(root, 'puzzle', 'puzzle.js'), 'utf8');
for (const id of ['map', 'mapPath', 'playBtn', 'freeBtn', 'resetLevels', 'sumStars', 'sumNext', 'sumMap', 'rankUp']) assert(html.includes('id="' + id + '"'), 'the page has #' + id);
// The result: boxes of numbers (solved, hints when used, missed, time) and a two-line tip instead of one long sentence,
// with one big button across for what to do next.
assert(html.includes('id="sumTiles"') && html.includes('id="sumTip"') && !html.includes('id="sumText"') && /\.sumFoot \.btn\.main\{flex:1 0 100%/.test(html), 'the result page shows boxes, a tip and one big button');
assert(js.includes("tile('ok', ok + hinted, 'แก้ได้')") && js.includes("(hinted ? tile('hint', hinted, 'คำใบ้') : '')") && js.includes("tip('อยากได้ 3 ดาว?', 'ทำถูกทุกข้อ ไม่ใช้คำใบ้')"), 'the boxes and the tip');
assert(js.includes("main(rec.passed ? $('sumNext') : $('sumAgain'))"), 'the next level is the big button, or trying again after a fail');
// Phones: the board takes the height the other parts leave, measured in the browser at hand (in-app browsers such as
// Facebook's show less of the page), never wider than the screen; wide screens keep the CSS size.
assert(/function fitBoard\(\)/.test(js) && js.includes("['.head', '.coach', '.stats', '.bar']") && js.includes("root.style.setProperty('--boardSize'") && js.includes("root.style.removeProperty('--boardSize')"), 'the board fits the space measured on the phone');
assert(/new ResizeObserver\(refit\)\.observe\(\$\('app'\)\)/.test(js) && /refit\(\);\s*\n\s*render\(\);/.test(js), 'the board fits again when the screen changes and when a puzzle starts');
assert(/\.statRow\{[^}]*height:30px/.test(html) && /\.bar\{[^}]*min-height:calc\(78px/.test(html), 'the rows under the board keep one height, so the board never moves');
// Under the board only the clock, one thick bar in ten parts (which puzzle and how each went, in words for screen
// readers) and the level coin: no other numbers to mix up.
assert(html.includes('id="lvBadge"') && /\.track\{display:flex;height:14px/.test(html) && !html.includes('id="count"') && !/\.tag\{/.test(html), 'the clock, one bar and a level coin, nothing else');
assert(js.includes("$('track').setAttribute('aria-label', say)") && js.includes("lv.textContent = session.level") && !js.includes("$('count')"), 'the bar says which puzzle in words; the coin shows the level');
assert(html.indexOf('puzzle/levels.js') < html.indexOf('puzzle/puzzle.js') && html.indexOf('puzzle/progress.js') < html.indexOf('puzzle/puzzle.js'), 'levels and progress load before the page script');
assert(/if \(!cameBack\(\)\) showMap\(\);\s*\}\)\(\);\s*$/.test(js), 'the page opens on the level map (or back on the puzzle left for the analysis page)');
console.log('Puzzle levels verified: ' + LEVELS.levels.length + ' levels in ' + LEVELS.chapters.length + ' chapters (' + seen.size + ' puzzles, none twice), stars, unlocking, titles and stored progress.');
