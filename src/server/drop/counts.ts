import { sql } from "drizzle-orm";
import type { Tx } from "../db/client";

export type DropCounts = {
  total: number;
  sold: number;
  held: number;
  available: number;
};

/**
 * Stock is never stored; it is always `total − orders − active holds`,
 * computed from rows. Call under the drop lock for a consistent answer.
 */
export async function getCounts(tx: Tx, dropId: string): Promise<DropCounts> {
  const { rows } = await tx.execute<{ total: number; sold: number; held: number }>(sql`
    select
      d.total_stock as total,
      (select count(*)::int from orders o where o.drop_id = d.id) as sold,
      (select count(*)::int from holds h where h.drop_id = d.id and h.status = 'ACTIVE') as held
    from drops d
    where d.id = ${dropId}
  `);
  const row = rows[0];
  if (!row) return { total: 0, sold: 0, held: 0, available: 0 };
  return { ...row, available: row.total - row.sold - row.held };
}
