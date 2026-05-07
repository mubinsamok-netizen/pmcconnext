import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { buildDailyReportHtml, buildDailyReportLineFlex, parseJsonRows, stringifyRows, type DailyReportPayload } from "@/lib/dailyReports";
import { findOrCreateFolder, uploadFile } from "@/lib/drive";
import { sendLineMessages } from "@/lib/line";
import { getMasterProjects, type MasterProject } from "@/lib/masterProjects";
import { createPdfReportFile } from "@/lib/reportPdf";
import { findAll, insert, update } from "@/lib/sheetsCrud";
import { ensureSchema } from "@/lib/sheetsSetup";
import { getProjectContext } from "@/lib/siteContext";

type ReportRecord = Record<string, string | number | undefined>;
type ProjectWithLine = MasterProject & {
  line_group_id?: string;
  line_group_name?: string;
  line_notify_enabled?: string;
};
type UploadedReportPhoto = {
  id?: string;
  name?: string;
  mimeType?: string;
  webViewLink?: string;
  webContentLink?: string;
};

const FALLBACK_LINE_GROUP_ID = process.env.LINE_GROUP_ID || "";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getUploadedPhotos(formData: FormData) {
  const value = formData.get("uploaded_photos_json");
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((photo): photo is UploadedReportPhoto => Boolean(photo && typeof photo === "object" && String((photo as UploadedReportPhoto).id || "").trim()))
      .slice(0, 10);
  } catch {
    return [];
  }
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

async function readPhotos(formData: FormData): Promise<{ files: File[]; uploadedPhotos: UploadedReportPhoto[] }> {
  const uploadedPhotos = getUploadedPhotos(formData);
  if (uploadedPhotos.length > 0) {
    return { files: [], uploadedPhotos };
  }

  const files = formData
    .getAll("photos")
    .filter((item): item is File => item instanceof File && item.size > 0)
    .slice(0, 10);

  return {
    files,
    uploadedPhotos: [],
  };
}

function createReportPhotoFileName(documentNo: string, index: number, originalName: string) {
  const safeName = originalName.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_");
  return `${documentNo}_${String(index + 1).padStart(2, "0")}_${safeName}`;
}

async function uploadPhotos(files: File[], photosFolderId: string, documentNo: string) {
  const uploadedPhotoUrls: string[] = [];

  for (const [index, file] of files.entries()) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadedFile = await uploadFile(
      createReportPhotoFileName(documentNo, index, file.name),
      file.type || "application/octet-stream",
      buffer,
      photosFolderId
    );
    uploadedPhotoUrls.push(uploadedFile.webViewLink || uploadedFile.webContentLink || "");
  }

  return uploadedPhotoUrls.filter(Boolean);
}

function getUploadedPhotoUrls(photos: UploadedReportPhoto[]) {
  return photos
    .map((photo) => photo.webViewLink || photo.webContentLink || (photo.id ? `https://drive.google.com/file/d/${photo.id}/view` : ""))
    .filter(Boolean);
}

