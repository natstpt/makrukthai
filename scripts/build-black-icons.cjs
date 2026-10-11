'use strict';
// Builds assets/images/lessons/black/: the lesson icons with the red side drawn in black, for the white–black
// piece colours (piece-colors.js). Red pieces and side markers (fill #c63a2e) turn black with a lighter outline;
// red strokes (crosses, warning marks), the red number in mini.svg and the small red dot in board.svg stay red.
// Run: node scripts/build-black-icons.cjs
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '..', 'assets', 'images', 'lessons');
const out = path.join(dir, 'black');
fs.mkdirSync(out, { recursive: true });
let changed = 0;
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.svg'))) {
  const svg = fs.readFileSync(path.join(dir, file), 'utf8');
  const black = svg.replace(/<(g|circle|path|rect)\b([^<>]*?)\/?>/g, (tag, name, attrs) => {
    if (!/fill="#c63a2e"/.test(attrs) || /r="1\.8"/.test(attrs)) return tag;
    const self = /\/>$/.test(tag);
    const noStroke = /\bstroke="none"/.test(attrs);
    const rest = attrs.replace(/\s*fill="#c63a2e"/, '').replace(/\s*stroke="[^"]*"/, '').replace(/\s+$/, '');
    return '<' + name + rest + ' fill="#2b2723"' + (noStroke ? ' stroke="none"' : ' stroke="#8f8574"') + (self ? '/>' : '>');
  });
  if (black !== svg) changed++;
  fs.writeFileSync(path.join(out, file), black);
}
console.log('black icons', fs.readdirSync(out).length, 'changed', changed);
