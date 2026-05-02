"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, User } from "lucide-react";
import Link from "next/link";

export default function CreateTeamPage() {
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
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "Failed to create team member");
      }

      router.push("/dashboard/team");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/team" className="p-2 bg-white rounded-xl border border-gray-200 text-gray-500 hover:text-gray-900 transition">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">เพิ่มพนักงานใหม่</h2>
          <p className="text-gray-500">กรอกข้อมูลพนักงานเพื่อสร้างรหัสเข้าใช้งานระบบ</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">ชื่อ-นามสกุล</label>
              <input 
                name="name"
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
                placeholder="สมชาย ใจดี"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">อีเมล (สำหรับเข้าสู่ระบบ)</label>
                <input 
                  name="email"
                  type="email"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
                  placeholder="somchai@example.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">รหัสผ่าน (PIN)</label>
                <input 
                  name="password"
                  type="text"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
                  placeholder="รหัสผ่าน 6 หลัก หรือรหัสลับ"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">เบอร์โทรศัพท์</label>
                <input 
                  name="phone"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
                  placeholder="08X-XXX-XXXX"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">ตำแหน่ง (Role)</label>
                <select 
                  name="role"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition bg-white"
                >
                  <option value="Engineer">Engineer (วิศวกร)</option>
                  <option value="Project Manager">Project Manager (ผู้จัดการโครงการ)</option>
                  <option value="Admin">Admin (ผู้ดูแลระบบ)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-gray-100 flex justify-end">
            <button 
              disabled={loading}
              type="submit"
              className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition disabled:opacity-70 disabled:cursor-wait"
            >
              {loading ? <span className="animate-spin text-xl">↻</span> : <Save size={20} />}
              {loading ? "กำลังบันทึก..." : "บันทึกข้อมูลพนักงาน"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
