"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const TICK_MS = 250;
const WARNING_MS = 60_000;
const ANNOUNCE_EVERY_MS = 30_000;

/** Milliseconds → "mm:ss", rounding up so the display reaches 00:00 exactly at expiry. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function spoken(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts = [];
  if (m > 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (s > 0 || m === 0) parts.push(`${s} second${s === 1 ? "" : "s"}`);
  return `${parts.join(" ")} left on your hold`;
}

type Props = {
  expiresAt: string;
  /** Current time on the server's clock (see useDropStatus). */
  serverNow: () => number;
  onExpire?: () => void;
  className?: string;
};

/**
 * Hold countdown derived from the server's `expiresAt`, never from a local
 * 5-minute timer. Mono digits, danger colour under 60 s, and a polite live
 * region that speaks at most every 30 s.
 */
export function Countdown({ expiresAt, serverNow, onExpire, className }: Props) {
  const target = Date.parse(expiresAt);
  const [remaining, setRemaining] = useState(() => target - serverNow());
  const [announcement, setAnnouncement] = useState(() => spoken(target - serverNow()));
  const lastAnnounced = useRef(0);
  const expired = useRef(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    expired.current = false;
    lastAnnounced.current = Date.now();
    const tick = () => {
      const left = target - serverNow();
      setRemaining(left);
      const now = Date.now();
      if (now - lastAnnounced.current >= ANNOUNCE_EVERY_MS) {
        lastAnnounced.current = now;
        setAnnouncement(spoken(left));
      }
      if (left <= 0 && !expired.current) {
        expired.current = true;
        onExpireRef.current?.();
      }
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [target, serverNow]);

  const warning = remaining < WARNING_MS;
  return (
    <>
      <span
        data-testid="countdown"
        aria-hidden
        className={cn(
          "num text-5xl leading-none font-medium tabular-nums transition-colors duration-250",
          warning && "text-danger",
          className,
        )}
      >
        {formatRemaining(remaining)}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
