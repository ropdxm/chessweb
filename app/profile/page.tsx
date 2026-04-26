import ChessApp from "@/components/chess-app";

export default function ProfilePage() {
  return <ChessApp initialView="profile" lockedMode requireAuth />;
}
