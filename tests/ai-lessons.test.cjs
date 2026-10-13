'use strict';
// Play-the-computer lessons (ai-lessons.js): one per AI level, in the lesson order just before เล่นจริง, each with
// teaching boards that are sensible positions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../makruk-rules.js');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'ai-lessons.js'), 'utf8'), ctx);
const lessons = JSON.parse(JSON.stringify(ctx.window.buildAiLessons()));
assert.deepEqual(lessons.map(l => [l.id, l.aiLevel, l.title]), [
  ['ai-easy', 'easy', 'เล่นกับ AI (ง่าย)'], ['ai-medium', 'medium', 'เล่นกับ AI (กลาง)'], ['ai-hard', 'hard', 'เล่นกับ AI (ยาก)']]);
const order = fs.readFileSync(path.join(__dirname, '..', 'learning-design.js'), 'utf8');
assert(/'ai-easy','ai-medium','ai-hard','finish'\]/.test(order), 'AI lessons come just before เล่นจริง');
for (const l of lessons) {
  assert.equal(l.type, 'aiGame');
  assert.equal(l.requiredCorrect, 1);
  assert(l.teachingBoards.length >= 3 && l.teachingSteps.length === l.teachingBoards.length, l.id + ': teaching boards');
  l.teachingBoards.forEach((b, i) => {
    for (const side of ['white', 'black']) assert.equal(b.pieces.filter(p => p.side === side && p.piece === 'king').length, 1, l.id + ' board ' + (i + 1) + ': one ' + side + ' king');
    assert(!R.inCheck(b.pieces, 'white'), l.id + ' board ' + (i + 1) + ': white not in check');
  });
  assert(fs.existsSync(path.join(__dirname, '..', 'assets', 'images', 'lessons', l.id + '.svg')), l.id + ': icon');
  assert(fs.existsSync(path.join(__dirname, '..', 'assets', 'images', 'lessons', 'black', l.id + '.svg')), l.id + ': black icon');
}
// The AI page counts a finished game for its level once, and the lesson button passes the lesson id along.
const editor = fs.readFileSync(path.join(__dirname, '..', 'editor.js'), 'utf8');
assert(/function recordGame/.test(editor) && /makrukAiGames/.test(editor), 'AI page records finished games');
console.log('AI lessons verified: ' + lessons.map(l => l.id).join(', ') + '.');
