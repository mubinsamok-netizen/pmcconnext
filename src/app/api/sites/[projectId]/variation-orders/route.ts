import { NextResponse } from "next/server";
import { findOrCreateFolder, uploadFile } from "@/lib/drive";
import { sendLineMessages } from "@/lib/line";
import { createNotification } from "@/lib/notifications";
import { renderHtmlToPdfBuffer } from "@/lib/pdfRenderer";
import { findAllBatch, findAllMaster, findAllRaw, insert, update } from "@/lib/sheetsCrud";
import { getErrorMessage, getSiteApiContext, makeId } from "@/lib/siteApi";
import { writeAuditLog } from "@/lib/auditLog";
import { toAppRole } from "@/lib/roles";
import { hasPermission, permissionDeniedMessage, type AppPermission } from "@/lib/permissions";
import { getPublicAppOrigin } from "@/lib/publicUrl";
import {
  VO_TYPE_LABELS,
  addCalendarDays,
  addWorkingDays,
  asVoStatus,
  asVoType,
  calculateVoTotals,
  buildVoApprovalLineFlex,
  buildVoApprovalLineMessage,
  createNextVoId,
  createVoApprovalToken,
  formatMoney,
  numberValue,
  safeJsonStringify,
  todayBangkok,
  validateRequired,
  type VoItemInput,
  type VoItemRecord,
  type VoRecord,
} from "@/lib/variationOrders";
import {
  buildApprovalCertificateHtml,
  buildInvoiceHtml,
  buildVoSheetHtml,
  buildVoMonthlyReportHtml,
  buildReceiptHtml,
  buildVoClearanceReportHtml,
} from "@/lib/variationOrderDocuments";

type RouteContext = {
  session: {
    user: {
      email?: string | null;
      name?: string | null;
      role?: string | null;
      googleSub?: string | null;
    };
  };
  project: Record<string, string | number | undefined> & { project_id: string };
  siteSheetId: string;
};
type SheetRecord = Record<string, string | number | undefined>;
type UploadPayload = {
  name?: string;
  type?: string;
  dataUrl?: string;
};
type UploadedVoFile = {
  file_id: string;
  file_name: string;
  file_url: string;
  mime_type: string;
};
type SheetPatch = Record<string, string | number | boolean | null | undefined>;

const VO_LINE_TEST_GROUP_ID = process.env.VO_LINE_TEST_GROUP_ID || process.env.DECISION_LINE_TEST_GROUP_ID || "C512b905da442874d3bcc318e02a731c9";

function text(value: unknown) {
  return String(value || "").trim();
}

function isVoLineTestMode() {
  return process.env.VO_LINE_TEST_MODE !== "false";
}

function lineTargetFor(context: RouteContext) {
  if (isVoLineTestMode()) return VO_LINE_TEST_GROUP_ID;
  return text(context.project.line_group_id);
}

function approvalOriginFrom(req: Request, body: Record<string, unknown>) {
  return getPublicAppOrigin({ request: req, origin: body.origin });
}

function safeFolderName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "Other";
}

function requirePermission(context: RouteContext, permission: AppPermission) {
  if (!hasPermission(context.session.user.role, permission)) {
    return NextResponse.json({ error: permissionDeniedMessage(permission) }, { status: 403 });
  }
  return null;
}

function userActor(context: RouteContext) {
  return {
    email: context.session.user.email || "",
    name: context.session.user.name || "",
    role: context.session.user.role || "",
    googleSub: context.session.user.googleSub || "",
  };
}

function getDateValue(value?: unknown) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : todayBangkok();
}

function parseRows<T>(rows: unknown) {
  return (Array.isArray(rows) ? rows : []) as T[];
}

async function fallbackRowIndex(context: RouteContext, tableName: string, keyColumn: string, keyValue: string, currentRowIndex?: string | number) {
  const numericRowIndex = Number(currentRowIndex);
  if (Number.isFinite(numericRowIndex)) return numericRowIndex;

  const rawRows = await findAllRaw(tableName, context.siteSheetId);
  return rawRows.find((row) => row[keyColumn] === keyValue)?._rowIndex;
}

async function updateVo(context: RouteContext, vo: VoRecord, patch: SheetPatch) {
  const voId = text(vo.vo_id);
  await update(
    "Variation_Orders",
    voId || vo._rowIndex || "",
    patch,
    context.siteSheetId,
    voId ? await fallbackRowIndex(context, "Variation_Orders", "vo_id", voId, vo._rowIndex) : vo._rowIndex
  );
}

async function updateVoItem(context: RouteContext, item: VoItemRecord, patch: SheetPatch) {
  const itemId = text(item.item_id);
  await update(
    "VO_Items",
    itemId || item._rowIndex || "",
    patch,
    context.siteSheetId,
    itemId ? await fallbackRowIndex(context, "VO_Items", "item_id", itemId, item._rowIndex) : item._rowIndex
  );
}

