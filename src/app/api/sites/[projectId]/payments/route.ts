import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auditLog";
import { downloadFile, findOrCreateFolder, uploadFile } from "@/lib/drive";
import { sendGmailWithAttachments, type GmailAttachment } from "@/lib/gmailSender";
import { createNotification } from "@/lib/notifications";
import { renderHtmlToPdfBuffer } from "@/lib/pdfRenderer";
import { hasPermission, permissionDeniedMessage, type AppPermission } from "@/lib/permissions";
import { findAll, insert, update } from "@/lib/sheetsCrud";
import { getErrorMessage, getSiteApiContext, makeId } from "@/lib/siteApi";
import {
  PAYMENT_STATUS_LABELS,
  buildAccountingEmail,
  buildPaymentClaimPrintHtml,
  todayBangkok,
  type PaymentClaim,
  type PaymentClaimAttachment,
  type PaymentClaimItem,
  type PaymentClaimStatus,
  type PaymentClaimType,
} from "@/lib/paymentClaims";

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

type SheetRecord = Record<string, string | number | undefined> & { _rowIndex?: number };
type PaymentClaimRow = SheetRecord & {
  claim_id: string;
  project_id: string;
  doc_no: string;
  type: PaymentClaimType;
  status: PaymentClaimStatus;
};

function safeFolderName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "Other";
}

function getClaimMonthKey(dateValue?: string) {
  const value = String(dateValue || todayBangkok()).trim();
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  return todayBangkok().slice(0, 7);
}

async function getPaymentClaimDriveFolder(context: RouteContext, docNo: string, claimId: string, dateValue?: string) {
  const driveFolderId = String(context.project.drive_folder_id || "").trim();
  if (!driveFolderId) return null;
  const paymentsFolder = await findOrCreateFolder("Payment Claims", driveFolderId);
  const monthFolder = await findOrCreateFolder(getClaimMonthKey(dateValue), paymentsFolder.id || driveFolderId);
  return findOrCreateFolder(safeFolderName(docNo || claimId), monthFolder.id || paymentsFolder.id || driveFolderId);
}

const validStatuses = new Set<PaymentClaimStatus>([
  "DRAFT",
  "SUBMITTED_TO_ACCOUNTING",
  "UNDER_REVIEW",
  "NEEDS_MORE_INFO",
  "APPROVED",
  "TRANSFERRED",
  "CLOSED",
  "REJECTED",
]);

function userActor(context: RouteContext) {
  return {
    email: context.session.user.email || "",
    name: context.session.user.name || "",
    role: context.session.user.role || "",
    googleSub: context.session.user.googleSub || "",
  };
}

