import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import fs from "fs";
import path from "path";
import { writeAuditLog } from "@/lib/auditLog";
import {
  DEFAULT_CUSTOMER_DECISIONS,
  buildCustomerDecisionLineFlex,
  buildCustomerDecisionPdfHtml,
  buildCustomerDecisionLineMessage,
  createCustomerDecisionApprovalToken,
  createCustomerDecisionDocumentNo,
  createCustomerDecisionId,
  parseDecisionEvidenceFiles,
  safeJsonStringify,
  type CustomerDecisionRecord,
  type CustomerDecisionUploadPayload,
} from "@/lib/customerDecisions";
import { createFolder, createResumableUploadSession, downloadFile, findOrCreateFolder, uploadFile } from "@/lib/drive";
import { drive } from "@/lib/google";
import {
  DECISION_EVIDENCE_MAX_FILES, DECISION_EVIDENCE_MAX_FILE_SIZE, DECISION_EVIDENCE_MAX_TOTAL_SIZE, decisionEvidenceMime,
} from "@/lib/decisionEvidenceUpload";
import { sendLineMessages } from "@/lib/line";
import { renderHtmlToPdfBuffer } from "@/lib/pdfRenderer";
import { getPublicAppOrigin } from "@/lib/publicUrl";
import { findAll, findAllBatch, findAllRaw, findAllWithValidHeaders, insert, update } from "@/lib/sheetsCrud";
import { getErrorMessage, getSiteApiContext } from "@/lib/siteApi";
import { ensureSiteTableSchema } from "@/lib/sheetsSetup";
import { isSupabaseBackend } from "@/lib/supabaseRest";

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

const TEST_LINE_GROUP_ID = process.env.DECISION_LINE_TEST_GROUP_ID || "C512b905da442874d3bcc318e02a731c9";
const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");
const DECISION_STATUS_CONFIRMED = "ยืนยันแล้ว";
const DECISION_EVIDENCE_UPLOAD_TIMEOUT_MS = 75_000;

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

function isDecisionLineTestMode() {
  return process.env.DECISION_LINE_TEST_MODE !== "false";
}