function parseJsonArray(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function updateTaskFromVo(context: RouteContext, task: SheetRecord, patch: SheetPatch) {
  const taskId = text(task.task_id);
  await update(
    "Tasks",
    taskId || task._rowIndex || "",
    patch,
    context.siteSheetId,
    taskId ? await fallbackRowIndex(context, "Tasks", "task_id", taskId, task._rowIndex) : task._rowIndex
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

async function getVoDriveFolder(context: RouteContext, voId: string) {
  const rootFolderId = String(context.project.drive_folder_id || "").trim();
  if (!rootFolderId) return null;
  const voRoot = await findOrCreateFolder("Variation Orders", rootFolderId);
  const voFolder = await findOrCreateFolder(safeFolderName(voId), voRoot.id || rootFolderId);
  return voFolder.id || null;
}

async function uploadEvidenceFile(context: RouteContext, voId: string, file?: UploadPayload) {
  if (!file?.dataUrl || !file.name) return null;
  const decoded = decodeDataUrl(file.dataUrl);
  if (!decoded) return null;
  const voFolderId = await getVoDriveFolder(context, voId);
  if (!voFolderId) return null;
  const evidenceFolder = await findOrCreateFolder("Evidence", voFolderId);
  const uploaded = await uploadFile(
    `${Date.now()}-${safeFolderName(file.name)}`,
    file.type || decoded.mimeType || "application/octet-stream",
    decoded.buffer,
    evidenceFolder.id || voFolderId
  );
  return {
    file_id: uploaded.id || "",
    file_name: uploaded.name || file.name,
    file_url: uploaded.webViewLink || uploaded.webContentLink || "",
  };
}

async function uploadPaymentEvidenceFile(context: RouteContext, voId: string, file?: UploadPayload) {
  if (!file?.dataUrl || !file.name) return null;
  const decoded = decodeDataUrl(file.dataUrl);
  if (!decoded) return null;
  try {
    const voFolderId = await getVoDriveFolder(context, voId);
    if (!voFolderId) return null;
    const paymentsFolder = await findOrCreateFolder("Payment Evidence", voFolderId);
    const uploaded = await uploadFile(
      `${Date.now()}-${safeFolderName(file.name)}`,
      file.type || decoded.mimeType || "application/octet-stream",
      decoded.buffer,
      paymentsFolder.id || voFolderId
    );
    return {
      file_id: uploaded.id || "",
      file_name: uploaded.name || file.name,
      file_url: uploaded.webViewLink || uploaded.webContentLink || "",
    };
  } catch (error) {
    console.warn(`Failed to upload VO payment evidence ${file.name}:`, error);
    return null;
  }
}

async function uploadSupportingDocumentFiles(context: RouteContext, voId: string, files: UploadPayload[]) {
  const uploads = files.filter((file) => file?.dataUrl && file.name);
  if (uploads.length === 0) return [];
  const voFolderId = await getVoDriveFolder(context, voId);
  if (!voFolderId) return [];
  const supportingFolder = await findOrCreateFolder("Supporting Docs", voFolderId);
  const folderId = supportingFolder.id || voFolderId;

  const uploadedFiles = await Promise.all(uploads.map(async (file) => {
    const decoded = decodeDataUrl(file.dataUrl);
    if (!decoded || !file.name) return null;
    const uploaded = await uploadFile(
      `${Date.now()}-${safeFolderName(file.name)}`,
      file.type || decoded.mimeType || "application/octet-stream",
      decoded.buffer,
      folderId
    );
    return {
      file_id: uploaded.id || "",
      file_name: uploaded.name || file.name,
      file_url: uploaded.webViewLink || uploaded.webContentLink || "",
      mime_type: file.type || decoded.mimeType || "application/octet-stream",
    };
  }));

  return uploadedFiles.filter((file): file is UploadedVoFile => Boolean(file));
}

async function getVoData(context: RouteContext) {
  const rows = await findAllBatch([
    "Variation_Orders",
    "VO_Items",
    "VO_Documents",
    "VO_Payments",
    "VO_Task_Links",
    "Tasks",
    "VO_Finance_Ledger",
  ], context.siteSheetId) as unknown as Record<string, SheetRecord[]>;
  const vos = parseRows<VoRecord>(rows.Variation_Orders);
  const items = parseRows<VoItemRecord>(rows.VO_Items);
  const documents = rows.VO_Documents || [];
  const payments = rows.VO_Payments || [];
  const taskLinks = rows.VO_Task_Links || [];
  const tasks = rows.Tasks || [];
  const ledger = rows.VO_Finance_Ledger || [];

  const projectId = context.project.project_id;
  return {
    vos: vos.filter((row) => row.project_id === projectId),
    items: items.filter((row) => row.project_id === projectId),
    documents: documents.filter((row) => row.project_id === projectId),
    payments: payments.filter((row) => row.project_id === projectId),
    taskLinks: taskLinks.filter((row) => row.project_id === projectId),
    tasks: tasks.filter((row) => row.project_id === projectId),
    ledger: ledger.filter((row) => row.project_id === projectId),
  };
}

function findVo(rows: VoRecord[], voId: string) {
  return rows.find((row) => row.vo_id === voId);
}

function getVoItems(items: VoItemRecord[], voId: string) {
  return items
    .filter((item) => item.vo_id === voId)
    .sort((a, b) => numberValue(a.item_no) - numberValue(b.item_no));
}

function daysBetweenDates(from: string, to: string) {
  const fromDate = new Date(`${from}T00:00:00+07:00`);
  const toDate = new Date(`${to}T00:00:00+07:00`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return 0;
  return Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000);
}

async function insertVoDocument({
  context,
  vo,
  items,
  documentType,
  title,
  html,
}: {
  context: RouteContext;
  vo: VoRecord;
  items: VoItemRecord[];
  documentType: string;
  title: string;
  html: string;
}) {
  const documentNo = `${vo.vo_id}-${documentType.toUpperCase()}`;
  let pdfFileId = "";
  let pdfUrl = "";
  try {
    const voFolderId = await getVoDriveFolder(context, vo.vo_id);
    if (voFolderId) {
      const pdfBuffer = await renderHtmlToPdfBuffer(html, documentNo);
      const uploaded = await uploadFile(`${documentNo}.pdf`, "application/pdf", pdfBuffer, voFolderId);
      pdfFileId = uploaded.id || "";
      pdfUrl = uploaded.webViewLink || uploaded.webContentLink || "";
    }
  } catch (error) {
    console.warn(`Failed to render/upload VO PDF ${documentNo}:`, error);
  }

  await insert("VO_Documents", {
    document_id: makeId("VOD"),
    vo_id: vo.vo_id,
    project_id: context.project.project_id,
    document_type: documentType,
    document_no: documentNo,
    title,
    html_snapshot: html,
    pdf_file_id: pdfFileId,
    pdf_url: pdfUrl,
    created_by_name: context.session.user.name || "",
    created_by_email: context.session.user.email || "",
  }, context.siteSheetId);

  return { documentNo, itemCount: items.length, pdfFileId, pdfUrl };
}

async function ensureVoSheetPdf({
  context,
  vo,
  items,
  documents,
}: {
  context: RouteContext;
  vo: VoRecord;
  items: VoItemRecord[];
  documents: SheetRecord[];
}) {
  const existing = documents
    .filter((document) => document.vo_id === vo.vo_id && document.document_type === "vo-sheet")
    .reverse()
    .find((document) => text(document.pdf_url));
  if (existing) {
    return {
      documentNo: text(existing.document_no) || `${vo.vo_id}-VO-SHEET`,
      pdfUrl: text(existing.pdf_url),
      pdfFileId: text(existing.pdf_file_id),
    };
  }

  const html = buildVoSheetHtml({ vo, items, project: context.project });
  const issued = await insertVoDocument({
    context,
    vo,
    items,
    documentType: "vo-sheet",
    title: "ใบงานเพิ่ม-ลด",
    html,
  });

  return {
    documentNo: issued.documentNo,
    pdfUrl: issued.pdfUrl,
    pdfFileId: issued.pdfFileId,
  };
}

async function notifyRole(context: RouteContext, targetRole: string, type: string, title: string, message: string, link?: string) {
  await createNotification({
    project_id: context.project.project_id,
    target_role: toAppRole(targetRole) || targetRole,
    type,
    title,
    message,
    link: link || `/dashboard/sites/${encodeURIComponent(context.project.project_id)}/variation-orders`,
    created_by_email: context.session.user.email || "",
    created_by_name: context.session.user.name || "",
  });
}

async function handleCreateVo(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "vo.create");
  if (forbidden) return forbidden;

  const itemInputs = parseRows<VoItemInput>(body.items);
  const required = validateRequired({
    vo_type: body.vo_type,
    title: body.title,
    description: body.description,
    client_name: body.client_name || context.project.client,
    items: itemInputs,
  }, {
    vo_type: "ประเภทงานเพิ่ม-ลด",
    title: "ชื่องาน",
    description: "รายละเอียด",
    client_name: "ชื่อลูกค้า",
    items: "รายการค่าใช้จ่าย",
  });
  if (required.length > 0) {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ", missing: required }, { status: 400 });
  }

  const data = await getVoData(context);
  const createdDate = getDateValue(body.created_date);
  const voType = asVoType(String(body.vo_type || "VO+"));
  const calculation = calculateVoTotals({
    items: itemInputs,
    tax: {
      vat_exempt: Boolean(body.vat_exempt),
      withholding_tax: String(body.withholding_tax || "0"),
      vat_rate: 7,
    },
  });
  if (calculation.items.length === 0) {
    return NextResponse.json({ error: "ต้องมีรายการอย่างน้อย 1 รายการ" }, { status: 400 });
  }

  const voId = createNextVoId(context.project.project_id, createdDate, data.vos);
  const approvalDeadline = addCalendarDays(createdDate, numberValue(String(body.approval_deadline_days || 14)));
  const supportingUploads = parseRows<UploadPayload>(body.supporting_doc_uploads);
  const supportingFiles = await uploadSupportingDocumentFiles(context, voId, supportingUploads);
  const supportingDocsText = String(body.supporting_docs || "").trim();
  const supportingDocs = supportingFiles.length > 0
    ? [supportingDocsText, ...supportingFiles.map((file) => `แนบไฟล์หลักฐาน: ${file.file_name}`)].filter(Boolean).join("\n")
    : supportingDocsText;
  const requestedStatus = String(body.status || "pending_approval").trim();
  const initialStatus = ["draft", "pending_approval", "approved", "rejected"].includes(requestedStatus) ? requestedStatus : "pending_approval";
  const extensionDays = Math.max(0, numberValue(String(body.extension_days || 0)));
  const evidencePayload = supportingFiles.length > 0
    ? {
        method: "engineer_uploaded_evidence",
        confirmed_by_office: context.session.user.name || "",
        confirm_date: todayBangkok(),
        evidence_type: "external_documents",
        evidence_description: supportingDocsText,
        files: supportingFiles,
      }
    : null;
  const voPayload = {
    vo_id: voId,
    project_id: context.project.project_id,
    revision_no: "0",
    original_vo_id: "",
    vo_type: voType,
    title: String(body.title || "").trim(),
    description: String(body.description || "").trim(),
    source_type: String(body.source_type || "none"),
    source_ref_id: String(body.source_ref_id || ""),
    source_description: String(body.source_description || ""),
    subtotal: calculation.subtotal,
    vat_rate: calculation.vat_rate,
    vat_exempt: String(calculation.vat_exempt),
    withholding_tax: calculation.withholding_tax,
    vat_amount: calculation.vat_amount,
    wht_amount: calculation.wht_amount,
    grand_total: calculation.grand_total,
    net_payable: calculation.net_payable,
    contract_before: calculation.contract_before,
    contract_after: calculation.contract_after,
    approval_deadline: approvalDeadline,
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
    status: initialStatus,
    client_name: String(body.client_name || context.project.client || ""),
    supporting_docs: supportingDocs,
    linked_tasks_json: safeJsonStringify(body.linked_tasks || []),
    evidence_json: evidencePayload && initialStatus === "approved" ? safeJsonStringify(evidencePayload) : "",
    rejection_json: "",
    revision_history_json: "[]",
    task_plan_status: initialStatus === "approved" ? "pending_plan" : "not_planned",
    invoice_no: "",
    invoice_date: "",
    due_date: "",
    amount_due: calculation.grand_total,
    amount_paid: 0,
    balance: calculation.grand_total,
    payment_status: "not_billed",
    document_refs_json: safeJsonStringify(supportingFiles),
    notes: String(body.notes || ""),
    created_at: `${createdDate}T00:00:00+07:00`,
    extension_days: extensionDays,
  };

  await insert("Variation_Orders", voPayload, context.siteSheetId);
  await Promise.all(supportingFiles.map((file, index) => insert("VO_Documents", {
    document_id: makeId("VOD"),
    vo_id: voId,
    project_id: context.project.project_id,
    document_type: "supporting-evidence",
    document_no: `${voId}-SUP-${String(index + 1).padStart(2, "0")}`,
    title: file.file_name || `หลักฐานแนบ ${index + 1}`,
    html_snapshot: "",
    pdf_file_id: file.file_id,
    pdf_url: file.file_url,
    created_by_name: context.session.user.name || "",
    created_by_email: context.session.user.email || "",
  }, context.siteSheetId)));
  await Promise.all(calculation.items.map((item) => insert("VO_Items", {
    item_id: makeId("VOI"),
    vo_id: voId,
    project_id: context.project.project_id,
    item_no: item.item_no,
    description: item.description,
    unit: item.unit,
    quantity: item.quantity,
    unit_price: item.unit_price,
    amount: item.amount,
  }, context.siteSheetId)));

  const insertedVo = voPayload as VoRecord;
  const insertedItems = calculation.items.map((item) => ({
    item_id: "",
    vo_id: voId,
    project_id: context.project.project_id,
    ...item,
  })) as VoItemRecord[];
  await writeAuditLog({
    actor: userActor(context),
    projectId: context.project.project_id,
    module: "variation_orders",
    action: "created",
    targetId: voId,
    summary: `สร้าง ${VO_TYPE_LABELS[voType]} ${voId} มูลค่า ${formatMoney(calculation.grand_total)} บาท`,
    after: voPayload,
  });

  return NextResponse.json({ success: true, data: insertedVo, items: insertedItems });
}

async function handleUpdateVo(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "vo.create");
  if (forbidden) return forbidden;

  const voId = text(body.vo_id);
  if (!voId) return NextResponse.json({ error: "ไม่พบ VO ที่ต้องการแก้ไข" }, { status: 400 });

  const data = await getVoData(context);
  const vo = findVo(data.vos, voId);
  if (!vo?._rowIndex && !vo?.vo_id) return NextResponse.json({ error: "ไม่พบ VO ที่ต้องการแก้ไข" }, { status: 404 });

  const currentStatus = asVoStatus(String(vo.status || ""));
  if (!["draft", "pending_approval", "rejected", "expired"].includes(currentStatus)) {
    return NextResponse.json({ error: "แก้ไขได้เฉพาะรายการที่ยังไม่อนุมัติหรือยังไม่วางบิล" }, { status: 400 });
  }

  const itemInputs = parseRows<VoItemInput>(body.items);
  const required = validateRequired({
    vo_type: body.vo_type,
    title: body.title,
    description: body.description,
    client_name: body.client_name || context.project.client,
    items: itemInputs,
  }, {
    vo_type: "ประเภทงานเพิ่ม-ลด",
    title: "ชื่องาน",
    description: "รายละเอียด",
    client_name: "ชื่อลูกค้า",
    items: "รายการค่าใช้จ่าย",
  });
  if (required.length > 0) {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ", missing: required }, { status: 400 });
  }

  const voType = asVoType(String(body.vo_type || vo.vo_type || "VO+"));
  const requestedStatus = text(body.status) || currentStatus;
  const nextStatus = ["draft", "pending_approval", "rejected"].includes(requestedStatus) ? requestedStatus : currentStatus;
  const calculation = calculateVoTotals({
    items: itemInputs,
    tax: {
      vat_exempt: Boolean(body.vat_exempt),
      withholding_tax: String(body.withholding_tax || vo.withholding_tax || "0"),
      vat_rate: 7,
    },
  });
  if (calculation.items.length === 0) {
    return NextResponse.json({ error: "ต้องมีรายการอย่างน้อย 1 รายการ" }, { status: 400 });
  }

  const approvalDeadline = addCalendarDays(todayBangkok(), numberValue(String(body.approval_deadline_days || 14)));
  const supportingUploads = parseRows<UploadPayload>(body.supporting_doc_uploads);
  const supportingFiles = await uploadSupportingDocumentFiles(context, voId, supportingUploads);
  const supportingDocsText = text(body.supporting_docs);
  const existingSupportingDocs = text(vo.supporting_docs);
  const nextSupportingDocs = [
    supportingDocsText || existingSupportingDocs,
    ...supportingFiles.map((file) => `แนบไฟล์หลักฐานเพิ่ม: ${file.file_name}`),
  ].filter(Boolean).join("\n");
  const existingDocumentRefs = parseJsonArray(vo.document_refs_json);
  const nextDocumentRefs = safeJsonStringify([...existingDocumentRefs, ...supportingFiles]);

  const patch: SheetPatch = {
    revision_no: String(numberValue(vo.revision_no) + 1),
    vo_type: voType,
    title: text(body.title),
    description: text(body.description),
    source_type: text(body.source_type) || text(vo.source_type) || "client_request",
    source_ref_id: text(body.source_ref_id),
    source_description: text(body.source_description),
    subtotal: calculation.subtotal,
    vat_rate: calculation.vat_rate,
    vat_exempt: String(calculation.vat_exempt),
    withholding_tax: calculation.withholding_tax,
    vat_amount: calculation.vat_amount,
    wht_amount: calculation.wht_amount,
    grand_total: calculation.grand_total,
    net_payable: calculation.net_payable,
    contract_before: calculation.contract_before,
    contract_after: calculation.contract_after,
    approval_deadline: approvalDeadline,
    status: nextStatus,
    client_name: text(body.client_name) || text(vo.client_name) || text(context.project.client),
    supporting_docs: nextSupportingDocs,
    document_refs_json: nextDocumentRefs,
    notes: text(body.notes || vo.notes),
    extension_days: Math.max(0, numberValue(String(body.extension_days || 0))),
    amount_due: calculation.grand_total,
    balance: calculation.grand_total,
    updated_at: new Date().toISOString(),
  };

  await updateVo(context, vo, patch);
  const existingItems = getVoItems(data.items, voId);
  const firstItem = calculation.items[0];
  if (firstItem) {
    if (existingItems[0]) {
      await updateVoItem(context, existingItems[0], {
        item_no: firstItem.item_no,
        description: firstItem.description,
        unit: firstItem.unit,
        quantity: firstItem.quantity,
        unit_price: firstItem.unit_price,
        amount: firstItem.amount,
      });
    } else {
      await insert("VO_Items", {
        item_id: makeId("VOI"),
        vo_id: voId,
        project_id: context.project.project_id,
        item_no: firstItem.item_no,
        description: firstItem.description,
        unit: firstItem.unit,
        quantity: firstItem.quantity,
        unit_price: firstItem.unit_price,
        amount: firstItem.amount,
      }, context.siteSheetId);
    }
  }

  await Promise.all(supportingFiles.map((file, index) => insert("VO_Documents", {
    document_id: makeId("VOD"),
    vo_id: voId,
    project_id: context.project.project_id,
    document_type: "supporting-evidence",
    document_no: `${voId}-SUP-EDIT-${String(index + 1).padStart(2, "0")}`,
    title: file.file_name || `หลักฐานแนบเพิ่ม ${index + 1}`,
    html_snapshot: "",
    pdf_file_id: file.file_id,
    pdf_url: file.file_url,
    created_by_name: context.session.user.name || "",
    created_by_email: context.session.user.email || "",
  }, context.siteSheetId)));

  const nextVo = { ...vo, ...patch } as VoRecord;
  await writeAuditLog({
    actor: userActor(context),
    projectId: context.project.project_id,
    module: "variation_orders",
    action: "edited",
    targetId: voId,
    summary: `แก้ไข ${voId} มูลค่าใหม่ ${formatMoney(calculation.grand_total)} บาท`,
    before: vo,
    after: nextVo,
  });

  return NextResponse.json({ success: true, data: nextVo });
}

async function handleSubmitVo(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "vo.submitToClient");
  if (forbidden) return forbidden;

  const voId = String(body.vo_id || "");
  const checklist = (body.pm_checklist || {}) as Record<string, unknown>;
  const failed = ["items_correct", "calculation_verified", "linked_tasks_set", "supporting_docs_ok", "contract_value_ok"]
    .filter((key) => checklist[key] !== true);
  if (!voId) return NextResponse.json({ error: "ไม่พบเลขที่ VO" }, { status: 400 });
  if (failed.length > 0) {
    return NextResponse.json({ error: "PM checklist ยังไม่ครบ", missing: failed }, { status: 400 });
  }

  const { vos } = await getVoData(context);
  const vo = findVo(vos, voId);
  if (!vo?._rowIndex) return NextResponse.json({ error: "ไม่พบ VO" }, { status: 404 });
  if (asVoStatus(String(vo.status || "")) !== "draft") {
    return NextResponse.json({ error: "ส่งอนุมัติได้เฉพาะสถานะร่าง" }, { status: 400 });
  }

  await updateVo(context, vo, {
    status: "pending_approval",
    notes: String(checklist.pm_remarks || vo.notes || ""),
  });
  await notifyRole(context, "client", "vo_pending_approval", `รออนุมัติ ${voId}`, `${vo.title || "งานเพิ่ม-ลด"} มูลค่า ${formatMoney(vo.grand_total)} บาท`);
  await writeAuditLog({
    actor: userActor(context),
    projectId: context.project.project_id,
    module: "variation_orders",
    action: "submitted_to_client",
    targetId: voId,
    summary: `ส่ง ${voId} ให้ลูกค้าอนุมัติ`,
    before: vo,
    after: { ...vo, status: "pending_approval" },
  });

  return NextResponse.json({ success: true, data: { ...vo, status: "pending_approval" } });
}

