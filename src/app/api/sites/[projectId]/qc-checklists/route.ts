import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { writeAuditLog } from "@/lib/auditLog";
import { downloadFile, findOrCreateFolder, uploadFile } from "@/lib/drive";
import { sendLineMessages } from "@/lib/line";
import { renderHtmlToPdfBuffer } from "@/lib/pdfRenderer";
import {
  QC_APPROVAL_LABELS,
  QC_STATUS_LABELS,
  QC_TEMPLATES,
  buildQcLineFlex,
  buildQcLineMessage,
  buildQcPdfHtml,
  createQcApprovalToken,
  createQcDocumentNo,
  createQcId,
  getQcApprovalReadiness,
  parseQcEvidence,
  parseQcItems,
  safeJsonStringify,
  templateToItems,
  type QcChecklistRecord,
  type QcEvidenceFile,
  type QcUploadPayload,
} from "@/lib/qcChecklists";
import { findAll, findAllRaw, insert, update } from "@/lib/sheetsCrud";
import { getErrorMessage, getSiteApiContext } from "@/lib/siteApi";

type RouteContext = Awaited<ReturnType<typeof getSiteApiContext>> & {
  session: {
    user: {
      email?: string | null;
      name?: string | null;
      role?: string | null;
      googleSub?: string | null;
    };
  };
  project: Record<string, string | number | undefined> & {
    project_id: string;
    name?: string;
    line_group_id?: string;
    line_group_name?: string;
  };
  siteSheetId: string;
};

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");
const QC_LINE_TEST_GROUP_ID = process.env.QC_LINE_TEST_GROUP_ID || process.env.DECISION_LINE_TEST_GROUP_ID || "C512b905da442874d3bcc318e02a731c9";

function getLogoDataUrl() {
  try {
    const logo = fs.readFileSync(LOGO_PATH);
    return `data:image/png;base64,${logo.toString("base64")}`;
  } catch {
    return "";
  }
}

function text(value: unknown) {
  return String(value || "").trim();
}

function safeFolderName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "Other";
}

function actor(context: RouteContext) {
  return {
    email: context.session.user.email || "",
    name: context.session.user.name || "",
    role: context.session.user.role || "",
    googleSub: context.session.user.googleSub || "",
  };
}

function isQcLineTestMode() {
  return process.env.QC_LINE_TEST_MODE !== "false";
}

function lineTargetFor(context: RouteContext) {
  if (isQcLineTestMode()) return QC_LINE_TEST_GROUP_ID;
  return text(context.project.line_group_id);
}

function todayBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function decodeDataUrl(dataUrl?: string) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function parseUploads(value: unknown) {
  return (Array.isArray(value) ? value : []) as QcUploadPayload[];
}

function normalizeChecklist(row: QcChecklistRecord) {
  return {
    ...row,
    status: row.status || "draft",
    approval_status: row.approval_status || "not_sent",
    items_json: row.items_json || "[]",
    evidence_files_json: row.evidence_files_json || "[]",
    active: row.active || "TRUE",
  };
}

async function getRows(context: RouteContext) {
  return await findAll("QC_Checklists", context.siteSheetId) as unknown as QcChecklistRecord[];
}

async function getFallbackRowIndex(context: RouteContext, checklist: QcChecklistRecord) {
  const numericRowIndex = Number(checklist._rowIndex);
  if (Number.isFinite(numericRowIndex)) return numericRowIndex;

  const rawRows = await findAllRaw("QC_Checklists", context.siteSheetId);
  return rawRows.find((row) => row.qc_id === checklist.qc_id)?._rowIndex;
}

async function updateQcChecklist(context: RouteContext, checklist: QcChecklistRecord, patch: Record<string, string>) {
  await update(
    "QC_Checklists",
    checklist.qc_id || checklist._rowIndex || "",
    patch,
    context.siteSheetId,
    await getFallbackRowIndex(context, checklist)
  );
}

async function getQcRootFolder(context: RouteContext) {
  const rootFolderId = text(context.project.drive_folder_id);
  if (!rootFolderId) return null;
  const qcRoot = await findOrCreateFolder("QC Checklists", rootFolderId);
  return qcRoot.id || rootFolderId;
}

async function getQcFolder(context: RouteContext, qcId: string) {
  const rootFolderId = await getQcRootFolder(context);
  if (!rootFolderId) return null;
  const qcFolder = await findOrCreateFolder(safeFolderName(qcId), rootFolderId);
  return qcFolder.id || rootFolderId;
}

