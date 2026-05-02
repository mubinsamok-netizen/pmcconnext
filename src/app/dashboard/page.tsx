"use client";

import { HardHat, TrendingUp, AlertTriangle } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

export default function DashboardPage() {
  const { data: projectsData, isLoading: projectsLoading } = useSWR("/api/projects", fetcher);
  const projects = projectsData?.data || [];
  const stats = [
    { label: "โครงการที่กำลังดำเนินงาน", value: projectsLoading ? "..." : projects.length.toString(), icon: <HardHat className="text-orange-600" size={24} /> },
    { label: "เปอร์เซ็นต์ความคืบหน้าเฉลี่ย", value: "0%", icon: <TrendingUp className="text-green-600" size={24} /> },
    { label: "ปัญหาที่ต้องแก้ไขด่วน", value: "0", icon: <AlertTriangle className="text-red-600" size={24} /> },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">ภาพรวมโครงการ (Overview)</h2>
        <p className="text-gray-500">ติดตามสถานะและความคืบหน้าของทุกไซต์งาน</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gray-50 flex items-center justify-center">
              {stat.icon}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">โครงการล่าสุด</h3>
          <Link href="/dashboard/projects" className="text-sm text-orange-600 font-medium hover:text-orange-700">
            ดูทั้งหมด
          </Link>
        </div>
        <div className="p-0">
          {projectsLoading ? (
             <div className="p-6 text-center text-gray-500 py-12 flex items-center justify-center gap-2">
                <div className="animate-spin text-xl">↻</div>
                กำลังโหลดข้อมูล...
             </div>
          ) : projects.length === 0 ? (
             <div className="p-6 text-center text-gray-500 py-12">
               ยังไม่มีโครงการในระบบ
             </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3 font-medium">รหัสโครงการ</th>
                  <th className="px-6 py-3 font-medium">ชื่อโครงการ</th>
                  <th className="px-6 py-3 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projects.slice(0, 5).map((p: any) => (
                  <tr key={p.project_id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-medium text-gray-900">{p.project_id}</td>
                    <td className="px-6 py-4 text-gray-700">{p.name}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        {p.status || "กำลังดำเนินการ"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