async function handleSendApproval(req: Request, body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "vo.submitToClient");
  if (forbidden) return forbidden;

  const voId = String(body.vo_id || "");
  if (!voId) return NextResponse.json({ error: "ไม่พบเลขที่ VO" }, { status: 400 });

  const { vos, items, documents } = await getVoData(context);
  const vo = findVo(vos, voId);
  if (!vo?._rowIndex) return NextResponse.json({ error: "ไม่พบ VO" }, { status: 404 });

  const status = asVoStatus(String(vo.status || ""));
  if (!["draft", "pending_approval"].includes(status)) {
    return NextResponse.json({ error: "ส่งให้ลูกค้าอนุมัติได้เฉพาะ VO สถานะร่างหรือรออนุมัติเท่านั้น" }, { status: 400 });
  }

  const voItems = getVoItems(items, voId);
  if (voItems.length === 0) {
    return NextResponse.json({ error: "ต้องมีรายการค่าใช้จ่ายอย่างน้อย 1 รายการก่อนส่งอนุมัติ" }, { status: 400 });
  }

  const voSheet = await ensureVoSheetPdf({ context, vo, items: voItems, documents });
  if (!voSheet.pdfUrl) {
    return NextResponse.json({ error: "สร้าง PDF VO ไม่สำเร็จ กรุณาตรวจสอบ Google Drive folder ของโครงการ" }, { status: 400 });
  }

  const approvalToken = text(vo.approval_token) || createVoApprovalToken();
  const approvalOrigin = approvalOriginFrom(req, body);
  if (!approvalOrigin) return NextResponse.json({ error: "ไม่พบ URL ระบบสำหรับสร้างลิงก์อนุมัติ" }, { status: 400 });

  const approvalUrl = `${approvalOrigin}/variation-order-approval/${encodeURIComponent(context.project.project_id)}/${encodeURIComponent(approvalToken)}`;
  const targetLineGroupId = lineTargetFor(context);
  const lineMessage = buildVoApprovalLineMessage({
    projectName: text(context.project.name),
    projectId: context.project.project_id,
    voId: vo.vo_id,
    title: text(vo.title),
    total: vo.grand_total,
    extensionDays: vo.extension_days,
  });
  const flexMessage = buildVoApprovalLineFlex({
    projectName: text(context.project.name),
    projectId: context.project.project_id,
    voId: vo.vo_id,
    voType: text(vo.vo_type),
    title: text(vo.title),
    total: vo.grand_total,
    extensionDays: vo.extension_days,
    deadline: vo.approval_deadline,
    pdfUrl: voSheet.pdfUrl,
    approvalUrl,
  });

  await sendLineMessages([flexMessage], targetLineGroupId);

  const patch = {
    status: "pending_approval",
    approval_token: approvalToken,
    approval_url: approvalUrl,
    sent_to_customer_at: new Date().toISOString(),
    line_group_id: targetLineGroupId,
    line_message: lineMessage,
  };
  await updateVo(context, vo, patch);
  const nextVo = { ...vo, ...patch } as VoRecord;
  await notifyRole(context, "client", "vo_pending_approval", `รออนุมัติ ${voId}`, `${vo.title || "งานเพิ่ม-ลด"} มูลค่า ${formatMoney(vo.grand_total)} บาท`);
  await writeAuditLog({
    actor: userActor(context),
    projectId: context.project.project_id,
    module: "variation_orders",
    action: "line_approval_sent",
    targetId: voId,
    summary: `ส่ง LINE ให้ลูกค้าอนุมัติ VO: ${voId}`,
    before: vo,
    after: { ...patch, test_mode: isVoLineTestMode(), pdf_url: voSheet.pdfUrl },
  });

  return NextResponse.json({
    success: true,
    data: {
      ...nextVo,
      test_mode: isVoLineTestMode(),
      line_group_id: targetLineGroupId,
      pdf_url: voSheet.pdfUrl,
      approval_url: approvalUrl,
    },
  });
}

