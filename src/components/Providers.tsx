"use client";

import { SessionProvider } from "next-auth/react";
import GlobalLoadingIndicator from "@/components/GlobalLoadingIndicator";
import { ThemeProvider } from "@/components/ThemeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>
        {children}
        <GlobalLoadingIndicator />
      </SessionProvider>
    </ThemeProvider>
  );
}
