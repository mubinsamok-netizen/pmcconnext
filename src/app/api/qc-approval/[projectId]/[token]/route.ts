import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { writeAuditLog } from "@/lib/auditLog";
import { downloadFile, findOrCreateFolder, uploadFile } from "@/lib/drive";
import { sendLineMessages } from "@/lib/line";
import { renderHtmlToPdfBuffer } from "@/lib/pdfRenderer";
import { buildQcApprovedLineFlex, buildQcPdfHtml, getQcApprovalReadiness, parseQcEvidence, parseQcItems, safeJsonStringify, type QcChecklistRecord, type QcEvidenceFile } from "@/lib/qcChecklists";
import { findAll, findAllMaster, findAllRaw, update } from "@/lib/sheetsCrud";
import { ensureMasterSchema, ensureSchema } from "@/lib/sheetsSetup";
import { isSupabaseBackend } from "@/lib/supabaseRest";

type PublicProject = Record<string, string | number | undefined> & {
  project_id: string;
  name?: string;
  client?: string;
  site_sheet_id?: string;
  drive_folder_id?: string;
};

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");

function text(value: unknown) {
  return String(value || "").trim();
}

function safeFolderName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "Other";
}

function getLogoDataUrl() {
  try {
    const logo = fs.readFileSync(LOGO_PATH);
    return `data:image/png;base64,${logo.toString("base64")}`;
  } catch {
    return "";
  }
}

async function getPublicContext(projectId: string, token: string) {
  if (!isSupabaseBackend()) await ensureMasterSchema();
  const projects = await findAllMaster("Projects") as unknown as PublicProject[];
  const project = projects.find((item) => item.project_id === projectId && item.active !== "FALSE");
  if (!project) return { error: "ไม่พบโครงการ", status: 404 as const };

  const siteSheetId = text(project.site_sheet_id);
  if (!siteSheetId) return { error: "โครงการยังไม่ได้ตั้งค่า Site Sheet", status: 400 as const };

  if (!isSupabaseBackend()) await ensureSchema(siteSheetId);
  const rows = await findAll("QC_Checklists", siteSheetId) as unknown as QcChecklistRecord[];
  const checklist = rows.find((row) => row.project_id === project.project_id && row.active !== "FALSE" && text(row.approval_token) === token);
  if (!checklist?._rowIndex) return { error: "ลิงก์อนุมัติไม่ถูกต้องหรือหมดอายุ", status: 404 as const };

  return { project, siteSheetId, checklist };
}

function publicPayload(project: PublicProject, checklist: QcChecklistRecord) {
  const items = parseQcItems(checklist.items_json);
  const evidence = parseQcEvidence(checklist.evidence_files_json);
  const readiness = getQcApprovalReadiness(items);
  return {
    project: {
      project_id: project.project_id,
      name: project.name || project.project_id,
      client: project.client || "",
    },
    checklist: {
      qc_id: checklist.qc_id,
      document_no: checklist.document_no || "",
      category: checklist.category || "",
      phase: checklist.phase || "",
      title: checklist.title || "",
      status: checklist.status || "sent_to_customer",
      approval_status: checklist.approval_status || "pending",
      inspection_date: checklist.inspection_date || "",
      inspected_by_name: checklist.inspected_by_name || "",
      customer_approved_at: checklist.customer_approved_at || "",
      customer_approved_by: checklist.customer_approved_by || "",
      customer_approval_note: checklist.customer_approval_note || "",
      pdf_url: checklist.pdf_url || "",
      evidence_count: evidence.length,
      can_approve: readiness.ready,
      approval_block_reason: readiness.ready ? "" : readiness.reason,
      items,
    },
  };
}

async function getFallbackRowIndex(siteSheetId: string, checklist: QcChecklistRecord) {
  const numericRowIndex = Number(checklist._rowIndex);
  if (Number.isFinite(numericRowIndex)) return numericRowIndex;

  const rawRows = await findAllRaw("QC_Checklists", siteSheetId);
  return rawRows.find((row) => row.qc_id === checklist.qc_id)?._rowIndex;
}

async function attachEvidenceDataUrls(checklist: QcChecklistRecord) {
  const evidence = parseQcEvidence(checklist.evidence_files_json);
  const hydrated = await Promise.all(evidence.map(async (file: QcEvidenceFile) => {
    if (!file.file_id || !String(file.mime_type || "").startsWith("image/")) return file;
    try {
      const downloaded = await downloadFile(file.file_id);
      const mimeType = downloaded.mimeType || file.mime_type || "image/jpeg";
      return {
        ...file,
        mime_type: mimeType,
        data_url: `data:${mimeType};base64,${downloaded.buffer.toString("base64")}`,
      };
    } catch (error) {
      console.warn(`Failed to embed QC evidence ${file.file_id}:`, error);
      return file;
    }
  }));

  return {
    ...checklist,
    evidence_files_json: safeJsonStringify(hydrated),
  };
}