function lineTargetFor(context: RouteContext) {
  if (isDecisionLineTestMode()) return TEST_LINE_GROUP_ID;
  return text(context.project.line_group_id);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function applyConfirmationDefaults<T extends Record<string, string>>(
  payload: T,
  context: RouteContext
) {
  if (payload.decision_status !== DECISION_STATUS_CONFIRMED) return payload;

  return {
    ...payload,
    decision_status: DECISION_STATUS_CONFIRMED,
    decided_at: payload.decided_at || todayDate(),
    decided_by: payload.decided_by || text(context.project.client) || "ลูกค้า",
    result_note: payload.result_note || "ลูกค้ายืนยันตามหลักฐานแนบ",
  };
}

function normalizeDecision(row: CustomerDecisionRecord) {
  return {
    ...row,
    decision_status: row.decision_status || "ยังไม่ถึงเวลา",
    evidence_files_json: row.evidence_files_json || "[]",
    active: row.active || "TRUE",
  };
}

function decodeDataUrl(dataUrl?: string) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function parseUploads(value: unknown) {
  return (Array.isArray(value) ? value : []) as CustomerDecisionUploadPayload[];
}

async function getDecisionRootFolder(context: RouteContext) {
  const rootFolderId = String(context.project.drive_folder_id || "").trim();
  if (!rootFolderId) return null;
  const decisionRoot = await findOrCreateFolder("Customer Decisions", rootFolderId);
  return decisionRoot.id || rootFolderId;
}

async function getDecisionFolder(context: RouteContext, decisionId: string) {
  const rootFolderId = await getDecisionRootFolder(context);
  if (!rootFolderId) return null;
  const decisionFolder = await findOrCreateFolder(safeFolderName(decisionId), rootFolderId);
  return decisionFolder.id || rootFolderId;
}

async function getEvidenceDecision(context: RouteContext, decisionId: string, checkedRows?: CustomerDecisionRecord[]) {
  const projectId = context.project.project_id;
  const rows = checkedRows ?? (
    await findAllBatch(["Customer_Decisions"], context.siteSheetId, { projectId, fresh: true })
  ).Customer_Decisions as unknown as CustomerDecisionRecord[];
  return rows.find((row) =>
    row.project_id === projectId && row.decision_id === decisionId && row.active !== "FALSE");
}

function evidenceBinding(context: RouteContext, decisionId: string, storedName: string, size: number, mimeType: string) {
  return createHash("sha256").update(JSON.stringify([
    context.project.project_id, decisionId, actor(context).email.toLowerCase(), storedName, size, mimeType,
  ])).digest("hex");
}

function parseEvidenceUploadFiles(value: unknown) {
  const files = Array.isArray(value) ? value.map((file) => ({
    name: text(file?.name), size: Number(file?.size),
  })) : [];
  if (!files.length || files.length > DECISION_EVIDENCE_MAX_FILES ||
    files.some(({ name, size }) => !decisionEvidenceMime(name) || !Number.isSafeInteger(size) || size <= 0 || size > DECISION_EVIDENCE_MAX_FILE_SIZE) ||
    files.reduce((sum, file) => sum + file.size, 0) > DECISION_EVIDENCE_MAX_TOTAL_SIZE) {
    return null;
  }
  return files;
}

async function startEvidenceUploads(req: Request, body: Record<string, unknown>, context: RouteContext) {
  const decisionId = text(body.decision_id);
  const files = parseEvidenceUploadFiles(body.files);
  if (!files) return NextResponse.json({ error: "ชนิด จำนวน หรือขนาดไฟล์หลักฐานไม่ถูกต้อง" }, { status: 400 });
  if (!actor(context).email) return NextResponse.json({ error: "ไม่พบผู้ใช้อัปโหลด" }, { status: 403 });
  if (!decisionId || !await getEvidenceDecision(context, decisionId)) {
    return NextResponse.json({ error: "ไม่พบรายการที่ต้องการแนบหลักฐาน" }, { status: 404 });
  }
  if (!text(context.project.drive_folder_id)) {
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าโฟลเดอร์ Drive ของไซต์" }, { status: 400 });
  }
  const data = await openEvidenceSessions(req, context, decisionId, files, false);
  return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
}

async function openEvidenceSessions(req: Request, context: RouteContext, decisionId: string, files: { name: string; size: number }[], isNew: boolean) {
  const findEvidenceFolder = async () => {
    if (!isNew) {
      const parent = await getDecisionFolder(context, decisionId);
      if (!parent) throw new Error("ยังไม่ได้ตั้งค่าโฟลเดอร์ Drive ของไซต์");
      return (await findOrCreateFolder("Evidence", parent)).id || parent;
    }
    const root = await getDecisionRootFolder(context);
    if (!root) throw new Error("ยังไม่ได้ตั้งค่าโฟลเดอร์ Drive ของไซต์");
    const parent = await createFolder(safeFolderName(decisionId), root);
    if (!parent.id) throw new Error("สร้างโฟลเดอร์หลักฐานไม่สำเร็จ");
    return (await createFolder("Evidence", parent.id)).id || parent.id;
  };
  const [folderId, reserved] = await Promise.all([
    findEvidenceFolder(),
    drive.files.generateIds({ count: files.length, space: "drive" }),
  ]);
  return Promise.all(files.map(async ({ name, size }, index) => {
    const fileId = reserved.data.ids?.[index];
    const mimeType = decisionEvidenceMime(name);
    if (!fileId || !mimeType) throw new Error("เปิดช่องทางอัปโหลดหลักฐานไม่ครบ");
    const fileName = `${Date.now()}-${safeFolderName(name)}`;
    const session = await createResumableUploadSession({
      fileName, mimeType, size, parentId: folderId, origin: new URL(req.url).origin, fileId,
      appProperties: { pmcDecisionEvidence: evidenceBinding(context, decisionId, fileName, size, mimeType) },
    });
    return { file_id: fileId, upload_url: session.uploadUrl };
  }));
}

async function attachEvidence(body: Record<string, unknown>, context: RouteContext, checkedRows?: CustomerDecisionRecord[]) {
  const decisionId = text(body.decision_id);
  const ids = body.file_ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > DECISION_EVIDENCE_MAX_FILES ||
    ids.some((id) => typeof id !== "string" || !/^[a-zA-Z0-9_-]{10,}$/.test(id))) {
    return NextResponse.json({ error: "รหัสไฟล์หลักฐานไม่ถูกต้อง" }, { status: 400 });
  }
  if (!actor(context).email) return NextResponse.json({ error: "ไม่พบผู้ใช้อัปโหลด" }, { status: 403 });
  const current = decisionId ? await getEvidenceDecision(context, decisionId, checkedRows) : undefined;
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบรายการที่ต้องการแนบหลักฐาน" }, { status: 404 });
  const existing = parseDecisionEvidenceFiles(current.evidence_files_json);
  const knownIds = new Set(existing.map((file) => file.file_id));
  const pending = [...new Set<string>(ids)].filter((id) => !knownIds.has(id));
  if (!pending.length) return NextResponse.json({ success: true, data: current });

  const files = await Promise.all(pending.map(async (fileId) => {
    try {
      const { data: file } = await drive.files.get({
        fileId, supportsAllDrives: true, fields: "name,size,mimeType,trashed,appProperties,webViewLink",
      });
      const name = file.name || "";
      const mimeType = decisionEvidenceMime(name);
      const size = Number(file.size);
      if (file.trashed || !mimeType || file.mimeType !== mimeType || !Number.isSafeInteger(size) || size <= 0 ||
        file.appProperties?.pmcDecisionEvidence !== evidenceBinding(context, decisionId, name, size, mimeType)) return null;
      return { file_id: fileId, file_name: name.replace(/^\d+-/, ""), file_url: file.webViewLink || `https://drive.google.com/file/d/${fileId}/view`, mime_type: mimeType };
    } catch (error) {
      if ((error as { code?: number }).code === 404) return null;
      throw error;
    }
  }));
  if (files.some((file) => !file)) {
    return NextResponse.json({ error: "ยังยืนยันไฟล์ใน Drive ไม่สำเร็จ กรุณาลองยืนยันอีกครั้ง" }, { status: 409 });
  }
  const patch = { evidence_files_json: safeJsonStringify([...existing, ...files]) };
  await updateCustomerDecision(context, current, patch);
  await writeAuditLog({
    actor: actor(context), projectId: context.project.project_id, module: "customer_decisions",
    action: "updated", targetId: decisionId, summary: `แนบหลักฐานการตัดสินใจ: ${current.title}`,
    before: current, after: patch,
  });
  return NextResponse.json({ success: true, data: { ...current, ...patch } });
}

