import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
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

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/");
  }

  return (
    <div className="dashboard-shell flex h-screen bg-gray-50 text-gray-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar user={session.user as SessionUserWithRole} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar user={session.user as SessionUserWithRole} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
