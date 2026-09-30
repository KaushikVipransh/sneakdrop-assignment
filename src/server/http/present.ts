import type { Hold, PaymentIntent } from "../db/schema";

export const presentHold = (h: Hold) => ({
  id: h.id,
  status: h.status,
  source: h.source,
  createdAt: h.createdAt.toISOString(),
  expiresAt: h.expiresAt.toISOString(),
});

export const presentIntent = (i: PaymentIntent) => ({
  id: i.id,
  status: i.status,
  amount: i.amount,
});
