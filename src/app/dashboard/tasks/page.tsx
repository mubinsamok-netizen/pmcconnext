import { findAll } from "@/lib/sheetsCrud";
import TaskBoard from "./TaskBoard";
import { CheckSquare } from "lucide-react";

export default async function TasksPage() {
  let projects: any[] = [];
  let team: any[] = [];
  let error: string | null = null;

  try {
    const [projRes, teamRes] = await Promise.all([
      findAll("Projects"),
      findAll("Team")
    ]);
    projects = projRes;
    team = teamRes;
  } catch (e: any) {
    console.error("Failed to fetch initial data for tasks:", e);
    error = "ไม่สามารถเชื่อมต่อกับ Google Sheets ได้";
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-orange-100 text-orange-600 rounded-xl">
          <CheckSquare size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">ติดตามงาน (Task Tracker)</h2>
          <p className="text-gray-500">จัดการและติดตามสถานะงานในแต่ละโครงการ</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
          {error}
        </div>
      )}

      {projects.length === 0 && !error ? (
        <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-200 border-dashed flex-1 flex items-center justify-center">
          ยังไม่มีโครงการในระบบ กรุณาสร้างโครงการก่อน
        </div>
      ) : (
        <TaskBoard projects={projects} team={team} />
      )}
    </div>
  );
}
