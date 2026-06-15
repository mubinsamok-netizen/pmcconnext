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
  addCalendarDays,
  createNextVoId,
  type VoRecord,
} from "@/lib/variationOrders";
import {
  MEMO_TYPE_LABELS,
  buildMemoAcknowledgementLineFlex,
  buildMemoAcknowledgementLineMessage,
  buildMemoPdfHtml,
  boolText,
  createMemoAcknowledgementToken,
  createMemoDocumentNo,
  isTrueText,
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
type LinkedVoSummary = {
  vo_id: string;
  title?: string;
  status?: string;
};

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
    findAllBatch(["Site_Memos", "Site_Memo_Evidence", "Variation_Orders"], context.siteSheetId) as unknown as Promise<Record<string, SheetRecord[]>>,
    findAllMaster("AuditLogs") as Promise<SheetRecord[]>,
  ]);
  const memoRows = (siteRows.Site_Memos || []) as MemoRecord[];
  const evidenceRows = (siteRows.Site_Memo_Evidence || []) as MemoEvidenceRecord[];
  const variationOrderRows = (siteRows.Variation_Orders || []) as VoRecord[];
  const projectId = context.project.project_id;
  const linkedVos = variationOrderRows
    .filter((vo) => vo.project_id === projectId && textValue(vo.source_type) === "memo" && textValue(vo.source_ref_id))
    .reduce<Record<string, LinkedVoSummary>>((accumulator, vo) => {
      accumulator[textValue(vo.source_ref_id)] = {
        vo_id: textValue(vo.vo_id),
        title: textValue(vo.title),
        status: textValue(vo.status),
      };
      return accumulator;
    }, {});

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
    linkedVos,
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

async function handleUpdateMemo(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "siteMemo.create");
  if (forbidden) return forbidden;

  const memoId = textValue(body.memo_id);
  const data = await getMemoData(context);
  const memo = data.memos.find((item) => item.memo_id === memoId);
  if (!memo?._rowIndex) return NextResponse.json({ error: "ไม่พบ Memo" }, { status: 404 });

  const title = textValue(body.title);
  const detail = textValue(body.detail);
  if (!title || !detail) return NextResponse.json({ error: "กรุณากรอกเรื่องและรายละเอียด Memo" }, { status: 400 });

  const newAttachments = await uploadMemoFiles(context, memoId, "Attachments", parseUploads(body.attachment_uploads));
  const existingAttachments = parseMemoAttachments(memo.attachments_json);
  const hasTimeImpact = boolText(body.has_time_impact);
  const patch = {
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
    customer_name: textValue(body.customer_name) || String(context.project.client || ""),
    attachments_json: safeJsonStringify([...existingAttachments, ...newAttachments]),
    updated_at: new Date().toISOString(),
  };

  await updateSiteMemo(context, memo, patch);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "site_memos",
    action: "memo_updated",
    targetId: memoId,
    summary: `แก้ไข Memo: ${title}`,
    before: memo,
    after: patch,
  });

  return NextResponse.json({ success: true, data: { ...memo, ...patch } });
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

