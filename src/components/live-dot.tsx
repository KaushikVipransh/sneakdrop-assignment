import { cn } from "@/lib/utils";

export type DropPhase = "live" | "pre-sale" | "ended";

/** 8px status dot: orange and pulsing when live (DESIGN.md §2.4, §5). */
export function LiveDot({ phase, className }: { phase: DropPhase; className?: string }) {
  return (
    <span
      aria-hidden
      data-phase={phase}
      className={cn(
        "inline-block size-2 rounded-full",
        phase === "live" && "animate-live bg-accent",
        phase === "pre-sale" && "border border-text-muted",
        phase === "ended" && "bg-text-muted",
        className,
      )}
    />
  );
}
