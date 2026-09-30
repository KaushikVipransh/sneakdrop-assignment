import { z } from "zod";

/** Wire format of a provider webhook. */
export const paymentEventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(["payment.succeeded", "payment.failed"]),
  created_at: z.iso.datetime(),
  data: z.object({
    intent_id: z.string().min(1),
    hold_id: z.string().min(1),
    amount: z.number().int().nonnegative(),
  }),
});
