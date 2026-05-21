export type CustomerDecisionRecord = Record<string, string | number | undefined> & {
  _rowIndex?: number;
  decision_id: string;
  project_id: string;
  document_no?: string;
  phase: string;
  title: string;
  decision_before: string;
  decision_status?: string;
  impact_if_changed: string;
  result_note?: string;
  evidence_note?: string;
  evidence_files_json?: string;
  notified_at?: string;
  notified_by_name?: string;
  notified_by_email?: string;
  line_group_id?: string;
  line_message?: string;
  decided_at?: string;
  decided_by?: string;
  pdf_file_id?: string;
  pdf_url?: string;
  issued_at?: string;
  issued_by_name?: string;
  issued_by_email?: string;
  approval_token?: string;
  approval_url?: string;
  order_index?: string | number;
  active?: string;
};

export type CustomerDecisionUploadPayload = {
  name?: string;
  type?: string;
  dataUrl?: string;
};

export type CustomerDecisionEvidenceFile = {
  file_id: string;
  file_name: string;
  file_url: string;
  mime_type: string;
  data_url?: string;
};

export const CUSTOMER_DECISION_PHASES = [
  "ก่อนเสาเข็ม",
  "ฐานราก",
  "โครงสร้าง",
  "ก่ออิฐ",
  "ฉาบปูน",
  "ปูกระเบื้อง",
  "ติดตั้งประตูหน้าต่าง",
  "ฝ้าเพดาน",
] as const;

export const CUSTOMER_DECISION_STATUSES = [
  "ยังไม่ถึงเวลา",
  "ต้องยืนยัน",
  "รอลูกค้า",
  "ส่งแจ้งเตือนแล้ว",
  "ยืนยันแล้ว",
  "เลยจุดตัดสินใจ",
] as const;

export const DEFAULT_CUSTOMER_DECISIONS = [
  {
    phase: "ก่อนเสาเข็ม",
    title: "ขยายเพิ่มหรือลดพื้นที่บ้าน",
    decision_before: "ก่อนตอก/เจาะเสาเข็ม",
    decision_status: "ยังไม่ถึงเวลา",
    impact_if_changed: "ต้องประเมินราคา/เวลาใหม่",
  },
  {
    phase: "ฐานราก",
    title: "สรุปแนวผนังก่ออิฐ",
    decision_before: "ก่อนงานฐานรากแล้วเสร็จ",
    decision_status: "ต้องยืนยัน",
    impact_if_changed: "อาจกระทบแบบ/โครงสร้าง/ระบบ",
  },
  {
    phase: "โครงสร้าง",
    title: "ย้ายตำแหน่งประตู หน้าต่าง และสุขภัณฑ์",
    decision_before: "ก่อนงานโครงสร้างแล้วเสร็จ",
    decision_status: "รอลูกค้า",
    impact_if_changed: "อาจต้องออกงานเพิ่ม-ลด",
  },
  {
    phase: "โครงสร้าง",
    title: "เปลี่ยนสีกระเบื้องหลังคา",
    decision_before: "ก่อนงานโครงสร้างแล้วเสร็จ",
    decision_status: "รอลูกค้า",
    impact_if_changed: "อาจกระทบการสั่งวัสดุ",
  },
  {
    phase: "ก่ออิฐ",
    title: "เพิ่ม-ลดจำนวนไฟฟ้า",
    decision_before: "ก่อนงานก่ออิฐแล้วเสร็จ",
    decision_status: "ต้องยืนยัน",
    impact_if_changed: "เปลี่ยนหลังเดินท่ออาจมีค่าแก้ไข",
  },
  {
    phase: "ฉาบปูน",
    title: "เปลี่ยนวัสดุปูผนังและพื้น",
    decision_before: "ก่อนงานฉาบปูนภายในแล้วเสร็จ",
    decision_status: "ยังไม่ถึงเวลา",
    impact_if_changed: "อาจกระทบราคา/ระยะเวลาจัดซื้อ",
  },
  {
    phase: "ปูกระเบื้อง",
    title: "เปลี่ยนรุ่น/ยี่ห้อสุขภัณฑ์",
    decision_before: "ก่อนงานปูกระเบื้องแล้วเสร็จ",
    decision_status: "ยังไม่ถึงเวลา",
    impact_if_changed: "อาจกระทบตำแหน่งท่อ/ขนาดติดตั้ง",
  },
  {
    phase: "ติดตั้งประตูหน้าต่าง",
    title: "เปลี่ยนวัสดุปูพื้นชั้นบน",
    decision_before: "ก่อนติดตั้งประตูหน้าต่างแล้วเสร็จ",
    decision_status: "ยังไม่ถึงเวลา",
    impact_if_changed: "อาจกระทบระดับพื้น/วงกบ",
  },
  {
    phase: "ฝ้าเพดาน",
    title: "เปลี่ยนสีตัวอาคาร",
    decision_before: "ก่อนงานฝ้าเพดานแล้วเสร็จ",
    decision_status: "ยังไม่ถึงเวลา",
    impact_if_changed: "อาจกระทบแผนสั่งสี/งานเก็บผิว",
  },
] as const;

