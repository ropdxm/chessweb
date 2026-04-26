import type { Metadata } from "next";
import { AppNavbar } from "@/components/app-navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChessLift",
  description: "AI chess training, multiplayer, leaderboards, and Pro upgrades."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppNavbar />
        <div className="page-enter">{children}</div>
      </body>
    </html>
  );
}
