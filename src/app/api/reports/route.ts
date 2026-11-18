import { after, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { buildDailyReportHtml, buildDailyReportLineFlex, parseJsonRows, stringifyRows, type DailyReportPayload } from "@/lib/dailyReports";
import { findOrCreateFolder } from "@/lib/drive";
import { sendLineMessages } from "@/lib/line";
import { getMasterProjects, type MasterProject } from "@/lib/masterProjects";
import { createPdfReportFile } from "@/lib/reportPdf";
import { findAll, insert, update } from "@/lib/sheetsCrud";
import { ensureSchema } from "@/lib/sheetsSetup";
import { getProjectContext } from "@/lib/siteContext";
import { isSupabaseBackend } from "@/lib/supabaseRest";
import { getSiteApiContext } from "@/lib/siteApi";
import { readDailyReportDashboard } from "@/lib/dailyReportDashboard";

type ReportRecord = Record<string, string | number | undefined>;
type ProjectWithLine = MasterProject & {
  line_group_id?: string;
  line_group_name?: string;
  line_notify_enabled?: string;
};

const FALLBACK_LINE_GROUP_ID = process.env.LINE_GROUP_ID || "";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getMonthKey(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : new Date().toISOString().slice(0, 7);
}

function getProjectLocation(project?: ProjectWithLine) {
  return [project?.address, project?.district, project?.province].filter(Boolean).join(" ");
}

function getProjectOwner(project?: ProjectWithLine) {
  return project?.client || "";
}

function getPreparedPosition(sessionUser: { role?: string | null } | undefined) {
  return sessionUser?.role || "ผู้จัดทำรายงาน";
}

function sumPersonnel(personnel: Record<string, string>[]) {
  const total = personnel.reduce((sum, row) => {
    const qty = Number(row.qty || 0);
    return sum + (Number.isFinite(qty) ? qty : 0);
  }, 0);
  return total > 0 ? String(total) : "";
}

function createDocumentNo(projectId: string, date: string, reports: ReportRecord[]) {
  const monthKey = getMonthKey(date).replace("-", "");
  const prefix = `DR-${projectId}-${monthKey}-`;
  const sameMonthCount = reports.filter((report) => {
    const documentNo = String(report.document_no || "");
    if (documentNo.startsWith(prefix)) return true;
    return String(report.project_id || "") === projectId && String(report.date || "").startsWith(getMonthKey(date));
  }).length;

  return `${prefix}${String(sameMonthCount + 1).padStart(3, "0")}`;
}

async function getProject(projectId: string) {
  try {
    const projects = await getMasterProjects() as ProjectWithLine[];
    return projects.find((project) => project.project_id === projectId);
  } catch (error) {
    console.warn("Failed to load master project for report context:", error);
    return undefined;
  }
}

async function buildReportFiles(report: DailyReportPayload, targetDriveFolderId: string) {
  const dailyFolder = await findOrCreateFolder("Daily Reports", targetDriveFolderId);
  if (!dailyFolder.id) throw new Error("Failed to create Daily Reports folder");
  const monthFolder = await findOrCreateFolder(getMonthKey(report.date), dailyFolder.id);
  if (!monthFolder.id) throw new Error("Failed to create monthly report folder");
  const [pdfFolder, photosFolder] = await Promise.all([
    findOrCreateFolder("PDF", monthFolder.id),
    findOrCreateFolder("Photos", monthFolder.id),
  ]);
  if (!pdfFolder.id || !photosFolder.id) throw new Error("Failed to create report subfolders");

  const pdfFile = await createPdfReportFile({
    html: buildDailyReportHtml(report, [], 0),
    documentNo: report.document_no,
    pdfFolderId: pdfFolder.id,
  });
  if (!pdfFile.id) throw new Error("Google Drive did not return a PDF file ID");

  return {
    pdf_folder_id: pdfFolder.id,
    pdf_file_id: pdfFile.id,
    pdf_url: pdfFile.webViewLink || pdfFile.webContentLink || `https://drive.google.com/file/d/${pdfFile.id}/view`,
    photos_folder_id: photosFolder.id,
    photos_month_folder_id: photosFolder.id,
  };
}

async function updateReport(report: DailyReportPayload, sheetId: string, patch: Record<string, string>) {
  await update("Daily_Reports", report.report_id, patch, sheetId, async () => {
    const rows = await findAll("Daily_Reports", sheetId) as ReportRecord[];
    return rows.find(row => row.report_id === report.report_id && row.project_id === report.project_id)?._rowIndex;
  }, report.project_id);
}

async function notifyReport(report: DailyReportPayload, files: Awaited<ReturnType<typeof buildReportFiles>>, groupId: string, sheetId: string) {
  let patch: Record<string, string>;
  try {
    if (!groupId) throw new Error("LINE group ID is not configured");
    const photosFolderUrl = `https://drive.google.com/drive/folders/${files.photos_month_folder_id}`;
    await sendLineMessages([buildDailyReportLineFlex({ report, pdfUrl: files.pdf_url, photosFolderUrl, photoCount: 0 })], groupId);
    patch = { line_status: "sent", line_sent_at: new Date().toISOString(), line_error: "" };
  } catch (error) {
    patch = { line_status: "failed", line_sent_at: "", line_error: getErrorMessage(error) };
    console.error("Failed to send LINE daily report:", error);
  }
  await updateReport(report, sheetId, patch);
  return patch;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project_id");
    if (searchParams.get("view") === "dashboard") {
      if (!projectId) return NextResponse.json({ error: "Missing project_id" }, { status: 400 });
      const context = await getSiteApiContext(projectId, false, { readOnly: true });
      if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
      const reports = await readDailyReportDashboard(context.project.project_id, context.siteSheetId);
      return NextResponse.json({ success: true, data: reports });
    }
    const { sheetId } = await getProjectContext(projectId);
    if (!isSupabaseBackend()) await ensureSchema(sheetId);

    let reports = await findAll("Daily_Reports", sheetId) as ReportRecord[];
    if (projectId) {
      reports = reports.filter((report) => report.project_id === projectId);
    }

    reports = reports.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return NextResponse.json({ success: true, data: reports });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let step = "เริ่มบันทึกรายงาน";
  try {
    step = "ตรวจสอบผู้ใช้งาน";
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    step = "อ่านข้อมูลจากฟอร์ม";
    const formData = await req.formData();
    const project_id = getText(formData, "project_id");
    const date = getText(formData, "date");
    const deferPdf = getText(formData, "defer_pdf") === "true";

    if (!project_id || !date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    step = "โหลดข้อมูลโครงการ";
    const site = deferPdf ? await getSiteApiContext(project_id, false, { readOnly: true }) : null;
    if (site && "error" in site) return NextResponse.json({ error: site.error }, { status: site.status });
    const project = site ? site.project as ProjectWithLine : await getProject(project_id);
    const { sheetId, driveFolderId } = site
      ? { sheetId: site.siteSheetId, driveFolderId: site.project.drive_folder_id }
      : await getProjectContext(project_id);
    step = "ตรวจสอบ schema ของ Google Sheets";
    if (!isSupabaseBackend()) await ensureSchema(sheetId);

    const targetDriveFolderId = project?.drive_folder_id || driveFolderId;
    if (!targetDriveFolderId && !deferPdf) {
      return NextResponse.json({ error: "Project Drive folder is not configured" }, { status: 400 });
    }

    step = "อ่านเลขรายงานเดิมจาก Google Sheets";
    const existingReports = await findAll("Daily_Reports", sheetId) as ReportRecord[];
    const document_no = createDocumentNo(project_id, date, existingReports);
    const report_id = `REP-${Date.now().toString().slice(-8)}`;
    const preparedAt = new Date().toISOString();
    const personnel = parseJsonRows(formData.get("personnel_json"));
    const machinery = parseJsonRows(formData.get("machinery_json"));
    const materials = parseJsonRows(formData.get("materials_json"));
    const workers = getText(formData, "workers") || sumPersonnel(personnel);

    const reportPayload: DailyReportPayload = {
      report_id,
      document_no,
      project_id,
      project_name: getText(formData, "project_name") || project?.name || project_id,
      project_location: getText(formData, "project_location") || getProjectLocation(project),
      project_start_date: getText(formData, "project_start_date") || project?.start_date || "",
      project_end_date: getText(formData, "project_end_date") || project?.end_date || "",
      project_owner: getText(formData, "project_owner") || getProjectOwner(project),
      date,
      weather: getText(formData, "weather"),
      workers,
      work_done: getText(formData, "work_done"),
      issues: getText(formData, "issues"),
      solutions: getText(formData, "solutions"),
      prepared_by_name: session.user.name || session.user.email || "",
      prepared_by_position: getPreparedPosition(session.user),
      prepared_by_email: session.user.email || "",
      prepared_at: preparedAt,
      personnel,
      machinery,
      materials,
    };

    const lineGroupId = String(project?.line_group_id || FALLBACK_LINE_GROUP_ID || "").trim();
    const lineEnabled = String(project?.line_notify_enabled ?? "").trim().toUpperCase() !== "FALSE";

    const baseReportData = {
      report_id,
      project_id,
      date,
      weather: reportPayload.weather,
      workers: reportPayload.workers,
      work_done: reportPayload.work_done,
      issues: reportPayload.issues,
      photos_folder_id: "",
      document_no,
      project_name: reportPayload.project_name,
      project_location: reportPayload.project_location,
      project_start_date: reportPayload.project_start_date,
      project_end_date: reportPayload.project_end_date,
      project_owner: reportPayload.project_owner,
      personnel_json: stringifyRows(personnel),
      machinery_json: stringifyRows(machinery),
      materials_json: stringifyRows(materials),
      solutions: reportPayload.solutions,
      prepared_by_name: reportPayload.prepared_by_name,
      prepared_by_position: reportPayload.prepared_by_position,
      prepared_by_email: reportPayload.prepared_by_email,
      prepared_at: preparedAt,
      photos_json: JSON.stringify([]),
      pdf_folder_id: "",
      pdf_file_id: "",
      pdf_url: "",
      photos_month_folder_id: "",
      line_group_id: lineGroupId,
      line_status: lineEnabled ? "pending" : "disabled",
      line_sent_at: "",
      line_error: "",
    };

    if (deferPdf) {
      step = "บันทึกข้อมูลรายงาน";
      await insert("Daily_Reports", baseReportData, sheetId);
      after(async () => {
        try {
          if (!targetDriveFolderId) throw new Error("Project Drive folder is not configured");
          const files = await buildReportFiles(reportPayload, targetDriveFolderId);
          await updateReport(reportPayload, sheetId, files);
          if (lineEnabled) await notifyReport(reportPayload, files, lineGroupId, sheetId);
        } catch (error) {
          console.error("Daily report background processing failed", { report_id, error });
        }
      });
      return NextResponse.json({ success: true, data: baseReportData });
    }

    step = "สร้างไฟล์ PDF รายงาน";
    const files = await buildReportFiles(reportPayload, targetDriveFolderId!);
    step = "บันทึกข้อมูลรายงาน";
    await insert("Daily_Reports", { ...baseReportData, ...files }, sheetId);
    const linePatch = lineEnabled ? await notifyReport(reportPayload, files, lineGroupId, sheetId) : {};
    return NextResponse.json({ success: true, data: { ...baseReportData, ...files, ...linePatch } });
  } catch (error: unknown) {
    console.error("Failed to create report:", error);
    return NextResponse.json({ error: `${step}: ${getErrorMessage(error)}` }, { status: 500 });
  }
}
