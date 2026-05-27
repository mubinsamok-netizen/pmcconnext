import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auditLog";
import { downloadFile, findOrCreateFolder, uploadFile } from "@/lib/drive";
import { sendLineMessages } from "@/lib/line";
import { hasPermission, permissionDeniedMessage, type AppPermission } from "@/lib/permissions";
import { renderHtmlToPdfBuffer } from "@/lib/pdfRenderer";
import { getPublicAppOrigin } from "@/lib/publicUrl";
import { findAllBatch, findAllMaster, findAllRaw, insert, update } from "@/lib/sheetsCrud";
import { getErrorMessage, getSiteApiContext, makeId } from "@/lib/siteApi";
import {
  MEMO_TYPE_LABELS,
  buildMemoAcknowledgementLineFlex,
  buildMemoAcknowledgementLineMessage,
  buildMemoPdfHtml,
  boolText,
  createMemoAcknowledgementToken,
  createMemoDocumentNo,
  numberValue,
  parseMemoAttachments,
  safeJsonStringify,
  textValue,
  todayBangkok,
  type MemoAttachment,
  type MemoEvidenceRecord,
  type MemoRecord,
  type MemoUploadPayload,
} from "@/lib/siteMemos";

type RouteContext = {
  session: {
    user: {
      email?: string | null;
      name?: string | null;
      role?: string | null;
      googleSub?: string | null;
    };
  };
  project: Record<string, string | number | undefined> & { project_id: string; line_group_id?: string; line_group_name?: string };
  siteSheetId: string;
};

type SheetRecord = Record<string, string | number | undefined>;

const MEMO_LINE_TEST_GROUP_ID = process.env.MEMO_LINE_TEST_GROUP_ID || process.env.DECISION_LINE_TEST_GROUP_ID || "C512b905da442874d3bcc318e02a731c9";

function safeFolderName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "Other";
}

function isMemoLineTestMode() {
  return process.env.MEMO_LINE_TEST_MODE !== "false";
}

function lineTargetFor(context: RouteContext) {
  if (isMemoLineTestMode()) return MEMO_LINE_TEST_GROUP_ID;
  return textValue(context.project.line_group_id);
}

function requirePermission(context: RouteContext, permission: AppPermission) {
  if (!hasPermission(context.session.user.role, permission)) {
    return NextResponse.json({ error: permissionDeniedMessage(permission) }, { status: 403 });
  }
  return null;
}

function actor(context: RouteContext) {
  return {
    email: context.session.user.email || "",
    name: context.session.user.name || "",
    role: context.session.user.role || "",
    googleSub: context.session.user.googleSub || "",
  };
}

async function getFallbackRowIndex(context: RouteContext, memo: MemoRecord) {
  const numericRowIndex = Number(memo._rowIndex);
  if (Number.isFinite(numericRowIndex)) return numericRowIndex;

  const rawRows = await findAllRaw("Site_Memos", context.siteSheetId);
  return rawRows.find((row) => row.memo_id === memo.memo_id)?._rowIndex;
}

async function updateSiteMemo(context: RouteContext, memo: MemoRecord, patch: Record<string, string | number>) {
  const memoId = textValue(memo.memo_id);
  await update(
    "Site_Memos",
    memoId || memo._rowIndex || "",
    patch,
    context.siteSheetId,
    memoId ? await getFallbackRowIndex(context, memo) : memo._rowIndex
  );
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
  return (Array.isArray(value) ? value : []) as MemoUploadPayload[];
}

function isImageMimeType(value?: string | number) {
  return String(value || "").startsWith("image/");
}

async function withEmbeddableImageUrl<T extends { file_id?: string; file_url?: string; mime_type?: string | number }>(item: T) {
  if (!item.file_id || !isImageMimeType(item.mime_type)) return item;
  try {
    const file = await downloadFile(item.file_id);
    const mimeType = file.mimeType || String(item.mime_type || "image/jpeg");
    return {
      ...item,
      file_url: `data:${mimeType};base64,${file.buffer.toString("base64")}`,
      mime_type: mimeType,
    };
  } catch (error) {
    console.warn(`Failed to embed memo image ${item.file_id}:`, error);
    return item;
  }
}

