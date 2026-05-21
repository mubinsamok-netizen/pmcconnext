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
  acknowledgement_token?: string;
  acknowledgement_url?: string;
  sent_to_customer_at?: string;
  line_group_id?: string;
  line_message?: string;
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

export function createMemoAcknowledgementToken() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid.replace(/-/g, "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

export function buildMemoAcknowledgementLineMessage({
  projectName,
  projectId,
  documentNo,
  title,
}: {
  projectName: string;
  projectId: string;
  documentNo: string;
  title: string;
}) {
  return [
    "แจ้ง Memo / หนังสือแจ้งให้ลูกค้ารับทราบ",
    `โครงการ: ${projectName || projectId}`,
    documentNo ? `เลขที่เอกสาร: ${documentNo}` : "",
    `เรื่อง: ${title}`,
    "กรุณาเปิดรายการและกดรับทราบในลิงก์ครับ",
  ].filter(Boolean).join("\n");
}

export function buildMemoAcknowledgementLineFlex({
  projectName,
  projectId,
  documentNo,
  memoType,
  title,
  issueDate,
  detail,
  pdfUrl,
  acknowledgementUrl,
}: {
  projectName: string;
  projectId: string;
  documentNo: string;
  memoType: string;
  title: string;
  issueDate: string;
  detail: string;
  pdfUrl: string;
  acknowledgementUrl: string;
}) {
  const preview = detail.length > 118 ? `${detail.slice(0, 115)}...` : detail;
  const actions = [
    {
      type: "button",
      style: "primary",
      color: "#0f8a7a",
      action: {
        type: "uri",
        label: "รับทราบ Memo",
        uri: acknowledgementUrl,
      },
    },
  ];
  if (pdfUrl) {
    actions.push({
      type: "button",
      style: "secondary",
      color: "#111827",
      action: {
        type: "uri",
        label: "เปิด PDF Memo",
        uri: pdfUrl,
      },
    });
  }

  return {
    type: "flex",
    altText: `Memo: ${title}`,
    contents: {
      type: "bubble",
      size: "mega",
      styles: {
        header: { backgroundColor: "#0f172a" },
        footer: { backgroundColor: "#ffffff" },
      },
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "18px",
        contents: [
          { type: "text", text: "PMC CONNEXT MEMO", color: "#7dd3fc", size: "xs", weight: "bold" },
          { type: "text", text: "หนังสือแจ้งให้รับทราบ", color: "#ffffff", size: "xl", weight: "bold", wrap: true, margin: "sm" },
          { type: "text", text: documentNo || projectId, color: "#fef3c7", size: "sm", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "18px",
        spacing: "md",
        contents: [
          { type: "text", text: projectName || projectId, size: "lg", weight: "bold", color: "#111827", wrap: true },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              lineFlexInfo("ประเภท", memoType || "-"),
              lineFlexInfo("วันที่แจ้ง", issueDate || "-"),
              lineFlexInfo("สถานะ", "รอลูกค้ารับทราบ"),
            ],
          },
          { type: "separator", margin: "sm" },
          { type: "text", text: "เรื่อง", size: "xs", color: "#64748b", weight: "bold" },
          { type: "text", text: title || "-", size: "md", color: "#111827", weight: "bold", wrap: true },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#fff7ed",
            cornerRadius: "8px",
            paddingAll: "12px",
            contents: [
              { type: "text", text: "รายละเอียดโดยย่อ", size: "xs", color: "#ea580c", weight: "bold" },
              { type: "text", text: preview || "-", size: "sm", color: "#7c2d12", wrap: true, margin: "xs" },
            ],
          },
          { type: "text", text: "กรุณาเปิดรายการและกดรับทราบ เพื่อเก็บเป็นหลักฐานในระบบครับ", size: "xs", color: "#475569", wrap: true },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "16px",
        contents: actions,
      },
    },
  };
}

