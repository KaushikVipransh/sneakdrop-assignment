import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type SquareState = "sold" | "sold-mine" | "held" | "held-mine" | "available";

type Counts = {
  total: number;
  sold: number;
  held: number;
  available: number;
  /** The user holds one of the held pairs. */
  mineHeld: boolean;
  /** How many of the sold pairs are the user's. */
  mineSold: number;
};

/** Sold from the left, then held, then available, so the grid reads like a progress bar. */
export function squareStates(c: Counts): SquareState[] {
  const states: SquareState[] = [];
  for (let i = 0; i < c.sold; i++) states.push(i < c.mineSold ? "sold-mine" : "sold");
  for (let i = 0; i < c.held; i++) states.push(i === 0 && c.mineHeld ? "held-mine" : "held");
  while (states.length < c.total) states.push("available");
  return states.slice(0, c.total);
}

const STYLE: Record<SquareState, string> = {
  available: "border border-border bg-surface-muted",
  held: "hatch",
  "held-mine": "bg-accent animate-own",
  sold: "bg-text",
  "sold-mine": "bg-text",
};

/**
 * One square per pair (DESIGN.md §3.2). Visual only: screen readers get the
 * same numbers as a sentence.
 */
export function StockGrid({
  size = "lg",
  className,
  ...counts
}: Counts & { size?: "lg" | "sm"; className?: string }) {
  const states = squareStates(counts);
  const style = {
    "--cols-sm": Math.ceil(counts.total / 2),
    "--cols": counts.total,
  } as CSSProperties;

  return (
    <div className={className}>
      <div
        aria-hidden="true"
        style={style}
        className={cn(
          "grid grid-cols-[repeat(var(--cols-sm),minmax(0,1fr))] sm:grid-cols-[repeat(var(--cols),minmax(0,1fr))]",
          size === "lg" ? "gap-1.5" : "gap-1",
        )}
      >
        {states.map((state, i) => (
          <span
            key={`${i}-${state}`}
            data-state={state}
            className={cn(
              "relative aspect-square rounded-[4px] transition-colors duration-[600ms] ease-[var(--ease)]",
              STYLE[state],
            )}
          >
            {state === "sold-mine" ? (
              <span className="absolute top-1/2 left-1/2 size-1.5 -translate-1/2 rounded-full bg-accent" />
            ) : null}
          </span>
        ))}
      </div>
      <p className="sr-only">
        {counts.sold} sold, {counts.held} held, {counts.available} available of {counts.total}{" "}
        pairs.
      </p>
    </div>
  );
}

/** Legend under the grid: same symbols, with counts. */
export function StockLegend({
  sold,
  held,
  available,
}: Pick<Counts, "sold" | "held" | "available">) {
  const item = (swatch: string, label: string, n: number) => (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={cn("size-3 rounded-[3px]", swatch)} />
      <span className="text-text-muted">
        {label} <span className="num text-text">{n}</span>
      </span>
    </span>
  );
  return (
    <p className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
      {item("bg-text", "sold", sold)}
      {item("hatch", "held", held)}
      {item("border border-border bg-surface-muted", "available", available)}
    </p>
  );
}