async function handleApproveOnBehalf(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "vo.approveOnBehalf");
  if (forbidden) return forbidden;

  const voId = String(body.vo_id || "");
  const evidence = (body.evidence || {}) as Record<string, unknown>;
  const required = validateRequired(evidence, {
    client_approved_by: "ชื่อผู้ยืนยันฝั่งลูกค้า",
    client_approved_date: "วันที่ลูกค้าแจ้งจริง",
    channel: "ช่องทางการอนุมัติ",
    evidence_type: "ประเภทหลักฐาน",
    evidence_description: "คำอธิบายหลักฐาน",
  });
  if (!voId) return NextResponse.json({ error: "ไม่พบเลขที่ VO" }, { status: 400 });
  if (required.length > 0) {
    return NextResponse.json({ error: "หลักฐานการอนุมัติไม่ครบ", missing: required }, { status: 400 });
  }

  const { vos, items } = await getVoData(context);
  const vo = findVo(vos, voId);
  if (!vo?._rowIndex) return NextResponse.json({ error: "ไม่พบ VO" }, { status: 404 });
  const status = asVoStatus(String(vo.status || ""));
  if (!["draft", "pending_approval"].includes(status)) {
    return NextResponse.json({ error: "บันทึกหลักฐานได้เฉพาะ VO ที่ยังไม่อนุมัติ" }, { status: 400 });
  }

  const uploadedEvidence = await uploadEvidenceFile(context, voId, body.evidence_file_upload as UploadPayload | undefined);
  const evidencePayload = {
    method: "office_on_behalf",
    confirmed_by_office: context.session.user.name || "",
    confirm_date: todayBangkok(),
    ...evidence,
    evidence_file_id: uploadedEvidence?.file_id || "",
    evidence_file_url: uploadedEvidence?.file_url || "",
    evidence_filename: uploadedEvidence?.file_name || evidence.evidence_filename || "",
  };
  const patch = {
    status: "approved",
    evidence_json: safeJsonStringify(evidencePayload),
    task_plan_status: "pending_plan",
  };
  await updateVo(context, vo, patch);

  const nextVo = { ...vo, ...patch } as VoRecord;
  const voItems = getVoItems(items, voId);
  const html = buildApprovalCertificateHtml({ vo: nextVo, items: voItems, project: context.project });
  await insertVoDocument({ context, vo: nextVo, items: voItems, documentType: "approval", title: "หนังสือรับรองการอนุมัติ", html });
  await Promise.all([
    notifyRole(context, "Staff", `vo_approved`, `VO อนุมัติแล้ว: ${voId}`, `วางบิลได้ มูลค่า ${formatMoney(vo.grand_total)} บาท`),
    notifyRole(context, "Project Manager", `vo_approved`, `VO อนุมัติแล้ว: ${voId}`, `รอเพิ่มเข้าแผนงานและติดตามวางบิล`),
  ]);
  await writeAuditLog({
    actor: userActor(context),
    projectId: context.project.project_id,
    module: "variation_orders",
    action: "approved_on_behalf",
    targetId: voId,
    summary: `อนุมัติแทนลูกค้า ${voId}`,
    before: vo,
    after: nextVo,
  });

  return NextResponse.json({ success: true, data: nextVo, document_html: html });
}

