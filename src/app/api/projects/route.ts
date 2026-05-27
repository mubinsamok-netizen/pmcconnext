import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { filterProjectsForUser } from "@/lib/authz";
import { isForemanRole } from "@/lib/siteAccess";
import { findOrCreateFolder, setupProjectFolders, uploadFile } from "@/lib/drive";
import { DRIVE_ROOT_FOLDER_ID } from "@/lib/google";
import { isSupabaseBackend, isSupabaseReadEnabled, readWithSheetsFallback } from "@/lib/supabaseRest";
import { getSupabaseProjects } from "@/lib/supabaseReadModel";
import { createSupabaseSiteSchema, getSupabaseSiteSchemaName, isSupabaseSiteSchemaMode } from "@/lib/supabaseSchema";
import { findAllBatch, findAllMaster, insertMaster, updateMaster } from "@/lib/sheetsCrud";
import { createSiteSpreadsheet, ensureMasterSchema, ensureSchema } from "@/lib/sheetsSetup";

type SheetRecord = Record<string, string | number | undefined>;

type ProjectHealth = {
  percent_done: string;
  tasks_count: string;
  completed_tasks: string;
  overdue_tasks: string;
  delay_days: string;
  progress_source: string;
  daily_reports_count: string;
  last_daily_report_date: string;
  daily_report_missing_days: string;
  daily_report_alert: string;
};

const DAILY_REPORT_STALE_DAYS = 7;

function withSiteStorageMetadata(project: SheetRecord) {
  const projectId = String(project.project_id || "").trim();
  const usesSupabaseSchema = isSupabaseBackend() && isSupabaseSiteSchemaMode() && Boolean(projectId);

  return {
    ...project,
    site_storage_mode: usesSupabaseSchema ? "supabase_schema" : "google_sheet",
    site_schema_name: usesSupabaseSchema ? getSupabaseSiteSchemaName(projectId) : "",
  };
}

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Internal server error";
  if (isServiceAccountStorageError(error)) {
    return "ระบบอัปโหลดรูปผ่าน Google Service Account ซึ่งไม่มีพื้นที่เก็บไฟล์ Drive สำหรับไฟล์รูปภาพโดยตรง กรุณาย้ายโฟลเดอร์หลักไป Shared Drive หรือเปลี่ยนระบบอัปโหลดให้ใช้ OAuth ของผู้ใช้";
  }
  if (message.toLowerCase().includes("storage quota") || message.includes("storageQuotaExceeded")) {
    return "พื้นที่ Google Drive ของบัญชีที่ระบบใช้เต็มแล้ว กรุณาลบไฟล์/เพิ่มพื้นที่ หรือใส่ Google Sheet ID และ Google Drive Folder ID ที่มีอยู่แล้วแทนการให้ระบบสร้างใหม่";
  }
  if (message.includes("Quota exceeded")) {
    return "Google API quota ชั่วคราวเต็ม กรุณารอสักครู่แล้วลองใหม่อีกครั้ง";
  }
  return message;
}

function isServiceAccountStorageError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Service Accounts do not have storage quota");
}

function isDriveStorageQuotaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return isServiceAccountStorageError(error) || message.toLowerCase().includes("storage quota") || message.includes("storageQuotaExceeded");
}

function makeProjectFolderName(projectId: string, name: string) {
  return `${projectId} - ${name || "Site"}`;
}

async function requireProjectManagementAccess() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (isForemanRole(session.user.role)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์จัดการไซต์งาน" }, { status: 403 });
  }
  return null;
}

async function getCoverUploadFolderId(driveFolderId: string) {
  if (!driveFolderId) return "";

  try {
    const photosFolder = await findOrCreateFolder("Photos", driveFolderId);
    return photosFolder.id || driveFolderId;
  } catch (error: unknown) {
    console.warn("Failed to resolve Photos folder for cover upload, using project root folder:", error);
    return driveFolderId;
  }
}

