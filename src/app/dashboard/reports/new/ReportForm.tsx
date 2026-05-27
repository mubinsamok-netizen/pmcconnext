"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, UploadCloud, X } from "lucide-react";

type ProjectOption = {
  project_id: string;
  name?: string;
  drive_folder_id?: string;
};

export default function ReportForm({ projects }: { projects: ProjectOption[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selected]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    // Append files separately
    files.forEach((file) => {
      formData.append("photos", file);
    });

    // Find the drive_folder_id for the selected project
    const selectedProjectId = formData.get("project_id");
    const proj = projects.find(p => p.project_id === selectedProjectId);
    if (proj && proj.drive_folder_id) {
      formData.append("project_drive_folder_id", proj.drive_folder_id);
    }

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        body: formData, // FormData handles the multipart/form-data boundary automatically
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "Failed to submit report");
      }

      router.push("/dashboard/reports");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit report");
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 col-span-1 md:col-span-2">
            <label className="text-sm font-semibold text-gray-700">เลือกโครงการ</label>
            <select 
              name="project_id"
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition bg-white"
            >
              <option value="">-- เลือกโครงการ --</option>
              {projects.map((p, i) => (
                <option key={i} value={p.project_id}>
                  {p.project_id} - {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">วันที่รายงาน</label>
            <input 
              name="date"
              type="date"
              required
              defaultValue={new Date().toISOString().split("T")[0]}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">สภาพอากาศ</label>
            <select 
              name="weather"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition bg-white"
            >
              <option value="แจ่มใส">แจ่มใส (Sunny)</option>
              <option value="มีเมฆมาก">มีเมฆมาก (Cloudy)</option>
              <option value="ฝนตกปรอยๆ">ฝนตกปรอยๆ (Light Rain)</option>
              <option value="ฝนตกหนัก">ฝนตกหนัก (Heavy Rain)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">จำนวนคนงาน (รวม)</label>
            <input 
              name="workers"
              type="number"
              required
              min="0"
              step="any"
              inputMode="decimal"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
              placeholder="จำนวนคน"
            />
          </div>

          <div className="space-y-2 col-span-1 md:col-span-2">
            <label className="text-sm font-semibold text-gray-700">รายละเอียดงานที่ทำวันนี้</label>
            <textarea 
              name="work_done"
              required
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition resize-none"
              placeholder="1. งานเทคอนกรีตฐานราก&#10;2. งานผูกเหล็กเสา..."
            />
          </div>

          <div className="space-y-2 col-span-1 md:col-span-2">
            <label className="text-sm font-semibold text-gray-700">ปัญหา / อุปสรรค (ถ้ามี)</label>
            <textarea 
              name="issues"
              rows={2}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition resize-none"
              placeholder="ฝนตกหนักช่วงบ่าย ทำให้งานเทคอนกรีตล่าช้า"
            />
          </div>

          <div className="space-y-2 col-span-1 md:col-span-2">
            <label className="text-sm font-semibold text-gray-700">แนบรูปถ่ายหน้างาน</label>
            <label className="relative block cursor-pointer rounded-xl border-2 border-dashed border-gray-300 p-6 text-center transition hover:bg-gray-50">
              <input 
                type="file" 
                multiple 
                accept="image/*"
                onChange={handleFileChange}
                className="sr-only"
              />
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <span className="attach-file-button">
                  <UploadCloud />
                  แนบรูป
                </span>
                <p className="text-xs">รองรับไฟล์ JPG, PNG, WEBP</p>
              </div>
            </label>
            
            {files.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                {files.map((file, i) => (
                  <div key={i} className="relative bg-gray-100 rounded-lg p-2 text-xs text-gray-600 flex items-center justify-between border border-gray-200">
                    <span className="truncate max-w-[80%]">{file.name}</span>
                    <button 
                      type="button" 
                      onClick={() => removeFile(i)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pt-6 border-t border-gray-100 flex justify-end">
          <button 
            disabled={loading}
            type="submit"
            className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition disabled:opacity-70 disabled:cursor-wait"
          >
            {loading ? <span className="animate-spin text-xl">↻</span> : <Save size={20} />}
            {loading ? "กำลังบันทึกและอัปโหลด..." : "บันทึกรายงาน"}
          </button>
        </div>
      </form>
    </div>
  );
}
