"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Home, LogIn, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutUser, useFirebaseUser } from "@/lib/firebase";
import { useI18n } from "@/lib/i18n";

export function AppNavbar() {
  const { user, loading } = useFirebaseUser();
  const { t } = useI18n();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <nav className="sticky top-0 z-40 border-b bg-card/88 backdrop-blur supports-[backdrop-filter]:bg-card/74 animate-nav-drop">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
        <Link className="group flex items-center gap-2 font-bold tracking-normal" href="/">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground transition-transform duration-200 group-hover:-translate-y-0.5">
            <Home className="h-4 w-4" />
          </span>
          <span>{t.appName}</span>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            title="Toggle theme"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/pro">
              <Crown className="h-4 w-4" /> {t.pro}
            </Link>
          </Button>
          {user ? (
            <>
              <Button variant="outline" asChild>
                <Link href="/profile">
                  <UserRound className="h-4 w-4" /> {t.profile}
                </Link>
              </Button>
              <Button variant="outline" onClick={() => void signOutUser()}>
                <LogOut className="h-4 w-4" /> {t.signOut}
              </Button>
            </>
          ) : (
            <Button variant="outline" asChild aria-disabled={loading}>
              <Link href="/login">
                <LogIn className="h-4 w-4" /> {t.login}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
