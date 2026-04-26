"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import {
  Bot,
  BrainCircuit,
  Link as LinkIcon,
  LogIn,
  RotateCcw,
  Save,
  Search,
  Maximize2,
  Swords,
  Users
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  firebaseEnabled,
  saveGameRecord,
  signInGoogle,
  markPieceStylePurchased,
  setUserPieceStyle,
  setUserLanguage,
  updateLeaderboard,
  upsertUserProfile,
  useFirebaseUser,
  useLeaderboard,
  useUserProfile,
  useSavedGames,
  type SavedMove
} from "@/lib/firebase";
import { createStockfish, type StockfishLine } from "@/lib/stockfish";
import { startPieceStyleCheckout } from "@/lib/stripe";
import { translations, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const pieceGlyphs: Record<string, string> = {
  wp: "\u2659",
  wn: "\u2658",
  wb: "\u2657",
  wr: "\u2656",
  wq: "\u2655",
  wk: "\u2654",
  bp: "\u265F",
  bn: "\u265E",
  bb: "\u265D",
  br: "\u265C",
  bq: "\u265B",
  bk: "\u265A"
};

type PieceStyle = "classic" | "cburnett" | "noto" | "alpha" | "merida" | "california" | "cardinal" | "pixel";
const pieceStyleLabels: Record<PieceStyle, string> = {
  classic: "Classic",
  cburnett: "Cburnett",
  noto: "Noto",
  alpha: "Alpha",
  merida: "Merida",
  california: "California",
  cardinal: "Cardinal",
  pixel: "Pixel"
};
const paidPieceStyles = ["alpha", "merida", "california", "cardinal", "pixel"] as const;
type PaidPieceStyle = (typeof paidPieceStyles)[number];
const pieceNames: Record<string, string> = {
  k: "KING",
  q: "QUEEN",
  r: "ROOK",
  b: "BISHOP",
  n: "KNIGHT",
  p: "PAWN"
};

function normalizePieceStyle(style?: string): PieceStyle {
  if (style === "cburnett" || style === "neo") return "cburnett";
  if (style === "noto" || style === "mono") return "noto";
  if (style === "alpha") return "alpha";
  if (style === "merida") return "merida";
  if (style === "california") return "california";
  if (style === "cardinal") return "cardinal";
  if (style === "pixel") return "pixel";
  return "classic";
}

function isPaidPieceStyle(style: PieceStyle): style is PaidPieceStyle {
  return paidPieceStyles.includes(style as PaidPieceStyle);
}

function wikimediaPieceUrl(style: PieceStyle, color: "w" | "b", type: string) {
  if (isPaidPieceStyle(style)) {
    return `https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/${style}/${color}${type.toUpperCase()}.svg`;
  }

  if (style === "cburnett") {
    const pieceColor = color === "w" ? "l" : "d";
    return `https://commons.wikimedia.org/wiki/Special:FilePath/Chess_${type}${pieceColor}t45.svg`;
  }

  if (style === "noto") {
    const pieceColor = color === "w" ? "WHITE" : "BLACK";
    const pieceName = pieceNames[type] || "PAWN";
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(`${pieceColor} CHESS ${pieceName}.svg`)}`;
  }

  return null;
}

function ChessPieceIcon({
  color,
  type,
  large = false,
  style = "classic",
  preview = false
}: {
  color: "w" | "b";
  type: string;
  large?: boolean;
  style?: PieceStyle;
  preview?: boolean;
}) {
  const source = wikimediaPieceUrl(style, color, type);
  if (source) {
    return (
      <img
        src={source}
        alt=""
        className={cn("object-contain drop-shadow-sm", large ? "h-[84%] w-[84%]" : "h-[78%] w-[78%]")}
        draggable={false}
      />
    );
  }

  const fill = color === "w" ? "#f8fafc" : "#111827";
  const stroke = color === "w" ? "#334155" : "#f8fafc";
  const pieceText = pieceGlyphs[`${color}${type}`];
  const common = {
    fill,
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };

  if (type === "p") {
    return (
      <svg viewBox="0 0 64 64" className={cn("drop-shadow-sm", large ? "h-[74%] w-[74%]" : "h-[68%] w-[68%]")} aria-hidden="true">
        <circle cx="32" cy="18" r="9" {...common} />
        <path d="M24 30h16l5 15H19z" {...common} />
        <path d="M17 50h30l4 7H13z" {...common} />
      </svg>
    );
  }

  return (
    <span
      className={cn(
        "flex h-[74%] w-[74%] items-center justify-center leading-none",
        preview ? "text-[1.3rem]" : large ? "text-[clamp(3rem,7vw,5.8rem)]" : "text-[clamp(1.2rem,3.2vw,3.1rem)]",
        color === "b" ? "text-slate-950" : "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
      )}
    >
      {pieceText}
    </span>
  );
}

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];

type Mode = "local" | "ai" | "online";
type ServerMessage =
  | { type: "room-created"; roomId: string; fen: string; color: "w" | "b"; players?: Partial<Record<"w" | "b", string>> }
  | { type: "joined"; roomId: string; fen: string; color: "w" | "b"; players?: Partial<Record<"w" | "b", string>> }
  | { type: "matched"; roomId: string; fen: string; color: "w" | "b"; players?: Partial<Record<"w" | "b", string>> }
  | { type: "matchmaking-waiting" }
  | { type: "state"; fen: string; pgn: string; turn: "w" | "b"; result?: string; moves: string[]; players?: Partial<Record<"w" | "b", string>> }
  | { type: "error"; message: string };

type MoveRecord = SavedMove;

function squareName(fileIndex: number, rankIndex: number) {
  return `${files[fileIndex]}${ranks[rankIndex]}` as Square;
}

function classifyResult(game: Chess) {
  if (game.isCheckmate()) return game.turn() === "w" ? "blackWonCheckmate" : "whiteWonCheckmate";
  if (game.isStalemate()) return "drawStalemate";
  if (game.isThreefoldRepetition()) return "drawRepetition";
  if (game.isInsufficientMaterial()) return "drawMaterial";
  if (game.isDraw()) return "draw";
  return "In progress";
}

function translatedResult(result: string, t: Record<string, string>) {
  return t[result] || (result === "In progress" ? t.inProgress : result);
}

function makeMoveRecord(before: Chess, after: Chess, move: ReturnType<Chess["move"]>, ply: number): MoveRecord {
  const promotion = "promotion" in move && move.promotion ? move.promotion : "";
  return {
    ply,
    san: move.san,
    uci: `${move.from}${move.to}${promotion}`,
    color: move.color,
    fenBefore: before.fen(),
    fenAfter: after.fen()
  };
}

function scoreDeltaForResult(result: string, userColor: "w" | "b", isPro = false) {
  const winPoints = isPro ? 15 : 10;
  if (result === "whiteWonCheckmate") return userColor === "w" ? winPoints : -5;
  if (result === "blackWonCheckmate") return userColor === "b" ? winPoints : -5;
  return 0;
}

const enginePieceValues: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0
};

function evaluateForColor(position: Chess, color: "w" | "b") {
  if (position.isCheckmate()) return position.turn() === color ? -100000 : 100000;
  if (position.isDraw()) return 0;

  let score = 0;
  for (const row of position.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const value = enginePieceValues[piece.type] || 0;
      score += piece.color === color ? value : -value;
    }
  }
  if (position.isCheck()) score += position.turn() === color ? -35 : 35;
  return score;
}

function minimax(position: Chess, depth: number, maximizingColor: "w" | "b", alpha: number, beta: number): number {
  if (depth === 0 || position.isGameOver()) return evaluateForColor(position, maximizingColor);

  const maximizing = position.turn() === maximizingColor;
  const moves = position.moves({ verbose: true });

  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      const next = new Chess(position.fen());
      next.move(move);
      best = Math.max(best, minimax(next, depth - 1, maximizingColor, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    const next = new Chess(position.fen());
    next.move(move);
    best = Math.min(best, minimax(next, depth - 1, maximizingColor, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function chooseOpponentMove(position: Chess, color: "w" | "b", difficulty: number) {
  const moves = position.moves({ verbose: true });
  if (!moves.length) return null;
  if (difficulty <= 1) return moves[Math.floor(Math.random() * moves.length)];

  const depth = difficulty >= 5 ? 3 : difficulty >= 4 ? 2 : 1;
  const scored = moves
    .map((move) => {
      const next = new Chess(position.fen());
      next.move(move);
      const materialBonus = move.captured ? enginePieceValues[move.captured] || 0 : 0;
      const score = minimax(next, depth - 1, color, -Infinity, Infinity) + materialBonus * 0.15;
      return { move, score };
    })
    .sort((a, b) => b.score - a.score);

  if (difficulty === 2 && Math.random() < 0.45) {
    return scored[Math.floor(Math.random() * Math.min(4, scored.length))].move;
  }
  if (difficulty === 3 && Math.random() < 0.2) {
    return scored[Math.floor(Math.random() * Math.min(3, scored.length))].move;
  }
  return scored[0].move;
}

function recordsFromSanMoves(moves: string[]) {
  const replay = new Chess();
  return moves.flatMap((san, index) => {
    const before = new Chess(replay.fen());
    try {
      const move = replay.move(san);
      return [makeMoveRecord(before, replay, move, index + 1)];
    } catch {
      return [];
    }
  });
}

function parseUciMove(move: string) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) return null;
  return {
    from: move.slice(0, 2) as Square,
    to: move.slice(2, 4) as Square
  };
}

function fenHistoryString(records: MoveRecord[]) {
  return [new Chess().fen(), ...records.map((move) => move.fenAfter)].join("\n");
}

function MiniBoard({ fen, large = false, pieceStyle = "classic" }: { fen: string; large?: boolean; pieceStyle?: PieceStyle }) {
  const replayGame = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);
  const squares = useMemo(() => ranks.flatMap((rank) => files.map((file) => `${file}${rank}` as Square)), []);

  return (
    <div className={cn("board-grid aspect-square w-full overflow-hidden rounded-md border", large && "max-w-[720px]")}>
      {squares.map((square) => {
        const fileIndex = files.indexOf(square[0]);
        const rankIndex = ranks.indexOf(square[1]);
        const piece = replayGame.get(square);
        const dark = (fileIndex + rankIndex) % 2 === 1;
        return (
          <div key={square} className={cn("flex items-center justify-center", dark ? "bg-[#688b58]" : "bg-[#f2d8a7]")}>
            {piece ? <ChessPieceIcon color={piece.color} type={piece.type} large={large} style={pieceStyle} /> : null}
          </div>
        );
      })}
    </div>
  );
}

type ChessAppProps = {
  initialMode?: Mode;
  initialView?: "play" | "profile";
  initialOnlineKind?: "friend" | "random";
  lockedMode?: boolean;
  requireAuth?: boolean;
};

export default function ChessApp({ initialMode = "ai", initialView = "play", initialOnlineKind = "friend", lockedMode = false, requireAuth = false }: ChessAppProps) {
  const router = useRouter();
  const [game, setGame] = useState(() => new Chess());
  const [moveRecords, setMoveRecords] = useState<MoveRecord[]>([]);
  const [reviewPly, setReviewPly] = useState<number | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [view, setView] = useState<"play" | "profile">(initialView);
  const [city, setCity] = useState("Almaty");
  const [coachLine, setCoachLine] = useState<StockfishLine | null>(null);
  const [coachText, setCoachText] = useState("");
  const [suggestedMove, setSuggestedMove] = useState<{ from: Square; to: Square } | null>(null);
  const [aiDifficulty, setAiDifficulty] = useState(3);
  const [roomId, setRoomId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [playerColor, setPlayerColor] = useState<"w" | "b">("w");
  const [aiPlayerColor, setAiPlayerColor] = useState<"w" | "b">("w");
  const [socketStatus, setSocketStatus] = useState("offline");
  const [onlineGameKind, setOnlineGameKind] = useState<"friend" | "random">(initialOnlineKind);
  const [matchmaking, setMatchmaking] = useState(false);
  const [onlinePlayers, setOnlinePlayers] = useState<Partial<Record<"w" | "b", string>>>({});
  const [notice, setNotice] = useState("");
  const [savedGameKey, setSavedGameKey] = useState("");
  const [resultDialog, setResultDialog] = useState<{ title: string; body: string; delta: number } | null>(null);
  const [gameReplayPly, setGameReplayPly] = useState<Record<string, number>>({});
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const analysisRequestedRef = useRef(false);
  const engineRef = useRef<ReturnType<typeof createStockfish> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { user, loading } = useFirebaseUser();
  const profile = useUserProfile(user?.uid);
  const leaderboard = useLeaderboard();
  const savedGames = useSavedGames(user?.uid);
  const activePlayerColor = mode === "online" ? playerColor : mode === "ai" ? aiPlayerColor : "w";
  const isPro = Boolean(profile?.pro);
  const purchasedPieceStyles = profile?.purchasedPieceStyles || [];
  const normalizedProfileStyle = normalizePieceStyle(profile?.pieceStyle);
  const canUseProfileStyle =
    normalizedProfileStyle === "classic" ||
    ((normalizedProfileStyle === "cburnett" || normalizedProfileStyle === "noto") && isPro) ||
    (isPaidPieceStyle(normalizedProfileStyle) && purchasedPieceStyles.includes(normalizedProfileStyle));
  const pieceStyle = canUseProfileStyle ? normalizedProfileStyle : "classic";
  const activeLanguage: Language = isPro && (profile?.language === "kk" || profile?.language === "ru" || profile?.language === "fr") ? profile.language : "en";
  const t = translations[activeLanguage];
  const playerName = user?.displayName || user?.email || t.you;

  useEffect(() => {
    if (!coachText) setCoachText(t.coachReady);
  }, [coachText, t.coachReady]);

  const visibleGame = useMemo(() => {
    if (reviewPly === null) return game;
    const fen = reviewPly === 0 ? new Chess().fen() : moveRecords[reviewPly - 1]?.fenAfter;
    return new Chess(fen || game.fen());
  }, [game, moveRecords, reviewPly]);
  const displaySquares = useMemo(() => {
    const displayFiles = activePlayerColor === "b" ? [...files].reverse() : files;
    const displayRanks = activePlayerColor === "b" ? [...ranks].reverse() : ranks;
    return displayRanks.flatMap((rank) => displayFiles.map((file) => `${file}${rank}` as Square));
  }, [activePlayerColor]);
  const legalTargets = useMemo(() => {
    if (!selected || reviewPly !== null) return new Set<string>();
    return new Set(game.moves({ square: selected, verbose: true }).map((move) => move.to));
  }, [game, reviewPly, selected]);

  useEffect(() => {
    if (requireAuth && !loading && !user) {
      router.replace("/login");
    }
  }, [loading, requireAuth, router, user]);

  useEffect(() => {
    if (user) void upsertUserProfile(user, city);
  }, [city, user]);

  useEffect(() => {
    if (!user || view !== "profile") return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const style = params.get("pieceStyle");
    const normalizedStyle = normalizePieceStyle(style || undefined);
    if (checkout === "style-success" && isPaidPieceStyle(normalizedStyle)) {
      void markPieceStylePurchased(user.uid, normalizedStyle);
      setNotice(`${pieceStyleLabels[normalizedStyle]} pieces unlocked.`);
      window.history.replaceState({}, "", "/profile");
    }
    if (checkout === "style-cancelled") {
      setNotice("Piece style checkout was cancelled.");
      window.history.replaceState({}, "", "/profile");
    }
  }, [user, view]);

  useEffect(() => {
    engineRef.current = createStockfish({
      onLine: setCoachLine,
      onBestMove: (move) => {
        const parsed = parseUciMove(move);
        if (analysisRequestedRef.current) {
          setSuggestedMove(parsed);
          analysisRequestedRef.current = false;
        }
        setCoachText(t.coachLikes.replace("{move}", move || "this position"));
      },
      onStatus: (status) => setCoachText(status === "ready" ? t.coachReady : status)
    });
    return () => engineRef.current?.dispose();
  }, [t]);

  useEffect(() => {
    engineRef.current?.setSkill(5);
  }, []);

  useEffect(() => {
    if (mode !== "ai" || game.turn() === aiPlayerColor || game.isGameOver()) return;
    const timer = window.setTimeout(() => {
      const before = new Chess(game.fen());
      const move = chooseOpponentMove(before, before.turn(), aiDifficulty);
      if (!move) return;
      const next = new Chess(before.fen());
      next.move(move);
      setGame(next);
      setMoveRecords((records) => [...records, makeMoveRecord(before, next, move, records.length + 1)]);
      setReviewPly(null);
      setSuggestedMove(null);
      setCoachText(t.stockfishPlayed.replace("{level}", String(aiDifficulty)).replace("{move}", move.san));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [aiDifficulty, aiPlayerColor, game, mode]);

  useEffect(() => {
    if (!game.isGameOver() || !moveRecords.length) return;
    if (!user) {
      setNotice(t.signInAutoSave);
      return;
    }
    const key = `${game.fen()}-${moveRecords.length}`;
    if (savedGameKey === key) return;
    const result = classifyResult(game);
    const delta = scoreDeltaForResult(result, activePlayerColor, isPro);
    if (delta > 0) {
      setResultDialog({
        title: "Congratualtions! You won!",
        body: t.ratingBoost,
        delta
      });
    }
    void persistFinishedGame(true);
    setSavedGameKey(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayerColor, game, isPro, moveRecords, savedGameKey, user]);

  function replaceGame(next: Chess) {
    setGame(next);
    setSelected(null);
  }

  function sendWs(payload: Record<string, unknown>) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }

  function socketIdentity() {
    return { playerName };
  }

  function connectSocket(onOpen?: (socket: WebSocket) => void) {
    const url = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000";
    const socket = new WebSocket(url);
    wsRef.current = socket;
    setSocketStatus("connecting");

    socket.onopen = () => {
      setSocketStatus("online");
      onOpen?.(socket);
    };
    socket.onclose = () => setSocketStatus("offline");
    socket.onerror = () => setSocketStatus("error");
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "error") {
        setNotice(message.message);
        setMatchmaking(false);
        return;
      }
      if (message.type === "matchmaking-waiting") {
        setOnlineGameKind("random");
        setMatchmaking(true);
        setNotice(t.searchingRandom);
        return;
      }
      if (message.type === "room-created" || message.type === "joined" || message.type === "matched") {
        setRoomId(message.roomId);
        setPlayerColor(message.color);
        setOnlinePlayers(message.players || {});
        setGame(new Chess(message.fen));
        setMode("online");
        setReviewPly(null);
        setSuggestedMove(null);
        setCoachLine(null);
        setMatchmaking(false);
        if (message.type === "matched") {
          setOnlineGameKind("random");
          setCoachText(t.coachUnavailableRandom);
          setNotice(t.randomMatched);
        } else {
          setOnlineGameKind("friend");
          setNotice(message.type === "room-created" ? t.roomCreated : t.roomJoined);
        }
        return;
      }
      if (message.type === "state") {
        setGame(new Chess(message.fen));
        if (message.players) setOnlinePlayers(message.players);
        setMoveRecords(recordsFromSanMoves(message.moves));
        setReviewPly(null);
        setNotice(message.result ? translatedResult(message.result, t) : message.turn === "w" ? t.whiteToMove : t.blackToMove);
      }
    };
  }

  function createRoom() {
    setOnlineGameKind("friend");
    setMatchmaking(false);
    connectSocket((socket) => socket.send(JSON.stringify({ type: "create-room", ...socketIdentity() })));
  }

  function joinRoom(id = joinCode.trim()) {
    if (!id) return;
    setOnlineGameKind("friend");
    setMatchmaking(false);
    connectSocket((socket) => socket.send(JSON.stringify({ type: "join-room", roomId: id, ...socketIdentity() })));
  }

  function findRandomPlayer() {
    resetBoard("online");
    setOnlineGameKind("random");
    setMatchmaking(true);
    setCoachText(t.coachUnavailableRandom);
    connectSocket((socket) => socket.send(JSON.stringify({ type: "find-random", ...socketIdentity() })));
  }

  function switchAiColor(color: "w" | "b") {
    setAiPlayerColor(color);
    resetBoard("ai", color);
  }

  function handleMove(from: Square, to: Square) {
    if (mode === "online") {
      if (game.turn() !== playerColor) {
        setNotice(t.waitingTurn);
        return;
      }
      sendWs({ type: "move", roomId, from, to, promotion: "q" });
      setSelected(null);
      return;
    }

    const next = new Chess(game.fen());
    try {
      const before = new Chess(game.fen());
      const move = next.move({ from, to, promotion: "q" });
      setMoveRecords((records) => [...records, makeMoveRecord(before, next, move, records.length + 1)]);
    } catch {
      setNotice(t.illegalMove);
      setSelected(null);
      return;
    }
    replaceGame(next);
    setReviewPly(null);
    setSuggestedMove(null);
    setNotice(classifyResult(next));
  }

  function clickSquare(square: Square) {
    if (reviewPly !== null) {
      setNotice(t.returnLive);
      return;
    }
    const piece = game.get(square);
    if (selected) {
      if (selected === square) {
        setSelected(null);
        return;
      }
      handleMove(selected, square);
      return;
    }
    if (mode === "ai" && piece && piece.color !== aiPlayerColor) {
      setNotice(t.aiOwnsSide);
      return;
    }
    if (piece && (mode !== "online" || piece.color === playerColor)) {
      setSelected(square);
    }
  }

  async function persistFinishedGame(auto = false) {
    const result = classifyResult(game);
    const delta = scoreDeltaForResult(result, activePlayerColor, isPro);
    const finishedKey = game.isGameOver() ? `${game.fen()}-${moveRecords.length}` : "";
    if (finishedKey && savedGameKey === finishedKey) {
      setNotice(t.alreadySaved);
      return;
    }
    await saveGameRecord({
      userId: user?.uid,
      opponent: mode === "ai" ? "Stockfish" : mode === "online" ? `Room ${roomId}` : "Local player",
      pgn: moveRecords.map((move) => move.san).join(" "),
      result: translatedResult(result, t),
      fenHistory: fenHistoryString(moveRecords),
      finalFen: game.fen(),
      scoreDelta: delta
    });
    await updateLeaderboard({
      userId: user?.uid,
      name: user?.displayName || "Guest player",
      city,
      delta
    });
    if (finishedKey) setSavedGameKey(finishedKey);
    setNotice(
      user
        ? `${auto ? t.finishedAutoSaved : t.savedFirestore} Rating ${delta >= 0 ? "+" : ""}${delta}.`
        : t.signInProgress
    );
  }

  function resetBoard(nextMode = mode, nextAiColor = aiPlayerColor) {
    setMode(nextMode);
    setAiPlayerColor(nextAiColor);
    setGame(new Chess());
    setMoveRecords([]);
    setReviewPly(null);
    setSavedGameKey("");
    setResultDialog(null);
    setSelected(null);
    setNotice(t.newGameStarted);
    setCoachLine(null);
    setSuggestedMove(null);
    setMatchmaking(false);
    setOnlinePlayers({});
  }

  function analyze() {
    if (mode === "online" && onlineGameKind === "random") {
      setCoachText(t.coachUnavailableRandom);
      return;
    }
    setCoachText(t.coachCalculating);
    setSuggestedMove(null);
    analysisRequestedRef.current = true;
    engineRef.current?.setSkill(isPro ? 5 : 2);
    engineRef.current?.bestMove(game.fen(), isPro ? 12 : 6, game.moves({ verbose: true }));
  }

  const status = classifyResult(game);
  const shareUrl = typeof window !== "undefined" && roomId ? `${window.location.origin}?room=${roomId}` : "";
  const whitePlayerName =
    mode === "ai" ? (aiPlayerColor === "w" ? playerName : "Stockfish") : mode === "online" ? onlinePlayers.w || (playerColor === "w" ? playerName : t.opponent) : playerName;
  const blackPlayerName =
    mode === "ai" ? (aiPlayerColor === "b" ? playerName : "Stockfish") : mode === "online" ? onlinePlayers.b || (playerColor === "b" ? playerName : t.opponent) : t.localOpponent;
  const topPlayer = activePlayerColor === "b" ? { name: whitePlayerName, color: t.white } : { name: blackPlayerName, color: t.black };
  const bottomPlayer = activePlayerColor === "b" ? { name: blackPlayerName, color: t.black } : { name: whitePlayerName, color: t.white };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) {
      setJoinCode(room);
      joinRoom(room);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!requireAuth || loading || !user || initialMode !== "online" || initialOnlineKind !== "random") return;
    if (roomId || matchmaking || socketStatus === "connecting") return;
    findRandomPlayer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, initialOnlineKind, loading, matchmaking, requireAuth, roomId, socketStatus, user]);

  if (requireAuth && !firebaseEnabled) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t.login}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Authentication is not configured for this deployment yet.
            </p>
            <Button className="w-full" variant="outline" asChild>
              <Link href="/">{t.backHome}</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (requireAuth && (loading || !user)) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{loading ? "Checking account" : t.login}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {loading ? "Please wait while we check your session." : "Redirecting to sign in."}
            </p>
            {!loading ? (
              <Button className="w-full" asChild>
                <Link href="/login">{t.login}</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      {resultDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-sm rounded-lg border bg-card p-5 text-card-foreground shadow-xl">
            <h2 className="text-xl font-bold">{resultDialog.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{resultDialog.body}</p>
            <div className="mt-4 rounded-md bg-muted p-3 text-sm">
              Rating change: <span className="font-semibold text-primary">+{resultDialog.delta}</span>
            </div>
            <Button className="mt-4 w-full" onClick={() => setResultDialog(null)}>
              Continue
            </Button>
          </div>
        </div>
      ) : null}
      {view === "profile" ? (
        <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{t.profile}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {user ? (
                <>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">{t.name}</div>
                    <div className="font-semibold">{user.displayName || "Guest player"}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">{t.email}</div>
                    <div className="break-words font-semibold">{user.email || "Anonymous account"}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">{t.city}</div>
                    <Input value={city} onChange={(event) => setCity(event.target.value)} />
                  </div>
                  <div className="rounded-md bg-muted p-3 text-sm">
                    {t.gamesSaved}: <span className="font-semibold">{savedGames.length}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-semibold">{t.language}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ["en", "English"],
                        ["kk", "Қазақша"],
                        ["ru", "Русский"],
                        ["fr", "Français"]
                      ] as const).map(([language, label]) => (
                        <Button
                          key={language}
                          variant={activeLanguage === language ? "default" : "outline"}
                          size="sm"
                          disabled={language !== "en" && !isPro}
                          onClick={() => void setUserLanguage(user.uid, language)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                    {!isPro ? <p className="text-xs text-muted-foreground">{t.languageLocked}</p> : null}
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-semibold">{t.pieceStyle}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {(["classic", "cburnett", "noto", "alpha", "merida", "california", "cardinal", "pixel"] as const).map((style) => {
                        const label = pieceStyleLabels[style];
                        const proLocked = (style === "cburnett" || style === "noto") && !isPro;
                        const paidStyle = isPaidPieceStyle(style) ? style : null;
                        const paidLocked = Boolean(paidStyle && !purchasedPieceStyles.includes(paidStyle));
                        const selectedStyle = pieceStyle === style;

                        return (
                          <div
                            key={style}
                            className={cn(
                              "rounded-md border bg-background p-2 transition duration-200 hover:-translate-y-0.5 hover:shadow-sm",
                              selectedStyle ? "border-primary ring-1 ring-primary" : "border-border"
                            )}
                          >
                            <div className="mb-2 grid grid-cols-4 gap-1 rounded-md bg-muted p-1">
                              {([
                                ["w", "k"],
                                ["w", "q"],
                                ["b", "n"],
                                ["b", "p"]
                              ] as const).map(([color, type]) => (
                                <div key={`${style}-${color}${type}`} className="grid aspect-square place-items-center rounded-sm bg-card">
                                  <ChessPieceIcon color={color} type={type} style={style} preview />
                                </div>
                              ))}
                            </div>
                            {paidLocked ? (
                              <Button
                                className="w-full"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  paidStyle
                                    ? void startPieceStyleCheckout(paidStyle, user.uid).catch((error) =>
                                        setNotice(error instanceof Error ? error.message : "Could not start checkout.")
                                      )
                                    : undefined
                                }
                              >
                                {t.buyStyle.replace("{style}", label)}
                              </Button>
                            ) : (
                              <Button
                                className="w-full"
                                variant={selectedStyle ? "default" : "outline"}
                                size="sm"
                                disabled={proLocked}
                                onClick={() => void setUserPieceStyle(user.uid, style)}
                              >
                                {proLocked ? `${label} Pro` : label}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {!isPro ? <p className="text-xs text-muted-foreground">{t.proStylesLocked}</p> : null}
                    <p className="text-xs text-muted-foreground">{t.paidStylesNote}</p>
                    <p className="text-xs text-muted-foreground">{t.assetNote}</p>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{t.signInToSave}</p>
                  <Button className="w-full" onClick={() => void signInGoogle()} disabled={!firebaseEnabled}>
                    <LogIn className="h-4 w-4" /> Sign in
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.allGames}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {savedGames.length ? (
                savedGames.map((saved) => {
                  const fens = saved.fenHistory?.split("\n").filter(Boolean) || [new Chess().fen()];
                  const currentPly = Math.min(gameReplayPly[saved.id] ?? 0, fens.length - 1);
                  const currentFen = fens[currentPly] || fens[0];
                  const expanded = expandedGameId === saved.id;
                  return (
                    <div
                      key={saved.id}
                      className={cn(
                        "grid gap-4 rounded-md border bg-background p-4 text-sm",
                        expanded ? "lg:grid-cols-[minmax(320px,720px)_1fr]" : "md:grid-cols-[220px_1fr]"
                      )}
                    >
                      <MiniBoard fen={currentFen} large={expanded} pieceStyle={pieceStyle} />
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold">{saved.opponent}</div>
                            <div className="text-muted-foreground">{translatedResult(saved.result, t)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge>{saved.scoreDelta >= 0 ? "+" : ""}{saved.scoreDelta}</Badge>
                            <Button
                              variant="outline"
                              size="icon"
                            title={expanded ? t.useCompactBoard : t.useLargeBoard}
                              onClick={() => setExpandedGameId(expanded ? null : saved.id)}
                            >
                              <Maximize2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setGameReplayPly((state) => ({ ...state, [saved.id]: Math.max(0, currentPly - 1) }))
                            }
                            disabled={currentPly === 0}
                          >
                            {t.back}
                          </Button>
                          <Badge>
                            {currentPly} / {Math.max(0, fens.length - 1)}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setGameReplayPly((state) => ({ ...state, [saved.id]: Math.min(fens.length - 1, currentPly + 1) }))
                            }
                            disabled={currentPly >= fens.length - 1}
                          >
                            {t.forward}
                          </Button>
                        </div>
                        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                          {saved.pgn || t.noPgn}
                        </div>
                        <details>
                          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">{t.currentFen}</summary>
                          <pre className="mt-2 max-h-24 overflow-auto rounded-md bg-muted p-3 text-xs">{currentFen}</pre>
                        </details>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">{t.noSavedGames}</p>
              )}
            </CardContent>
          </Card>
        </section>
      ) : (
      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[minmax(320px,720px)_1fr]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {lockedMode ? null : (
              <>
                <Button variant={mode === "local" ? "default" : "outline"} asChild>
                  <Link href="/play/local">
                    <Users className="h-4 w-4" /> {t.local}
                  </Link>
                </Button>
                <Button variant={mode === "ai" ? "default" : "outline"} asChild>
                  <Link href="/play/stockfish">
                    <Bot className="h-4 w-4" /> {t.stockfish}
                  </Link>
                </Button>
              </>
            )}
            {mode === "ai" ? (
              <Button variant="outline" onClick={() => switchAiColor(aiPlayerColor === "w" ? "b" : "w")}>
                <Swords className="h-4 w-4" /> {aiPlayerColor === "w" ? t.playBlack : t.playWhite}
              </Button>
            ) : null}
            {lockedMode ? null : (
              <Button variant={mode === "online" ? "default" : "outline"} asChild>
                <Link href="/play/friend">
                  <LinkIcon className="h-4 w-4" /> {t.multiplayer}
                </Link>
              </Button>
            )}
            {mode === "online" ? (
              <>
                <Button variant="outline" onClick={createRoom}>
                  <LinkIcon className="h-4 w-4" /> {t.createRoom}
                </Button>
                <Button variant={onlineGameKind === "random" ? "default" : "outline"} onClick={findRandomPlayer} disabled={matchmaking}>
                  <Search className="h-4 w-4" /> {matchmaking ? t.searching : t.findRandom}
                </Button>
              </>
            ) : null}
            <Button variant="outline" size="icon" title={t.resetBoard} onClick={() => resetBoard()}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" title={t.saveGame} onClick={() => void persistFinishedGame(false)}>
              <Save className="h-4 w-4" />
            </Button>
          </div>

          {mode === "ai" ? (
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{t.enemyDifficulty}</div>
                  <div className="text-xs text-muted-foreground">{t.enemyHelp}</div>
                </div>
                <Badge>{t.level} {aiDifficulty}</Badge>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                value={aiDifficulty}
                onChange={(event) => setAiDifficulty(Number(event.target.value))}
                className="mt-3 w-full accent-primary"
                aria-label="Enemy Stockfish difficulty"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>{t.easy}</span>
                <span>{t.strong}</span>
              </div>
            </div>
          ) : null}

          <div className="flex w-full max-w-[720px] items-center justify-between rounded-lg border bg-card px-4 py-3 shadow-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.opponent}</div>
              <div className="font-semibold">{topPlayer.name}</div>
            </div>
            <Badge>{topPlayer.color}</Badge>
          </div>

          <div className="aspect-square w-full max-w-[720px] overflow-hidden rounded-lg border shadow-sm">
            <div className="board-grid h-full w-full">
              {displaySquares.map((square) => {
                  const fileIndex = files.indexOf(square[0]);
                  const rankIndex = ranks.indexOf(square[1]);
                  const piece = visibleGame.get(square);
                  const dark = (fileIndex + rankIndex) % 2 === 1;
                  const active = selected === square;
                  const target = legalTargets.has(square);
                  const suggestedFrom = suggestedMove?.from === square && reviewPly === null;
                  const suggestedTo = suggestedMove?.to === square && reviewPly === null;
                  const showFile = activePlayerColor === "b" ? square[1] === "8" : square[1] === "1";
                  const showRank = activePlayerColor === "b" ? square[0] === "h" : square[0] === "a";
                  return (
                    <button
                      key={square}
                      className={cn(
                        "relative flex min-h-0 min-w-0 items-center justify-center text-[clamp(1.75rem,8vw,4.8rem)] leading-none transition-colors",
                        dark ? "bg-[#688b58]" : "bg-[#f2d8a7]",
                        active && "outline outline-4 outline-accent outline-offset-[-4px]",
                        target && "after:absolute after:h-4 after:w-4 after:rounded-full after:bg-accent/70",
                        suggestedFrom && "ring-4 ring-secondary ring-inset",
                        suggestedTo && "bg-accent/70 ring-4 ring-accent ring-inset"
                      )}
                      onClick={() => clickSquare(square)}
                      aria-label={square}
                    >
                      {showRank ? (
                        <span className="absolute left-1 top-1 text-[10px] font-bold uppercase leading-none text-foreground/70 md:text-xs">
                          {square[1]}
                        </span>
                      ) : null}
                      {showFile ? (
                        <span className="absolute bottom-1 right-1 text-[10px] font-bold uppercase leading-none text-foreground/70 md:text-xs">
                          {square[0]}
                        </span>
                      ) : null}
                      {suggestedFrom ? (
                        <span className="absolute right-1 top-1 rounded-sm bg-secondary px-1 text-[10px] font-bold text-secondary-foreground">
                          FROM
                        </span>
                      ) : null}
                      {suggestedTo ? (
                        <span className="absolute right-1 top-1 rounded-sm bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                          TO
                        </span>
                      ) : null}
                      {piece ? <ChessPieceIcon color={piece.color} type={piece.type} style={pieceStyle} /> : null}
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="flex w-full max-w-[720px] items-center justify-between rounded-lg border bg-card px-4 py-3 shadow-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.you}</div>
              <div className="font-semibold">{bottomPlayer.name}</div>
            </div>
            <Badge>{bottomPlayer.color}</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge>{translatedResult(status, t)}</Badge>
            <Badge>{game.turn() === "w" ? t.whiteToMove : t.blackToMove}</Badge>
            <Badge>{t.you}: {activePlayerColor === "w" ? t.white : t.black}</Badge>
            <Badge>{mode}</Badge>
            {mode === "online" ? <Badge>{onlineGameKind === "random" ? t.randomMatch : t.friendRoom}</Badge> : null}
            {reviewPly !== null ? <Badge>{t.viewingPly.replace("{ply}", String(reviewPly))}</Badge> : null}
            <Badge>{mode === "online" ? `Socket: ${socketStatus}` : t.socketFriend}</Badge>
            {notice ? <span className="text-muted-foreground">{notice}</span> : null}
          </div>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t.aiCoach}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{coachText}</p>
              {mode === "online" && onlineGameKind === "random" ? (
                <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                  {t.coachUnavailableRandom}
                </div>
              ) : coachLine ? (
                <div className="rounded-md bg-muted p-3 text-sm">
                  {t.depth} {coachLine.depth} | {t.eval} {coachLine.score}
                  <div className="mt-1 break-words text-muted-foreground">{coachLine.pv}</div>
                </div>
              ) : null}
              <Button className="w-full" onClick={analyze} disabled={mode === "online" && onlineGameKind === "random"}>
                <BrainCircuit className="h-4 w-4" /> {t.analyze}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.multiplayer}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder={t.roomCode} />
                <Button onClick={() => joinRoom()}>{t.join}</Button>
              </div>
              <Button className="w-full" variant="outline" onClick={findRandomPlayer} disabled={matchmaking}>
                <Search className="h-4 w-4" /> {matchmaking ? t.searchingRandom : t.findRandomPlayer}
              </Button>
              {roomId ? (
                <div className="rounded-md bg-muted p-3 text-sm">
                  {onlineGameKind === "random" ? t.randomMatch : t.room} <strong>{roomId}</strong>
                  {onlineGameKind === "friend" ? <div className="mt-1 break-words text-muted-foreground">{shareUrl}</div> : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.leaderboard}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder={t.yourCity} />
              <div className="space-y-2">
                {leaderboard.length ? (
                  leaderboard.map((player, index) => (
                    <div key={player.id} className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                      <span>{index + 1}. {player.name} <span className="text-muted-foreground">({player.city})</span></span>
                      <span className="font-semibold">{player.score}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">{t.noScores}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.moveHistory}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button variant={reviewPly === null ? "default" : "outline"} size="sm" onClick={() => setReviewPly(null)}>
                  {t.live}
                </Button>
                <Button variant={reviewPly === 0 ? "default" : "outline"} size="sm" onClick={() => setReviewPly(0)}>
                  {t.start}
                </Button>
              </div>
              <div className="grid max-h-44 grid-cols-2 gap-2 overflow-auto text-sm md:grid-cols-3">
                {moveRecords.length ? (
                  moveRecords.map((move) => (
                    <button
                      key={move.ply}
                      className={cn(
                        "rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted",
                        reviewPly === move.ply && "bg-muted"
                      )}
                      onClick={() => setReviewPly(move.ply)}
                    >
                      <span className="font-semibold">{move.ply}.</span> {move.san}
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">{t.noMoves}</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t.clickMoveHelp}</p>
            </CardContent>
          </Card>

        </div>
      </section>
      )}
    </main>
  );
}
