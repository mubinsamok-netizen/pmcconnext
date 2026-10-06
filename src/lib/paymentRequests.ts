export type PaymentRequestType = "voucher" | "contractor_claim";

export type PaymentItem = {
  id: string;
  boq_key?: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
  material_unit_price?: number;
  material_amount?: number;
  labor_unit_price?: number;
  labor_amount?: number;
  contract_total?: number;
  claim_percent?: number;
};

export type PaymentAttachment = {
  file_id: string;
  file_name: string;
  file_url: string;
  mime_type: string;
  category: "id_card" | "bank_book" | "evidence" | "receipt" | "other";
  caption: string;
};

export type PaymentRequestRecord = {
  _rowIndex?: string | number;
  request_id: string;
  project_id: string;
  request_type: PaymentRequestType;
  document_no: string;
  title: string;
  request_date: string;
  status: string;
  payee_name: string;
  payee_tax_id: string;
  payee_address: string;
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
  contractor_id: string;
  work_package: string;
  claim_period: string;
  contract_amount: number | string;
  previous_claim_amount: number | string;
  subtotal: number | string;
  vat_rate: number | string;
  vat_amount: number | string;
  wht_rate: number | string;
  wht_amount: number | string;
  retention_rate: number | string;
  retention_amount: number | string;
  advance_deduction: number | string;
  other_deduction: number | string;
  net_amount: number | string;
  paid_amount: number | string;
  items_json: string;
  attachments_json: string;
  notes: string;
  email_subject: string;
  email_body: string;
  pdf_file_id: string;
  pdf_url: string;
  pdf_file_name: string;
  created_by_name: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
};

export type PaymentTotalsInput = {
  items: PaymentItem[];
  vatRate: number;
  whtRate: number;
  retentionRate: number;
  advanceDeduction: number;
  otherDeduction: number;
  deductionSequence?: "standard" | "retention_then_wht";
};

export function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calculatePaymentTotals(input: PaymentTotalsInput) {
  const subtotal = roundMoney(input.items.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const vatAmount = roundMoney(subtotal * Math.max(0, Number(input.vatRate || 0)) / 100);
  const retentionAmount = roundMoney(subtotal * Math.max(0, Number(input.retentionRate || 0)) / 100);
  const whtBase = input.deductionSequence === "retention_then_wht"
    ? Math.max(0, subtotal - retentionAmount)
    : subtotal;
  const whtAmount = roundMoney(whtBase * Math.max(0, Number(input.whtRate || 0)) / 100);
  const advanceDeduction = roundMoney(Math.max(0, Number(input.advanceDeduction || 0)));
  const otherDeduction = roundMoney(Math.max(0, Number(input.otherDeduction || 0)));
  const netAmount = roundMoney(subtotal + vatAmount - whtAmount - retentionAmount - advanceDeduction - otherDeduction);
  return { subtotal, vatAmount, whtAmount, retentionAmount, advanceDeduction, otherDeduction, netAmount };
}

export function parsePaymentItems(value: unknown): PaymentItem[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item, index) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const quantity = Number(row.quantity || 0);
      const unitPrice = Number(row.unit_price || 0);
      return {
        id: String(row.id || `item-${index + 1}`),
        boq_key: String(row.boq_key || row.id || `boq-${index + 1}`),
        description: String(row.description || ""),
        quantity,
        unit: String(row.unit || ""),
        unit_price: unitPrice,
        amount: Number(row.amount ?? quantity * unitPrice),
        material_unit_price: Number(row.material_unit_price || 0),
        material_amount: Number(row.material_amount || 0),
        labor_unit_price: Number(row.labor_unit_price ?? unitPrice),
        labor_amount: Number(row.labor_amount || 0),
        contract_total: Number(row.contract_total || 0),
        claim_percent: Number(row.claim_percent || 0),
      };
    });
  } catch {
    return [];
  }
}

export function parsePaymentAttachments(value: unknown): PaymentAttachment[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed as PaymentAttachment[] : [];
  } catch {
    return [];
  }
}

export function formatPaymentMoney(value: number | string) {
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

export function safeFilePart(value: string, fallback = "document") {
  return value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || fallback;
}

export function buildPaymentPdfFileName(input: {
  projectName: string;
  requestType: PaymentRequestType;
  title: string;
  payeeName?: string;
  requestDate: string;
}) {
  const title = safeFilePart(input.title, "รายการเบิก");
  const projectName = safeFilePart(input.projectName, "โครงการ");
  return `${title} หน่วยงาน${projectName}.pdf`;
}

export function buildPaymentEmail(input: {
  projectName: string;
  title: string;
  items: PaymentItem[];
  totals: ReturnType<typeof calculatePaymentTotals>;
  vatRate: number;
  whtRate: number;
  retentionRate: number;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  preparedBy: string;
  preparedByPhone?: string;
}) {
  const itemLines = input.items
    .filter((item) => item.description)
    .map((item) => {
      const quantity = item.quantity ? `${formatPaymentMoney(item.quantity).replace(/\.00$/, "")} ${item.unit}`.trim() : "";
      return `${item.description}${quantity ? ` ${quantity}` : ""} ยอด ${formatPaymentMoney(item.amount)} บาท`;
    })
    .join("\n");
  const deductions = [
    input.vatRate > 0 ? `ภาษีมูลค่าเพิ่ม ${input.vatRate}% จำนวน ${formatPaymentMoney(input.totals.vatAmount)} บาท` : "",
    input.retentionRate > 0 ? `หักประกันผลงาน ${input.retentionRate}% จำนวน ${formatPaymentMoney(input.totals.retentionAmount)} บาท` : "",
    input.whtRate > 0 ? `หักภาษี ณ ที่จ่าย ${input.whtRate}% จำนวน ${formatPaymentMoney(input.totals.whtAmount)} บาท` : "",
    input.totals.advanceDeduction > 0 ? `หักคืนเงินล่วงหน้า ${formatPaymentMoney(input.totals.advanceDeduction)} บาท` : "",
    input.totals.otherDeduction > 0 ? `หักอื่น ๆ ${formatPaymentMoney(input.totals.otherDeduction)} บาท` : "",
  ].filter(Boolean).join("\n");
  const subject = `ขอเบิกเงิน${input.title} - โครงการ ${input.projectName}`;
  const certificateLine = input.whtRate > 0
    ? ` และขอให้ออกหนังสือรับรองหัก ณ ที่จ่าย จำนวน ${formatPaymentMoney(input.totals.whtAmount)} บาท`
    : "";
  const body = `เรียน ฝ่ายบัญชี

ขอเบิกเงิน${input.title} สำหรับไซต์งาน ${input.projectName}

รายละเอียดการเบิกเงินมีดังนี้

${itemLines || input.title}
${deductions ? `\n${deductions}\n` : ""}
รวมยอดโอนสุทธิ ${formatPaymentMoney(input.totals.netAmount)} บาท${certificateLine}

ข้อมูลสำหรับการโอนเงิน

ธนาคาร: ${input.bankName || "-"}
เลขที่บัญชี: ${input.bankAccountNo || "-"}
ชื่อบัญชี: ${input.bankAccountName || "-"}
ยอดโอน: ${formatPaymentMoney(input.totals.netAmount)} บาท

เอกสารใบสำคัญจ่าย เอกสารผู้รับเงิน และรูปภาพประกอบการทำงาน ได้แนบมาพร้อมอีเมลนี้เรียบร้อยแล้ว

รบกวนพิจารณาดำเนินการต่อไปครับ

ด้วยความเคารพ
${input.preparedBy || "-"}${input.preparedByPhone ? ` โทร ${input.preparedByPhone}` : ""}`;
  return { subject, body };
}

const THAI_DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const THAI_POSITIONS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function readThaiNumber(value: number): string {
  if (value === 0) return "ศูนย์";
  if (value >= 1_000_000) {
    const millions = Math.floor(value / 1_000_000);
    const remainder = value % 1_000_000;
    return `${readThaiNumber(millions)}ล้าน${remainder ? readThaiNumber(remainder) : ""}`;
  }
  const digits = String(Math.floor(value)).padStart(6, "0");
  let result = "";
  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits[index]);
    if (!digit) continue;
    const position = digits.length - index - 1;
    if (position === 1 && digit === 1) result += "สิบ";
    else if (position === 1 && digit === 2) result += "ยี่สิบ";
    else if (position === 0 && digit === 1 && result) result += "เอ็ด";
    else result += `${THAI_DIGITS[digit]}${THAI_POSITIONS[position]}`;
  }
  return result;
}