async function uploadDecisionFiles(context: RouteContext, decisionId: string, uploads: CustomerDecisionUploadPayload[]) {
  const files = uploads.filter((file) => file?.dataUrl && file.name).slice(0, 10);
  if (files.length === 0) return [];

  const decisionFolderId = await getDecisionFolder(context, decisionId);
  if (!decisionFolderId) throw new Error("Project Drive folder is not configured");
  const targetFolder = await findOrCreateFolder("Evidence", decisionFolderId);
  const folderId = targetFolder.id || decisionFolderId;

  const uploaded = await Promise.all(files.map(async (file) => {
    const decoded = decodeDataUrl(file.dataUrl);
    if (!decoded || !file.name) return null;
    const uploadedFile = await withTimeout(
      uploadFile(
        `${Date.now()}-${safeFolderName(file.name)}`,
        file.type || decoded.mimeType || "application/octet-stream",
        decoded.buffer,
        folderId
      ),
      DECISION_EVIDENCE_UPLOAD_TIMEOUT_MS,
      "อัปโหลดหลักฐานไป Google Drive นานเกินไป กรุณาลองแนบไฟล์ใหม่อีกครั้ง"
    );
    return {
      file_id: uploadedFile.id || "",
      file_name: file.name,
      file_url: uploadedFile.webViewLink || uploadedFile.webContentLink || "",
      mime_type: file.type || decoded.mimeType || "application/octet-stream",
    };
  }));

  return uploaded.filter((file): file is NonNullable<typeof file> => Boolean(file));
}

