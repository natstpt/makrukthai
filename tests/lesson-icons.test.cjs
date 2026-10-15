'use strict';
// Every lesson in the order (learning-design.js) has its menu picture, for both piece colour sets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'learning-design.js'), 'utf8');
const ids = source.match(/var order=\[([^\]]*)\]/)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
assert(ids.length > 50, 'lesson order found');
for (const id of ids) for (const dir of ['', 'black/'])
  assert(fs.existsSync(path.join(root, 'assets/images/lessons', dir + id + '.svg')), 'picture for ' + dir + id);
console.log('Lesson pictures verified: ' + ids.length + ' lessons, both colour sets.');
