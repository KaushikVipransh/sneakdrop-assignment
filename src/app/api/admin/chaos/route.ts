import { chaosSettingsSchema } from "@/lib/admin-state";
import { db } from "@/server/db/client";
import { fakepaySettings } from "@/server/db/schema";
import { handleAdmin } from "@/server/http/admin-handler";
import { jsonError } from "@/server/http/json";
import { log } from "@/server/log";

/** Updates the fake provider's chaos knobs. Applies to payments started from now on. */
export function PUT(request: Request) {
  return handleAdmin(request, async (user) => {
    const parsed = chaosSettingsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(
        400,
        "INVALID_SETTINGS",
        parsed.error.issues[0]?.message ?? "Invalid settings",
      );
    }
    const values = { ...parsed.data, updatedAt: new Date() };
    await db
      .insert(fakepaySettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: fakepaySettings.id, set: values });
    log.info("admin.chaos_updated", { by: user.email, ...parsed.data });
    return Response.json({ code: "UPDATED", message: "Chaos settings saved.", chaos: parsed.data });
  });
}
