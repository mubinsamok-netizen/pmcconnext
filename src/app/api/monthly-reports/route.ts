import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { findOrCreateFolder } from "@/lib/drive";
import { getMasterProjects, type MasterProject } from "@/lib/masterProjects";
import { buildMonthlyReportHtml, stringifyMonthlyRows, type MonthlyReportPayload, type MonthlyReportTableRow } from "@/lib/monthlyReports";
import { createPdfReportFile } from "@/lib/reportPdf";
import { findAll, findAllBatch, insert } from "@/lib/sheetsCrud";
import { ensureSchema } from "@/lib/sheetsSetup";
import { getProjectContext } from "@/lib/siteContext";

type SheetRecord = Record<string, string | number | undefined>;
type ProjectContext = MasterProject & { line_group_id?: string; line_group_name?: string; line_notify_enabled?: string };

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getMonthRange(month: string) {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (!year || monthIndex < 0 || monthIndex > 11) {
    const now = new Date();
    const fallbackMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return getMonthRange(fallbackMonth);
  }

  const start = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const endDate = new Date(year, monthIndex + 1, 0);
  const end = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { month: `${year}-${String(monthIndex + 1).padStart(2, "0")}`, start, end };
}

function addMonths(month: string, amount: number) {
  const [yearText, monthText] = month.split("-");
  const date = new Date(Number(yearText), Number(monthText) - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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

function overlapsRange(start: string, end: string, rangeStart: string, rangeEnd: string) {
  return (!end || end >= rangeStart) && (!start || start <= rangeEnd);
}

function safeJsonRows(value?: string | number) {
  if (!value || typeof value !== "string") return [] as MonthlyReportTableRow[];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => row && typeof row === "object") as MonthlyReportTableRow[];
  } catch {
    return [];
  }
}

function safeJsonStringArray(value?: string | number) {
  if (!value || typeof value !== "string") return [] as string[];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item || "")).filter(Boolean);
  } catch {
    return [];
  }
}

function numberValue(value?: string | number) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function moneyText(value?: string | number) {
  const numeric = numberValue(String(value || "").replace(/,/g, ""));
  if (!numeric) return "";
  return `${new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(numeric)} บาท`;
}

function groupByKey(rows: MonthlyReportTableRow[], keyField: string, qtyField: string, outputQtyField: string, extra: Record<string, string> = {}) {
  const grouped = new Map<string, MonthlyReportTableRow>();
  rows.forEach((row) => {
    const key = String(row[keyField] || "").trim();
    if (!key) return;
    const current = grouped.get(key) || { [keyField]: key, ...extra, [outputQtyField]: "0" };
    const total = numberValue(current[outputQtyField]) + numberValue(row[qtyField]);
    grouped.set(key, { ...current, ...row, [outputQtyField]: String(total) });
  });
  return Array.from(grouped.values());
}

function countByValue(rows: SheetRecord[], key: string) {
  const grouped = new Map<string, number>();
  rows.forEach((row) => {
    const value = String(row[key] || "-").trim() || "-";
    grouped.set(value, (grouped.get(value) || 0) + 1);
  });
  return Array.from(grouped.entries()).map(([weather, days]) => ({ weather, days: String(days) }));
}

function createMonthlyDocumentNo(projectId: string, month: string, reports: SheetRecord[]) {
  const prefix = `MR-${projectId}-${month.replace("-", "")}-`;
  const sameMonthCount = reports.filter((report) => String(report.document_no || "").startsWith(prefix)).length;
  return `${prefix}${String(sameMonthCount + 1).padStart(3, "0")}`;
}

function getProjectLocation(project?: ProjectContext) {
  return [project?.address, project?.district, project?.province].filter(Boolean).join(" ");
}

async function getProject(projectId: string) {
  try {
    const projects = await getMasterProjects() as ProjectContext[];
    return projects.find((project) => project.project_id === projectId);
  } catch (error) {
    console.warn("Failed to load master project for monthly report context:", error);
    return undefined;
  }
}

function taskDateInRange(task: SheetRecord, startDate: string, endDate: string) {
  const start = String(task.start || task.planned_start || "");
  const end = String(task.end || task.planned_end || start);
  if (!start && !end) return false;
  return overlapsRange(start, end, startDate, endDate);
}

