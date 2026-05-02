"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Building2 } from "lucide-react";
import Link from "next/link";

export default function CreateProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "Failed to create project");
      }

      router.push("/dashboard/projects");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/projects" className="p-2 bg-white rounded-xl border border-gray-200 text-gray-500 hover:text-gray-900 transition">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">สร้างโครงการใหม่</h2>
          <p className="text-gray-500">กรอกข้อมูลเพื่อเริ่มต้นโครงการและสร้าง Drive โฟลเดอร์</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">รหัสโครงการ (Project ID)</label>
              <input 
                name="project_id"
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
                placeholder="เช่น PCM-2026-001"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">ชื่อโครงการ</label>
              <input 
                name="name"
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
                placeholder="เช่น ก่อสร้างอาคารโกดังสินค้า"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">ลูกค้า / เจ้าของโครงการ</label>
              <input 
                name="client"
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
                placeholder="ชื่อบริษัทหรือบุคคล"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">งบประมาณ (Budget)</label>
              <input 
                name="budget"
                type="number"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
                placeholder="ใส่ตัวเลขเท่านั้น"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">วันที่เริ่มต้น</label>
              <input 
                name="start_date"
                type="date"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">วันที่สิ้นสุด (คาดการณ์)</label>
              <input 
                name="end_date"
                type="date"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
              />
            </div>
          </div>

          <div className="pt-6 border-t border-gray-100 flex justify-end">
            <button 
              disabled={loading}
              type="submit"
              className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition disabled:opacity-70 disabled:cursor-wait"
            >
              {loading ? <span className="animate-spin text-xl">↻</span> : <Save size={20} />}
              {loading ? "กำลังสร้างและจัดเตรียม Drive..." : "บันทึกโครงการ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
