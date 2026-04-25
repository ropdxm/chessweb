import Link from "next/link";
import { Bot, Crown, LogIn, MonitorUp, Swords, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const routes = [
  {
    href: "/play/stockfish",
    title: "Play Stockfish",
    body: "Choose your color, set enemy difficulty, and train against the engine.",
    icon: Bot
  },
  {
    href: "/play/friend",
    title: "Play With Friend",
    body: "Create a WebSocket room and share the friend link.",
    icon: Users
  },
  {
    href: "/play/local",
    title: "Local Game",
    body: "Play legal chess with two players on the same screen.",
    icon: Swords
  },
  {
    href: "/profile",
    title: "Profile",
    body: "View profile information, rating, and replay saved games.",
    icon: UserRound
  },
  {
    href: "/pro",
    title: "Upgrade to Pro",
    body: "Subscribe monthly for premium pieces, stronger coaching, and rating boosts.",
    icon: Crown
  }
];

export default function Home() {
  return (
    <main className="min-h-screen">
      <section className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5">
          <div>
            <h1 className="text-3xl font-bold">ChessLift</h1>
            <p className="mt-1 text-sm text-muted-foreground">Choose how you want to play.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/login">
                <LogIn className="h-4 w-4" /> Login
              </Link>
            </Button>
            <Button asChild>
              <Link href="/register">
                <MonitorUp className="h-4 w-4" /> Register
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-6 md:grid-cols-2">
        {routes.map((route) => {
          const Icon = route.icon;
          return (
            <Card key={route.href}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="h-5 w-5" /> {route.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{route.body}</p>
                <Button asChild>
                  <Link href={route.href}>Open</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </main>
  );
}
