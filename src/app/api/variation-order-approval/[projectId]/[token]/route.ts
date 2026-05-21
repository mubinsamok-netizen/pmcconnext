import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auditLog";
import { findOrCreateFolder, uploadFile } from "@/lib/drive";
import { sendLineMessages } from "@/lib/line";
import { renderHtmlToPdfBuffer } from "@/lib/pdfRenderer";
import { findAll, findAllMaster, insert, update } from "@/lib/sheetsCrud";
import { ensureMasterSchema, ensureSchema } from "@/lib/sheetsSetup";
import {
  buildVoApprovedLineFlex,
  numberValue,
  safeJsonStringify,
  type VoItemRecord,
  type VoRecord,
} from "@/lib/variationOrders";
import { buildApprovalCertificateHtml } from "@/lib/variationOrderDocuments";

type PublicProject = Record<string, string | number | undefined> & {
  project_id: string;
  name?: string;
  client?: string;
  site_sheet_id?: string;
  drive_folder_id?: string;
};

type SheetRecord = Record<string, string | number | undefined>;

function text(value: unknown) {
  return String(value || "").trim();
}

function safeFolderName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "Other";
}

async function getPublicContext(projectId: string, token: string) {
  await ensureMasterSchema();
  const projects = await findAllMaster("Projects") as unknown as PublicProject[];
  const project = projects.find((item) => item.project_id === projectId && item.active !== "FALSE");
  if (!project) return { error: "ไม่พบโครงการ", status: 404 as const };

  const siteSheetId = text(project.site_sheet_id);
  if (!siteSheetId) return { error: "โครงการยังไม่ได้ตั้งค่า Site Sheet", status: 400 as const };

  await ensureSchema(siteSheetId);
  const [voRows, itemRows, documentRows] = await Promise.all([
    findAll("Variation_Orders", siteSheetId) as Promise<VoRecord[]>,
    findAll("VO_Items", siteSheetId) as Promise<VoItemRecord[]>,
    findAll("VO_Documents", siteSheetId) as Promise<SheetRecord[]>,
  ]);
  const vo = voRows.find((row) => row.project_id === project.project_id && text(row.approval_token) === token);
  if (!vo?._rowIndex) return { error: "ลิงก์อนุมัติไม่ถูกต้องหรือหมดอายุ", status: 404 as const };

  const items = itemRows
    .filter((item) => item.project_id === project.project_id && item.vo_id === vo.vo_id)
    .sort((a, b) => numberValue(a.item_no) - numberValue(b.item_no));
  const documents = documentRows.filter((document) => document.project_id === project.project_id && document.vo_id === vo.vo_id);
  return { project, siteSheetId, vo, items, documents };
}

function latestPdf(documents: SheetRecord[], type?: string) {
  return documents
    .filter((document) => !type || document.document_type === type)
    .reverse()
    .find((document) => text(document.pdf_url));
}

function publicPayload(project: PublicProject, vo: VoRecord, items: VoItemRecord[], documents: SheetRecord[]) {
  const voSheet = latestPdf(documents, "vo-sheet") || latestPdf(documents);
  const approvalPdf = latestPdf(documents, "approval");
  return {
    project: {
      project_id: project.project_id,
      name: project.name || project.project_id,
      client: project.client || "",
    },
    vo: {
      vo_id: vo.vo_id,
      vo_type: vo.vo_type || "",
      title: vo.title || "",
      description: vo.description || "",
      status: vo.status || "pending_approval",
      client_name: vo.client_name || project.client || "",
      approval_deadline: vo.approval_deadline || "",
      grand_total: vo.grand_total || 0,
      net_payable: vo.net_payable || vo.grand_total || 0,
      contract_before: vo.contract_before || 0,
      contract_after: vo.contract_after || 0,
      extension_days: vo.extension_days || 0,
      customer_approved_at: vo.customer_approved_at || "",
      customer_approved_by: vo.customer_approved_by || "",
      customer_approval_note: vo.customer_approval_note || "",
      pdf_url: text(voSheet?.pdf_url),
      approval_pdf_url: text(approvalPdf?.pdf_url),
      items: items.map((item) => ({
        item_no: item.item_no,
        description: item.description || "",
        unit: item.unit || "",
        quantity: item.quantity || 0,
        unit_price: item.unit_price || 0,
        amount: item.amount || 0,
      })),
    },
  };
}

async function getVoFolder(project: PublicProject, voId: string) {
  const rootFolderId = text(project.drive_folder_id);
  if (!rootFolderId) return null;
  const voRoot = await findOrCreateFolder("Variation Orders", rootFolderId);
  const voFolder = await findOrCreateFolder(safeFolderName(voId), voRoot.id || rootFolderId);
  return voFolder.id || null;
}

