import fs from "fs";
import path from "path";
import { formatBangkokDateTime } from "@/lib/bangkokDateTime";

export type DefectStatus =
  | "draft"
  | "issued"
  | "acknowledged"
  | "in_progress"
  | "ready_for_recheck"
  | "closed";

export type DefectItemStatus =
  | "open"
  | "in_progress"
  | "fixed"
  | "rejected"
  | "passed";

export type DefectPhotoRef = {
  file_id: string;
  file_name: string;
  file_url: string;
  mime_type: string;
  data_url?: string;
};

export type DefectRoundRecord = Record<string, string | number | undefined> & {
  _rowIndex?: number;
  round_id: string;
  project_id: string;
  document_no?: string;
  revision_no?: string;
  title?: string;
  inspection_date?: string;
  inspector_name?: string;
  inspector_email?: string;
  client_name?: string;
  project_name?: string;
  project_location?: string;
  status?: string;
  extension_days?: string | number;
  pdf_url?: string;
  tracking_pdf_file_id?: string;
  tracking_pdf_url?: string;
  tracking_pdf_issued_at?: string;
  issued_at?: string;
  acknowledged_by?: string;
  acknowledged_channel?: string;
  acknowledged_date?: string;
  locked_at?: string;
  notes?: string;
  approval_token?: string;
  approval_url?: string;
  sent_to_customer_at?: string;
  line_group_id?: string;
  line_message?: string;
};

export type DefectItemRecord = Record<string, string | number | DefectPhotoRef[] | undefined> & {
  _rowIndex?: number;
  item_id: string;
  round_id: string;
  project_id: string;
  item_no?: string | number;
  zone?: string;
  discipline?: string;
  work_category?: string;
  description?: string;
  cause?: string;
  status?: string;
  owner?: string;
  reported_date?: string;
  due_date?: string;
  remarks?: string;
  before_photos_json?: string;
  after_photos_json?: string;
  repair_note?: string;
};

export type DefectEvidenceRecord = Record<string, string | number | undefined> & {
  _rowIndex?: number;
  evidence_id: string;
  round_id: string;
  project_id: string;
  evidence_type?: string;
  channel?: string;
  acknowledged_by?: string;
  acknowledged_date?: string;
  file_name?: string;
  file_url?: string;
  notes?: string;
};

export type DefectReportSnapshot = {
  round: DefectRoundRecord;
  items: Array<DefectItemRecord & { before_photos: DefectPhotoRef[]; after_photos: DefectPhotoRef[] }>;
  project: Record<string, string | number | undefined>;
  generated_at: string;
  generated_by_name: string;
  generated_by_email: string;
};

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");

export const DEFECT_ROUND_STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง",
  issued: "ออกเอกสารแล้ว",
  acknowledged: "ลูกค้ายอมรับงานแก้ไขแล้ว",
  in_progress: "กำลังแก้ไข",
  ready_for_recheck: "แก้เสร็จรอตรวจซ้ำ",
  closed: "ปิดงาน",
};

export const DEFECT_ITEM_STATUS_LABELS: Record<string, string> = {
  open: "รอแก้ไข",
  in_progress: "กำลังแก้ไข",
  fixed: "แก้ไขเสร็จ",
  rejected: "แก้ไขใหม่",
  passed: "ผ่าน",
};

export const DEFECT_DISCIPLINE_LABELS: Record<string, string> = {
  ST: "โครงสร้าง",
  AR: "สถาปัตยกรรม",
  SN: "สุขาภิบาล",
  EE: "ไฟฟ้า",
  ME: "เครื่องกล",
  LAND: "ภูมิสถาปัตย์",
  OTHER: "อื่น ๆ",
};

function getLogoDataUrl() {
  try {
    const logo = fs.readFileSync(LOGO_PATH);
    return `data:image/png;base64,${logo.toString("base64")}`;
  } catch {
    return "";
  }
}

export function escapeHtml(value?: string | number | null) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function nl2br(value?: string | number | null) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

export function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function parsePhotoRefs(value?: string | number) {
  if (!value) return [] as DefectPhotoRef[];
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => ({
        file_id: String(item.file_id || ""),
        file_name: String(item.file_name || ""),
        file_url: String(item.file_url || ""),
        mime_type: String(item.mime_type || "application/octet-stream"),
        data_url: typeof item.data_url === "string" ? item.data_url : undefined,
      }))
      .filter((item) => item.file_id || item.file_url || item.data_url);
  } catch {
    return [];
  }
}

