/* Runs the single-threaded Fairy-Stockfish build (stockfish-lite.js, no SharedArrayBuffer needed) in a Web Worker:
 * UCI commands come in as messages and every line the engine prints goes back out. Commands sent before the engine
 * is ready wait in a list. */
importScripts('stockfish-lite.js');
var waiting = [], engine = null;
onmessage = function (e) { if (engine) engine.postMessage(e.data); else waiting.push(e.data); };
Stockfish().then(function (sf) {
  engine = sf;
  sf.addMessageListener(function (line) { postMessage(line); });
  waiting.forEach(function (c) { sf.postMessage(c); });
  waiting = [];
});