function numberValue(value?: unknown) {
  const numeric = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function jsonStringify(value: unknown) {
  try {
    return JSON.stringify(value ?? []);
  } catch {
    return "[]";
  }
}

function parseJsonArray<T>(value?: unknown): T[] {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function nowIso() {
  return new Date().toISOString();
}

function requirePermission(context: RouteContext, permission: AppPermission) {
  if (!hasPermission(context.session.user.role, permission)) {
    return NextResponse.json({ error: permissionDeniedMessage(permission) }, { status: 403 });
  }
  return null;
}

function appendRemark(current: unknown, note: string) {
  const text = String(note || "").trim();
  if (!text) return String(current || "");
  const stamped = `${text} · ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`;
  return [String(current || "").trim(), stamped].filter(Boolean).join(" | ");
}

function normalizeStatus(value: unknown) {
  const status = String(value || "").trim().toUpperCase() as PaymentClaimStatus;
  return validStatuses.has(status) ? status : null;
}

function rowToClaim(row: PaymentClaimRow, items: PaymentClaimItem[]): PaymentClaim {
  return {
    id: row.claim_id,
    docNo: String(row.doc_no || ""),
    type: row.type,
    status: row.status,
    siteId: String(row.project_id || ""),
    siteName: String(row.site_name || ""),
    projectName: String(row.project_name || row.site_name || row.project_id || ""),
    preparedBy: String(row.prepared_by || ""),
    payeeName: String(row.payee_name || ""),
    payeeKind: String(row.payee_kind || "ร้านค้า") as PaymentClaim["payeeKind"],
    payeeIdMasked: String(row.payee_id_masked || ""),
    bankName: String(row.bank_name || ""),
    accountNoMasked: String(row.account_no_masked || ""),
    createdDate: String(row.created_date || ""),
    dueDate: String(row.due_date || ""),
    payPeriod: String(row.pay_period || ""),
    installment: String(row.installment || ""),
    description: String(row.description || ""),
    grossAmount: numberValue(row.gross_amount),
    vatAmount: numberValue(row.vat_amount),
    whtAmount: numberValue(row.wht_amount),
    retentionAmount: numberValue(row.retention_amount),
    netPayable: numberValue(row.net_payable),
    attachments: parseJsonArray<PaymentClaimAttachment>(row.attachments_json),
    items,
    remarks: String(row.remarks || ""),
  };
}

function claimToSheetPayload(claim: PaymentClaim, context: RouteContext) {
  const actor = userActor(context);
  return {
    claim_id: claim.id || makeId("PAY"),
    project_id: context.project.project_id,
    doc_no: claim.docNo,
    type: claim.type,
    status: claim.status,
    site_name: claim.siteName || context.project.name || context.project.project_id,
    project_name: claim.projectName || context.project.name || context.project.project_id,
    prepared_by: claim.preparedBy,
    payee_name: claim.payeeName,
    payee_kind: claim.payeeKind,
    payee_id_masked: claim.payeeIdMasked || "",
    bank_name: claim.bankName || "",
    account_no_masked: claim.accountNoMasked || "",
    created_date: claim.createdDate || todayBangkok(),
    due_date: claim.dueDate || claim.createdDate || todayBangkok(),
    pay_period: claim.payPeriod || "",
    installment: claim.installment || "",
    description: claim.description,
    gross_amount: claim.grossAmount,
    vat_amount: claim.vatAmount,
    wht_amount: claim.whtAmount,
    retention_amount: claim.retentionAmount,
    net_payable: claim.netPayable,
    attachments_json: jsonStringify(claim.attachments),
    remarks: claim.remarks || "",
    transfer_date: "",
    transfer_ref: "",
    closed_at: "",
    created_by_name: actor.name,
    created_by_email: actor.email,
    updated_by_name: actor.name,
    updated_by_email: actor.email,
  };
}

async function insertPaymentAudit(context: RouteContext, input: {
  claimId: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  note?: string;
}) {
  const actor = userActor(context);
  await insert("Payment_Claim_Audit", {
    audit_id: makeId("PCA"),
    claim_id: input.claimId,
    project_id: context.project.project_id,
    action: input.action,
    from_status: input.fromStatus || "",
    to_status: input.toStatus || "",
    note: input.note || "",
    actor_name: actor.name,
    actor_email: actor.email,
    actor_role: actor.role,
    created_at: nowIso(),
  }, context.siteSheetId);
}

async function notifyPaymentWorkflow(context: RouteContext, input: {
  claimId: string;
  docNo: string;
  status: PaymentClaimStatus;
  action: string;
  note?: string;
}) {
  const actor = userActor(context);
  const link = `/dashboard/sites/${encodeURIComponent(context.project.project_id)}/payments`;
  const projectName = String(context.project.name || context.project.project_id);
  const targetsByStatus: Record<PaymentClaimStatus, string[]> = {
    DRAFT: [],
    SUBMITTED_TO_ACCOUNTING: ["Staff"],
    UNDER_REVIEW: ["Project Manager"],
    NEEDS_MORE_INFO: ["Engineer", "Project Manager"],
    APPROVED: ["Engineer", "Project Manager"],
    TRANSFERRED: ["Engineer", "Project Manager"],
    CLOSED: ["Project Manager"],
    REJECTED: ["Engineer", "Project Manager"],
  };
  const targetRoles = targetsByStatus[input.status] || [];
  if (targetRoles.length === 0) return;

  await Promise.allSettled(targetRoles.map((targetRole) => createNotification({
    project_id: context.project.project_id,
    target_role: targetRole,
    type: `payment_${input.action}`,
    title: `${PAYMENT_STATUS_LABELS[input.status]}: ${input.docNo}`,
    message: `${projectName} - ${input.note || PAYMENT_STATUS_LABELS[input.status]}`,
    link,
    created_by_email: actor.email,
    created_by_name: actor.name,
  })));
}

async function getPaymentData(context: RouteContext) {
  const [claimRows, itemRows, auditRows, documentRows] = await Promise.all([
    findAll("Payment_Claims", context.siteSheetId) as unknown as Promise<PaymentClaimRow[]>,
    findAll("Payment_Claim_Items", context.siteSheetId) as unknown as Promise<SheetRecord[]>,
    findAll("Payment_Claim_Audit", context.siteSheetId) as unknown as Promise<SheetRecord[]>,
    findAll("Payment_Claim_Documents", context.siteSheetId) as unknown as Promise<SheetRecord[]>,
  ]);
  const projectId = context.project.project_id;
  const scopedClaims = claimRows.filter((row) => row.project_id === projectId);
  const scopedItems = itemRows.filter((row) => row.project_id === projectId);
  const scopedAudit = auditRows.filter((row) => row.project_id === projectId);
  const scopedDocuments = documentRows.filter((row) => row.project_id === projectId);
  const itemsByClaim = new Map<string, PaymentClaimItem[]>();

  scopedItems.forEach((row) => {
    const item: PaymentClaimItem = {
      description: String(row.description || ""),
      quantity: numberValue(row.quantity),
      unit: String(row.unit || ""),
      unitPrice: numberValue(row.unit_price),
    };
    const current = itemsByClaim.get(String(row.claim_id || "")) || [];
    current.push(item);
    itemsByClaim.set(String(row.claim_id || ""), current);
  });

  const claims = scopedClaims
    .map((row) => rowToClaim(row, itemsByClaim.get(row.claim_id) || []))
    .sort((a, b) => new Date(`${b.createdDate || "1970-01-01"}T00:00:00+07:00`).getTime() - new Date(`${a.createdDate || "1970-01-01"}T00:00:00+07:00`).getTime());

  return { claims, claimRows: scopedClaims, auditRows: scopedAudit, documentRows: scopedDocuments };
}

async function handleCreateClaim(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "payment.create");
  if (forbidden) return forbidden;

  const claim = body.claim as PaymentClaim | undefined;
  if (!claim?.docNo || !claim.type || !claim.payeeName) {
    return NextResponse.json({ error: "ข้อมูล Payment Claim ไม่ครบ" }, { status: 400 });
  }

  const status = normalizeStatus(claim.status) || "DRAFT";
  const claimId = claim.id || makeId("PAY");
  const payload = claimToSheetPayload({ ...claim, id: claimId, status }, context);
  await insert("Payment_Claims", payload, context.siteSheetId);
  await Promise.all((claim.items || []).map((item, index) => insert("Payment_Claim_Items", {
    item_id: makeId("PCI"),
    claim_id: claimId,
    project_id: context.project.project_id,
    item_no: index + 1,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unitPrice,
    amount: item.quantity * item.unitPrice,
  }, context.siteSheetId)));
  await insertPaymentAudit(context, {
    claimId,
    action: "created",
    toStatus: status,
    note: String(body.note || `สร้าง ${claim.docNo}`),
  });
  if (status === "SUBMITTED_TO_ACCOUNTING") {
    await notifyPaymentWorkflow(context, {
      claimId,
      docNo: claim.docNo,
      status,
      action: "created",
      note: `สร้างและส่ง ${claim.docNo} เข้าบัญชี`,
    });
  }
  await writeAuditLog({
    actor: userActor(context),
    projectId: context.project.project_id,
    module: "payment_claims",
    action: "created",
    targetId: claimId,
    summary: `สร้าง Payment Claim ${claim.docNo}`,
    after: payload,
  });

  return NextResponse.json({ success: true, data: rowToClaim(payload as PaymentClaimRow, claim.items || []) });
}

async function handleUpdateStatus(body: Record<string, unknown>, context: RouteContext) {
  const nextStatus = normalizeStatus(body.status);
  if (!nextStatus) return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });

  const workflowAction = String(body.workflow_action || "status_updated");
  const permissionByAction: Partial<Record<string, AppPermission>> = {
    submit: "payment.submit",
    review: "payment.review",
    approve: "payment.approve",
    needs_info: "payment.requestInfo",
    reject: "payment.reject",
    transfer: "payment.transfer",
    close: "payment.close",
  };
  const permission = permissionByAction[workflowAction];
  if (!permission) return NextResponse.json({ error: "ไม่รู้จัก workflow action นี้" }, { status: 400 });
  const forbidden = requirePermission(context, permission);
  if (forbidden) return forbidden;

  const claimId = String(body.claim_id || body.id || "");
  const docNo = String(body.doc_no || body.docNo || "");
  if (!claimId && !docNo) return NextResponse.json({ error: "ไม่พบ claim_id หรือ doc_no" }, { status: 400 });

  const { claimRows } = await getPaymentData(context);
  const current = claimRows.find((row) => (claimId && row.claim_id === claimId) || (docNo && row.doc_no === docNo));
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบ Payment Claim" }, { status: 404 });

  const actor = userActor(context);
  const note = String(body.note || "");
  const patch: Record<string, string | number> = {
    status: nextStatus,
    remarks: appendRemark(current.remarks, note || PAYMENT_STATUS_LABELS[nextStatus]),
    updated_by_name: actor.name,
    updated_by_email: actor.email,
  };
  if (nextStatus === "TRANSFERRED") {
    const transferRefFromNote = String(body.note || "").match(/ref:\s*([^ ]+)/i)?.[1] || "";
    patch.transfer_date = String(body.transfer_date || todayBangkok());
    patch.transfer_ref = String(body.transfer_ref || body.transferRef || transferRefFromNote);
  }
  if (nextStatus === "CLOSED") {
    patch.closed_at = nowIso();
  }

  await update("Payment_Claims", Number(current._rowIndex), patch, context.siteSheetId);
  await insertPaymentAudit(context, {
    claimId: current.claim_id,
    action: workflowAction,
    fromStatus: current.status,
    toStatus: nextStatus,
    note,
  });
  await notifyPaymentWorkflow(context, {
    claimId: current.claim_id,
    docNo: current.doc_no,
    status: nextStatus,
    action: workflowAction,
    note,
  });
  await writeAuditLog({
    actor,
    projectId: context.project.project_id,
    module: "payment_claims",
    action: workflowAction,
    targetId: current.claim_id,
    summary: `${current.doc_no} ${current.status} -> ${nextStatus}`,
    before: current,
    after: { ...current, ...patch },
  });

  return NextResponse.json({ success: true, data: { ...current, ...patch } });
}

