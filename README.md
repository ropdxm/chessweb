# ChessLift

ChessLift is a modern chess training platform built for players who want fast games, AI feedback, and visible progress. It combines legal move validation, same-screen play, browser Stockfish, game history, Firebase identity, realtime multiplayer rooms, city leaderboards, and a Pro upgrade path.

## Stack

- Next.js + TypeScript
- shadcn-style UI components + Tailwind CSS
- Firebase Auth + Firestore
- Stockfish in the browser
- Express.js backend
- WebSockets for multiplayer rooms
- Stripe checkout for Pro

## Local Setup

1. Copy `.env.example` to `.env.local` and fill Firebase and Stripe values.
2. Install dependencies with `npm install`.
3. Run both apps with `npm run dev`.
4. Open `http://localhost:3000`.

## Product Value

ChessLift is aimed at ambitious casual players: people who play a quick game, immediately see what went wrong, and come back to improve their score, city rank, and personal history. The Pro path can unlock deeper AI analysis, custom boards, and premium piece skins.

## Piece Assets

Pro piece styles use freely licensed SVG assets from Wikimedia Commons:

- Cburnett chess pieces: available under licenses listed on each Wikimedia file page, including CC BY-SA 3.0 and BSD/GFDL/GPL options.
- Noto Sans Symbols2 chess glyph SVGs: SIL Open Font License 1.1.
- Alpha and Merida purchasable piece styles use Lichess open-source piece assets from the AGPL-licensed lila repository.
