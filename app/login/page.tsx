"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { firebaseEnabled, signInEmail, signInGoogle, useFirebaseUser } from "@/lib/firebase";
import { useEffect } from "react";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useFirebaseUser();
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
      await signInEmail(email, password);
      setMessage("Logged in successfully.");
      router.replace("/profile");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed.");
    }
  }

  async function googleLogin() {
    setMessage("Opening Google sign-in...");
    try {
      await signInGoogle();
      setMessage("Logged in successfully.");
      router.replace("/profile");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google login failed.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Login</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form className="space-y-3" onSubmit={submit}>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              required
            />
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              required
            />
            <Button className="w-full" type="submit" disabled={!firebaseEnabled}>
              <LogIn className="h-4 w-4" /> Login
            </Button>
          </form>
          <Button
            className="w-full"
            onClick={() => void googleLogin()}
            disabled={!firebaseEnabled}
          >
            <LogIn className="h-4 w-4" /> Continue with Google
          </Button>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <Button className="w-full" variant="outline" asChild>
            <Link href="/register">Create account</Link>
          </Button>
          <Button className="w-full" variant="ghost" asChild>
            <Link href="/">Back to home</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