async function getQcFolder(project: PublicProject, qcId: string) {
  const rootFolderId = text(project.drive_folder_id);
  if (!rootFolderId) return null;
  const qcRoot = await findOrCreateFolder("QC Checklists", rootFolderId);
  const qcFolder = await findOrCreateFolder(safeFolderName(qcId), qcRoot.id || rootFolderId);
  return qcFolder.id || qcRoot.id || rootFolderId;
}

async function regenerateApprovedPdf(project: PublicProject, checklist: QcChecklistRecord) {
  const qcFolderId = await getQcFolder(project, checklist.qc_id);
  if (!qcFolderId) throw new Error("Project Drive folder is not configured");

  const pdfChecklist = await attachEvidenceDataUrls(checklist);
  const html = buildQcPdfHtml({
    checklist: pdfChecklist,
    project,
    logoUrl: getLogoDataUrl(),
  });
  const documentNo = text(checklist.document_no) || checklist.qc_id;
  const pdfFolder = await findOrCreateFolder("PDF", qcFolderId);
  const pdfBuffer = await renderHtmlToPdfBuffer(html, documentNo);
  const uploaded = await uploadFile(`${documentNo}-approved.pdf`, "application/pdf", pdfBuffer, pdfFolder.id || qcFolderId);

  return {
    pdf_file_id: uploaded.id || "",
    pdf_url: uploaded.webViewLink || uploaded.webContentLink || "",
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const { projectId, token } = await params;
    const context = await getPublicContext(decodeURIComponent(projectId), decodeURIComponent(token));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    return NextResponse.json({ success: true, data: publicPayload(context.project, context.checklist) });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "เปิดรายการอนุมัติไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const { projectId, token } = await params;
    const context = await getPublicContext(decodeURIComponent(projectId), decodeURIComponent(token));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    const readiness = getQcApprovalReadiness(parseQcItems(context.checklist.items_json));
    if (!readiness.ready) return NextResponse.json({ error: readiness.reason || "ต้องตรวจ QC ให้ผ่านครบทุกข้อก่อนลูกค้าอนุมัติ" }, { status: 400 });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const approvedBy = text(body.customer_approved_by) || text(context.project.client) || "ลูกค้า";
    const approvedAt = new Date().toISOString();
    let patch: Record<string, string> = {
      status: "customer_approved",
      approval_status: "approved",
      customer_approved_at: approvedAt,
      customer_approved_by: approvedBy,
      customer_approval_note: text(body.customer_approval_note),
    };
    let pdfUpdateError = "";

    if (context.checklist.approval_status !== "approved") {
      try {
        const pdfPatch = await regenerateApprovedPdf(context.project, { ...context.checklist, ...patch });
        patch = { ...patch, ...pdfPatch };
      } catch (error) {
        pdfUpdateError = error instanceof Error ? error.message : "Failed to update approved QC PDF";
        console.warn("Failed to update QC approved PDF:", error);
      }
    }

    if (context.checklist.approval_status !== "approved") {
      await update(
        "QC_Checklists",
        context.checklist.qc_id || context.checklist._rowIndex || "",
        patch,
        context.siteSheetId,
        await getFallbackRowIndex(context.siteSheetId, context.checklist)
      );
      await writeAuditLog({
        actor: { name: approvedBy, role: "Customer" },
        projectId: context.project.project_id,
        module: "qc_checklists",
        action: "customer_approved_via_link",
        targetId: context.checklist.qc_id,
        summary: `ลูกค้าอนุมัติ QC Checklist: ${context.checklist.title || context.checklist.qc_id}`,
        before: context.checklist,
        after: patch,
      });

      const lineGroupId = text(context.checklist.line_group_id);
      const nextChecklist = { ...context.checklist, ...patch };
      if (lineGroupId) {
        await sendLineMessages([buildQcApprovedLineFlex({
          projectName: text(context.project.name),
          projectId: context.project.project_id,
          documentNo: text(nextChecklist.document_no),
          title: text(nextChecklist.title),
          approvedBy,
          approvedAt,
          pdfUrl: text(nextChecklist.pdf_url),
        })], lineGroupId).catch((error) => console.warn("Failed to notify LINE after QC approval:", error));
      }
    }

    return NextResponse.json({
      success: true,
      data: publicPayload(context.project, { ...context.checklist, ...patch }),
      pdf_update_error: pdfUpdateError,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกอนุมัติไม่สำเร็จ" }, { status: 500 });
  }
}
