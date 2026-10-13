// Single-threaded Fairy-Stockfish: commands go into a queue that the UCI loop reads (via Asyncify); every line the
// engine prints goes to the listeners.
class Queue {
  constructor() { this.getter = null; this.list = []; }
  async get() { if (this.list.length > 0) return this.list.shift(); return await new Promise((resolve) => (this.getter = resolve)); }
  put(x) { if (this.getter) { const g = this.getter; this.getter = null; g(x); return; } this.list.push(x); }
}
Module["queue"] = new Queue();
const listeners = [];
Module["postMessage"] = (command) => Module["queue"].put(command);
Module["addMessageListener"] = (listener) => listeners.push(listener);
Module["print"] = (line) => listeners.forEach((l) => l(line));
Module["printErr"] = (line) => listeners.forEach((l) => l(line));