function buildProgressFromTasks(tasks: SheetRecord[]) {
  return tasks.filter((task) => task.task_type !== "heading").map((task) => {
    const planned = String(task.percent_done || "0");
    const actual = String(task.percent_done || "0");
    return {
      category: String(task.category || "งานทั่วไป"),
      item: String(task.name || "-"),
      planned_percent: planned,
      actual_percent: actual,
      variance: "0",
      status: String(task.status || "-"),
      note: String(task.notes || ""),
    };
  });
}

function buildNextMonthPlanFromTasks(tasks: SheetRecord[]) {
  return tasks.filter((task) => task.task_type !== "heading").map((task) => {
    const start = String(task.start || task.planned_start || "");
    const end = String(task.end || task.planned_end || start);
    return {
      category: String(task.category || "งานทั่วไป"),
      item: String(task.name || "-"),
      period: [start, end].filter(Boolean).join(" - "),
      status: String(task.status || "-"),
      note: String(task.notes || ""),
    };
  });
}

function buildWeeklyRows(weeklyReports: SheetRecord[]) {
  return weeklyReports.map((report) => {
    const progress = safeJsonRows(report.progress_json);
    const issues = safeJsonRows(report.instructions_json);
    return {
      week_period: `${String(report.week_start || "-")} - ${String(report.week_end || "-")}`,
      document_no: String(report.document_no || report.report_id || "-"),
      progress_count: String(progress.length),
      issue_count: String(issues.length),
    };
  });
}

function getProgressRows(weeklyReports: SheetRecord[], fallbackTasks: SheetRecord[]) {
  const weeklyProgress = weeklyReports.flatMap((report) => safeJsonRows(report.progress_json));
  if (weeklyProgress.length > 0) {
    return weeklyProgress.map((row) => ({
      category: row.category || row.item || "งานทั่วไป",
      item: row.item || row.category || "-",
      planned_percent: row.planned_percent || "",
      actual_percent: row.actual_percent || "",
      variance: row.variance || "",
      status: row.status || "",
      note: row.note || "",
    }));
  }
  return buildProgressFromTasks(fallbackTasks);
}

function getIssues(dailyReports: SheetRecord[], weeklyReports: SheetRecord[]) {
  const dailyIssues = dailyReports
    .filter((report) => report.issues || report.solutions)
    .map((report) => ({
      date: String(report.date || ""),
      description: String(report.issues || "-"),
      solution: String(report.solutions || ""),
      status: report.solutions ? "ดำเนินการแล้ว/ติดตามผล" : "รอติดตาม",
    }));
  const weeklyIssues = weeklyReports.flatMap((report) => safeJsonRows(report.instructions_json))
    .map((row) => ({
      date: row.date || "",
      description: row.description || "",
      solution: row.solution || "",
      status: row.status || "",
    }));
  return [...dailyIssues, ...weeklyIssues];
}

function buildMonthlyIssuesFromExistingData({
  dailyReports,
  weeklyReports,
  defectItems,
  memos,
}: {
  dailyReports: SheetRecord[];
  weeklyReports: SheetRecord[];
  defectItems: SheetRecord[];
  memos: SheetRecord[];
}) {
  const currentIssues = getIssues(dailyReports, weeklyReports);
  const defectIssues = defectItems.map((item) => ({
    date: dateText(item, ["reported_date", "due_date", "created_at"]),
    description: `Defect ${firstText(item, ["item_no", "item_id"])}: ${firstText(item, ["description", "remarks"])}`,
    solution: firstText(item, ["repair_note", "remarks"]),
    status: String(item.status || "-"),
  }));
  const memoIssues = memos.map((memo) => ({
    date: dateText(memo, ["event_date", "issue_date", "created_at"]),
    description: `${firstText(memo, ["document_no", "memo_id"])}: ${firstText(memo, ["title", "detail"])}`,
    solution: firstText(memo, ["acknowledgement_note", "extension_reason"]),
    status: String(memo.status || "-"),
  }));

  return [...currentIssues, ...defectIssues, ...memoIssues];
}

function buildMonthlyApprovalsFromExistingData({
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
    status: String(vo.status || "-"),
    note: [moneyText(vo.grand_total), vo.extension_days ? `extension ${vo.extension_days} days` : "", dateText(vo, ["created_at", "approval_deadline"])].filter(Boolean).join(" / "),
  }));
  const documentRows = documents.map((document) => ({
    document_no: firstText(document, ["document_id", "version_number"]),
    type: firstText(document, ["category", "mime_type"]) || "Document",
    subject: firstText(document, ["title", "file_name"]),
    status: "uploaded",
    note: [dateText(document, ["created_at", "updated_at"]), firstText(document, ["notes", "drive_url"])].filter(Boolean).join(" / "),
  }));

  return [...voRows, ...documentRows];
}