async function createPdf({
  html,
  documentNo,
  pdfFolderId,
}: {
  html: string;
  documentNo: string;
  pdfFolderId: string;
}) {
  return await createPdfReportFile({ html, documentNo, pdfFolderId });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project_id");
    const { sheetId } = await getProjectContext(projectId);
    await ensureSchema(sheetId);

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

    if (!project_id || !date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    step = "โหลดข้อมูลโครงการ";
    const project = await getProject(project_id);
    const { sheetId, driveFolderId } = await getProjectContext(project_id);
    step = "ตรวจสอบ schema ของ Google Sheets";
    await ensureSchema(sheetId);

    const targetDriveFolderId = project?.drive_folder_id || driveFolderId;
    if (!targetDriveFolderId) {
      return NextResponse.json({ error: "Project Drive folder is not configured" }, { status: 400 });
    }

    step = "อ่านเลขรายงานเดิมจาก Google Sheets";
    const existingReports = await findAll("Daily_Reports", sheetId) as ReportRecord[];
    const document_no = createDocumentNo(project_id, date, existingReports);
    const report_id = `REP-${Date.now().toString().slice(-8)}`;
    const monthKey = getMonthKey(date);
    const preparedAt = new Date().toISOString();
    const personnel = parseJsonRows(formData.get("personnel_json"));
    const machinery = parseJsonRows(formData.get("machinery_json"));
    const materials = parseJsonRows(formData.get("materials_json"));
    const workers = getText(formData, "workers") || sumPersonnel(personnel);
    const { files, uploadedPhotos } = await readPhotos(formData);

    step = "สร้าง/ค้นหาโฟลเดอร์ Daily Reports ใน Google Drive";
    const dailyReportsFolder = await findOrCreateFolder("Daily Reports", targetDriveFolderId);
    if (!dailyReportsFolder.id) throw new Error("Failed to create Daily Reports folder");

    step = "สร้าง/ค้นหาโฟลเดอร์รายเดือนใน Google Drive";
    const monthFolder = await findOrCreateFolder(monthKey, dailyReportsFolder.id);
    if (!monthFolder.id) throw new Error("Failed to create monthly report folder");

    step = "สร้าง/ค้นหาโฟลเดอร์ PDF และ Photos ใน Google Drive";
    const pdfFolder = await findOrCreateFolder("PDF", monthFolder.id);
    const photosMonthFolder = await findOrCreateFolder("Photos", monthFolder.id);
    if (!pdfFolder.id || !photosMonthFolder.id) throw new Error("Failed to create report subfolders");

    step = "อัปโหลดรูปภาพประกอบไป Google Drive";
    const uploadedPhotoUrls = uploadedPhotos.length > 0
      ? getUploadedPhotoUrls(uploadedPhotos)
      : files.length > 0
        ? await uploadPhotos(files, photosMonthFolder.id, document_no)
        : [];

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

    step = "สร้างไฟล์ PDF รายงาน";
    const html = buildDailyReportHtml(reportPayload, [], uploadedPhotoUrls.length);
    const pdfFile = await createPdf({ html, documentNo: document_no, pdfFolderId: pdfFolder.id });
    const pdfUrl = pdfFile.webViewLink || pdfFile.webContentLink || "";
    const photosFolderUrl = photosMonthFolder.webViewLink || `https://drive.google.com/drive/folders/${photosMonthFolder.id}`;
    const lineGroupId = String(project?.line_group_id || FALLBACK_LINE_GROUP_ID || "").trim();
    const lineEnabled = project?.line_notify_enabled !== "FALSE";

    const baseReportData = {
      report_id,
      project_id,
      date,
      weather: reportPayload.weather,
      workers: reportPayload.workers,
      work_done: reportPayload.work_done,
      issues: reportPayload.issues,
      photos_folder_id: photosMonthFolder.id,
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
      photos_json: JSON.stringify(uploadedPhotoUrls),
      pdf_folder_id: pdfFolder.id,
      pdf_file_id: pdfFile.id || "",
      pdf_url: pdfUrl,
      photos_month_folder_id: photosMonthFolder.id,
      line_group_id: lineGroupId,
      line_status: lineEnabled ? "pending" : "disabled",
      line_sent_at: "",
      line_error: "",
    };

    step = "บันทึกข้อมูลรายงานลง Google Sheets";
    await insert("Daily_Reports", baseReportData, sheetId);
    const insertedReports = await findAll("Daily_Reports", sheetId) as ReportRecord[];
    const inserted = insertedReports.find((report) => report.report_id === report_id);

    let linePatch: Record<string, string> = {};
    if (lineEnabled) {
      try {
        if (!lineGroupId) throw new Error("LINE group ID is not configured");
        const flexMessage = buildDailyReportLineFlex({ report: reportPayload, pdfUrl, photosFolderUrl, photoCount: uploadedPhotoUrls.length });
        await sendLineMessages([flexMessage], lineGroupId);
        linePatch = {
          line_status: "sent",
          line_sent_at: new Date().toISOString(),
          line_error: "",
        };
      } catch (lineError: unknown) {
        linePatch = {
          line_status: "failed",
          line_sent_at: "",
          line_error: getErrorMessage(lineError),
        };
        console.error("Failed to send LINE daily report:", lineError);
      }

      if (inserted?._rowIndex) {
        step = "อัปเดตสถานะ LINE ใน Google Sheets";
        await update("Daily_Reports", Number(inserted._rowIndex), linePatch, sheetId);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...baseReportData,
        ...linePatch,
      },
    });
  } catch (error: unknown) {
    console.error("Failed to create report:", error);
    return NextResponse.json({ error: `${step}: ${getErrorMessage(error)}` }, { status: 500 });
  }
}
