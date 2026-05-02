import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { LogOut } from "lucide-react";
import Link from "next/link";
import Sidebar from "./Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    redirect("/");
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <Sidebar user={session.user} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <h1 className="text-xl font-semibold">Workspace</h1>
          <Link href="/api/auth/signout" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
            <LogOut size={16} />
            ออกจากระบบ
          </Link>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
