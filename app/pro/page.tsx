"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Gem, Palette, Trophy, WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markPro, useFirebaseUser, useUserProfile } from "@/lib/firebase";
import { getCheckoutSession, startBillingPortal, startProCheckout } from "@/lib/stripe";
import { useI18n } from "@/lib/i18n";

export default function ProPage() {
  const { user, loading } = useFirebaseUser();
  const profile = useUserProfile(user?.uid);
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const perks = [
    { title: t.premiumPieceStyles, body: t.premiumPieceStylesBody, icon: Palette },
    { title: t.strongerCoach, body: t.strongerCoachBody, icon: WandSparkles },
    { title: t.ratingBoost, body: t.ratingBoostBody, icon: Trophy }
  ];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success" && user) {
      const sessionId = params.get("session_id");
      void (async () => {
        const session = sessionId ? await getCheckoutSession(sessionId) : {};
        await markPro(user.uid, session);
        setMessage(t.welcomePro);
        window.history.replaceState({}, "", "/pro");
      })().catch((error) => setMessage(error instanceof Error ? error.message : t.couldNotActivate));
    }
    if (params.get("checkout") === "cancelled") {
      setMessage(t.checkoutCancelled);
    }
  }, [user]);

  async function subscribe() {
    if (!user) {
      setMessage(t.loginFirst);
      return;
    }
    setMessage(t.openingStripe);
    try {
      await startProCheckout(user.uid, "/pro");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.couldNotCheckout);
    }
  }

  async function manageSubscription() {
    if (!profile?.stripeCustomerId) {
      setMessage(t.stripeCustomerMissing);
      return;
    }
    setMessage(t.openingPortal);
    try {
      await startBillingPortal(profile.stripeCustomerId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.couldNotPortal);
    }
  }

  return (
    <main className="min-h-screen">

      <section className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5" /> {t.upgrade}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-4xl font-bold">$5</div>
              <div className="text-sm text-muted-foreground">{t.perMonth}</div>
            </div>
            <Badge>{profile?.pro ? t.proActive : t.freePlan}</Badge>
            <Button className="w-full" onClick={() => void subscribe()} disabled={loading || profile?.pro}>
              <Gem className="h-4 w-4" /> {profile?.pro ? t.alreadyPro : t.subscribeStripe}
            </Button>
            {profile?.pro ? (
              <Button className="w-full" variant="outline" onClick={() => void manageSubscription()}>
                {t.cancelPro}
              </Button>
            ) : null}
            {!user ? (
              <Button className="w-full" variant="outline" asChild>
                <Link href="/login">{t.loginFirst}</Link>
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
