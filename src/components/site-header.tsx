import { Menu } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LiveDot, type DropPhase } from "./live-dot";

export function phaseLabel(phase: DropPhase, startsAt: Date): string {
  if (phase === "live") return "LIVE";
  if (phase === "ended") return "ENDED";
  const hhmm = startsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `OPENS ${hhmm}`;
}

export type NavLink = { href: string; label: string };

function Wordmark({ title }: { title: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-lg bg-ink text-[13px] font-bold text-white"
      >
        S
      </span>
      <span className="text-[17px] whitespace-nowrap">{title}</span>
    </span>
  );
}

/** Glass pill navigation: wordmark, section links, live status, account, and a call to action. */
export function SiteHeader({
  phase,
  startsAt,
  title = "Sneaker Drop",
  account,
  cta,
  links = [],
  wide = false,
}: {
  phase: DropPhase;
  startsAt: Date;
  title?: string;
  account?: ReactNode;
  cta?: ReactNode;
  links?: NavLink[];
  wide?: boolean;
}) {
  return (
    <header className="relative z-30 px-3 pt-3 sm:px-6 sm:pt-5">
      <nav
        aria-label="Main"
        className={cn(
          "glass mx-auto flex h-14 items-center justify-between gap-3 rounded-full py-2 pr-2 pl-4 text-ink sm:pl-5",
          wide ? "max-w-[1180px]" : "max-w-[1240px]",
        )}
      >
        <div className="flex min-w-0 items-center gap-6">
          <Wordmark title={title} />
          {links.length > 0 ? (
            <ul className="hidden items-center gap-5 text-[15px] text-text-muted md:flex">
              {links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="rounded-full hover:text-ink">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3">
          <span className="label inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-ink">
            <LiveDot phase={phase} />
            <span data-testid="phase">{phaseLabel(phase, startsAt)}</span>
          </span>
          {account}
          {cta ? <span className="hidden sm:inline-flex">{cta}</span> : null}
          {links.length > 0 ? (
            <details className="relative md:hidden">
              <summary
                aria-label="Menu"
                className="grid size-10 cursor-pointer list-none place-items-center rounded-full bg-ink text-white [&::-webkit-details-marker]:hidden"
              >
                <Menu className="size-5" aria-hidden />
              </summary>
              <ul className="glass absolute right-0 mt-3 w-48 space-y-1 rounded-2xl p-2 text-[15px]">
                {links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} className="block rounded-xl px-3 py-2.5 hover:bg-white">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </nav>
    </header>
  );
}