function buildMonthlyInspectionsFromExistingData({
  defectRounds,
  defectItems,
}: {
  defectRounds: SheetRecord[];
  defectItems: SheetRecord[];
}) {
  const roundRows = defectRounds.map((round) => ({
    date: dateText(round, ["inspection_date", "issued_at", "created_at"]),
    item: `${firstText(round, ["document_no", "round_id"])}: ${firstText(round, ["title", "notes"])}`,
    result: String(round.status || "-"),
    note: [
      round.item_count ? `items ${round.item_count}` : "",
      round.open_count ? `open ${round.open_count}` : "",
      round.acknowledged_by ? `ack ${round.acknowledged_by}` : "",
    ].filter(Boolean).join(" / "),
  }));
  const itemRows = defectItems.map((item) => ({
    date: dateText(item, ["reported_date", "due_date", "created_at"]),
    item: `Defect ${firstText(item, ["item_no", "item_id"])}: ${firstText(item, ["description", "zone"])}`,
    result: String(item.status || "-"),
    note: [firstText(item, ["owner", "discipline", "work_category"]), item.due_date ? `due ${item.due_date}` : ""].filter(Boolean).join(" / "),
  }));

  return [...roundRows, ...itemRows];
}

function getPhotos(dailyReports: SheetRecord[]) {
  return dailyReports.flatMap((report) => {
    const photos = safeJsonStringArray(report.photos_json);
    if (photos.length === 0) return [];
    const folderId = String(report.photos_month_folder_id || report.photos_folder_id || "");
    return [{
      date: String(report.date || ""),
      document_no: String(report.document_no || report.report_id || "-"),
      count: String(photos.length),
      folder_url: folderId ? `https://drive.google.com/drive/folders/${folderId}` : photos[0],
    }];
  });
}

