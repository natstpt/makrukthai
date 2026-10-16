'use strict';
// Checks the running local server (tools/makruk-tb serve) on its packed tables (tablebase-local/packed/): for random
// positions, with either side to move and either colour holding the table's pieces, the position's result must follow
// from its moves' results one step on, and the moves must be exactly the legal moves of makruk-rules.js.
// Run (with the server running): node scripts/check-local-server.cjs [names…] (default: every packed table).
// MAKRUK_SAMPLES=n positions a table (default 200).
const fs = require('node:fs');
const path = require('node:path');
const R = require('../makruk-rules.js');
const T = require('../tablebase.js');

const BASE = 'http://127.0.0.1:8765', DIR = path.join(__dirname, '..', 'tablebase-local', 'packed');
const KIND = { R: 'rook', N: 'knight', S: 'khon', M: 'met' };
const other = s => s === 'white' ? 'black' : 'white';
let seed = 4242;
const rand = n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };
function randomPosition(info) {
  for (;;) {
    const slots = info.white.map(k => ['white', k]).concat(info.black.map(k => ['black', k]));
    const squares = Array.from({ length: slots.length + 2 }, () => rand(64));
    if (new Set(squares).size !== squares.length) continue;
    const at = s => ({ r: s >> 3, c: s & 7 }), swap = rand(2) === 1, col = c => swap ? other(c) : c;
    const ps = [{ piece: 'king', side: 'white', at: at(squares[0]) }, { piece: 'king', side: 'black', at: at(squares[1]) }];
    slots.forEach(([c, k], j) => ps.push({ piece: KIND[k], side: col(c), at: at(squares[j + 2]) }));
    if (Math.max(Math.abs(ps[0].at.r - ps[1].at.r), Math.abs(ps[0].at.c - ps[1].at.c)) <= 1) continue;
    const stm = rand(2) ? 'white' : 'black';
    if (R.inCheck(ps, other(stm))) continue;
    return { ps, stm };
  }
}
(async () => {
  const status = await (await fetch(BASE + '/status')).json();
  const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(DIR).filter(n => fs.existsSync(path.join(DIR, n, 'info.json'))).sort();
  const samples = Number(process.env.MAKRUK_SAMPLES) || 200;
  let failures = 0;
  for (const name of names) {
    if (!status.tables.includes(name)) { console.log(name + ': not served'); failures++; continue; }
    const info = JSON.parse(fs.readFileSync(path.join(DIR, name, 'info.json'), 'utf8'));
    let decided = 0;
    for (let i = 0; i < samples; i++) {
      const { ps, stm } = randomPosition(info);
      const a = await (await fetch(BASE + '/probe?fen=' + encodeURIComponent(T.fenOf(ps, stm)))).json();
      const legal = R.legalMoves(ps, stm).map(m => [m.from.r, m.from.c, m.to.r, m.to.c].join()).sort();
      const got = (a.moves || []).map(m => m.from.concat(m.to).join()).sort();
      let want;
      const st = R.gameStatus(ps, stm);
      if (st.state === 'checkmate') want = { res: 'loss', n: 0 };
      else if (st.state !== 'playing') want = { res: 'draw', n: 0 };
      else {
        const wins = a.moves.filter(m => m.res === 'win'), losses = a.moves.filter(m => m.res === 'loss');
        want = wins.length ? { res: 'win', n: Math.min(125, ...wins.map(m => m.n)) } : losses.length === a.moves.length ? { res: 'loss', n: Math.min(125, Math.max(...losses.map(m => m.n))) } : { res: 'draw', n: 0 };
      }
      const r = a.result || {};
      if (!a.covered || JSON.stringify(legal) !== JSON.stringify(got) || r.res !== want.res || (r.res !== 'draw' && r.n !== want.n)) {
        failures++; console.log(name + ' ' + T.fenOf(ps, stm) + ': ' + JSON.stringify(r) + ' from the table, ' + JSON.stringify(want) + ' from its moves'); continue;
      }
      if (r.res !== 'draw') decided++;
    }
    console.log(name + ': ' + samples + ' positions agree with their moves (' + decided + ' decided)');
  }
  if (failures) { console.log(failures + ' disagreements'); process.exit(1); }
  console.log('All ' + names.length + ' packed tables agree.');
})().catch(e => { console.error(e.message || e); process.exit(1); });
