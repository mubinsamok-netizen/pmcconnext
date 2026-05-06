import fs from "fs";
import path from "path";

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
  issued_at?: string;
  acknowledged_by?: string;
  acknowledged_channel?: string;
  acknowledged_date?: string;
  locked_at?: string;
  notes?: string;
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
  acknowledged: "ลูกค้ารับทราบแล้ว",
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