async function prepareMemoPdfAssets(memo: MemoRecord, evidence: MemoEvidenceRecord[]) {
  const attachments = await Promise.all(
    parseMemoAttachments(memo.attachments_json).map((item) => withEmbeddableImageUrl(item))
  );
  const hydratedEvidence = await Promise.all(evidence.map((item) => withEmbeddableImageUrl(item)));

  return {
    memo: {
      ...memo,
      attachments_json: safeJsonStringify(attachments),
    },
    evidence: hydratedEvidence,
  };
}

async function getMemoData(context: RouteContext) {
  const [siteRows, auditLogs] = await Promise.all([
    findAllBatch(["Site_Memos", "Site_Memo_Evidence"], context.siteSheetId) as unknown as Promise<Record<string, SheetRecord[]>>,
    findAllMaster("AuditLogs") as Promise<SheetRecord[]>,
  ]);
  const memoRows = (siteRows.Site_Memos || []) as MemoRecord[];
  const evidenceRows = (siteRows.Site_Memo_Evidence || []) as MemoEvidenceRecord[];
  const projectId = context.project.project_id;

  return {
    memos: memoRows
      .filter((row) => row.project_id === projectId)
      .sort((a, b) => new Date(String(b.updated_at || b.created_at || 0)).getTime() - new Date(String(a.updated_at || a.created_at || 0)).getTime()),
    evidence: evidenceRows
      .filter((row) => row.project_id === projectId)
      .sort((a, b) => new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime()),
    auditLogs: auditLogs
      .filter((log) => log.project_id === projectId && log.module === "site_memos")
      .sort((a, b) => new Date(String(b.timestamp || 0)).getTime() - new Date(String(a.timestamp || 0)).getTime())
      .slice(0, 160),
  };
}

async function getMemoRootFolder(context: RouteContext) {
  const rootFolderId = String(context.project.drive_folder_id || "").trim();
  if (!rootFolderId) return null;
  const memoRoot = await findOrCreateFolder("Site Memos", rootFolderId);
  return memoRoot.id || rootFolderId;
}

async function getMemoFolder(context: RouteContext, memoId: string) {
  const rootFolderId = await getMemoRootFolder(context);
  if (!rootFolderId) return null;
  const memoFolder = await findOrCreateFolder(safeFolderName(memoId), rootFolderId);
  return memoFolder.id || rootFolderId;
}

async function uploadMemoFiles(context: RouteContext, memoId: string, folderName: string, uploads: MemoUploadPayload[]) {
  const files = uploads.filter((file) => file?.dataUrl && file.name).slice(0, 10);
  if (files.length === 0) return [] as MemoAttachment[];

  const memoFolderId = await getMemoFolder(context, memoId);
  if (!memoFolderId) throw new Error("Project Drive folder is not configured");
  const targetFolder = await findOrCreateFolder(folderName, memoFolderId);
  const folderId = targetFolder.id || memoFolderId;

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

  return uploaded.filter((file): file is MemoAttachment => Boolean(file));
}

async function issueMemoPdfFor(req: Request, context: RouteContext, memo: MemoRecord, data: Awaited<ReturnType<typeof getMemoData>>, status: string = "issued") {
  const memoFolderId = await getMemoFolder(context, memo.memo_id);
  if (!memoFolderId) throw new Error("Project Drive folder is not configured");

  const documentNo = textValue(memo.document_no) || createMemoDocumentNo(context.project.project_id, data.memos);
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  const pdfAssets = await prepareMemoPdfAssets(
    { ...memo, document_no: documentNo, status },
    data.evidence
  );
  const html = buildMemoPdfHtml({
    memo: pdfAssets.memo,
    project: context.project,
    logoUrl: `${origin}/logo.png`,
    evidence: pdfAssets.evidence,
  });
  const pdfFolder = await findOrCreateFolder("PDF", memoFolderId);
  const pdfBuffer = await renderHtmlToPdfBuffer(html, documentNo);
  const uploaded = await uploadFile(`${documentNo}.pdf`, "application/pdf", pdfBuffer, pdfFolder.id || memoFolderId);

  return {
    patch: {
      document_no: documentNo,
      status,
      pdf_file_id: uploaded.id || "",
      pdf_url: uploaded.webViewLink || uploaded.webContentLink || "",
      issued_at: new Date().toISOString(),
    },
    html,
  };
}

