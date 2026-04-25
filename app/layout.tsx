import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChessLift",
  description: "AI chess training, multiplayer, leaderboards, and Pro upgrades."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
