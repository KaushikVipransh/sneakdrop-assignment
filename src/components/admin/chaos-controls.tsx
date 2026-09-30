"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { ChaosSettings } from "@/lib/admin-state";
import { Button } from "../ui/button";

const ADMIN_STATE_KEY = ["admin-state"] as const;

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}) {
  return (
    <label className="block min-w-0">
      <span className="flex justify-between gap-2 text-[13px]">
        <span className="label">{label}</span>
        <span className="num">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-11 w-full accent-[var(--accent)]"
      />
    </label>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const secs = (ms: number) => `${Math.round(ms / 1000)}s`;

/** Chaos knobs for the fake provider, plus Reset drop with a confirmation step. */
export function ChaosControls({ chaos }: { chaos: ChaosSettings }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ChaosSettings>(chaos);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const set = (key: keyof ChaosSettings) => (v: number) =>
    setDraft((d) => {
      const next = { ...d, [key]: v };
      // Keep the delay range valid while dragging either end.
      if (key === "minDelayMs" && next.maxDelayMs < v) next.maxDelayMs = v;
      if (key === "maxDelayMs" && next.minDelayMs > v) next.minDelayMs = v;
      return next;
    });

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/admin/chaos", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    setSaving(false);
    if (response.ok) toast.success(body.message ?? "Saved.");
    else toast.error(body.message ?? "Couldn't save.");
    await queryClient.invalidateQueries({ queryKey: ADMIN_STATE_KEY });
  }

  async function reset() {
    setResetting(true);
    const response = await fetch("/api/admin/reset", { method: "POST" });
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    setResetting(false);
    setConfirmReset(false);
    if (response.ok) toast.success(body.message ?? "Reset.");
    else toast.error(body.message ?? "Couldn't reset.");
    await queryClient.invalidateQueries({ queryKey: ADMIN_STATE_KEY });
  }

  return (
    <section
      aria-label="Chaos and reset"
      className="space-y-5 rounded-[var(--radius-card)] border border-border bg-surface p-5"
    >
      <h2 className="label">Chaos (applies to new payments)</h2>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-5">
          <Slider
            label="Delay min"
            value={draft.minDelayMs}
            onChange={set("minDelayMs")}
            min={0}
            max={600_000}
            step={5_000}
            format={secs}
          />
          <Slider
            label="Delay max"
            value={draft.maxDelayMs}
            onChange={set("maxDelayMs")}
            min={0}
            max={600_000}
            step={5_000}
            format={secs}
          />
          <Slider
            label="Duplicates"
            value={draft.duplicateRate}
            onChange={set("duplicateRate")}
            min={0}
            max={1}
            step={0.05}
            format={pct}
          />
          <Slider
            label="Reorder"
            value={draft.reorderRate}
            onChange={set("reorderRate")}
            min={0}
            max={1}
            step={0.05}
            format={pct}
          />
          <Slider
            label="Fail"
            value={draft.failRate}
            onChange={set("failRate")}
            min={0}
            max={1}
            step={0.05}
            format={pct}
          />
        </div>
        <Button type="submit" size="sm" variant="secondary" loading={saving}>
          Save chaos
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        {confirmReset ? (
          <>
            <p role="alert" className="text-sm">
              This clears every hold, order, payment, and the line. Reset the drop?
            </p>
            <Button size="sm" loading={resetting} onClick={reset}>
              Yes, reset
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setConfirmReset(true)}>
            Reset drop
          </Button>
        )}
        <p className="num text-[13px] text-text-muted">
          Load test: pnpm loadtest --users 1000 --payRate 0.7
        </p>
      </div>
    </section>
  );
}