async function handleUploadAttachment(req: Request, context: RouteContext) {
  const forbidden = requirePermission(context, "payment.uploadAttachment");
  if (forbidden) return forbidden;

  const driveFolderId = String(context.project.drive_folder_id || "").trim();
  if (!driveFolderId) {
    return NextResponse.json({ error: "Project has no Google Drive folder" }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "กรุณาเลือกไฟล์แนบ" }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "ไฟล์ต้องไม่เกิน 20MB" }, { status: 400 });
  }

  const claimId = String(formData.get("claim_id") || "");
  const docNo = String(formData.get("doc_no") || "");
  const attachmentName = String(formData.get("attachment_name") || "").trim();
  if ((!claimId && !docNo) || !attachmentName) {
    return NextResponse.json({ error: "ข้อมูลไฟล์แนบไม่ครบ" }, { status: 400 });
  }

  const { claimRows } = await getPaymentData(context);
  const current = claimRows.find((row) => (claimId && row.claim_id === claimId) || (docNo && row.doc_no === docNo));
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบ Payment Claim" }, { status: 404 });

  const claimFolder = await getPaymentClaimDriveFolder(context, current.doc_no, current.claim_id, String(current.created_date || ""));
  if (!claimFolder?.id) {
    return NextResponse.json({ error: "สร้างโฟลเดอร์ Payment Claim ไม่สำเร็จ" }, { status: 500 });
  }
  const attachmentFolder = await findOrCreateFolder(safeFolderName(attachmentName), claimFolder.id || driveFolderId);
  const bytes = Buffer.from(await file.arrayBuffer());
  const storedName = `${Date.now()}-${safeFolderName(file.name)}`;
  const uploaded = await uploadFile(storedName, file.type || "application/octet-stream", bytes, attachmentFolder.id || driveFolderId);
  const actor = userActor(context);
  const uploadedAt = nowIso();
  const attachments = parseJsonArray<PaymentClaimAttachment>(current.attachments_json);
  const nextAttachments = attachments.map((attachment) => {
    if (attachment.name !== attachmentName) return attachment;
    return {
      ...attachment,
      present: true,
      fileName: file.name,
      fileId: uploaded.id || "",
      fileUrl: uploaded.webViewLink || uploaded.webContentLink || "",
      uploadedAt,
      uploadedBy: actor.name || actor.email,
    };
  });
  const hasExistingAttachment = nextAttachments.some((attachment) => attachment.name === attachmentName);
  if (!hasExistingAttachment) {
    nextAttachments.push({
      name: attachmentName,
      required: false,
      present: true,
      fileName: file.name,
      fileId: uploaded.id || "",
      fileUrl: uploaded.webViewLink || uploaded.webContentLink || "",
      uploadedAt,
      uploadedBy: actor.name || actor.email,
    });
  }

  await update("Payment_Claims", Number(current._rowIndex), {
    attachments_json: jsonStringify(nextAttachments),
    remarks: appendRemark(current.remarks, `แนบไฟล์ ${attachmentName}: ${file.name}`),
    updated_by_name: actor.name,
    updated_by_email: actor.email,
  }, context.siteSheetId);
  await insertPaymentAudit(context, {
    claimId: current.claim_id,
    action: "attachment_uploaded",
    fromStatus: current.status,
    toStatus: current.status,
    note: `${attachmentName}: ${file.name}`,
  });
  await writeAuditLog({
    actor,
    projectId: context.project.project_id,
    module: "payment_claims",
    action: "attachment_uploaded",
    targetId: current.claim_id,
    summary: `แนบไฟล์ ${attachmentName} ให้ ${current.doc_no}`,
    after: { attachmentName, fileName: file.name, fileId: uploaded.id || "" },
  });

  return NextResponse.json({
    success: true,
    data: {
      claim_id: current.claim_id,
      attachment_name: attachmentName,
      file_name: file.name,
      drive_file_id: uploaded.id || "",
      drive_url: uploaded.webViewLink || uploaded.webContentLink || "",
      attachments: nextAttachments,
    },
  });
}

