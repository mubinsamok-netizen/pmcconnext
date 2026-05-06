export type PaymentClaimType = "PETTY_CASH" | "ADVANCE_CASH" | "DC_WORKER" | "DC_BATCH" | "SUBCONTRACTOR";

export type PaymentClaimStatus =
  | "DRAFT"
  | "SUBMITTED_TO_ACCOUNTING"
  | "UNDER_REVIEW"
  | "NEEDS_MORE_INFO"
  | "APPROVED"
  | "TRANSFERRED"
  | "CLOSED"
  | "REJECTED";

export type PaymentClaimItem = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

export type PaymentClaimAttachment = {
  name: string;
  required: boolean;
  present: boolean;
  fileName?: string;
  fileId?: string;
  fileUrl?: string;
  uploadedAt?: string;
  uploadedBy?: string;
};

export type PaymentClaim = {
  id: string;
  docNo: string;
  type: PaymentClaimType;
  status: PaymentClaimStatus;
  siteId: string;
  siteName: string;
  projectName: string;
  preparedBy: string;
  payeeName: string;
  payeeKind: "พนักงาน" | "ช่าง DC" | "ผู้รับเหมา" | "ร้านค้า";
  payeeIdMasked?: string;
  bankName?: string;
  accountNoMasked?: string;
  createdDate: string;
  dueDate: string;
  payPeriod?: string;
  installment?: string;
  description: string;
  grossAmount: number;
  vatAmount: number;
  whtAmount: number;
  retentionAmount: number;
  netPayable: number;
  attachments: PaymentClaimAttachment[];
  items: PaymentClaimItem[];
  remarks?: string;
};

export const PAYMENT_TYPE_LABELS: Record<PaymentClaimType, string> = {
  PETTY_CASH: "ใบสำคัญจ่าย",
  ADVANCE_CASH: "เบิกเงินสดล่วงหน้า",
  DC_WORKER: "ค่าแรงช่าง DC",
  DC_BATCH: "ค่าแรง DC หลายคน",
  SUBCONTRACTOR: "ค่างวดงานรับเหมา",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentClaimStatus, string> = {
  DRAFT: "ฉบับร่าง",
  SUBMITTED_TO_ACCOUNTING: "ส่งบัญชีแล้ว",
  UNDER_REVIEW: "บัญชีกำลังตรวจ",
  NEEDS_MORE_INFO: "ขอข้อมูลเพิ่ม",
  APPROVED: "อนุมัติแล้ว",
  TRANSFERRED: "โอนแล้ว",
  CLOSED: "ปิดรายการ",
  REJECTED: "ตีกลับ",
};

PAYMENT_STATUS_LABELS.SUBMITTED_TO_ACCOUNTING = "ส่งขอเบิกแล้ว";

export const PAYMENT_STATUS_STYLES: Record<PaymentClaimStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SUBMITTED_TO_ACCOUNTING: "bg-blue-50 text-blue-700",
  UNDER_REVIEW: "bg-amber-50 text-amber-700",
  NEEDS_MORE_INFO: "bg-yellow-50 text-yellow-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  TRANSFERRED: "bg-teal-50 text-teal-700",
  CLOSED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-50 text-red-700",
};

export const PAYMENT_TYPE_STYLES: Record<PaymentClaimType, string> = {
  PETTY_CASH: "bg-orange-50 text-orange-700",
  ADVANCE_CASH: "bg-yellow-50 text-yellow-700",
  DC_WORKER: "bg-sky-50 text-sky-700",
  DC_BATCH: "bg-cyan-50 text-cyan-700",
  SUBCONTRACTOR: "bg-violet-50 text-violet-700",
};

export function numberValue(value?: number | string | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "").replace(/,/g, "").trim();
  if (!cleaned) return 0;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function formatMoney(value?: number | string | null) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numberValue(value));
}

export function formatThaiDate(value?: string) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export function todayBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date());
}

