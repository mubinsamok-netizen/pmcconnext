import { findAllMaster } from "@/lib/sheetsCrud";
import { ensureMasterSchema } from "@/lib/sheetsSetup";
import { isSupabaseBackend } from "@/lib/supabaseRest";
import { CalendarRange } from "lucide-react";
import SchedulePlanner from "./SchedulePlanner";

export const dynamic = "force-dynamic";

type Project = {
  project_id: string;
  name: string;
  client?: string;
  start_date?: string;
  end_date?: string;
};

export default async function SchedulePage() {
  let projects: Project[] = [];
  let error: string | null = null;

  try {
    if (!isSupabaseBackend()) await ensureMasterSchema();
    projects = await findAllMaster("Projects") as unknown as Project[];
  } catch (e: unknown) {
    console.error("Failed to fetch projects for schedule:", e);
    error = "ไม่สามารถเชื่อมต่อกับ Google Sheets ได้";
  }

  return (
    <div className="max-w-[1680px] mx-auto space-y-6">
      <div className="schedule-screen-only flex items-center gap-3">
        <div className="p-2 bg-orange-100 text-orange-600 rounded-xl">
          <CalendarRange size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">แผนงานโครงการ (Gantt & Milestone)</h2>
          <p className="text-gray-500">วางแผนงานรายไซต์ กำหนด Milestone เอง และพิมพ์เอกสารพร้อมโลโก้บริษัท</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
          {error}
        </div>
      )}

      {projects.length === 0 && !error ? (
        <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-200 border-dashed">
          ยังไม่มีโครงการในระบบ กรุณาสร้างโครงการก่อน
        </div>
      ) : (
        <SchedulePlanner projects={projects} />
      )}
    </div>
  );
}
