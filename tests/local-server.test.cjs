'use strict';
// The local server (tools/makruk-tb serve) seen from tablebase.js, with fetch answered here instead of a server:
// the page asks /status once, asks /probe only for positions the web tables do not cover, uses the answer for
// bestMove / outcomes (marked local), sends a FEN the server reads, and with no server changes nothing.
const assert = require('node:assert/strict');
const R = require('../makruk-rules.js');
const T = require('../tablebase.js');

// A six-piece position: white king ก1, rook ญ1, promoted pawns ค3 จ3; red king ง6, rook ง8.
const at = s => ({ r: 8 - Number(s[1]), c: 'abcdefgh'.indexOf(s[0]) });
const ps = [
  { piece: 'king', side: 'white', at: at('a1') }, { piece: 'rook', side: 'white', at: at('h1') },
  { piece: 'promoted', side: 'white', at: at('c3') }, { piece: 'promoted', side: 'white', at: at('e3') },
  { piece: 'king', side: 'black', at: at('d6') }, { piece: 'rook', side: 'black', at: at('d8') }];
assert.equal(T.fenOf(ps, 'white'), '3r4/8/3k4/8/8/2M~1M~3/8/K6R w - - 0 1', 'the FEN makruk-tb reads');
const legal = R.legalMoves(ps, 'white');
const winning = legal.find(m => m.from.c === 7 && m.to.c === 3); // ร.ญ1-ง1
const answer = { covered: true, table: 'KRMMvKR', result: { res: 'win', n: 9 },
  moves: legal.map(m => ({ from: [m.from.r, m.from.c], to: [m.to.r, m.to.c], res: m === winning ? 'win' : 'draw', n: m === winning ? 9 : 0 })) };

const asked = [];
global.fetch = url => {
  asked.push(url.replace('http://127.0.0.1:8765', ''));
  const json = body => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  if (url.endsWith('/rs/index.json')) return json([]);
  if (url.endsWith('/status')) return json({ ok: true, version: '0.1.0', tables: ['KRMMvKR'] });
  if (url.includes('/probe?fen=')) return json(answer);
  return Promise.reject(Error('no ' + url));
};

(async () => {
  T.useLocal();
  assert.equal(T.bestMove(ps, 'white'), null, 'nothing before the server answers');
  assert.equal(T.need(ps, false, 'white'), true, 'the local server is to be asked');
  assert.equal(await T.ensure(ps, false, 'white'), true);
  assert.deepEqual(asked.filter(u => !u.includes('index.json')), ['/status', '/probe?fen=' + encodeURIComponent(T.fenOf(ps, 'white'))]);
  assert.equal(T.need(ps, false, 'white'), false, 'answered: nothing more to ask');
  const b = T.bestMove(ps, 'white');
  assert.deepEqual(b, { move: { from: winning.from, to: winning.to }, mateIn: 9 }, 'the winning move from the answer');
  const o = T.outcomes(ps, 'white');
  assert(o.two && o.local && o.moves.length === legal.length, 'outcomes from the answer, marked local');
  // A drawn answer is left to the engine; a position the web tables cover is never sent to the server.
  answer.moves.forEach(m => { m.res = 'draw'; m.n = 0; });
  const ps2 = ps.map(p => p.piece === 'rook' && p.side === 'white' ? { ...p, at: at('h2') } : p);
  assert.equal(await T.ensure(ps2, false, 'white'), true);
  assert.equal(T.bestMove(ps2, 'white'), null, 'a draw: the engine plays it');
  const lone = [{ piece: 'king', side: 'white', at: at('a1') }, { piece: 'rook', side: 'white', at: at('h1') }, { piece: 'king', side: 'black', at: at('e5') }];
  const before = asked.length;
  T.need(lone, false, 'white'); await T.ensure(lone, false, 'white');
  assert(!asked.slice(before).some(u => u.includes('/probe')), 'king + rook against king stays with the web tables');

  // No server: the status fails once, then nothing is asked again.
  T.useLocal();
  global.fetch = url => url.endsWith('/rs/index.json') ? Promise.resolve({ ok: true, json: () => Promise.resolve([]) }) : Promise.reject(Error('connection refused'));
  assert.equal(await T.ensure(ps, false, 'white'), false);
  assert.equal(T.need(ps, false, 'white'), false, 'no server: nothing to wait for');
  assert.equal(T.bestMove(ps, 'white'), null);
  console.log('Local server client verified: status once, probe only where the web tables stop, answers used, no server no change.');
})().catch(e => { console.error(e); process.exit(1); });