async function handleGenerateDocument(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "payment.generateDocument");
  if (forbidden) return forbidden;

  const driveFolderId = String(context.project.drive_folder_id || "").trim();
  if (!driveFolderId) {
    return NextResponse.json({ error: "Project has no Google Drive folder" }, { status: 400 });
  }

  const claimId = String(body.claim_id || body.id || "");
  const docNo = String(body.doc_no || body.docNo || "");
  if (!claimId && !docNo) return NextResponse.json({ error: "ไม่พบ claim_id หรือ doc_no" }, { status: 400 });

  const { claims } = await getPaymentData(context);
  const claim = claims.find((item) => (claimId && item.id === claimId) || (docNo && item.docNo === docNo));
  if (!claim) return NextResponse.json({ error: "ไม่พบ Payment Claim" }, { status: 404 });

  const html = buildPaymentClaimPrintHtml(claim);
  const claimFolder = await getPaymentClaimDriveFolder(context, claim.docNo, claim.id, claim.createdDate);
  if (!claimFolder?.id) {
    return NextResponse.json({ error: "สร้างโฟลเดอร์ Payment Claim ไม่สำเร็จ" }, { status: 500 });
  }

  const documentType = String(body.document_type || "payment-claim");
  const documentNo = `${claim.docNo}-${documentType.toUpperCase()}`;
  const pdfBuffer = await renderHtmlToPdfBuffer(html, documentNo);
  const uploaded = await uploadFile(`${documentNo}.pdf`, "application/pdf", pdfBuffer, claimFolder.id);
  const actor = userActor(context);
  await insert("Payment_Claim_Documents", {
    document_id: makeId("PCD"),
    claim_id: claim.id,
    project_id: context.project.project_id,
    document_type: documentType,
    document_no: documentNo,
    title: `PDF ${claim.docNo}`,
    html_snapshot: html,
    pdf_file_id: uploaded.id || "",
    pdf_url: uploaded.webViewLink || uploaded.webContentLink || "",
    created_by_name: actor.name,
    created_by_email: actor.email,
    created_at: nowIso(),
  }, context.siteSheetId);
  await insertPaymentAudit(context, {
    claimId: claim.id,
    action: "document_generated",
    fromStatus: claim.status,
    toStatus: claim.status,
    note: documentNo,
  });
  await writeAuditLog({
    actor,
    projectId: context.project.project_id,
    module: "payment_claims",
    action: "document_generated",
    targetId: claim.id,
    summary: `สร้าง PDF ${documentNo}`,
    after: { documentNo, pdfFileId: uploaded.id || "", pdfUrl: uploaded.webViewLink || uploaded.webContentLink || "" },
  });

  return NextResponse.json({
    success: true,
    data: {
      claim_id: claim.id,
      document_no: documentNo,
      pdf_file_id: uploaded.id || "",
      pdf_url: uploaded.webViewLink || uploaded.webContentLink || "",
    },
  });
}

