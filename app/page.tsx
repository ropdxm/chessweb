"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import {
  Bot,
  BrainCircuit,
  Crown,
  Link as LinkIcon,
  LogIn,
  LogOut,
  Moon,
  RotateCcw,
  Save,
  Maximize2,
  Sun,
  Swords,
  Users
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  firebaseEnabled,
  saveGameRecord,
  signInGoogle,
  signInGuest,
  signOutUser,
  updateLeaderboard,
  upsertUserProfile,
  useFirebaseUser,
  useLeaderboard,
  useSavedGames,
  type SavedMove
} from "@/lib/firebase";
import { createStockfish, type StockfishLine } from "@/lib/stockfish";
import { startProCheckout } from "@/lib/stripe";
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

function ChessPieceIcon({ color, type, large = false }: { color: "w" | "b"; type: string; large?: boolean }) {
  const fill = color === "w" ? "#f8fafc" : "#111827";
  const stroke = color === "w" ? "#334155" : "#f8fafc";
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
        large ? "text-[clamp(3rem,7vw,5.8rem)]" : "text-[clamp(1.4rem,4vw,3.8rem)]",
        color === "b" ? "text-slate-950" : "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
      )}
    >
      {pieceGlyphs[`${color}${type}`]}
    </span>
  );
}

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];

type Mode = "local" | "ai" | "online";
type ServerMessage =
  | { type: "room-created"; roomId: string; fen: string; color: "w" | "b" }
  | { type: "joined"; roomId: string; fen: string; color: "w" | "b" }
  | { type: "state"; fen: string; pgn: string; turn: "w" | "b"; result?: string; moves: string[] }
  | { type: "error"; message: string };

type MoveRecord = SavedMove;

function squareName(fileIndex: number, rankIndex: number) {
  return `${files[fileIndex]}${ranks[rankIndex]}` as Square;
}

