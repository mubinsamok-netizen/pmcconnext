"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

export default function NewIssuePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: projectsData } = useSWR("/api/projects", fetcher);
  const { data: teamData } = useSWR("/api/team", fetcher);
  
  const projects = projectsData?.data || [];
  const team = teamData?.data || [];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      title: formData.get("title"),
      project_id: formData.get("project_id"),
      priority: formData.get("priority"),
      status: formData.get("status"),
      due_date: formData.get("due_date"),
      owner: formData.get("owner"),
    };

    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to create issue");
      }

      router.push("/dashboard/issues");
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link 
          href="/dashboard/issues"
          className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">แจ้งปัญหาใหม่</h2>
          <p className="text-gray-500">บันทึกรายละเอียดปัญหา หรือ RFI ที่ต้องการติดตาม</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              หัวข้อปัญหา / RFI <span className="text-red-500">*</span>
            </label>
            <input 
              name="title"
              required
              placeholder="เช่น รอยร้าวที่ผนังชั้น 2, ขอสเปคสีกระเบื้อง"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none transition"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                โครงการ <span className="text-red-500">*</span>
              </label>
              <select 
                name="project_id"
                required
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none transition"
              >
                <option value="">-- เลือกโครงการ --</option>
                {projects.map((p: any) => (
                  <option key={p.project_id} value={p.project_id}>{p.project_id} - {p.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ความสำคัญ <span className="text-red-500">*</span>
              </label>
              <select 
                name="priority"
                required
                defaultValue="Medium"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none transition"
              >
                <option value="High">ด่วนมาก (High)</option>
                <option value="Medium">ปานกลาง (Medium)</option>
                <option value="Low">ต่ำ (Low)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                สถานะ <span className="text-red-500">*</span>
              </label>
              <select 
                name="status"
                required
                defaultValue="Open"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none transition"
              >
                <option value="Open">เปิด (Open)</option>
                <option value="In Progress">กำลังดำเนินการ (In Progress)</option>
                <option value="Resolved">แก้ไขแล้ว (Resolved)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ผู้รับผิดชอบ
              </label>
              <select 
                name="owner"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none transition"
              >
                <option value="">-- ไม่ระบุ --</option>
                {team.map((t: any) => (
                  <option key={t.member_id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              กำหนดเสร็จ
            </label>
            <input 
              type="date"
              name="due_date"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none transition"
            />
          </div>

          <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
            <Link 
              href="/dashboard/issues"
              className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition"
            >
              ยกเลิก
            </Link>
            <button 
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 transition disabled:opacity-70"
            >
              <Save size={20} />
              {loading ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
