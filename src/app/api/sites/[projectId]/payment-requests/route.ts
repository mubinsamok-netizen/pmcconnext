import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { downloadFile, findOrCreateFolder, uploadFile } from "@/lib/drive";
import { renderHtmlToPdfBuffer } from "@/lib/pdfRenderer";
import { findAllMaster, insertMaster, updateMaster } from "@/lib/sheetsCrud";
import { ensureMasterSchema } from "@/lib/sheetsSetup";
import { getErrorMessage, getSiteApiContext, makeId } from "@/lib/siteApi";
import {
  buildPaymentEmail,
  buildPaymentPdfFileName,
  buildClassicPaymentRequestHtml,
  calculatePaymentTotals,
  parsePaymentAttachments,
  parsePaymentItems,
  safeFilePart,
  type PaymentAttachment,
  type PaymentRequestRecord,
  type PaymentRequestType,
} from "@/lib/paymentRequests";

type RouteContext = Awaited<ReturnType<typeof getSiteApiContext>> & {
  session: { user: { email?: string | null; name?: string | null } };
  project: Record<string, string | number | undefined> & { project_id: string; name?: string };
  siteSheetId: string;
};

const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024;
const PDF_IMAGE_MAX_WIDTH = 1800;
const PDF_IMAGE_MAX_HEIGHT = 2400;
const PDF_IMAGE_QUALITY = 80;
const PDF_EMBED_CONCURRENCY = 2;
const PDF_SMALL_IMAGE_BYTES = 350 * 1024;
const PDF_FALLBACK_IMAGE_BYTES = 1500 * 1024;

export const maxDuration = 300;

