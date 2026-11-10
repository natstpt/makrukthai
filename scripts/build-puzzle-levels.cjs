#!/usr/bin/env node
// Builds puzzle/levels.js, the level map of the puzzle page (puzzle/): 70 levels in 7 chapters, each level a set of 10
// puzzles from puzzle/sets.js, from easy to hard. A level always holds the same puzzles (so stars are fair to replay)
// and no puzzle is in two levels. After level 70 the page makes endless levels at random from every set.
//   node scripts/build-puzzle-levels.cjs
'use strict';
const fs = require('fs'), path = require('path');
const DATA = require('../puzzle/sets.js');

const LONE = ['r', 'rr', 'rn', 'rs', 'rm', 'rp', 'ns', 'nm', 'nn', 'ss', 'sm', 'mf'];
const BIG = ['r', 'rr', 'rm', 'rs', 'rn', 'rp'];
const ONE = DATA.sets.filter(s => s.defend.length === 1).map(s => s.id);
const TWO = DATA.sets.filter(s => s.defend.length === 2).map(s => s.id);
// The corner sets added later (chapter 7) stay out of the earlier chapters, so levels 1–60 keep their puzzles.
const CORNER = ['pp', 'fff-c', 'fff-x', 'nff', 'nff2-x', 'nff2-c', 'nnf-c', 'nnf-x'];
const ALL = DATA.sets.map(s => s.id).filter(id => !CORNER.includes(id));
// A level: its sets and how many puzzles of each mate count [in 1, in 2, in 3].
const L = (sets, m1, m2, m3) => ({ sets, want: [m1, m2, m3] });
const ROOK_MET = ['rmf-r', 'rm-r', 'r-r']; // the rook endings met most in real games (rook, met and promoted pawn against a rook most)
const CHAPTERS = [
  { title: 'ไล่ขุนตัวเดียว', sub: 'จนใน 1 ตา', levels: [
    L(['rr'], 10, 0, 0), L(['r'], 10, 0, 0), L(['rm', 'rs'], 10, 0, 0), L(['rn', 'rp'], 10, 0, 0), L(BIG, 10, 0, 0),
    L(['ss', 'sm'], 10, 0, 0), L(['ns', 'nm'], 10, 0, 0), L(['nn', 'mf'], 10, 0, 0), L(LONE, 10, 0, 0), L(LONE, 10, 0, 0)] },
  { title: 'ไล่ขุนตัวเดียว', sub: 'จนใน 2–3 ตา', levels: [
    L(['rr'], 0, 10, 0), L(['r'], 0, 10, 0), L(['rm', 'rs'], 0, 10, 0), L(['rn', 'rp'], 0, 10, 0), L(['rr', 'r'], 0, 6, 4),
    L(['rm', 'rs', 'rn', 'rp'], 0, 6, 4), L(['ss', 'sm', 'mf'], 0, 10, 0), L(['ns', 'nm'], 0, 10, 0), L(BIG, 0, 0, 10), L(LONE, 0, 5, 5)] },
  { title: 'ฝ่ายรับมีหมาก 1 ตัว', sub: 'จนใน 1 ตา', levels: [
    L(['rr-r', 'rr-n', 'rr-s'], 10, 0, 0), L(['r-m', 'r-s', 'r-n'], 10, 0, 0), L(['r-r', 'rm-r'], 10, 0, 0), L(['rmf-r'], 10, 0, 0),
    L(['rn-m', 'rn-n'], 10, 0, 0), L(['rs-m', 'rs-s'], 10, 0, 0), L(['rm-n', 'rm-m'], 10, 0, 0), L(['s-m'], 10, 0, 0),
    L(ROOK_MET, 10, 0, 0), L(ONE, 10, 0, 0)] },
  { title: 'ฝ่ายรับมีหมาก 1 ตัว', sub: 'จนใน 2–3 ตา', levels: [
    L(['rr-r', 'rr-n', 'rr-s'], 0, 10, 0), L(['r-m', 'r-s', 'r-n'], 0, 10, 0), L(['rmf-r'], 0, 10, 0), L(['r-r', 'rm-r'], 0, 10, 0),
    L(['rmf-r'], 0, 5, 5), L(['rn-m', 'rn-n', 'rs-m', 'rs-s'], 0, 10, 0), L(['rm-n', 'rm-m', 's-m'], 0, 10, 0), L(['rmf-r'], 0, 0, 10),
    L(['rr-r', 'rr-n', 'rr-s', 'r-m', 'r-s', 'r-n', 'r-r'], 0, 0, 10), L(ONE, 0, 5, 5)] },
  { title: 'ฝ่ายรับมีหมาก 2 ตัว', sub: 'จนใน 1–3 ตา', levels: [
    L(['rr-rs'], 10, 0, 0), L(['rm-nm', 'rm-sm'], 10, 0, 0), L(TWO, 10, 0, 0), L(['rr-rs'], 0, 10, 0), L(['rm-nm', 'rm-sm'], 0, 10, 0),
    L(TWO, 4, 6, 0), L(TWO, 0, 10, 0), L(['rr-rs'], 0, 0, 10), L(['rm-nm', 'rm-sm'], 0, 0, 10), L(TWO, 0, 5, 5)] },
  { title: 'รวมทุกแบบ', sub: 'จนใน 1–3 ตา', levels: [
    L(ALL, 3, 4, 3), L(ALL, 3, 4, 3), L(ALL, 3, 4, 3), L(ROOK_MET, 2, 4, 4), L(ALL, 3, 4, 3),
    L(ALL, 2, 4, 4), L(ALL, 2, 4, 4), L(ROOK_MET, 0, 5, 5), L(ALL, 2, 4, 4), L(ALL, 0, 5, 5)] },
  { title: 'ไล่ขุนเข้ามุม', sub: 'เบี้ย เบี้ยหงาย และม้า', levels: [
    L(['pp'], 10, 0, 0), L(['fff-c', 'fff-x'], 10, 0, 0), L(['nff', 'nff2-c', 'nff2-x'], 10, 0, 0), L(['nnf-c', 'nnf-x'], 10, 0, 0),
    L(['pp'], 0, 6, 4), L(['fff-c', 'fff-x'], 0, 6, 4), L(['nff', 'nff2-c', 'nff2-x'], 0, 6, 4), L(['nnf-c', 'nnf-x'], 0, 6, 4),
    L(CORNER, 0, 5, 5), L(CORNER, 0, 0, 10)] }
];
// The title a learner holds: the first before any chapter is done, then one more for each chapter, with the piece
// that stands beside the end of that chapter on the map.
const RANKS = [
  { name: 'เบี้ยน้อย', piece: 'pawn' }, { name: 'เบี้ยหงาย', piece: 'promoted' }, { name: 'โคนกล้า', piece: 'khon' },
  { name: 'ม้าเร็ว', piece: 'knight' }, { name: 'เรือใหญ่', piece: 'rook' }, { name: 'ขุนพล', piece: 'met' }, { name: 'จอมทัพ', piece: 'king' },
  { name: 'เซียนหมากรุก', piece: 'king' }
];