export function createCustomerDecisionId() {
  return `CD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function createCustomerDecisionApprovalToken() {
  return `cda_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value ?? []);
  } catch {
    return "[]";
  }
}

export function parseDecisionEvidenceFiles(value?: string | number) {
  if (!value) return [] as CustomerDecisionEvidenceFile[];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.filter(Boolean) as CustomerDecisionEvidenceFile[] : [];
  } catch {
    return [];
  }
}

export function createCustomerDecisionDocumentNo(projectId: string, decisions: CustomerDecisionRecord[]) {
  const prefix = `DEC-${projectId}-`;
  const nextNo = decisions
    .map((decision) => String(decision.document_no || ""))
    .filter((documentNo) => documentNo.startsWith(prefix))
    .map((documentNo) => Number(documentNo.slice(prefix.length)))
    .filter(Number.isFinite)
    .reduce((max, value) => Math.max(max, value), 0) + 1;
  return `${prefix}${String(nextNo).padStart(3, "0")}`;
}

export function buildCustomerDecisionLineMessage({
  projectName,
  projectId,
  phase,
  title,
  decisionBefore,
  impactIfChanged,
}: {
  projectName: string;
  projectId: string;
  phase: string;
  title: string;
  decisionBefore: string;
  impactIfChanged: string;
}) {
  return [
    "แจ้งเตือนรายการที่ต้องตัดสินใจ",
    "",
    `โครงการ: ${projectName || projectId}`,
    `ช่วงงาน: ${phase}`,
    `รายการ: ${title}`,
    `ต้องตัดสินใจก่อน: ${decisionBefore}`,
    "",
    "ผลถ้าเปลี่ยนหลังจากนี้:",
    impactIfChanged,
    "",
    "รบกวนลูกค้ายืนยันในกลุ่มนี้ เพื่อให้ทีมงานดำเนินงานต่อได้ตามแผนครับ",
  ].filter(Boolean).join("\n");
}

