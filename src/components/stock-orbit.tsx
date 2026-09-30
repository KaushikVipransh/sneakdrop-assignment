import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { squareStates, type SquareState } from "./stock-grid";

type Props = {
  total: number;
  sold: number;
  held: number;
  available: number;
  mineHeld: boolean;
  mineSold: number;
  /** Small floating tag, e.g. "You · 04:12", placed next to the user's pair. */
  chip?: string | null;
  className?: string;
};

type Slot = { x: number; y: number; ring: "outer" | "inner" };

/** Pair positions: 60% on the outer ring, the rest on the inner ring, clockwise from the top. */
export function orbitSlots(total: number): Slot[] {
  const outerCount = Math.ceil(total * 0.6);
  const rings = [
    { ring: "outer" as const, count: outerCount, radius: 44, offset: 0 },
    { ring: "inner" as const, count: total - outerCount, radius: 29, offset: 0.5 },
  ];
  const slots: Slot[] = [];
  for (const { ring, count, radius, offset } of rings) {
    for (let i = 0; i < count; i++) {
      const angle = ((i + offset) / count) * 2 * Math.PI - Math.PI / 2;
      slots.push({ x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle), ring });
    }
  }
  return slots;
}

const STYLE: Record<SquareState, string> = {
  available: "border border-white/45 bg-white/10",
  held: "hatch shadow-[0_0_18px_rgb(185_153_245/0.55)]",
  "held-mine":
    "bg-accent shadow-[0_0_26px_rgb(255_106_43/0.85)] ring-2 ring-white/80 animate-own z-10",
  sold: "bg-ink ring-1 ring-white/25",
  "sold-mine": "bg-ink ring-2 ring-accent",
};

/**
 * Every pair as a tile on two orbit rings around the "pairs left" number.
 * Visual only; screen readers get the same numbers as a sentence.
 */
export function StockOrbit({ chip, className, ...counts }: Props) {
  const states = squareStates(counts);
  const slots = orbitSlots(counts.total);
  const mineIndex = states.findIndex((s) => s === "held-mine");
  const chipAt = mineIndex >= 0 ? slots[mineIndex] : undefined;

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[460px]", className)}>
      <div aria-hidden="true" className="absolute inset-0">
        <div className="orbit-ring absolute inset-[6%] rounded-full" />
        <div className="orbit-ring absolute inset-[21%] rounded-full" />
        <div className="orbit-ring absolute inset-[34%] rounded-full opacity-60" />
        {states.map((state, i) => {
          const slot = slots[i]!;
          const style = { left: `${slot.x}%`, top: `${slot.y}%` } as CSSProperties;
          return (
            <span
              key={`${i}-${state}`}
              data-state={state}
              style={style}
              className={cn(
                "absolute grid -translate-1/2 place-items-center rounded-[32%] transition-colors duration-[600ms] ease-[var(--ease)]",
                slot.ring === "outer" ? "size-[10.5%]" : "size-[8.5%]",
                STYLE[state],
              )}
            >
              {state === "sold" || state === "sold-mine" ? (
                <Check className="size-1/2 text-white/80" strokeWidth={2.5} />
              ) : null}
            </span>
          );
        })}
        {chip ? (
          <span
            className="absolute z-20 rounded-full bg-violet px-3 py-1 text-sm font-medium whitespace-nowrap text-white shadow-lg"
            style={
              chipAt
                ? { left: `${chipAt.x}%`, top: `${chipAt.y}%`, transform: "translate(-30%, 70%)" }
                : { left: "50%", top: "74%", transform: "translate(-50%, 0)" }
            }
          >
            {chip}
          </span>
        ) : null}
      </div>
      <div className="absolute inset-0 grid place-items-center text-center text-white">
        <div>
          <p className="display-number" aria-live="polite">
            {String(counts.available).padStart(2, "0")}
          </p>
          <p className="mt-2 text-sm text-white/85 sm:text-base">
            {counts.available === 1 ? "pair" : "pairs"} left of {counts.total}
          </p>
        </div>
      </div>
      <p className="sr-only">
        {counts.sold} sold, {counts.held} held, {counts.available} available of {counts.total}{" "}
        pairs.
      </p>
    </div>
  );
}
