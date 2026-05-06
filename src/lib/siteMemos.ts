export type MemoStatus = "draft" | "issued" | "sent" | "acknowledged" | "extension_approved" | "rejected" | "closed";
export type MemoType = "customer_notice" | "time_extension" | "site_impact" | "design_change" | "internal" | "other";
export type MemoRelatedModule = "schedule" | "defect" | "vo" | "payment" | "other";

export type MemoUploadPayload = {
  name?: string;
  type?: string;
  dataUrl?: string;
};

export type MemoAttachment = {
  file_id: string;
  file_name: string;
  file_url: string;
  mime_type: string;
};

export type MemoRecord = Record<string, string | number | undefined> & {
  memo_id: string;
  project_id: string;
  document_no?: string;
  memo_type?: string;
  related_module?: string;
  related_ref?: string;
  title?: string;
  event_date?: string;
  issue_date?: string;
  detail?: string;
  requires_customer_ack?: string;
  has_time_impact?: string;
  extension_days?: string | number;
  extension_reason?: string;
  status?: string;
  customer_name?: string;
  prepared_by_name?: string;
  prepared_by_email?: string;
  prepared_by_role?: string;
  attachments_json?: string;
  pdf_file_id?: string;
  pdf_url?: string;
  issued_at?: string;
  acknowledged_by?: string;
  acknowledged_channel?: string;
  acknowledged_date?: string;
  acknowledgement_note?: string;
  created_at?: string;
  updated_at?: string;
};

export type MemoEvidenceRecord = Record<string, string | number | undefined> & {
  evidence_id: string;
  memo_id: string;
  project_id: string;
  channel?: string;
  acknowledged_by?: string;
  acknowledged_date?: string;
  file_name?: string;
  file_id?: string;
  file_url?: string;
  mime_type?: string;
  notes?: string;
  uploaded_by_name?: string;
  uploaded_by_email?: string;
  created_at?: string;
};

export const MEMO_TYPE_LABELS: Record<string, string> = {
  customer_notice: "แจ้งลูกค้ารับทราบ",
  time_extension: "ขอขยายเวลา",
  site_impact: "แจ้งผลกระทบหน้างาน",
  design_change: "แจ้งเปลี่ยนแปลงแบบ/สเปก",
  internal: "แจ้งภายใน",
  other: "อื่น ๆ",
};

export const MEMO_RELATED_LABELS: Record<string, string> = {
  schedule: "แผนงาน",
  defect: "Defect",
  vo: "VO",
  payment: "Payment",
  other: "อื่น ๆ",
};

export const MEMO_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  sent: "Sent",
  acknowledged: "Customer Acknowledged",
  extension_approved: "Extension Approved",
  rejected: "Rejected",
  closed: "Closed",
};

export const MEMO_STATUS_STYLES: Record<string, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  issued: "border-blue-200 bg-blue-50 text-blue-700",
  sent: "border-amber-200 bg-amber-50 text-amber-700",
  acknowledged: "border-emerald-200 bg-emerald-50 text-emerald-700",
  extension_approved: "border-green-200 bg-green-50 text-green-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  closed: "border-gray-200 bg-gray-50 text-gray-700",
};

export function todayBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function textValue(value: unknown) {
  return String(value || "").trim();
}

export function numberValue(value: unknown) {
  const numeric = Number(String(value || "").replace(/,/g, "").trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

export function boolText(value: unknown) {
  const raw = String(value || "").toLowerCase();
  return raw === "true" || raw === "on" || raw === "1" || raw === "yes" ? "TRUE" : "FALSE";
}

export function isTrueText(value: unknown) {
  return String(value || "").toUpperCase() === "TRUE";
}

export function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value ?? []);
  } catch {
    return "[]";
  }
}

export function parseMemoAttachments(value?: string | number) {
  if (!value) return [] as MemoAttachment[];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.filter(Boolean) as MemoAttachment[] : [];
  } catch {
    return [];
  }
}