function parseEmailList(value: unknown) {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  return Array.from(new Set(
    raw
      .split(/[,\s;]+/g)
      .map((email) => email.trim().toLowerCase())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  ));
}

async function createPaymentClaimPdfAttachment(
  claim: PaymentClaim,
  context: RouteContext,
  documentType: string,
) {
  const html = buildPaymentClaimPrintHtml(claim);
  const claimFolder = await getPaymentClaimDriveFolder(context, claim.docNo, claim.id, claim.createdDate);
  if (!claimFolder?.id) {
    throw new Error("Cannot create Payment Claim Drive folder");
  }

  const documentNo = `${claim.docNo}-${documentType.toUpperCase()}`;
  const pdfBuffer = await renderHtmlToPdfBuffer(html, documentNo);
  const uploaded = await uploadFile(`${documentNo}.pdf`, "application/pdf", pdfBuffer, claimFolder.id);
  const actor = userActor(context);
  await insert("Payment_Claim_Documents", {
    document_id: makeId("PCD"),
    claim_id: claim.id,
    project_id: context.project.project_id,
    document_type: documentType,
    document_no: documentNo,
    title: `PDF ${claim.docNo}`,
    html_snapshot: html,
    pdf_file_id: uploaded.id || "",
    pdf_url: uploaded.webViewLink || uploaded.webContentLink || "",
    created_by_name: actor.name,
    created_by_email: actor.email,
    created_at: nowIso(),
  }, context.siteSheetId);

  return {
    documentNo,
    pdfUrl: uploaded.webViewLink || uploaded.webContentLink || "",
    attachment: {
      filename: `${documentNo}.pdf`,
      mimeType: "application/pdf",
      content: pdfBuffer,
    } satisfies GmailAttachment,
  };
}