sharp.cache({ memory: 32, files: 0, items: 32 });
sharp.concurrency(1);

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeJson(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function documentPrefix(type: PaymentRequestType) {
  return type === "contractor_claim" ? "PC" : "PV";
}

function buildDocumentNo(type: PaymentRequestType, requestDate: string, existing: PaymentRequestRecord[]) {
  const date = new Date(`${requestDate || new Date().toISOString().slice(0, 10)}T12:00:00`);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const yy = String(safeDate.getFullYear() + 543).slice(-2);
  const mm = String(safeDate.getMonth() + 1).padStart(2, "0");
  const prefix = `${documentPrefix(type)}-${yy}${mm}-`;
  const running = existing.filter((row) => text(row.document_no).startsWith(prefix)).length + 1;
  return `${prefix}${String(running).padStart(3, "0")}`;
}

async function getAllRows() {
  const schema = await ensureMasterSchema();
  if (!schema.success) throw schema.error;
  return await findAllMaster("PaymentRequests") as unknown as PaymentRequestRecord[];
}

function projectRows(rows: PaymentRequestRecord[], context: RouteContext) {
  return rows
    .filter((row) => text(row.project_id) === context.project.project_id)
    .sort((a, b) => new Date(text(b.updated_at || b.created_at) || 0).getTime() - new Date(text(a.updated_at || a.created_at) || 0).getTime());
}

async function getRows(context: RouteContext) {
  return projectRows(await getAllRows(), context);
}

function buildPayeeSuggestions(rows: PaymentRequestRecord[]) {
  const suggestions = new Map<string, {
    key: string;
    name: string;
    tax_id: string;
    address: string;
    bank_name: string;
    bank_account_no: string;
    bank_account_name: string;
    contractor_id: string;
    attachments: PaymentAttachment[];
    usage_count: number;
    last_used_at: string;
  }>();
  const sorted = [...rows]
    .filter((row) => text(row.payee_name) && text(row.status) !== "cancelled")
    .sort((a, b) => new Date(text(b.updated_at || b.created_at || b.request_date) || 0).getTime() - new Date(text(a.updated_at || a.created_at || a.request_date) || 0).getTime());

  sorted.forEach((row) => {
    const taxId = text(row.payee_tax_id).replace(/\s+/g, "");
    const accountNo = text(row.bank_account_no).replace(/\D/g, "");
    const normalizedName = text(row.payee_name).toLocaleLowerCase("th-TH").replace(/\s+/g, " ");
    const identity = taxId && taxId !== "-" ? `tax:${taxId}` : accountNo ? `bank:${accountNo}` : `name:${normalizedName}`;
    const reusableAttachments = parsePaymentAttachments(row.attachments_json)
      .filter((attachment) => attachment.file_id && ["id_card", "bank_book"].includes(attachment.category));
    const current = suggestions.get(identity);
    if (current) {
      current.usage_count += 1;
      if (!current.tax_id) current.tax_id = text(row.payee_tax_id);
      if (!current.address) current.address = text(row.payee_address);
      if (!current.bank_name) current.bank_name = text(row.bank_name);
      if (!current.bank_account_no) current.bank_account_no = text(row.bank_account_no);
      if (!current.bank_account_name) current.bank_account_name = text(row.bank_account_name);
      if (!current.contractor_id) current.contractor_id = text(row.contractor_id);
      reusableAttachments.forEach((attachment) => {
        if (!current.attachments.some((item) => item.category === attachment.category)) {
          current.attachments.push(attachment);
        }
      });
      return;
    }
    suggestions.set(identity, {
      key: identity,
      name: text(row.payee_name),
      tax_id: text(row.payee_tax_id),
      address: text(row.payee_address),
      bank_name: text(row.bank_name),
      bank_account_no: text(row.bank_account_no),
      bank_account_name: text(row.bank_account_name),
      contractor_id: text(row.contractor_id),
      attachments: reusableAttachments.filter((attachment, index, source) => (
        source.findIndex((item) => item.category === attachment.category) === index
      )),
      usage_count: 1,
      last_used_at: text(row.request_date || row.updated_at || row.created_at),
    });
  });

  return Array.from(suggestions.values()).slice(0, 150);
}

async function requestFolder(context: RouteContext, requestId: string) {
  const rootId = text(context.project.drive_folder_id);
  if (!rootId) return null;
  const paymentRoot = await findOrCreateFolder("Payment Requests", rootId);
  return await findOrCreateFolder(safeFilePart(requestId), paymentRoot.id || rootId);
}

async function uploadAttachments(context: RouteContext, requestId: string, formData: FormData) {
  const files = formData.getAll("attachment_files").filter((item): item is File => item instanceof File && item.size > 0);
  if (!files.length) return [] as PaymentAttachment[];
  const categories = formData.getAll("attachment_categories").map(text);
  const captions = formData.getAll("attachment_captions").map(text);
  const folder = await requestFolder(context, requestId);
  if (!folder?.id) throw new Error("โครงการยังไม่ได้ตั้งค่า Google Drive folder สำหรับเก็บหลักฐาน");
  const attachmentFolder = await findOrCreateFolder("Attachments", folder.id);
  return await Promise.all(files.map(async (file, index) => {
    if (file.size > MAX_ATTACHMENT_SIZE) throw new Error(`ไฟล์ ${file.name} มีขนาดเกิน 8 MB`);
    const uploaded = await uploadFile(
      `${Date.now()}-${index + 1}-${safeFilePart(file.name, `attachment-${index + 1}`)}`,
      file.type || "application/octet-stream",
      Buffer.from(await file.arrayBuffer()),
      attachmentFolder.id || folder.id || "",
    );
    return {
      file_id: uploaded.id || "",
      file_name: file.name,
      file_url: uploaded.webViewLink || uploaded.webContentLink || "",
      mime_type: file.type || "application/octet-stream",
      category: (["id_card", "bank_book", "evidence", "receipt", "other"].includes(categories[index]) ? categories[index] : "evidence") as PaymentAttachment["category"],
      caption: captions[index] || file.name,
    };
  }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    const [allPaymentRows, contractors, laborRates] = await Promise.all([
      getAllRows(),
      findAllMaster("Contractors"),
      findAllMaster("LaborRates"),
    ]);
    const rows = projectRows(allPaymentRows, context as RouteContext);
    return NextResponse.json({
      success: true,
      project: context.project,
      data: rows,
      payees: buildPayeeSuggestions(allPaymentRows),
      contractors: contractors.filter((row) => text(row.active).toUpperCase() !== "FALSE"),
      labor_rates: laborRates.filter((row) => text(row.active).toUpperCase() !== "FALSE"),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

async function saveRequest(request: Request, context: RouteContext) {
  const formData = await request.formData();
  const body = safeJson(text(formData.get("payload")));
  const requestType: PaymentRequestType = text(body.request_type) === "contractor_claim" ? "contractor_claim" : "voucher";
  const title = text(body.title);
  const payeeName = text(body.payee_name);
  const requestDate = text(body.request_date) || new Date().toISOString().slice(0, 10);
  const items = parsePaymentItems(body.items);
  if (!title) return NextResponse.json({ error: "กรุณากรอกหัวข้อการเบิกเงิน" }, { status: 400 });
  if (!payeeName) return NextResponse.json({ error: "กรุณากรอกชื่อผู้รับเงินหรือผู้รับเหมา" }, { status: 400 });
  if (!items.some((item) => item.description && item.amount > 0)) {
    return NextResponse.json({ error: "กรุณากรอกรายการและจำนวนเงินอย่างน้อย 1 รายการ" }, { status: 400 });
  }

  const rows = await getRows(context);
  const requestId = text(body.request_id) || makeId(requestType === "contractor_claim" ? "PC" : "PV");
  const current = rows.find((row) => row.request_id === requestId);
  const existingAttachments = parsePaymentAttachments(body.attachments);
  const uploadedAttachments = await uploadAttachments(context, requestId, formData);
  const attachments = [...existingAttachments, ...uploadedAttachments];
  const totals = calculatePaymentTotals({
    items,
    vatRate: number(body.vat_rate),
    whtRate: number(body.wht_rate),
    retentionRate: number(body.retention_rate),
    advanceDeduction: number(body.advance_deduction),
    otherDeduction: number(body.other_deduction),
    deductionSequence: requestType === "contractor_claim" ? "retention_then_wht" : "standard",
  });
  const previousClaimAmount = requestType === "contractor_claim"
    ? rows.filter((row) => (
      row.request_id !== requestId &&
      row.request_type === "contractor_claim" &&
      text(row.status) !== "cancelled" &&
      text(row.contractor_id || row.payee_name) === text(body.contractor_id || payeeName) &&
      text(row.work_package) === text(body.work_package)
    )).reduce((sum, row) => sum + number(row.subtotal), 0)
    : 0;
  const preparedBy = context.session.user.name || context.session.user.email || "";
  const email = buildPaymentEmail({
    projectName: text(context.project.name) || context.project.project_id,
    title,
    items,
    totals,
    vatRate: number(body.vat_rate),
    whtRate: number(body.wht_rate),
    retentionRate: number(body.retention_rate),
    bankName: text(body.bank_name),
    bankAccountNo: text(body.bank_account_no),
    bankAccountName: text(body.bank_account_name),
    preparedBy,
    preparedByPhone: text(body.prepared_by_phone),
  });
  const documentNo = current?.document_no || buildDocumentNo(requestType, requestDate, rows);
  const pdfFileName = buildPaymentPdfFileName({
    projectName: text(context.project.name) || context.project.project_id,
    requestType,
    title,
    payeeName,
    requestDate,
  });
  const payload = {
    request_id: requestId,
    project_id: context.project.project_id,
    request_type: requestType,
    document_no: documentNo,
    title,
    request_date: requestDate,
    status: text(body.status) || current?.status || "draft",
    payee_name: payeeName,
    payee_tax_id: text(body.payee_tax_id),
    payee_address: text(body.payee_address),
    bank_name: text(body.bank_name),
    bank_account_no: text(body.bank_account_no),
    bank_account_name: text(body.bank_account_name),
    contractor_id: text(body.contractor_id),
    work_package: text(body.work_package),
    claim_period: text(body.claim_period),
    contract_amount: number(body.contract_amount),
    previous_claim_amount: previousClaimAmount,
    subtotal: totals.subtotal,
    vat_rate: number(body.vat_rate),
    vat_amount: totals.vatAmount,
    wht_rate: number(body.wht_rate),
    wht_amount: totals.whtAmount,
    retention_rate: number(body.retention_rate),
    retention_amount: totals.retentionAmount,
    advance_deduction: totals.advanceDeduction,
    other_deduction: totals.otherDeduction,
    net_amount: totals.netAmount,
    paid_amount: current?.paid_amount || 0,
    items_json: JSON.stringify(items),
    attachments_json: JSON.stringify(attachments),
    notes: text(body.notes),
    email_subject: email.subject,
    email_body: email.body,
    pdf_file_id: current?.pdf_file_id || "",
    pdf_url: current?.pdf_url || "",
    pdf_file_name: pdfFileName,
    created_by_name: current?.created_by_name || preparedBy,
    created_by_email: current?.created_by_email || context.session.user.email || "",
  };
  if (current?._rowIndex) {
    await updateMaster("PaymentRequests", current._rowIndex, payload);
  } else {
    await insertMaster("PaymentRequests", payload);
  }
  return NextResponse.json({ success: true, data: { ...current, ...payload, attachments, items } });
}

async function logoDataUrl() {
  try {
    const buffer = await fs.readFile(path.join(process.cwd(), "public", "logo.png"));
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

async function optimizeImageForPdf(buffer: Buffer, mimeType: string) {
  if (buffer.length <= PDF_SMALL_IMAGE_BYTES && ["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    return { buffer, mimeType };
  }
  const optimized = await sharp(buffer, { failOn: "none", limitInputPixels: 120_000_000 })
    .rotate()
    .resize({
      width: PDF_IMAGE_MAX_WIDTH,
      height: PDF_IMAGE_MAX_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: PDF_IMAGE_QUALITY, progressive: true })
    .toBuffer();
  return { buffer: optimized, mimeType: "image/jpeg" };
}

async function generatePdf(body: Record<string, unknown>, context: RouteContext) {
  const rows = await getRows(context);
  const current = rows.find((row) => row.request_id === text(body.request_id));
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบรายการเบิกเงิน" }, { status: 404 });
  const attachments = parsePaymentAttachments(current.attachments_json);
  let originalImageBytes = 0;
  let embeddedImageBytes = 0;
  const embeddedAttachments = await mapWithConcurrency(attachments, PDF_EMBED_CONCURRENCY, async (attachment) => {
    if (!attachment.file_id || !attachment.mime_type.startsWith("image/")) return attachment;
    try {
      const downloaded = await downloadFile(attachment.file_id);
      originalImageBytes += downloaded.buffer.length;
      const image = await optimizeImageForPdf(downloaded.buffer, downloaded.mimeType || attachment.mime_type);
      embeddedImageBytes += image.buffer.length;
      return { ...attachment, data_url: `data:${image.mimeType};base64,${image.buffer.toString("base64")}` };
    } catch (error) {
      console.warn("Skipping an attachment preview while generating payment PDF", {
        fileId: attachment.file_id,
        fileName: attachment.file_name,
        error: getErrorMessage(error),
      });
      try {
        const downloaded = await downloadFile(attachment.file_id);
        if (downloaded.buffer.length <= PDF_FALLBACK_IMAGE_BYTES) {
          originalImageBytes += downloaded.buffer.length;
          embeddedImageBytes += downloaded.buffer.length;
          return { ...attachment, data_url: `data:${downloaded.mimeType};base64,${downloaded.buffer.toString("base64")}` };
        }
      } catch {
        // The PDF will retain a placeholder page for an attachment that cannot be downloaded.
      }
      return attachment;
    }
  });
  console.info("Prepared payment PDF attachments", {
    requestId: current.request_id,
    attachmentCount: attachments.length,
    originalImageBytes,
    embeddedImageBytes,
  });
  const html = buildClassicPaymentRequestHtml({
    request: current,
    project: context.project,
    items: parsePaymentItems(current.items_json),
    attachments: embeddedAttachments,
    logoDataUrl: await logoDataUrl(),
    priorClaims: current.request_type === "contractor_claim" ? rows.filter((row) => (
      row.request_id !== current.request_id &&
      row.request_type === "contractor_claim" &&
      text(row.status) !== "cancelled" &&
      text(row.contractor_id || row.payee_name) === text(current.contractor_id || current.payee_name) &&
      text(row.work_package) === text(current.work_package)
    )) : [],
  });
  const pdfBuffer = await renderHtmlToPdfBuffer(html, current.document_no);
  const fileName = buildPaymentPdfFileName({
    projectName: text(context.project.name) || context.project.project_id,
    requestType: current.request_type,
    title: current.title,
    payeeName: current.payee_name,
    requestDate: current.request_date,
  });
  const folder = await requestFolder(context, current.request_id);
  let pdfFileId = "";
  let pdfUrl = "";
  if (folder?.id) {
    const pdfFolder = await findOrCreateFolder("PDF", folder.id);
    const uploaded = await uploadFile(fileName, "application/pdf", pdfBuffer, pdfFolder.id || folder.id);
    pdfFileId = uploaded.id || "";
    pdfUrl = uploaded.webViewLink || uploaded.webContentLink || "";
  }
  await updateMaster("PaymentRequests", current._rowIndex, {
    status: "pdf_created",
    pdf_file_id: pdfFileId,
    pdf_url: pdfUrl,
    pdf_file_name: fileName,
  });
  return new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="payment-request.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Length": String(pdfBuffer.length),
      "X-PDF-URL": pdfUrl,
    },
  });
}

async function updateStatus(body: Record<string, unknown>, context: RouteContext) {
  const rows = await getRows(context);
  const current = rows.find((row) => row.request_id === text(body.request_id));
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบรายการเบิกเงิน" }, { status: 404 });
  const status = ["draft", "pdf_created", "emailed", "paid", "closed", "cancelled"].includes(text(body.status)) ? text(body.status) : current.status;
  const paidAmount = body.paid_amount === undefined ? number(current.paid_amount) : Math.max(0, number(body.paid_amount));
  await updateMaster("PaymentRequests", current._rowIndex, { status, paid_amount: paidAmount });
  return NextResponse.json({ success: true, data: { ...current, status, paid_amount: paidAmount } });
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    const routeContext = context as RouteContext;
    if ((request.headers.get("content-type") || "").includes("multipart/form-data")) return saveRequest(request, routeContext);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (text(body.action) === "generate_pdf") return generatePdf(body, routeContext);
    if (text(body.action) === "update_status") return updateStatus(body, routeContext);
    return NextResponse.json({ error: "ไม่รู้จัก action นี้" }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "ดำเนินการระบบเบิกเงินไม่สำเร็จ") }, { status: 500 });
  }
}
