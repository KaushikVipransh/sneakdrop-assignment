import { after } from "next/server";
import { log } from "../log";

/**
 * Runs background work after the response is sent (Next.js `after`). Outside a
 * request scope, such as in tests, the work is skipped: it is only ever an
 * optimisation, since the cron endpoint does the same work every minute.
 */
export function afterResponse(name: string, work: () => Promise<unknown>): void {
  try {
    after(() =>
      work().catch((error: unknown) =>
        log.error(`${name}.failed`, {
          error: error instanceof Error ? error.message : String(error),
        }),
      ),
    );
  } catch {
    // Not in a request scope.
  }
}
