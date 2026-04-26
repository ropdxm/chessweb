import ChessApp from "@/components/chess-app";

export default function RandomPage() {
  return <ChessApp initialMode="online" initialOnlineKind="random" lockedMode requireAuth />;
}