export function todayBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function formatThaiDate(value?: string | number) {
  const text = String(value || "");
  if (!text) return "-";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00+07:00` : text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export function formatThaiDateTime(value?: string | number) {
  const text = String(value || "");
  if (!text) return "-";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export function createDefectDocumentNo(projectId: string, inspectionDate: string, existingRounds: DefectRoundRecord[]) {
  const monthKey = (inspectionDate || todayBangkok()).slice(0, 7).replace("-", "");
  const prefix = `DEF-${projectId}-${monthKey}-`;
  const count = existingRounds.filter((round) => String(round.document_no || "").startsWith(prefix)).length;
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}

export function createDefectApprovalToken() {
  return `dfa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function buildDefectApprovalLineFlex({
  projectName,
  projectId,
  documentNo,
  title,
  itemCount,
  pdfUrl,
  approvalUrl,
}: {
  projectName: string;
  projectId: string;
  documentNo?: string;
  title: string;
  itemCount: number;
  pdfUrl?: string;
  approvalUrl: string;
}) {
  return {
    type: "flex",
    altText: `Defect close approval | ${projectName || projectId} | ${title}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#111827",
        paddingAll: "18px",
        paddingBottom: "16px",
        contents: [
          { type: "text", text: "PMC CONNEXT DEFECT CLOSE", color: "#cbd5e1", weight: "bold", size: "xs" },
          { type: "text", text: "ขอรับรองงานแก้ไข Defect", color: "#ffffff", weight: "bold", size: "lg", margin: "xs", wrap: true },
          { type: "text", text: documentNo || projectId, color: "#e5e7eb", size: "sm", margin: "xs", wrap: true },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "18px",
        contents: [
          { type: "text", text: projectName || projectId, color: "#0f172a", weight: "bold", size: "lg", wrap: true },
          defectLineRow("รายการ", title || "-"),
          defectLineRow("จำนวน Defect", `${itemCount} รายการ`),
          { type: "separator", margin: "md", color: "#e5e7eb" },
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
              { type: "text", text: "ทีมงานบันทึกรายงานติดตามการแก้ไขแล้ว กรุณาตรวจสอบและกดยอมรับงานแก้ไข", color: "#166534", size: "sm", wrap: true },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "8px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#111827",
            action: { type: "uri", label: "ยอมรับการแก้ไข", uri: approvalUrl },
          },
          ...(pdfUrl ? [{
            type: "button",
            style: "primary",
            color: "#475569",
            action: { type: "uri", label: "เปิดรายงานติดตาม", uri: pdfUrl },
          }] : []),
        ],
      },
    },
  };
}

export function buildDefectAcknowledgementLineFlex({
  projectName,
  projectId,
  documentNo,
  title,
  itemCount,
  pdfUrl,
  acknowledgementUrl,
}: {
  projectName: string;
  projectId: string;
  documentNo?: string;
  title: string;
  itemCount: number;
  pdfUrl?: string;
  acknowledgementUrl: string;
}) {
  return {
    type: "flex",
    altText: `Defect acknowledgement | ${projectName || projectId} | ${title}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#111827",
        paddingAll: "18px",
        paddingBottom: "16px",
        contents: [
          { type: "text", text: "PMC CONNEXT DEFECT LIST", color: "#cbd5e1", weight: "bold", size: "xs" },
          { type: "text", text: "ยืนยันรับทราบรายการ Defect", color: "#ffffff", weight: "bold", size: "lg", margin: "xs", wrap: true },
          { type: "text", text: documentNo || projectId, color: "#e5e7eb", size: "sm", margin: "xs", wrap: true },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "18px",
        contents: [
          { type: "text", text: projectName || projectId, color: "#0f172a", weight: "bold", size: "lg", wrap: true },
          defectLineRow("รายการ", title || "-"),
          defectLineRow("จำนวน Defect", `${itemCount} รายการ`),
          { type: "separator", margin: "md", color: "#e5e7eb" },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            margin: "md",
            backgroundColor: "#f8fafc",
            cornerRadius: "8px",
            paddingAll: "10px",
            contents: [
              { type: "text", text: "ขั้นตอนนี้", color: "#334155", size: "xs", weight: "bold" },
              { type: "text", text: "กรุณาตรวจรายการและกดยืนยันรับทราบ เพื่อให้ทีมงานเริ่มติดตามการแก้ไขตามรายการนี้", color: "#475569", size: "sm", wrap: true },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "8px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#111827",
            action: { type: "uri", label: "รับทราบรายการ", uri: acknowledgementUrl },
          },
          ...(pdfUrl ? [{
            type: "button",
            style: "primary",
            color: "#475569",
            action: { type: "uri", label: "เปิด PDF Defect", uri: pdfUrl },
          }] : []),
        ],
      },
    },
  };
}