async function uploadQcFiles(context: RouteContext, qcId: string, uploads: QcUploadPayload[]) {
  const files = uploads.filter((file) => file?.dataUrl && file.name).slice(0, 12);
  if (files.length === 0) return [] as QcEvidenceFile[];

  const qcFolderId = await getQcFolder(context, qcId);
  if (!qcFolderId) throw new Error("Project Drive folder is not configured");
  const targetFolder = await findOrCreateFolder("Evidence", qcFolderId);
  const folderId = targetFolder.id || qcFolderId;

  const uploaded = await Promise.all(files.map(async (file) => {
    const decoded = decodeDataUrl(file.dataUrl);
    if (!decoded || !file.name) return null;
    const uploadedFile = await uploadFile(
      `${Date.now()}-${safeFolderName(file.name)}`,
      file.type || decoded.mimeType || "application/octet-stream",
      decoded.buffer,
      folderId
    );
    return {
      file_id: uploadedFile.id || "",
      file_name: file.name,
      file_url: uploadedFile.webViewLink || uploadedFile.webContentLink || "",
      mime_type: file.type || decoded.mimeType || "application/octet-stream",
    };
  }));

  return uploaded.filter((file): file is QcEvidenceFile => Boolean(file));
}

async function attachEvidenceDataUrls(checklist: QcChecklistRecord) {
  const evidence = parseQcEvidence(checklist.evidence_files_json);
  const hydrated = await Promise.all(evidence.map(async (file) => {
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

function resultSummary(checklist: QcChecklistRecord) {
  return getQcApprovalReadiness(parseQcItems(checklist.items_json)).summary;
}

function approvalReadiness(checklist: QcChecklistRecord) {
  return getQcApprovalReadiness(parseQcItems(checklist.items_json));
}

async function issuePdfFor(context: RouteContext, current: QcChecklistRecord, rows: QcChecklistRecord[]) {
  if (!current._rowIndex) throw new Error("QC checklist row is missing");
  const qcFolderId = await getQcFolder(context, current.qc_id);
  if (!qcFolderId) throw new Error("Project Drive folder is not configured");

  const documentNo = text(current.document_no) || createQcDocumentNo(context.project.project_id, rows);
  const issuedAt = new Date().toISOString();
  const checklistForPdf = await attachEvidenceDataUrls({
    ...current,
    document_no: documentNo,
    issued_at: issuedAt,
    issued_by_name: context.session.user.name || "",
    issued_by_email: context.session.user.email || "",
  });
  const html = buildQcPdfHtml({
    checklist: checklistForPdf,
    project: context.project,
    logoUrl: getLogoDataUrl(),
  });

  const pdfFolder = await findOrCreateFolder("PDF", qcFolderId);
  const pdfBuffer = await renderHtmlToPdfBuffer(html, documentNo);
  const uploaded = await uploadFile(`${documentNo}.pdf`, "application/pdf", pdfBuffer, pdfFolder.id || qcFolderId);
  return {
    document_no: documentNo,
    pdf_file_id: uploaded.id || "",
    pdf_url: uploaded.webViewLink || uploaded.webContentLink || "",
    issued_at: issuedAt,
    issued_by_name: context.session.user.name || "",
    issued_by_email: context.session.user.email || "",
  };
}

async function handleCreate(body: Record<string, unknown>, context: RouteContext) {
  const templateId = text(body.template_id) || QC_TEMPLATES[0].template_id;
  const template = QC_TEMPLATES.find((item) => item.template_id === templateId) || QC_TEMPLATES[0];
  const qcId = createQcId();
  const payload = {
    qc_id: qcId,
    project_id: context.project.project_id,
    template_id: template.template_id,
    document_no: "",
    category: text(body.category) || template.category,
    phase: text(body.phase) || template.phase,
    title: text(body.title) || template.title,
    status: "in_progress",
    approval_status: "not_sent",
    inspection_date: text(body.inspection_date) || todayBangkok(),
    inspected_by_name: text(body.inspected_by_name) || context.session.user.name || "",
    inspected_by_email: context.session.user.email || "",
    customer_approved_at: "",
    customer_approved_by: "",
    customer_approval_note: "",
    approval_token: "",
    approval_url: "",
    items_json: safeJsonStringify(templateToItems(template.template_id)),
    evidence_files_json: "[]",
    pdf_file_id: "",
    pdf_url: "",
    line_group_id: "",
    line_message: "",
    sent_to_customer_at: "",
    issued_at: "",
    issued_by_name: "",
    issued_by_email: "",
    notes: text(body.notes),
    active: "TRUE",
  };

  await insert("QC_Checklists", payload, context.siteSheetId);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "qc_checklists",
    action: "created",
    targetId: qcId,
    summary: `สร้าง QC Checklist: ${payload.title}`,
    after: payload,
  });

  return NextResponse.json({ success: true, data: payload });
}

async function handleSave(body: Record<string, unknown>, context: RouteContext) {
  const qcId = text(body.qc_id);
  const rows = await getRows(context);
  const current = rows.find((row) => row.qc_id === qcId && row.project_id === context.project.project_id);
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบ QC Checklist" }, { status: 404 });

  const currentEvidence = parseQcEvidence(current.evidence_files_json);
  const uploadedEvidence = await uploadQcFiles(context, qcId, parseUploads(body.evidence_uploads));
  const patch = {
    category: text(body.category) || current.category || "",
    phase: text(body.phase) || current.phase || "",
    title: text(body.title) || current.title || "",
    status: text(body.status) || current.status || "in_progress",
    approval_status: text(body.approval_status) || current.approval_status || "not_sent",
    inspection_date: text(body.inspection_date) || current.inspection_date || todayBangkok(),
    inspected_by_name: text(body.inspected_by_name) || current.inspected_by_name || context.session.user.name || "",
    notes: text(body.notes),
    items_json: safeJsonStringify(Array.isArray(body.items) ? body.items : parseQcItems(current.items_json)),
    evidence_files_json: safeJsonStringify([...currentEvidence, ...uploadedEvidence]),
  };

  await updateQcChecklist(context, current, patch);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "qc_checklists",
    action: "updated",
    targetId: qcId,
    summary: `อัปเดต QC Checklist: ${patch.title}`,
    before: current,
    after: patch,
  });

  return NextResponse.json({ success: true });
}