async function insertApprovalDocument({
  project,
  siteSheetId,
  vo,
  items,
  approvedBy,
}: {
  project: PublicProject;
  siteSheetId: string;
  vo: VoRecord;
  items: VoItemRecord[];
  approvedBy: string;
}) {
  const documentNo = `${vo.vo_id}-APPROVAL`;
  const html = buildApprovalCertificateHtml({ vo, items, project });
  let pdfFileId = "";
  let pdfUrl = "";
  const voFolderId = await getVoFolder(project, vo.vo_id);
  try {
    if (voFolderId) {
      const pdfBuffer = await renderHtmlToPdfBuffer(html, documentNo);
      const uploaded = await uploadFile(`${documentNo}.pdf`, "application/pdf", pdfBuffer, voFolderId);
      pdfFileId = uploaded.id || "";
      pdfUrl = uploaded.webViewLink || uploaded.webContentLink || "";
    }
  } catch (error) {
    console.warn(`Failed to render/upload VO approval PDF ${documentNo}:`, error);
  }

  await insert("VO_Documents", {
    document_id: `VOD-${Date.now()}`,
    vo_id: vo.vo_id,
    project_id: project.project_id,
    document_type: "approval",
    document_no: documentNo,
    title: "หนังสือรับรองการอนุมัติงานเพิ่ม-ลด",
    html_snapshot: html,
    pdf_file_id: pdfFileId,
    pdf_url: pdfUrl,
    created_by_name: approvedBy,
    created_by_email: "",
  }, siteSheetId);

  return { html, pdfUrl, pdfFileId };
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const { projectId, token } = await params;
    const context = await getPublicContext(decodeURIComponent(projectId), decodeURIComponent(token));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    return NextResponse.json({ success: true, data: publicPayload(context.project, context.vo, context.items, context.documents) });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "เปิดรายการอนุมัติ VO ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const { projectId, token } = await params;
    const context = await getPublicContext(decodeURIComponent(projectId), decodeURIComponent(token));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const approvedBy = text(body.approved_by) || text(context.vo.client_name) || text(context.project.client) || "ลูกค้า";
    const approvalNote = text(body.approval_note) || "ลูกค้ากดอนุมัติผ่านลิงก์ LINE";
    const approvedAt = new Date().toISOString();
    const currentStatus = text(context.vo.status);

    if (currentStatus === "approved") {
      return NextResponse.json({ success: true, data: publicPayload(context.project, context.vo, context.items, context.documents) });
    }
    if (currentStatus !== "pending_approval") {
      return NextResponse.json({ error: "VO นี้ไม่ได้อยู่ในสถานะรออนุมัติ" }, { status: 400 });
    }

    const evidencePayload = {
      method: "customer_public_link",
      client_approved_by: approvedBy,
      client_approved_email: "",
      client_approved_date: approvedAt.slice(0, 10),
      channel: "LINE approval link",
      evidence_type: "digital_consent",
      evidence_description: approvalNote,
      digital_consent: true,
      approved_at: approvedAt,
    };
    const patch = {
      status: "approved",
      evidence_json: safeJsonStringify(evidencePayload),
      task_plan_status: "pending_plan",
      customer_approved_at: approvedAt,
      customer_approved_by: approvedBy,
      customer_approval_note: approvalNote,
    };

    const nextVo = { ...context.vo, ...patch } as VoRecord;
    await update("Variation_Orders", Number(context.vo._rowIndex), patch, context.siteSheetId);
    const approvalDocument = await insertApprovalDocument({
      project: context.project,
      siteSheetId: context.siteSheetId,
      vo: nextVo,
      items: context.items,
      approvedBy,
    });
    const documents = [
      ...context.documents,
      { document_type: "approval", pdf_url: approvalDocument.pdfUrl, pdf_file_id: approvalDocument.pdfFileId },
    ];

    await writeAuditLog({
      actor: { name: approvedBy, role: "Customer" },
      projectId: context.project.project_id,
      module: "variation_orders",
      action: "customer_approved_via_link",
      targetId: context.vo.vo_id,
      summary: `ลูกค้าอนุมัติ VO ผ่านลิงก์ LINE: ${context.vo.vo_id}`,
      before: context.vo,
      after: patch,
    });

    const lineGroupId = text(context.vo.line_group_id);
    if (lineGroupId) {
      await sendLineMessages([buildVoApprovedLineFlex({
        projectName: text(context.project.name),
        projectId: context.project.project_id,
        voId: context.vo.vo_id,
        title: text(context.vo.title),
        approvedBy,
        approvedAt,
        total: context.vo.grand_total,
        pdfUrl: approvalDocument.pdfUrl || text(latestPdf(context.documents, "vo-sheet")?.pdf_url),
      })], lineGroupId).catch((error) => console.warn("Failed to notify LINE after VO approval:", error));
    }

    return NextResponse.json({
      success: true,
      data: publicPayload(context.project, nextVo, context.items, documents),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกอนุมัติ VO ไม่สำเร็จ" }, { status: 500 });
  }
}
