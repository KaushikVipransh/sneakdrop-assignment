import { and, eq } from "drizzle-orm";
import { holds, paymentIntents, type HoldStatus, type PaymentIntent } from "../db/schema";
import { createIntent } from "../fakepay/provider";
import type { Rng } from "../fakepay/rng";
import { audit } from "./audit";
import { inDropTx, type ClockOptions } from "./tx";
import { findOwnedHoldDropId } from "./user";

export type StartPaymentResult =
  | { code: "STARTED"; intent: PaymentIntent }
  | { code: "ALREADY_PENDING"; intent: PaymentIntent }
  | { code: "NOT_FOUND" }
  | { code: "NOT_ACTIVE"; status: HoldStatus };

/** Hands an active hold to the fake provider for payment. Idempotent per hold. */
export async function startPayment(
  userId: string,
  holdId: string,
  options: ClockOptions & { rng?: Rng } = {},
): Promise<StartPaymentResult> {
  const dropId = await findOwnedHoldDropId(userId, holdId);
  if (!dropId) return { code: "NOT_FOUND" };

  return inDropTx(dropId, options, async ({ tx, drop, now }) => {
    // Reconcile has run, so a hold past its expiry is already EXPIRED here.
    const [hold] = await tx.select().from(holds).where(eq(holds.id, holdId));
    if (!hold) return { code: "NOT_FOUND" };
    if (hold.status !== "ACTIVE") return { code: "NOT_ACTIVE", status: hold.status };

    const [pending] = await tx
      .select()
      .from(paymentIntents)
      .where(and(eq(paymentIntents.holdId, holdId), eq(paymentIntents.status, "PENDING")));
    if (pending) return { code: "ALREADY_PENDING", intent: pending };

    const { intent } = await createIntent(tx, hold, { now, rng: options.rng });
    await audit(tx, {
      entity: "payment",
      entityId: intent.id,
      dropId: drop.id,
      userId,
      to: "PENDING",
      meta: { holdId },
      at: now,
    });
    return { code: "STARTED", intent };
  });
}
