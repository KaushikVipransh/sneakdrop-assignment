import { sql } from "drizzle-orm";
import { withTx, type Tx } from "../db/client";
import type { Drop } from "../db/schema";
import { lockDrop } from "./lock";
import { reconcile, type ReconcileResult } from "./reconcile";

export type DropContext = {
  tx: Tx;
  drop: Drop;
  now: Date;
  reconciled: ReconcileResult;
};

export type ClockOptions = {
  /** Overrides the clock. Tests use it to move time; production uses the DB clock. */
  now?: Date;
};

/**
 * The one way to change drop state: open a transaction, take the drop lock,
 * read the clock, bring holds and the waitlist up to date, then run `fn`.
 */
export function inDropTx<T>(
  dropId: string,
  options: ClockOptions,
  fn: (ctx: DropContext) => Promise<T>,
): Promise<T> {
  return withTx(async (tx) => {
    const drop = await lockDrop(tx, dropId);
    // Read the clock after the lock is granted, and from the database, so every
    // server instance agrees on when a hold expires.
    const now = options.now ?? (await dbNow(tx));
    const reconciled = await reconcile(tx, drop, now);
    return fn({ tx, drop, now, reconciled });
  });
}

async function dbNow(tx: Tx): Promise<Date> {
  const { rows } = await tx.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`);
  return new Date(rows[0]!.now);
}