async function uploadProjectCover(coverFile: File, projectId: string, driveFolderId: string) {
  const uploadFolderId = await getCoverUploadFolderId(driveFolderId);
  if (!uploadFolderId) {
    throw new Error("ไม่พบ Google Drive Folder ID สำหรับอัปโหลดรูปปก");
  }

  const bytes = Buffer.from(await coverFile.arrayBuffer());
  return uploadFile(
    `cover-${projectId}-${Date.now()}-${coverFile.name}`,
    coverFile.type || "application/octet-stream",
    bytes,
    uploadFolderId
  );
}

async function readProjectPayload(req: Request) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const payload: Record<string, string> = {};
    formData.forEach((value, key) => {
      if (typeof value === "string") {
        payload[key] = value;
      }
    });

    return {
      payload,
      coverFile: formData.get("cover") instanceof File ? formData.get("cover") as File : null,
    };
  }

  return {
    payload: await req.json(),
    coverFile: null,
  };
}

function clampPercent(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function parseDate(date?: string) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isReportingRequired(project: SheetRecord) {
  const status = String(project.status || "").toLowerCase();
  return !["completed", "cancelled"].includes(status);
}

function daysSince(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - target.getTime()) / 86400000));
}

function isDoneTask(task: SheetRecord) {
  const status = String(task.status || "").toLowerCase();
  return status === "done" || status === "completed" || clampPercent(task.percent_done) >= 100;
}

function getTaskProgress(task: SheetRecord) {
  if (isDoneTask(task)) return 100;

  const explicitPercent = clampPercent(task.percent_done);
  if (explicitPercent > 0) return explicitPercent;

  const status = String(task.status || "").toLowerCase();
  if (status === "review") return 80;
  if (status === "in progress") return 50;
  return 0;
}

