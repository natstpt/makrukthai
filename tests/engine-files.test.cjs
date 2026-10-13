'use strict';
// The hard AI's engine files: the NNUE network is named after its own SHA-256, and the WASM engine ships with its licence.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'engine');
for (const file of ['stockfish.js', 'stockfish.wasm', 'stockfish.worker.js', 'AUTHORS', 'Copying.txt', 'README.md'])
  assert(fs.statSync(path.join(dir, file)).size > 0, file + ' is present');
const nets = fs.readdirSync(dir).filter(f => f.endsWith('.nnue'));
assert.deepEqual(nets, ['makruk-a8c621e24a8c.nnue'], 'one makruk network');
const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, nets[0]))).digest('hex');
assert.equal(hash.slice(0, 12), 'a8c621e24a8c', 'the network matches its name');
// The full engine runs only on computers (phones use the lite one), with its original 2 GB shared memory limit:
// 512 MB was too little for 3 threads and the hash table.
assert(fs.readFileSync(path.join(dir, 'stockfish.js'), 'utf8').includes('maximum:32768,shared:!0'), 'full engine keeps 2 GB of shared memory');
assert(fs.readFileSync(path.join(dir, 'Copying.txt'), 'utf8').includes('GNU GENERAL PUBLIC LICENSE'), 'GPL licence kept');
// The lite engine (engine/lite): one thread, plain WebAssembly, small, and it plays a legal makruk move in time.
const lite = path.join(dir, 'lite');
for (const file of ['stockfish-lite.js', 'stockfish-lite.wasm', 'lite-worker.js', 'preamble.js', 'single-thread.patch'])
  assert(fs.statSync(path.join(lite, file)).size > 0, 'lite/' + file + ' is present');
assert(fs.statSync(path.join(lite, 'stockfish-lite.wasm')).size < 2 * 1024 * 1024, 'lite engine is under 2 MB');
assert(!fs.readFileSync(path.join(lite, 'stockfish-lite.js'), 'utf8').includes('SharedArrayBuffer'), 'lite engine needs no SharedArrayBuffer');
const R = require('../makruk-rules.js'), M = require('../editor-model.js');
(async () => {
  const sf = await require(path.join(lite, 'stockfish-lite.js'))();
  const lines = [];
  sf.addMessageListener(l => lines.push(l));
  const wait = async (re, ms) => { const t = Date.now(); while (!lines.some(l => re.test(l)) && Date.now() - t < ms) await new Promise(r => setTimeout(r, 10)); return lines.find(l => re.test(l)); };
  ['uci', 'setoption name UCI_Variant value makruk', 'setoption name Use NNUE value false', 'setoption name Hash value 8', 'isready'].forEach(c => sf.postMessage(c));
  assert(await wait(/^readyok/, 10000), 'lite engine starts');
  const start = M.initial(), t = Date.now();
  sf.postMessage('position fen ' + M.fen(start)); sf.postMessage('go movetime 300');
  const best = (await wait(/^bestmove/, 3000) || '').split(' ')[1] || '';
  assert(Date.now() - t < 1000, 'lite engine answers within 1 s');
  const key = m => 'abcdefgh'[m.from.c] + (8 - m.from.r) + 'abcdefgh'[m.to.c] + (8 - m.to.r);
  assert(R.legalMoves(start.pieces, 'white').some(m => key(m) === best.slice(0, 4)), 'lite engine plays a legal move: ' + best);
  console.log('Lite engine verified: ' + best + ' in ' + (Date.now() - t) + ' ms, ' + Math.round(fs.statSync(path.join(lite, 'stockfish-lite.wasm')).size / 1024) + ' KB.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
console.log('Engine files verified: network ' + nets[0] + ' (sha256 ' + hash.slice(0, 12) + '…), WASM engine and licence present.');