async function handleCreateVoFromMemo(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "vo.create");
  if (forbidden) return forbidden;

  const memoId = textValue(body.memo_id);
  const data = await getMemoData(context);
  const memo = data.memos.find((item) => item.memo_id === memoId);
  if (!memo?._rowIndex) return NextResponse.json({ error: "ไม่พบ Memo" }, { status: 404 });
  if (textValue(memo.related_module) !== "vo") {
    return NextResponse.json({ error: "Memo นี้ไม่ได้ตั้งค่าเกี่ยวข้องกับงานเพิ่ม-ลด" }, { status: 400 });
  }

  const acknowledgedStatuses = new Set(["acknowledged", "extension_approved", "closed"]);
  if (isTrueText(memo.requires_customer_ack) && !acknowledgedStatuses.has(textValue(memo.status))) {
    return NextResponse.json({ error: "กรุณาบันทึกลูกค้ารับทราบ Memo ก่อนสร้างงานเพิ่ม-ลด" }, { status: 400 });
  }

  const voRows = (await findAllBatch(["Variation_Orders"], context.siteSheetId) as unknown as Record<string, SheetRecord[]>).Variation_Orders || [];
  const existingVo = (voRows as VoRecord[]).find((vo) =>
    vo.project_id === context.project.project_id &&
    textValue(vo.source_type) === "memo" &&
    textValue(vo.source_ref_id) === memoId
  );
  if (existingVo?.vo_id) {
    return NextResponse.json({
      success: true,
      existing: true,
      data: {
        vo_id: textValue(existingVo.vo_id),
        title: textValue(existingVo.title),
        status: textValue(existingVo.status),
      },
    });
  }

  const createdDate = todayBangkok();
  const voId = createNextVoId(context.project.project_id, createdDate, voRows as VoRecord[]);
  const attachments = parseMemoAttachments(memo.attachments_json);
  const description = [
    textValue(memo.detail),
    textValue(memo.extension_reason) ? `เหตุผลวันเพิ่ม: ${textValue(memo.extension_reason)}` : "",
  ].filter(Boolean).join("\n\n");
  const supportingDocs = [
    `สร้างจาก Memo: ${textValue(memo.document_no) || memo.memo_id}`,
    textValue(memo.related_ref) ? `อ้างอิงเดิม: ${textValue(memo.related_ref)}` : "",
    ...attachments.map((file) => `แนบจาก Memo: ${file.file_name}`),
  ].filter(Boolean).join("\n");
  const voPayload = {
    vo_id: voId,
    project_id: context.project.project_id,
    revision_no: "0",
    original_vo_id: "",
    vo_type: textValue(body.vo_type) || "VO+",
    title: textValue(memo.title) || `งานเพิ่ม-ลดจาก ${textValue(memo.document_no) || memo.memo_id}`,
    description: description || textValue(memo.title),
    source_type: "memo",
    source_ref_id: memoId,
    source_description: textValue(memo.document_no) || textValue(memo.title),
    subtotal: 0,
    vat_rate: 7,
    vat_exempt: "false",
    withholding_tax: 0,
    vat_amount: 0,
    wht_amount: 0,
    grand_total: 0,
    net_payable: 0,
    contract_before: 0,
    contract_after: 0,
    approval_deadline: addCalendarDays(createdDate, 14),
    approval_token: "",
    approval_url: "",
    customer_approved_at: "",
    customer_approved_by: "",
    customer_approval_note: "",
    sent_to_customer_at: "",
    line_group_id: "",
    line_message: "",
    created_by_name: context.session.user.name || "",
    created_by_email: context.session.user.email || "",
    created_by_role: context.session.user.role || "",
    status: "draft",
    client_name: textValue(memo.customer_name) || String(context.project.client || ""),
    supporting_docs: supportingDocs,
    linked_tasks_json: "[]",
    evidence_json: "",
    rejection_json: "",
    revision_history_json: "[]",
    task_plan_status: "not_planned",
    invoice_no: "",
    invoice_date: "",
    due_date: "",
    amount_due: 0,
    amount_paid: 0,
    balance: 0,
    payment_status: "not_billed",
    document_refs_json: safeJsonStringify(attachments),
    notes: `สร้างร่างจาก Memo ${textValue(memo.document_no) || memoId}`,
    created_at: `${createdDate}T00:00:00+07:00`,
    extension_days: Math.max(0, Math.round(numberValue(memo.extension_days))),
  };
  const itemPayload = {
    item_id: makeId("VOI"),
    vo_id: voId,
    project_id: context.project.project_id,
    item_no: 1,
    description: textValue(memo.title) || `งานเพิ่ม-ลดจาก Memo ${memoId}`,
    unit: "LS",
    quantity: 1,
    unit_price: 0,
    amount: 0,
  };

  await insert("Variation_Orders", voPayload, context.siteSheetId);
  await insert("VO_Items", itemPayload, context.siteSheetId);
  await Promise.all(attachments.map((file, index) => insert("VO_Documents", {
    document_id: makeId("VOD"),
    vo_id: voId,
    project_id: context.project.project_id,
    document_type: "memo-evidence",
    document_no: `${voId}-MEMO-${String(index + 1).padStart(2, "0")}`,
    title: file.file_name || `Memo evidence ${index + 1}`,
    html_snapshot: "",
    pdf_file_id: file.file_id,
    pdf_url: file.file_url,
    created_by_name: context.session.user.name || "",
    created_by_email: context.session.user.email || "",
  }, context.siteSheetId)));

  await Promise.all([
    writeAuditLog({
      actor: actor(context),
      projectId: context.project.project_id,
      module: "site_memos",
      action: "vo_draft_created_from_memo",
      targetId: memoId,
      summary: `สร้างร่างงานเพิ่ม-ลด ${voId} จาก Memo`,
      before: memo,
      after: { vo_id: voId },
    }),
    writeAuditLog({
      actor: actor(context),
      projectId: context.project.project_id,
      module: "variation_orders",
      action: "created_from_memo",
      targetId: voId,
      summary: `สร้างร่างงานเพิ่ม-ลดจาก Memo ${textValue(memo.document_no) || memoId}`,
      after: voPayload,
    }),
  ]);

  return NextResponse.json({ success: true, data: voPayload });
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
      linked_vos: data.linkedVos,
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
    if (action === "update_memo") return handleUpdateMemo(body, routeContext);
    if (action === "issue_pdf") return handleIssuePdf(body, routeContext, req);
    if (action === "send_acknowledgement") return handleSendAcknowledgement(body, routeContext, req);
    if (action === "acknowledge") return handleAcknowledge(body, routeContext, req);
    if (action === "update_status") return handleUpdateStatus(body, routeContext);
    if (action === "create_vo_from_memo") return handleCreateVoFromMemo(body, routeContext);

    return NextResponse.json({ error: "ไม่รู้จัก action นี้" }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
