/**
 * The fake payment provider. It behaves like an external service: it keeps its
 * own intents and an outbox of webhook deliveries, and it is deliberately messy
 * (late, duplicated, contradicting events) according to `fakepay_settings`.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Tx } from "../db/client";
import {
  fakepayDeliveries,
  fakepaySettings,
  paymentIntents,
  type FakepayDelivery,
  type FakepaySettings,
  type Hold,
  type PaymentIntent,
} from "../db/schema";
import type { Rng } from "./rng";

export const PRICE_CENTS = 18_000;

export type PaymentEventType = "payment.succeeded" | "payment.failed";

export type PaymentEventPayload = {
  id: string;
  type: PaymentEventType;
  created_at: string;
  data: { intent_id: string; hold_id: string; amount: number };
};

export type CreateIntentOptions = { now: Date; rng?: Rng };

const DEFAULT_SETTINGS: Omit<FakepaySettings, "updatedAt"> = {
  id: 1,
  minDelayMs: 0,
  maxDelayMs: 0,
  duplicateRate: 0,
  reorderRate: 0,
  failRate: 0,
};

export async function getSettings(tx: Tx): Promise<Omit<FakepaySettings, "updatedAt">> {
  const [row] = await tx.select().from(fakepaySettings).where(eq(fakepaySettings.id, 1));
  return row ?? DEFAULT_SETTINGS;
}

/**
 * Creates a PENDING intent for the hold and schedules its webhook deliveries.
 * Runs inside the caller's transaction, so the intent and its outbox rows
 * commit together with the app's own checks.
 */
export async function createIntent(
  tx: Tx,
  hold: Hold,
  { now, rng = Math.random }: CreateIntentOptions,
): Promise<{ intent: PaymentIntent; deliveries: FakepayDelivery[] }> {
  const settings = await getSettings(tx);
  const [intent] = await tx
    .insert(paymentIntents)
    .values({
      holdId: hold.id,
      dropId: hold.dropId,
      userId: hold.userId,
      amount: PRICE_CENTS,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const delay = () =>
    settings.minDelayMs + Math.round(rng() * (settings.maxDelayMs - settings.minDelayMs));
  const event = (type: PaymentEventType): PaymentEventPayload => ({
    id: `evt_${randomUUID().replaceAll("-", "")}`,
    type,
    created_at: now.toISOString(),
    data: { intent_id: intent!.id, hold_id: hold.id, amount: intent!.amount },
  });

  const outcome: PaymentEventType =
    rng() < settings.failRate ? "payment.failed" : "payment.succeeded";
  const events = [event(outcome)];
  // Out of order: a contradicting failure for a successful payment, on its own delay,
  // so it can land before or after the success.
  if (outcome === "payment.succeeded" && rng() < settings.reorderRate) {
    events.push(event("payment.failed"));
  }

  const rows: (typeof fakepayDeliveries.$inferInsert)[] = [];
  for (const payload of events) {
    // Duplicates: the same event id delivered 2–3 times, each with its own delay.
    const copies = rng() < settings.duplicateRate ? 2 + Math.floor(rng() * 2) : 1;
    for (let i = 0; i < copies; i++) {
      rows.push({
        eventId: payload.id,
        type: payload.type,
        intentId: intent!.id,
        payload,
        deliverAt: new Date(now.getTime() + delay()),
        createdAt: now,
      });
    }
  }
  const deliveries = await tx.insert(fakepayDeliveries).values(rows).returning();
  return { intent: intent!, deliveries };
}