function classifyResult(game: Chess) {
  if (game.isCheckmate()) return game.turn() === "w" ? "Black won by checkmate" : "White won by checkmate";
  if (game.isStalemate()) return "Draw by stalemate";
  if (game.isThreefoldRepetition()) return "Draw by repetition";
  if (game.isInsufficientMaterial()) return "Draw by insufficient material";
  if (game.isDraw()) return "Draw";
  return "In progress";
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

function scoreDeltaForResult(result: string, userColor: "w" | "b") {
  if (result.startsWith("White won")) return userColor === "w" ? 10 : -5;
  if (result.startsWith("Black won")) return userColor === "b" ? 10 : -5;
  return 0;
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

function MiniBoard({ fen, large = false }: { fen: string; large?: boolean }) {
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
            {piece ? <ChessPieceIcon color={piece.color} type={piece.type} large={large} /> : null}
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [game, setGame] = useState(() => new Chess());
  const [moveRecords, setMoveRecords] = useState<MoveRecord[]>([]);
  const [reviewPly, setReviewPly] = useState<number | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [mode, setMode] = useState<Mode>("ai");
  const [view, setView] = useState<"play" | "profile">("play");
  const [city, setCity] = useState("Almaty");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [coachLine, setCoachLine] = useState<StockfishLine | null>(null);
  const [coachText, setCoachText] = useState("Stockfish is ready to review the current position.");
  const [suggestedMove, setSuggestedMove] = useState<{ from: Square; to: Square } | null>(null);
  const [roomId, setRoomId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [playerColor, setPlayerColor] = useState<"w" | "b">("w");
  const [aiPlayerColor, setAiPlayerColor] = useState<"w" | "b">("w");
  const [socketStatus, setSocketStatus] = useState("offline");
  const [notice, setNotice] = useState("");
  const [savedGameKey, setSavedGameKey] = useState("");
  const [resultDialog, setResultDialog] = useState<{ title: string; body: string; delta: number } | null>(null);
  const [gameReplayPly, setGameReplayPly] = useState<Record<string, number>>({});
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const analysisRequestedRef = useRef(false);
  const engineRef = useRef<ReturnType<typeof createStockfish> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { user } = useFirebaseUser();
  const leaderboard = useLeaderboard();
  const savedGames = useSavedGames(user?.uid);
  const activePlayerColor = mode === "online" ? playerColor : mode === "ai" ? aiPlayerColor : "w";

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
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (user) void upsertUserProfile(user, city);
  }, [city, user]);

  useEffect(() => {
    engineRef.current = createStockfish({
      onLine: setCoachLine,
      onBestMove: (move) => {
        const parsed = parseUciMove(move);
        if (analysisRequestedRef.current) {
          setSuggestedMove(parsed);
          analysisRequestedRef.current = false;
        }
        setCoachText(`Coach: the engine likes ${move || "this position"}.`);
      },
      onStatus: (status) => setCoachText(status === "ready" ? "Stockfish is ready to review the current position." : status)
    });
    return () => engineRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (mode !== "ai" || game.turn() === aiPlayerColor || game.isGameOver()) return;
    const timer = window.setTimeout(() => {
      engineRef.current?.bestMove(game.fen(), 8, game.moves({ verbose: true }));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [aiPlayerColor, game, mode]);

  useEffect(() => {
    if (!coachText.startsWith("Coach:") || mode !== "ai" || game.turn() === aiPlayerColor) return;
    const bestMove = coachText.match(/likes ([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1];
    if (!bestMove) return;
    const next = new Chess(game.fen());
    try {
      const before = new Chess(game.fen());
      next.move({
        from: bestMove.slice(0, 2) as Square,
        to: bestMove.slice(2, 4) as Square,
        promotion: bestMove[4] || "q"
      });
      const move = before.move({
        from: bestMove.slice(0, 2) as Square,
        to: bestMove.slice(2, 4) as Square,
        promotion: bestMove[4] || "q"
      });
      setGame(next);
      setMoveRecords((records) => [...records, makeMoveRecord(new Chess(game.fen()), next, move, records.length + 1)]);
      setReviewPly(null);
      setCoachText(`Stockfish played ${bestMove}.`);
    } catch {
      setCoachText("Stockfish suggested a move this build could not apply.");
    }
  }, [aiPlayerColor, coachText, game, mode]);

  useEffect(() => {
    if (!game.isGameOver() || !moveRecords.length) return;
    if (!user) {
      setNotice("Sign in to auto-save finished games.");
      return;
    }
    const key = `${game.fen()}-${moveRecords.length}`;
    if (savedGameKey === key) return;
    const result = classifyResult(game);
    const delta = scoreDeltaForResult(result, activePlayerColor);
    if (delta > 0) {
      setResultDialog({
        title: "Congratualtions! You won!",
        body: "Your rating increased by 10.",
        delta
      });
    }
    void persistFinishedGame(true);
    setSavedGameKey(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayerColor, game, moveRecords, savedGameKey, user]);

  function replaceGame(next: Chess) {
    setGame(next);
    setSelected(null);
  }

  function sendWs(payload: Record<string, unknown>) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
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
        return;
      }
      if (message.type === "room-created" || message.type === "joined") {
        setRoomId(message.roomId);
        setPlayerColor(message.color);
        setGame(new Chess(message.fen));
        setMode("online");
        setNotice(message.type === "room-created" ? "Room created. Share the link." : "Joined room.");
        return;
      }
      if (message.type === "state") {
        setGame(new Chess(message.fen));
        setMoveRecords(recordsFromSanMoves(message.moves));
        setReviewPly(null);
        setNotice(message.result || `${message.turn === "w" ? "White" : "Black"} to move`);
      }
    };
  }

  function createRoom() {
    connectSocket((socket) => socket.send(JSON.stringify({ type: "create-room" })));
  }

  function joinRoom(id = joinCode.trim()) {
    if (!id) return;
    connectSocket((socket) => socket.send(JSON.stringify({ type: "join-room", roomId: id })));
  }

  function switchAiColor(color: "w" | "b") {
    setAiPlayerColor(color);
    resetBoard("ai", color);
  }

  function handleMove(from: Square, to: Square) {
    if (mode === "online") {
      if (game.turn() !== playerColor) {
        setNotice("Wait for your turn.");
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
      setNotice("Illegal move.");
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
      setNotice("Return to live board before making a move.");
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
      setNotice("That side belongs to the AI.");
      return;
    }
    if (piece && (mode !== "online" || piece.color === playerColor)) {
      setSelected(square);
    }
  }

  async function persistFinishedGame(auto = false) {
    const result = classifyResult(game);
    const delta = scoreDeltaForResult(result, activePlayerColor);
    const finishedKey = game.isGameOver() ? `${game.fen()}-${moveRecords.length}` : "";
    if (finishedKey && savedGameKey === finishedKey) {
      setNotice("This finished game is already saved.");
      return;
    }
    await saveGameRecord({
      userId: user?.uid,
      opponent: mode === "ai" ? "Stockfish" : mode === "online" ? `Room ${roomId}` : "Local player",
      pgn: moveRecords.map((move) => move.san).join(" "),
      result,
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
        ? `${auto ? "Finished game auto-saved" : "Game saved"} to Firestore. Rating ${delta >= 0 ? "+" : ""}${delta}.`
        : "Sign in to save progress."
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
    setNotice("New game started.");
    setCoachLine(null);
    setSuggestedMove(null);
  }

  function analyze() {
    setCoachText("Coach is calculating...");
    setSuggestedMove(null);
    analysisRequestedRef.current = true;
    engineRef.current?.bestMove(game.fen(), 12, game.moves({ verbose: true }));
  }

  const status = classifyResult(game);
  const shareUrl = typeof window !== "undefined" && roomId ? `${window.location.origin}?room=${roomId}` : "";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) {
      setJoinCode(room);
      joinRoom(room);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <section className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-normal">ChessLift</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Legal chess, AI sparring, realtime friend rooms, progress history, city rankings, and Pro upgrades.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" title="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {user ? (
              <Button variant="outline" onClick={() => void signOutUser()}>
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => void signInGuest()} disabled={!firebaseEnabled}>
                  <LogIn className="h-4 w-4" /> Guest
                </Button>
                <Button onClick={() => void signInGoogle()} disabled={!firebaseEnabled}>
                  <LogIn className="h-4 w-4" /> Google
                </Button>
              </>
            )}
            <Button variant={view === "profile" ? "default" : "outline"} onClick={() => setView(view === "profile" ? "play" : "profile")}>
              <Users className="h-4 w-4" /> {view === "profile" ? "Board" : "Profile"}
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void startProCheckout(user?.uid).catch((error) =>
                  setNotice(error instanceof Error ? error.message : "Stripe checkout is not configured.")
                )
              }
            >
              <Crown className="h-4 w-4" /> Pro
            </Button>
          </div>
        </div>
      </section>

      {view === "profile" ? (
        <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {user ? (
                <>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Name</div>
                    <div className="font-semibold">{user.displayName || "Guest player"}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Email</div>
                    <div className="break-words font-semibold">{user.email || "Anonymous account"}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">City</div>
                    <Input value={city} onChange={(event) => setCity(event.target.value)} />
                  </div>
                  <div className="rounded-md bg-muted p-3 text-sm">
                    Games saved: <span className="font-semibold">{savedGames.length}</span>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Sign in to save games and see your profile.</p>
                  <Button className="w-full" onClick={() => void signInGoogle()} disabled={!firebaseEnabled}>
                    <LogIn className="h-4 w-4" /> Sign in
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>All Games</CardTitle>
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
                      <MiniBoard fen={currentFen} large={expanded} />
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold">{saved.opponent}</div>
                            <div className="text-muted-foreground">{saved.result}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge>{saved.scoreDelta >= 0 ? "+" : ""}{saved.scoreDelta}</Badge>
                            <Button
                              variant="outline"
                              size="icon"
                              title={expanded ? "Use compact board" : "Use large board"}
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
                            Back
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
                            Forward
                          </Button>
                        </div>
                        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                          {saved.pgn || "No PGN stored"}
                        </div>
                        <details>
                          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Current FEN</summary>
                          <pre className="mt-2 max-h-24 overflow-auto rounded-md bg-muted p-3 text-xs">{currentFen}</pre>
                        </details>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">No saved games yet. Finished games are saved automatically after sign-in.</p>
              )}
            </CardContent>
          </Card>
        </section>
      ) : (
      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[minmax(320px,720px)_1fr]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button variant={mode === "local" ? "default" : "outline"} onClick={() => resetBoard("local")}>
              <Users className="h-4 w-4" /> Local
            </Button>
            <Button variant={mode === "ai" ? "default" : "outline"} onClick={() => resetBoard("ai")}>
              <Bot className="h-4 w-4" /> Stockfish
            </Button>
            {mode === "ai" ? (
              <Button variant="outline" onClick={() => switchAiColor(aiPlayerColor === "w" ? "b" : "w")}>
                <Swords className="h-4 w-4" /> Play {aiPlayerColor === "w" ? "Black" : "White"}
              </Button>
            ) : null}
            <Button variant={mode === "online" ? "default" : "outline"} onClick={createRoom}>
              <LinkIcon className="h-4 w-4" /> Friend link
            </Button>
            <Button variant="outline" size="icon" title="Reset board" onClick={() => resetBoard()}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" title="Save game" onClick={() => void persistFinishedGame(false)}>
              <Save className="h-4 w-4" />
            </Button>
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
                      {piece ? <ChessPieceIcon color={piece.color} type={piece.type} /> : null}
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge>{status}</Badge>
            <Badge>{game.turn() === "w" ? "White" : "Black"} to move</Badge>
            <Badge>You: {activePlayerColor === "w" ? "White" : "Black"}</Badge>
            <Badge>{mode}</Badge>
            {reviewPly !== null ? <Badge>Viewing ply {reviewPly}</Badge> : null}
            <Badge>{mode === "online" ? `Socket: ${socketStatus}` : "Socket: connects for friend rooms"}</Badge>
            {notice ? <span className="text-muted-foreground">{notice}</span> : null}
          </div>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Coach</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{coachText}</p>
              {coachLine ? (
                <div className="rounded-md bg-muted p-3 text-sm">
                  Depth {coachLine.depth} | Eval {coachLine.score}
                  <div className="mt-1 break-words text-muted-foreground">{coachLine.pv}</div>
                </div>
              ) : null}
              <Button className="w-full" onClick={analyze}>
                <BrainCircuit className="h-4 w-4" /> Analyze position
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Multiplayer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Room code" />
                <Button onClick={() => joinRoom()}>Join</Button>
              </div>
              {roomId ? (
                <div className="rounded-md bg-muted p-3 text-sm">
                  Room <strong>{roomId}</strong>
                  <div className="mt-1 break-words text-muted-foreground">{shareUrl}</div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Global Leaderboard</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Your city" />
              <div className="space-y-2">
                {leaderboard.length ? (
                  leaderboard.map((player, index) => (
                    <div key={player.id} className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                      <span>{index + 1}. {player.name} <span className="text-muted-foreground">({player.city})</span></span>
                      <span className="font-semibold">{player.score}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No Firestore scores yet. Wins add 10 points, losses subtract 5.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Move History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button variant={reviewPly === null ? "default" : "outline"} size="sm" onClick={() => setReviewPly(null)}>
                  Live
                </Button>
                <Button variant={reviewPly === 0 ? "default" : "outline"} size="sm" onClick={() => setReviewPly(0)}>
                  Start
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
                  <p className="text-sm text-muted-foreground">No moves yet.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Click a move to inspect that old position. The live game is unchanged.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Saved Games</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {savedGames.length ? (
                savedGames.map((saved) => (
                  <div key={saved.id} className="rounded-md bg-muted p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{saved.opponent}</span>
                      <span className={saved.scoreDelta >= 0 ? "text-primary" : "text-destructive"}>
                        {saved.scoreDelta >= 0 ? "+" : ""}{saved.scoreDelta}
                      </span>
                    </div>
                    <div className="mt-1 text-muted-foreground">{saved.result}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{saved.pgn || saved.fenHistory}</div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Sign in and save a game to see your Firestore history here.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
      )}
    </main>
  );
}
