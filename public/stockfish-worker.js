self.importScripts("https://cdn.jsdelivr.net/npm/stockfish@16.0.0/src/stockfish.js");

const engine = self.STOCKFISH();

engine.onmessage = function onEngineMessage(message) {
  self.postMessage(message);
};

self.onmessage = function onWorkerMessage(event) {
  engine.postMessage(event.data);
};
