import { findAllMaster } from "@/lib/sheetsCrud";
import { ensureMasterSchema } from "@/lib/sheetsSetup";
import { isSupabaseBackend } from "@/lib/supabaseRest";
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
        <SchedulePlanner projects={projects} showPageHeader />
      )}
    </div>
  );
}