async function handleCreateMemo(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "siteMemo.create");
  if (forbidden) return forbidden;

  const title = textValue(body.title);
  const detail = textValue(body.detail);
  if (!title || !detail) return NextResponse.json({ error: "กรุณากรอกเรื่องและรายละเอียด Memo" }, { status: 400 });

  const memoId = makeId("MEMO");
  const attachments = await uploadMemoFiles(context, memoId, "Attachments", parseUploads(body.attachment_uploads));
  const hasTimeImpact = boolText(body.has_time_impact);
  const payload = {
    memo_id: memoId,
    project_id: context.project.project_id,
    document_no: "",
    memo_type: textValue(body.memo_type) || "customer_notice",
    related_module: textValue(body.related_module) || "other",
    related_ref: textValue(body.related_ref),
    title,
    event_date: textValue(body.event_date) || todayBangkok(),
    issue_date: textValue(body.issue_date) || todayBangkok(),
    detail,
    requires_customer_ack: boolText(body.requires_customer_ack),
    has_time_impact: hasTimeImpact,
    extension_days: hasTimeImpact === "TRUE" ? String(Math.max(0, Math.round(numberValue(body.extension_days)))) : "0",
    extension_reason: textValue(body.extension_reason),
    status: "draft",
    customer_name: textValue(body.customer_name) || String(context.project.client || ""),
    prepared_by_name: context.session.user.name || "",
    prepared_by_email: context.session.user.email || "",
    prepared_by_role: context.session.user.role || "",
    attachments_json: safeJsonStringify(attachments),
    pdf_file_id: "",
    pdf_url: "",
    issued_at: "",
    acknowledgement_token: "",
    acknowledgement_url: "",
    sent_to_customer_at: "",
    line_group_id: "",
    line_message: "",
    acknowledged_by: "",
    acknowledged_channel: "",
    acknowledged_date: "",
    acknowledgement_note: "",
  };

  const result = await insert("Site_Memos", payload, context.siteSheetId);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "site_memos",
    action: "memo_created",
    targetId: memoId,
    summary: `สร้าง Memo: ${title}`,
    after: payload,
  });

  return NextResponse.json({ success: true, data: result.inserted });
}

async function handleIssuePdf(body: Record<string, unknown>, context: RouteContext, req: Request) {
  const forbidden = requirePermission(context, "siteMemo.issue");
  if (forbidden) return forbidden;

  const memoId = textValue(body.memo_id);
  const data = await getMemoData(context);
  const memo = data.memos.find((item) => item.memo_id === memoId);
  if (!memo?._rowIndex) return NextResponse.json({ error: "ไม่พบ Memo" }, { status: 404 });

  let issued;
  try {
    issued = await issueMemoPdfFor(req, context, memo, data, "issued");
  } catch (error) {
    if (getErrorMessage(error).includes("Project Drive folder")) {
      return NextResponse.json({ error: "Project Drive folder is not configured" }, { status: 400 });
    }
    throw error;
  }
  const patch = issued.patch;
  const documentNo = patch.document_no;
  const pdfUrl = patch.pdf_url;
  const html = issued.html;
  await updateSiteMemo(context, memo, patch);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "site_memos",
    action: "pdf_issued",
    targetId: memoId,
    summary: `ออก PDF Memo ${documentNo}`,
    before: memo,
    after: { ...patch, pdf_url: pdfUrl },
  });

  return NextResponse.json({
    success: true,
    data: { ...memo, ...patch },
    document_html: html,
  });
}

