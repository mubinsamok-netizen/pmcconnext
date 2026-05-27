import { findAllMaster } from "@/lib/sheetsCrud";
import { ensureMasterSchema } from "@/lib/sheetsSetup";
import { isSupabaseBackend } from "@/lib/supabaseRest";
import ReportForm from "./ReportForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

type Project = {
  project_id: string;
  name?: string;
};

export default async function NewReportPage() {
  let projects: Project[] = [];
  
  try {
    if (!isSupabaseBackend()) await ensureMasterSchema();
    projects = await findAllMaster("Projects") as unknown as Project[];
  } catch (e) {
    console.error("Failed to fetch projects for report form:", e);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/reports" className="p-2 bg-white rounded-xl border border-gray-200 text-gray-500 hover:text-gray-900 transition">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">สร้างรายงานประจำวัน</h2>
          <p className="text-gray-500">บันทึกผลการปฏิบัติงาน ปัญหา และแนบรูปถ่ายหน้างาน</p>
        </div>
      </div>

      <ReportForm projects={projects} />
    </div>
  );
}