async function buildMonthlyPayload({
  projectId,
  month,
  sheetId,
  project,
  sessionUser,
  documentNo = "PREVIEW",
  reportId = "PREVIEW",
  preface,
  meetingSummary,
  nextMonthPlanNote,
}: {
  projectId: string;
  month: string;
  sheetId: string;
  project?: ProjectContext;
  sessionUser?: { name?: string | null; email?: string | null };
  documentNo?: string;
  reportId?: string;
  preface?: string;
  meetingSummary?: string;
  nextMonthPlanNote?: string;
}): Promise<MonthlyReportPayload> {
  const { month: normalizedMonth, start, end } = getMonthRange(month);
  const nextMonthRange = getMonthRange(addMonths(normalizedMonth, 1));
  const rows = await findAllBatch([
    "Daily_Reports",
    "Weekly_Reports",
    "Tasks",
    "Defect_Rounds",
    "Defect_Items",
    "Variation_Orders",
    "Site_Memos",
    "Project_Documents",
  ], sheetId) as Record<string, SheetRecord[]>;
  const allDaily = rows.Daily_Reports || [];
  const allWeekly = rows.Weekly_Reports || [];
  const allTasks = rows.Tasks || [];
  const allDefectRounds = rows.Defect_Rounds || [];
  const allDefectItems = rows.Defect_Items || [];
  const allVariationOrders = rows.Variation_Orders || [];
  const allMemos = rows.Site_Memos || [];
  const allDocuments = rows.Project_Documents || [];

  const dailyReports = allDaily
    .filter((report) => report.project_id === projectId && isWithinRange(String(report.date || ""), start, end))
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const weeklyReports = allWeekly
    .filter((report) => report.project_id === projectId && overlapsRange(String(report.week_start || ""), String(report.week_end || report.week_start || ""), start, end))
    .sort((a, b) => String(a.week_start || "").localeCompare(String(b.week_start || "")));
  const currentMonthTasks = allTasks.filter((task) => task.project_id === projectId && taskDateInRange(task, start, end));
  const nextMonthTasks = allTasks.filter((task) => task.project_id === projectId && taskDateInRange(task, nextMonthRange.start, nextMonthRange.end));
  const monthlyDefectRounds = allDefectRounds.filter((round) => round.project_id === projectId && rowDateInRange(round, start, end, ["inspection_date", "issued_at", "created_at", "updated_at"]));
  const monthlyDefectItems = allDefectItems.filter((item) => item.project_id === projectId && rowDateInRange(item, start, end, ["reported_date", "due_date", "created_at", "updated_at"]));
  const monthlyVariationOrders = allVariationOrders.filter((vo) => vo.project_id === projectId && rowDateInRange(vo, start, end, ["created_at", "updated_at", "approval_deadline", "due_date"]));
  const monthlyMemos = allMemos.filter((memo) => memo.project_id === projectId && rowDateInRange(memo, start, end, ["event_date", "issue_date", "created_at", "updated_at"]));
  const monthlyDocuments = allDocuments.filter((document) => document.project_id === projectId && rowDateInRange(document, start, end, ["created_at", "updated_at"]));
  const dailyMaterials = dailyReports.flatMap((report) => safeJsonRows(report.materials_json));
  const dailyMachinery = dailyReports.flatMap((report) => safeJsonRows(report.machinery_json));
  const dailyPersonnel = dailyReports.flatMap((report) => safeJsonRows(report.personnel_json));
  const personnel = groupByKey(dailyPersonnel, "role", "qty", "total_qty").map((row) => ({
    ...row,
    avg_qty: dailyReports.length ? String(Math.round(numberValue(row.total_qty) / dailyReports.length)) : "0",
    work_days: String(dailyReports.length),
  }));

  return {
    report_id: reportId,
    document_no: documentNo,
    project_id: projectId,
    project_name: project?.name || projectId,
    project_location: getProjectLocation(project),
    project_start_date: project?.start_date || "",
    project_end_date: project?.end_date || "",
    project_owner: project?.client || "",
    month: normalizedMonth,
    month_start: start,
    month_end: end,
    preface: preface || `รายงานฉบับนี้จัดทำขึ้นเพื่อสรุปผลความก้าวหน้าการก่อสร้างประจำเดือน ${normalizedMonth} โดยรวบรวมข้อมูลจาก Weekly Report, Daily Report และแผนงานของโครงการ เพื่อใช้ประกอบการติดตามงานและการตัดสินใจของผู้เกี่ยวข้อง`,
    meeting_summary: meetingSummary || "ไม่มีบันทึกเพิ่มเติมจากผู้จัดทำรายงานในรอบเดือนนี้",
    next_month_plan_note: nextMonthPlanNote || "ระบบสรุปแผนดำเนินงานเดือนถัดไปจาก Task/Schedule ของโครงการ กรุณาตรวจทานก่อนออกเอกสารทางการ",
    weekly_reports: buildWeeklyRows(weeklyReports),
    daily_summary: dailyReports.map((report) => ({
      date: String(report.date || ""),
      document_no: String(report.document_no || report.report_id || "-"),
      weather: String(report.weather || ""),
      workers: String(report.workers || ""),
      work_done: String(report.work_done || ""),
      issues: [report.issues, report.solutions].filter(Boolean).join(" / "),
    })),
    progress: getProgressRows(weeklyReports, currentMonthTasks),
    next_month_plan: buildNextMonthPlanFromTasks(nextMonthTasks),
    photos: getPhotos(dailyReports),
    weather: countByValue(dailyReports, "weather"),
    personnel,
    machinery: groupByKey(dailyMachinery, "name", "qty", "qty").map((row) => ({ ...row, hours: row.hours || "", note: row.note || "" })),
    materials: groupByKey(dailyMaterials, "name", "qty", "qty").map((row) => ({ ...row, unit: row.unit || "", note: row.note || "" })),
    issues: buildMonthlyIssuesFromExistingData({
      dailyReports,
      weeklyReports,
      defectItems: monthlyDefectItems,
      memos: monthlyMemos,
    }),
    approvals: [
      ...weeklyReports.flatMap((report) => safeJsonRows(report.approvals_json)),
      ...buildMonthlyApprovalsFromExistingData({
        variationOrders: monthlyVariationOrders,
        documents: monthlyDocuments,
      }),
    ],
    certifications: [],
    inspections: buildMonthlyInspectionsFromExistingData({
      defectRounds: monthlyDefectRounds,
      defectItems: monthlyDefectItems,
    }),
    field_engineer_name: sessionUser?.name || sessionUser?.email || "",
    field_engineer_email: sessionUser?.email || "",
    field_engineer_position: "วิศวกรสนาม",
    project_manager_name: project?.pm_name || "Project Manager",
    prepared_at: new Date().toISOString(),
  };
}

