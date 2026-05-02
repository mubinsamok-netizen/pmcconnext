"use client";

import { Plus, AlertTriangle, CheckCircle2, Clock, CircleDot } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { useState } from "react";

const PRIORITY_STYLES: Record<string, string> = {
  High: "bg-red-50 text-red-700 border-red-200",
  Medium: "bg-orange-50 text-orange-700 border-orange-200",
  Low: "bg-blue-50 text-blue-700 border-blue-200"
};

const STATUS_ICONS: Record<string, any> = {
  "Open": <CircleDot size={14} className="text-red-500" />,
  "In Progress": <Clock size={14} className="text-orange-500" />,
  "Resolved": <CheckCircle2 size={14} className="text-green-500" />
};

export default function IssuesPage() {
  const { data: issuesData, error, isLoading, mutate } = useSWR("/api/issues", fetcher);
  const { data: projectsData } = useSWR("/api/projects", fetcher);
  
  const issues = issuesData?.data || [];
  const projects = projectsData?.data || [];

  const [selectedProject, setSelectedProject] = useState("");

  const filteredIssues = selectedProject 
    ? issues.filter((i: any) => i.project_id === selectedProject) 
    : issues;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">แจ้งปัญหา & RFI</h2>
          <p className="text-gray-500">ติดตามปัญหาที่พบและขอข้อมูลเพิ่มเติม</p>
        </div>
        <Link 
          href="/dashboard/issues/new"
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition"
        >
          <Plus size={20} />
          แจ้งปัญหาใหม่
        </Link>
      </div>

      <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
        <label className="font-medium text-gray-700 text-sm">กรองตามโครงการ:</label>
        <select 
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-200 text-sm min-w-[200px]"
        >
          <option value="">ทั้งหมด (All Projects)</option>
          {projects.map((p: any) => (
            <option key={p.project_id} value={p.project_id}>{p.project_id} - {p.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
          ไม่สามารถดึงข้อมูลปัญหาได้
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-200">
                <th className="p-4 font-medium">รหัส / ปัญหา</th>
                <th className="p-4 font-medium">โครงการ</th>
                <th className="p-4 font-medium">ความสำคัญ</th>
                <th className="p-4 font-medium">สถานะ</th>
                <th className="p-4 font-medium">ผู้รับผิดชอบ</th>
                <th className="p-4 font-medium">กำหนดเสร็จ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filteredIssues.map((issue: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50 transition">
                  <td className="p-4">
                    <p className="font-semibold text-gray-900">{issue.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{issue.issue_id}</p>
                  </td>
                  <td className="p-4 text-gray-600 font-medium">
                    {issue.project_id}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${PRIORITY_STYLES[issue.priority] || PRIORITY_STYLES.Medium}`}>
                      {issue.priority}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5">
                      {STATUS_ICONS[issue.status] || STATUS_ICONS.Open}
                      <span className="font-medium text-gray-700">{issue.status}</span>
                    </div>
                  </td>
                  <td className="p-4 text-gray-600">
                    {issue.owner || "-"}
                  </td>
                  <td className="p-4 text-gray-500">
                    {issue.due_date || "-"}
                  </td>
                </tr>
              ))}
              
              {isLoading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin text-xl">↻</div>
                      กำลังโหลดข้อมูล...
                    </div>
                  </td>
                </tr>
              )}
              
              {filteredIssues.length === 0 && !isLoading && !error && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    ยังไม่มีการแจ้งปัญหาในระบบ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
