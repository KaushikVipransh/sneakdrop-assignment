import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { holds, orders, paymentIntents, webhookEvents } from "../db/schema";
import type { PaymentEventPayload } from "../fakepay/provider";
import { audit } from "./audit";
import { isUuid } from "./ids";
import { promoteWaiters } from "./reconcile";
import { inDropTx, type ClockOptions } from "./tx";

export type WebhookOutcome =
  | "order_created"
  | "late_refunded"
  | "payment_failed"
  | "ignored_out_of_order"
  | "ignored_already_final";

export type ApplyPaymentEventResult =
  | { code: "PROCESSED"; outcome: WebhookOutcome }
  | { code: "DUPLICATE" }
  | { code: "UNKNOWN_INTENT" };

/**
 * Applies one provider event exactly once in effect, whatever order or number
 * of times events arrive. Everything happens under the drop lock:
 * - the event id is recorded; a second copy is a no-op;
 * - reconcile runs first, so a hold past its 5 minutes is already EXPIRED;
 * - only an in-time success for an ACTIVE hold creates an order;
 * - a success that cannot become an order is refunded;
 * - a failure after success is ignored.
 */
export async function applyPaymentEvent(
  event: PaymentEventPayload,
  options: ClockOptions = {},
): Promise<ApplyPaymentEventResult> {
  const intentId = event.data.intent_id;
  if (!isUuid(intentId)) return { code: "UNKNOWN_INTENT" };
  const [found] = await db
    .select({ dropId: paymentIntents.dropId })
    .from(paymentIntents)
    .where(eq(paymentIntents.id, intentId));
  // Not recorded, so the provider's retry can succeed once the intent exists.
  if (!found) return { code: "UNKNOWN_INTENT" };

  return inDropTx(found.dropId, options, async ({ tx, drop, now }) => {
    const [seen] = await tx
      .select({ eventId: webhookEvents.eventId })
      .from(webhookEvents)
      .where(eq(webhookEvents.eventId, event.id));
    if (seen) return { code: "DUPLICATE" };

    const [intent] = await tx
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.id, intentId))
      .for("update");
    if (!intent) return { code: "UNKNOWN_INTENT" };
    const [hold] = await tx.select().from(holds).where(eq(holds.id, intent.holdId));
    if (!hold) return { code: "UNKNOWN_INTENT" };

    const setIntent = async (status: typeof intent.status) => {
      await tx
        .update(paymentIntents)
        .set({ status, updatedAt: now })
        .where(eq(paymentIntents.id, intent.id));
      await audit(tx, {
        entity: "payment",
        entityId: intent.id,
        dropId: drop.id,
        userId: intent.userId,
        from: intent.status,
        to: status,
        meta: { eventId: event.id, type: event.type },
        at: now,
      });
    };

    let outcome: WebhookOutcome;
    if (event.type === "payment.succeeded") {
      if (intent.status === "SUCCEEDED") {
        outcome = "ignored_already_final";
      } else if (intent.status === "PENDING" && hold.status === "ACTIVE") {
        await tx
          .update(holds)
          .set({ status: "CONVERTED", endedAt: now })
          .where(eq(holds.id, hold.id));
        const [order] = await tx
          .insert(orders)
          .values({ dropId: drop.id, userId: hold.userId, holdId: hold.id, createdAt: now })
          .returning();
        await setIntent("SUCCEEDED");
        await audit(tx, [
          {
            entity: "hold",
            entityId: hold.id,
            dropId: drop.id,
            userId: hold.userId,
            from: "ACTIVE",
            to: "CONVERTED",
            at: now,
          },
          {
            entity: "order",
            entityId: order!.id,
            dropId: drop.id,
            userId: hold.userId,
            to: "CREATED",
            meta: { holdId: hold.id },
            at: now,
          },
        ]);
        outcome = "order_created";
      } else if (intent.status === "REFUNDED") {
        outcome = "ignored_already_final";
      } else {
        // The money arrived, but the hold is gone (expired, released, or the
        // payment already failed). The pair may belong to someone else now: refund.
        await setIntent("REFUNDED");
        outcome = "late_refunded";
      }
    } else {
      if (intent.status === "PENDING") {
        await setIntent("FAILED");
        if (hold.status === "ACTIVE") {
          await tx
            .update(holds)
            .set({ status: "RELEASED", endedAt: now })
            .where(eq(holds.id, hold.id));
          await audit(tx, {
            entity: "hold",
            entityId: hold.id,
            dropId: drop.id,
            userId: hold.userId,
            from: "ACTIVE",
            to: "RELEASED",
            meta: { reason: "payment_failed" },
            at: now,
          });
          await promoteWaiters(tx, drop, now);
        }
        outcome = "payment_failed";
      } else if (intent.status === "SUCCEEDED") {
        outcome = "ignored_out_of_order";
      } else {
        outcome = "ignored_already_final";
      }
    }

    await tx.insert(webhookEvents).values({
      eventId: event.id,
      type: event.type,
      intentId: intent.id,
      payload: event,
      receivedAt: now,
      outcome,
    });
    return { code: "PROCESSED", outcome };
  });
}