async function handleClientDecision(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "vo.recordClientDecision");
  if (forbidden) return forbidden;

  const voId = String(body.vo_id || "");
  const decision = String(body.decision || "").trim().toLowerCase();
  if (!voId || !["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "กรุณาระบุ VO และผลการตัดสินใจ" }, { status: 400 });
  }
  if (decision === "rejected" && !String(body.reject_reason || "").trim()) {
    return NextResponse.json({ error: "กรุณาระบุเหตุผลที่ปฏิเสธ" }, { status: 400 });
  }

  const { vos, items } = await getVoData(context);
  const vo = findVo(vos, voId);
  if (!vo?._rowIndex) return NextResponse.json({ error: "ไม่พบ VO" }, { status: 404 });
  if (asVoStatus(String(vo.status || "")) !== "pending_approval") {
    return NextResponse.json({ error: "ลูกค้าตัดสินใจได้เฉพาะ VO ที่รออนุมัติ" }, { status: 400 });
  }

  if (decision === "rejected") {
    const rejectionPayload = {
      rejected_by: context.session.user.name || context.session.user.email || "",
      rejected_email: context.session.user.email || "",
      rejected_date: todayBangkok(),
      reason: String(body.reject_reason || "").trim(),
      counter_proposal: String(body.counter_proposal || ""),
    };
    const nextVo = {
      ...vo,
      status: "rejected",
      rejection_json: safeJsonStringify(rejectionPayload),
    } as VoRecord;
    await updateVo(context, vo, {
      status: "rejected",
      rejection_json: nextVo.rejection_json,
    });
    await notifyRole(context, "Project Manager", "vo_rejected", `ลูกค้าปฏิเสธ ${voId}`, rejectionPayload.reason);
    await writeAuditLog({
      actor: userActor(context),
      projectId: context.project.project_id,
      module: "variation_orders",
      action: "client_rejected",
      targetId: voId,
      summary: `ลูกค้าปฏิเสธ ${voId}: ${rejectionPayload.reason}`,
      before: vo,
      after: nextVo,
    });
    return NextResponse.json({ success: true, data: nextVo });
  }

  const evidencePayload = {
    method: "client_direct",
    client_approved_by: context.session.user.name || context.session.user.email || String(vo.client_name || ""),
    client_approved_email: context.session.user.email || "",
    client_approved_date: todayBangkok(),
    channel: "system",
    evidence_type: "digital_consent",
    evidence_description: "ลูกค้ากดยืนยันอนุมัติผ่านระบบ",
    evidence_filename: "",
    digital_consent: true,
    remarks: String(body.client_remarks || ""),
  };
  const patch = {
    status: "approved",
    evidence_json: safeJsonStringify(evidencePayload),
    task_plan_status: "pending_plan",
  };
  await updateVo(context, vo, patch);

  const nextVo = { ...vo, ...patch } as VoRecord;
  const voItems = getVoItems(items, voId);
  const html = buildApprovalCertificateHtml({ vo: nextVo, items: voItems, project: context.project });
  await insertVoDocument({ context, vo: nextVo, items: voItems, documentType: "approval", title: "หนังสือรับรองการอนุมัติผ่านระบบ", html });
  await Promise.all([
    notifyRole(context, "Staff", "vo_approved", `VO อนุมัติแล้ว: ${voId}`, `วางบิลได้ มูลค่า ${formatMoney(vo.grand_total)} บาท`),
    notifyRole(context, "Project Manager", "vo_approved", `ลูกค้าอนุมัติ ${voId}`, `รอเพิ่มเข้าแผนงานและติดตามวางบิล`),
  ]);
  await writeAuditLog({
    actor: userActor(context),
    projectId: context.project.project_id,
    module: "variation_orders",
    action: "client_approved",
    targetId: voId,
    summary: `ลูกค้าอนุมัติ ${voId} ผ่านระบบ`,
    before: vo,
    after: nextVo,
  });

  return NextResponse.json({ success: true, data: nextVo, document_html: html });
}

