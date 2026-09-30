"use client";

import { useEffect, useState } from "react";

/** Re-renders every `ms` and returns the current time from `clock`. */
export function useNow(clock: () => number, ms = 1000): number {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    const id = setInterval(() => setNow(clock()), ms);
    return () => clearInterval(id);
  }, [clock, ms]);
  return now;
}