export function getBangkokDateParts(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date();
    return {
      day: String(fallback.getDate()).padStart(2, "0"),
      month: String(fallback.getMonth() + 1).padStart(2, "0"),
      thaiYearShort: String(fallback.getFullYear() + 543).slice(-2),
    };
  }

  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    thaiYearShort: String(date.getFullYear() + 543).slice(-2),
  };
}

export function createPaymentDocNo({
  type,
  date,
  siteClaims,
}: {
  type: PaymentClaimType;
  date: string;
  siteClaims: PaymentClaim[];
}) {
  const prefix = type === "DC_WORKER" || type === "DC_BATCH"
    ? "DCW"
    : type === "SUBCONTRACTOR"
      ? "SUB"
      : "PCF";
  const { day, month, thaiYearShort } = getBangkokDateParts(date);
  const sequence = siteClaims
    .filter((claim) => claim.docNo.startsWith(`${prefix}-`))
    .map((claim) => Number(claim.docNo.split("-").at(-1)))
    .filter(Number.isFinite)
    .reduce((max, value) => Math.max(max, value), 0) + 1;

  return `${prefix}-${day}${month}${thaiYearShort}-${String(sequence).padStart(3, "0")}`;
}

export function calculatePaymentTotals({
  type,
  items,
  vatAmount = 0,
  whtRate,
  retentionRate,
  advanceDeduct = 0,
  otherDeduct = 0,
}: {
  type: PaymentClaimType;
  items: PaymentClaimItem[];
  vatAmount?: number;
  whtRate?: number;
  retentionRate?: number;
  advanceDeduct?: number;
  otherDeduct?: number;
}) {
  const grossAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const resolvedWhtRate = whtRate ?? (type === "DC_WORKER" || type === "DC_BATCH" || type === "SUBCONTRACTOR" ? 3 : 0);
  const resolvedRetentionRate = retentionRate ?? (type === "SUBCONTRACTOR" ? 5 : 0);
  const whtAmount = grossAmount * (resolvedWhtRate / 100);
  const retentionAmount = grossAmount * (resolvedRetentionRate / 100);
  const netPayable = grossAmount + vatAmount - whtAmount - retentionAmount - advanceDeduct - otherDeduct;

  return {
    grossAmount,
    vatAmount,
    whtAmount,
    retentionAmount,
    netPayable,
  };
}

const thaiNumberWords = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const thaiDigitPlaces = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function readThaiNumberUnderMillion(value: number) {
  const digits = String(value);
  let text = "";

  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits[index]);
    const position = digits.length - index - 1;
    if (digit === 0) continue;

    if (position === 0 && digit === 1 && digits.length > 1) {
      text += "เอ็ด";
    } else if (position === 1 && digit === 1) {
      text += "สิบ";
      continue;
    } else if (position === 1 && digit === 2) {
      text += "ยี่";
    } else {
      text += thaiNumberWords[digit];
    }

    text += thaiDigitPlaces[position];
  }

  return text || thaiNumberWords[0];
}

export function numberToThaiBahtText(value?: number | string | null) {
  const amount = Math.round(numberValue(value) * 100) / 100;
  const baht = Math.floor(amount);
  const satang = Math.round((amount - baht) * 100);

  const readInteger = (integerValue: number): string => {
    if (integerValue === 0) return thaiNumberWords[0];
    const parts: string[] = [];
    let remaining = integerValue;

    while (remaining > 0) {
      parts.unshift(readThaiNumberUnderMillion(remaining % 1_000_000));
      remaining = Math.floor(remaining / 1_000_000);
    }

    return parts.join("ล้าน");
  };

  const bahtText = `${readInteger(baht)}บาท`;
  if (satang === 0) return `${bahtText}ถ้วน`;
  return `${bahtText}${readThaiNumberUnderMillion(satang)}สตางค์`;
}