export function buildCustomerDecisionLineFlex({
  projectName,
  projectId,
  documentNo,
  phase,
  status,
  title,
  decisionBefore,
  impactIfChanged,
  pdfUrl,
  evidenceUrl,
  approvalUrl,
  evidenceCount = 0,
}: {
  projectName: string;
  projectId: string;
  documentNo?: string;
  phase: string;
  status?: string;
  title: string;
  decisionBefore: string;
  impactIfChanged: string;
  pdfUrl?: string;
  evidenceUrl?: string;
  approvalUrl?: string;
  evidenceCount?: number;
}) {
  const footerContents = [
    ...(approvalUrl ? [{
      type: "button",
      style: "primary",
      color: "#0f766e",
      action: { type: "uri", label: "ยืนยันรายการนี้", uri: approvalUrl },
    }] : []),
    ...(pdfUrl ? [{
      type: "button",
      style: "primary",
      color: "#111827",
      action: { type: "uri", label: "เปิด PDF รายการ", uri: pdfUrl },
    }] : []),
    ...(evidenceUrl ? [{
      type: "button",
      style: "secondary",
      action: { type: "uri", label: "ดูหลักฐานแนบ", uri: evidenceUrl },
    }] : []),
  ];

  return {
    type: "flex",
    altText: `รายการต้องตัดสินใจ | ${projectName || projectId} | ${title}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0f172a",
        paddingAll: "18px",
        paddingBottom: "16px",
        contents: [
          { type: "text", text: "PMC CONNEXT DECISION REQUEST", color: "#7dd3fc", weight: "bold", size: "xs" },
          { type: "text", text: "รายการที่ต้องตัดสินใจ", color: "#ffffff", weight: "bold", size: "lg", margin: "xs" },
          { type: "text", text: documentNo || projectId, color: "#fef3c7", size: "sm", margin: "xs", wrap: true },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "18px",
        contents: [
          { type: "text", text: projectName || projectId, color: "#0f172a", weight: "bold", size: "lg", wrap: true },
          customerDecisionLineInfoRow("ช่วงงาน", phase || "-"),
          customerDecisionLineInfoRow("สถานะ", status || "ยังไม่ถึงเวลา"),
          customerDecisionLineInfoRow("ต้องตัดสินใจก่อน", decisionBefore || "-"),
          { type: "separator", margin: "md", color: "#e5e7eb" },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            margin: "md",
            contents: [
              { type: "text", text: "รายการขอให้ลูกค้ายืนยัน", color: "#64748b", size: "xs" },
              { type: "text", text: trimCustomerDecisionLineText(title || "-"), color: "#0f172a", weight: "bold", size: "sm", wrap: true },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            margin: "sm",
            backgroundColor: "#fff7ed",
            cornerRadius: "8px",
            paddingAll: "10px",
            contents: [
              { type: "text", text: "ผลถ้าเปลี่ยนหลังจากนี้", color: "#ea580c", size: "xs", weight: "bold" },
              { type: "text", text: trimCustomerDecisionLineText(impactIfChanged || "-"), color: "#9a3412", size: "sm", wrap: true },
            ],
          },
          {
            type: "text",
            text: "กรุณายืนยันในกลุ่มนี้ เพื่อให้ทีมงานดำเนินงานต่อได้ตามแผนครับ",
            color: "#475569",
            size: "xs",
            margin: "md",
            wrap: true,
          },
          ...(evidenceCount > 0 ? [{ type: "text", text: `แนบหลักฐาน ${evidenceCount} ไฟล์`, color: "#94a3b8", size: "xxs", margin: "sm" }] : []),
        ],
      },
      ...(footerContents.length > 0 ? {
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          paddingAll: "8px",
          contents: footerContents,
        },
      } : {}),
    },
  };
}

export function buildCustomerDecisionApprovedLineFlex({
  projectName,
  projectId,
  documentNo,
  title,
  decidedBy,
  decidedAt,
  pdfUrl,
}: {
  projectName: string;
  projectId: string;
  documentNo?: string;
  title: string;
  decidedBy: string;
  decidedAt: string;
  pdfUrl?: string;
}) {
  const approvedDate = decidedAt ? new Date(decidedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "-";
  return {
    type: "flex",
    altText: `ยืนยันรายการที่ต้องตัดสินใจแล้ว | ${projectName || projectId} | ${title}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#064e3b",
        paddingAll: "18px",
        paddingBottom: "16px",
        contents: [
          { type: "text", text: "PMC CONNEXT DECISION APPROVED", color: "#bbf7d0", weight: "bold", size: "xs" },
          { type: "text", text: "ลูกค้ายืนยันรายการแล้ว", color: "#ffffff", weight: "bold", size: "lg", margin: "xs", wrap: true },
          { type: "text", text: documentNo || projectId, color: "#dcfce7", size: "sm", margin: "xs", wrap: true },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "18px",
        contents: [
          { type: "text", text: projectName || projectId, color: "#0f172a", weight: "bold", size: "lg", wrap: true },
          customerDecisionLineInfoRow("รายการ", trimCustomerDecisionLineText(title || "-")),
          customerDecisionLineInfoRow("ผู้ยืนยัน", decidedBy || "-"),
          customerDecisionLineInfoRow("เวลา", approvedDate),
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            margin: "md",
            backgroundColor: "#f0fdf4",
            cornerRadius: "8px",
            paddingAll: "10px",
            contents: [
              { type: "text", text: "สถานะ", color: "#15803d", size: "xs", weight: "bold" },
              { type: "text", text: "ลูกค้ายืนยันรายการนี้เรียบร้อยแล้ว ทีมงานสามารถดำเนินงานต่อได้ตามแผน", color: "#166534", size: "sm", wrap: true },
            ],
          },
        ],
      },
      ...(pdfUrl ? {
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          paddingAll: "8px",
          contents: [{
            type: "button",
            style: "primary",
            color: "#111827",
            action: { type: "uri", label: "เปิด PDF รายการ", uri: pdfUrl },
          }],
        },
      } : {}),
    },
  };
}

