import { z } from "zod";

/** Shape of GET /api/admin/state, shared by the route and the admin page. */
export const adminStateSchema = z.object({
  serverTime: z.iso.datetime(),
  drop: z
    .object({
      id: z.string(),
      name: z.string(),
      total: z.number().int(),
      sold: z.number().int(),
      held: z.number().int(),
      available: z.number().int(),
      waitlistLength: z.number().int(),
      refunds: z.number().int(),
      invariant: z.object({ ok: z.boolean(), message: z.string() }),
    })
    .nullable(),
  activeHolds: z.array(
    z.object({
      id: z.string(),
      userId: z.string(),
      source: z.enum(["buy", "waitlist"]),
      expiresAt: z.iso.datetime(),
      payment: z.string().nullable(),
    }),
  ),
  waitlist: z.array(
    z.object({ position: z.number().int(), userId: z.string(), joinedAt: z.iso.datetime() }),
  ),
  webhooks: z.array(
    z.object({
      at: z.iso.datetime(),
      eventId: z.string(),
      type: z.string().nullable(),
      outcome: z.string(),
    }),
  ),
  deliveries: z.object({
    pending: z.number().int(),
    delivered: z.number().int(),
    dead: z.number().int(),
  }),
  chaos: z.object({
    minDelayMs: z.number().int(),
    maxDelayMs: z.number().int(),
    duplicateRate: z.number(),
    reorderRate: z.number(),
    failRate: z.number(),
  }),
});

export type AdminState = z.infer<typeof adminStateSchema>;

export const chaosSettingsSchema = z
  .object({
    minDelayMs: z.number().int().min(0).max(3_600_000),
    maxDelayMs: z.number().int().min(0).max(3_600_000),
    duplicateRate: z.number().min(0).max(1),
    reorderRate: z.number().min(0).max(1),
    failRate: z.number().min(0).max(1),
  })
  .refine((s) => s.minDelayMs <= s.maxDelayMs, {
    message: "minDelayMs must not exceed maxDelayMs",
    path: ["maxDelayMs"],
  });

export type ChaosSettings = z.infer<typeof chaosSettingsSchema>;
