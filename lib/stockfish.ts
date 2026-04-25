"use client";

export type StockfishLine = {
  depth: number;
  score: string;
  pv: string;
};

type EngineCallbacks = {
  onLine?: (line: StockfishLine) => void;
  onBestMove?: (move: string) => void;
};

export function createStockfish(callbacks: EngineCallbacks = {}) {
  if (typeof window === "undefined") return null;
  const worker = new Worker("/stockfish-worker.js");

  worker.onmessage = (event: MessageEvent<string>) => {
    const text = event.data;
    if (text.startsWith("bestmove")) {
      callbacks.onBestMove?.(text.split(" ")[1]);
      return;
    }
    if (text.startsWith("info depth")) {
      const depth = Number(text.match(/depth (\d+)/)?.[1] || 0);
      const cp = text.match(/score cp (-?\d+)/)?.[1];
      const mate = text.match(/score mate (-?\d+)/)?.[1];
      const pv = text.split(" pv ")[1] || "";
      callbacks.onLine?.({
        depth,
        score: mate ? `M${mate}` : cp ? `${(Number(cp) / 100).toFixed(2)}` : "0.00",
        pv
      });
    }
  };

  worker.postMessage("uci");
  worker.postMessage("isready");

  return {
    bestMove(fen: string, depth = 10) {
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${depth}`);
    },
    stop() {
      worker.postMessage("stop");
    },
    dispose() {
      worker.terminate();
    }
  };
}