async function handleIssuePdf(body: Record<string, unknown>, context: RouteContext) {
  const qcId = text(body.qc_id);
  const rows = await getRows(context);
  const current = rows.find((row) => row.qc_id === qcId && row.project_id === context.project.project_id);
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบ QC Checklist" }, { status: 404 });

  const patch = await issuePdfFor(context, current, rows);
  await updateQcChecklist(context, current, patch);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "qc_checklists",
    action: "pdf_issued",
    targetId: qcId,
    summary: `ออก PDF QC ${patch.document_no}`,
    before: current,
    after: patch,
  });

  return NextResponse.json({ success: true, data: { ...current, ...patch } });
}

async function handleSendApproval(body: Record<string, unknown>, context: RouteContext) {
  const qcId = text(body.qc_id);
  const rows = await getRows(context);
  const current = rows.find((row) => row.qc_id === qcId && row.project_id === context.project.project_id);
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบ QC Checklist" }, { status: 404 });
  const readiness = approvalReadiness(current);
  if (!readiness.ready) return NextResponse.json({ error: readiness.reason || "ต้องตรวจ QC ให้ผ่านครบทุกข้อก่อนส่งให้ลูกค้าอนุมัติ" }, { status: 400 });

  let pdfPatch: Record<string, string> = {};
  let nextRecord = current;
  if (!text(current.pdf_url)) {
    pdfPatch = await issuePdfFor(context, current, rows);
    nextRecord = { ...current, ...pdfPatch };
  }

  const approvalToken = text(nextRecord.approval_token) || createQcApprovalToken();
  const requestOrigin = text(body.origin);
  const configuredOrigin = text(process.env.NEXT_PUBLIC_APP_URL) || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const approvalOrigin = (requestOrigin || configuredOrigin).replace(/\/$/, "");
  const approvalUrl = `${approvalOrigin}/qc-approval/${encodeURIComponent(context.project.project_id)}/${encodeURIComponent(approvalToken)}`;
  nextRecord = { ...nextRecord, approval_token: approvalToken, approval_url: approvalUrl };

  const evidence = parseQcEvidence(nextRecord.evidence_files_json);
  const firstEvidenceUrl = text(evidence.find((file) => file.file_url)?.file_url);
  const lineText = buildQcLineMessage({
    projectName: text(context.project.name),
    projectId: context.project.project_id,
    title: text(nextRecord.title),
    category: text(nextRecord.category),
    phase: text(nextRecord.phase),
    resultSummary: resultSummary(nextRecord),
  });
  const flexMessage = buildQcLineFlex({
    projectName: text(context.project.name),
    projectId: context.project.project_id,
    documentNo: text(nextRecord.document_no),
    title: text(nextRecord.title),
    category: text(nextRecord.category),
    phase: text(nextRecord.phase),
    resultSummary: resultSummary(nextRecord),
    pdfUrl: text(nextRecord.pdf_url),
    evidenceUrl: firstEvidenceUrl,
    approvalUrl,
  });
  const targetLineGroupId = lineTargetFor(context);

  await sendLineMessages([flexMessage], targetLineGroupId);

  const patch = {
    ...pdfPatch,
    status: "sent_to_customer",
    approval_status: "pending",
    approval_token: approvalToken,
    approval_url: approvalUrl,
    sent_to_customer_at: new Date().toISOString(),
    line_group_id: targetLineGroupId,
    line_message: lineText,
  };
  await updateQcChecklist(context, current, patch);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "qc_checklists",
    action: "sent_to_customer",
    targetId: qcId,
    summary: `ส่ง QC ให้ลูกค้าอนุมัติ: ${current.title || qcId}`,
    before: current,
    after: { ...patch, test_mode: isQcLineTestMode() },
  });

  return NextResponse.json({ success: true, data: { ...current, ...patch, test_mode: isQcLineTestMode() } });
}

