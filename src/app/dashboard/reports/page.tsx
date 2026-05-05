"use client";

import { Plus, FileText, Image as ImageIcon, MapPin } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project_id");
  const reportKey = projectId ? `/api/reports?project_id=${projectId}` : "/api/reports";
  const { data, error, isLoading } = useSWR(reportKey, fetcher);
  const reports = data?.data || [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">รายงานประจำวัน (Daily Reports)</h2>
          <p className="text-gray-500">บันทึกและติดตามความคืบหน้ารายวันของไซต์งาน</p>
        </div>
        <Link 
          href="/dashboard/reports/new"
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition"
        >
          <Plus size={20} />
          สร้างรายงาน
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report: any, i: number) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-orange-600 bg-orange-50 px-2 py-1 rounded">
                  {report.date}
                </span>
                <span className="text-xs text-gray-500">ID: {report.report_id}</span>
              </div>
              <h3 className="font-bold text-gray-900 line-clamp-1 flex items-center gap-2">
                <MapPin size={16} className="text-gray-400"/> 
                {report.project_id}
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">สภาพอากาศ</p>
                  <p className="font-medium text-gray-900">{report.weather || "-"}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">จำนวนคนงาน</p>
                  <p className="font-medium text-gray-900">{report.workers || "0"} คน</p>
                </div>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-1">งานที่ทำวันนี้</p>
                <p className="text-sm text-gray-700 line-clamp-2">{report.work_done || "-"}</p>
              </div>
            </div>
            {report.photos_folder_id && (
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <ImageIcon size={16} />
                  <span>มีรูปภาพแนบ</span>
                </div>
                <a 
                  href={`https://drive.google.com/drive/folders/${report.photos_folder_id}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  ดูใน Drive
                </a>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-200 border-dashed flex items-center justify-center gap-2">
            <div className="animate-spin text-xl">↻</div>
            กำลังโหลดข้อมูล...
          </div>
        )}
        {reports.length === 0 && !isLoading && !error && (
          <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-200 border-dashed">
            ยังไม่มีรายงานประจำวัน
          </div>
        )}
      </div>
    </div>
  );
}
