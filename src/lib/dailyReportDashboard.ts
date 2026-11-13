import { findAllRaw } from "@/lib/sheetsCrud";
import { getSupabaseDailyReports } from "@/lib/supabaseReadModel";
import { isSupabaseBackend, readWithSheetsFallback } from "@/lib/supabaseRest";

type ReportRow = Record<string, string | number | undefined>;
const DASHBOARD_FIELDS = [
  "report_id", "project_id", "date", "weather", "workers", "photos_folder_id",
  "document_no", "prepared_by_name", "pdf_url", "photos_month_folder_id", "line_status", "line_error",
] as const;

// This read is only for the daily dashboard; full report and write paths stay unchanged.
export async function readDailyReportDashboard(projectId: string, sheetId: string): Promise<ReportRow[]> {
  const readSheets = () => findAllRaw("Daily_Reports", sheetId);
  const rows = isSupabaseBackend()
    ? await readWithSheetsFallback("daily_reports_dashboard", () => getSupabaseDailyReports(projectId, false, false, true), readSheets)
    : await readSheets();

  return rows
    .filter((row) => row.project_id === projectId)
    .map((row) => Object.fromEntries(DASHBOARD_FIELDS.map((field) => [field, row[field]])))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}
