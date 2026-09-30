import type { Hold } from "../db/schema";
import { holds } from "../db/schema";
import { audit } from "./audit";
import { getCounts } from "./counts";
import { inDropTx, type ClockOptions } from "./tx";
import { getUserStanding } from "./user";

export type CreateHoldResult =
  | { code: "HOLD_CREATED"; hold: Hold }
  | { code: "ALREADY_HOLDING"; hold: Hold }
  | { code: "LIMIT_REACHED"; purchased: number; limit: number }
  | { code: "SOLD_OUT"; canJoinWaitlist: boolean }
  | { code: "NOT_STARTED"; startsAt: Date };

/** Reserves one pair for the user, if the rules allow it. */
export function createHold(
  userId: string,
  dropId: string,
  options: ClockOptions = {},
): Promise<CreateHoldResult> {
  return inDropTx(dropId, options, async ({ tx, drop, now }) => {
    if (now < drop.startsAt) return { code: "NOT_STARTED", startsAt: drop.startsAt };

    const standing = await getUserStanding(tx, drop.id, userId);
    if (standing.activeHold) return { code: "ALREADY_HOLDING", hold: standing.activeHold };
    // The limit counts orders plus active holds; the active hold is 0 here.
    if (standing.purchased >= drop.maxPerUser) {
      return { code: "LIMIT_REACHED", purchased: standing.purchased, limit: drop.maxPerUser };
    }

    const counts = await getCounts(tx, drop.id);
    if (counts.available < 1) return { code: "SOLD_OUT", canJoinWaitlist: true };

    const [hold] = await tx
      .insert(holds)
      .values({
        dropId: drop.id,
        userId,
        source: "buy",
        createdAt: now,
        expiresAt: new Date(now.getTime() + drop.holdSeconds * 1000),
      })
      .returning();
    await audit(tx, {
      entity: "hold",
      entityId: hold!.id,
      dropId: drop.id,
      userId,
      to: "ACTIVE",
      meta: { source: "buy" },
      at: now,
    });
    return { code: "HOLD_CREATED", hold: hold! };
  });
}
