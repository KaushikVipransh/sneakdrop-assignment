import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type DbGlobal = { pool?: Pool; db?: Db };
// Reuse one pool across dev hot reloads and across invocations of a warm function.
const cache = globalThis as unknown as { __sneakdrop?: DbGlobal };
cache.__sneakdrop ??= {};

export const pool: Pool = (cache.__sneakdrop.pool ??= new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
}));

export const db: Db = (cache.__sneakdrop.db ??= drizzle(pool, { schema }));

/**
 * Runs `fn` in one READ COMMITTED transaction. All drop mutations serialise on
 * the drop row lock taken inside `fn`, so a stronger isolation level is not needed.
 */
export function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}