export function thaiBahtText(value: number | string) {
  const amount = roundMoney(Number(value || 0));
  const baht = Math.floor(amount);
  const satang = Math.round((amount - baht) * 100);
  return `${readThaiNumber(baht)}บาท${satang ? `${readThaiNumber(satang)}สตางค์` : "ถ้วน"}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildPaymentRequestHtml(input: {
  request: PaymentRequestRecord;
  project: Record<string, string | number | undefined>;
  items: PaymentItem[];
  attachments: Array<PaymentAttachment & { data_url?: string }>;
  logoDataUrl?: string;
}) {
  const { request, project, items, attachments } = input;
  const contractorClaim = request.request_type === "contractor_claim";
  const label = contractorClaim ? "ใบเบิกงวดงานผู้รับเหมา" : "ใบสำคัญจ่าย";
  const rows = items.map((item, index) => `<tr><td class="center">${index + 1}</td><td>${escapeHtml(item.description)}</td><td class="center">${escapeHtml(item.quantity || "")}</td><td class="center">${escapeHtml(item.unit)}</td><td class="num">${formatPaymentMoney(item.unit_price)}</td><td class="num">${formatPaymentMoney(item.amount)}</td></tr>`).join("");
  const deductionRows = [
    Number(request.vat_amount) ? `<tr><th colspan="5">ภาษีมูลค่าเพิ่ม ${escapeHtml(request.vat_rate)}%</th><td class="num">${formatPaymentMoney(request.vat_amount)}</td></tr>` : "",
    Number(request.retention_amount) ? `<tr><th colspan="5">หักประกันผลงาน ${escapeHtml(request.retention_rate)}%</th><td class="num">-${formatPaymentMoney(request.retention_amount)}</td></tr>` : "",
    Number(request.wht_amount) ? `<tr><th colspan="5">หักภาษี ณ ที่จ่าย ${escapeHtml(request.wht_rate)}%</th><td class="num">-${formatPaymentMoney(request.wht_amount)}</td></tr>` : "",
    Number(request.advance_deduction) ? `<tr><th colspan="5">หักคืนเงินล่วงหน้า</th><td class="num">-${formatPaymentMoney(request.advance_deduction)}</td></tr>` : "",
    Number(request.other_deduction) ? `<tr><th colspan="5">รายการหักอื่น</th><td class="num">-${formatPaymentMoney(request.other_deduction)}</td></tr>` : "",
  ].filter(Boolean).join("");
  const evidencePages = attachments.map((attachment, index) => `<section class="page evidence"><div class="evidence-head"><span>${escapeHtml(label)} · ${escapeHtml(request.document_no)}</span><strong>เอกสารแนบ ${index + 1}/${attachments.length}</strong></div><h2>${escapeHtml(attachment.caption || attachment.file_name)}</h2>${attachment.data_url ? `<img src="${attachment.data_url}" alt="${escapeHtml(attachment.caption || attachment.file_name)}">` : `<div class="missing">ไม่สามารถแสดงตัวอย่างไฟล์นี้ใน PDF ได้<br>${escapeHtml(attachment.file_name)}</div>`}</section>`).join("");
  const claimBlock = contractorClaim ? `<div class="claim-grid"><div><small>แพ็กเกจงาน</small><strong>${escapeHtml(request.work_package || "-")}</strong></div><div><small>งวดที่</small><strong>${escapeHtml(request.claim_period || "-")}</strong></div><div><small>มูลค่าสัญญา</small><strong>${formatPaymentMoney(request.contract_amount)}</strong></div><div><small>เบิกก่อนหน้า</small><strong>${formatPaymentMoney(request.previous_claim_amount)}</strong></div><div><small>เบิกสะสม</small><strong>${formatPaymentMoney(Number(request.previous_claim_amount) + Number(request.subtotal))}</strong></div><div><small>คงเหลือ</small><strong>${formatPaymentMoney(Math.max(0, Number(request.contract_amount) - Number(request.previous_claim_amount) - Number(request.subtotal)))}</strong></div></div>` : "";
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#1f2937;font-size:11px;line-height:1.45}.page{min-height:270mm;page-break-after:always}.page:last-child{page-break-after:auto}.head{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:4px solid #7c3aed;padding-bottom:12px}.brand{display:flex;gap:14px;align-items:center}.brand img{width:78px;height:60px;object-fit:contain}.brand h1{font-size:17px;margin:0;color:#111827}.brand p{margin:2px 0;color:#6b7280}.doc{text-align:right}.doc h2{font-size:24px;margin:0;color:#6d28d9}.doc p{margin:3px 0}.title{padding:14px 0 8px;font-size:17px;font-weight:800}.info{width:100%;border-collapse:collapse;margin:4px 0 12px}.info th{width:16%;text-align:left;color:#6b7280;font-weight:600;padding:4px}.info td{width:34%;padding:4px;border-bottom:1px dotted #9ca3af}.items{width:100%;border-collapse:collapse;margin-top:10px}.items th{background:#6d28d9;color:white;padding:7px;border:1px solid #4c1d95}.items td{padding:7px;border:1px solid #9ca3af;height:28px}.items tr.total th{background:#f3f4f6;color:#111827;text-align:right}.items tr.net th,.items tr.net td{background:#ede9fe;color:#4c1d95;font-size:13px;font-weight:800}.center{text-align:center}.num{text-align:right;white-space:nowrap}.amount-text{text-align:center;padding:8px;background:#f9fafb;border:1px solid #d1d5db;border-top:0}.claim-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:8px 0 12px}.claim-grid div{border:1px solid #ddd6fe;background:#faf5ff;border-radius:7px;padding:8px}.claim-grid small{display:block;color:#6b7280}.claim-grid strong{display:block;margin-top:3px;color:#5b21b6}.transfer{margin-top:12px;border:1px solid #fed7aa;background:#fff7ed;border-radius:8px;padding:10px}.transfer h3{margin:0 0 6px;color:#c2410c}.transfer-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}.notes{margin-top:10px;padding:8px;border-left:4px solid #f97316;background:#fff7ed}.signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-top:35px;text-align:center}.signatures div{border-top:1px dotted #4b5563;padding-top:5px}.footer{margin-top:24px;text-align:right;color:#9ca3af;font-size:9px}.evidence{display:flex;flex-direction:column}.evidence-head{display:flex;justify-content:space-between;border-bottom:3px solid #7c3aed;padding-bottom:8px;color:#6b7280}.evidence h2{text-align:center;margin:16px 0 10px;color:#4c1d95}.evidence img{display:block;max-width:100%;max-height:230mm;margin:auto;object-fit:contain}.missing{margin:auto;width:100%;padding:80px 20px;text-align:center;border:2px dashed #d1d5db;color:#9ca3af}
  </style></head><body><section class="page"><div class="head"><div class="brand">${input.logoDataUrl ? `<img src="${input.logoDataUrl}" alt="logo">` : ""}<div><h1>บริษัท พิชยมงคล คอนสตรัคชั่น จำกัด</h1><p>PICHAYAMONGKOL CONSTRUCTION CO., LTD.</p><p>โครงการ ${escapeHtml(project.name || request.project_id)}</p></div></div><div class="doc"><h2>${label}</h2><p>เลขที่ ${escapeHtml(request.document_no)}</p><p>วันที่ ${escapeHtml(request.request_date)}</p></div></div><div class="title">${escapeHtml(request.title)}</div><table class="info"><tr><th>ผู้รับเงิน</th><td>${escapeHtml(request.payee_name || "-")}</td><th>เลขประจำตัวผู้เสียภาษี</th><td>${escapeHtml(request.payee_tax_id || "-")}</td></tr><tr><th>ที่อยู่</th><td colspan="3">${escapeHtml(request.payee_address || "-")}</td></tr></table>${claimBlock}<table class="items"><thead><tr><th style="width:7%">ลำดับ</th><th>รายการ</th><th style="width:9%">จำนวน</th><th style="width:9%">หน่วย</th><th style="width:16%">ราคา/หน่วย</th><th style="width:17%">จำนวนเงิน</th></tr></thead><tbody>${rows}<tr class="total"><th colspan="5">รวมมูลค่างาน</th><td class="num">${formatPaymentMoney(request.subtotal)}</td></tr>${deductionRows}<tr class="net"><th colspan="5">ยอดโอนสุทธิ</th><td class="num">${formatPaymentMoney(request.net_amount)}</td></tr></tbody></table><div class="amount-text">(${thaiBahtText(request.net_amount)})</div><div class="transfer"><h3>ข้อมูลสำหรับการโอนเงิน</h3><div class="transfer-grid"><div><strong>ธนาคาร:</strong> ${escapeHtml(request.bank_name || "-")}</div><div><strong>เลขที่บัญชี:</strong> ${escapeHtml(request.bank_account_no || "-")}</div><div><strong>ชื่อบัญชี:</strong> ${escapeHtml(request.bank_account_name || "-")}</div><div><strong>ยอดโอน:</strong> ${formatPaymentMoney(request.net_amount)} บาท</div></div></div>${request.notes ? `<div class="notes"><strong>หมายเหตุ:</strong> ${escapeHtml(request.notes)}</div>` : ""}<div class="signatures"><div>ผู้รับเงิน</div><div>ผู้จัดทำ</div><div>ผู้ตรวจสอบ</div><div>ผู้อนุมัติ</div></div><div class="footer">สร้างจาก PMC CONNEXT · ${escapeHtml(request.created_by_name)}</div></section>${evidencePages}</body></html>`;
}

