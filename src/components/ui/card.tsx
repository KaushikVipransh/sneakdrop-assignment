import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** White glass surface with a large radius. */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "glass rounded-[var(--radius-card)] p-6 shadow-[0_24px_60px_-30px_rgb(12_10_29/0.45)] sm:p-8",
        className,
      )}
      {...props}
    />
  );
}