async function attachEvidenceDataUrls(decision: CustomerDecisionRecord) {
  const evidenceFiles = parseDecisionEvidenceFiles(decision.evidence_files_json);
  const hydrated = await Promise.all(evidenceFiles.map(async (file) => {
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
      console.warn(`Failed to embed decision evidence ${file.file_id}:`, error);
      return file;
    }
  }));

  return {
    ...decision,
    evidence_files_json: safeJsonStringify(hydrated),
  };
}

async function getRows(context: RouteContext) {
  return await findAll("Customer_Decisions", context.siteSheetId) as unknown as CustomerDecisionRecord[];
}

async function getFallbackRowIndex(context: RouteContext, decision: CustomerDecisionRecord) {
  const numericRowIndex = Number(decision._rowIndex);
  if (Number.isFinite(numericRowIndex)) return numericRowIndex;

  const rawRows = await findAllRaw("Customer_Decisions", context.siteSheetId);
  return rawRows.find((row) => row.decision_id === decision.decision_id)?._rowIndex;
}

async function updateCustomerDecision(context: RouteContext, decision: CustomerDecisionRecord, patch: Record<string, string>) {
  await update(
    "Customer_Decisions",
    decision.decision_id || decision._rowIndex || "",
    patch,
    context.siteSheetId,
    () => getFallbackRowIndex(context, decision)
  );
}

async function seedDefaultRows(context: RouteContext) {
  const projectId = context.project.project_id;
  await Promise.all(DEFAULT_CUSTOMER_DECISIONS.map((item, index) => insert("Customer_Decisions", {
    decision_id: createCustomerDecisionId(),
    project_id: projectId,
    document_no: "",
    phase: item.phase,
    title: item.title,
    decision_before: item.decision_before,
    decision_status: item.decision_status,
    impact_if_changed: item.impact_if_changed,
    result_note: "",
    evidence_note: "",
    evidence_files_json: "[]",
    notified_at: "",
    notified_by_name: "",
    notified_by_email: "",
    line_group_id: "",
    line_message: "",
    decided_at: "",
    decided_by: "",
    pdf_file_id: "",
    pdf_url: "",
    issued_at: "",
    issued_by_name: "",
    issued_by_email: "",
    approval_token: "",
    approval_url: "",
    order_index: String(index + 1),
    active: "TRUE",
  }, context.siteSheetId)));
}

async function getDecisionData(context: RouteContext, checkedRows?: CustomerDecisionRecord[]) {
  let rows = checkedRows ?? await getRows(context);
  const projectRows = rows.filter((row) => row.project_id === context.project.project_id);

  if (projectRows.length === 0) {
    await seedDefaultRows(context);
    rows = await getRows(context);
  }

  return rows
    .filter((row) => row.project_id === context.project.project_id && row.active !== "FALSE")
    .map(normalizeDecision)
    .sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0));
}

