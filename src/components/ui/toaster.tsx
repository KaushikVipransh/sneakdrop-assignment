"use client";

import { Toaster as Sonner } from "sonner";

/** Bottom-centre toasts, 4 s, styled with the Ledger tokens (DESIGN.md §5). */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      duration={4000}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[min(92vw,420px)] items-start gap-3 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-3 text-sm text-text",
          title: "font-medium",
          description: "text-text-muted",
          success: "border-l-4 border-l-success",
          error: "border-l-4 border-l-danger",
          info: "border-l-4 border-l-text-muted",
        },
      }}
    />
  );
}
