"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Gem, Palette, Trophy, WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markPro, useFirebaseUser, useUserProfile } from "@/lib/firebase";
import { startProCheckout } from "@/lib/stripe";

const perks = [
  {
    title: "Premium Piece Styles",
    body: "Unlock Neo and Mono chess sets in addition to the classic set.",
    icon: Palette
  },
  {
    title: "Stronger AI Coach",
    body: "Free users get lighter analysis. Pro users get the best move by default.",
    icon: WandSparkles
  },
  {
    title: "Rating Boost",
    body: "Earn +15 rating for wins instead of +10.",
    icon: Trophy
  }
];

export default function ProPage() {
  const { user, loading } = useFirebaseUser();
  const profile = useUserProfile(user?.uid);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success" && user) {
      void markPro(user.uid).then(() => setMessage("Welcome to Pro. Your benefits are unlocked."));
    }
    if (params.get("checkout") === "cancelled") {
      setMessage("Checkout was cancelled. You can try again anytime.");
    }
  }, [user]);

  async function subscribe() {
    if (!user) {
      setMessage("Please log in before upgrading.");
      return;
    }
    setMessage("Opening Stripe checkout...");
    try {
      await startProCheckout(user.uid, "/pro");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start checkout.");
    }
  }

  return (
    <main className="min-h-screen">
      <section className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5">
          <div>
            <h1 className="text-3xl font-bold">ChessLift Pro</h1>
            <p className="mt-1 text-sm text-muted-foreground">Monthly subscription for stronger training and premium customization.</p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/play/stockfish">Back to chess</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5" /> Upgrade
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-4xl font-bold">$5</div>
              <div className="text-sm text-muted-foreground">per month</div>
            </div>
            <Badge>{profile?.pro ? "Pro active" : "Free plan"}</Badge>
            <Button className="w-full" onClick={() => void subscribe()} disabled={loading || profile?.pro}>
              <Gem className="h-4 w-4" /> {profile?.pro ? "Already Pro" : "Subscribe with Stripe"}
            </Button>
            {!user ? (
              <Button className="w-full" variant="outline" asChild>
                <Link href="/login">Login first</Link>
              </Button>
            ) : null}
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {perks.map((perk) => {
            const Icon = perk.icon;
            return (
              <Card key={perk.title}>
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="rounded-md bg-muted p-3">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold">{perk.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{perk.body}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </main>
  );
}
