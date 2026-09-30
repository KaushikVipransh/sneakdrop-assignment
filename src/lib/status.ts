import { z } from "zod";

/** Shape of GET /api/drop/status, shared by the route and the page. */
export const holdStatusSchema = z.enum(["ACTIVE", "CONVERTED", "EXPIRED", "RELEASED"]);
export const paymentStatusSchema = z.enum(["PENDING", "SUCCEEDED", "FAILED", "REFUNDED"]);

export const statusHoldSchema = z.object({
  id: z.string(),
  status: holdStatusSchema,
  source: z.enum(["buy", "waitlist"]),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
});

export const receiptEventSchema = z.object({
  at: z.iso.datetime(),
  entity: z.string(),
  from: z.string().nullable(),
  to: z.string(),
});

export const dropStatusSchema = z.object({
  serverTime: z.iso.datetime(),
  drop: z.object({
    id: z.string(),
    name: z.string(),
    total: z.number().int(),
    available: z.number().int(),
    sold: z.number().int(),
    held: z.number().int(),
    waitlistLength: z.number().int(),
    startsAt: z.iso.datetime(),
    holdSeconds: z.number().int(),
    maxPerUser: z.number().int(),
  }),
  me: z
    .object({
      userId: z.string(),
      email: z.string().nullable(),
      isGuest: z.boolean(),
      /** The user's ACTIVE hold, if any. */
      hold: statusHoldSchema.nullable(),
      /** The user's most recent hold of any status (drives Expired / Purchased states). */
      latestHold: statusHoldSchema.nullable(),
      /** Payment for `latestHold`, if one was started. */
      payment: z.object({ id: z.string(), status: paymentStatusSchema }).nullable(),
      waitlistPosition: z.number().int().nullable(),
      purchased: z.number().int(),
      limit: z.number().int(),
      orders: z.array(z.object({ id: z.string(), createdAt: z.iso.datetime() })),
      events: z.array(receiptEventSchema),
    })
    .nullable(),
});

export type DropStatus = z.infer<typeof dropStatusSchema>;
export type StatusHold = z.infer<typeof statusHoldSchema>;
export type ReceiptEvent = z.infer<typeof receiptEventSchema>;
