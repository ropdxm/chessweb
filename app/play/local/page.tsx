import ChessApp from "@/components/chess-app";

export default function LocalPage() {
  return <ChessApp initialMode="local" lockedMode requireAuth />;
}
