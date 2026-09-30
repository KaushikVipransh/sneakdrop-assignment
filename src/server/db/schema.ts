import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** One sale event. Its row is the lock every mutation serialises on. */
export const drops = pgTable(
  "drops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    totalStock: integer("total_stock").notNull(),
    holdSeconds: integer("hold_seconds").notNull().default(300),
    maxPerUser: integer("max_per_user").notNull().default(2),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("drops_total_stock_positive", sql`${t.totalStock} > 0`),
    check("drops_hold_seconds_positive", sql`${t.holdSeconds} > 0`),
    check("drops_max_per_user_positive", sql`${t.maxPerUser} > 0`),
  ],
);

export type Drop = typeof drops.$inferSelect;

export const holdStatus = pgEnum("hold_status", ["ACTIVE", "CONVERTED", "EXPIRED", "RELEASED"]);
export const holdSource = pgEnum("hold_source", ["buy", "waitlist"]);

/** A reservation of exactly one pair for one user. */
export const holds = pgTable(
  "holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dropId: uuid("drop_id")
      .notNull()
      .references(() => drops.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    status: holdStatus("status").notNull().default("ACTIVE"),
    source: holdSource("source").notNull().default("buy"),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    // Safety net behind the application check: one ACTIVE hold per user per drop.
    uniqueIndex("holds_one_active_per_user")
      .on(t.dropId, t.userId)
      .where(sql`${t.status} = 'ACTIVE'`),
    index("holds_drop_status_expires").on(t.dropId, t.status, t.expiresAt),
    index("holds_drop_user").on(t.dropId, t.userId),
  ],
);

export type Hold = typeof holds.$inferSelect;
export type HoldStatus = Hold["status"];

/** A confirmed purchase. Exactly one per converted hold. */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dropId: uuid("drop_id")
      .notNull()
      .references(() => drops.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    holdId: uuid("hold_id")
      .notNull()
      .references(() => holds.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("orders_hold_unique").on(t.holdId),
    index("orders_drop_user").on(t.dropId, t.userId),
  ],
);

export type Order = typeof orders.$inferSelect;