function calculateProjectHealth(project: SheetRecord, tasks: SheetRecord[]): ProjectHealth {
  const workTasks = tasks.filter((task) => task.task_type !== "heading");
  if (workTasks.length === 0) {
    return {
      percent_done: String(clampPercent(project.percent_done)),
      tasks_count: "0",
      completed_tasks: "0",
      overdue_tasks: "0",
      delay_days: "0",
      progress_source: "manual",
      daily_reports_count: "0",
      last_daily_report_date: "",
      daily_report_missing_days: "0",
      daily_report_alert: "FALSE",
    };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const progressTotal = workTasks.reduce((sum, task) => sum + getTaskProgress(task), 0);
  const completedTasks = workTasks.filter(isDoneTask).length;
  const overdueTasks = workTasks.filter((task) => {
    if (isDoneTask(task)) return false;
    const end = parseDate(String(task.planned_end || task.end || ""));
    return Boolean(end && end < now);
  });
  const delayDays = overdueTasks.reduce((maxDelay, task) => {
    const end = parseDate(String(task.planned_end || task.end || ""));
    if (!end) return maxDelay;
    const days = Math.ceil((now.getTime() - end.getTime()) / 86400000);
    return Math.max(maxDelay, days);
  }, 0);

  return {
    percent_done: String(clampPercent(Math.round(progressTotal / workTasks.length))),
    tasks_count: String(workTasks.length),
    completed_tasks: String(completedTasks),
    overdue_tasks: String(overdueTasks.length),
    delay_days: String(delayDays),
    progress_source: "tasks",
    daily_reports_count: "0",
    last_daily_report_date: "",
    daily_report_missing_days: "0",
    daily_report_alert: "FALSE",
  };
}

function calculateDailyReportHealth(project: SheetRecord, reports: SheetRecord[]) {
  const projectReports = reports
    .filter((report) => report.project_id === project.project_id)
    .map((report) => ({
      report,
      date: parseDate(String(report.date || "")),
    }))
    .filter((item): item is { report: SheetRecord; date: Date } => Boolean(item.date))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const latestReport = projectReports[0];
  const startDate = parseDate(String(project.start_date || ""));
  const baselineDate = latestReport?.date || startDate;
  const missingDays = baselineDate ? daysSince(baselineDate) : 0;
  const shouldAlert = isReportingRequired(project) && Boolean(baselineDate) && missingDays > DAILY_REPORT_STALE_DAYS;

  return {
    daily_reports_count: String(projectReports.length),
    last_daily_report_date: latestReport ? String(latestReport.report.date || "") : "",
    daily_report_missing_days: String(missingDays),
    daily_report_alert: shouldAlert ? "TRUE" : "FALSE",
  };
}

async function enrichProjectWithHealth(project: SheetRecord) {
  const siteSheetId = String(project.site_sheet_id || "").trim();
  if (!siteSheetId) {
    return { ...project, ...calculateProjectHealth(project, []) };
  }

  try {
    const rows = await findAllBatch(["Tasks", "Daily_Reports"], siteSheetId) as Record<string, SheetRecord[]>;
    const tasks = rows.Tasks || [];
    const dailyReports = rows.Daily_Reports || [];
    const projectTasks = tasks.filter((task) => task.project_id === project.project_id);
    return {
      ...project,
      ...calculateProjectHealth(project, projectTasks),
      ...calculateDailyReportHealth(project, dailyReports),
    };
  } catch (error: unknown) {
    console.warn(`Failed to calculate progress for ${project.project_id}:`, error);
    return { ...project, ...calculateProjectHealth(project, []) };
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode");

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const readSheetsProjects = async () => {
      if (!isSupabaseBackend()) await ensureMasterSchema();
      return await findAllMaster("Projects");
    };

    const projects = isSupabaseReadEnabled("projects")
      ? await readWithSheetsFallback("projects", getSupabaseProjects, readSheetsProjects)
      : await readSheetsProjects();
    const activeProjects = projects.filter((project) => project.active !== "FALSE");
    const accessibleProjects = await filterProjectsForUser(activeProjects, session.user);
    if (mode === "basic") {
      return NextResponse.json({ success: true, data: accessibleProjects.map(withSiteStorageMetadata) });
    }

    const projectsWithHealth = await Promise.all(accessibleProjects.map(enrichProjectWithHealth));
    return NextResponse.json({ success: true, data: projectsWithHealth.map(withSiteStorageMetadata) });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const forbidden = await requireProjectManagementAccess();
    if (forbidden) return forbidden;

    if (!isSupabaseBackend()) await ensureMasterSchema();

    const { payload: body, coverFile } = await readProjectPayload(req);
    const {
      project_id,
      name,
      client,
      project_type,
      description,
      address,
      province,
      district,
      start_date,
      end_date,
      budget,
      contract_no,
      site_link,
      pm_name,
      se_name,
      architect_name,
      site_sheet_id,
      drive_folder_id,
      sales_customer_id,
      sales_stage,
      deposit_status,
      line_group_id,
      line_group_name,
      line_notify_enabled,
    } = body;

    if (!project_id || !name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const projects = await findAllMaster("Projects");
    const existingProject = projects.find((project) => project.project_id === project_id);
    if (existingProject) {
      return NextResponse.json({ error: "Project ID นี้ถูกใช้งานแล้ว กรุณาใช้รหัสไซต์ใหม่" }, { status: 409 });
    }

    let driveFolderId = typeof drive_folder_id === "string" ? drive_folder_id.trim() : "";
    let driveProvisionWarning = "";
    const projectFolderName = makeProjectFolderName(project_id, name);
    if (!driveFolderId || driveFolderId === DRIVE_ROOT_FOLDER_ID) {
      try {
        const folders = await setupProjectFolders(projectFolderName, driveFolderId || DRIVE_ROOT_FOLDER_ID);
        driveFolderId = folders.root;
      } catch (error: unknown) {
        console.error("Drive setup failed:", error);
        if (isDriveStorageQuotaError(error)) {
          driveProvisionWarning = "Drive storage quota exceeded. Saved project without a Drive folder.";
        } else {
          return NextResponse.json({ error: `ไม่สามารถสร้าง Drive folder ได้: ${getErrorMessage(error)}` }, { status: 500 });
        }
      }
    }

    let siteSheetId = typeof site_sheet_id === "string" ? site_sheet_id.trim() : "";
    if (isSupabaseBackend() && isSupabaseSiteSchemaMode()) {
      siteSheetId = getSupabaseSiteSchemaName(project_id);
      try {
        await createSupabaseSiteSchema(project_id);
      } catch (error: unknown) {
        return NextResponse.json({
          error: `ไม่สามารถสร้าง Supabase schema ของไซต์ได้: ${getErrorMessage(error)}`,
        }, { status: 500 });
      }
    } else if (!siteSheetId) {
      try {
        siteSheetId = await createSiteSpreadsheet(`${project_id} - ${name} Data`, driveFolderId || undefined);
      } catch (error: unknown) {
        console.error("Site Sheet setup failed:", error);
        if (isDriveStorageQuotaError(error)) {
          return NextResponse.json({
            error: getErrorMessage(error),
          }, { status: 500 });
        }
        throw error;
      }
    } else {
      if (!isSupabaseBackend()) await ensureSchema(siteSheetId);
    }

    let coverFileId = "";
    let coverUrl = "";
    if (coverFile && driveFolderId) {
      try {
        const uploaded = await uploadProjectCover(coverFile, project_id, driveFolderId);
        coverFileId = uploaded.id || "";
        coverUrl = uploaded.webViewLink || uploaded.webContentLink || "";
      } catch (error: unknown) {
        if (isDriveStorageQuotaError(error)) {
          driveProvisionWarning = getErrorMessage(error);
        } else {
          throw error;
        }
      }
    } else if (coverFile && !driveFolderId) {
      driveProvisionWarning = "Saved project without cover upload because Drive folder is not available.";
    }

    const projectData = {
      project_id,
      name,
      client,
      project_type,
      description,
      address,
      province,
      district,
      start_date,
      end_date,
      budget,
      contract_no,
      site_link,
      pm_name,
      se_name,
      architect_name,
      cover_file_id: coverFileId,
      cover_url: coverUrl,
      status: body.status || "Planning",
      site_sheet_id: siteSheetId,
      drive_folder_id: driveFolderId,
      sales_customer_id,
      sales_stage: sales_stage || "deposited",
      deposit_status: deposit_status || "deposit_paid",
      line_group_id,
      line_group_name,
      line_notify_enabled: line_notify_enabled || "TRUE",
      active: "TRUE",
    };

    const result = await insertMaster("Projects", projectData);

    if (sales_customer_id) {
      try {
        const customers = await findAllMaster("Customers");
        const customer = customers.find((item) => item.id === sales_customer_id);
        if (customer?._rowIndex) {
          const customerRowKey = isSupabaseBackend() ? sales_customer_id : customer._rowIndex;
          await updateMaster("Customers", customerRowKey, {
            project_id,
            status: "deposited",
            id: sales_customer_id,
          }, customer._rowIndex);
        }
      } catch (error: unknown) {
        console.warn(`Failed to link Sales CRM customer ${sales_customer_id} to ${project_id}:`, error);
      }
    }

    return NextResponse.json({ success: true, data: result.inserted, warning: driveProvisionWarning || undefined });
  } catch (error: unknown) {
    console.error("Failed to create project:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const forbidden = await requireProjectManagementAccess();
    if (forbidden) return forbidden;

    if (!isSupabaseBackend()) await ensureMasterSchema();

    const { payload: body, coverFile } = await readProjectPayload(req);
    const projectId = typeof body.project_id === "string" ? body.project_id.trim() : "";

    if (!projectId) {
      return NextResponse.json({ error: "Missing project_id" }, { status: 400 });
    }

    const projects = await findAllMaster("Projects");
    const current = projects.find((project) => project.project_id === projectId);

    if (!current?._rowIndex) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const value = (key: string, fallback: unknown = "") => {
      const nextValue = body[key];
      return typeof nextValue === "string" ? nextValue : String(fallback || "");
    };

    let driveFolderId = value("drive_folder_id", current.drive_folder_id || "").trim();
    const requestedSiteSheetId = value("site_sheet_id", current.site_sheet_id || "").trim();
    const usesSupabaseSchema = isSupabaseBackend() && isSupabaseSiteSchemaMode();
    const siteSheetId = usesSupabaseSchema
      ? String(current.site_sheet_id || getSupabaseSiteSchemaName(projectId)).trim()
      : requestedSiteSheetId;
    let warning = "";

    if (!driveFolderId && coverFile) {
      try {
        const folders = await setupProjectFolders(makeProjectFolderName(projectId, value("name", current.name || "")));
        driveFolderId = folders.root;
      } catch (error: unknown) {
        console.error("Drive setup failed while updating cover:", error);
        if (isDriveStorageQuotaError(error)) {
          warning = getErrorMessage(error);
        } else {
          return NextResponse.json({ error: `ไม่สามารถสร้าง Drive folder สำหรับรูปปกได้: ${getErrorMessage(error)}` }, { status: 500 });
        }
      }
    }

    if (!usesSupabaseSchema && siteSheetId && siteSheetId !== current.site_sheet_id) {
      if (!isSupabaseBackend()) await ensureSchema(siteSheetId);
    }

    if (driveFolderId === DRIVE_ROOT_FOLDER_ID) {
      try {
        const folders = await setupProjectFolders(makeProjectFolderName(projectId, value("name", current.name || "")), DRIVE_ROOT_FOLDER_ID);
        driveFolderId = folders.root;
      } catch (error: unknown) {
        console.error("Drive setup failed while isolating root folder:", error);
        if (isDriveStorageQuotaError(error)) {
          warning = getErrorMessage(error);
        } else {
          return NextResponse.json({ error: `ไม่สามารถสร้าง Drive folder เฉพาะไซต์ได้: ${getErrorMessage(error)}` }, { status: 500 });
        }
      }
    }

    let coverFileId = value("cover_file_id", current.cover_file_id || "");
    let coverUrl = value("cover_url", current.cover_url || "");

    if (coverFile && driveFolderId) {
      try {
        const uploaded = await uploadProjectCover(coverFile, projectId, driveFolderId);
        coverFileId = uploaded.id || "";
        coverUrl = uploaded.webViewLink || uploaded.webContentLink || "";
      } catch (error: unknown) {
        if (isDriveStorageQuotaError(error)) {
          warning = getErrorMessage(error);
        } else {
          throw error;
        }
      }
    } else if (coverFile && !driveFolderId) {
      warning = "Saved project without cover upload because Drive folder is not available.";
    }

    const patch = {
      project_id: projectId,
      name: value("name", current.name || ""),
      client: value("client", current.client || ""),
      start_date: value("start_date", current.start_date || ""),
      end_date: value("end_date", current.end_date || ""),
      status: value("status", current.status || "Planning"),
      budget: value("budget", current.budget || ""),
      site_sheet_id: siteSheetId,
      drive_folder_id: driveFolderId,
      active: value("active", current.active || "TRUE"),
      project_type: value("project_type", current.project_type || ""),
      description: value("description", current.description || ""),
      address: value("address", current.address || ""),
      province: value("province", current.province || ""),
      district: value("district", current.district || ""),
      contract_no: value("contract_no", current.contract_no || ""),
      site_link: value("site_link", current.site_link || ""),
      pm_name: value("pm_name", current.pm_name || ""),
      se_name: value("se_name", current.se_name || ""),
      architect_name: value("architect_name", current.architect_name || ""),
      cover_file_id: coverFileId,
      cover_url: coverUrl,
      sales_customer_id: value("sales_customer_id", current.sales_customer_id || ""),
      sales_stage: value("sales_stage", current.sales_stage || ""),
      deposit_status: value("deposit_status", current.deposit_status || ""),
      line_group_id: value("line_group_id", current.line_group_id || ""),
      line_group_name: value("line_group_name", current.line_group_name || ""),
      line_notify_enabled: value("line_notify_enabled", current.line_notify_enabled || "TRUE"),
    };

    await updateMaster("Projects", current._rowIndex, patch);

    return NextResponse.json({
      success: true,
      data: withSiteStorageMetadata({ ...current, ...patch }),
      warning: warning || undefined,
    });
  } catch (error: unknown) {
    console.error("Failed to update project:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const forbidden = await requireProjectManagementAccess();
    if (forbidden) return forbidden;

    if (!isSupabaseBackend()) await ensureMasterSchema();

    const body = await req.json();
    const projectId = typeof body.project_id === "string" ? body.project_id.trim() : "";

    if (!projectId) {
      return NextResponse.json({ error: "Missing project_id" }, { status: 400 });
    }

    const projects = await findAllMaster("Projects");
    const current = projects.find((project) => project.project_id === projectId);

    if (!current?._rowIndex) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    await updateMaster("Projects", current._rowIndex, { active: "FALSE" });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Failed to delete project:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
