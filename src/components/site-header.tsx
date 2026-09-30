import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LiveDot, type DropPhase } from "./live-dot";

export function phaseLabel(phase: DropPhase, startsAt: Date): string {
  if (phase === "live") return "LIVE";
  if (phase === "ended") return "ENDED";
  const hhmm = startsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `OPENS ${hhmm}`;
}

/** 64px header: wordmark left, live status and account right (DESIGN.md §3.4). */
export function SiteHeader({
  phase,
  startsAt,
  title = "SNEAKER DROP",
  account,
  wide = false,
}: {
  phase: DropPhase;
  startsAt: Date;
  title?: string;
  account?: ReactNode;
  wide?: boolean;
}) {
  return (
    <header className="border-b border-border">
      <div
        className={cn(
          "mx-auto flex h-16 items-center justify-between gap-4 px-4 sm:px-8",
          wide ? "max-w-[1120px]" : "max-w-[720px]",
        )}
      >
        <span className="text-sm font-semibold tracking-[0.08em] uppercase">{title}</span>
        <div className="flex items-center gap-3">
          <span className="label inline-flex items-center gap-2 text-text">
            <LiveDot phase={phase} />
            <span data-testid="phase">{phaseLabel(phase, startsAt)}</span>
          </span>
          {account}
        </div>
      </div>
    </header>
  );
}
