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
