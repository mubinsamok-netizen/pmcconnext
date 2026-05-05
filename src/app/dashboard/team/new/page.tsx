"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { getAppRole } from "@/lib/roles";

type Project = {
  project_id: string;
  name: string;
};

type ProjectsResponse = {
  success: boolean;
  data: Project[];
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "ไม่สามารถบันทึกพนักงานได้";
}

export default function CreateTeamPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState("Engineer");
  const { data: projectsData, isLoading: projectsLoading } = useSWR<ProjectsResponse>("/api/projects", fetcher);
  const projects = projectsData?.data || [];

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const roleValue = getAppRole(String(formData.get("role") || role));
    const data = {
      ...Object.fromEntries(formData.entries()),
      project_ids: roleValue === "Admin" ? [] : formData.getAll("project_ids").map(String),
    };

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
    } catch (err: unknown) {
      setError(getErrorMessage(err));
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
          <p className="text-gray-500">บันทึกข้อมูลพนักงานและกำหนดสิทธิ์เข้าไซต์งานใน Master Sheet</p>
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
            <Field label="ชื่อ-นามสกุล">
              <input name="name" required className="form-input" placeholder="สมชาย ใจดี" />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="อีเมล (สำหรับเข้าสู่ระบบ)">
                <input name="email" type="email" required className="form-input" placeholder="somchai@example.com" />
              </Field>

              <Field label="รหัสผ่าน (PIN)">
                <input name="password" type="text" required className="form-input" placeholder="รหัสผ่าน 6 หลัก หรือรหัสลับ" />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="เบอร์โทรศัพท์">
                <input name="phone" className="form-input" placeholder="08X-XXX-XXXX" />
              </Field>

              <Field label="ตำแหน่ง (Role)">
                <select name="role" className="form-input bg-white" value={role} onChange={(event) => setRole(event.target.value)}>
                  <option value="Engineer">Engineer</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Admin">Admin</option>
                  <option value="Staff">Staff</option>
                </select>
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 p-4">
            <div className="mb-3">
              <h3 className="font-semibold text-gray-900">สิทธิ์เข้าถึงไซต์งาน</h3>
              <p className="text-sm text-gray-500">เลือกไซต์ที่พนักงานคนนี้รับผิดชอบ</p>
            </div>
            {getAppRole(role) === "Admin" ? (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                Admin เข้าได้ทุกไซต์โดยอัตโนมัติ ไม่ต้องเลือก project_ids
              </div>
            ) : projectsLoading ? (
              <div className="text-sm text-gray-500">กำลังโหลดไซต์งาน...</div>
            ) : projects.length === 0 ? (
              <div className="text-sm text-gray-400">ยังไม่มีไซต์งานใน Master Sheet</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {projects.map((project) => (
                  <label key={project.project_id} className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm hover:border-orange-200">
                    <input name="project_ids" type="checkbox" value={project.project_id} className="h-4 w-4 accent-orange-600" />
                    <span className="min-w-0">
                      <span className="block font-medium text-gray-800 truncate">{project.name}</span>
                      <span className="block text-xs text-gray-400">{project.project_id}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2 block">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      {children}
    </label>
  );
}