async function handleApprove(body: Record<string, unknown>, context: RouteContext) {
  const qcId = text(body.qc_id);
  const rows = await getRows(context);
  const current = rows.find((row) => row.qc_id === qcId && row.project_id === context.project.project_id);
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบ QC Checklist" }, { status: 404 });
  const readiness = approvalReadiness(current);
  if (!readiness.ready) return NextResponse.json({ error: readiness.reason || "ต้องตรวจ QC ให้ผ่านครบทุกข้อก่อนบันทึกอนุมัติ" }, { status: 400 });

  const patch = {
    status: "customer_approved",
    approval_status: "approved",
    customer_approved_at: text(body.customer_approved_at) || new Date().toISOString(),
    customer_approved_by: text(body.customer_approved_by) || text(context.project.client),
    customer_approval_note: text(body.customer_approval_note),
  };
  await updateQcChecklist(context, current, patch);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "qc_checklists",
    action: "customer_approved",
    targetId: qcId,
    summary: `ลูกค้าอนุมัติ QC: ${current.title || qcId}`,
    before: current,
    after: patch,
  });

  return NextResponse.json({ success: true });
}

async function handleDelete(body: Record<string, unknown>, context: RouteContext) {
  const qcId = text(body.qc_id);
  const rows = await getRows(context);
  const current = rows.find((row) => row.qc_id === qcId && row.project_id === context.project.project_id);
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบ QC Checklist" }, { status: 404 });

  const approvalStatus = text(current.approval_status) || "not_sent";
  const status = text(current.status);
  if (approvalStatus !== "not_sent" || status === "sent_to_customer" || status === "customer_approved") {
    return NextResponse.json({ error: "ลบไม่ได้ เพราะรายการนี้ถูกส่งให้ลูกค้าหรืออนุมัติแล้ว" }, { status: 400 });
  }

  const patch = { active: "FALSE" };
  await updateQcChecklist(context, current, patch);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "qc_checklists",
    action: "deleted",
    targetId: qcId,
    summary: `ลบ QC Checklist: ${current.title || qcId}`,
    before: current,
    after: patch,
  });

  return NextResponse.json({ success: true });
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    const routeContext = context as RouteContext;
    const rows = await getRows(routeContext);
    const data = rows
      .filter((row) => row.project_id === routeContext.project.project_id && row.active !== "FALSE")
      .map(normalizeChecklist)
      .sort((a, b) => new Date(String(b.created_at || b.inspection_date || 0)).getTime() - new Date(String(a.created_at || a.inspection_date || 0)).getTime());

    return NextResponse.json({
      success: true,
      project: routeContext.project,
      data,
      templates: QC_TEMPLATES,
      statusLabels: QC_STATUS_LABELS,
      approvalLabels: QC_APPROVAL_LABELS,
      line: {
        test_mode: isQcLineTestMode(),
        target_group_id: lineTargetFor(routeContext),
        target_group_name: isQcLineTestMode() ? "QC LINE Test Group" : text(routeContext.project.line_group_name),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    const routeContext = context as RouteContext;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = text(body.action);

    if (action === "create") return handleCreate(body, routeContext);
    if (action === "save") return handleSave(body, routeContext);
    if (action === "issue_pdf") return handleIssuePdf(body, routeContext);
    if (action === "send_approval") return handleSendApproval(body, routeContext);
    if (action === "approve") return handleApprove(body, routeContext);
    if (action === "delete") return handleDelete(body, routeContext);

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
