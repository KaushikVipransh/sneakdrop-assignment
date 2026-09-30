import { eq } from "drizzle-orm";
import type { Tx } from "../db/client";
import { drops, type Drop } from "../db/schema";
import { DropNotFound } from "./errors";

/**
 * Takes the drop row lock (`SELECT … FOR UPDATE`). Every mutation of holds,
 * orders, or the waitlist for this drop runs after this call, so they are
 * serialised: two transactions can never both see the same free pair.
 */
export async function lockDrop(tx: Tx, dropId: string): Promise<Drop> {
  const [drop] = await tx.select().from(drops).where(eq(drops.id, dropId)).for("update");
  if (!drop) throw new DropNotFound(dropId);
  return drop;
}
