import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { findOrCreateFolder } from "@/lib/drive";
import { getMasterProjects, type MasterProject } from "@/lib/masterProjects";
import { createPdfReportFile } from "@/lib/reportPdf";
import { findAll, findAllBatch, insert } from "@/lib/sheetsCrud";
import { ensureSchema } from "@/lib/sheetsSetup";
import { getProjectContext } from "@/lib/siteContext";
import { buildWeeklyReportHtml, stringifyWeeklyRows, type WeeklyReportPayload, type WeeklyReportTableRow } from "@/lib/weeklyReports";

type SheetRecord = Record<string, string | number | undefined>;
type ProjectContext = MasterProject & { line_group_id?: string; line_group_name?: string; line_notify_enabled?: string };

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getWeekKey(date: string) {
  const parsed = new Date(`${date}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  const start = new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  const dayNum = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(start.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((start.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${start.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function isWithinRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

function firstText(row: SheetRecord, keys: string[]) {
  for (const key of keys) {
    const value = String(row[key] || "").trim();
    if (value) return value;
  }
  return "";
}

function dateText(row: SheetRecord, keys: string[]) {
  const value = firstText(row, keys);
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}

function rowDateInRange(row: SheetRecord, start: string, end: string, keys: string[]) {
  const date = dateText(row, keys);
  return Boolean(date && isWithinRange(date, start, end));
}

function moneyText(value?: string | number) {
  const numeric = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numeric) || numeric === 0) return "";
  return `${new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(numeric)} บาท`;
}

function safeJsonRows(value?: string | number) {
  if (!value || typeof value !== "string") return [] as WeeklyReportTableRow[];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => row && typeof row === "object") as WeeklyReportTableRow[];
  } catch {
    return [];
  }
}

function groupSum(rows: WeeklyReportTableRow[], keyField: string, qtyField: string, targetQtyField: string, extra: Record<string, string> = {}) {
  const grouped = new Map<string, WeeklyReportTableRow>();
  rows.forEach((row) => {
    const key = String(row[keyField] || "").trim();
    if (!key) return;
    const current = grouped.get(key) || { [keyField]: key, ...extra, [targetQtyField]: "0" };
    const nextQty = Number(current[targetQtyField] || 0) + (Number(row[qtyField] || 0) || 0);
    grouped.set(key, { ...current, ...row, [targetQtyField]: String(nextQty) });
  });
  return Array.from(grouped.values());
}

function createWeeklyDocumentNo(projectId: string, weekStart: string, reports: SheetRecord[]) {
  const weekKey = getWeekKey(weekStart);
  const prefix = `WR-${projectId}-${weekKey}-`;
  const sameWeekCount = reports.filter((report) => String(report.document_no || "").startsWith(prefix)).length;
  return `${prefix}${String(sameWeekCount + 1).padStart(3, "0")}`;
}

function getProjectLocation(project?: ProjectContext) {
  return [project?.address, project?.district, project?.province].filter(Boolean).join(" ");
}

async function getProject(projectId: string) {
  try {
    const projects = await getMasterProjects() as ProjectContext[];
    return projects.find((project) => project.project_id === projectId);
  } catch (error) {
    console.warn("Failed to load master project for weekly report context:", error);
    return undefined;
  }
}

function taskDateInRange(task: SheetRecord, weekStart: string, weekEnd: string) {
  const start = String(task.start || task.planned_start || "");
  const end = String(task.end || task.planned_end || start);
  if (!start && !end) return false;
  return (!end || end >= weekStart) && (!start || start <= weekEnd);
}

function buildProgressFromTasks(tasks: SheetRecord[]) {
  const workTasks = tasks.filter((task) => task.task_type !== "heading");
  return workTasks.map((task) => {
    const planned = task.percent_done ? String(task.percent_done) : "0";
    const actual = task.percent_done ? String(task.percent_done) : "0";
    return {
      category: String(task.category || task.name || "งานทั่วไป"),
      planned_percent: planned,
      actual_percent: actual,
      variance: "0",
      status: String(task.status || "-"),
      note: String(task.notes || ""),
    };
  });
}

function buildWorkQuantitiesFromTasks(tasks: SheetRecord[]) {
  return tasks.filter((task) => task.task_type !== "heading").map((task) => ({
    category: String(task.category || "งานทั่วไป"),
    item: String(task.name || "-"),
    planned: String(task.weight || task.duration_days || ""),
    this_week: String(task.percent_done || ""),
    cumulative: String(task.percent_done || ""),
    unit: task.percent_done ? "%" : "",
    note: String(task.notes || ""),
  }));
}

function buildInstructionsFromExistingData({
  dailyReports,
  defectItems,
  memos,
}: {
  dailyReports: SheetRecord[];
  defectItems: SheetRecord[];
  memos: SheetRecord[];
}) {
  const dailyInstructions = dailyReports
    .filter((report) => report.issues || report.solutions)
    .map((report) => ({
      date: String(report.date || ""),
      description: [report.issues, report.solutions].filter(Boolean).join(" / "),
      ordered_by: "Daily Report",
      impact: "",
      status: report.solutions ? "resolved/follow-up" : "pending",
    }));

  const defectInstructions = defectItems.map((item) => ({
    date: dateText(item, ["reported_date", "due_date", "created_at"]),
    description: `Defect ${firstText(item, ["item_no", "item_id"])}: ${firstText(item, ["description", "remarks"])}`,
    ordered_by: firstText(item, ["owner", "created_by_name"]) || "Defect",
    impact: firstText(item, ["zone", "discipline", "work_category", "due_date"]),
    status: String(item.status || "-"),
  }));

  const memoInstructions = memos.map((memo) => ({
    date: dateText(memo, ["event_date", "issue_date", "created_at"]),
    description: `${firstText(memo, ["document_no", "memo_id"])}: ${firstText(memo, ["title", "detail"])}`,
    ordered_by: firstText(memo, ["prepared_by_name", "prepared_by_email"]) || "Memo",
    impact: memo.has_time_impact === "TRUE" || memo.has_time_impact === "true"
      ? `Time impact ${String(memo.extension_days || 0)} days`
      : firstText(memo, ["related_module", "memo_type"]),
    status: String(memo.status || "-"),
  }));

  return [...dailyInstructions, ...defectInstructions, ...memoInstructions];
}

function buildApprovalsFromExistingData({
  variationOrders,
  documents,
}: {
  variationOrders: SheetRecord[];
  documents: SheetRecord[];
}) {
  const voRows = variationOrders.map((vo) => ({
    document_no: firstText(vo, ["vo_id", "document_no"]),
    type: `VO ${String(vo.vo_type || "")}`.trim(),
    subject: firstText(vo, ["title", "description"]),
    submitted_date: dateText(vo, ["created_at", "updated_at", "approval_deadline"]),
    status: String(vo.status || "-"),
    owner: firstText(vo, ["created_by_name", "created_by_email", "client_name"]),
    note: [moneyText(vo.grand_total), vo.extension_days ? `extension ${vo.extension_days} days` : ""].filter(Boolean).join(" / "),
  }));

  const documentRows = documents.map((document) => ({
    document_no: firstText(document, ["document_id", "version_number"]),
    type: firstText(document, ["category", "mime_type"]) || "Document",
    subject: firstText(document, ["title", "file_name"]),
    submitted_date: dateText(document, ["created_at", "updated_at"]),
    status: "uploaded",
    owner: firstText(document, ["uploaded_by_name", "uploaded_by_email"]),
    note: firstText(document, ["notes", "drive_url"]),
  }));

  return [...voRows, ...documentRows];
}

async function buildWeeklyPayload({
  projectId,
  weekStart,
  weekEnd,
  sheetId,
  project,
  sessionUser,
  documentNo = "PREVIEW",
  reportId = "PREVIEW",
}: {
  projectId: string;
  weekStart: string;
  weekEnd: string;
  sheetId: string;
  project?: ProjectContext;
  sessionUser?: { name?: string | null; email?: string | null };
  documentNo?: string;
  reportId?: string;
}): Promise<WeeklyReportPayload> {
  const rows = await findAllBatch([
    "Daily_Reports",
    "Tasks",
    "Defect_Items",
    "Variation_Orders",
    "Site_Memos",
    "Project_Documents",
  ], sheetId) as Record<string, SheetRecord[]>;
  const allDaily = rows.Daily_Reports || [];
  const allTasks = rows.Tasks || [];
  const allDefectItems = rows.Defect_Items || [];
  const allVariationOrders = rows.Variation_Orders || [];
  const allMemos = rows.Site_Memos || [];
  const allDocuments = rows.Project_Documents || [];
  const dailyReports = allDaily
    .filter((report) => report.project_id === projectId && isWithinRange(String(report.date || ""), weekStart, weekEnd))
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const weeklyTasks = allTasks.filter((task) => task.project_id === projectId && taskDateInRange(task, weekStart, weekEnd));
  const weeklyDefectItems = allDefectItems.filter((item) => item.project_id === projectId && rowDateInRange(item, weekStart, weekEnd, ["reported_date", "due_date", "created_at", "updated_at"]));
  const weeklyVariationOrders = allVariationOrders.filter((vo) => vo.project_id === projectId && rowDateInRange(vo, weekStart, weekEnd, ["created_at", "updated_at", "approval_deadline", "due_date"]));
  const weeklyMemos = allMemos.filter((memo) => memo.project_id === projectId && rowDateInRange(memo, weekStart, weekEnd, ["event_date", "issue_date", "created_at", "updated_at"]));
  const weeklyDocuments = allDocuments.filter((document) => document.project_id === projectId && rowDateInRange(document, weekStart, weekEnd, ["created_at", "updated_at"]));

  const dailyMaterials = dailyReports.flatMap((report) => safeJsonRows(report.materials_json));
  const dailyMachinery = dailyReports.flatMap((report) => safeJsonRows(report.machinery_json));
  const dailyPersonnel = dailyReports.flatMap((report) => safeJsonRows(report.personnel_json));
  const preparedAt = new Date().toISOString();

  return {
    report_id: reportId,
    document_no: documentNo,
    project_id: projectId,
    project_name: project?.name || projectId,
    project_location: getProjectLocation(project),
    project_start_date: project?.start_date || "",
    project_end_date: project?.end_date || "",
    project_owner: project?.client || "",
    week_start: weekStart,
    week_end: weekEnd,
    work_quantities: buildWorkQuantitiesFromTasks(weeklyTasks),
    materials: groupSum(dailyMaterials, "name", "qty", "this_week").map((row) => ({ ...row, cumulative: row.this_week || "", unit: row.unit || "" })),
    machinery: groupSum(dailyMachinery, "name", "qty", "qty").map((row) => ({ ...row, usage: row.hours || "", note: row.note || "" })),
    personnel: groupSum(dailyPersonnel, "role", "qty", "avg_qty").map((row) => ({ ...row, work_days: String(dailyReports.length), note: row.note || "" })),
    progress: buildProgressFromTasks(weeklyTasks),
    instructions: buildInstructionsFromExistingData({
      dailyReports,
      defectItems: weeklyDefectItems,
      memos: weeklyMemos,
    }),
    approvals: buildApprovalsFromExistingData({
      variationOrders: weeklyVariationOrders,
      documents: weeklyDocuments,
    }),
    daily_summaries: dailyReports.map((report) => ({
      date: String(report.date || ""),
      weather: String(report.weather || ""),
      workers: String(report.workers || ""),
      work_done: String(report.work_done || ""),
      issues: [report.issues, report.solutions].filter(Boolean).join(" / "),
    })),
    field_engineer_name: sessionUser?.name || sessionUser?.email || "",
    field_engineer_email: sessionUser?.email || "",
    field_engineer_position: "วิศวกรสนาม",
    project_manager_name: project?.pm_name || "Project Manager",
    prepared_at: preparedAt,
  };
}

async function createPdf(html: string, documentNo: string, pdfFolderId: string) {
  return await createPdfReportFile({ html, documentNo, pdfFolderId });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project_id");
    const weekStart = searchParams.get("week_start");
    const weekEnd = searchParams.get("week_end");
    const mode = searchParams.get("mode");
    const { sheetId } = await getProjectContext(projectId);
    await ensureSchema(sheetId);

    if (mode === "summary" && projectId && weekStart && weekEnd) {
      const session = await getServerSession(authOptions);
      const project = await getProject(projectId);
      const payload = await buildWeeklyPayload({
        projectId,
        weekStart,
        weekEnd,
        sheetId,
        project,
        sessionUser: session?.user,
      });
      return NextResponse.json({ success: true, data: payload });
    }

    let reports = await findAll("Weekly_Reports", sheetId) as SheetRecord[];
    if (projectId) reports = reports.filter((report) => report.project_id === projectId);
    reports = reports.sort((a, b) => String(b.week_start || "").localeCompare(String(a.week_start || "")));
    return NextResponse.json({ success: true, data: reports });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const projectId = getText(formData, "project_id");
    const weekStart = getText(formData, "week_start");
    const weekEnd = getText(formData, "week_end");
    if (!projectId || !weekStart || !weekEnd) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    const project = await getProject(projectId);
    const { sheetId, driveFolderId } = await getProjectContext(projectId);
    await ensureSchema(sheetId);
    const targetDriveFolderId = project?.drive_folder_id || driveFolderId;
    if (!targetDriveFolderId) return NextResponse.json({ error: "Project Drive folder is not configured" }, { status: 400 });

    const existingReports = await findAll("Weekly_Reports", sheetId) as SheetRecord[];
    const documentNo = createWeeklyDocumentNo(projectId, weekStart, existingReports);
    const reportId = `WREP-${Date.now().toString().slice(-8)}`;
    const payload = await buildWeeklyPayload({
      projectId,
      weekStart,
      weekEnd,
      sheetId,
      project,
      sessionUser: session.user,
      documentNo,
      reportId,
    });

    const weeklyFolder = await findOrCreateFolder("Weekly Reports", targetDriveFolderId);
    if (!weeklyFolder.id) throw new Error("Failed to create Weekly Reports folder");
    const weekFolder = await findOrCreateFolder(getWeekKey(weekStart), weeklyFolder.id);
    if (!weekFolder.id) throw new Error("Failed to create weekly period folder");
    const pdfFolder = await findOrCreateFolder("PDF", weekFolder.id);
    if (!pdfFolder.id) throw new Error("Failed to create weekly PDF folder");

    const pdfFile = await createPdf(buildWeeklyReportHtml(payload), documentNo, pdfFolder.id);
    const pdfUrl = pdfFile.webViewLink || pdfFile.webContentLink || "";

    const reportData = {
      report_id: reportId,
      project_id: projectId,
      week_start: weekStart,
      week_end: weekEnd,
      document_no: documentNo,
      project_name: payload.project_name,
      project_location: payload.project_location,
      project_start_date: payload.project_start_date,
      project_end_date: payload.project_end_date,
      project_owner: payload.project_owner,
      work_quantities_json: stringifyWeeklyRows(payload.work_quantities),
      materials_json: stringifyWeeklyRows(payload.materials),
      machinery_json: stringifyWeeklyRows(payload.machinery),
      personnel_json: stringifyWeeklyRows(payload.personnel),
      progress_json: stringifyWeeklyRows(payload.progress),
      instructions_json: stringifyWeeklyRows(payload.instructions),
      approvals_json: stringifyWeeklyRows(payload.approvals),
      field_engineer_name: payload.field_engineer_name,
      field_engineer_email: payload.field_engineer_email,
      field_engineer_position: payload.field_engineer_position,
      project_manager_name: payload.project_manager_name,
      prepared_at: payload.prepared_at,
      pdf_folder_id: pdfFolder.id,
      pdf_file_id: pdfFile.id || "",
      pdf_url: pdfUrl,
    };

    const result = await insert("Weekly_Reports", reportData, sheetId);
    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: unknown) {
    console.error("Failed to create weekly report:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