function formatVoucherDate(value: string) {
  const date = new Date(`${value || new Date().toISOString().slice(0, 10)}T12:00:00`);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const buddhistYear = String(safeDate.getFullYear() + 543).slice(-2);
  return `${String(safeDate.getDate()).padStart(2, "0")}-${String(safeDate.getMonth() + 1).padStart(2, "0")}-${buddhistYear}`;
}

function formatTaxId(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 13) return value || "-";
  return `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5, 10)} ${digits.slice(10, 12)} ${digits.slice(12)}`;
}

function parseThaiVoucherAddress(value: string) {
  const original = value.trim();
  const normalized = original.replace(/^อยู่ที่\s*/, "").trim();
  const read = (pattern: RegExp) => normalized.match(pattern)?.[1]?.trim() || "";
  const houseNo = read(/(?:บ้านเลขที่\s*)?([0-9]+(?:\/[0-9]+)?)(?=\s|$)/);
  const villageNo = read(/หมู่(?:ที่)?\s*([0-9]+(?:\/[0-9]+)?)/);
  const road = read(/(?:ถนน|ถ\.)\s*([^\s]+)/);
  let subdistrict = read(/(?:แขวง|ตำบล|ต\.)\s*([^\s]+)/);
  let district = read(/(?:เขต|อำเภอ|อ\.)\s*([^\s]+)/);
  let province = read(/(?:จังหวัด|จ\.)\s*([^\s]+)/);
  const remainder = normalized
    .replace(/(?:บ้านเลขที่\s*)?[0-9]+(?:\/[0-9]+)?/, " ")
    .replace(/หมู่(?:ที่)?\s*[0-9]+(?:\/[0-9]+)?/, " ")
    .replace(/(?:ถนน|ถ\.)\s*[^\s]+/, " ")
    .replace(/(?:แขวง|ตำบล|ต\.)\s*[^\s]+/, " ")
    .replace(/(?:เขต|อำเภอ|อ\.)\s*[^\s]+/, " ")
    .replace(/(?:จังหวัด|จ\.)\s*[^\s]+/, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!province && remainder.length >= 1) province = remainder.at(-1) || "";
  if (!district && remainder.length >= 2) district = remainder.at(-2) || "";
  if (!subdistrict && remainder.length >= 3) subdistrict = remainder.at(-3) || "";
  return { houseNo: houseNo || "-", villageNo: villageNo || "-", road: road || "-", subdistrict: subdistrict || "-", district: district || "-", province: province || "-" };
}

type PaymentRequestPdfInput = {
  request: PaymentRequestRecord;
  project: Record<string, string | number | undefined>;
  items: PaymentItem[];
  attachments: Array<PaymentAttachment & { data_url?: string }>;
  logoDataUrl?: string;
  priorClaims?: PaymentRequestRecord[];
};

