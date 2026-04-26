"use client";

import { loadStripe } from "@stripe/stripe-js";

const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export async function startProCheckout(userId?: string, returnPath = "/pro") {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const response = await fetch(`${apiUrl}/api/stripe/create-checkout-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, returnPath })
  });
  const payload = (await response.json().catch(() => ({}))) as { sessionId?: string; url?: string; error?: string };
  if (!response.ok) throw new Error(payload.error || "Could not create Stripe checkout session");
  const { sessionId, url } = payload;

  if (url) {
    window.location.href = url;
    return;
  }

  if (!key || !sessionId) throw new Error("Stripe is not configured");
  const stripe = await loadStripe(key);
  await stripe?.redirectToCheckout({ sessionId });
}

export async function startPieceStyleCheckout(pieceStyle: "alpha" | "merida", userId?: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const response = await fetch(`${apiUrl}/api/stripe/create-piece-style-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, pieceStyle })
  });
  const payload = (await response.json().catch(() => ({}))) as { sessionId?: string; url?: string; error?: string };
  if (!response.ok) throw new Error(payload.error || "Could not create piece style checkout session");
  if (payload.url) {
    window.location.href = payload.url;
    return;
  }

  if (!key || !payload.sessionId) throw new Error("Stripe is not configured");
  const stripe = await loadStripe(key);
  await stripe?.redirectToCheckout({ sessionId: payload.sessionId });
}

export async function getCheckoutSession(sessionId: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const response = await fetch(`${apiUrl}/api/stripe/checkout-session/${sessionId}`);
  const payload = (await response.json().catch(() => ({}))) as {
    customerId?: string;
    subscriptionId?: string;
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error || "Could not retrieve checkout session");
  return payload;
}

export async function startBillingPortal(customerId: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const response = await fetch(`${apiUrl}/api/stripe/create-portal-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId })
  });
  const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!response.ok || !payload.url) throw new Error(payload.error || "Could not open billing portal");
  window.location.href = payload.url;
}
