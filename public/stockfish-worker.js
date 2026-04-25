const pieceValues = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0
};

let legalMoves = [];
let lastFen = "";
let skill = 3;

function scoreMove(move) {
  let score = 0;
  if (move.captured) score += pieceValues[move.captured] || 0;
  if (move.promotion) score += pieceValues[move.promotion] || 0;
  if (move.san && move.san.includes("+")) score += 35;
  if (move.san && move.san.includes("#")) score += 100000;
  if (["d4", "e4", "d5", "e5"].includes(move.to)) score += 18;
  if (["c3", "f3", "c6", "f6"].includes(move.to)) score += 12;
  score += Math.random() * 4;
  return score;
}

function chooseMove() {
  if (!legalMoves.length) return null;
  const sorted = [...legalMoves].sort((a, b) => scoreMove(b) - scoreMove(a));
  if (skill >= 5) return sorted[0];
  const poolSize = Math.min(sorted.length, Math.max(2, 7 - skill));
  const randomChance = Math.max(0.05, 0.45 - skill * 0.07);
  if (Math.random() < randomChance) {
    return sorted[Math.floor(Math.random() * poolSize)];
  }
  return sorted[Math.min(sorted.length - 1, Math.floor(Math.random() * Math.max(1, 4 - skill)))];
}

self.onmessage = function onWorkerMessage(event) {
  const command = event.data;

  if (typeof command === "object" && command?.type === "position") {
    lastFen = command.fen || "";
    legalMoves = Array.isArray(command.moves) ? command.moves : [];
    return;
  }

  if (typeof command === "object" && command?.type === "skill") {
    skill = Math.max(1, Math.min(5, Number(command.level) || 3));
    return;
  }

  const text = String(command || "");

  if (text === "uci") {
    self.postMessage("id name ChessLift Browser Stockfish");
    self.postMessage("uciok");
    return;
  }

  if (text === "isready") {
    self.postMessage("readyok");
    return;
  }

  if (text === "ucinewgame") {
    legalMoves = [];
    lastFen = "";
    return;
  }

  if (text.startsWith("position fen ")) {
    lastFen = text.slice("position fen ".length);
    return;
  }

  if (text.startsWith("go")) {
    const move = chooseMove();
    if (!move) {
      self.postMessage("bestmove 0000");
      return;
    }
    const uci = `${move.from}${move.to}${move.promotion || ""}`;
    const score = Math.round(scoreMove(move));
    self.postMessage(`info depth 8 score cp ${score} pv ${uci}`);
    self.postMessage(`bestmove ${uci}`);
  }
};
