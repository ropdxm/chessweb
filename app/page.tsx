"use client";

import Link from "next/link";
import { ArrowRight, Bot, Crown, Search, Swords, UserRound, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { useFirebaseUser, useSavedGames, useUserProfile } from "@/lib/firebase";

const boardPieces: Record<string, string> = {
  "0-2": "\u265d",
  "0-4": "\u265a",
  "1-3": "\u265f",
  "2-5": "\u265e",
  "3-2": "\u2659",
  "4-4": "\u2655",
  "5-1": "\u2658",
  "6-5": "\u2659",
  "7-3": "\u2654"
};

export default function Home() {
  const { t } = useI18n();
  const { user } = useFirebaseUser();
  const profile = useUserProfile(user?.uid);
  const savedGames = useSavedGames(user?.uid);
  const playRoutes = [
    { href: "/play/stockfish", title: t.playStockfish, body: t.playStockfishBody, icon: Bot, accent: "bg-primary text-primary-foreground" },
    { href: "/play/friend", title: t.playWithFriend, body: t.playWithFriendBody, icon: Users, accent: "bg-accent text-accent-foreground" },
    { href: "/play/random", title: t.playRandom, body: t.playRandomBody, icon: Search, accent: "bg-foreground text-background" },
    { href: "/play/local", title: t.localGame, body: t.localGameBody, icon: Swords, accent: "bg-secondary text-secondary-foreground" }
  ];
  const sideRoutes = [
    { href: "/profile", title: t.profile, body: t.profileBody, icon: UserRound },
    { href: "/pro", title: t.upgradeToPro, body: t.upgradeToProBody, icon: Crown }
  ];

  return (
    <main className="min-h-screen px-4 py-6">
      <section className="mx-auto grid max-w-7xl items-start gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="h-fit overflow-hidden">
          <CardContent className="grid gap-6 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge>{profile?.pro ? t.proActive : t.freePlan}</Badge>
                  <Badge>{user ? user.displayName || user.email || t.profile : t.login}</Badge>
                </div>
                <div className="space-y-3">
                  <h1 className="max-w-2xl text-4xl font-bold tracking-normal md:text-5xl">{t.appName}</h1>
                  <p className="max-w-xl text-base leading-7 text-muted-foreground">{t.legalChessSubtitle}</p>
                </div>
              </div>

              <div className="grid gap-2">
                {playRoutes.map((route) => {
                  const Icon = route.icon;
                  return (
                    <Link
                      key={route.href}
                      href={route.href}
                      className="group grid grid-cols-[42px_1fr_auto] items-center gap-3 rounded-md border bg-background px-3 py-3 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm"
                    >
                      <span className={`grid h-10 w-10 place-items-center rounded-md ${route.accent}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block font-semibold">{route.title}</span>
                        <span className="line-clamp-1 text-sm text-muted-foreground">{route.body}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
                    </Link>
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-2 text-sm">
                <div className="rounded-md bg-card px-3 py-2">
                  <div className="text-xs text-muted-foreground">{t.gamesSaved}</div>
                  <div className="font-semibold">{savedGames.length}</div>
                </div>
                <div className="rounded-md bg-card px-3 py-2">
                  <div className="text-xs text-muted-foreground">{t.pro}</div>
                  <div className="font-semibold">{profile?.pro ? t.proActive : t.freePlan}</div>
                </div>
                <div className="rounded-md bg-card px-3 py-2">
                  <div className="text-xs text-muted-foreground">{t.board}</div>
                  <div className="font-semibold">{t.stockfish}</div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border bg-background p-3 shadow-inner">
                <div className="grid aspect-square overflow-hidden rounded-md border">
                  <div className="board-grid h-full w-full">
                    {Array.from({ length: 64 }).map((_, index) => {
                      const row = Math.floor(index / 8);
                      const col = index % 8;
                      const dark = (row + col) % 2 === 1;
                      const piece = boardPieces[`${row}-${col}`];
                      return (
                        <div
                          key={`${row}-${col}`}
                          className={`grid place-items-center text-2xl leading-none md:text-3xl ${dark ? "bg-[#688b58]" : "bg-[#f2d8a7]"}`}
                        >
                          {piece ? <span className="drop-shadow-sm">{piece}</span> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <Button className="w-full justify-between" asChild>
                <Link href="/play/stockfish">
                  <span className="flex items-center gap-2">
                    <Bot className="h-4 w-4" /> {t.playStockfish}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5">
          <div className="grid gap-5">
            <Card>
              <CardHeader>
                <CardTitle>{t.profile}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md bg-muted p-3 text-sm">
                  {t.gamesSaved}: <span className="font-semibold">{savedGames.length}</span>
                </div>
                <Button className="w-full" variant="outline" asChild>
                  <Link href={user ? "/profile" : "/login"}>
                    <UserRound className="h-4 w-4" /> {user ? t.profile : t.login}
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {sideRoutes.slice(1).map((route) => {
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
                    <Button className="w-full" variant="secondary" asChild>
                      <Link href={route.href}>{t.open}</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