function customerDecisionLineInfoRow(label: string, value: string) {
  return {
    type: "box",
    layout: "horizontal",
    margin: "sm",
    contents: [
      { type: "text", text: label, color: "#64748b", size: "xs", flex: 5 },
      { type: "text", text: value, color: "#0f172a", size: "sm", flex: 7, wrap: true },
    ],
  };
}

function trimCustomerDecisionLineText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 360 ? `${normalized.slice(0, 357)}...` : normalized;
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

export function buildCustomerDecisionPdfHtml({
  decision,
  project,
  logoUrl,
}: {
  decision: CustomerDecisionRecord;
  project: Record<string, string | number | undefined>;
  logoUrl: string;
}) {
  const location = [project.address, project.district, project.province].filter(Boolean).join(" ");
  const evidenceFiles = parseDecisionEvidenceFiles(decision.evidence_files_json);
  const evidenceImages = evidenceFiles.filter((item) => String(item.mime_type || "").startsWith("image/") && (item.data_url || item.file_url));
  const renderImage = (item: CustomerDecisionEvidenceFile) => `
    <figure class="photo-card">
      <div class="photo-frame"><img src="${escapeHtml(item.data_url || item.file_url || "")}" alt="${escapeHtml(item.file_name)}" /></div>
      <figcaption>${escapeHtml(item.file_name || "หลักฐานอ้างอิง")}</figcaption>
    </figure>
  `;

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(decision.document_no || "Customer Decision")}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-size: 11px; line-height: 1.45; font-family: Arial, "Tahoma", sans-serif; background: #fff; }
    .page { background: #fff; }
    .sheet { min-height: 273mm; border: 1px solid #cbd5e1; padding: 16px 18px 12px; display: flex; flex-direction: column; }
    .evidence-page { break-before: page; page-break-before: always; }
    .header { display: grid; grid-template-columns: 1fr 175px; gap: 14px; border-top: 6px solid #0f172a; border-bottom: 2px solid #f97316; padding: 12px 0 10px; }
    .brand { display: grid; grid-template-columns: 118px 1fr; gap: 14px; align-items: center; min-width: 0; }
    .brand img { width: 112px; max-height: 48px; object-fit: contain; }
    .brand-title { font-size: 15px; line-height: 1.2; font-weight: 900; color: #0f172a; letter-spacing: 0; }
    .brand-subtitle { margin-top: 3px; color: #64748b; font-size: 10px; }
    .company-address { margin-top: 5px; color: #475569; font-size: 9px; line-height: 1.35; }
    .doc-box { border: 1px solid #cbd5e1; background: #f8fafc; padding: 9px 10px; text-align: right; align-self: stretch; }
    .doc-label { color: #64748b; font-size: 8px; font-weight: 900; text-transform: uppercase; }
    .doc-no { margin-top: 4px; font-size: 14px; line-height: 1.2; font-weight: 900; color: #0f172a; }
    .doc-date { margin-top: 8px; color: #475569; font-size: 9px; font-weight: 700; }
    .title-block { margin: 12px 0 10px; text-align: center; }
    .title-block h1 { margin: 0; font-size: 22px; line-height: 1.15; color: #0f172a; font-weight: 900; }
    .title-block .en { margin-top: 3px; color: #64748b; font-size: 10px; font-weight: 800; text-transform: uppercase; }
    h2 { margin: 0 0 7px; font-size: 13px; color: #0f172a; }
    .section-title { margin-top: 10px; display: flex; align-items: center; gap: 8px; color: #0f172a; font-size: 13px; font-weight: 900; }
    .section-title:before { content: ""; width: 4px; height: 15px; background: #f97316; display: inline-block; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #cbd5e1; border-bottom: 0; }
    .summary-item { display: grid; grid-template-columns: 96px 1fr; min-height: 29px; border-bottom: 1px solid #cbd5e1; }
    .summary-item.full { grid-column: span 2; }
    .summary-label { background: #f1f5f9; border-right: 1px solid #cbd5e1; padding: 7px 8px; font-weight: 900; color: #334155; }
    .summary-value { padding: 7px 9px; font-weight: 800; color: #0f172a; }
    .decision-box { margin-top: 10px; border: 1px solid #cbd5e1; }
    .decision-heading { background: #0f172a; color: #fff; padding: 8px 10px; font-size: 12px; font-weight: 900; }
    .decision-body { padding: 10px 11px; }
    .decision-title { font-size: 15px; line-height: 1.35; color: #0f172a; font-weight: 900; }
    .decision-meta { margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; min-height: 46px; }
    .meta-label { color: #64748b; font-size: 9px; font-weight: 900; }
    .meta-value { margin-top: 2px; color: #0f172a; font-size: 11px; font-weight: 800; }
    .impact-box { margin-top: 8px; border: 1px solid #fed7aa; background: #fff7ed; padding: 9px 10px; color: #9a3412; }
    .impact-label { color: #ea580c; font-size: 9px; font-weight: 900; text-transform: uppercase; }
    .impact-value { margin-top: 3px; font-size: 11px; font-weight: 800; }
    .detail-grid { margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .detail-card { border: 1px solid #e2e8f0; background: #f8fafc; padding: 9px 10px; min-height: 52px; white-space: pre-wrap; }
    .detail-card strong { display: block; margin-bottom: 4px; color: #334155; font-size: 9px; font-weight: 900; text-transform: uppercase; }
    .notice { margin-top: 9px; border-left: 4px solid #f97316; background: #fff7ed; color: #9a3412; padding: 8px 10px; font-weight: 800; font-size: 10px; }
    .file-list { margin: 7px 0 0; padding-left: 17px; color: #475569; }
    .file-list li { margin-bottom: 2px; }
    .empty-box { border: 1px dashed #cbd5e1; color: #64748b; padding: 10px; text-align: center; margin-top: 7px; background: #f8fafc; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: auto; padding-top: 18px; }
    .signature { text-align: center; min-height: 78px; border-top: 1px solid #94a3b8; padding-top: 7px; color: #334155; }
    .signature strong { color: #0f172a; font-size: 10px; }
    .footer { margin-top: 11px; border-top: 1px solid #e5e7eb; padding-top: 7px; color: #64748b; font-size: 9px; display: flex; justify-content: space-between; gap: 12px; }
    .page-title { display: grid; grid-template-columns: 1fr 160px; gap: 14px; align-items: end; border-top: 6px solid #0f172a; border-bottom: 2px solid #f97316; padding: 12px 0 10px; }
    .page-title h1 { margin: 0; text-align: left; font-size: 20px; line-height: 1.2; color: #0f172a; }
    .photo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 12px; }
    .photo-card { margin: 0; border: 1px solid #cbd5e1; padding: 8px; min-height: 92mm; page-break-inside: avoid; background: #fff; }
    .photo-frame { height: 78mm; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #f8fafc; border: 1px solid #e5e7eb; }
    .photo-frame img { width: 100%; height: 100%; object-fit: contain; }
    .photo-card figcaption { margin-top: 6px; color: #334155; font-size: 10px; font-weight: 700; }
  </style>
</head>
<body>
  <main class="page">
    <div class="sheet">
      <header class="header">
        <div class="brand">
          ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="PMC CONNEXT" />` : ""}
          <div>
            <div class="brand-title">PICHAYAMONGKOL CONSTRUCTION CO., LTD.</div>
            <div class="brand-subtitle">Customer Decision Record / บันทึกรายการที่ลูกค้าต้องตัดสินใจ</div>
            <div class="company-address">276/1 ซอยพุทธบูชา 36 แขวงบางมด เขตทุ่งครุ กรุงเทพมหานคร 10140</div>
          </div>
        </div>
        <div class="doc-box">
          <div class="doc-label">Document No.</div>
          <div class="doc-no">${escapeHtml(decision.document_no || "-")}</div>
          <div class="doc-date">Issued: ${escapeHtml(formatThaiDate(decision.issued_at))}</div>
        </div>
      </header>

      <section class="title-block">
        <h1>บันทึกรายการที่ลูกค้าต้องตัดสินใจ</h1>
        <div class="en">Customer Decision / Approval Record</div>
      </section>

      <section class="summary-grid">
        <div class="summary-item">
          <div class="summary-label">โครงการ</div>
          <div class="summary-value">${escapeHtml(project.name || project.project_id || "-")}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">ลูกค้า</div>
          <div class="summary-value">${escapeHtml(project.client || "-")}</div>
        </div>
        <div class="summary-item full">
          <div class="summary-label">สถานที่</div>
          <div class="summary-value">${escapeHtml(location || "-")}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">ช่วงงาน</div>
          <div class="summary-value">${escapeHtml(decision.phase || "-")}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">สถานะ</div>
          <div class="summary-value">${escapeHtml(decision.decision_status || "-")}</div>
        </div>
      </section>

      <section class="decision-box">
        <div class="decision-heading">รายการขอให้ลูกค้ายืนยันก่อนดำเนินงานต่อ</div>
        <div class="decision-body">
          <div class="decision-title">${escapeHtml(decision.title || "-")}</div>
          <div class="decision-meta">
            <div class="meta-box">
              <div class="meta-label">ต้องตัดสินใจก่อน</div>
              <div class="meta-value">${escapeHtml(decision.decision_before || "-")}</div>
            </div>
            <div class="meta-box">
              <div class="meta-label">แจ้งเตือนล่าสุด</div>
              <div class="meta-value">${escapeHtml(formatThaiDate(decision.notified_at))}</div>
            </div>
            <div class="meta-box">
              <div class="meta-label">ผู้ยืนยัน</div>
              <div class="meta-value">${escapeHtml(decision.decided_by || "-")}</div>
            </div>
            <div class="meta-box">
              <div class="meta-label">วันที่ยืนยัน</div>
              <div class="meta-value">${escapeHtml(formatThaiDate(decision.decided_at))}</div>
            </div>
          </div>
          <div class="impact-box">
            <div class="impact-label">ผลถ้าเปลี่ยนหลังจากนี้</div>
            <div class="impact-value">${escapeHtml(decision.impact_if_changed || "-")}</div>
          </div>
        </div>
      </section>

      <section class="detail-grid">
        <div class="detail-card">
          <strong>ผลการตัดสินใจ / หมายเหตุ</strong>
          ${escapeHtml(decision.result_note || "-")}
        </div>
        <div class="detail-card">
          <strong>หลักฐานอ้างอิง</strong>
          ${escapeHtml(decision.evidence_note || "-")}
        </div>
      </section>

      <div class="notice">เอกสารนี้ใช้เป็นบันทึกการแจ้งเตือนและยืนยันรายการที่ลูกค้าต้องตัดสินใจก่อนผ่านช่วงงานดังกล่าว หากมีการเปลี่ยนแปลงหลังจากจุดตัดสินใจ อาจมีผลต่อระยะเวลา ค่าใช้จ่าย หรือการดำเนินงานหน้างาน</div>

      <section>
        <div class="section-title">ไฟล์แนบ / หลักฐานประกอบ</div>
      ${evidenceFiles.length > 0 ? `
        <ul class="file-list">
          ${evidenceFiles.map((item) => `<li>${escapeHtml(item.file_name || "-")} (${escapeHtml(item.mime_type || "file")})</li>`).join("")}
        </ul>
      ` : `<div class="empty-box">ยังไม่มีไฟล์แนบ</div>`}
      </section>

      <section class="signatures">
        <div class="signature">
          <strong>ผู้จัดทำ</strong><br />
          ${escapeHtml(decision.issued_by_name || "")}<br />
          วันที่ ........../........../..........
        </div>
        <div class="signature">
          <strong>วิศวกร / ผู้ควบคุมงาน</strong><br />
          วันที่ ........../........../..........
        </div>
        <div class="signature">
          <strong>ลูกค้า / ผู้ยืนยัน</strong><br />
          ${escapeHtml(decision.decided_by || project.client || "")}<br />
          วันที่ ........../........../..........
        </div>
      </section>

      <footer class="footer">
        <span>Generated by PMC CONNEXT</span>
        <span>Page 1${evidenceImages.length ? " / 2" : ""}</span>
      </footer>
    </div>
  </main>

  ${evidenceImages.length > 0 ? `
  <main class="page evidence-page">
    <div class="sheet">
      <section class="page-title">
        <div>
          <h1>หลักฐานแนบประกอบ</h1>
          <div class="brand-subtitle">${escapeHtml(project.name || project.project_id || "-")} | ${escapeHtml(decision.document_no || "-")}</div>
        </div>
        <div class="doc-box">
          <div class="doc-label">Document No.</div>
          <div class="doc-no">${escapeHtml(decision.document_no || "-")}</div>
        </div>
      </section>
      <div class="photo-grid">
        ${evidenceImages.slice(0, 6).map(renderImage).join("")}
      </div>
      <footer class="footer">
        <span>Generated by PMC CONNEXT</span>
        <span>Page 2 / 2 | ${escapeHtml(new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }))}</span>
      </footer>
    </div>
  </main>` : ""}
</body>
</html>`;
}
