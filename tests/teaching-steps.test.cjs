'use strict';
// Endgame teaching boards go one move at a time around each red reply: a step that starts "ขุนแดงหนี/เดิน/กลับ…" is exactly
// one legal red move after the step before it, and the step after it is exactly one legal white move later.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Rules = require('../makruk-rules.js');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'endgame-lessons.js'), 'utf8'), ctx);
const lessons = JSON.parse(JSON.stringify(ctx.window.buildEndgameLessons()));
const key = p => p.side + p.piece + p.at.r + p.at.c;
function oneMove(a, b, side, label) {
  const after = new Set(b.map(key)), before = new Set(a.map(key));
  const gone = a.filter(p => !after.has(key(p))), come = b.filter(p => !before.has(key(p)));
  const moved = gone.filter(p => p.side === side);
  assert.equal(moved.length, 1, label + ': one ' + side + ' piece moves');
  const to = come.find(p => p.side === side);
  assert(to, label + ': it lands on a square');
  const next = Rules.applyMove(a, moved[0].at, to.at);
  assert(Rules.legalDestinations(a, moved[0].at).some(d => d.r === to.at.r && d.c === to.at.c), label + ': legal move');
  assert.deepEqual(next.map(key).sort(), b.map(key).sort(), label + ': nothing else changes');
}
let replies = 0;
for (const l of lessons) {
  const b = l.teachingBoards || [];
  b.forEach((step, i) => {
    if (!/^ขุนแดง(หนี|เดิน|กลับ)/.test(step.text)) return;
    oneMove(b[i - 1].pieces, step.pieces, 'black', l.id + ' step ' + (i + 1));
    if (b[i + 1]) oneMove(step.pieces, b[i + 1].pieces, 'white', l.id + ' step ' + (i + 2));
    replies++;
  });
}
assert(replies >= 15, 'red replies are shown step by step');
console.log('Teaching steps verified: ' + replies + ' red replies, each one move after the white move before it.');
