import { sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { getCounts } from "./counts";
import { InvariantViolation } from "./errors";

/**
 * The guarantee the whole system exists for. Checked at the end of every
 * mutating transaction; a violation throws, which rolls the transaction back,
 * so an oversold state can never be committed.
 */
export async function assertInvariant(tx: Tx, dropId: string): Promise<void> {
  const c = await getCounts(tx, dropId);
  if (c.sold > c.total) {
    throw new InvariantViolation(`orders (${c.sold}) > total stock (${c.total})`);
  }
  if (c.sold + c.held > c.total) {
    throw new InvariantViolation(
      `orders + active holds (${c.sold} + ${c.held}) > total stock (${c.total})`,
    );
  }

  const { rows } = await tx.execute<{ user_id: string; n: number; max: number }>(sql`
    select u.user_id, count(*)::int as n, d.max_per_user as max
    from (
      select user_id from orders where drop_id = ${dropId}
      union all
      select user_id from holds where drop_id = ${dropId} and status = 'ACTIVE'
    ) u
    cross join (select max_per_user from drops where id = ${dropId}) d
    group by u.user_id, d.max_per_user
    having count(*) > d.max_per_user
    limit 1
  `);
  const over = rows[0];
  if (over) {
    throw new InvariantViolation(
      `per-user limit: user ${over.user_id} has ${over.n} pairs (orders + active holds) > ${over.max}`,
    );
  }
}