async function handleSave(req: Request, body: Record<string, unknown>, context: RouteContext, checkedRows?: CustomerDecisionRecord[]) {
  const decisionId = text(body.decision_id);
  const payload = {
    project_id: context.project.project_id,
    phase: text(body.phase),
    title: text(body.title),
    decision_before: text(body.decision_before),
    decision_status: text(body.decision_status) || "ต้องยืนยัน",
    impact_if_changed: text(body.impact_if_changed),
    result_note: text(body.result_note),
    evidence_note: text(body.evidence_note),
    decided_at: text(body.decided_at),
    decided_by: text(body.decided_by),
    order_index: text(body.order_index),
    active: "TRUE",
  };

  if (!payload.phase || !payload.title || !payload.decision_before || !payload.impact_if_changed) {
    return NextResponse.json({ error: "กรุณากรอกข้อมูลรายการตัดสินใจให้ครบ" }, { status: 400 });
  }
  const uploadFiles = parseEvidenceUploadFiles(body.upload_files);
  if (body.upload_files !== undefined && !uploadFiles) {
    return NextResponse.json({ error: "ชนิด จำนวน หรือขนาดไฟล์หลักฐานไม่ถูกต้อง" }, { status: 400 });
  }
  if (uploadFiles && !actor(context).email) return NextResponse.json({ error: "ไม่พบผู้ใช้อัปโหลด" }, { status: 403 });
  const metrics: string[] = [];
  const prepare = (id: string, isNew: boolean) => {
    if (!uploadFiles) return undefined;
    const started = performance.now();
    return openEvidenceSessions(req, context, id, uploadFiles, isNew)
      .catch(() => undefined)
      .finally(() => metrics.push(`drive_sessions;dur=${(performance.now() - started).toFixed(2)}`));
  };
  const finish = async (data: Record<string, unknown>, prepared: ReturnType<typeof prepare>, started: number) => {
    if (!prepared) return NextResponse.json({ success: true, ...data });
    metrics.push(`decision_save;dur=${(performance.now() - started).toFixed(2)}`);
    const upload_sessions = await prepared;
    return NextResponse.json({ success: true, ...data, upload_sessions }, {
      headers: { "Cache-Control": "no-store", "Server-Timing": metrics.join(", ") },
    });
  };
  const started = performance.now();

  if (decisionId) {
    const rows = checkedRows ?? await getRows(context);
    const current = rows.find((row) => row.decision_id === decisionId && row.project_id === context.project.project_id);
    if (!current?._rowIndex || (uploadFiles && current.active === "FALSE")) return NextResponse.json({ error: "ไม่พบรายการที่ต้องการแก้ไข" }, { status: 404 });
    const prepared = prepare(decisionId, false);
    const uploadedEvidenceFiles = await uploadDecisionFiles(context, decisionId, parseUploads(body.evidence_uploads));
    const nextEvidenceFiles = [
      ...parseDecisionEvidenceFiles(current.evidence_files_json),
      ...uploadedEvidenceFiles,
    ];
    const patch = {
      ...applyConfirmationDefaults(payload, context),
      evidence_files_json: safeJsonStringify(nextEvidenceFiles),
    };

    await updateCustomerDecision(context, current, patch);
    await writeAuditLog({
      actor: actor(context),
      projectId: context.project.project_id,
      module: "customer_decisions",
      action: "updated",
      targetId: decisionId,
      summary: `แก้ไขรายการต้องตัดสินใจ: ${payload.title}`,
      before: current,
      after: patch,
    });

    return finish({}, prepared, started);
  }

  const createdId = createCustomerDecisionId();
  const prepared = prepare(createdId, true);
  const nextRows = await getDecisionData(context, checkedRows);
  const nextEvidenceFiles = await uploadDecisionFiles(context, createdId, parseUploads(body.evidence_uploads));
  const createdPayload = applyConfirmationDefaults(payload, context);
  const created = {
    decision_id: createdId,
    ...createdPayload,
    document_no: "",
    evidence_files_json: safeJsonStringify(nextEvidenceFiles),
    pdf_file_id: "",
    pdf_url: "",
    issued_at: "",
    issued_by_name: "",
    issued_by_email: "",
    approval_token: "",
    approval_url: "",
    order_index: createdPayload.order_index || String(nextRows.length + 1),
  };
  await insert("Customer_Decisions", created, context.siteSheetId);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "customer_decisions",
    action: "created",
    targetId: created.decision_id,
    summary: `เพิ่มรายการต้องตัดสินใจ: ${created.title}`,
    after: created,
  });

  return finish({ data: created }, prepared, started);
}

