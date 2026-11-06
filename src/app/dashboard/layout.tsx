import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/currentSession";
import DashboardChrome from "./DashboardChrome";

type SessionUserWithRole = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
  googleSub?: string | null;
  authProvider?: string | null;
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/");
  }

  return (
    <div className="dashboard-shell flex h-screen min-w-0 overflow-hidden bg-gray-50 text-gray-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
      <DashboardChrome user={session.user as SessionUserWithRole}>
        {children}
      </DashboardChrome>
    </div>
  );
}