async function handleAddToPlan(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "vo.addToPlan");
  if (forbidden) return forbidden;

  const voId = String(body.vo_id || "");
  const plan = (body.plan || {}) as Record<string, unknown>;
  const { vos, tasks } = await getVoData(context);
  const vo = findVo(vos, voId);
  if (!vo?._rowIndex) return NextResponse.json({ error: "ไม่พบ VO" }, { status: 404 });
  if (!["approved", "billed", "partial_payment", "paid", "overdue"].includes(asVoStatus(String(vo.status || "")))) {
    return NextResponse.json({ error: "เพิ่มเข้าแผนได้หลังอนุมัติแล้วเท่านั้น" }, { status: 400 });
  }

  const voType = asVoType(String(vo.vo_type || ""));
  let linkedTaskId = "";
  if (voType === "VO+") {
    const required = validateRequired(plan, {
      name: "ชื่องานในแผน",
      start: "วันเริ่ม",
      end: "วันจบ",
      parent_task_id: "หัวข้อหลัก",
    });
    if (required.length > 0) return NextResponse.json({ error: "ข้อมูล task ไม่ครบ", missing: required }, { status: 400 });

    const nextOrder = tasks.length + 1;
    linkedTaskId = makeId("TSK");
    await insert("Tasks", {
      task_id: linkedTaskId,
      project_id: context.project.project_id,
      name: String(plan.name || vo.title || ""),
      assignee: String(plan.assignee || ""),
      start: String(plan.start || ""),
      end: String(plan.end || ""),
      status: "To Do",
      percent_done: "0",
      category: String(plan.category || "งานทั่วไป"),
      duration_days: String(plan.duration_days || ""),
      priority: String(plan.priority || "ปกติ"),
      notes: String(plan.notes || `สร้างจาก ${vo.vo_id}`),
      order_index: String(plan.order_index || nextOrder),
      task_type: "subtask",
      parent_task_id: String(plan.parent_task_id || ""),
      planned_start: String(plan.start || ""),
      planned_end: String(plan.end || ""),
      linked_vo_id: vo.vo_id,
      vo_badge: numberValue(vo.balance) > 0 ? "รอชำระ" : "ชำระแล้ว",
      payment_note: `อ้างอิง ${vo.vo_id} / ยอดคงเหลือ ${formatMoney(vo.balance)} บาท`,
      gantt_locked: "FALSE",
      unlock_date: "",
      unlock_reason: "",
    }, context.siteSheetId);
  } else {
    linkedTaskId = String(plan.task_id || "");
    if (!linkedTaskId) return NextResponse.json({ error: "กรุณาเลือก task ที่เกี่ยวข้อง" }, { status: 400 });
    const task = tasks.find((row) => row.task_id === linkedTaskId);
    if (!task?._rowIndex) return NextResponse.json({ error: "ไม่พบ task ที่เลือก" }, { status: 404 });

    const label = voType === "VO-" ? "ลดตาม" : "สับเปลี่ยนตาม";
    const existingNotes = String(task.notes || "").trim();
    const nextNote = [existingNotes, `${label} ${vo.vo_id}: ${vo.title || ""}`].filter(Boolean).join("\n");
    await updateTaskFromVo(context, task, {
      notes: nextNote,
      linked_vo_id: vo.vo_id,
      vo_badge: voType === "VO-" ? "งานลด" : "สับเปลี่ยน",
      payment_note: `อ้างอิง ${vo.vo_id}`,
    });
  }

  await insert("VO_Task_Links", {
    link_id: makeId("VTL"),
    vo_id: vo.vo_id,
    project_id: context.project.project_id,
    task_id: linkedTaskId,
    link_type: voType,
    plan_status: "planned",
    task_note: String(plan.notes || ""),
    created_by_name: context.session.user.name || "",
    created_by_email: context.session.user.email || "",
  }, context.siteSheetId);
  await updateVo(context, vo, {
    task_plan_status: "planned",
    linked_tasks_json: safeJsonStringify([linkedTaskId]),
  });
  await notifyRole(context, "Engineer", "vo_task_planned", `งานจาก ${vo.vo_id} เข้าแผนแล้ว`, `${vo.title || "งานเพิ่ม-ลด"} อยู่ในแผนงานแล้ว`);
  await writeAuditLog({
    actor: userActor(context),
    projectId: context.project.project_id,
    module: "variation_orders",
    action: "added_to_plan",
    targetId: vo.vo_id,
    summary: `เพิ่ม ${vo.vo_id} เข้าแผนงาน task ${linkedTaskId}`,
    after: { vo_id: vo.vo_id, task_id: linkedTaskId },
  });

  return NextResponse.json({ success: true, data: { vo_id: vo.vo_id, task_id: linkedTaskId } });
}

async function handleCreateInvoice(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "vo.createInvoice");
  if (forbidden) return forbidden;

  const voId = String(body.vo_id || "");
  const invoiceDate = getDateValue(body.invoice_date);
  const { vos, items } = await getVoData(context);
  const vo = findVo(vos, voId);
  if (!vo?._rowIndex) return NextResponse.json({ error: "ไม่พบ VO" }, { status: 404 });
  if (asVoStatus(String(vo.status || "")) !== "approved") {
    return NextResponse.json({ error: "วางบิลได้เฉพาะ VO ที่อนุมัติแล้ว" }, { status: 400 });
  }
  if (!String(vo.evidence_json || "")) {
    return NextResponse.json({ error: "ต้องมี Approval Certificate/หลักฐานอนุมัติก่อนวางบิล" }, { status: 400 });
  }

  const invoiceNo = String(body.invoice_no || `INV-${vo.vo_id}`);
  const dueDate = addWorkingDays(invoiceDate, numberValue(String(body.due_days || 7)));
  const patch = {
    status: "billed",
    invoice_no: invoiceNo,
    invoice_date: invoiceDate,
    due_date: dueDate,
    amount_due: numberValue(vo.grand_total),
    balance: numberValue(vo.grand_total) - numberValue(vo.amount_paid),
    payment_status: "waiting_payment",
  };
  await updateVo(context, vo, patch);
  await insert("VO_Finance_Ledger", {
    ledger_id: makeId("VFL"),
    vo_id: vo.vo_id,
    project_id: context.project.project_id,
    entry_type: "invoice",
    ref_no: invoiceNo,
    entry_date: invoiceDate,
    debit: numberValue(vo.grand_total),
    credit: 0,
    balance: numberValue(vo.grand_total),
    summary: `วางบิล ${vo.vo_id}`,
    created_by_name: context.session.user.name || "",
    created_by_email: context.session.user.email || "",
  }, context.siteSheetId);

  const nextVo = { ...vo, ...patch } as VoRecord;
  const voItems = getVoItems(items, voId);
  const html = buildInvoiceHtml({ vo: nextVo, items: voItems, project: context.project });
  await insertVoDocument({ context, vo: nextVo, items: voItems, documentType: "invoice", title: "ใบแจ้งหนี้", html });
  await writeAuditLog({
    actor: userActor(context),
    projectId: context.project.project_id,
    module: "variation_orders",
    action: "billed",
    targetId: vo.vo_id,
    summary: `วางบิล ${invoiceNo} สำหรับ ${vo.vo_id}`,
    before: vo,
    after: nextVo,
  });

  return NextResponse.json({ success: true, data: nextVo, document_html: html });
}