function escapeHtml(value?: string | number | null) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildPaymentClaimPrintHtml(claim: PaymentClaim) {
  const deductionTotal = claim.whtAmount + claim.retentionAmount;
  const title = claim.type === "SUBCONTRACTOR"
    ? "ใบเบิกค่างวดงานรับเหมา"
    : claim.type === "DC_WORKER" || claim.type === "DC_BATCH"
      ? "ใบเบิกค่าแรงช่าง DC"
      : claim.type === "ADVANCE_CASH"
        ? "ใบขอเบิกเงินสดล่วงหน้า"
        : "ใบสำคัญจ่าย";
  const signatureLabels = claim.type === "SUBCONTRACTOR"
    ? ["ผู้รับเงิน", "SE/ผู้จัดทำ", "PM/ผู้ตรวจ", "Director/ผู้อนุมัติ"]
    : ["ผู้รับเงิน", "ผู้จัดทำ", "ผู้ตรวจสอบ", "ผู้อนุมัติ"];

  const itemRows = claim.items.map((item, index) => `
    <tr>
      <td class="center">${index + 1}</td>
      <td>${escapeHtml(item.description)}</td>
      <td class="right">${formatMoney(item.quantity)}</td>
      <td class="center">${escapeHtml(item.unit)}</td>
      <td class="right">${formatMoney(item.unitPrice)}</td>
      <td class="right">${formatMoney(item.quantity * item.unitPrice)}</td>
    </tr>
  `).join("");

  const attachmentRows = claim.attachments.map((attachment) => `
    <li>
      <span>${attachment.present ? "☑" : "☐"}</span>
      ${escapeHtml(attachment.name)}
      ${attachment.required ? "<strong>บังคับ</strong>" : ""}
    </li>
  `).join("");

  const signatures = signatureLabels.map((label) => `
    <div class="signature">
      <div class="line"></div>
      <strong>${escapeHtml(label)}</strong>
      <span>วันที่ ____ / ____ / ______</span>
    </div>
  `).join("");

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(claim.docNo)} - ${escapeHtml(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    body { margin: 0; background: #f3f4f6; color: #111827; font-family: "Sarabun", "Noto Sans Thai", Tahoma, Arial, sans-serif; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 13mm; }
    .header { display: grid; grid-template-columns: 1fr auto; gap: 18px; border-bottom: 2px solid #111827; padding-bottom: 12px; }
    .company h1 { margin: 0; font-size: 19px; line-height: 1.25; }
    .company p { margin: 3px 0 0; color: #4b5563; font-size: 11px; line-height: 1.45; }
    .doc-box { min-width: 190px; border: 1px solid #111827; padding: 9px; text-align: right; }
    .doc-box h2 { margin: 0 0 7px; font-size: 17px; }
    .doc-box p { margin: 3px 0; font-size: 12px; }
    .section { margin-top: 14px; }
    .section-title { margin: 0 0 8px; padding: 6px 8px; background: #111827; color: #fff; font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px 16px; font-size: 12px; }
    .grid div { min-height: 20px; border-bottom: 1px solid #d1d5db; padding-bottom: 3px; }
    .grid span { color: #6b7280; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #f3f4f6; color: #374151; font-weight: 800; }
    th, td { border: 1px solid #d1d5db; padding: 6px; vertical-align: top; }
    .right { text-align: right; }
    .center { text-align: center; }
    .summary { display: grid; grid-template-columns: 1fr 240px; gap: 16px; align-items: start; }
    .amount-text { min-height: 70px; border: 1px solid #d1d5db; padding: 10px; font-size: 13px; font-weight: 800; line-height: 1.6; }
    .summary-table td:first-child { color: #4b5563; font-weight: 700; }
    .summary-table .net td { background: #fff7ed; color: #9a3412; font-size: 13px; font-weight: 900; }
    .attachments { margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 14px; list-style: none; font-size: 11px; }
    .attachments li { border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    .attachments span { margin-right: 6px; font-weight: 900; }
    .attachments strong { margin-left: 6px; color: #dc2626; font-size: 10px; }
    .remarks { min-height: 42px; border: 1px solid #d1d5db; padding: 8px; font-size: 11px; line-height: 1.5; }
    .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 34px; text-align: center; }
    .line { height: 42px; border-bottom: 1px solid #111827; margin-bottom: 7px; }
    .signature strong { display: block; font-size: 11px; }
    .signature span { display: block; margin-top: 5px; color: #6b7280; font-size: 10px; }
    @media print {
      body { background: #fff; }
      .page { width: auto; min-height: auto; margin: 0; padding: 0; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="header">
      <div class="company">
        <h1>บริษัท พิชยมงคล คอนสตรัคชั่น จำกัด</h1>
        <p>276/1 ซอยพุทธบูชา 36 แขวงบางมด เขตทุ่งครุ กรุงเทพมหานคร 10140</p>
        <p>เลขประจำตัวผู้เสียภาษี 0125557002609 | ธนาคารกสิกรไทย 065-1-18659-5</p>
      </div>
      <div class="doc-box">
        <h2>${escapeHtml(title)}</h2>
        <p><strong>เลขที่:</strong> ${escapeHtml(claim.docNo)}</p>
        <p><strong>วันที่:</strong> ${escapeHtml(formatThaiDate(claim.createdDate))}</p>
      </div>
    </header>

    <section class="section">
      <h3 class="section-title">ข้อมูลเอกสาร</h3>
      <div class="grid">
        <div><span>โครงการ/ไซต์:</span> ${escapeHtml(claim.projectName || claim.siteName)}</div>
        <div><span>สถานะ:</span> ${escapeHtml(PAYMENT_STATUS_LABELS[claim.status])}</div>
        <div><span>ผู้จัดทำ:</span> ${escapeHtml(claim.preparedBy)}</div>
        <div><span>ประเภท:</span> ${escapeHtml(PAYMENT_TYPE_LABELS[claim.type])}</div>
        <div><span>ผู้รับเงิน:</span> ${escapeHtml(claim.payeeName)}</div>
        <div><span>ประเภทผู้รับ:</span> ${escapeHtml(claim.payeeKind)}</div>
        <div><span>ธนาคาร:</span> ${escapeHtml(claim.bankName || "-")}</div>
        <div><span>เลขบัญชี:</span> ${escapeHtml(claim.accountNoMasked || "-")}</div>
        <div><span>งวด/ช่วงวันที่:</span> ${escapeHtml(claim.payPeriod || claim.installment || "-")}</div>
        <div><span>กำหนดจ่าย:</span> ${escapeHtml(formatThaiDate(claim.dueDate))}</div>
      </div>
    </section>

    <section class="section">
      <h3 class="section-title">รายการ</h3>
      <table>
        <thead>
          <tr>
            <th style="width: 38px;">ลำดับ</th>
            <th>รายละเอียด</th>
            <th style="width: 72px;">จำนวน</th>
            <th style="width: 60px;">หน่วย</th>
            <th style="width: 90px;">ราคา/หน่วย</th>
            <th style="width: 95px;">รวม</th>
          </tr>
        </thead>
        <tbody>${itemRows || `<tr><td colspan="6" class="center">ไม่มีรายการ</td></tr>`}</tbody>
      </table>
    </section>

    <section class="section summary">
      <div>
        <h3 class="section-title">ยอดสุทธิเป็นตัวอักษร</h3>
        <div class="amount-text">${escapeHtml(numberToThaiBahtText(claim.netPayable))}</div>
      </div>
      <div>
        <h3 class="section-title">สรุปยอดเงิน</h3>
        <table class="summary-table">
          <tbody>
            <tr><td>ยอดรวม</td><td class="right">${formatMoney(claim.grossAmount)}</td></tr>
            <tr><td>VAT</td><td class="right">${formatMoney(claim.vatAmount)}</td></tr>
            <tr><td>หัก WHT</td><td class="right">${formatMoney(claim.whtAmount)}</td></tr>
            <tr><td>หัก Retention</td><td class="right">${formatMoney(claim.retentionAmount)}</td></tr>
            <tr><td>หักรวม</td><td class="right">${formatMoney(deductionTotal)}</td></tr>
            <tr class="net"><td>ยอดสุทธิที่โอน</td><td class="right">${formatMoney(claim.netPayable)}</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <h3 class="section-title">เอกสารแนบ</h3>
      <ul class="attachments">${attachmentRows}</ul>
    </section>

    <section class="section">
      <h3 class="section-title">หมายเหตุ</h3>
      <div class="remarks">${escapeHtml(claim.remarks || "-")}</div>
    </section>

    <section class="signatures">${signatures}</section>
  </main>
</body>
</html>`;
}

export function buildAccountingEmail(claim: PaymentClaim, sender?: {
  name?: string;
  position?: string;
  phone?: string;
  urgency?: "ปกติ" | "เร่งด่วน";
}) {
  const urgency = sender?.urgency || "ปกติ";
  const period = claim.payPeriod || claim.installment || "-";
  const attachments = claim.attachments.map((attachment) => (
    `${attachment.present ? "ครบ" : "ยังไม่ครบ"} - ${attachment.name}${attachment.required ? " (บังคับ)" : ""}`
  ));
  const missingRequired = claim.attachments.filter((attachment) => attachment.required && !attachment.present);
  const subjectPrefix = urgency === "เร่งด่วน" ? "[เร่งด่วน] " : "";
  const subject = `${subjectPrefix}เบิกเงิน${PAYMENT_TYPE_LABELS[claim.type]} : ${claim.siteName} ${claim.payeeName}`;
  const body = [
    "เรียน ฝ่ายบัญชี",
    "",
    `ขอเบิกเงิน${PAYMENT_TYPE_LABELS[claim.type]} สำหรับ ${claim.payeeName} ไซต์ ${claim.siteName}`,
    `เลขที่เอกสาร: ${claim.docNo}`,
    `รายละเอียด: ${claim.description}`,
    `งวด/ช่วงวันที่: ${period}`,
    `ยอดสุทธิที่ขอโอน: ${formatMoney(claim.netPayable)} บาท (${numberToThaiBahtText(claim.netPayable)})`,
    `ธนาคาร: ${claim.bankName || "-"} เลขบัญชี: ${claim.accountNoMasked || "-"} ชื่อบัญชี: ${claim.payeeName}`,
    `ต้องการให้โอนภายใน: ${formatThaiDate(claim.dueDate)}`,
    `ความเร่งด่วน: ${urgency}`,
    "",
    "ไฟล์แนบ/เอกสารประกอบ:",
    ...attachments.map((attachment, index) => `${index + 1}. ${attachment}`),
    "",
    missingRequired.length
      ? `หมายเหตุ: ยังขาดเอกสารบังคับ ${missingRequired.map((item) => item.name).join(", ")} กรุณาตรวจสอบก่อนส่งจริง`
      : "ตรวจสอบเบื้องต้นแล้ว เอกสารบังคับครบถ้วน",
    claim.remarks ? `หมายเหตุเพิ่มเติม: ${claim.remarks}` : "",
    "",
    "ขอบคุณครับ/ค่ะ",
    sender?.name || claim.preparedBy,
    sender?.position || "SE / Engineering",
    sender?.phone ? `โทร ${sender.phone}` : "",
  ].filter((line) => line !== "").join("\n");

  return {
    subject,
    body,
    checklist: attachments,
    missingRequired: missingRequired.map((attachment) => attachment.name),
  };
}

export function buildFollowupEmail(claim: PaymentClaim, sender?: {
  name?: string;
  phone?: string;
  originalEmailDate?: string;
  reasonUrgent?: string;
}) {
  const created = new Date(`${claim.createdDate}T00:00:00+07:00`);
  const today = new Date(`${todayBangkok()}T00:00:00+07:00`);
  const daysPending = Number.isNaN(created.getTime())
    ? 0
    : Math.max(0, Math.floor((today.getTime() - created.getTime()) / 86400000));
  const subject = `[Reminder] เบิกเงิน${PAYMENT_TYPE_LABELS[claim.type]} : ${claim.siteName} — รอดำเนินการ ${daysPending} วัน`;
  const body = [
    "เรียน ฝ่ายบัญชี",
    "",
    `ขอติดตามรายการเบิกเงิน ${claim.docNo} (${PAYMENT_TYPE_LABELS[claim.type]}) ที่ส่งไว้สำหรับ ${claim.payeeName}`,
    `ยอดสุทธิ: ${formatMoney(claim.netPayable)} บาท (${numberToThaiBahtText(claim.netPayable)})`,
    `สถานะปัจจุบัน: ${PAYMENT_STATUS_LABELS[claim.status]}`,
    `วันที่ส่ง/สร้างรายการเดิม: ${sender?.originalEmailDate || formatThaiDate(claim.createdDate)}`,
    `จำนวนวันที่รอดำเนินการ: ${daysPending} วัน`,
    sender?.reasonUrgent ? `เหตุผลเร่งด่วน: ${sender.reasonUrgent}` : "",
    "",
    "รบกวนช่วยตรวจสอบและแจ้งความคืบหน้าการโอนเงินให้ด้วยครับ/ค่ะ",
    "",
    "ขอบคุณครับ/ค่ะ",
    sender?.name || claim.preparedBy,
    sender?.phone ? `โทร ${sender.phone}` : "",
  ].filter((line) => line !== "").join("\n");

  return {
    subject,
    body,
    daysPending,
  };
}

export function maskAccount(account?: string) {
  const digits = String(account || "").replace(/\D/g, "");
  if (digits.length <= 4) return account || "-";
  return `${digits.slice(0, 3)}-xxx-${digits.slice(-4)}`;
}

export function maskThaiId(id?: string) {
  const digits = String(id || "").replace(/\D/g, "");
  if (digits.length < 8) return id || "-";
  return `${digits.slice(0, 1)}-${digits.slice(1, 5)}-xxxxx-${digits.slice(-2, -1)}-${digits.slice(-1)}`;
}

function claim(input: Omit<PaymentClaim, "grossAmount" | "vatAmount" | "whtAmount" | "retentionAmount" | "netPayable"> & {
  vatAmount?: number;
  whtRate?: number;
  retentionRate?: number;
}) {
  const totals = calculatePaymentTotals({
    type: input.type,
    items: input.items,
    vatAmount: input.vatAmount,
    whtRate: input.whtRate,
    retentionRate: input.retentionRate,
  });

  return {
    ...input,
    ...totals,
  };
}

export function getMockPaymentClaims(project: {
  project_id: string;
  name?: string;
  client?: string;
}) {
  const siteId = project.project_id || "PMC-2026-03";
  const siteName = project.name || siteId;
  const projectName = project.client ? `${siteName} (${project.client})` : siteName;

  return [
    claim({
      id: "claim-001",
      docNo: "PCF-230469-001",
      type: "PETTY_CASH",
      status: "SUBMITTED_TO_ACCOUNTING",
      siteId,
      siteName,
      projectName,
      preparedBy: "นาย ณัฐกิจ เหมจินดา",
      payeeName: "นาย ณัฐกิจ เหมจินดา",
      payeeKind: "พนักงาน",
      payeeIdMasked: maskThaiId("1102170009849"),
      bankName: "กสิกรไทย",
      accountNoMasked: maskAccount("1853739444"),
      createdDate: "2026-04-23",
      dueDate: "2026-04-24",
      description: "เบิกเงินค่างานปรับบนพื้น self ชั้น 2 และบันได",
      remarks: "อ้างอิงอีเมลขอเบิกเงิน ส่งบัญชีพร้อมใบเสนอราคา",
      attachments: [
        { name: "ใบเสนอราคา", required: true, present: true },
        { name: "รูปถ่ายหน้างาน", required: false, present: true },
        { name: "บัตรประชาชนผู้รับเงิน", required: true, present: true },
      ],
      items: [
        { description: "ค่างานปรับพื้น self ชั้น 2 และบันได", quantity: 1, unit: "LS", unitPrice: 10717.2 },
      ],
    }),
    claim({
      id: "claim-002",
      docNo: "DCW-240469-001",
      type: "DC_WORKER",
      status: "UNDER_REVIEW",
      siteId,
      siteName,
      projectName,
      preparedBy: "SE หน้างาน",
      payeeName: "ช่างสมชาย งานสี",
      payeeKind: "ช่าง DC",
      payeeIdMasked: maskThaiId("1234567890123"),
      bankName: "ไทยพาณิชย์",
      accountNoMasked: maskAccount("4561237890"),
      createdDate: "2026-04-24",
      dueDate: "2026-04-26",
      payPeriod: "16-23 เม.ย. 2569",
      description: "ค่าแรงช่างสีรายวัน ชั้น 1-2",
      attachments: [
        { name: "บัตรประชาชนช่าง", required: true, present: true },
        { name: "รายการวัดงาน/วันทำงาน", required: true, present: true },
        { name: "รูปถ่ายผลงาน", required: true, present: false },
      ],
      items: [
        { description: "ทาสีภายใน ชั้น 1", quantity: 4, unit: "วัน", unitPrice: 850 },
        { description: "เก็บงานสีบันได", quantity: 2, unit: "วัน", unitPrice: 850 },
      ],
    }),
    claim({
      id: "claim-003",
      docNo: "SUB-270469-001",
      type: "SUBCONTRACTOR",
      status: "APPROVED",
      siteId,
      siteName,
      projectName,
      preparedBy: "PM โครงการ",
      payeeName: "ทีมช่างตู้ LOAD CENTER",
      payeeKind: "ผู้รับเหมา",
      payeeIdMasked: maskThaiId("3100900000000"),
      bankName: "กรุงไทย",
      accountNoMasked: maskAccount("9988776655"),
      createdDate: "2026-04-27",
      dueDate: "2026-04-30",
      installment: "งวดที่ 1",
      description: "งานเพิ่ม-ลด ตู้ LOAD CENTER ตามเอกสารตรวจงาน",
      attachments: [
        { name: "สัญญา/ใบเสนอราคา", required: true, present: true },
        { name: "ใบวัดงาน", required: true, present: true },
        { name: "รูปถ่ายงาน", required: true, present: true },
        { name: "บัตรประชาชน/หนังสือรับรอง", required: true, present: true },
      ],
      items: [
        { description: "ตู้ LOAD CENTER", quantity: 1, unit: "ตู้", unitPrice: 5375 },
        { description: "Main Breaker และอุปกรณ์ประกอบ", quantity: 1, unit: "ชุด", unitPrice: 1785 },
        { description: "ติดตั้ง/ทดสอบระบบ", quantity: 1, unit: "LS", unitPrice: 2500 },
      ],
    }),
    claim({
      id: "claim-004",
      docNo: "PCF-280469-002",
      type: "ADVANCE_CASH",
      status: "DRAFT",
      siteId,
      siteName,
      projectName,
      preparedBy: "SE หน้างาน",
      payeeName: "SE หน้างาน",
      payeeKind: "พนักงาน",
      bankName: "กสิกรไทย",
      accountNoMasked: maskAccount("0651186595"),
      createdDate: "2026-04-28",
      dueDate: "2026-04-28",
      description: "ขอเบิกเงินสดล่วงหน้าเพื่อซื้อวัสดุซ่อมแซมท่อน้ำ",
      remarks: "ต้องคืนใบเสร็จและใบสำคัญจ่ายภายใน 7 วัน",
      attachments: [
        { name: "รายละเอียดประมาณการ", required: true, present: true },
        { name: "อนุมัติ PM", required: true, present: false },
      ],
      items: [
        { description: "วัสดุซ่อมแซมท่อน้ำและอุปกรณ์", quantity: 1, unit: "ชุด", unitPrice: 6500 },
      ],
    }),
    claim({
      id: "claim-005",
      docNo: "DCW-300469-002",
      type: "DC_BATCH",
      status: "TRANSFERRED",
      siteId,
      siteName,
      projectName,
      preparedBy: "SE หน้างาน",
      payeeName: "ชุดค่าแรงช่าง DC 3 คน",
      payeeKind: "ช่าง DC",
      bankName: "หลายธนาคาร",
      accountNoMasked: "รายการโอน 3 บัญชี",
      createdDate: "2026-04-30",
      dueDate: "2026-05-02",
      payPeriod: "24-30 เม.ย. 2569",
      description: "ค่าแรงช่าง DC หลายคน ประจำรอบปลายเดือน",
      attachments: [
        { name: "บัตรประชาชนช่าง", required: true, present: true },
        { name: "รายการวัดงาน/วันทำงาน", required: true, present: true },
        { name: "Payment transfer list", required: true, present: true },
      ],
      items: [
        { description: "ช่างสี 2 คน", quantity: 10, unit: "วัน", unitPrice: 850 },
        { description: "ช่างฉาบ 1 คน", quantity: 5, unit: "วัน", unitPrice: 900 },
      ],
    }),
    claim({
      id: "claim-006",
      docNo: "SUB-020569-002",
      type: "SUBCONTRACTOR",
      status: "NEEDS_MORE_INFO",
      siteId,
      siteName,
      projectName,
      preparedBy: "PM โครงการ",
      payeeName: "ผู้รับเหมางานสกิมสี",
      payeeKind: "ผู้รับเหมา",
      bankName: "กรุงเทพ",
      accountNoMasked: maskAccount("1234567890"),
      createdDate: "2026-05-02",
      dueDate: "2026-05-04",
      installment: "งวดที่ 2",
      description: "ค่างวดงานสกิมและสีภายใน ชั้น 1-2",
      remarks: "บัญชีขอข้อมูลเพิ่มเพราะขาดใบวัดงานฉบับลงชื่อ",
      attachments: [
        { name: "สัญญา", required: true, present: true },
        { name: "ใบวัดงานลงชื่อ", required: true, present: false },
        { name: "รูปถ่ายงาน", required: true, present: true },
        { name: "บัตรประชาชน/หนังสือรับรอง", required: true, present: true },
      ],
      items: [
        { description: "งานสกิมผนังภายใน", quantity: 120, unit: "ตร.ม.", unitPrice: 85 },
        { description: "งานสีภายใน", quantity: 120, unit: "ตร.ม.", unitPrice: 95 },
      ],
    }),
  ];
}

export function getMissingAttachments(claim: PaymentClaim) {
  return claim.attachments.filter((attachment) => attachment.required && !attachment.present);
}

export function getPendingReason(claim: PaymentClaim) {
  const missing = getMissingAttachments(claim);
  if (claim.status === "REJECTED") return claim.remarks || "ต้องแก้ไขเอกสารก่อนส่งใหม่";
  if (claim.status === "NEEDS_MORE_INFO") return claim.remarks || "บัญชีขอเอกสาร/ข้อมูลเพิ่มเติม";
  if (missing.length > 0) return `ขาดเอกสาร: ${missing.map((item) => item.name).join(", ")}`;
  if (claim.status === "DRAFT") return "รอ SE ตรวจข้อมูลและส่งบัญชี";
  if (claim.status === "SUBMITTED_TO_ACCOUNTING") return "รอบัญชีรับเรื่อง";
  if (claim.status === "UNDER_REVIEW") return "บัญชีกำลังตรวจเอกสาร";
  if (claim.status === "APPROVED") return "รอบันทึกการโอน";
  if (claim.status === "TRANSFERRED") return "โอนแล้ว รอปิดรายการ";
  return "ไม่มี action ค้าง";
}
