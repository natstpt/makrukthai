'use strict';
// The stand-alone hard-AI page (ai/index.html) is editor.html made by scripts/build-ai-page.cjs, up to date (the
// deploy workflow rebuilds it before this check, so a change to editor.html reaches the page too).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../scripts/build-ai-page.cjs');
const page = fs.readFileSync(path.join(__dirname, '..', 'ai', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
assert.equal(page, B.build(), 'ai/index.html is up to date (node scripts/build-ai-page.cjs)');
assert(page.includes('<base href="../">') && page.includes("window.MAKRUK_PAGE='ai'"), 'base and page flag');
console.log('AI test page verified.');
