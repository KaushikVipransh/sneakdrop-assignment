import { cn } from "@/lib/utils";

/** Label (uppercase, muted) above a number. */
export function Stat({
  label,
  value,
  className,
  tone = "light",
}: {
  label: string;
  value: number | string;
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt
        className={cn(
          "text-[12px] font-medium tracking-[0.12em] uppercase",
          tone === "dark" ? "text-white/70" : "text-text-muted",
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-2xl leading-none font-medium tabular-nums sm:text-3xl",
          tone === "dark" ? "text-white" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Sold / held / waiting row; on the stage it sits on the dark floor like a logo strip. */
export function StatsStrip({
  sold,
  held,
  waiting,
  tone = "light",
}: {
  sold: number;
  held: number;
  waiting: number;
  tone?: "light" | "dark";
}) {
  return (
    <dl className={cn("grid grid-cols-3 gap-4 py-5", tone === "light" && "border-y border-border")}>
      <Stat tone={tone} label="Sold" value={sold} />
      <Stat tone={tone} label="Held" value={held} />
      <Stat tone={tone} label="Waiting" value={waiting} />
    </dl>
  );
}