async function handleSendAcknowledgement(body: Record<string, unknown>, context: RouteContext, req: Request) {
  const forbidden = requirePermission(context, "siteMemo.issue");
  if (forbidden) return forbidden;

  const memoId = textValue(body.memo_id);
  const data = await getMemoData(context);
  const memo = data.memos.find((item) => item.memo_id === memoId);
  if (!memo?._rowIndex) return NextResponse.json({ error: "ไม่พบ Memo" }, { status: 404 });
  if (["acknowledged", "extension_approved", "closed", "rejected"].includes(String(memo.status || ""))) {
    return NextResponse.json({ error: "Memo รายการนี้ปิดหรือรับทราบแล้ว" }, { status: 400 });
  }

  let pdfPatch: Record<string, string> = {};
  let nextMemo = memo;
  if (!textValue(memo.pdf_url)) {
    try {
      const issued = await issueMemoPdfFor(req, context, memo, data, "issued");
      pdfPatch = issued.patch;
      nextMemo = { ...memo, ...pdfPatch };
    } catch (error) {
      if (getErrorMessage(error).includes("Project Drive folder")) {
        return NextResponse.json({ error: "Project Drive folder is not configured" }, { status: 400 });
      }
      throw error;
    }
  }

  const acknowledgementToken = textValue(nextMemo.acknowledgement_token) || createMemoAcknowledgementToken();
  const acknowledgementOrigin = getPublicAppOrigin({ request: req, origin: body.origin });
  if (!acknowledgementOrigin) return NextResponse.json({ error: "ไม่พบ URL ระบบสำหรับสร้างลิงก์รับทราบ" }, { status: 400 });
  const acknowledgementUrl = `${acknowledgementOrigin}/memo-acknowledgement/${encodeURIComponent(context.project.project_id)}/${encodeURIComponent(acknowledgementToken)}`;
  nextMemo = { ...nextMemo, acknowledgement_token: acknowledgementToken, acknowledgement_url: acknowledgementUrl };

  const message = buildMemoAcknowledgementLineMessage({
    projectName: textValue(context.project.name),
    projectId: context.project.project_id,
    documentNo: textValue(nextMemo.document_no),
    title: textValue(nextMemo.title),
  });
  const flexMessage = buildMemoAcknowledgementLineFlex({
    projectName: textValue(context.project.name),
    projectId: context.project.project_id,
    documentNo: textValue(nextMemo.document_no),
    memoType: MEMO_TYPE_LABELS[String(nextMemo.memo_type || "")] || textValue(nextMemo.memo_type),
    title: textValue(nextMemo.title),
    issueDate: textValue(nextMemo.issue_date),
    detail: textValue(nextMemo.detail),
    pdfUrl: textValue(nextMemo.pdf_url),
    acknowledgementUrl,
  });
  const targetLineGroupId = lineTargetFor(context);

  await sendLineMessages([flexMessage], targetLineGroupId);

  const patch = {
    ...pdfPatch,
    status: "sent",
    acknowledgement_token: acknowledgementToken,
    acknowledgement_url: acknowledgementUrl,
    sent_to_customer_at: new Date().toISOString(),
    line_group_id: targetLineGroupId,
    line_message: message,
  };
  await updateSiteMemo(context, memo, patch);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "site_memos",
    action: "line_acknowledgement_sent",
    targetId: memoId,
    summary: `ส่ง LINE ให้ลูกค้ารับทราบ Memo: ${memo.title || memoId}`,
    before: memo,
    after: { ...patch, test_mode: isMemoLineTestMode() },
  });

  return NextResponse.json({
    success: true,
    data: {
      test_mode: isMemoLineTestMode(),
      line_group_id: targetLineGroupId,
      acknowledgement_url: acknowledgementUrl,
    },
  });
}

