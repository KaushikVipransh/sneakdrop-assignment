import { sql } from "drizzle-orm";
import {
  check,
  index,
  bigserial,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
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

export const waitlistStatus = pgEnum("waitlist_status", ["WAITING", "PROMOTED", "LEFT", "SKIPPED"]);

/** FIFO queue of users waiting for a pair to come back. */
export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    dropId: uuid("drop_id")
      .notNull()
      .references(() => drops.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    status: waitlistStatus("status").notNull().default("WAITING"),
    createdAt: createdAt(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** The hold created when this entry was promoted. */
    holdId: uuid("hold_id").references(() => holds.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("waitlist_one_waiting_per_user")
      .on(t.dropId, t.userId)
      .where(sql`${t.status} = 'WAITING'`),
    index("waitlist_drop_status_created").on(t.dropId, t.status, t.createdAt, t.id),
  ],
);

export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
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

/** Append-only record of every state transition, used for debugging and the receipt log. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    dropId: uuid("drop_id"),
    userId: text("user_id"),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_user_at").on(t.userId, t.at),
    index("audit_log_entity").on(t.entity, t.entityId),
  ],
);

export type AuditEntry = typeof auditLog.$inferSelect;

export const paymentStatus = pgEnum("payment_status", [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "REFUNDED",
]);

/** A fake payment attempt for one hold. */
export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    holdId: uuid("hold_id")
      .notNull()
      .references(() => holds.id, { onDelete: "cascade" }),
    dropId: uuid("drop_id")
      .notNull()
      .references(() => drops.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    status: paymentStatus("status").notNull().default("PENDING"),
    amount: integer("amount").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // At most one in-flight payment per hold.
    uniqueIndex("payment_intents_one_pending_per_hold")
      .on(t.holdId)
      .where(sql`${t.status} = 'PENDING'`),
    index("payment_intents_hold").on(t.holdId),
    index("payment_intents_drop_user").on(t.dropId, t.userId),
  ],
);

export type PaymentIntent = typeof paymentIntents.$inferSelect;
export type PaymentStatus = PaymentIntent["status"];

/** Every webhook event we accepted. The primary key makes processing idempotent. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    eventId: text("event_id").primaryKey(),
    type: text("type").notNull(),
    intentId: uuid("intent_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    outcome: text("outcome").notNull(),
  },
  (t) => [
    index("webhook_events_received").on(t.receivedAt),
    index("webhook_events_intent").on(t.intentId),
  ],
);

export type WebhookEvent = typeof webhookEvents.$inferSelect;

export const deliveryStatus = pgEnum("fakepay_delivery_status", ["PENDING", "DELIVERED", "DEAD"]);

/** Fake provider outbox: one row per scheduled webhook POST. */
export const fakepayDeliveries = pgTable(
  "fakepay_deliveries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    intentId: uuid("intent_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    deliverAt: timestamp("deliver_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    status: deliveryStatus("status").notNull().default("PENDING"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [
    index("fakepay_deliveries_due").on(t.status, t.deliverAt),
    index("fakepay_deliveries_intent").on(t.intentId),
  ],
);

export type FakepayDelivery = typeof fakepayDeliveries.$inferSelect;

/** Chaos knobs for the fake provider. A single row with id = 1. */
export const fakepaySettings = pgTable(
  "fakepay_settings",
  {
    id: integer("id").primaryKey().default(1),
    minDelayMs: integer("min_delay_ms").notNull().default(0),
    maxDelayMs: integer("max_delay_ms").notNull().default(0),
    duplicateRate: real("duplicate_rate").notNull().default(0),
    reorderRate: real("reorder_rate").notNull().default(0),
    failRate: real("fail_rate").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("fakepay_settings_singleton", sql`${t.id} = 1`),
    check(
      "fakepay_settings_delay_range",
      sql`0 <= ${t.minDelayMs} and ${t.minDelayMs} <= ${t.maxDelayMs}`,
    ),
    check(
      "fakepay_settings_rates",
      sql`${t.duplicateRate} between 0 and 1 and ${t.reorderRate} between 0 and 1 and ${t.failRate} between 0 and 1`,
    ),
  ],
);

export type FakepaySettings = typeof fakepaySettings.$inferSelect;
