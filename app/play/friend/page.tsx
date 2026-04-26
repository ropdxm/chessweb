import ChessApp from "@/components/chess-app";

export default function FriendPage() {
  return <ChessApp initialMode="online" lockedMode requireAuth />;
}
