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
  Sun,
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
  useLeaderboard
} from "@/lib/firebase";
import { createStockfish, type StockfishLine } from "@/lib/stockfish";
import { startProCheckout } from "@/lib/stripe";
import { cn } from "@/lib/utils";

const pieceGlyphs: Record<string, string> = {
  wp: "P",
  wn: "N",
  wb: "B",
  wr: "R",
  wq: "Q",
  wk: "K",
  bp: "p",
  bn: "n",
  bb: "b",
  br: "r",
  bq: "q",
  bk: "k"
};

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];

type Mode = "local" | "ai" | "online";
type ServerMessage =
  | { type: "room-created"; roomId: string; fen: string; color: "w" | "b" }
  | { type: "joined"; roomId: string; fen: string; color: "w" | "b" }
  | { type: "state"; fen: string; pgn: string; turn: "w" | "b"; result?: string; moves: string[] }
  | { type: "error"; message: string };

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

export default function Home() {
  const [game, setGame] = useState(() => new Chess());
  const [selected, setSelected] = useState<Square | null>(null);
  const [mode, setMode] = useState<Mode>("ai");
  const [city, setCity] = useState("Almaty");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [coachLine, setCoachLine] = useState<StockfishLine | null>(null);
  const [coachText, setCoachText] = useState("Stockfish is ready to review the current position.");
  const [roomId, setRoomId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [playerColor, setPlayerColor] = useState<"w" | "b">("w");
  const [socketStatus, setSocketStatus] = useState("offline");
  const [notice, setNotice] = useState("");
  const engineRef = useRef<ReturnType<typeof createStockfish> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { user } = useFirebaseUser();
  const leaderboard = useLeaderboard(city);

  const board = useMemo(() => game.board(), [game]);
  const legalTargets = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(game.moves({ square: selected, verbose: true }).map((move) => move.to));
  }, [game, selected]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (user) void upsertUserProfile(user, city);
  }, [city, user]);

  useEffect(() => {
    engineRef.current = createStockfish({
      onLine: setCoachLine,
      onBestMove: (move) => setCoachText(`Coach: the engine likes ${move || "this position"}.`)
    });
    return () => engineRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (mode !== "ai" || game.turn() !== "b" || game.isGameOver()) return;
    const timer = window.setTimeout(() => {
      engineRef.current?.bestMove(game.fen(), 8);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [game, mode]);

  useEffect(() => {
    if (!coachText.startsWith("Coach:") || mode !== "ai" || game.turn() !== "b") return;
    const bestMove = coachText.match(/likes ([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1];
    if (!bestMove) return;
    const next = new Chess(game.fen());
    try {
      next.move({
        from: bestMove.slice(0, 2) as Square,
        to: bestMove.slice(2, 4) as Square,
        promotion: bestMove[4] || "q"
      });
      setGame(next);
      setCoachText(`Stockfish played ${bestMove}.`);
    } catch {
      setCoachText("Stockfish suggested a move this build could not apply.");
    }
  }, [coachText, game, mode]);

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
      next.move({ from, to, promotion: "q" });
    } catch {
      setNotice("Illegal move.");
      setSelected(null);
      return;
    }
    replaceGame(next);
    setNotice(classifyResult(next));
  }

  function clickSquare(square: Square) {
    const piece = game.get(square);
    if (selected) {
      if (selected === square) {
        setSelected(null);
        return;
      }
      handleMove(selected, square);
      return;
    }
    if (piece && (mode !== "online" || piece.color === playerColor)) {
      setSelected(square);
    }
  }

  async function persistGame() {
    const result = classifyResult(game);
    await saveGameRecord({
      userId: user?.uid,
      opponent: mode === "ai" ? "Stockfish" : mode === "online" ? `Room ${roomId}` : "Local player",
      pgn: game.pgn(),
      result,
      moves: game.history()
    });
    await updateLeaderboard({
      userId: user?.uid,
      name: user?.displayName || "Guest player",
      city,
      delta: result.includes("White won") ? 12 : result.includes("Draw") ? 4 : 1
    });
    setNotice(user ? "Game saved to Firestore." : "Sign in to save progress.");
  }

  function resetBoard(nextMode = mode) {
    setMode(nextMode);
    setGame(new Chess());
    setSelected(null);
    setNotice("New game started.");
    setCoachLine(null);
  }

  function analyze() {
    setCoachText("Coach is calculating...");
    engineRef.current?.bestMove(game.fen(), 12);
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

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[minmax(320px,720px)_1fr]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button variant={mode === "local" ? "default" : "outline"} onClick={() => resetBoard("local")}>
              <Users className="h-4 w-4" /> Local
            </Button>
            <Button variant={mode === "ai" ? "default" : "outline"} onClick={() => resetBoard("ai")}>
              <Bot className="h-4 w-4" /> Stockfish
            </Button>
            <Button variant={mode === "online" ? "default" : "outline"} onClick={createRoom}>
              <LinkIcon className="h-4 w-4" /> Friend link
            </Button>
            <Button variant="outline" size="icon" title="Reset board" onClick={() => resetBoard()}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" title="Save game" onClick={() => void persistGame()}>
              <Save className="h-4 w-4" />
            </Button>
          </div>

          <div className="aspect-square w-full max-w-[720px] overflow-hidden rounded-lg border shadow-sm">
            <div className="board-grid h-full w-full">
              {board.flatMap((rank, rankIndex) =>
                rank.map((piece, fileIndex) => {
                  const square = squareName(fileIndex, rankIndex);
                  const dark = (fileIndex + rankIndex) % 2 === 1;
                  const active = selected === square;
                  const target = legalTargets.has(square);
                  return (
                    <button
                      key={square}
                      className={cn(
                        "relative flex min-h-0 min-w-0 items-center justify-center text-[clamp(1.75rem,8vw,4.8rem)] leading-none transition-colors",
                        dark ? "bg-[#688b58]" : "bg-[#f2d8a7]",
                        active && "outline outline-4 outline-accent outline-offset-[-4px]",
                        target && "after:absolute after:h-4 after:w-4 after:rounded-full after:bg-accent/70"
                      )}
                      onClick={() => clickSquare(square)}
                      aria-label={square}
                    >
                      <span className={piece?.color === "b" ? "text-slate-950" : "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"}>
                        {piece ? pieceGlyphs[`${piece.color}${piece.type}`] : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge>{status}</Badge>
            <Badge>{game.turn() === "w" ? "White" : "Black"} to move</Badge>
            <Badge>{mode}</Badge>
            <Badge>Socket: {socketStatus}</Badge>
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
              <CardTitle>Leaderboard by City</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" />
              <div className="space-y-2">
                {leaderboard.length ? (
                  leaderboard.map((player, index) => (
                    <div key={player.id} className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                      <span>{index + 1}. {player.name}</span>
                      <span className="font-semibold">{player.score}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No Firestore scores yet. Save a game to enter the board.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Move History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-44 overflow-auto text-sm text-muted-foreground">
                {game.history().length ? game.history().join(" ") : "No moves yet."}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