function seeded(text) {
  let seed = 20261107;
  for (const ch of text) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  return n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };
}

function build() {
  const count = {}, used = new Set(), levels = [];
  for (const s of DATA.sets) count[s.id] = s.count;
  CHAPTERS.forEach((ch, c) => ch.levels.forEach((lv, k) => {
    const rnd = seeded('level' + (c * 10 + k + 1)), slots = [];
    lv.want.forEach((want, m) => {
      const mate = m + 1;
      for (let j = 0; j < want; j++) {
        // A set at random first (so the sets take turns), then one of its puzzles not used by any level yet.
        const open = lv.sets.filter(id => Array.from({ length: count[id][mate] || 0 }, (_, i) => i).some(i => !used.has(id + mate + ':' + i)));
        if (!open.length) throw Error('level ' + (c * 10 + k + 1) + ': no mate-in-' + mate + ' puzzle left in ' + lv.sets.join(','));
        const id = open[rnd(open.length)], free = [];
        for (let i = 0; i < count[id][mate]; i++) if (!used.has(id + mate + ':' + i)) free.push(i);
        const i = free[rnd(free.length)];
        used.add(id + mate + ':' + i);
        slots.push([id, mate, i]);
      }
    });
    levels.push({ chapter: c, slots });
  }));
  return {
    chapters: CHAPTERS.map(ch => ({ title: ch.title, sub: ch.sub })),
    ranks: RANKS, perChapter: 10, levels
  };
}

function write(out) {
  const body = '/* Generated by scripts/build-puzzle-levels.cjs: the level map of the puzzle page. Each level holds 10 puzzles as\n' +
    ' * [set id, mate count, index among that set\'s puzzles of that mate count in puzzle/sets/<id>.json]. */\n' +
    '(function (root) {\n  var data = ' + JSON.stringify(out.chapters ? { chapters: out.chapters, ranks: out.ranks, perChapter: out.perChapter } : {}).slice(0, -1) +
    ',"levels":[\n' + out.levels.map(l => '    ' + JSON.stringify(l)).join(',\n') + '\n  ]};\n' +
    '  if (typeof module === \'object\' && module.exports) module.exports = data;\n  if (root) root.MakrukPuzzleLevels = data;\n' +
    '})(typeof window !== \'undefined\' ? window : null);\n';
  fs.writeFileSync(path.join(__dirname, '..', 'puzzle', 'levels.js'), body);
  return body;
}

if (require.main === module) {
  const out = build();
  const body = write(out);
  console.log('puzzle/levels.js: ' + out.levels.length + ' levels in ' + out.chapters.length + ' chapters (' + Math.round(body.length / 1024) + ' KB)');
}
module.exports = { build, CHAPTERS, RANKS, CORNER };