async function handleRecordPayment(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "vo.recordPayment");
  if (forbidden) return forbidden;

  const voId = String(body.vo_id || "");
  const paidDate = getDateValue(body.paid_date);
  const amountPaid = numberValue(String(body.amount_paid || 0));
  if (!voId || amountPaid <= 0) return NextResponse.json({ error: "ข้อมูลชำระเงินไม่ครบ" }, { status: 400 });

  const { vos, taskLinks, tasks, items } = await getVoData(context);
  const vo = findVo(vos, voId);
  if (!vo?._rowIndex) return NextResponse.json({ error: "ไม่พบ VO" }, { status: 404 });
  if (!["billed", "partial_payment", "overdue"].includes(asVoStatus(String(vo.status || "")))) {
    return NextResponse.json({ error: "บันทึกชำระได้หลังวางบิลแล้วเท่านั้น" }, { status: 400 });
  }

  const uploadedEvidence = await uploadPaymentEvidenceFile(context, voId, body.payment_evidence_upload as UploadPayload | undefined);
  const evidenceFileValue = uploadedEvidence
    ? [uploadedEvidence.file_name, uploadedEvidence.file_url].filter(Boolean).join(" | ")
    : String(body.evidence_file || "");
  const paymentRef = String(body.payment_ref || uploadedEvidence?.file_name || "");
  const cumulativePaid = numberValue(vo.amount_paid) + amountPaid;
  const balance = Math.max(0, numberValue(vo.amount_due || vo.grand_total) - cumulativePaid);
  const nextStatus = balance <= 0 ? "paid" : "partial_payment";
  await insert("VO_Payments", {
    payment_id: makeId("VOP"),
    vo_id: vo.vo_id,
    project_id: context.project.project_id,
    invoice_no: String(vo.invoice_no || ""),
    receipt_no: String(body.receipt_no || `RCP-${vo.vo_id}`),
    paid_date: paidDate,
    amount_paid: amountPaid,
    payment_method: String(body.payment_method || "bank_transfer"),
    payment_ref: paymentRef,
    evidence_file: evidenceFileValue,
    recorded_by_name: context.session.user.name || "",
    recorded_by_email: context.session.user.email || "",
  }, context.siteSheetId);
  await updateVo(context, vo, {
    status: nextStatus,
    amount_paid: cumulativePaid,
    balance,
    payment_status: balance <= 0 ? "paid" : "partial_payment",
  });
  await insert("VO_Finance_Ledger", {
    ledger_id: makeId("VFL"),
    vo_id: vo.vo_id,
    project_id: context.project.project_id,
    entry_type: "payment",
    ref_no: String(body.receipt_no || `RCP-${vo.vo_id}`),
    entry_date: paidDate,
    debit: 0,
    credit: amountPaid,
    balance,
    summary: `รับชำระ ${vo.vo_id}`,
    created_by_name: context.session.user.name || "",
    created_by_email: context.session.user.email || "",
  }, context.siteSheetId);

  const nextVo = { ...vo, status: nextStatus, amount_paid: cumulativePaid, balance } as VoRecord;
  const voItems = getVoItems(items, vo.vo_id);
  const paymentRecord = {
    receipt_no: String(body.receipt_no || `RCP-${vo.vo_id}`),
    paid_date: paidDate,
    amount_paid: amountPaid,
    payment_method: String(body.payment_method || "bank_transfer"),
    payment_ref: paymentRef,
  };
  const receiptHtml = buildReceiptHtml({
    vo: nextVo,
    items: voItems,
    project: context.project,
    payment: paymentRecord,
    receiptNo: paymentRecord.receipt_no,
  });
  await insertVoDocument({
    context,
    vo: nextVo,
    items: voItems,
    documentType: balance <= 0 ? "receipt" : "partial-receipt",
    title: balance <= 0 ? "ใบเสร็จรับเงิน" : "ใบเสร็จรับเงินบางส่วน",
    html: receiptHtml,
  });

  let clearanceHtml = "";
  if (nextStatus === "paid") {
    const linkedIds = new Set(taskLinks.filter((link) => link.vo_id === vo.vo_id).map((link) => String(link.task_id || "")));
    await Promise.all(tasks
      .filter((task) => task._rowIndex && linkedIds.has(String(task.task_id || "")))
      .map((task) => updateTaskFromVo(context, task, {
        vo_badge: "ชำระแล้ว",
        payment_note: `ชำระครบตาม ${vo.vo_id}`,
      })));
    clearanceHtml = buildVoClearanceReportHtml({ vo: nextVo, items: voItems, project: context.project, taskCount: linkedIds.size });
    await insertVoDocument({
      context,
      vo: nextVo,
      items: voItems,
      documentType: "clearance",
      title: "รายงานปิดสถานะงานเพิ่ม-ลด",
      html: clearanceHtml,
    });
    await notifyRole(context, "Engineer", "vo_paid", `ชำระครบ ${vo.vo_id}`, "งานที่เกี่ยวข้องสามารถดำเนินการได้ตามแผน");
  } else {
    await notifyRole(context, "Project Manager", "vo_partial_payment", `ชำระบางส่วน ${vo.vo_id}`, `รับแล้ว ${formatMoney(cumulativePaid)} บาท คงเหลือ ${formatMoney(balance)} บาท`);
  }

  await writeAuditLog({
    actor: userActor(context),
    projectId: context.project.project_id,
    module: "variation_orders",
    action: "payment_recorded",
    targetId: vo.vo_id,
    summary: `รับชำระ ${formatMoney(amountPaid)} บาท สำหรับ ${vo.vo_id}`,
    before: vo,
    after: nextVo,
  });

  return NextResponse.json({ success: true, data: { vo_id: vo.vo_id, status: nextStatus, amount_paid: cumulativePaid, balance }, document_html: clearanceHtml || receiptHtml });
}

async function handleCancelVo(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "vo.cancel");
  if (forbidden) return forbidden;

  const voId = String(body.vo_id || "");
  const reason = String(body.reason || "").trim();
  if (!voId || !reason) return NextResponse.json({ error: "กรุณาระบุ VO และเหตุผลการยกเลิก" }, { status: 400 });

  const { vos } = await getVoData(context);
  const vo = findVo(vos, voId);
  if (!vo?._rowIndex) return NextResponse.json({ error: "ไม่พบ VO" }, { status: 404 });
  const status = asVoStatus(String(vo.status || ""));
  if (["billed", "paid", "partial_payment", "overdue", "work_unlocked"].includes(status)) {
    return NextResponse.json({ error: "VO นี้วางบิล/ชำระเงินแล้ว ต้อง void invoice ก่อนยกเลิก" }, { status: 400 });
  }

  await updateVo(context, vo, {
    status: "cancelled",
    notes: [vo.notes, `ยกเลิก: ${reason}`].filter(Boolean).join("\n"),
  });
  await writeAuditLog({
    actor: userActor(context),
    projectId: context.project.project_id,
    module: "variation_orders",
    action: "cancelled",
    targetId: vo.vo_id,
    summary: `ยกเลิก ${vo.vo_id}: ${reason}`,
    before: vo,
    after: { ...vo, status: "cancelled", reason },
  });

  return NextResponse.json({ success: true, data: { ...vo, status: "cancelled" } });
}

