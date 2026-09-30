import { startPayment } from "@/server/drop/payments";
import { dispatchDue } from "@/server/fakepay/dispatcher";
import { afterResponse } from "@/server/http/after-response";
import { handleUserAction } from "@/server/http/handler";
import { payResult } from "@/server/http/results";

/** Pay for a held pair with the fake provider. */
export async function POST(request: Request, ctx: RouteContext<"/api/holds/[id]/pay">) {
  const { id } = await ctx.params;
  return handleUserAction(request, async ({ user }) => {
    const result = await startPayment(user.id, id);
    // With no chaos delay the webhook is due now; send it after the response.
    if (result.code === "STARTED") afterResponse("fakepay.dispatch", () => dispatchDue());
    return payResult(result);
  });
}
