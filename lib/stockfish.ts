"use client";

export type StockfishLine = {
  depth: number;
  score: string;
  pv: string;
};

type EngineCallbacks = {
  onLine?: (line: StockfishLine) => void;
  onBestMove?: (move: string) => void;
  onStatus?: (status: string) => void;
};

export type EngineMove = {
  from: string;
  to: string;
  san?: string;
  captured?: string;
  promotion?: string;
};

export function createStockfish(callbacks: EngineCallbacks = {}) {
  if (typeof window === "undefined") return null;
  const worker = new Worker("/stockfish-worker.js?v=2");

  worker.onmessage = (event: MessageEvent<string>) => {
    const text = event.data;
    if (text === "uciok" || text === "readyok") {
      callbacks.onStatus?.("ready");
      return;
    }
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

  worker.onerror = () => {
    callbacks.onStatus?.("engine error");
  };

  worker.postMessage("uci");
  worker.postMessage("isready");

  return {
    bestMove(fen: string, depth = 10, moves: EngineMove[] = []) {
      worker.postMessage({ type: "position", fen, moves });
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
