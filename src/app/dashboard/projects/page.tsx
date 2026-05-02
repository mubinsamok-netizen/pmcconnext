"use client";

import { Plus, Building2, MapPin, Calendar } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

export default function ProjectsPage() {
  const { data, error, isLoading } = useSWR("/api/projects", fetcher);
  const projects = data?.data || [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">จัดการไซต์งาน (Projects)</h2>
          <p className="text-gray-500">จัดการรายชื่อโครงการและไซต์งานทั้งหมด</p>
        </div>
        <Link 
          href="/dashboard/projects/new"
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition"
        >
          <Plus size={20} />
          สร้างโครงการ
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project: any, i: number) => (
          <Link href={`/dashboard/projects/${project.project_id}`} key={i} className="group">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-orange-200 transition overflow-hidden">
              <div className="h-32 bg-gray-100 relative">
                {/* Fallback Cover Image */}
                <div className="absolute inset-0 bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center text-orange-200 group-hover:scale-105 transition duration-500">
                  <Building2 size={64} />
                </div>
                <div className="absolute top-4 right-4 px-3 py-1 bg-white/90 backdrop-blur text-sm font-semibold rounded-full text-orange-600">
                  {project.status || "N/A"}
                </div>
              </div>
              
              <div className="p-5 space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-orange-600 transition">
                    {project.name}
                  </h3>
                  <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                    <MapPin size={14} />
                    {project.client || "ไม่ระบุลูกค้า"}
                  </p>
                </div>
                
                <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center gap-1">
                    <Calendar size={14} />
                    {project.start_date || "N/A"}
                  </div>
                  <div>
                    {project.percent_done ? `${project.percent_done}%` : "0%"}
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}

        {isLoading && (
          <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-200 border-dashed flex items-center justify-center gap-2">
            <div className="animate-spin text-xl">↻</div>
            กำลังโหลดข้อมูล...
          </div>
        )}

        {projects.length === 0 && !isLoading && !error && (
          <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-200 border-dashed">
            ยังไม่มีโครงการในระบบ
          </div>
        )}
      </div>
    </div>
  );
}
