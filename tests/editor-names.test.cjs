'use strict';
// editor.js keeps its functions in one scope: two function declarations with the same name do not fail, the later one
// silently replaces the earlier everywhere (a second pvText broke ถอดหมาก's engine lines and endgame-table chips).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'editor.js'), 'utf8');
const names = [...src.matchAll(/^  function ([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]);
const twice = names.filter((n, i) => names.indexOf(n) !== i);
assert.deepEqual([...new Set(twice)], [], 'function names declared twice in editor.js: ' + twice.join(', '));
assert(names.length > 100, 'found the functions');
console.log('editor.js: ' + names.length + ' functions, each name once.');