async function handleAcknowledge(body: Record<string, unknown>, context: RouteContext, req: Request) {
  const forbidden = requirePermission(context, "siteMemo.acknowledge");
  if (forbidden) return forbidden;

  const memoId = textValue(body.memo_id);
  const data = await getMemoData(context);
  const memo = data.memos.find((item) => item.memo_id === memoId);
  if (!memo?._rowIndex) return NextResponse.json({ error: "ไม่พบ Memo" }, { status: 404 });
  if (!memo.pdf_url) return NextResponse.json({ error: "กรุณาออก PDF Memo ก่อนบันทึกหลักฐานรับทราบ" }, { status: 400 });

  const evidenceUploads = await uploadMemoFiles(context, memoId, "Customer Acknowledgement", parseUploads(body.evidence_uploads));
  if (evidenceUploads.length === 0) {
    return NextResponse.json({ error: "กรุณาแนบหลักฐานลูกค้ารับทราบ" }, { status: 400 });
  }

  const acknowledgedDate = textValue(body.acknowledged_date) || todayBangkok();
  const acknowledgedBy = textValue(body.acknowledged_by) || textValue(memo.customer_name) || String(context.project.client || "");
  const channel = textValue(body.channel) || "LINE";
  const notes = textValue(body.notes);
  const evidenceRows = evidenceUploads.map((file) => ({
    evidence_id: makeId("MME"),
    memo_id: memoId,
    project_id: context.project.project_id,
    channel,
    acknowledged_by: acknowledgedBy,
    acknowledged_date: acknowledgedDate,
    file_name: file.file_name,
    file_id: file.file_id,
    file_url: file.file_url,
    mime_type: file.mime_type,
    notes,
    uploaded_by_name: context.session.user.name || "",
    uploaded_by_email: context.session.user.email || "",
  }));
  await Promise.all(evidenceRows.map((row) => insert("Site_Memo_Evidence", row, context.siteSheetId)));

  const nextStatus = String(body.extension_approved || "").toLowerCase() === "true" ? "extension_approved" : "acknowledged";
  const patch = {
    status: nextStatus,
    acknowledged_by: acknowledgedBy,
    acknowledged_channel: channel,
    acknowledged_date: acknowledgedDate,
    acknowledgement_note: notes,
  };
  await updateSiteMemo(context, memo, patch);

  const memoFolderId = await getMemoFolder(context, memoId);
  const documentNo = textValue(memo.document_no) || createMemoDocumentNo(context.project.project_id, data.memos);
  let refreshedPdf: Record<string, string> = {};
  if (memoFolderId) {
    const origin = req.headers.get("origin") || new URL(req.url).origin;
    const pdfAssets = await prepareMemoPdfAssets(
      { ...memo, ...patch, document_no: documentNo },
      [...data.evidence, ...evidenceRows]
    );
    const html = buildMemoPdfHtml({
      memo: pdfAssets.memo,
      project: context.project,
      logoUrl: `${origin}/logo.png`,
      evidence: pdfAssets.evidence,
    });
    const pdfFolder = await findOrCreateFolder("PDF", memoFolderId);
    const pdfBuffer = await renderHtmlToPdfBuffer(html, documentNo);
    const uploaded = await uploadFile(`${documentNo}.pdf`, "application/pdf", pdfBuffer, pdfFolder.id || memoFolderId);
    refreshedPdf = {
      document_no: documentNo,
      pdf_file_id: uploaded.id || "",
      pdf_url: uploaded.webViewLink || uploaded.webContentLink || "",
    };
    await updateSiteMemo(context, memo, refreshedPdf);
  }

  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "site_memos",
    action: "customer_acknowledged",
    targetId: memoId,
    summary: `แนบหลักฐานรับทราบ Memo ${memo.document_no || memoId}`,
    before: memo,
    after: { ...patch, ...refreshedPdf, evidenceCount: evidenceUploads.length },
  });

  return NextResponse.json({ success: true, data: { ...memo, ...patch, ...refreshedPdf }, evidence: evidenceUploads });
}

async function handleUpdateStatus(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "siteMemo.acknowledge");
  if (forbidden) return forbidden;

  const memoId = textValue(body.memo_id);
  const status = textValue(body.status);
  const allowed = new Set(["sent", "rejected", "closed", "extension_approved"]);
  if (!allowed.has(status)) return NextResponse.json({ error: "สถานะ Memo ไม่ถูกต้อง" }, { status: 400 });

  const data = await getMemoData(context);
  const memo = data.memos.find((item) => item.memo_id === memoId);
  if (!memo?._rowIndex) return NextResponse.json({ error: "ไม่พบ Memo" }, { status: 404 });

  await updateSiteMemo(context, memo, { status });
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "site_memos",
    action: "status_updated",
    targetId: memoId,
    summary: `อัปเดตสถานะ Memo เป็น ${status}`,
    before: memo,
    after: { status },
  });

  return NextResponse.json({ success: true, data: { ...memo, status } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const routeContext = context as RouteContext;
    const data = await getMemoData(routeContext);

    return NextResponse.json({
      success: true,
      project: routeContext.project,
      data: data.memos,
      evidence: data.evidence,
      audit_logs: data.auditLogs,
      line: {
        test_mode: isMemoLineTestMode(),
        target_group_id: lineTargetFor(routeContext),
        target_group_name: isMemoLineTestMode() ? "Memo LINE Test Group" : textValue(routeContext.project.line_group_name),
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
    const action = textValue(body.action);

    if (action === "create_memo") return handleCreateMemo(body, routeContext);
    if (action === "issue_pdf") return handleIssuePdf(body, routeContext, req);
    if (action === "send_acknowledgement") return handleSendAcknowledgement(body, routeContext, req);
    if (action === "acknowledge") return handleAcknowledge(body, routeContext, req);
    if (action === "update_status") return handleUpdateStatus(body, routeContext);

    return NextResponse.json({ error: "ไม่รู้จัก action นี้" }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
