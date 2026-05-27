"use client";

import { SessionProvider } from "next-auth/react";
import { SWRConfig } from "swr";
import GlobalLoadingIndicator from "@/components/GlobalLoadingIndicator";
import { ThemeProvider } from "@/components/ThemeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
        <SWRConfig
          value={{
            dedupingInterval: 120_000,
            focusThrottleInterval: 60_000,
            revalidateOnFocus: false,
            revalidateOnReconnect: false,
            shouldRetryOnError: false,
          }}
        >
          {children}
          <GlobalLoadingIndicator />
        </SWRConfig>
      </SessionProvider>
    </ThemeProvider>
  );
}