async function createPdf(html: string, documentNo: string, pdfFolderId: string) {
  return await createPdfReportFile({ html, documentNo, pdfFolderId });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project_id");
    const month = searchParams.get("month");
    const mode = searchParams.get("mode");
    const { sheetId } = await getProjectContext(projectId);
    await ensureSchema(sheetId);

    if (mode === "summary" && projectId && month) {
      const session = await getServerSession(authOptions);
      const project = await getProject(projectId);
      const payload = await buildMonthlyPayload({
        projectId,
        month,
        sheetId,
        project,
        sessionUser: session?.user,
      });
      return NextResponse.json({ success: true, data: payload });
    }

    let reports = await findAll("Monthly_Reports", sheetId) as SheetRecord[];
    if (projectId) reports = reports.filter((report) => report.project_id === projectId);
    reports = reports.sort((a, b) => String(b.month || "").localeCompare(String(a.month || "")));
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
    const month = getText(formData, "month");
    if (!projectId || !month) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    const project = await getProject(projectId);
    const { sheetId, driveFolderId } = await getProjectContext(projectId);
    await ensureSchema(sheetId);
    const targetDriveFolderId = project?.drive_folder_id || driveFolderId;
    if (!targetDriveFolderId) return NextResponse.json({ error: "Project Drive folder is not configured" }, { status: 400 });

    const existingReports = await findAll("Monthly_Reports", sheetId) as SheetRecord[];
    const { month: normalizedMonth, start, end } = getMonthRange(month);
    const documentNo = createMonthlyDocumentNo(projectId, normalizedMonth, existingReports);
    const reportId = `MREP-${Date.now().toString().slice(-8)}`;
    const payload = await buildMonthlyPayload({
      projectId,
      month: normalizedMonth,
      sheetId,
      project,
      sessionUser: session.user,
      documentNo,
      reportId,
      preface: getText(formData, "preface"),
      meetingSummary: getText(formData, "meeting_summary"),
      nextMonthPlanNote: getText(formData, "next_month_plan_note"),
    });

    const monthlyReportsFolder = await findOrCreateFolder("Monthly Reports", targetDriveFolderId);
    if (!monthlyReportsFolder.id) throw new Error("Failed to create Monthly Reports folder");
    const monthFolder = await findOrCreateFolder(normalizedMonth, monthlyReportsFolder.id);
    if (!monthFolder.id) throw new Error("Failed to create monthly period folder");
    const pdfFolder = await findOrCreateFolder("PDF", monthFolder.id);
    if (!pdfFolder.id) throw new Error("Failed to create monthly PDF folder");

    const pdfFile = await createPdf(buildMonthlyReportHtml(payload), documentNo, pdfFolder.id);
    const pdfUrl = pdfFile.webViewLink || pdfFile.webContentLink || "";

    const reportData = {
      report_id: reportId,
      project_id: projectId,
      month: normalizedMonth,
      month_start: start,
      month_end: end,
      document_no: documentNo,
      project_name: payload.project_name,
      project_location: payload.project_location,
      project_start_date: payload.project_start_date,
      project_end_date: payload.project_end_date,
      project_owner: payload.project_owner,
      preface: payload.preface,
      meeting_summary: payload.meeting_summary,
      next_month_plan_note: payload.next_month_plan_note,
      weekly_reports_json: stringifyMonthlyRows(payload.weekly_reports),
      daily_summary_json: stringifyMonthlyRows(payload.daily_summary),
      progress_json: stringifyMonthlyRows(payload.progress),
      next_month_plan_json: stringifyMonthlyRows(payload.next_month_plan),
      photos_json: stringifyMonthlyRows(payload.photos),
      weather_json: stringifyMonthlyRows(payload.weather),
      personnel_json: stringifyMonthlyRows(payload.personnel),
      machinery_json: stringifyMonthlyRows(payload.machinery),
      materials_json: stringifyMonthlyRows(payload.materials),
      issues_json: stringifyMonthlyRows(payload.issues),
      approvals_json: stringifyMonthlyRows(payload.approvals),
      certifications_json: stringifyMonthlyRows(payload.certifications),
      inspections_json: stringifyMonthlyRows(payload.inspections),
      field_engineer_name: payload.field_engineer_name,
      field_engineer_email: payload.field_engineer_email,
      field_engineer_position: payload.field_engineer_position,
      project_manager_name: payload.project_manager_name,
      prepared_at: payload.prepared_at,
      pdf_folder_id: pdfFolder.id,
      pdf_file_id: pdfFile.id || "",
      pdf_url: pdfUrl,
    };

    const result = await insert("Monthly_Reports", reportData, sheetId);
    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: unknown) {
    console.error("Failed to create monthly report:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
