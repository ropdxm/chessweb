"use client";

import { loadStripe } from "@stripe/stripe-js";

const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export async function startProCheckout(userId?: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const response = await fetch(`${apiUrl}/api/stripe/create-checkout-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId })
  });
  if (!response.ok) throw new Error("Could not create Stripe checkout session");
  const { sessionId, url } = (await response.json()) as { sessionId?: string; url?: string };

  if (url) {
    window.location.href = url;
    return;
  }

  if (!key || !sessionId) throw new Error("Stripe is not configured");
  const stripe = await loadStripe(key);
  await stripe?.redirectToCheckout({ sessionId });
}
