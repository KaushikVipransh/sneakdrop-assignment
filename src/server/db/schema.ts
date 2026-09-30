import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
