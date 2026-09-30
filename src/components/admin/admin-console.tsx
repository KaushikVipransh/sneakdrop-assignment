"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, type ReactNode } from "react";
import { useNow } from "@/hooks/use-now";
import { adminStateSchema, type AdminState } from "@/lib/admin-state";
import { cn } from "@/lib/utils";
import { formatRemaining } from "../countdown";
import { SiteHeader } from "../site-header";
import { Stat } from "../stats-strip";
import { StockGrid } from "../stock-grid";
import { ChaosControls } from "./chaos-controls";

export const ADMIN_STATE_KEY = ["admin-state"] as const;

async function fetchAdminState(): Promise<{ state: AdminState; offset: number }> {
  const sentAt = Date.now();
  const response = await fetch("/api/admin/state", { cache: "no-store" });
  if (!response.ok) throw new Error(`Admin state failed (${response.status})`);
  const state = adminStateSchema.parse(await response.json());
  return { state, offset: Date.parse(state.serverTime) - (sentAt + Date.now()) / 2 };
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
const shortId = (id: string) => id.slice(0, 8);

const OUTCOME_TONE: Record<string, string> = {
  order_created: "text-success",
  late_refunded: "text-danger",
  payment_failed: "text-danger",
};
const OUTCOME_LABEL: Record<string, string> = {
  order_created: "order created",
  late_refunded: "late — refunded",
  payment_failed: "payment failed — hold released",
  ignored_out_of_order: "out of order — ignored",
  ignored_already_final: "already final — ignored",
  duplicate: "duplicate — ignored",
};

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn("rounded-[var(--radius-card)] border border-border bg-surface p-5", className)}
    >
      <h2 className="label mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="num w-full text-left text-[13px]">
        <thead>
          <tr className="text-text-muted">
            {head.map((h) => (
              <th key={h} scope="col" className="pr-4 pb-2 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-t border-border">
              {cells.map((c, j) => (
                <td key={j} className="py-1.5 pr-4 whitespace-nowrap">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Operator console (DESIGN.md §4), polling every 1.5 s. */
export function AdminConsole({ email }: { email: string }) {
  const { data, error } = useQuery({
    queryKey: ADMIN_STATE_KEY,
    queryFn: fetchAdminState,
    refetchInterval: 1500,
  });
  const offset = data?.offset ?? 0;
  const clock = useCallback(() => Date.now() + offset, [offset]);
  const now = useNow(clock);
  const state = data?.state;
  const drop = state?.drop;

  return (
    <>
      <SiteHeader
        wide
        title="SNEAKER DROP / ADMIN"
        phase={drop && drop.sold >= drop.total ? "ended" : "live"}
        startsAt={new Date()}
        account={<span className="hidden text-sm text-text-muted sm:inline">{email}</span>}
      />
      <main className="mx-auto w-full max-w-[1120px] space-y-6 px-4 py-8 sm:px-8">
        {error ? <p className="text-danger">Couldn&apos;t load admin state — retrying.</p> : null}
        {!state ? (
          <p className="label">Loading…</p>
        ) : !drop ? (
          <p>No drop yet. Run pnpm db:seed or use Reset below.</p>
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-4 sm:grid-cols-6">
              <Stat label="Total" value={drop.total} />
              <Stat label="Sold" value={drop.sold} />
              <Stat label="Held" value={drop.held} />
              <Stat label="Available" value={drop.available} />
              <Stat label="Waiting" value={drop.waitlistLength} />
              <Stat label="Refunds" value={drop.refunds} />
            </dl>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <StockGrid
                size="sm"
                className="sm:w-[420px]"
                total={drop.total}
                sold={drop.sold}
                held={drop.held}
                available={drop.available}
                mineHeld={false}
                mineSold={0}
              />
              <p
                role="status"
                data-testid="invariant"
                className={cn(
                  "num rounded-[var(--radius-control)] px-3 py-2 text-sm",
                  drop.invariant.ok
                    ? "border border-success text-success"
                    : "bg-danger font-semibold text-surface",
                )}
              >
                {drop.invariant.ok
                  ? `invariant: ${drop.invariant.message} ✓`
                  : `VIOLATION: ${drop.invariant.message}`}
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title={`Active holds (${state.activeHolds.length})`}>
                <Table
                  head={["user", "source", "expires in", "payment"]}
                  empty="No active holds."
                  rows={state.activeHolds.map((h) => [
                    shortId(h.userId),
                    h.source,
                    formatRemaining(Date.parse(h.expiresAt) - now),
                    h.payment ?? "—",
                  ])}
                />
              </Panel>
              <Panel title="Waitlist (first 20)">
                <Table
                  head={["#", "user", "joined"]}
                  empty="Nobody waiting."
                  rows={state.waitlist.map((w) => [
                    w.position,
                    shortId(w.userId),
                    time(w.joinedAt),
                  ])}
                />
              </Panel>
            </div>

            <Panel title="Webhook events (last 50)">
              <Table
                head={["time", "event_id", "type", "outcome"]}
                empty="No webhooks yet."
                rows={state.webhooks.map((w) => [
                  time(w.at),
                  w.eventId.slice(0, 14),
                  w.type ?? "",
                  <span key="o" className={OUTCOME_TONE[w.outcome] ?? "text-text-muted"}>
                    {OUTCOME_LABEL[w.outcome] ?? w.outcome}
                  </span>,
                ])}
              />
              <p className="mt-3 text-[13px] text-text-muted">
                Outbox: {state.deliveries.pending} pending · {state.deliveries.delivered} delivered
                · {state.deliveries.dead} dead
              </p>
            </Panel>
          </>
        )}

        {state ? <ChaosControls chaos={state.chaos} /> : null}
      </main>
    </>
  );
}
