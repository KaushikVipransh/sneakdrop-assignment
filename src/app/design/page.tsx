import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Design tokens — Sneaker Drop" };

const COLORS = [
  "bg",
  "surface",
  "surface-muted",
  "border",
  "text",
  "text-muted",
  "accent",
  "accent-text",
  "on-accent",
  "success",
  "danger",
] as const;

function Swatches() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {COLORS.map((name) => (
        <div key={name} className="flex items-center gap-3">
          <span
            className="size-8 shrink-0 rounded-[6px] border border-border"
            style={{ background: `var(--${name})` }}
          />
          <span className="num text-[13px] text-text-muted">--{name}</span>
        </div>
      ))}
    </div>
  );
}

function Specimen() {
  return (
    <div className="space-y-4">
      <p className="label">Air Timebase 01</p>
      <p className="display-number">07</p>
      <h1 className="text-[32px] leading-[1.1] font-semibold tracking-[-0.02em] sm:text-[40px]">
        Sold out — for now
      </h1>
      <h2 className="text-2xl leading-[1.2] font-semibold">Your hold</h2>
      <p>We&apos;ll hold it for 5 minutes while you pay.</p>
      <p className="num text-5xl leading-none font-medium">04:12</p>
      <p className="num text-5xl leading-none font-medium text-danger">00:42</p>
      <p className="num text-[13px] leading-[1.6] text-text-muted">10:00:03 Hold created</p>
      <p className="text-accent-text">Orange as text uses --accent-text.</p>
      <p className="text-success">It&apos;s yours.</p>
      <div className="flex gap-2">
        <span className="hatch size-6 rounded-[6px]" />
        <span className="size-6 rounded-[6px] bg-accent" />
        <span className="size-6 rounded-[6px] bg-text" />
        <span className="size-6 rounded-[6px] border border-border bg-surface-muted" />
      </div>
      <Card className="space-y-4">
        <p className="label">Your hold</p>
        <div className="flex flex-wrap gap-3">
          <Button>Pay now</Button>
          <Button variant="secondary">Release</Button>
          <Button variant="ghost">Leave line</Button>
          <Button loading>Pay now</Button>
          <Button disabled>Buy</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm">Reset drop</Button>
          <Button size="sm" variant="secondary">
            Save chaos
          </Button>
        </div>
      </Card>
      <Swatches />
    </div>
  );
}

/** Token test page: the same specimen in both themes, side by side. */
export default function DesignPage() {
  return (
    <main className="grid flex-1 md:grid-cols-2">
      {(["light", "dark"] as const).map((theme) => (
        <section
          key={theme}
          data-theme={theme}
          aria-label={`${theme} theme`}
          className="bg-bg p-4 text-text sm:p-8"
        >
          <p className="label mb-6">{theme} theme</p>
          <Specimen />
        </section>
      ))}
    </main>
  );
}
