"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bug,
  Building2,
  CalendarClock,
  X,
  ChevronLeft,
  ChevronRight,
  FileSignature,
  FileText,
  FolderKanban,
  Images,
  Info,
  LayoutDashboard,
  ListChecks,
  Presentation,
  ShieldCheck,
  StickyNote,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { getAppRole } from "@/lib/roles";
import { canAccessSiteSegment, isForemanRole } from "@/lib/siteAccess";

type SidebarUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
  googleSub?: string | null;
  authProvider?: string | null;
};

const workspaceNavItems = [
  { name: "ไซต์งาน", href: "/dashboard/projects", icon: FolderKanban },
  { name: "Sales CRM", href: "/dashboard/sales-crm", icon: Presentation },
];

const siteNavItems = [
  { name: "ภาพรวมโครงการ", segment: "", icon: LayoutDashboard, exact: true },
  { name: "รายละเอียดโครงการ", segment: "details", icon: Info },
  { name: "รายละเอียดงาน/ประกัน", segment: "lifecycle", icon: CalendarClock },
  { name: "รายงานประจำวัน", segment: "reports", icon: FileText },
  { name: "บันทึกหน้างาน", segment: "notes", icon: StickyNote },
  { name: "บันทึกข้อความ / Memo", segment: "memos", icon: FileSignature },
  { name: "แผนงาน", segment: "schedule", icon: ListChecks },
  { name: "QC Checklist", segment: "qc-checklists", icon: ShieldCheck },
  { name: "งานเพิ่ม-ลด", segment: "variation-orders", icon: FileText },
  { name: "Defect", segment: "defects", icon: Bug },
  { name: "รูปภาพและไฟล์ทั้งหมด", segment: "files", icon: Images },
];

export default function Sidebar({
  user,
  mobileOpen = false,
  onMobileClose,
}: {
  user?: SidebarUser;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar_collapsed");
    const frame = window.requestAnimationFrame(() => {
      if (saved) {
        setCollapsed(saved === "true");
      }
      setMounted(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  const siteId = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments[0] === "dashboard" && segments[1] === "sites" && segments[2]) {
      return decodeURIComponent(segments[2]);
    }
    return "";
  }, [pathname]);

  const isSiteMode = Boolean(siteId);
  const isAdmin = getAppRole(user?.role) === "Admin";
  const isForeman = isForemanRole(user?.role);
  const visibleWorkspaceNavItems = workspaceNavItems.filter((item) => {
    if (item.href === "/dashboard/sales-crm") return isAdmin;
    if (isForeman) return item.href === "/dashboard/projects";
    return true;
  });
  const visibleSiteNavItems = siteNavItems.filter((item) => canAccessSiteSegment(user?.role, item.segment));

  const toggleCollapse = () => {
    const nextValue = !collapsed;
    setCollapsed(nextValue);
    localStorage.setItem("sidebar_collapsed", String(nextValue));
  };

  const sidebarContent = (isMobile: boolean) => (
    <>
      <div className={`h-[64px] flex items-center border-b border-gray-100 ${collapsed && !isMobile ? "justify-center px-0" : "justify-between px-5"}`}>
        {(!collapsed || isMobile) && (
          <div className="flex items-center">
            <Image src="/logo.png" alt="PMC CONNEXT" width={160} height={32} className="object-contain" priority />
          </div>
        )}

        {isMobile ? (
          <button
            type="button"
            onClick={onMobileClose}
            className="grid h-9 w-9 place-items-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            title="ปิดเมนู"
            aria-label="ปิดเมนู"
          >
            <X size={19} />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleCollapse}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {(!collapsed || isMobile) && !isSiteMode && (
          <div className="px-3 pb-2 pt-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Master Workspace
            </div>
          </div>
        )}

        {isSiteMode ? (
          <>
            {visibleSiteNavItems.map((item) => {
              const Icon = item.icon;
              const href = item.segment ? `/dashboard/sites/${siteId}/${item.segment}` : `/dashboard/sites/${siteId}`;
              const isActive = item.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

              return <SidebarLink key={item.name} href={href} name={item.name} Icon={Icon} active={isActive} collapsed={collapsed && !isMobile} onNavigate={isMobile ? onMobileClose : undefined} />;
            })}
          </>
        ) : (
          <>
            {visibleWorkspaceNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return <SidebarLink key={item.href} href={item.href} name={item.name} Icon={Icon} active={isActive} collapsed={collapsed && !isMobile} onNavigate={isMobile ? onMobileClose : undefined} />;
            })}
            {isAdmin && <SidebarLink href="/dashboard/team" name="จัดการพนักงาน" Icon={Users} active={pathname.startsWith("/dashboard/team")} collapsed={collapsed && !isMobile} onNavigate={isMobile ? onMobileClose : undefined} />}
          </>
        )}
      </nav>

      {isSiteMode && (
        <div className="border-t border-gray-100 bg-white p-3">
          {collapsed && !isMobile ? (
            <Link
              href={`/dashboard/sites/${siteId}`}
              className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-orange-600 text-white shadow-sm"
              title={siteId}
            >
              <Building2 size={18} />
            </Link>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-2.5">
              <Link href={`/dashboard/sites/${siteId}`} onClick={isMobile ? onMobileClose : undefined} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm transition hover:shadow">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-orange-600 text-white">
                  <Building2 size={17} />
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] font-extrabold uppercase tracking-wide text-gray-400">Current Site</div>
                  <div className="truncate text-sm font-extrabold text-gray-900">{siteId}</div>
                </div>
              </Link>
              <Link href="/dashboard/projects" onClick={isMobile ? onMobileClose : undefined} className="mt-2 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-gray-500 transition hover:bg-white hover:text-orange-600">
                <ChevronLeft size={14} />
                กลับไปไซต์งานทั้งหมด
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );

  if (!mounted) return null;

  return (
    <>
      <aside
        className={`relative hidden flex-col border-r border-gray-200 bg-white transition-all duration-300 ease-in-out md:flex ${
          collapsed ? "w-[76px]" : "w-[280px]"
        }`}
      >
        {sidebarContent(false)}
      </aside>

      <div className={`fixed inset-0 z-50 md:hidden ${mobileOpen ? "" : "pointer-events-none"}`}>
        <button
          type="button"
          aria-label="ปิดเมนู"
          onClick={onMobileClose}
          className={`absolute inset-0 bg-gray-950/35 backdrop-blur-[2px] transition-opacity ${mobileOpen ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          className={`absolute left-0 top-0 flex h-full w-[min(82vw,320px)] flex-col border-r border-gray-200 bg-white shadow-2xl transition-transform duration-300 ease-out ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {sidebarContent(true)}
        </aside>
      </div>
    </>
  );
}

function SidebarLink({
  href,
  name,
  Icon,
  active,
  collapsed,
  onNavigate,
}: {
  href: string;
  name: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? name : undefined}
      onClick={onNavigate}
      className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-200 ${
        active ? "bg-orange-50 text-orange-600 shadow-sm" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
      } ${collapsed ? "justify-center" : ""}`}
    >
      {active && <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-orange-600" />}
      <Icon size={20} className={active ? "text-orange-600" : "text-gray-400"} />
      {!collapsed && <span>{name}</span>}
      {collapsed && (
        <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100">
          {name}
        </span>
      )}
    </Link>
  );
}