async function handleExpiryCheck(_body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "vo.expiryCheck");
  if (forbidden) return forbidden;

  const { vos } = await getVoData(context);
  const today = todayBangkok();
  const expired: Array<{ vo_id: string; days_expired: number; title: string }> = [];
  const expiringSoon: Array<{ vo_id: string; days_left: number; title: string }> = [];

  for (const vo of vos) {
    if (!vo._rowIndex || asVoStatus(String(vo.status || "")) !== "pending_approval") continue;
    const deadline = String(vo.approval_deadline || "");
    if (!deadline) continue;
    const daysPastDeadline = daysBetweenDates(deadline, today);
    const daysUntilDeadline = daysBetweenDates(today, deadline);

    if (daysPastDeadline > 0) {
      await updateVo(context, vo, { status: "expired" });
      expired.push({ vo_id: vo.vo_id, days_expired: daysPastDeadline, title: String(vo.title || "") });
      await writeAuditLog({
        actor: userActor(context),
        projectId: context.project.project_id,
        module: "variation_orders",
        action: "expired",
        targetId: vo.vo_id,
        summary: `${vo.vo_id} หมดอายุการอนุมัติ ${daysPastDeadline} วัน`,
        before: vo,
        after: { ...vo, status: "expired" },
      });
    } else if (daysUntilDeadline >= 0 && daysUntilDeadline <= 3) {
      expiringSoon.push({ vo_id: vo.vo_id, days_left: daysUntilDeadline, title: String(vo.title || "") });
    }
  }

  if (expired.length > 0) {
    await notifyRole(
      context,
      "Project Manager",
      "vo_expired",
      `พบ VO หมดอายุ ${expired.length} รายการ`,
      expired.map((item) => `${item.vo_id} เกินกำหนด ${item.days_expired} วัน - ${item.title}`).join("\n")
    );
  }

  return NextResponse.json({ success: true, expired, expiring_soon: expiringSoon });
}

async function handleOverdueCheck(_body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "vo.overdueCheck");
  if (forbidden) return forbidden;

  const { vos } = await getVoData(context);
  const today = todayBangkok();
  const updated: Array<{ vo_id: string; days_overdue: number; balance: number }> = [];
  const dueSoon: Array<{ vo_id: string; days_left: number; balance: number }> = [];

  for (const vo of vos) {
    const status = asVoStatus(String(vo.status || ""));
    if (!vo._rowIndex || !["billed", "partial_payment", "overdue"].includes(status)) continue;
    const dueDate = String(vo.due_date || "");
    if (!dueDate) continue;
    const dayDiff = daysBetweenDates(today, dueDate);
    const balance = numberValue(vo.balance);

    if (dayDiff < 0 && balance > 0) {
      const daysOverdue = Math.abs(dayDiff);
      if (status !== "overdue") {
        await updateVo(context, vo, {
          status: "overdue",
          payment_status: "overdue",
        });
        await writeAuditLog({
          actor: userActor(context),
          projectId: context.project.project_id,
          module: "variation_orders",
          action: "overdue_flagged",
          targetId: vo.vo_id,
          summary: `ใบแจ้งหนี้ ${vo.invoice_no || vo.vo_id} เกินกำหนด ${daysOverdue} วัน`,
          before: vo,
          after: { ...vo, status: "overdue", payment_status: "overdue" },
        });
      }
      updated.push({ vo_id: vo.vo_id, days_overdue: daysOverdue, balance });
    } else if (dayDiff >= 0 && dayDiff <= 3 && balance > 0) {
      dueSoon.push({ vo_id: vo.vo_id, days_left: dayDiff, balance });
    }
  }

  if (updated.length > 0) {
    await notifyRole(
      context,
      "Project Manager",
      "vo_overdue",
      `พบ VO เกินกำหนด ${updated.length} รายการ`,
      updated.map((item) => `${item.vo_id} เกิน ${item.days_overdue} วัน ค้าง ${formatMoney(item.balance)} บาท`).join("\n")
    );
  }

  return NextResponse.json({ success: true, overdue: updated, due_soon: dueSoon });
}

async function handleGenerateMonthlyReport(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "vo.generateMonthlyReport");
  if (forbidden) return forbidden;

  const month = String(body.month || todayBangkok().slice(0, 7));
  const { vos } = await getVoData(context);
  const monthlyVos = vos.filter((vo) => {
    const createdAt = String(vo.created_at || "");
    const invoiceDate = String(vo.invoice_date || "");
    return createdAt.startsWith(month) || invoiceDate.startsWith(month);
  });
  const html = buildVoMonthlyReportHtml({
    project: context.project,
    vos: monthlyVos,
    month,
    preparedBy: context.session.user.name || "",
  });

  const reportVo = {
    vo_id: `VO-MR-${context.project.project_id}-${month}`,
    project_id: context.project.project_id,
    status: "draft",
  } as VoRecord;
  await insertVoDocument({
    context,
    vo: reportVo,
    items: [],
    documentType: "monthly-report",
    title: `รายงานงานเพิ่ม-ลดประจำเดือน ${month}`,
    html,
  });
  await writeAuditLog({
    actor: userActor(context),
    projectId: context.project.project_id,
    module: "variation_orders",
    action: "monthly_report_generated",
    targetId: reportVo.vo_id,
    summary: `สร้างรายงานงานเพิ่ม-ลดประจำเดือน ${month}`,
    after: { month, count: monthlyVos.length },
  });

  return NextResponse.json({ success: true, data: { month, count: monthlyVos.length }, document_html: html });
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const routeContext = context as RouteContext;
    const [data, auditLogs] = await Promise.all([
      getVoData(routeContext),
      findAllMaster("AuditLogs") as Promise<SheetRecord[]>,
    ]);
    const itemsByVo = new Map<string, VoItemRecord[]>();
    data.items.forEach((item) => {
      const current = itemsByVo.get(item.vo_id) || [];
      current.push(item);
      itemsByVo.set(item.vo_id, current);
    });

    const vos = data.vos
      .map((vo) => ({ ...vo, items: getVoItems(itemsByVo.get(vo.vo_id) || [], vo.vo_id) }))
      .sort((a, b) => new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime());
    const documents = data.documents.map((document) => {
      const copy = { ...document };
      delete copy.html_snapshot;
      return copy;
    });

    return NextResponse.json({
      success: true,
      project: routeContext.project,
      data: vos,
      documents,
      payments: data.payments,
      task_links: data.taskLinks,
      tasks: data.tasks,
      ledger: data.ledger,
      line: {
        test_mode: isVoLineTestMode(),
        target_group_id: lineTargetFor(routeContext),
        target_group_name: isVoLineTestMode() ? "VO LINE Test Group" : text(routeContext.project.line_group_name),
      },
      audit_logs: auditLogs
        .filter((log) => log.project_id === routeContext.project.project_id && log.module === "variation_orders")
        .sort((a, b) => new Date(String(b.timestamp || 0)).getTime() - new Date(String(a.timestamp || 0)).getTime())
        .slice(0, 200),
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
    const action = String(body.action || "");

    if (action === "create_vo") return handleCreateVo(body, routeContext);
    if (action === "update_vo") return handleUpdateVo(body, routeContext);
    if (action === "submit_to_client") return handleSubmitVo(body, routeContext);
    if (action === "send_approval") return handleSendApproval(req, body, routeContext);
    if (action === "approve_on_behalf") return handleApproveOnBehalf(body, routeContext);
    if (action === "client_decision") return handleClientDecision(body, routeContext);
    if (action === "add_to_plan") return handleAddToPlan(body, routeContext);
    if (action === "create_invoice") return handleCreateInvoice(body, routeContext);
    if (action === "record_payment") return handleRecordPayment(body, routeContext);
    if (action === "cancel_vo") return handleCancelVo(body, routeContext);
    if (action === "expiry_check") return handleExpiryCheck(body, routeContext);
    if (action === "overdue_check") return handleOverdueCheck(body, routeContext);
    if (action === "generate_monthly_report") return handleGenerateMonthlyReport(body, routeContext);

    return NextResponse.json({ error: "ไม่รู้จัก action นี้" }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