export function createMemoDocumentNo(projectId: string, memos: MemoRecord[]) {
  const prefix = `MEMO-${projectId}-`;
  const nextNo = memos
    .map((memo) => String(memo.document_no || ""))
    .filter((documentNo) => documentNo.startsWith(prefix))
    .map((documentNo) => Number(documentNo.slice(prefix.length)))
    .filter(Number.isFinite)
    .reduce((max, value) => Math.max(max, value), 0) + 1;
  return `${prefix}${String(nextNo).padStart(3, "0")}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatThaiDate(value?: string | number) {
  if (!value) return "-";
  const date = new Date(String(value).includes("T") ? String(value) : `${String(value)}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export function buildMemoPdfHtml({
  memo,
  project,
  logoUrl,
}: {
  memo: MemoRecord;
  project: Record<string, string | number | undefined>;
  logoUrl: string;
}) {
  const extensionDays = Math.max(0, Math.round(numberValue(memo.extension_days)));
  const hasTimeImpact = isTrueText(memo.has_time_impact);
  const requiresAck = isTrueText(memo.requires_customer_ack);
  const location = [project.address, project.district, project.province].filter(Boolean).join(" ");
  const attachments = parseMemoAttachments(memo.attachments_json);

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(memo.document_no || "MEMO")}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-size: 13px; line-height: 1.65; }
    .page { min-height: 267mm; border: 1px solid #e5e7eb; padding: 22px 26px; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; border-bottom: 3px solid #f97316; padding-bottom: 16px; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img { width: 138px; height: auto; object-fit: contain; }
    .brand-title { font-size: 18px; font-weight: 800; color: #0f172a; }
    .brand-subtitle { margin-top: 2px; color: #64748b; font-size: 12px; }
    .doc-box { min-width: 170px; border: 1px solid #fed7aa; background: #fff7ed; border-radius: 10px; padding: 10px 12px; text-align: right; }
    .doc-label { color: #ea580c; font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .doc-no { margin-top: 3px; font-size: 16px; font-weight: 900; color: #0f172a; }
    h1 { margin: 20px 0 6px; text-align: center; font-size: 24px; line-height: 1.2; color: #0f172a; }
    .subject { text-align: center; font-size: 16px; font-weight: 800; color: #334155; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 14px; margin-top: 22px; }
    .field { border: 1px solid #e5e7eb; border-radius: 10px; padding: 9px 11px; min-height: 54px; }
    .label { color: #64748b; font-size: 11px; font-weight: 800; }
    .value { margin-top: 2px; font-weight: 700; color: #111827; }
    .section { margin-top: 16px; border: 1px solid #e5e7eb; border-radius: 12px; padding: 13px 15px; }
    .section h2 { margin: 0 0 8px; font-size: 15px; color: #0f172a; }
    .detail { white-space: pre-wrap; }
    .impact { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
    .impact-card { border-radius: 12px; padding: 13px 15px; border: 1px solid #fed7aa; background: #fff7ed; }
    .impact-card.green { border-color: #bbf7d0; background: #f0fdf4; }
    .impact-value { font-size: 22px; font-weight: 900; color: #ea580c; }
    .green .impact-value { color: #047857; }
    .attachments { margin: 8px 0 0; padding-left: 18px; color: #475569; }
    .signatures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-top: 36px; }
    .signature { border-top: 1px solid #94a3b8; padding-top: 8px; text-align: center; min-height: 78px; }
    .footer { margin-top: 26px; border-top: 1px solid #e5e7eb; padding-top: 10px; color: #64748b; font-size: 11px; display: flex; justify-content: space-between; gap: 12px; }
  </style>
</head>
<body>
  <main class="page">
    <header class="header">
      <div class="brand">
        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="PMC CONNEXT" />` : ""}
        <div>
          <div class="brand-title">PICHAYAMONGKOL CONSTRUCTION CO., LTD.</div>
          <div class="brand-subtitle">Project Memo / บันทึกข้อความโครงการ</div>
        </div>
      </div>
      <div class="doc-box">
        <div class="doc-label">Document No.</div>
        <div class="doc-no">${escapeHtml(memo.document_no || "-")}</div>
      </div>
    </header>

    <h1>บันทึกข้อความ</h1>
    <div class="subject">${escapeHtml(memo.title || "-")}</div>

    <section class="grid">
      <div class="field"><div class="label">โครงการ</div><div class="value">${escapeHtml(project.name || project.project_id || "-")}</div></div>
      <div class="field"><div class="label">ลูกค้า / ผู้รับทราบ</div><div class="value">${escapeHtml(memo.customer_name || project.client || "-")}</div></div>
      <div class="field"><div class="label">ประเภท Memo</div><div class="value">${escapeHtml(MEMO_TYPE_LABELS[String(memo.memo_type || "")] || memo.memo_type || "-")}</div></div>
      <div class="field"><div class="label">เกี่ยวข้องกับ</div><div class="value">${escapeHtml(MEMO_RELATED_LABELS[String(memo.related_module || "")] || memo.related_module || "-")}${memo.related_ref ? ` / ${escapeHtml(memo.related_ref)}` : ""}</div></div>
      <div class="field"><div class="label">วันที่เกิดเหตุ</div><div class="value">${escapeHtml(formatThaiDate(memo.event_date))}</div></div>
      <div class="field"><div class="label">วันที่ออกเอกสาร</div><div class="value">${escapeHtml(formatThaiDate(memo.issue_date))}</div></div>
      <div class="field"><div class="label">ผู้จัดทำ</div><div class="value">${escapeHtml(memo.prepared_by_name || "-")}</div></div>
      <div class="field"><div class="label">สถานที่</div><div class="value">${escapeHtml(location || "-")}</div></div>
    </section>

    <section class="section">
      <h2>รายละเอียดเหตุการณ์ / ข้อความแจ้ง</h2>
      <div class="detail">${escapeHtml(memo.detail || "-")}</div>
    </section>

    <section class="impact">
      <div class="impact-card green">
        <div class="label">ต้องให้ลูกค้ารับทราบ</div>
        <div class="impact-value">${requiresAck ? "ใช่" : "ไม่ใช่"}</div>
      </div>
      <div class="impact-card">
        <div class="label">จำนวนวันที่ขอเพิ่ม</div>
        <div class="impact-value">${hasTimeImpact ? `${extensionDays} วัน` : "ไม่มี"}</div>
      </div>
    </section>

    ${hasTimeImpact ? `
      <section class="section">
        <h2>เหตุผลการขอเพิ่มเวลา</h2>
        <div class="detail">${escapeHtml(memo.extension_reason || "-")}</div>
      </section>
    ` : ""}

    <section class="section">
      <h2>เอกสาร / หลักฐานประกอบ</h2>
      ${attachments.length > 0 ? `
        <ul class="attachments">
          ${attachments.map((item) => `<li>${escapeHtml(item.file_name || item.file_url || "-")}</li>`).join("")}
        </ul>
      ` : `<div class="detail">-</div>`}
    </section>

    <section class="signatures">
      <div class="signature">
        <strong>ผู้จัดทำ</strong><br />
        ${escapeHtml(memo.prepared_by_name || "")}<br />
        วันที่ ........../........../..........
      </div>
      <div class="signature">
        <strong>ลูกค้า / ผู้รับทราบ</strong><br />
        ${escapeHtml(memo.customer_name || project.client || "")}<br />
        วันที่ ........../........../..........
      </div>
    </section>

    <footer class="footer">
      <span>Generated by PCM CONNEXT</span>
      <span>${escapeHtml(new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }))}</span>
    </footer>
  </main>
</body>
</html>`;
}
