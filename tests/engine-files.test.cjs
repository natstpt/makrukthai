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
assert(fs.readFileSync(path.join(dir, 'Copying.txt'), 'utf8').includes('GNU GENERAL PUBLIC LICENSE'), 'GPL licence kept');
console.log('Engine files verified: network ' + nets[0] + ' (sha256 ' + hash.slice(0, 12) + '…), WASM engine and licence present.');