async function buildPaymentEvidenceEmailAttachments(claim: PaymentClaim) {
  const maxBytes = 18 * 1024 * 1024;
  const attachments: GmailAttachment[] = [];
  const skipped: string[] = [];
  let totalBytes = 0;

  for (const evidence of claim.attachments) {
    if (!evidence.present || !evidence.fileId) continue;
    try {
      const downloaded = await downloadFile(evidence.fileId);
      if (totalBytes + downloaded.buffer.length > maxBytes) {
        skipped.push(`${evidence.name}: ${downloaded.name} (ไฟล์ใหญ่เกินสำหรับแนบอีเมล)`);
        continue;
      }
      totalBytes += downloaded.buffer.length;
      attachments.push({
        filename: downloaded.name,
        mimeType: downloaded.mimeType,
        content: downloaded.buffer,
      });
    } catch (error) {
      console.warn(`Payment evidence attachment skipped for ${claim.docNo}:`, error);
      skipped.push(`${evidence.name}: ${evidence.fileName || evidence.fileId}`);
    }
  }

  return { attachments, skipped };
}

async function handleSubmitClaimEmail(body: Record<string, unknown>, context: RouteContext) {
  const forbidden = requirePermission(context, "payment.submit");
  if (forbidden) return forbidden;

  const recipients = parseEmailList(body.recipients || body.recipient_email || body.to);
  if (recipients.length === 0) {
    return NextResponse.json({ error: "กรุณากรอกอีเมลผู้รับให้ถูกต้อง" }, { status: 400 });
  }

  const claimId = String(body.claim_id || body.id || "");
  const docNo = String(body.doc_no || body.docNo || "");
  if (!claimId && !docNo) return NextResponse.json({ error: "ไม่พบ claim_id หรือ doc_no" }, { status: 400 });

  const { claims, claimRows } = await getPaymentData(context);
  const claim = claims.find((item) => (claimId && item.id === claimId) || (docNo && item.docNo === docNo));
  const current = claimRows.find((row) => (claimId && row.claim_id === claimId) || (docNo && row.doc_no === docNo));
  if (!claim || !current?._rowIndex) return NextResponse.json({ error: "ไม่พบ Payment Claim" }, { status: 404 });

  const actor = userActor(context);
  const pdf = await createPaymentClaimPdfAttachment(claim, context, "payment-claim-email");
  const evidence = await buildPaymentEvidenceEmailAttachments(claim);
  const generatedEmail = buildAccountingEmail(claim, {
    name: actor.name || claim.preparedBy,
    position: "SE / Engineering",
  });
  const evidenceLinks = claim.attachments
    .filter((attachment) => attachment.present && attachment.fileUrl)
    .map((attachment, index) => `${index + 1}. ${attachment.name}: ${attachment.fileUrl}`);
  const skippedLines = evidence.skipped.length
    ? ["", "หมายเหตุไฟล์หลักฐานที่ไม่ได้แนบในอีเมล:", ...evidence.skipped.map((item, index) => `${index + 1}. ${item}`)]
    : [];
  const bodyText = [
    generatedEmail.body,
    "",
    `แนบ PDF ใบเบิก: ${pdf.documentNo}`,
    `แนบไฟล์หลักฐาน: ${evidence.attachments.length} ไฟล์`,
    evidenceLinks.length ? "" : "",
    evidenceLinks.length ? "ลิงก์หลักฐานบน Google Drive:" : "",
    ...evidenceLinks,
    ...skippedLines,
  ].filter((line) => line !== "").join("\n");

  const emailResult = await sendGmailWithAttachments({
    to: recipients,
    subject: generatedEmail.subject,
    text: bodyText,
    attachments: [pdf.attachment, ...evidence.attachments],
  });

  const note = [
    String(body.note || "ส่งขอเบิกแล้ว"),
    `to: ${recipients.join(", ")}`,
    `gmail_message_id: ${emailResult.messageId || "-"}`,
    `pdf: ${pdf.documentNo}`,
    evidence.attachments.length ? `evidence_attachments: ${evidence.attachments.length}` : "",
  ].filter(Boolean).join(" | ");
  const patch: Record<string, string | number> = {
    status: "SUBMITTED_TO_ACCOUNTING",
    remarks: appendRemark(current.remarks, note),
    updated_by_name: actor.name,
    updated_by_email: actor.email,
  };

  await update("Payment_Claims", Number(current._rowIndex), patch, context.siteSheetId);
  await insertPaymentAudit(context, {
    claimId: claim.id,
    action: "submit_email",
    fromStatus: current.status,
    toStatus: "SUBMITTED_TO_ACCOUNTING",
    note,
  });
  await notifyPaymentWorkflow(context, {
    claimId: claim.id,
    docNo: claim.docNo,
    status: "SUBMITTED_TO_ACCOUNTING",
    action: "submit_email",
    note: "ส่งขอเบิกแล้ว",
  });
  await writeAuditLog({
    actor,
    projectId: context.project.project_id,
    module: "payment_claims",
    action: "submit_email",
    targetId: claim.id,
    summary: `ส่งอีเมลขอเบิก ${claim.docNo}`,
    before: current,
    after: { ...current, ...patch, recipients, messageId: emailResult.messageId, pdfUrl: pdf.pdfUrl },
  });

  return NextResponse.json({
    success: true,
    data: {
      claim_id: claim.id,
      status: "SUBMITTED_TO_ACCOUNTING",
      recipients,
      gmail_message_id: emailResult.messageId,
      gmail_thread_id: emailResult.threadId,
      pdf_url: pdf.pdfUrl,
      evidence_attached_count: evidence.attachments.length,
      evidence_skipped: evidence.skipped,
    },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const routeContext = context as RouteContext;
    const data = await getPaymentData(routeContext);
    return NextResponse.json({
      success: true,
      project: routeContext.project,
      data: data.claims,
      documents: data.documentRows.map((document) => {
        const copy = { ...document };
        delete copy.html_snapshot;
        return copy;
      }),
      audit_logs: data.auditRows
        .sort((a, b) => new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime())
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
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) return handleUploadAttachment(req, routeContext);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "");

    if (action === "create_claim") return handleCreateClaim(body, routeContext);
    if (action === "update_status") return handleUpdateStatus(body, routeContext);
    if (action === "generate_document") return handleGenerateDocument(body, routeContext);
    if (action === "submit_claim_email") return handleSubmitClaimEmail(body, routeContext);

    return NextResponse.json({ error: "ไม่รู้จัก action นี้" }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
