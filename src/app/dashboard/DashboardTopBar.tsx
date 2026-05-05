"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Clock3, LogOut, Maximize, Menu, Minimize, Search } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import ThemeToggle from "@/components/ThemeToggle";

type TopBarUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
  googleSub?: string | null;
  authProvider?: string | null;
};

function getPageTitle(pathname: string) {
  if (pathname.startsWith("/dashboard/sites/")) return "Site Workspace";
  if (pathname.startsWith("/dashboard/projects")) return "Projects";
  if (pathname.startsWith("/dashboard/sales-crm")) return "Sales CRM";
  if (pathname.startsWith("/dashboard/team")) return "Team Management";
  if (pathname.startsWith("/dashboard/schedule")) return "Schedule";
  return "Workspace";
}

export default function DashboardTopBar({
  user,
  onMenuClick,
}: {
  user?: TopBarUser;
  onMenuClick?: () => void;
}) {
  const pathname = usePathname();
  const [time, setTime] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [query, setQuery] = useState("");
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setTime(new Date()));
    const timer = window.setInterval(() => setTime(new Date()), 1000);
    const handleFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreen);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
      document.removeEventListener("fullscreenchange", handleFullscreen);
    };
  }, []);

  const pageTitle = useMemo(() => getPageTitle(pathname), [pathname]);
  const userInitial = (user?.name || user?.email || "U").charAt(0).toUpperCase();

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => undefined);
    } else {
      await document.exitFullscreen().catch(() => undefined);
    }
  };

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-gray-200 bg-white/90 px-4 backdrop-blur-md sm:px-6">
      <div className="flex h-full items-center justify-between gap-4">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="grid h-10 w-10 place-items-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 hover:text-orange-600 md:hidden"
            title="เปิดเมนู"
            aria-label="เปิดเมนู"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold tracking-tight text-gray-950">{pageTitle}</h1>
            <p className="hidden text-xs font-medium text-gray-400 sm:block">PCM CONNEXT construction workspace</p>
          </div>
        </div>

        <div className="hidden flex-1 justify-center lg:flex">
          <label className="relative w-full max-w-xl">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm font-medium text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-orange-200 focus:bg-white focus:ring-4 focus:ring-orange-50"
              placeholder="ค้นหาโครงการ เมนู รายงาน หรือไฟล์..."
              type="search"
            />
          </label>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />

          <button
            type="button"
            onClick={toggleFullscreen}
            className="hidden h-9 w-9 place-items-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 sm:grid"
            title={isFullscreen ? "ออกจาก Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>

          <div className="hidden h-9 w-px bg-gray-200 sm:block" />

          <div className="hidden h-11 items-center gap-2.5 rounded-2xl border border-gray-200 bg-white px-3 text-left shadow-sm sm:flex">
            <span className="relative grid h-8 w-8 place-items-center rounded-xl bg-orange-50 text-orange-600">
              <Clock3 size={16} />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-orange-500 ring-2 ring-white" />
            </span>
            <div className="min-w-[78px]">
              <div className="font-mono text-[15px] font-extrabold leading-none text-gray-950">
                {time ? time.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
              </div>
              <div className="mt-1 text-[10px] font-extrabold leading-none text-orange-600">
                {time ? time.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "\u00a0"}
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-2 pl-1 md:flex">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gray-900 text-sm font-bold text-white">
              {userInitial}
            </div>
            <div className="max-w-[150px]">
              <p className="truncate text-xs font-bold leading-none text-gray-900">{user?.name || "User"}</p>
              <p className="mt-1 truncate text-[11px] font-medium leading-none text-gray-400">{user?.role || user?.email || "-"}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setLogoutDialogOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-xl text-gray-400 transition hover:bg-red-50 hover:text-red-600"
            title="ออกจากระบบ"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={logoutDialogOpen}
        title="ออกจากระบบ?"
        message="คุณต้องการออกจากระบบ PCM CONNEXT ใช่ไหม"
        confirmLabel="ออกจากระบบ"
        cancelLabel="ยกเลิก"
        onConfirm={() => {
          void signOut({ callbackUrl: "/" });
        }}
        onCancel={() => setLogoutDialogOpen(false)}
      />
    </header>
  );
}
