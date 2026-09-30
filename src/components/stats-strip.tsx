import { cn } from "@/lib/utils";

/** Label (uppercase, muted) above a mono number. */
export function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="label">{label}</dt>
      <dd className="num mt-1 text-2xl leading-none font-medium">{value}</dd>
    </div>
  );
}

/** SOLD / HELD / WAITING row under the main card (DESIGN.md §3.1). */
export function StatsStrip({
  sold,
  held,
  waiting,
}: {
  sold: number;
  held: number;
  waiting: number;
}) {
  return (
    <dl className="grid grid-cols-3 gap-4 border-y border-border py-5">
      <Stat label="Sold" value={sold} />
      <Stat label="Held" value={held} />
      <Stat label="Waiting" value={waiting} />
    </dl>
  );
}
