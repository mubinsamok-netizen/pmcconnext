"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { AlertTriangle, Bell, CheckCheck, Clock3, LogOut, Maximize, Minimize, Search } from "lucide-react";
import useSWR from "swr";
import ConfirmDialog from "@/components/ConfirmDialog";
import ThemeToggle from "@/components/ThemeToggle";
import { fetcher } from "@/lib/fetcher";

type TopBarUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
  googleSub?: string | null;
  authProvider?: string | null;
};

type NotificationItem = {
  _rowIndex?: number;
  notification_id: string;
  project_id?: string;
  type?: string;
  title?: string;
  message?: string;
  link?: string;
  is_read?: string;
  created_at?: string;
  is_generated?: string;
};

type NotificationsResponse = {
  success: boolean;
  data: NotificationItem[];
  unread_count: number;
};

function getPageTitle(pathname: string) {
  if (pathname.startsWith("/dashboard/sites/")) return "Site Workspace";
  if (pathname.startsWith("/dashboard/projects")) return "Projects";
  if (pathname.startsWith("/dashboard/sales-crm")) return "Sales CRM";
  if (pathname.startsWith("/dashboard/team")) return "Team Management";
  if (pathname.startsWith("/dashboard/schedule")) return "Schedule";
  return "Workspace";
}

export default function DashboardTopBar({ user }: { user?: TopBarUser }) {
  const pathname = usePathname();
  const [time, setTime] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [query, setQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [dismissedGeneratedIds, setDismissedGeneratedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const raw = window.localStorage.getItem("dismissed_generated_notifications");
    if (!raw) return new Set();

    try {
      return new Set(JSON.parse(raw) as string[]);
    } catch {
      window.localStorage.removeItem("dismissed_generated_notifications");
      return new Set();
    }
  });
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const { data: notificationsData, mutate: mutateNotifications } = useSWR<NotificationsResponse>(
    "/api/notifications",
    fetcher,
    { refreshInterval: 60_000 }
  );

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

  useEffect(() => {
    if (!notificationsOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!notificationsRef.current?.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [notificationsOpen]);

  const pageTitle = useMemo(() => getPageTitle(pathname), [pathname]);
  const userInitial = (user?.name || user?.email || "U").charAt(0).toUpperCase();
  const notifications = notificationsData?.data || [];
  const visibleNotifications = notifications.filter((notification) => (
    notification.is_generated !== "TRUE" || !dismissedGeneratedIds.has(notification.notification_id)
  ));
  const unreadCount = visibleNotifications.filter((notification) => notification.is_read !== "TRUE").length;

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => undefined);
    } else {
      await document.exitFullscreen().catch(() => undefined);
    }
  };

  const markNotificationRead = async (notification: NotificationItem) => {
    if (notification.is_generated === "TRUE") {
      const next = new Set(dismissedGeneratedIds);
      next.add(notification.notification_id);
      setDismissedGeneratedIds(next);
      window.localStorage.setItem("dismissed_generated_notifications", JSON.stringify(Array.from(next)));
      return;
    }

    if (notification.is_read === "TRUE") return;

    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_id: notification.notification_id }),
    });
    await mutateNotifications();
  };

  const markAllRead = async () => {
    const next = new Set(dismissedGeneratedIds);
    visibleNotifications
      .filter((notification) => notification.is_generated === "TRUE")
      .forEach((notification) => next.add(notification.notification_id));
    setDismissedGeneratedIds(next);
    window.localStorage.setItem("dismissed_generated_notifications", JSON.stringify(Array.from(next)));

    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_all: true }),
    });
    await mutateNotifications();
  };

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-gray-200 bg-white/90 px-6 backdrop-blur-md">
      <div className="flex h-full items-center justify-between gap-4">
        <div className="min-w-0 shrink-0">
          <h1 className="truncate text-lg font-extrabold tracking-tight text-gray-950">{pageTitle}</h1>
          <p className="hidden text-xs font-medium text-gray-400 sm:block">PCM CONNEXT construction workspace</p>
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

          <div ref={notificationsRef} className="relative">
            <button
              type="button"
              onClick={() => setNotificationsOpen((open) => !open)}
              className={`notification-button ${notificationsOpen ? "notification-button-open" : ""}`}
              title="การแจ้งเตือน"
              aria-label="การแจ้งเตือน"
            >
              <Bell className="notification-bell" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-orange-600 px-1.5 text-[10px] font-extrabold leading-none text-white ring-2 ring-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 top-12 z-50 w-[360px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-gray-950">การแจ้งเตือน</h3>
                    <p className="text-xs font-medium text-gray-400">{unreadCount > 0 ? `${unreadCount} รายการที่ต้องดู` : "ไม่มีรายการใหม่"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-extrabold text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                  >
                    <CheckCheck size={14} />
                    อ่านแล้ว
                  </button>
                </div>

                <div className="max-h-[420px] overflow-y-auto p-2">
                  {visibleNotifications.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-gray-50 text-gray-400">
                        <Bell size={20} />
                      </div>
                      <p className="mt-3 text-sm font-bold text-gray-700">ยังไม่มีแจ้งเตือน</p>
                      <p className="mt-1 text-xs font-medium text-gray-400">งานใกล้ครบกำหนดและการอัปเดตจะแสดงที่นี่</p>
                    </div>
                  ) : (
                    visibleNotifications.map((notification) => {
                      const isAlert = notification.type === "overdue";
                      const content = (
                        <div className={`group flex gap-3 rounded-xl px-3 py-3 transition hover:bg-gray-50 ${notification.is_read === "TRUE" ? "opacity-70" : ""}`}>
                          <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${isAlert ? "bg-red-50 text-red-600" : "bg-orange-50 text-orange-600"}`}>
                            {isAlert ? <AlertTriangle size={17} /> : <Bell size={17} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-3">
                              <span className="line-clamp-1 text-sm font-extrabold text-gray-950">{notification.title || "แจ้งเตือน"}</span>
                              {notification.is_read !== "TRUE" && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-orange-500" />}
                            </span>
                            <span className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-gray-500">{notification.message || "-"}</span>
                            <span className="mt-2 block text-[11px] font-bold text-gray-400">{notification.project_id || "Workspace"}</span>
                          </span>
                        </div>
                      );

                      if (!notification.link) {
                        return (
                          <button
                            key={notification.notification_id}
                            type="button"
                            onClick={() => markNotificationRead(notification)}
                            className="block w-full text-left"
                          >
                            {content}
                          </button>
                        );
                      }

                      return (
                        <Link
                          key={notification.notification_id}
                          href={notification.link}
                          onClick={() => {
                            void markNotificationRead(notification);
                            setNotificationsOpen(false);
                          }}
                          className="block"
                        >
                          {content}
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

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
