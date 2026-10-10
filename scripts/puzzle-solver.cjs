'use strict';
// Mate-in-N search for the short book puzzles (กลสั้น). White moves first; the red king defends.
// solutionTree() keeps every white move that still mates in the moves left, and one red reply per
// white move: the reply that delays mate longest, preferring the book line when it is just as long.
const Rules = require('../makruk-rules.js');

const square = at => 'abcdefgh'[at.c] + (8 - at.r);
const moveKey = move => square(move.from) + square(move.to);
const fromKey = key => ({ from: { r: 8 - Number(key[1]), c: 'abcdefgh'.indexOf(key[0]) }, to: { r: 8 - Number(key[3]), c: 'abcdefgh'.indexOf(key[2]) } });

function createSolver() {
  const memo = new Map();
  const positionKey = pieces => pieces.map(p => p.side[0] + p.piece + square(p.at)).sort().join();
  // Can white (to move) mate within n white moves?
  function wins(pieces, n) {
    if (n <= 0) return false;
    const key = positionKey(pieces) + '|' + n;
    if (memo.has(key)) return memo.get(key);
    let result = false;
    for (const move of Rules.legalMoves(pieces, 'white')) {
      if (mates(Rules.applyMove(pieces, move.from, move.to), n)) { result = true; break; }
    }
    memo.set(key, result);
    return result;
  }
  // After a white move: is this mate now, or does every red reply still lose within n-1 moves?
  function mates(after, n) {
    const state = Rules.gameStatus(after, 'black').state;
    if (state === 'checkmate') return true;
    if (state !== 'playing' || n <= 1) return false;
    return Rules.legalMoves(after, 'black').every(reply => wins(Rules.applyMove(after, reply.from, reply.to), n - 1));
  }
  function depth(pieces, max) {
    for (let n = 1; n <= max; n++) if (wins(pieces, n)) return n;
    return null;
  }
  function solutionTree(pieces, n, line) {
    const book = line || [];
    const node = {};
    const moves = Rules.legalMoves(pieces, 'white').map(move => ({ move, key: moveKey(move) }))
      .sort((a, b) => (b.key === book[0]) - (a.key === book[0]));
    for (const { move, key } of moves) {
      const after = Rules.applyMove(pieces, move.from, move.to);
      if (!mates(after, n)) continue;
      if (Rules.gameStatus(after, 'black').state === 'checkmate') { node[key] = '#'; continue; }
      const onBook = key === book[0];
      let best = null;
      for (const reply of Rules.legalMoves(after, 'black')) {
        const next = Rules.applyMove(after, reply.from, reply.to), replyKey = moveKey(reply);
        const left = depth(next, n - 1);
        const preferred = onBook && replyKey === book[1];
        if (!best || left > best.left || (left === best.left && preferred)) best = { key: replyKey, next, left };
      }
      node[key] = { r: best.key, n: solutionTree(best.next, best.left, onBook && best.key === book[1] ? book.slice(2) : []) };
    }
    return node;
  }
  return { wins, mates, depth, solutionTree };
}

module.exports = { createSolver, moveKey, fromKey, square };