export function buildDefectApprovedLineFlex({
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
  documentNo?: string;
  title: string;
  acknowledgedBy: string;
  acknowledgedAt: string;
  pdfUrl?: string;
}) {
  const approvedDate = formatBangkokDateTime(acknowledgedAt);
  return {
    type: "flex",
    altText: `ลูกค้ายอมรับงานแก้ไข Defect แล้ว | ${projectName || projectId} | ${title}`,
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
          { type: "text", text: "PMC CONNEXT DEFECT APPROVED", color: "#bbf7d0", weight: "bold", size: "xs" },
          { type: "text", text: "ลูกค้ายอมรับงานแก้ไขแล้ว", color: "#ffffff", weight: "bold", size: "lg", margin: "xs", wrap: true },
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
          defectLineRow("รายการ", title || "-"),
          defectLineRow("ผู้ยอมรับ", acknowledgedBy || "-"),
          defectLineRow("เวลา", approvedDate),
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
            action: { type: "uri", label: "เปิดรายงานติดตาม", uri: pdfUrl },
          }],
        },
      } : {}),
    },
  };
}

export function buildDefectListAcknowledgedLineFlex({
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
  documentNo?: string;
  title: string;
  acknowledgedBy: string;
  acknowledgedAt: string;
  pdfUrl?: string;
}) {
  const acknowledgedTime = formatBangkokDateTime(acknowledgedAt);
  return {
    type: "flex",
    altText: `ลูกค้ารับทราบรายการ Defect แล้ว | ${projectName || projectId} | ${title}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#111827",
        paddingAll: "18px",
        paddingBottom: "16px",
        contents: [
          { type: "text", text: "PMC CONNEXT DEFECT ACKNOWLEDGED", color: "#cbd5e1", weight: "bold", size: "xs" },
          { type: "text", text: "ลูกค้ารับทราบรายการแล้ว", color: "#ffffff", weight: "bold", size: "lg", margin: "xs", wrap: true },
          { type: "text", text: documentNo || projectId, color: "#e5e7eb", size: "sm", margin: "xs", wrap: true },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "18px",
        contents: [
          { type: "text", text: projectName || projectId, color: "#0f172a", weight: "bold", size: "lg", wrap: true },
          defectLineRow("รายการ", title || "-"),
          defectLineRow("ผู้รับทราบ", acknowledgedBy || "-"),
          defectLineRow("เวลา", acknowledgedTime),
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
              { type: "text", text: "ทีมงานเริ่มติดตามการแก้ไขตามรายการนี้ได้แล้ว", color: "#166534", size: "sm", wrap: true },
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
            color: "#475569",
            action: { type: "uri", label: "เปิด PDF Defect", uri: pdfUrl },
          }],
        },
      } : {}),
    },
  };
}

function defectLineRow(label: string, value: string) {
  return {
    type: "box",
    layout: "horizontal",
    margin: "sm",
    contents: [
      { type: "text", text: label, color: "#64748b", size: "xs", flex: 4 },
      { type: "text", text: value, color: "#0f172a", size: "sm", flex: 8, wrap: true },
    ],
  };
}

function labelFor(map: Record<string, string>, value?: string | number) {
  const key = String(value || "").trim();
  return map[key] || key || "-";
}

function renderPhoto(photo: DefectPhotoRef | undefined, fallback: string) {
  if (!photo?.data_url) {
    return `<div class="photo-placeholder">${escapeHtml(fallback)}</div>`;
  }

  return `
    <div class="photo-box">
      <img src="${photo.data_url}" alt="${escapeHtml(photo.file_name || fallback)}">
      <div class="photo-caption">${escapeHtml(photo.file_name || fallback)}</div>
    </div>
  `;
}

function renderDefectItemRows(snapshot: DefectReportSnapshot) {
  if (snapshot.items.length === 0) {
    return `<tr><td colspan="8" class="muted center">ยังไม่มีรายการตรวจส่งมอบในรอบนี้</td></tr>`;
  }

  return snapshot.items.map((item, index) => `
    <tr>
      <td class="center">${escapeHtml(item.item_no || index + 1)}</td>
      <td>${escapeHtml(item.zone || "-")}</td>
      <td>${escapeHtml(labelFor(DEFECT_DISCIPLINE_LABELS, item.discipline))}</td>
      <td>
        <strong>${nl2br(item.description || "-")}</strong>
        ${item.cause ? `<div class="muted small">สาเหตุ/ข้อมูลประกอบ: ${nl2br(item.cause)}</div>` : ""}
      </td>
      <td>${renderPhoto(item.before_photos[0], "ไม่มีรูปก่อนแก้")}</td>
      <td>${escapeHtml(labelFor(DEFECT_ITEM_STATUS_LABELS, item.status))}</td>
      <td>${escapeHtml(item.owner || "-")}</td>
      <td>
        ${item.due_date ? `กำหนด: ${escapeHtml(formatThaiDate(item.due_date))}` : "-"}
        ${item.remarks ? `<div class="muted small">${nl2br(item.remarks)}</div>` : ""}
      </td>
    </tr>
  `).join("");
}

export function buildDefectReportHtml(snapshot: DefectReportSnapshot) {
  const logoDataUrl = getLogoDataUrl();
  const round = snapshot.round;
  const docNo = String(round.document_no || "DRAFT");
  const openCount = snapshot.items.filter((item) => !["passed", "closed"].includes(String(item.status || ""))).length;
  const projectName = String(round.project_name || snapshot.project.name || snapshot.project.project_id || "-");
  const projectLocation = String(round.project_location || snapshot.project.address || "-");
  const clientName = String(round.client_name || snapshot.project.client || "-");

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&display=swap');
    @page {
      size: A4;
      margin: 11mm 10mm 12mm;
      @bottom-right { content: "Page " counter(page) " / " counter(pages); font-size: 8px; color: #64748b; }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      font-family: "Kanit", "Sarabun", "Noto Sans Thai", "Tahoma", "Arial", sans-serif;
      font-size: 9.2px;
      line-height: 1.34;
    }
    .doc-header {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 2px solid #111827;
      margin-bottom: 8px;
    }
    .doc-header td {
      border: 0;
      padding: 0 0 8px;
      vertical-align: middle;
    }
    .logo-cell {
      width: 118px;
      padding-right: 12px !important;
    }
    .logo-cell img {
      width: 104px;
      height: auto;
      display: block;
    }
    .company-name {
      margin: 0;
      font-size: 17px;
      line-height: 1.1;
      font-weight: 800;
    }
    .company-address {
      margin-top: 3px;
      color: #475569;
      font-size: 8.4px;
    }
    .report-title {
      margin-top: 5px;
      font-size: 13px;
      font-weight: 800;
    }
    .report-subtitle {
      color: #475569;
      font-size: 8.8px;
    }
    .control-table, .detail-table, .defect-table, .signature-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 4px 5px;
      vertical-align: top;
      word-break: break-word;
    }
    .control-table {
      margin-bottom: 7px;
    }
    .control-table th {
      background: #111827;
      color: #ffffff;
      border-color: #111827;
      font-size: 8px;
      text-align: left;
    }
    .control-table td {
      font-size: 9px;
      font-weight: 700;
    }
    .section {
      margin-top: 8px;
    }
    .section h2 {
      margin: 0 0 4px;
      border-left: 3px solid #ea580c;
      padding-left: 6px;
      font-size: 10px;
      font-weight: 800;
    }
    .detail-table th {
      width: 17%;
      background: #f3f4f6;
      color: #374151;
      font-weight: 800;
      text-align: left;
    }
    .defect-table {
      font-size: 8.2px;
    }
    .defect-table th {
      background: #1f2937;
      color: #ffffff;
      border-color: #1f2937;
      font-weight: 800;
      text-align: left;
    }
    .center { text-align: center; }
    .muted { color: #64748b; }
    .small { margin-top: 3px; font-size: 7.8px; }
    .photo-box img {
      width: 100%;
      height: 72px;
      object-fit: cover;
      display: block;
      border: 1px solid #e5e7eb;
    }
    .photo-caption {
      margin-top: 2px;
      color: #64748b;
      font-size: 7px;
    }
    .photo-placeholder {
      min-height: 72px;
      border: 1px dashed #cbd5e1;
      color: #94a3b8;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 4px;
    }
    .notice {
      border: 1px solid #fed7aa;
      background: #fff7ed;
      padding: 6px 8px;
      color: #7c2d12;
      font-size: 8.6px;
    }
    .signature-table {
      margin-top: 14px;
      page-break-inside: avoid;
    }
    .signature-table td {
      border: 0;
      width: 33.333%;
      text-align: center;
      padding: 6px 18px 0;
    }
    .signature-line {
      margin: 18px 0 4px;
      border-top: 1px solid #111827;
      height: 1px;
    }
    .footer-note {
      margin-top: 8px;
      color: #64748b;
      font-size: 7.6px;
      text-align: right;
    }
  </style>
</head>
<body>
  <table class="doc-header">
    <tr>
      <td class="logo-cell">${logoDataUrl ? `<img src="${logoDataUrl}" alt="Pichayamongkol Construction Co., Ltd.">` : ""}</td>
      <td>
        <div class="company-name">Pichayamongkol Construction Co., Ltd.</div>
        <div class="company-address">276/1 Soi Phuttha Bucha 36, Bang Mot, Thung Khru, Bangkok 10140</div>
        <div class="report-title">Defect Inspection Report / รายงานรายการตรวจส่งมอบ</div>
        <div class="report-subtitle">${escapeHtml(projectName)} | เลขที่เอกสาร: ${escapeHtml(docNo)}</div>
      </td>
    </tr>
  </table>

  <table class="control-table">
    <tr>
      <th>Document No.</th>
      <th>Inspection Date</th>
      <th>Project Code</th>
      <th>Inspector</th>
      <th>Generated At</th>
    </tr>
    <tr>
      <td>${escapeHtml(docNo)}</td>
      <td>${escapeHtml(formatThaiDate(round.inspection_date))}</td>
      <td>${escapeHtml(round.project_id)}</td>
      <td>${escapeHtml(round.inspector_name || "-")}</td>
      <td>${escapeHtml(formatThaiDateTime(snapshot.generated_at))}</td>
    </tr>
  </table>

  <div class="section">
    <h2>ข้อมูลโครงการ</h2>
    <table class="detail-table">
      <tr>
        <th>ชื่อโครงการ</th><td>${escapeHtml(projectName)}</td>
        <th>ลูกค้า</th><td>${escapeHtml(clientName)}</td>
      </tr>
      <tr>
        <th>สถานที่</th><td>${escapeHtml(projectLocation)}</td>
        <th>รอบตรวจ</th><td>${escapeHtml(round.title || "-")}</td>
      </tr>
      <tr>
        <th>ผู้ตรวจ</th><td>${escapeHtml(round.inspector_name || "-")}</td>
        <th>จำนวนรายการ</th><td>${snapshot.items.length} รายการ / คงค้าง ${openCount} รายการ</td>
      </tr>
      <tr>
        <th>จำนวนวันที่ต้องบวก</th><td>${escapeHtml(round.extension_days || 0)} วัน</td>
        <th>หมายเหตุ</th><td>${nl2br(round.notes || "-")}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h2>รายการที่บันทึกจากการตรวจส่งมอบ</h2>
    <table class="defect-table">
      <thead>
        <tr>
          <th style="width: 28px;">No.</th>
          <th style="width: 72px;">พื้นที่/โซน</th>
          <th style="width: 58px;">หมวดงาน</th>
          <th>รายการที่ลูกค้าแจ้ง/จุดตรวจพบ</th>
          <th style="width: 96px;">รูปประกอบ</th>
          <th style="width: 58px;">สถานะ</th>
          <th style="width: 58px;">ผู้แก้ไข</th>
          <th style="width: 82px;">กำหนด/หมายเหตุ</th>
        </tr>
      </thead>
      <tbody>${renderDefectItemRows(snapshot)}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>เงื่อนไขการรับทราบ</h2>
    <div class="notice">
      เอกสารฉบับนี้เป็นรายการที่บันทึกจากการตรวจ ณ วันที่ระบุด้านบน และใช้เป็นรายการอ้างอิงสำหรับดำเนินการแก้ไขก่อนส่งมอบ
      หากมีรายการเพิ่มเติมภายหลังการรับทราบ จะบันทึกเป็นรอบตรวจเพิ่มเติมหรือ revision ใหม่เพื่อให้ตรวจสอบย้อนหลังได้ชัดเจน
    </div>
  </div>

  <table class="signature-table">
    <tr>
      <td>
        ผู้จัดทำ/ผู้ตรวจ
        <div class="signature-line"></div>
        <div>${escapeHtml(round.inspector_name || snapshot.generated_by_name || "-")}</div>
      </td>
      <td>
        ผู้รับผิดชอบโครงการ
        <div class="signature-line"></div>
        <div>&nbsp;</div>
      </td>
      <td>
        หมายเหตุการรับทราบจากลูกค้า
        <div class="signature-line"></div>
        <div>แนบหลักฐานจากแชทในระบบ</div>
      </td>
    </tr>
  </table>

  <div class="footer-note">Generated by PMC CONNEXT | ${escapeHtml(docNo)} | ${escapeHtml(formatThaiDateTime(snapshot.generated_at))}</div>
</body>
</html>`;
}

function renderFollowUpPhoto(photo: DefectPhotoRef | undefined, fallback: string) {
  if (!photo?.data_url) return `<div class="follow-photo empty">${escapeHtml(fallback)}: ยังไม่มีรูป</div>`;
  return `
    <figure class="follow-photo">
      <img src="${photo.data_url}" alt="${escapeHtml(photo.file_name || fallback)}">
      <figcaption>${escapeHtml(fallback)}${photo.file_name ? `: ${escapeHtml(photo.file_name)}` : ""}</figcaption>
    </figure>
  `;
}

function renderFollowUpItems(snapshot: DefectReportSnapshot) {
  if (snapshot.items.length === 0) return `<section class="item">ไม่มีรายการ Defect</section>`;

  return snapshot.items.map((item, index) => {
    const beforePhotos = item.before_photos.slice(0, 2);
    const afterPhotos = item.after_photos.slice(0, 2);
    return `
      <section class="item">
        <div class="item-head">
          <div>
            <div class="item-no">#${escapeHtml(item.item_no || index + 1)} ${escapeHtml(item.zone || "-")}</div>
            <h3>${escapeHtml(item.description || "-")}</h3>
          </div>
          <span class="status">${escapeHtml(labelFor(DEFECT_ITEM_STATUS_LABELS, item.status))}</span>
        </div>
        <div class="meta">
          <div><strong>หมวด:</strong> ${escapeHtml(labelFor(DEFECT_DISCIPLINE_LABELS, item.discipline))}</div>
          <div><strong>ผู้รับผิดชอบ:</strong> ${escapeHtml(item.owner || "-")}</div>
          <div><strong>กำหนดแก้:</strong> ${escapeHtml(formatThaiDate(item.due_date))}</div>
          <div><strong>สาเหตุ:</strong> ${escapeHtml(item.cause || "-")}</div>
        </div>
        <div class="repair-note"><strong>บันทึกการแก้ไข:</strong> ${nl2br(item.repair_note || item.remarks || "-")}</div>
        <div class="photos">
          ${renderFollowUpPhoto(beforePhotos[0], "ก่อนแก้")}
          ${renderFollowUpPhoto(afterPhotos[0], "หลังแก้")}
        </div>
      </section>
    `;
  }).join("");
}

export function buildDefectFollowUpReportHtml(snapshot: DefectReportSnapshot) {
  const logoDataUrl = getLogoDataUrl();
  const round = snapshot.round;
  const docNo = String(round.document_no || "DRAFT");
  const openCount = snapshot.items.filter((item) => !["passed", "closed"].includes(String(item.status || ""))).length;
  const fixedCount = snapshot.items.filter((item) => ["fixed", "passed", "closed"].includes(String(item.status || ""))).length;
  const projectName = String(round.project_name || snapshot.project.name || snapshot.project.project_id || "-");
  const clientName = String(round.client_name || snapshot.project.client || "-");

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&display=swap');
    @page { size: A4 portrait; margin: 12mm; @bottom-right { content: "Page " counter(page) " / " counter(pages); font-size: 8px; color: #64748b; } }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: "Kanit", "Sarabun", "Noto Sans Thai", "Tahoma", "Arial", sans-serif; font-size: 9.4px; line-height: 1.36; }
    .doc-header { display: grid; grid-template-columns: 112px 1fr; gap: 12px; align-items: center; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 10px; }
    .doc-header img { width: 104px; height: auto; display: block; }
    .company-name { margin: 0; font-size: 16px; line-height: 1.1; font-weight: 800; }
    .company-address { margin-top: 3px; color: #475569; font-size: 8.4px; }
    h1 { margin: 5px 0 2px; font-size: 16px; line-height: 1.2; font-weight: 800; }
    .subtitle { color: #475569; font-size: 8.8px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin: 10px 0 12px; }
    .box { border: 1px solid #d1d5db; padding: 6px; font-size: 8.2px; min-height: 38px; }
    .box strong { display: block; margin-top: 2px; font-size: 12px; color: #111827; }
    .item { margin-top: 10px; break-inside: avoid; border: 1px solid #d1d5db; padding: 8px; }
    .item-head { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
    .item-no { color: #475569; font-size: 9px; font-weight: 800; }
    h3 { margin: 2px 0 0; font-size: 12.5px; }
    .status { height: fit-content; white-space: nowrap; border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; border-radius: 999px; padding: 4px 8px; font-size: 9px; font-weight: 900; }
    .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 12px; margin-top: 7px; font-size: 9.5px; color: #334155; }
    .repair-note { margin-top: 7px; border: 1px solid #e5e7eb; background: #f8fafc; padding: 6px; min-height: 28px; font-size: 9.5px; line-height: 1.45; }
    .photos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; margin-top: 8px; }
    .follow-photo { margin: 0; border: 1px solid #e5e7eb; padding: 5px; min-height: 55mm; }
    .follow-photo img { width: 100%; height: 50mm; object-fit: contain; background: #f8fafc; display: block; }
    .follow-photo figcaption, .follow-photo.empty { margin-top: 4px; color: #475569; font-size: 8.5px; line-height: 1.35; }
    .follow-photo.empty { min-height: 55mm; display: grid; place-items: center; border-style: dashed; }
    .footer { margin-top: 16px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; text-align: center; font-size: 9px; page-break-inside: avoid; }
    .sign-line { height: 32px; border-bottom: 1px solid #111827; margin-bottom: 6px; }
    .footer-note { margin-top: 8px; color: #64748b; font-size: 7.6px; text-align: right; }
  </style>
</head>
<body>
  <header class="doc-header">
    ${logoDataUrl ? `<img src="${logoDataUrl}" alt="Pichayamongkol Construction Co., Ltd.">` : "<div></div>"}
    <div>
      <div class="company-name">Pichayamongkol Construction Co., Ltd.</div>
      <div class="company-address">276/1 Soi Phuttha Bucha 36, Bang Mot, Thung Khru, Bangkok 10140</div>
      <h1>รายงานติดตามการแก้ไข Defect / Defect Follow-up Report</h1>
      <div class="subtitle">${escapeHtml(projectName)} | เลขที่เอกสาร: ${escapeHtml(docNo)}</div>
    </div>
  </header>
  <section class="summary">
    <div class="box">ลูกค้า<strong>${escapeHtml(clientName)}</strong></div>
    <div class="box">วันที่ตรวจ<strong>${escapeHtml(formatThaiDate(round.inspection_date))}</strong></div>
    <div class="box">รายการทั้งหมด<strong>${snapshot.items.length}</strong></div>
    <div class="box">คงค้าง<strong>${openCount}</strong></div>
    <div class="box">แก้ไขแล้ว/ผ่าน<strong>${fixedCount}</strong></div>
    <div class="box">จำนวนวันที่ต้องบวก<strong>${escapeHtml(round.extension_days || 0)} วัน</strong></div>
    <div class="box">ผู้ตรวจ<strong>${escapeHtml(round.inspector_name || "-")}</strong></div>
    <div class="box">วันที่ออกรายงาน<strong>${escapeHtml(formatThaiDate(snapshot.generated_at))}</strong></div>
  </section>
  ${renderFollowUpItems(snapshot)}
  <section class="footer">
    <div><div class="sign-line"></div>ผู้จัดทำ / วิศวกร</div>
    <div><div class="sign-line"></div>ผู้ตรวจสอบ</div>
    <div><div class="sign-line"></div>ลูกค้ารับรองงานแก้ไข</div>
  </section>
  <div class="footer-note">Generated by PMC CONNEXT | ${escapeHtml(docNo)} | ${escapeHtml(formatThaiDateTime(snapshot.generated_at))}</div>
</body>
</html>`;
}