async function handleDelete(body: Record<string, unknown>, context: RouteContext) {
  const decisionId = text(body.decision_id);
  const rows = await getRows(context);
  const current = rows.find((row) => row.decision_id === decisionId && row.project_id === context.project.project_id);
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบรายการที่ต้องการลบ" }, { status: 404 });

  await updateCustomerDecision(context, current, { active: "FALSE" });
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "customer_decisions",
    action: "deleted",
    targetId: decisionId,
    summary: `ลบรายการต้องตัดสินใจ: ${current.title || decisionId}`,
    before: current,
    after: { active: "FALSE" },
  });

  return NextResponse.json({ success: true });
}

async function issueDecisionPdfFor(req: Request, context: RouteContext, current: CustomerDecisionRecord, rows: CustomerDecisionRecord[]) {
  const decisionFolderId = await getDecisionFolder(context, current.decision_id);
  if (!decisionFolderId) throw new Error("Project Drive folder is not configured");

  const documentNo = text(current.document_no) || createCustomerDecisionDocumentNo(context.project.project_id, rows);
  const issuedAt = new Date().toISOString();
  const decisionForPdf = await attachEvidenceDataUrls({
    ...current,
    document_no: documentNo,
    issued_at: issuedAt,
    issued_by_name: context.session.user.name || "",
    issued_by_email: context.session.user.email || "",
  });
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  const html = buildCustomerDecisionPdfHtml({
    decision: decisionForPdf,
    project: context.project,
    logoUrl: getLogoDataUrl() || `${origin}/logo.png`,
  });

  const pdfFolder = await findOrCreateFolder("PDF", decisionFolderId);
  const pdfBuffer = await renderHtmlToPdfBuffer(html, documentNo);
  const uploaded = await uploadFile(`${documentNo}.pdf`, "application/pdf", pdfBuffer, pdfFolder.id || decisionFolderId);
  return {
    document_no: documentNo,
    pdf_file_id: uploaded.id || "",
    pdf_url: uploaded.webViewLink || uploaded.webContentLink || "",
    issued_at: issuedAt,
    issued_by_name: context.session.user.name || "",
    issued_by_email: context.session.user.email || "",
  };
}

async function handleNotify(req: Request, body: Record<string, unknown>, context: RouteContext) {
  const decisionId = text(body.decision_id);
  const rows = await getRows(context);
  const current = rows.find((row) => row.decision_id === decisionId && row.project_id === context.project.project_id);
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบรายการที่ต้องการแจ้งเตือน" }, { status: 404 });

  let pdfPatch: Record<string, string> = {};
  let nextRecord = current;
  if (!text(current.pdf_url)) {
    pdfPatch = await issueDecisionPdfFor(req, context, current, rows);
    nextRecord = { ...current, ...pdfPatch };
  }

  const approvalToken = text(nextRecord.approval_token) || createCustomerDecisionApprovalToken();
  const approvalOrigin = getPublicAppOrigin({ request: req, origin: body.origin });
  if (!approvalOrigin) return NextResponse.json({ error: "ไม่พบ URL ระบบสำหรับสร้างลิงก์ยืนยัน" }, { status: 400 });
  const approvalUrl = `${approvalOrigin}/decision-approval/${encodeURIComponent(context.project.project_id)}/${encodeURIComponent(approvalToken)}`;
  nextRecord = { ...nextRecord, approval_token: approvalToken, approval_url: approvalUrl };

  const message = buildCustomerDecisionLineMessage({
    projectName: text(context.project.name),
    projectId: context.project.project_id,
    phase: text(nextRecord.phase),
    title: text(nextRecord.title),
    decisionBefore: text(nextRecord.decision_before),
    impactIfChanged: text(nextRecord.impact_if_changed),
  });
  const evidenceFiles = parseDecisionEvidenceFiles(nextRecord.evidence_files_json);
  const firstEvidenceUrl = text(evidenceFiles.find((file) => file.file_url)?.file_url);
  const flexMessage = buildCustomerDecisionLineFlex({
    projectName: text(context.project.name),
    projectId: context.project.project_id,
    documentNo: text(nextRecord.document_no),
    phase: text(nextRecord.phase),
    status: text(nextRecord.decision_status),
    title: text(nextRecord.title),
    decisionBefore: text(nextRecord.decision_before),
    impactIfChanged: text(nextRecord.impact_if_changed),
    pdfUrl: text(nextRecord.pdf_url),
    evidenceUrl: firstEvidenceUrl,
    approvalUrl,
    evidenceCount: evidenceFiles.length,
  });
  const targetLineGroupId = lineTargetFor(context);

  await sendLineMessages([flexMessage], targetLineGroupId);

  const patch = {
    ...pdfPatch,
    decision_status: text(current.decision_status) === DECISION_STATUS_CONFIRMED ? DECISION_STATUS_CONFIRMED : "รอลูกค้า",
    notified_at: new Date().toISOString(),
    notified_by_name: context.session.user.name || "",
    notified_by_email: context.session.user.email || "",
    line_group_id: targetLineGroupId,
    line_message: message,
    approval_token: approvalToken,
    approval_url: approvalUrl,
  };

  await updateCustomerDecision(context, current, patch);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "customer_decisions",
    action: "line_notified",
    targetId: decisionId,
    summary: `ส่ง LINE แจ้งเตือนรายการต้องตัดสินใจ: ${current.title || decisionId}`,
    before: current,
    after: { ...patch, test_mode: isDecisionLineTestMode() },
  });

  return NextResponse.json({ success: true, data: { test_mode: isDecisionLineTestMode(), line_group_id: targetLineGroupId } });
}

