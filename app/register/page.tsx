"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { firebaseEnabled, registerEmail, signInGoogle, useFirebaseUser } from "@/lib/firebase";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading } = useFirebaseUser();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!loading && user) router.replace("/profile");
  }, [loading, router, user]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      await registerEmail(email, password);
      setMessage(t.registerSuccess);
      router.replace("/profile");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.registerFailed);
    }
  }

  async function googleRegister() {
    setMessage(t.openingGoogle);
    try {
      await signInGoogle();
      setMessage(t.registerSuccess);
      router.replace("/profile");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.googleRegisterFailed);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t.register}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t.createAccountBody}</p>
          <form className="space-y-3" onSubmit={submit}>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t.email}
              required
            />
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t.password}
              minLength={6}
              required
            />
            <Button className="w-full" type="submit" disabled={!firebaseEnabled}>
              <UserPlus className="h-4 w-4" /> {t.createAccount}
            </Button>
          </form>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => void googleRegister()}
            disabled={!firebaseEnabled}
          >
            {t.registerGoogle}
          </Button>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <Button className="w-full" variant="outline" asChild>
            <Link href="/login">{t.alreadyAccount}</Link>
          </Button>
          <Button className="w-full" variant="ghost" asChild>
            <Link href="/">{t.backHome}</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
