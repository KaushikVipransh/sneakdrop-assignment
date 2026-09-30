import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Flat surface with a hairline border, no shadow (DESIGN.md §2.3, §5). */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border border-border bg-surface p-6 sm:p-8",
        className,
      )}
      {...props}
    />
  );
}