async function handleIssuePdf(req: Request, body: Record<string, unknown>, context: RouteContext) {
  const decisionId = text(body.decision_id);
  const rows = await getRows(context);
  const current = rows.find((row) => row.decision_id === decisionId && row.project_id === context.project.project_id);
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบรายการที่ต้องการออก PDF" }, { status: 404 });

  const patch = await issueDecisionPdfFor(req, context, current, rows);

  await updateCustomerDecision(context, current, patch);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "customer_decisions",
    action: "pdf_issued",
    targetId: decisionId,
    summary: `ออก PDF รายการต้องตัดสินใจ ${patch.document_no}`,
    before: current,
    after: patch,
  });

  return NextResponse.json({ success: true, data: { ...current, ...patch } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    const routeContext = context as RouteContext;
    const data = await getDecisionData(routeContext);

    return NextResponse.json({
      success: true,
      project: routeContext.project,
      data,
      line: {
        test_mode: isDecisionLineTestMode(),
        target_group_id: lineTargetFor(routeContext),
        target_group_name: isDecisionLineTestMode() ? "Decision LINE Test Group" : text(routeContext.project.line_group_name),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = text(body.action) || "save";
    const evidenceWrite = action === "attach_evidence" || (action === "save" && body.upload_files !== undefined);
    const context = await getSiteApiContext(decodeURIComponent(projectId), false, { readOnly: action === "start_evidence_uploads" || evidenceWrite });
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    const routeContext = context as RouteContext;
    let checkedRows: CustomerDecisionRecord[] | undefined;
    if (evidenceWrite && !isSupabaseBackend()) {
      const read = () => findAllWithValidHeaders("Customer_Decisions", context.siteSheetId);
      let rows = await read().catch(() => null);
      if (!rows) {
        const schema = await ensureSiteTableSchema(context.siteSheetId, "Customer_Decisions");
        if (schema.success) rows = await read();
      }
      if (!rows) return NextResponse.json({ error: "ตรวจสอบโครงสร้าง Google Sheets ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 503 });
      checkedRows = rows as unknown as CustomerDecisionRecord[];
    }

    if (action === "start_evidence_uploads") return startEvidenceUploads(req, body, routeContext);
    if (action === "attach_evidence") return attachEvidence(body, routeContext, checkedRows);
    if (action === "save") return handleSave(req, body, routeContext, checkedRows);
    if (action === "delete") return handleDelete(body, routeContext);
    if (action === "notify_line") return handleNotify(req, body, routeContext);
    if (action === "issue_pdf") return handleIssuePdf(req, body, routeContext);

    return NextResponse.json({ error: "ไม่รู้จัก action นี้" }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
