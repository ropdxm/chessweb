import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import http from "http";
import Stripe from "stripe";
import { WebSocket, WebSocketServer } from "ws";
import { Chess } from "chess.js";

dotenv.config({ path: ".env.local" });
dotenv.config();

type Client = WebSocket & { roomId?: string; color?: "w" | "b" };

type Room = {
  id: string;
  game: Chess;
  players: Partial<Record<"w" | "b", Client>>;
  moves: string[];
};

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const rooms = new Map<string, Room>();
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:3001"
  })
);

app.get("/health", (_request, response) => {
  response.json({ ok: true, rooms: rooms.size });
});

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (request, response) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    response.status(501).send("Stripe webhook is not configured");
    return;
  }

  const signature = request.headers["stripe-signature"];
  if (!signature) {
    response.status(400).send("Missing Stripe signature");
    return;
  }

  try {
    const event = stripe.webhooks.constructEvent(request.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log(`Pro checkout completed for user ${session.client_reference_id || "unknown"}`);
    }
    response.json({ received: true });
  } catch (error) {
    response.status(400).send(error instanceof Error ? error.message : "Webhook error");
  }
});

app.use(express.json());

app.post("/api/stripe/create-checkout-session", async (request, response) => {
  try {
    if (!stripeSecret?.startsWith("sk_")) {
      response.status(501).json({ error: "STRIPE_SECRET_KEY must start with sk_test_ or sk_live_." });
      return;
    }
    if (!process.env.STRIPE_PRICE_ID?.startsWith("price_")) {
      response.status(501).json({ error: "STRIPE_PRICE_ID must start with price_." });
      return;
    }
    if (!stripe) {
      response.status(501).json({ error: "Stripe is not configured." });
      return;
    }

    const origin = process.env.CLIENT_ORIGIN || "http://localhost:3001";
    const returnPath = typeof request.body.returnPath === "string" ? request.body.returnPath : "/pro";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${origin}${returnPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${returnPath}?checkout=cancelled`,
      client_reference_id: request.body.userId
    });

    response.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe checkout failed";
    console.error("Stripe checkout failed:", message);
    response.status(500).json({ error: message });
  }
});

app.get("/api/stripe/checkout-session/:id", async (request, response) => {
  try {
    if (!stripeSecret?.startsWith("sk_") || !stripe) {
      response.status(501).json({ error: "Stripe is not configured." });
      return;
    }

    const session = await stripe.checkout.sessions.retrieve(request.params.id);
    response.json({
      id: session.id,
      customerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
      subscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not retrieve checkout session";
    response.status(500).json({ error: message });
  }
});

app.post("/api/stripe/create-piece-style-session", async (request, response) => {
  try {
    if (!stripeSecret?.startsWith("sk_")) {
      response.status(501).json({ error: "STRIPE_SECRET_KEY must start with sk_test_ or sk_live_." });
      return;
    }
    if (!stripe) {
      response.status(501).json({ error: "Stripe is not configured." });
      return;
    }

    const pieceStyle = request.body.pieceStyle === "merida" ? "merida" : "alpha";
    const styleName = pieceStyle === "merida" ? "Merida Pieces" : "Alpha Pieces";
    const origin = process.env.CLIENT_ORIGIN || "http://localhost:3001";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: 200,
            product_data: {
              name: `ChessLift ${styleName}`
            }
          },
          quantity: 1
        }
      ],
      success_url: `${origin}/profile?checkout=style-success&pieceStyle=${pieceStyle}`,
      cancel_url: `${origin}/profile?checkout=style-cancelled&pieceStyle=${pieceStyle}`,
      client_reference_id: request.body.userId,
      metadata: {
        pieceStyle
      }
    });

    response.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Piece style checkout failed";
    console.error("Piece style checkout failed:", message);
    response.status(500).json({ error: message });
  }
});

app.post("/api/stripe/create-portal-session", async (request, response) => {
  try {
    if (!stripeSecret?.startsWith("sk_") || !stripe) {
      response.status(501).json({ error: "Stripe is not configured." });
      return;
    }

    const customerId = request.body.customerId;
    if (!customerId || typeof customerId !== "string") {
      response.status(400).json({ error: "Missing Stripe customer id for this user." });
      return;
    }

    const origin = process.env.CLIENT_ORIGIN || "http://localhost:3001";
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/pro`
    });

    response.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create billing portal session";
    console.error("Billing portal failed:", message);
    response.status(500).json({ error: message });
  }
});

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function send(client: WebSocket, payload: unknown) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(payload));
  }
}

function broadcast(room: Room) {
  const result = classify(room.game);
  const payload = {
    type: "state",
    fen: room.game.fen(),
    pgn: room.game.pgn(),
    turn: room.game.turn(),
    result,
    moves: room.moves
  };
  Object.values(room.players).forEach((client) => client && send(client, payload));
}

function classify(game: Chess) {
  if (game.isCheckmate()) return game.turn() === "w" ? "Black won by checkmate" : "White won by checkmate";
  if (game.isStalemate()) return "Draw by stalemate";
  if (game.isThreefoldRepetition()) return "Draw by repetition";
  if (game.isInsufficientMaterial()) return "Draw by insufficient material";
  if (game.isDraw()) return "Draw";
  return undefined;
}

wss.on("connection", (socket: Client) => {
  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as {
        type: string;
        roomId?: string;
        from?: string;
        to?: string;
        promotion?: string;
      };

      if (message.type === "create-room") {
        const id = makeRoomId();
        const room: Room = { id, game: new Chess(), players: { w: socket }, moves: [] };
        socket.roomId = id;
        socket.color = "w";
        rooms.set(id, room);
        send(socket, { type: "room-created", roomId: id, fen: room.game.fen(), color: "w" });
        return;
      }

      if (message.type === "join-room") {
        const room = message.roomId ? rooms.get(message.roomId.toUpperCase()) : null;
        if (!room) {
          send(socket, { type: "error", message: "Room not found" });
          return;
        }
        const color = room.players.b ? "w" : "b";
        room.players[color] = socket;
        socket.roomId = room.id;
        socket.color = color;
        send(socket, { type: "joined", roomId: room.id, fen: room.game.fen(), color });
        broadcast(room);
        return;
      }

      if (message.type === "move") {
        const room = message.roomId ? rooms.get(message.roomId.toUpperCase()) : null;
        if (!room || !socket.color) {
          send(socket, { type: "error", message: "Join a room first" });
          return;
        }
        if (room.game.turn() !== socket.color) {
          send(socket, { type: "error", message: "It is not your turn" });
          return;
        }
        try {
          const move = room.game.move({
            from: message.from || "",
            to: message.to || "",
            promotion: message.promotion || "q"
          });
          room.moves.push(move.san);
          broadcast(room);
        } catch {
          send(socket, { type: "error", message: "Illegal move" });
        }
      }
    } catch {
      send(socket, { type: "error", message: "Malformed message" });
    }
  });

  socket.on("close", () => {
    const room = socket.roomId ? rooms.get(socket.roomId) : null;
    if (!room || !socket.color) return;
    delete room.players[socket.color];
    if (!room.players.w && !room.players.b) rooms.delete(room.id);
  });
});

const port = Number(process.env.PORT || 4000);
server.listen(port, () => {
  console.log(`ChessLift API and WebSocket server listening on ${port}`);
});
