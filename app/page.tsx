"use client";

import Link from "next/link";
import { Bot, Crown, LogIn, MonitorUp, Swords, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

export default function Home() {
  const { t } = useI18n();
  const routes = [
    { href: "/play/stockfish", title: t.playStockfish, body: t.playStockfishBody, icon: Bot },
    { href: "/play/friend", title: t.playWithFriend, body: t.playWithFriendBody, icon: Users },
    { href: "/play/local", title: t.localGame, body: t.localGameBody, icon: Swords },
    { href: "/profile", title: t.profile, body: t.profileBody, icon: UserRound },
    { href: "/pro", title: t.upgradeToPro, body: t.upgradeToProBody, icon: Crown }
  ];

  return (
    <main className="min-h-screen">
      <section className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5">
          <div>
            <h1 className="text-3xl font-bold">{t.appName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.chooseHow}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/login">
                <LogIn className="h-4 w-4" /> {t.login}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/register">
                <MonitorUp className="h-4 w-4" /> {t.register}
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
                  <Link href={route.href}>{t.open}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </main>
  );
}