function buildContractorClaimPaymentHtml(input: PaymentRequestPdfInput) {
  const { request, project, items, attachments, priorClaims = [] } = input;
  const projectName = String(project.name || request.project_id || "-");
  const previousByItem = new Map<string, number>();
  priorClaims.forEach((claim) => {
    parsePaymentItems(claim.items_json).forEach((item) => {
      const key = item.boq_key || item.description.trim().toLowerCase();
      if (key) previousByItem.set(key, (previousByItem.get(key) || 0) + Number(item.amount || 0));
    });
  });
  const itemRows = items.map((item, index) => {
    const materialAmount = Number(item.material_amount || 0) || Number(item.quantity || 0) * Number(item.material_unit_price || 0);
    const laborAmount = Number(item.labor_amount || 0) || Number(item.quantity || 0) * Number(item.labor_unit_price || 0);
    const contractTotal = Number(item.contract_total || 0) || materialAmount + laborAmount || Number(item.quantity || 0) * Number(item.unit_price || 0);
    const key = item.boq_key || item.description.trim().toLowerCase();
    const previousAmount = previousByItem.get(key) || 0;
    const currentAmount = Number(item.amount || 0);
    const claimPercent = Number(item.claim_percent || 0) || (contractTotal > 0 ? currentAmount / contractTotal * 100 : 0);
    const remaining = contractTotal - previousAmount - currentAmount;
    return `<tr><td class="center muted">${index + 1}</td><td class="item-name">${escapeHtml(item.description)}</td><td class="num">${formatPaymentMoney(item.quantity).replace(/\.00$/, "")}</td><td class="center">${escapeHtml(item.unit)}</td><td class="num">${formatPaymentMoney(item.material_unit_price || 0)}</td><td class="num computed">${formatPaymentMoney(materialAmount)}</td><td class="num">${formatPaymentMoney(item.labor_unit_price || 0)}</td><td class="num computed">${formatPaymentMoney(laborAmount)}</td><td class="num strong">${formatPaymentMoney(contractTotal)}</td><td class="num previous">${formatPaymentMoney(previousAmount)}</td><td class="num current">${formatPaymentMoney(claimPercent)}%</td><td class="num current strong">${formatPaymentMoney(currentAmount)}</td><td class="num ${remaining < -0.009 ? "negative" : "remaining"}">${formatPaymentMoney(remaining)}</td></tr>`;
  });
  const minimumRows = 2;
  const blankRows = Array.from({ length: Math.max(0, minimumRows - itemRows.length) }, (_unused, index) => `<tr class="blank"><td class="center muted">${itemRows.length + index + 1}</td>${Array.from({ length: 12 }, () => "<td></td>").join("")}</tr>`).join("");
  const previousClaim = Number(request.previous_claim_amount || 0);
  const contractAmount = Number(request.contract_amount || 0);
  const currentClaim = Number(request.subtotal || 0);
  const cumulativeClaim = previousClaim + currentClaim;
  const contractRemaining = Math.max(0, contractAmount - cumulativeClaim);
  const afterRetention = Math.max(0, currentClaim - Number(request.retention_amount || 0));
  const paymentDeductions = Number(request.wht_amount || 0) + Number(request.retention_amount || 0) + Number(request.advance_deduction || 0) + Number(request.other_deduction || 0);
  const notes = request.notes || "แนบบัตรประจำตัวประชาชนผู้รับเงินและเอกสารประกอบการเบิกงวดงาน";
  const evidencePages = attachments.map((attachment, index) => `
    <section class="page evidence-page">
      <header class="evidence-header">${input.logoDataUrl ? `<img src="${input.logoDataUrl}" alt="Pichayamongkol">` : ""}<div><h2>เอกสารแนบใบเบิกงวดงานผู้รับเหมา</h2><p>${escapeHtml(request.title)} · หน่วยงาน ${escapeHtml(projectName)}</p></div><strong>${index + 1}/${attachments.length}</strong></header>
      <h3>${escapeHtml(attachment.caption || attachment.file_name)}</h3>
      ${attachment.data_url ? `<img class="evidence-image" src="${attachment.data_url}" alt="${escapeHtml(attachment.caption || attachment.file_name)}">` : `<div class="missing-file">ไม่สามารถแสดงตัวอย่างไฟล์นี้ใน PDF ได้<br>${escapeHtml(attachment.file_name)}</div>`}
    </section>`).join("");

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
    @page{size:A4 landscape;margin:7mm}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#0f172a;font-family:"TH Sarabun New",sans-serif;font-size:12px;line-height:1.04}.page{min-height:193mm;page-break-after:always;position:relative}.page:last-child{page-break-after:auto}.claim-page{display:flex;flex-direction:column}.claim-head{display:grid;grid-template-columns:1fr 94mm;gap:8mm;align-items:start;border-bottom:3px solid #991b1b;padding:0 1mm 3mm}.brand-logo{width:62mm;height:18mm;object-fit:contain;object-position:left center}.brand-caption{margin:.5mm 0 0;color:#8391ab;font-size:7px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase}.document-title{text-align:right}.document-title h1{margin:0;color:#0f172a;font-size:25px;font-weight:700;line-height:1}.document-title .english{margin-top:.7mm;color:#b91c1c;font-size:7px;font-weight:700;letter-spacing:2px}.document-meta{display:grid;grid-template-columns:17mm 28mm 16mm 28mm;margin:2mm 0 0 auto;overflow:hidden;border:1px solid #fecaca;border-radius:5px;text-align:left}.meta-label{background:#fff7f7;padding:1.3mm 2mm;color:#991b1b;font-weight:700}.meta-value{padding:1.3mm 2mm;color:#075db3;font-weight:700}.contract-info{margin-top:2.5mm;overflow:hidden;border:1px solid #cbd5e1;border-radius:6px}.info-title{display:flex;justify-content:space-between;background:#0f172a;padding:1.5mm 3mm;color:#fff;font-size:10px;font-weight:700;letter-spacing:.7px}.info-grid{display:grid;grid-template-columns:1.1fr .9fr 2fr 1fr 1fr}.info-field{min-height:9mm;border-right:1px solid #e2e8f0;padding:1.3mm 2.5mm}.info-field:last-child{border-right:0}.info-field.address{grid-column:3/6}.info-label{display:block;color:#94a3b8;font-size:8px;font-weight:700}.info-value{display:block;margin-top:.5mm;overflow:hidden;color:#075db3;font-size:11px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.claim-metrics{display:grid;grid-template-columns:1.5fr .7fr 1fr 1fr 1fr 1fr;margin-top:2mm;overflow:hidden;border:1px solid #fecaca;border-radius:6px}.metric{min-height:10mm;border-right:1px solid #fee2e2;background:#fffafa;padding:1.2mm 2.5mm}.metric:last-child{border-right:0}.metric span{display:block;color:#991b1b;font-size:8px;font-weight:700}.metric strong{display:block;margin-top:.5mm;color:#075db3;font-size:12px}.metric.remaining-metric{background:#f0fdf4}.metric.remaining-metric span,.metric.remaining-metric strong{color:#166534}.claim-table{width:100%;margin-top:2.5mm;border-collapse:collapse;table-layout:fixed;font-size:9px}.claim-table col:nth-child(1){width:4%}.claim-table col:nth-child(2){width:18%}.claim-table col:nth-child(3){width:5%}.claim-table col:nth-child(4){width:5%}.claim-table col:nth-child(5),.claim-table col:nth-child(6),.claim-table col:nth-child(7),.claim-table col:nth-child(8){width:7%}.claim-table col:nth-child(9),.claim-table col:nth-child(10){width:8%}.claim-table col:nth-child(11){width:5%}.claim-table col:nth-child(12){width:9%}.claim-table col:nth-child(13){width:10%}.claim-table th{border-right:1px solid #475569;border-bottom:1px solid #475569;background:#0f172a;padding:1mm;color:#fff;font-weight:700;text-align:center}.claim-table thead tr:nth-child(2) th{background:#334155}.claim-table th.previous-head{background:#6f1117}.claim-table th.current-head{background:#b20817}.claim-table th.remaining-head{background:#15803d}.claim-table td{height:5.6mm;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;padding:.7mm 1.2mm;vertical-align:middle}.claim-table td:first-child{border-left:1px solid #cbd5e1}.claim-table tbody tr:nth-child(even) td{background:#f8fafc}.claim-table .computed{background:#f8fafc}.claim-table .previous{background:#fff1f2;color:#7f1d1d}.claim-table .current{background:#fff1f2;color:#b91c1c}.claim-table .remaining{background:#f0fdf4;color:#166534;font-weight:700}.claim-table .negative{background:#fef2f2;color:#dc2626;font-weight:700}.claim-table .blank td{height:5.2mm}.claim-table tfoot td{height:6.5mm;background:#f1f5f9;font-weight:700}.claim-table tfoot td.previous{background:#fff1f2}.claim-table tfoot td.current{background:#fee2e2}.claim-table tfoot td.remaining{background:#dcfce7}.center{text-align:center}.num{text-align:right;white-space:nowrap}.muted{color:#94a3b8}.strong{font-weight:700}.item-name{color:#075db3;font-weight:700}.settlement{display:grid;grid-template-columns:1fr 77mm;gap:3mm;margin-top:2.5mm}.formula-box{overflow:hidden;border:1px solid #cbd5e1;border-radius:6px}.formula-title{background:#f8fafc;padding:1.2mm 2.5mm;color:#475569;font-size:9px;font-weight:700}.formula-grid{display:grid;grid-template-columns:repeat(7,1fr)}.formula-item{border-right:1px solid #e2e8f0;padding:1.3mm 2mm}.formula-item:last-child{border-right:0}.formula-item span{display:block;color:#64748b;font-size:8px}.formula-item strong{display:block;margin-top:.5mm;font-size:11px}.formula-item.deduct strong{color:#dc2626}.formula-item.net{background:#b20817;color:#fff}.formula-item.net span,.formula-item.net strong{color:#fff}.bank-box{border:1px solid #fecaca;border-radius:6px;background:#fff7f7;padding:1.5mm 2.5mm}.bank-title{color:#991b1b;font-size:9px;font-weight:700}.bank-line{display:grid;grid-template-columns:18mm 1fr;margin-top:.8mm}.bank-line span{color:#64748b}.bank-line strong{overflow:hidden;color:#075db3;text-overflow:ellipsis;white-space:nowrap}.bottom-area{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin-top:2.5mm}.amount-words{border-left:3px solid #b20817;background:#fff7f7;padding:1.5mm 3mm;color:#7f1d1d}.amount-words strong{color:#0f172a}.signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:8mm}.signature{display:grid;grid-template-columns:20mm 1fr;align-items:end}.signature span{color:#64748b;text-align:right}.signature strong{min-height:5mm;border-bottom:1px solid #94a3b8;padding:0 2mm 1mm;color:#075db3}.note-strip{margin-top:2mm;border-left:3px solid #f97316;background:#fff7ed;padding:1.5mm 3mm;color:#9a3412}.footer{position:absolute;right:0;bottom:0;color:#94a3b8;font-size:7px}.evidence-page{display:flex;flex-direction:column}.evidence-header{display:grid;grid-template-columns:64mm 1fr 22mm;align-items:center;border-bottom:3px solid #991b1b;padding-bottom:3mm}.evidence-header img{width:60mm;height:18mm;object-fit:contain;object-position:left center}.evidence-header h2{margin:0;text-align:center;color:#991b1b;font-size:22px}.evidence-header p{margin:1mm 0 0;text-align:center}.evidence-header strong{text-align:right;color:#64748b}.evidence-page h3{text-align:center;color:#991b1b;font-size:18px;margin:4mm 0}.evidence-image{display:block;max-width:100%;max-height:155mm;object-fit:contain;margin:auto}.missing-file{margin:auto;width:100%;padding:16mm;border:2px dashed #cbd5e1;text-align:center;color:#64748b}
    html,body{font-size:15px;line-height:1.08}.claim-head{min-height:25mm;padding-bottom:3.5mm}.brand-logo{width:68mm;height:20mm}.brand-caption{font-size:9px}.document-title h1{font-size:32px}.document-title .english{font-size:9px}.document-meta{margin-top:2.5mm}.meta-label,.meta-value{font-size:14px}.contract-info{margin-top:3mm}.info-title{padding:1.8mm 3mm;font-size:14px}.info-field{min-height:11mm;padding:1.6mm 2.5mm}.info-label{font-size:11px}.info-value{font-size:16px}.claim-metrics{margin-top:2.5mm}.metric{min-height:13mm;padding:1.7mm 2.5mm;border-top:3px solid #cbd5e1;background:#fff}.metric span{font-size:11px}.metric strong{font-size:17px}.metric.work-metric{border-top-color:#0f172a}.metric.contract-metric{border-top-color:#475569}.metric.previous-metric{border-top-color:#64748b;background:#f8fafc}.metric.current-metric{border-top-color:#b20817;background:#fff7f7}.metric.current-metric span,.metric.current-metric strong{color:#b20817}.metric.remaining-metric{border-top-color:#15803d}.claim-table{margin-top:3mm;font-size:13px}.claim-table col:nth-child(1){width:4%}.claim-table col:nth-child(2){width:20%}.claim-table col:nth-child(3),.claim-table col:nth-child(4){width:4.5%}.claim-table col:nth-child(5),.claim-table col:nth-child(7){width:6.5%}.claim-table col:nth-child(6),.claim-table col:nth-child(8){width:7%}.claim-table col:nth-child(9),.claim-table col:nth-child(10){width:8%}.claim-table col:nth-child(11){width:5%}.claim-table col:nth-child(12){width:9%}.claim-table col:nth-child(13){width:10%}.claim-table th{padding:1.2mm 1mm;font-size:12px}.claim-table th.previous-head{background:#475569}.claim-table td{height:7mm;padding:1mm 1.2mm;font-size:13px}.claim-table .previous{background:#f8fafc;color:#334155}.claim-table .blank td{height:6.3mm}.claim-table tfoot td{height:8mm;font-size:14px}.settlement{margin-top:3mm;grid-template-columns:1fr 82mm}.formula-title{padding:1.5mm 2.5mm;font-size:12px}.formula-item{padding:1.7mm 2mm}.formula-item span{font-size:11px}.formula-item strong{font-size:15px}.formula-item.net strong{font-size:17px}.bank-box{padding:2mm 3mm}.bank-title{font-size:13px}.bank-line{grid-template-columns:21mm 1fr;margin-top:1.2mm;font-size:15px}.bottom-area{margin-top:3mm}.amount-words,.signature-grid{font-size:15px}.amount-words{padding:2mm 3mm}.signature strong{font-size:15px}.note-strip{margin-top:2.5mm;padding:2mm 3mm;font-size:14px}.footer{font-size:9px}
    .claim-head{grid-template-columns:63mm 1fr 63mm;gap:5mm;align-items:start;min-height:27mm;padding:0 1mm 3.5mm}.claim-head .brand-logo{width:59mm;height:18mm}.claim-head .brand-caption{margin-top:.7mm;font-size:8px;letter-spacing:1.2px}.claim-head .document-title{padding-top:2mm;text-align:center}.claim-head .document-title h1{font-size:31px;font-weight:800}.claim-head .document-title .english{font-size:8px}.claim-head .document-meta{display:block;align-self:start;margin:0;width:100%;overflow:hidden;border:1px solid #fecaca;border-radius:6px;background:#fff}.claim-head .meta-row{display:grid;grid-template-columns:23mm 1fr;min-height:6.8mm}.claim-head .meta-row+.meta-row{border-top:1px solid #fee2e2}.claim-head .meta-label,.claim-head .meta-value{display:flex;align-items:center;padding:0 2.5mm;font-size:13px}.claim-head .meta-label{background:#fff7f7}.claim-head .meta-value{background:#fff}.settlement{display:block;margin-top:3mm}.formula-box{border-color:#cbd5e1;border-radius:7px}.formula-title{display:flex;align-items:center;justify-content:space-between;min-height:8mm;background:#0f172a;padding:1.5mm 3mm;color:#fff}.formula-title strong{font-size:18px;font-weight:800}.formula-title span{font-size:12px;color:#cbd5e1}.formula-grid{background:#fff}.formula-item{min-height:12mm;padding:1.7mm 2.5mm}.formula-item span{font-size:12px}.formula-item strong{font-size:17px}.formula-item.net{display:flex;flex-direction:column;justify-content:center}.formula-item.net span{font-size:13px}.formula-item.net strong{font-size:21px}.settlement .bank-box{margin-top:3mm;padding:0;overflow:hidden;border-color:#fecaca;border-radius:7px;background:#fff}.settlement .bank-title{display:flex;align-items:center;justify-content:space-between;min-height:8mm;background:#fff7f7;padding:1.3mm 3mm;color:#991b1b}.settlement .bank-title strong{font-size:17px;font-weight:800}.settlement .bank-title span{font-size:13px;color:#64748b}.bank-grid{display:grid;grid-template-columns:1fr 1.15fr 1.7fr}.bank-field{min-height:10mm;border-top:1px solid #fee2e2;border-right:1px solid #fee2e2;padding:1.3mm 3mm}.bank-field:last-child{border-right:0}.bank-field span{display:block;color:#64748b;font-size:12px;font-weight:700}.bank-field strong{display:block;margin-top:.5mm;color:#075db3;font-size:17px;font-weight:700}.bottom-area{margin-top:3mm}
    .claim-head .document-title{align-self:center;padding-top:0;transform:translateY(2mm)}.claim-head .document-title .english{margin-top:1.4mm;font-size:14px;letter-spacing:2.2px}.evidence-header{grid-template-columns:47mm minmax(0,1fr) 24mm;gap:4mm}.evidence-header img{width:44mm;height:14mm}.evidence-header>div{min-width:0}.evidence-header h2{font-size:21px}.evidence-header p{font-size:14px;line-height:1.15;overflow-wrap:anywhere}.evidence-header strong{font-size:13px;white-space:nowrap}.transfer-amount{display:grid;grid-template-columns:minmax(0,1fr) 95mm;gap:3mm;margin-top:3mm;align-items:stretch}.transfer-amount .bank-box{margin:0;padding:0;overflow:hidden;border-color:#fecaca;border-radius:7px;background:#fff}.transfer-amount .bank-title{display:flex;align-items:center;min-height:8mm;background:#fff7f7;padding:1.3mm 3mm;color:#991b1b;font-size:17px;font-weight:800}.transfer-amount .bank-grid{display:grid;grid-template-columns:.85fr 1.05fr 1.5fr;margin:0}.transfer-amount .bank-field{min-height:11mm}.claim-amount-box{display:flex;flex-direction:column;overflow:hidden;border:1px solid #fecaca;border-radius:7px;background:#fff}.claim-amount-title{background:#fff7f7;padding:1.3mm 3mm;color:#991b1b;font-size:17px;font-weight:800}.claim-amount-words{flex:1;padding:1.2mm 3mm;color:#0f172a;font-size:17px;font-weight:700}.claim-amount-meta{padding:0 3mm 1mm;color:#64748b;font-size:12px}.claim-amount-net{display:flex;align-items:center;justify-content:space-between;min-height:8mm;background:#b20817;padding:1mm 3mm;color:#fff;font-size:15px;font-weight:700}.claim-amount-net strong{font-size:21px}.claim-declaration{margin-top:3mm;font-size:15px}.claim-declarer-line{display:grid;grid-template-columns:17mm minmax(70mm,1fr) 26mm 18mm 22mm;gap:2mm;align-items:end}.claim-declarer-line span{color:#475569;font-weight:700}.claim-declarer-name,.claim-declarer-position{min-height:6mm;border-bottom:1px solid #94a3b8;padding:0 2mm 1mm;color:#075db3;font-size:17px;font-weight:700}.claim-declarer-position{text-align:center}.claim-certification{margin-top:3mm;padding-left:19mm;color:#334155;font-size:15px}.claim-certification strong{color:#166534;font-weight:700}.note-strip{margin-top:2.5mm}
    .info-title{font-size:16px}.info-label{font-size:14px}.metric span{font-size:14px}.formula-title span{font-size:14px}.formula-item span{color:#475569;font-size:14px;font-weight:700}.formula-item strong{font-size:18px}.formula-item.net span{font-size:15px}.formula-item.net strong{font-size:23px}.transfer-amount{grid-template-columns:158mm minmax(0,1fr);align-items:start}.transfer-amount .bank-title{font-size:19px}.transfer-amount .bank-grid{grid-template-columns:.75fr 1fr 1.35fr}.transfer-amount .bank-field{min-height:12mm;padding:1.5mm 2.5mm}.transfer-amount .bank-field span{font-size:14px}.transfer-amount .bank-field strong{font-size:18px}.claim-amount-title{font-size:20px}.claim-amount-words{padding:1.5mm 3mm;font-size:22px}.claim-amount-meta{font-size:14px}.claim-amount-net{min-height:9mm;font-size:18px}.claim-amount-net strong{font-size:26px}
  </style></head><body><section class="page claim-page">
    <header class="claim-head"><div>${input.logoDataUrl ? `<img class="brand-logo" src="${input.logoDataUrl}" alt="Pichayamongkol">` : ""}<p class="brand-caption">Pichayamongkol Construction Co., Ltd.</p></div><div class="document-title"><h1>ใบเบิกงวดงานผู้รับเหมา</h1><div class="english">CONTRACTOR PROGRESS CLAIM</div></div><div class="document-meta"><div class="meta-row"><span class="meta-label">เลขที่เอกสาร</span><span class="meta-value">${escapeHtml(request.document_no)}</span></div><div class="meta-row"><span class="meta-label">หน่วยงาน</span><span class="meta-value">${escapeHtml(projectName)}</span></div><div class="meta-row"><span class="meta-label">วันที่เอกสาร</span><span class="meta-value">${formatVoucherDate(request.request_date)}</span></div></div></header>
    <section class="contract-info"><div class="info-title"><span>ข้อมูลผู้รับเหมาและสัญญา</span><span>${escapeHtml(request.document_no)}</span></div><div class="info-grid"><div class="info-field"><span class="info-label">ชื่อผู้รับเหมา / ผู้รับเงิน</span><span class="info-value">${escapeHtml(request.payee_name || "-")}</span></div><div class="info-field"><span class="info-label">เลขประจำตัวผู้เสียภาษี</span><span class="info-value">${escapeHtml(formatTaxId(request.payee_tax_id))}</span></div><div class="info-field address"><span class="info-label">ที่อยู่</span><span class="info-value">${escapeHtml(request.payee_address || "-")}</span></div></div></section>
    <section class="claim-metrics"><div class="metric work-metric"><span>แพ็กเกจ / หมวดงาน</span><strong>${escapeHtml(request.work_package || request.title)}</strong></div><div class="metric"><span>งวดที่</span><strong>${escapeHtml(request.claim_period || "-")}</strong></div><div class="metric contract-metric"><span>มูลค่าสัญญา</span><strong>${formatPaymentMoney(contractAmount)}</strong></div><div class="metric previous-metric"><span>เบิกก่อนหน้า</span><strong>${formatPaymentMoney(previousClaim)}</strong></div><div class="metric current-metric"><span>เบิกงวดนี้</span><strong>${formatPaymentMoney(currentClaim)}</strong></div><div class="metric remaining-metric"><span>คงเหลือสัญญา</span><strong>${formatPaymentMoney(contractRemaining)}</strong></div></section>
    <table class="claim-table"><colgroup>${Array.from({ length: 13 }, () => "<col>").join("")}</colgroup><thead><tr><th rowspan="2">ลำดับ</th><th rowspan="2">รายการ</th><th rowspan="2">ปริมาณ</th><th rowspan="2">หน่วย</th><th colspan="2">ค่าวัสดุ</th><th colspan="2">ค่าแรง</th><th rowspan="2">มูลค่าสัญญา</th><th rowspan="2" class="previous-head">เบิกก่อนหน้า</th><th colspan="2" class="current-head">งวดนี้</th><th rowspan="2" class="remaining-head">คงเหลือ</th></tr><tr><th>ราคา/หน่วย</th><th>จำนวนเงิน</th><th>ราคา/หน่วย</th><th>จำนวนเงิน</th><th class="current-head">%</th><th class="current-head">ยอดเบิก</th></tr></thead><tbody>${itemRows.join("")}${blankRows}</tbody><tfoot><tr><td colspan="8" class="num">รวมตามสัญญา / ยอดเบิก</td><td class="num">${formatPaymentMoney(contractAmount)}</td><td class="num previous">${formatPaymentMoney(previousClaim)}</td><td class="current"></td><td class="num current">${formatPaymentMoney(currentClaim)}</td><td class="num remaining">${formatPaymentMoney(contractRemaining)}</td></tr></tfoot></table>
    <section class="settlement"><div class="formula-box"><div class="formula-title"><strong>สรุปรายการเบิกงวดนี้</strong><span>ยอดงวดนี้ - หักประกันผลงาน - คำนวณภาษีจากยอดหลังหักประกัน</span></div><div class="formula-grid"><div class="formula-item"><span>ยอดเบิกงวดนี้</span><strong>${formatPaymentMoney(currentClaim)}</strong></div><div class="formula-item deduct"><span>หักประกัน ${escapeHtml(request.retention_rate)}%</span><strong>-${formatPaymentMoney(request.retention_amount)}</strong></div><div class="formula-item"><span>ยอดหลังหักประกัน</span><strong>${formatPaymentMoney(afterRetention)}</strong></div><div class="formula-item deduct"><span>หัก ณ ที่จ่าย ${escapeHtml(request.wht_rate)}%</span><strong>-${formatPaymentMoney(request.wht_amount)}</strong></div><div class="formula-item deduct"><span>หักเงินล่วงหน้า</span><strong>-${formatPaymentMoney(request.advance_deduction)}</strong></div><div class="formula-item deduct"><span>หักอื่น ๆ</span><strong>-${formatPaymentMoney(request.other_deduction)}</strong></div><div class="formula-item net"><span>ยอดโอนสุทธิ</span><strong>${formatPaymentMoney(request.net_amount)}</strong></div></div></div></section>
    <section class="transfer-amount"><div class="bank-box"><div class="bank-title">ข้อมูลสำหรับการโอนเงิน</div><div class="bank-grid"><div class="bank-field"><span>ธนาคาร</span><strong>${escapeHtml(request.bank_name || "-")}</strong></div><div class="bank-field"><span>เลขที่บัญชี</span><strong>${escapeHtml(request.bank_account_no || "-")}</strong></div><div class="bank-field"><span>ชื่อบัญชี</span><strong>${escapeHtml(request.bank_account_name || "-")}</strong></div></div></div><div class="claim-amount-box"><div class="claim-amount-title">จำนวนเงินตัวอักษร</div><div class="claim-amount-words">(${thaiBahtText(request.net_amount)})</div><div class="claim-amount-meta">ยอดหักรวม ${formatPaymentMoney(paymentDeductions)} บาท · เบิกสะสม ${formatPaymentMoney(cumulativeClaim)} บาท</div><div class="claim-amount-net"><span>ยอดโอนสุทธิ</span><strong>${formatPaymentMoney(request.net_amount)}</strong></div></div></section>
    <section class="claim-declaration"><div class="claim-declarer-line"><span>ข้าพเจ้า</span><strong class="claim-declarer-name">${escapeHtml(request.created_by_name || "-")}</strong><span>ผู้เบิกจ่าย</span><span>ตำแหน่ง</span><strong class="claim-declarer-position">SE</strong></div><div class="claim-certification">ขอรับรองว่า รายจ่ายข้างต้นนี้ข้าพเจ้าได้จ่ายไปในงานของทาง <strong>บริษัทพิชยมงคล คอนสตรัคชั่น โดยแท้</strong></div></section>
    <div class="note-strip"><strong>หมายเหตุ:</strong> ${escapeHtml(notes)}</div><div class="footer">${escapeHtml(request.document_no)}</div>
  </section>${evidencePages}</body></html>`;
}

export function buildClassicPaymentRequestHtml(input: PaymentRequestPdfInput) {
  const { request, project, items, attachments } = input;
  const contractorClaim = request.request_type === "contractor_claim";
  if (contractorClaim) return buildContractorClaimPaymentHtml(input);
  const documentTitle = contractorClaim ? "ใบเบิกงวดงานผู้รับเหมา" : "ใบสำคัญจ่าย";
  const projectName = String(project.name || request.project_id || "-");
  const paymentDeductions = Number(request.wht_amount) + Number(request.retention_amount) + Number(request.advance_deduction) + Number(request.other_deduction);
  const itemRows = items.map((item, index) => {
    return `<tr class="data-row"><td class="center muted">${index + 1}</td><td><span class="blue strong">${escapeHtml(item.description)}</span></td><td class="num blue strong">${formatPaymentMoney(item.amount)}</td><td class="num red strong">${index === 0 && paymentDeductions > 0 ? formatPaymentMoney(paymentDeductions) : ""}</td><td class="num strong">${formatPaymentMoney(item.amount)}</td></tr>`;
  });
  const blankRows = Array.from({ length: Math.max(3, 10 - itemRows.length) }, (_unused, index) => `<tr class="data-row blank"><td class="center muted">${itemRows.length + index + 1}</td><td></td><td></td><td></td><td></td></tr>`).join("");
  const claimLine = contractorClaim
    ? `<div class="claim-line"><span>งาน<strong>${escapeHtml(request.work_package || request.title)}</strong></span><span>งวดที่<strong>${escapeHtml(request.claim_period || "-")}</strong></span><span>มูลค่าสัญญา<strong>${formatPaymentMoney(request.contract_amount)}</strong></span><span>เบิกก่อนหน้า<strong>${formatPaymentMoney(request.previous_claim_amount)}</strong></span></div>`
    : "";
  const address = parseThaiVoucherAddress(request.payee_address || "");
  const standardNote = "แนบบัตรประจำตัวประชาชนผู้รับเงินและใบเสร็จพร้อมสลิปโอนทุกใบ";
  const customNote = request.notes.trim();
  const notes = customNote && !customNote.startsWith("แนบบัตรประจำตัวประชาชน")
    ? `${standardNote} · ${escapeHtml(customNote)}`
    : standardNote;
  const evidencePages = attachments.map((attachment, index) => `
    <section class="page evidence-page">
      <header class="evidence-header">
        ${input.logoDataUrl ? `<img src="${input.logoDataUrl}" alt="Pichayamongkol">` : ""}
        <div><h2>${documentTitle}</h2><p>${escapeHtml(request.title)} · หน่วยงาน${escapeHtml(projectName)}</p></div>
        <strong>เอกสารแนบ ${index + 1}/${attachments.length}</strong>
      </header>
      <h3>${escapeHtml(attachment.caption || attachment.file_name)}</h3>
      ${attachment.data_url
        ? `<img class="evidence-image" src="${attachment.data_url}" alt="${escapeHtml(attachment.caption || attachment.file_name)}">`
        : `<div class="missing-file">ไม่สามารถแสดงตัวอย่างไฟล์นี้ใน PDF ได้<br>${escapeHtml(attachment.file_name)}</div>`}
    </section>`).join("");

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
    @page{size:A4 portrait;margin:7mm}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#0f172a;font-family:"TH Sarabun New",sans-serif;font-size:15px;line-height:1.08}.page{min-height:283mm;page-break-after:always;position:relative}.page:last-child{page-break-after:auto}.voucher{display:flex;flex-direction:column}.voucher-head{display:grid;grid-template-columns:1fr 66mm;gap:8mm;min-height:36mm;border-bottom:3px solid #991b1b;padding:0 1mm 5mm}.brand-logo{width:76mm;height:23mm;object-fit:contain;object-position:left center}.brand-caption{margin:1mm 0 0;color:#8391ab;font-size:8px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase}.document-title{text-align:right}.document-title h1{margin:0;color:#0f172a;font-size:27px;font-weight:700;line-height:1}.document-title .english{margin-top:1mm;color:#b91c1c;font-size:8px;font-weight:700;letter-spacing:2px}.document-meta{margin:3mm 0 0 auto;width:58mm;overflow:hidden;border:1px solid #fecaca;border-radius:7px;background:#fff}.meta-row{display:grid;grid-template-columns:21mm 1fr;min-height:8mm}.meta-row+.meta-row{border-top:1px solid #fee2e2}.meta-label{display:flex;align-items:center;background:#fff7f7;padding:0 3mm;color:#991b1b;font-weight:700}.meta-value{display:flex;align-items:center;padding:0 3mm;color:#075db3;font-weight:700}.recipient{margin-top:4mm;overflow:hidden;border:1px solid #cbd5e1;border-radius:7px;background:#fff}.recipient-title{background:#0f172a;padding:2mm 4mm;color:#fff;font-size:12px;font-weight:700;letter-spacing:1px}.recipient-grid{display:grid;grid-template-columns:1fr 1fr}.field{min-height:13mm;border-bottom:1px solid #e2e8f0;padding:2.5mm 4mm}.field:nth-child(odd){border-right:1px solid #e2e8f0}.field.address{grid-column:1/-1;border-bottom:0;border-right:0}.field-label{display:block;color:#94a3b8;font-size:10px;font-weight:700}.field-value{display:block;margin-top:1mm;color:#075db3;font-size:14px;font-weight:700}.payer-strip{display:flex;align-items:center;justify-content:space-between;margin-top:2.5mm;border-radius:5px;background:#f8fafc;padding:2mm 4mm;color:#64748b;font-size:11px}.payer-strip strong{color:#0f172a}.claim-line{display:grid;grid-template-columns:2fr .7fr 1fr 1fr;gap:2mm;margin-top:2.5mm;border:1px solid #fecaca;border-radius:6px;background:#fff7f7;padding:2mm 3mm;color:#991b1b;font-size:11px}.claim-line span{min-width:0}.claim-line strong{display:block;margin-top:.5mm;overflow:hidden;color:#075db3;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.voucher-table{width:100%;margin-top:3mm;border-collapse:collapse;table-layout:fixed}.voucher-table col:nth-child(1){width:6%}.voucher-table col:nth-child(2){width:50%}.voucher-table col:nth-child(3){width:12%}.voucher-table col:nth-child(4){width:20%}.voucher-table col:nth-child(5){width:12%}.voucher-table th{height:8mm;border-right:1px solid #b91c1c;background:#b20817;padding:1.5mm 2mm;color:#fff;font-size:12px;font-weight:700}.voucher-table th:nth-child(2){text-align:left}.voucher-table td{height:6.3mm;border-right:1px solid #dbe3ef;border-bottom:1px solid #dbe3ef;padding:1mm 2mm;vertical-align:middle}.voucher-table td:first-child{border-left:1px solid #dbe3ef}.voucher-table tr:nth-child(even) td{background:#f8fafc}.voucher-table td small{display:block;margin-top:.5mm;color:#64748b;font-size:10px}.data-row.blank td{height:6.1mm}.center{text-align:center}.num{text-align:right;white-space:nowrap}.blue{color:#075db3}.red{color:#dc2626}.muted{color:#94a3b8}.strong{font-weight:700}.table-hint{display:flex;align-items:center;justify-content:space-between;margin-top:1.5mm;color:#94a3b8;font-size:10px;font-weight:700}.table-hint strong{color:#b91c1c}.money-area{display:grid;grid-template-columns:1fr 58mm;gap:4mm;margin-top:3mm}.amount-box{min-height:23mm;border-radius:7px;background:#f8fafc;padding:3mm 4mm}.box-label{color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:1px}.amount-words{margin-top:1mm;color:#0f172a;font-size:14px;font-weight:700}.note-line{margin-top:3mm;color:#94a3b8;font-size:10px;font-weight:700}.note-value{margin-top:1mm;border-bottom:1px solid #cbd5e1;padding-bottom:1mm;color:#075db3;font-size:12px}.summary-box{overflow:hidden;border:1px solid #cbd5e1;border-radius:7px}.summary-row{display:flex;align-items:center;justify-content:space-between;min-height:7mm;padding:1mm 3mm;color:#64748b;font-size:12px;font-weight:700}.summary-row+.summary-row{border-top:1px solid #e2e8f0}.summary-row.deduct{color:#dc2626}.summary-row.net{min-height:11mm;background:#b20817;color:#fff}.summary-row.net strong{font-size:20px}.bank-box{margin-top:3mm;border:1px solid #fecaca;border-radius:7px;background:#fff7f7;padding:3mm}.bank-head{display:flex;justify-content:space-between;color:#991b1b;font-size:11px;font-weight:700;letter-spacing:1px}.bank-head small{font-size:8px;letter-spacing:0}.bank-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:3mm;margin-top:2mm}.bank-field span{display:block;color:#94a3b8;font-size:10px;font-weight:700}.bank-field strong{display:block;margin-top:1mm;border:1px solid #fecaca;border-radius:5px;background:#fff;padding:2mm 3mm;color:#075db3;font-size:13px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:16mm;margin-top:5mm;font-size:11px}.signature-line{display:grid;grid-template-columns:16mm 1fr;gap:2mm;align-items:end}.signature-line.receiver{grid-template-columns:22mm 1fr 17mm 15mm}.signature-label{text-align:right;color:#64748b;font-weight:700}.signature-value{min-height:6mm;border-bottom:1px solid #94a3b8;padding:0 2mm 1mm;color:#075db3;font-weight:700}.certify{margin-top:2mm;color:#475569}.company-confirm{margin-top:1.5mm;color:#166534;font-weight:700}.notes{margin-top:4mm;border-left:3px solid #f97316;background:#fff7ed;padding:2.5mm 3mm;color:#9a3412;font-size:12px}.voucher-footer{position:absolute;right:0;bottom:0;color:#94a3b8;font-size:8px}.evidence-page{display:flex;flex-direction:column}.evidence-header{display:grid;grid-template-columns:65mm 1fr 30mm;align-items:center;border-bottom:3px solid #991b1b;padding-bottom:3mm}.evidence-header img{width:62mm;height:20mm;object-fit:contain;object-position:left center}.evidence-header h2{margin:0;text-align:center;color:#991b1b;font-size:23px}.evidence-header p{margin:1mm 0 0;text-align:center}.evidence-header strong{text-align:right;color:#64748b}.evidence-page h3{text-align:center;color:#991b1b;font-size:20px;margin:5mm 0}.evidence-image{display:block;max-width:100%;max-height:235mm;object-fit:contain;margin:auto}.missing-file{margin:auto;width:100%;padding:20mm;border:2px dashed #cbd5e1;text-align:center;color:#64748b}
    html,body{font-size:17px;line-height:1.1}.voucher-head{grid-template-columns:62mm 1fr 62mm;gap:5mm;align-items:start;min-height:33mm;padding:0 1mm 4mm}.brand-logo{width:59mm;height:18mm}.brand-caption{margin-top:.7mm;font-size:8px;letter-spacing:1.2px}.document-title{padding-top:2mm;text-align:center}.document-title h1{font-size:33px;font-weight:800}.document-title .english{font-size:9px}.document-meta{align-self:start;margin:0;width:100%}.meta-row{grid-template-columns:23mm 1fr;min-height:7.5mm}.meta-label,.meta-value{font-size:14px}.recipient{margin-top:3mm}.recipient-title{padding:1.8mm 4mm;font-size:15px}.recipient-body{padding:2.5mm 4mm 2.8mm;font-size:15px}.declaration-row{display:grid;grid-template-columns:17mm 1fr 25mm;gap:2mm;align-items:end}.declaration-label{color:#475569;font-weight:700}.declaration-value{min-height:5.5mm;border-bottom:1px dotted #64748b;padding:0 2mm 1mm;color:#075db3;font-size:17px;font-weight:700}.declaration-role{text-align:center;color:#475569;font-weight:700}.tax-address-row{display:grid;grid-template-columns:37mm 52mm 18mm 1fr;gap:2mm;align-items:end;margin-top:1.4mm}.address-detail-grid{display:grid;grid-template-columns:.65fr .65fr 1.2fr 1.15fr 1.15fr;gap:3mm;margin-top:1.4mm}.address-detail{display:grid;grid-template-columns:auto 1fr;gap:1.5mm;align-items:end;min-width:0}.address-detail strong{border-bottom:1px dotted #64748b;padding:0 1mm 1mm;color:#075db3;font-weight:700;text-align:center;white-space:nowrap}.received-line{display:grid;grid-template-columns:27mm 1fr 53mm;gap:2mm;align-items:end;margin-top:1.8mm}.received-line strong{border-bottom:1px dotted #64748b;padding:0 2mm 1mm;color:#075db3}.voucher-table{margin-top:2.5mm}.voucher-table col:nth-child(1){width:6%}.voucher-table col:nth-child(2){width:46%}.voucher-table col:nth-child(3){width:12%}.voucher-table col:nth-child(4){width:24%}.voucher-table col:nth-child(5){width:12%}.voucher-table th{height:9mm;font-size:15px}.voucher-table td{height:6mm;font-size:15px}.voucher-table td small{font-size:12px}.data-row.blank td{height:5.7mm}.money-area{margin-top:2.5mm}.amount-box{min-height:18mm;padding:2.5mm 4mm}.box-label{font-size:12px}.amount-words{font-size:17px}.amount-reference{margin-top:2mm;color:#64748b;font-size:13px}.summary-row{font-size:14px}.summary-row.net strong{font-size:23px}.bank-box{margin-top:2.5mm;padding:2.5mm 3mm}.bank-head{font-size:13px}.bank-head small{font-size:10px}.bank-field span{font-size:12px}.bank-field strong{font-size:16px}.signatures{display:block;margin-top:5mm;font-size:15px}.declarer-line{display:grid;grid-template-columns:18mm 1fr 25mm 18mm 22mm;gap:2mm;align-items:end}.declarer-line span{color:#475569;font-weight:700}.declarer-name,.declarer-position{min-height:6mm;border-bottom:1px solid #94a3b8;padding:0 2mm 1mm;color:#075db3;font-size:17px;font-weight:700}.declarer-position{text-align:center}.certification{margin-top:4mm;padding-left:20mm;color:#334155;font-size:15px}.certification strong{color:#166534;font-weight:700}.notes{margin-top:3mm;padding:2mm 3mm;font-size:14px}.voucher-footer{font-size:9px}
    .voucher-head .document-title{align-self:center;padding-top:0}.voucher-head .document-title .english{margin-top:1.4mm;font-size:12px;letter-spacing:2.5px}.evidence-header{grid-template-columns:47mm minmax(0,1fr) 28mm;gap:4mm}.evidence-header img{width:44mm;height:14mm}.evidence-header>div{min-width:0}.evidence-header h2{font-size:22px}.evidence-header p{font-size:15px;line-height:1.15;overflow-wrap:anywhere}.evidence-header strong{font-size:14px;white-space:nowrap}
  </style></head><body>
    <section class="page voucher">
      <header class="voucher-head">
        <div>${input.logoDataUrl ? `<img class="brand-logo" src="${input.logoDataUrl}" alt="Pichayamongkol">` : ""}<p class="brand-caption">Pichayamongkol Construction Co., Ltd.</p></div>
        <div class="document-title"><h1>${documentTitle}</h1><div class="english">PAYMENT VOUCHER</div></div>
        <div class="document-meta"><div class="meta-row"><span class="meta-label">เลขที่เอกสาร</span><span class="meta-value">${escapeHtml(request.document_no)}</span></div><div class="meta-row"><span class="meta-label">หน่วยงาน</span><span class="meta-value">${escapeHtml(projectName)}</span></div><div class="meta-row"><span class="meta-label">วันที่เอกสาร</span><span class="meta-value">${formatVoucherDate(request.request_date)}</span></div></div>
      </header>
      <div class="recipient">
        <div class="recipient-title">ข้อมูลผู้รับเงิน</div><div class="recipient-body"><div class="declaration-row"><span class="declaration-label">ข้าพเจ้า</span><strong class="declaration-value">${escapeHtml(request.payee_name || "-")}</strong><span class="declaration-role">(ผู้เบิกเงิน)</span></div><div class="tax-address-row"><span class="declaration-label">เลขประจำตัวผู้เสียภาษี</span><strong class="declaration-value">${escapeHtml(formatTaxId(request.payee_tax_id))}</strong><span class="declaration-label">อยู่ที่บ้านเลขที่</span><strong class="declaration-value">${escapeHtml(address.houseNo)}</strong></div><div class="address-detail-grid"><span class="address-detail"><span>หมู่</span><strong>${escapeHtml(address.villageNo)}</strong></span><span class="address-detail"><span>ถนน</span><strong>${escapeHtml(address.road)}</strong></span><span class="address-detail"><span>แขวง/ตำบล</span><strong>${escapeHtml(address.subdistrict)}</strong></span><span class="address-detail"><span>เขต/อำเภอ</span><strong>${escapeHtml(address.district)}</strong></span><span class="address-detail"><span>จังหวัด</span><strong>${escapeHtml(address.province)}</strong></span></div><div class="received-line"><span class="declaration-label">ได้รับเงินจาก</span><strong>บริษัท พิชยมงคล คอนสตรัคชั่น จำกัด</strong><span>(ผู้จ่ายเงิน/อนุมัติ) ดังรายการต่อไปนี้</span></div></div>
      </div>${claimLine}
      <table class="voucher-table">
        <colgroup><col><col><col><col><col></colgroup>
        <thead><tr><th>ลำดับ</th><th>รายการ</th><th>ราคา</th><th>หักประกันผลงาน/หัก ณ ที่จ่าย</th><th>จำนวนเงิน</th></tr></thead>
        <tbody>${itemRows.join("")}${blankRows}</tbody>
      </table>
      <div class="money-area"><div class="amount-box"><div class="box-label">จำนวนเงินตัวอักษร</div><div class="amount-words">(${thaiBahtText(request.net_amount)})</div><div class="amount-reference">ยอดโอนสุทธิตามรายการข้างต้น</div></div><div class="summary-box"><div class="summary-row"><span>รวมเป็นเงิน (บาท)</span><strong>${formatPaymentMoney(request.subtotal)}</strong></div>${paymentDeductions > 0 ? `<div class="summary-row deduct"><span>รวมรายการหัก</span><strong>-${formatPaymentMoney(paymentDeductions)}</strong></div>` : ""}<div class="summary-row net"><span>ยอดโอนสุทธิ</span><strong>${formatPaymentMoney(request.net_amount)}</strong></div></div></div>
      <div class="bank-box"><div class="bank-head"><span>ข้อมูลสำหรับการโอนเงิน</span><small>Bank transfer details</small></div><div class="bank-grid"><div class="bank-field"><span>ธนาคาร</span><strong>${escapeHtml(request.bank_name || "-")}</strong></div><div class="bank-field"><span>เลขที่บัญชี</span><strong>${escapeHtml(request.bank_account_no || "-")}</strong></div><div class="bank-field"><span>ชื่อบัญชี</span><strong>${escapeHtml(request.bank_account_name || "-")}</strong></div></div></div>
      <div class="signatures"><div class="declarer-line"><span>ข้าพเจ้า</span><strong class="declarer-name">${escapeHtml(request.created_by_name || "-")}</strong><span>ผู้เบิกจ่าย</span><span>ตำแหน่ง</span><strong class="declarer-position">SE</strong></div><div class="certification">ขอรับรองว่า รายจ่ายข้างต้นนี้ข้าพเจ้าได้จ่ายไปในงานของทาง <strong>บริษัท พิชยมงคล คอนสตรัคชั่น โดยแท้</strong></div></div>
      <div class="notes">หมายเหตุ : ${notes}${paymentDeductions > 0 ? ` · ยอดหักรวม ${formatPaymentMoney(paymentDeductions)} บาท` : ""}</div>
      <div class="voucher-footer">${escapeHtml(request.document_no)}</div>
    </section>
    ${evidencePages}
  </body></html>`;
}