export function buildMemoAcknowledgedLineFlex({
  projectName,
  projectId,
  documentNo,
  title,
  acknowledgedBy,
  acknowledgedAt,
  pdfUrl,
}: {
  projectName: string;
  projectId: string;
  documentNo: string;
  title: string;
  acknowledgedBy: string;
  acknowledgedAt: string;
  pdfUrl: string;
}) {
  return {
    type: "flex",
    altText: `Memo acknowledged: ${title}`,
    contents: {
      type: "bubble",
      size: "mega",
      styles: { header: { backgroundColor: "#0f172a" } },
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "18px",
        contents: [
          { type: "text", text: "PMC CONNEXT MEMO", color: "#7dd3fc", size: "xs", weight: "bold" },
          { type: "text", text: "ลูกค้ารับทราบ Memo แล้ว", color: "#ffffff", size: "xl", weight: "bold", wrap: true, margin: "sm" },
          { type: "text", text: documentNo || projectId, color: "#fef3c7", size: "sm", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "18px",
        spacing: "md",
        contents: [
          { type: "text", text: projectName || projectId, size: "lg", weight: "bold", color: "#111827", wrap: true },
          lineFlexInfo("เรื่อง", title || "-"),
          lineFlexInfo("ผู้รับทราบ", acknowledgedBy || "-"),
          lineFlexInfo("เวลา", acknowledgedAt || "-"),
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#ecfdf5",
            cornerRadius: "8px",
            paddingAll: "12px",
            contents: [
              { type: "text", text: "สถานะ", size: "xs", color: "#047857", weight: "bold" },
              { type: "text", text: "รับทราบแล้ว และบันทึกหลักฐานลง PDF เรียบร้อย", size: "sm", color: "#064e3b", weight: "bold", wrap: true, margin: "xs" },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        contents: pdfUrl ? [{
          type: "button",
          style: "secondary",
          color: "#111827",
          action: { type: "uri", label: "เปิด PDF Memo", uri: pdfUrl },
        }] : [],
      },
    },
  };
}

function lineFlexInfo(label: string, value: string) {
  return {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      { type: "text", text: label, color: "#64748b", size: "xs", flex: 3 },
      { type: "text", text: value || "-", color: "#111827", size: "sm", weight: "bold", wrap: true, flex: 6 },
    ],
  };
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
  evidence = [],
}: {
  memo: MemoRecord;
  project: Record<string, string | number | undefined>;
  logoUrl: string;
  evidence?: MemoEvidenceRecord[];
}) {
  const extensionDays = Math.max(0, Math.round(numberValue(memo.extension_days)));
  const hasTimeImpact = isTrueText(memo.has_time_impact);
  const requiresAck = isTrueText(memo.requires_customer_ack);
  const location = [project.address, project.district, project.province].filter(Boolean).join(" ");
  const attachments = parseMemoAttachments(memo.attachments_json);
  const memoEvidence = evidence.filter((item) => String(item.memo_id || "") === String(memo.memo_id || ""));
  const acknowledgementBy = memo.acknowledged_by || memoEvidence[0]?.acknowledged_by || memo.customer_name || project.client || "-";
  const acknowledgementDate = memo.acknowledged_date || memoEvidence[0]?.acknowledged_date || "";
  const acknowledgementChannel = memo.acknowledged_channel || memoEvidence[0]?.channel || "";
  const acknowledgementNote = memo.acknowledgement_note || memoEvidence[0]?.notes || "";
  const attachmentImages = attachments.filter((item) => String(item.mime_type || "").startsWith("image/") && item.file_url);
  const evidenceImages = memoEvidence.filter((item) => String(item.mime_type || "").startsWith("image/") && item.file_url);
  const supportingFiles = [
    ...attachments.map((item) => ({
      title: item.file_name || item.file_url || "-",
      meta: item.mime_type || "Attachment",
    })),
    ...memoEvidence.map((item) => ({
      title: item.file_name || item.file_url || "-",
      meta: [item.channel, item.acknowledged_by, formatThaiDate(item.acknowledged_date)].filter(Boolean).join(" / ") || "Acknowledgement evidence",
    })),
  ];
  const renderEvidenceImage = (item: MemoAttachment | MemoEvidenceRecord, caption: string) => `
    <figure class="photo-card">
      <div class="photo-frame"><img src="${escapeHtml(item.file_url || "")}" alt="${escapeHtml(caption)}" /></div>
      <figcaption>${escapeHtml(caption)}</figcaption>
    </figure>
  `;

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(memo.document_no || "MEMO")}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-size: 12px; line-height: 1.48; font-family: Arial, "Tahoma", sans-serif; }
    .page { min-height: 267mm; border: 1px solid #d1d5db; padding: 18px 22px; background: #ffffff; }
    .memo-page { height: 267mm; display: flex; flex-direction: column; }
    .evidence-page { page-break-before: always; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; border-bottom: 2px solid #f97316; padding-bottom: 12px; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img { width: 132px; height: auto; object-fit: contain; }
    .brand-title { font-size: 16px; font-weight: 900; color: #0f172a; letter-spacing: 0; }
    .brand-subtitle { margin-top: 1px; color: #64748b; font-size: 11px; }
    .company-address { margin-top: 4px; color: #475569; font-size: 10px; line-height: 1.35; }
    .doc-box { min-width: 160px; border: 1px solid #cbd5e1; padding: 9px 11px; text-align: right; }
    .doc-label { color: #475569; font-size: 10px; font-weight: 800; text-transform: uppercase; }
    .doc-no { margin-top: 3px; font-size: 15px; font-weight: 900; color: #0f172a; }
    h1 { margin: 14px 0 10px; text-align: center; font-size: 22px; line-height: 1.2; color: #0f172a; }
    h2 { margin: 0 0 8px; font-size: 15px; color: #0f172a; }
    .memo-lines { border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; margin-top: 8px; }
    .memo-line { display: grid; grid-template-columns: 92px 1fr 84px 1fr; border-bottom: 1px solid #e5e7eb; min-height: 30px; }
    .memo-line:last-child { border-bottom: 0; }
    .memo-label { padding: 7px 8px; font-weight: 900; color: #0f172a; background: #f8fafc; }
    .memo-value { padding: 7px 10px; font-weight: 700; color: #111827; }
    .memo-value.full { grid-column: span 3; }
    .body-section { margin-top: 14px; }
    .body-section p { margin: 0 0 8px; text-align: justify; }
    .detail { white-space: pre-wrap; }
    .impact-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .impact-table th, .impact-table td { border: 1px solid #cbd5e1; padding: 7px 8px; vertical-align: top; }
    .impact-table th { width: 170px; text-align: left; background: #f8fafc; color: #0f172a; }
    .closing { margin-top: 12px; text-indent: 42px; }
    .signatures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 34px; margin-top: auto; padding-top: 20px; }
    .signature { text-align: center; min-height: 74px; }
    .signature-line { border-top: 1px solid #64748b; margin: 34px 18px 7px; }
    .footer { margin-top: 14px; border-top: 1px solid #e5e7eb; padding-top: 8px; color: #64748b; font-size: 10px; display: flex; justify-content: space-between; gap: 12px; }
    .page-title { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; border-bottom: 2px solid #f97316; padding-bottom: 10px; }
    .page-title h1 { margin: 0; text-align: left; font-size: 20px; }
    .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 12px; margin-top: 14px; }
    .summary-item { border: 1px solid #e5e7eb; padding: 8px 10px; min-height: 44px; }
    .label { color: #64748b; font-size: 10px; font-weight: 900; }
    .value { margin-top: 2px; font-weight: 800; color: #111827; }
    .file-list { margin: 8px 0 0; padding-left: 18px; color: #475569; }
    .evidence-section { margin-top: 14px; }
    .photo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 10px; }
    .photo-card { margin: 0; border: 1px solid #d1d5db; padding: 8px; min-height: 84mm; page-break-inside: avoid; }
    .photo-frame { height: 70mm; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #f8fafc; }
    .photo-frame img { width: 100%; height: 100%; object-fit: contain; }
    .photo-card figcaption { margin-top: 6px; color: #334155; font-size: 10px; font-weight: 700; }
    .empty-box { border: 1px dashed #cbd5e1; color: #64748b; padding: 18px; text-align: center; margin-top: 10px; }
  </style>
</head>
<body>
  <main class="page memo-page">
    <header class="header">
      <div class="brand">
        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="PMC CONNEXT" />` : ""}
        <div>
          <div class="brand-title">PICHAYAMONGKOL CONSTRUCTION CO., LTD.</div>
          <div class="brand-subtitle">Project Memo / บันทึกข้อความโครงการ</div>
          <div class="company-address">276/1 ซอยพุทธบูชา 36 แขวงบางมด เขตทุ่งครุ กรุงเทพมหานคร 10140</div>
        </div>
      </div>
      <div class="doc-box">
        <div class="doc-label">Document No.</div>
        <div class="doc-no">${escapeHtml(memo.document_no || "-")}</div>
      </div>
    </header>

    <h1>บันทึกข้อความ</h1>

    <section class="memo-lines">
      <div class="memo-line">
        <div class="memo-label">ที่</div>
        <div class="memo-value">${escapeHtml(memo.document_no || "-")}</div>
        <div class="memo-label">วันที่</div>
        <div class="memo-value">${escapeHtml(formatThaiDate(memo.issue_date))}</div>
      </div>
      <div class="memo-line">
        <div class="memo-label">เรื่อง</div>
        <div class="memo-value full">${escapeHtml(memo.title || "-")}</div>
      </div>
      <div class="memo-line">
        <div class="memo-label">เรียน</div>
        <div class="memo-value full">${escapeHtml(memo.customer_name || project.client || "-")}</div>
      </div>
      <div class="memo-line">
        <div class="memo-label">โครงการ</div>
        <div class="memo-value">${escapeHtml(project.name || project.project_id || "-")}</div>
        <div class="memo-label">อ้างอิง</div>
        <div class="memo-value">${escapeHtml(MEMO_RELATED_LABELS[String(memo.related_module || "")] || memo.related_module || "-")}${memo.related_ref ? ` / ${escapeHtml(memo.related_ref)}` : ""}</div>
      </div>
      <div class="memo-line">
        <div class="memo-label">สถานที่</div>
        <div class="memo-value">${escapeHtml(location || "-")}</div>
        <div class="memo-label">เกิดเหตุวันที่</div>
        <div class="memo-value">${escapeHtml(formatThaiDate(memo.event_date))}</div>
      </div>
    </section>

    <section class="body-section">
      <p>บริษัท พิชยมงคล คอนสตรัคชั่น จำกัด ขอเรียนแจ้งข้อมูลการดำเนินงานของโครงการตามรายละเอียดดังต่อไปนี้ เพื่อใช้เป็นบันทึกข้อความและหลักฐานประกอบการรับทราบร่วมกันระหว่างโครงการและผู้เกี่ยวข้อง</p>
      <div class="detail">${escapeHtml(memo.detail || "-")}</div>
      ${hasTimeImpact ? `<p class="detail"><strong>เหตุผลการขอเพิ่มเวลา:</strong> ${escapeHtml(memo.extension_reason || "-")}</p>` : ""}
      <table class="impact-table">
        <tr>
          <th>ประเภทบันทึกข้อความ</th>
          <td>${escapeHtml(MEMO_TYPE_LABELS[String(memo.memo_type || "")] || memo.memo_type || "-")}</td>
        </tr>
        <tr>
          <th>ต้องให้ลูกค้ารับทราบ</th>
          <td>${requiresAck ? "ใช่" : "ไม่ใช่"}</td>
        </tr>
        <tr>
          <th>ผลกระทบต่อระยะเวลา</th>
          <td>${hasTimeImpact ? `มีผลกระทบ ขอเพิ่มเวลา ${extensionDays} วัน` : "ไม่มีการขอเพิ่มเวลา"}</td>
        </tr>
        <tr>
          <th>เอกสารแนบ</th>
          <td>แสดงรายละเอียดภาพประกอบและหลักฐานการรับทราบในหน้า 2</td>
        </tr>
      </table>
      <p class="closing">จึงเรียนมาเพื่อโปรดทราบ และใช้เป็นหลักฐานประกอบการดำเนินงานของโครงการต่อไป</p>
    </section>

    <section class="signatures">
      <div class="signature">
        <div class="signature-line"></div>
        <strong>ผู้จัดทำ</strong><br />
        ${escapeHtml(memo.prepared_by_name || "")}<br />
        วันที่ ........../........../..........
      </div>
      <div class="signature">
        <div class="signature-line"></div>
        <strong>ลูกค้า / ผู้รับทราบ</strong><br />
        ${escapeHtml(memo.customer_name || project.client || "")}<br />
        วันที่ ........../........../..........
      </div>
    </section>

    <footer class="footer">
      <span>Generated by PMC CONNEXT</span>
      <span>Page 1 / 2</span>
    </footer>
  </main>

  <main class="page evidence-page">
    <section class="page-title">
      <div>
        <h1>ภาพประกอบ / หลักฐานประกอบและการรับทราบ</h1>
        <div class="brand-subtitle">${escapeHtml(project.name || project.project_id || "-")} | ${escapeHtml(memo.document_no || "-")}</div>
      </div>
      <div class="doc-box">
        <div class="doc-label">Document No.</div>
        <div class="doc-no">${escapeHtml(memo.document_no || "-")}</div>
      </div>
    </section>

    <section class="summary-grid">
      <div class="summary-item">
        <div class="label">ผู้รับทราบ</div>
        <div class="value">${escapeHtml(acknowledgementBy)}</div>
      </div>
      <div class="summary-item">
        <div class="label">วันที่รับทราบ</div>
        <div class="value">${escapeHtml(formatThaiDate(acknowledgementDate))}</div>
      </div>
      <div class="summary-item">
        <div class="label">ช่องทางรับทราบ</div>
        <div class="value">${escapeHtml(acknowledgementChannel || "-")}</div>
      </div>
      <div class="summary-item">
        <div class="label">หมายเหตุรับทราบ</div>
        <div class="value">${escapeHtml(acknowledgementNote || "-")}</div>
      </div>
    </section>

    <section class="evidence-section">
      <h2>รายการไฟล์ประกอบ</h2>
      ${supportingFiles.length > 0 ? `
        <ul class="file-list">
          ${supportingFiles.map((item) => `<li>${escapeHtml(item.title)}${item.meta ? ` <span>(${escapeHtml(item.meta)})</span>` : ""}</li>`).join("")}
        </ul>
      ` : `<div class="empty-box">ยังไม่มีไฟล์แนบหรือหลักฐานรับทราบ</div>`}
    </section>

    <section class="evidence-section">
      <h2>ภาพประกอบหน้างาน</h2>
      ${attachmentImages.length > 0 ? `
        <div class="photo-grid">
          ${attachmentImages.slice(0, 4).map((item) => renderEvidenceImage(item, item.file_name || "ภาพประกอบ")).join("")}
        </div>
      ` : `<div class="empty-box">ไม่มีภาพประกอบหน้างานในเอกสารนี้</div>`}
    </section>

    <section class="evidence-section">
      <h2>หลักฐานการรับทราบจากลูกค้า</h2>
      ${evidenceImages.length > 0 ? `
        <div class="photo-grid">
          ${evidenceImages.slice(0, 4).map((item) => renderEvidenceImage(item, `${item.file_name || "หลักฐานรับทราบ"}${item.acknowledged_by ? ` - ${item.acknowledged_by}` : ""}`)).join("")}
        </div>
      ` : memoEvidence.length > 0 ? `
        <ul class="file-list">
          ${memoEvidence.map((item) => `<li>${escapeHtml(item.file_name || "-")} / ${escapeHtml(item.channel || "-")} / ${escapeHtml(item.acknowledged_by || "-")} / ${escapeHtml(formatThaiDate(item.acknowledged_date))}</li>`).join("")}
        </ul>
      ` : `<div class="empty-box">ยังไม่มีหลักฐานการรับทราบจากลูกค้า</div>`}
    </section>

    <section class="signatures">
      <div class="signature">
        <div class="signature-line"></div>
        <strong>ผู้จัดทำ</strong><br />
        ${escapeHtml(memo.prepared_by_name || "")}<br />
        วันที่ ........../........../..........
      </div>
      <div class="signature">
        <div class="signature-line"></div>
        <strong>ลูกค้า / ผู้รับทราบ</strong><br />
        ${escapeHtml(memo.customer_name || project.client || "")}<br />
        วันที่ ........../........../..........
      </div>
    </section>

    <footer class="footer">
      <span>Generated by PMC CONNEXT</span>
      <span>Page 2 / 2 | ${escapeHtml(new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }))}</span>
    </footer>
  </main>
</body>
</html>`;
}
