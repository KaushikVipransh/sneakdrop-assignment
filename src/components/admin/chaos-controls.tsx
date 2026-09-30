"use client";

import type { ChaosSettings } from "@/lib/admin-state";

/** Placeholder until T58 adds the controls. */
export function ChaosControls({ chaos }: { chaos: ChaosSettings }) {
  return (
    <p className="num text-[13px] text-text-muted">
      chaos: delay {chaos.minDelayMs / 1000}–{chaos.maxDelayMs / 1000}s · duplicates{" "}
      {Math.round(chaos.duplicateRate * 100)}% · reorder {Math.round(chaos.reorderRate * 100)}% ·
      fail {Math.round(chaos.failRate * 100)}%
    </p>
  );
}
