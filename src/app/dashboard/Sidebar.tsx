"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Building2, 
  LayoutDashboard, 
  HardHat, 
  FileText, 
  Settings, 
  LogOut, 
  CheckSquare,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Users,
  Package
} from "lucide-react";
import Image from "next/image";

export default function Sidebar({ user }: { user: any }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("sidebar_collapsed");
    if (saved) {
      setCollapsed(saved === "true");
    }
  }, []);

  const toggleCollapse = () => {
    const newVal = !collapsed;
    setCollapsed(newVal);
    localStorage.setItem("sidebar_collapsed", String(newVal));
  };

  const navItems = [
    { name: "แดชบอร์ด", href: "/dashboard", icon: <LayoutDashboard size={20} />, exact: true },
    { name: "โครงการ", href: "/dashboard/projects", icon: <FolderKanban size={20} /> },
    { name: "รายงานประจำวัน", href: "/dashboard/reports", icon: <FileText size={20} /> },
    { name: "วัสดุ & งบประมาณ", href: "/dashboard/materials", icon: <Package size={20} /> },
    { name: "ติดตามงาน", href: "/dashboard/tasks", icon: <CheckSquare size={20} /> },
    { name: "แจ้งปัญหา (Issues)", href: "/dashboard/issues", icon: <AlertTriangle size={20} /> },
    { name: "จัดการพนักงาน", href: "/dashboard/team", icon: <Users size={20} /> },
  ];

  if (!mounted) return null; // Prevent hydration mismatch

  return (
    <aside 
      className={`bg-white border-r border-gray-200 flex flex-col hidden md:flex transition-all duration-300 ease-in-out relative ${
        collapsed ? "w-[76px]" : "w-[280px]"
      }`}
    >
      <div className={`h-[64px] flex items-center border-b border-gray-100 ${collapsed ? "justify-center px-0" : "justify-between px-5"}`}>
        {!collapsed && (
          <div className="flex items-center">
            <Image src="/logo.png" alt="PMC CONNEXT" width={160} height={32} className="object-contain" priority />
          </div>
        )}
        
        <button 
          onClick={toggleCollapse}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {navItems.map((item) => {
          const isActive = item.exact 
            ? pathname === item.href 
            : pathname.startsWith(item.href);
          
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.name : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-200 ${
                isActive 
                  ? "bg-orange-50 text-orange-600 shadow-sm" 
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <span className={`${isActive ? "text-orange-600" : "text-gray-400"}`}>
                {item.icon}
              </span>
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={`p-4 border-t border-gray-100 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
        <div className="flex items-center gap-3">
          <img
            src={user?.image || "https://ui-avatars.com/api/?name=" + user?.name}
            alt="Avatar"
            className="w-9 h-9 rounded-full border border-gray-200"
          />
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-gray-900 truncate">{user?.name}</span>
              <span className="text-xs text-gray-500 truncate w-32">{user?.email}</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
