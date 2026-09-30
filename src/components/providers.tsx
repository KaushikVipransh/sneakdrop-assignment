"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { EnsureGuestSession } from "./ensure-guest-session";
import { Toaster } from "./ui/toaster";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 2, staleTime: 0 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <EnsureGuestSession />
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
