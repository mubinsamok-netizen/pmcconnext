"use client";

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";
import Sidebar from "./Sidebar";
import DashboardTopBar from "./DashboardTopBar";

type SessionUserWithRole = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
  googleSub?: string | null;
  authProvider?: string | null;
};

export default function DashboardChrome({
  user,
  session,
  children,
}: {
  user?: SessionUserWithRole;
  session: Session;
  children: React.ReactNode;
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <SessionProvider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
      <Sidebar
        user={user}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <DashboardTopBar user={user} onMenuClick={() => setMobileSidebarOpen(true)} />
        <main className="min-w-0 flex-1 overflow-auto p-3 sm:p-5 xl:p-6">
          {children}
        </main>
      </div>
    </SessionProvider>
  );
}
