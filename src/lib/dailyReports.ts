import fs from "fs";
import path from "path";

export type DailyReportTableRow = Record<string, string>;

export type DailyReportPayload = {
  report_id: string;
  document_no: string;
  project_id: string;
  project_name: string;
  project_location: string;
  project_start_date: string;
  project_end_date: string;
  project_owner: string;
  date: string;
  weather: string;
  workers: string;
  work_done: string;
  issues: string;
  solutions: string;
  prepared_by_name: string;
  prepared_by_position: string;
  prepared_by_email: string;
  prepared_at: string;
  personnel: DailyReportTableRow[];
  machinery: DailyReportTableRow[];
  materials: DailyReportTableRow[];
};

export type DailyReportPhoto = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");

function getLogoDataUrl() {
  try {
    const logo = fs.readFileSync(LOGO_PATH);
    return `data:image/png;base64,${logo.toString("base64")}`;
  } catch {
    return "";
  }
}

function escapeHtml(value?: string | number | null) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nl2br(value?: string) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

export function formatThaiDate(value?: string) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export function formatThaiDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export function parseJsonRows(value: FormDataEntryValue | null): DailyReportTableRow[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row) => row && typeof row === "object")
      .map((row) => Object.fromEntries(
        Object.entries(row as Record<string, unknown>).map(([key, item]) => [key, String(item ?? "").trim()])
      ))
      .filter((row) => Object.values(row).some(Boolean));
  } catch {
    return [];
  }
}

export function stringifyRows(rows: DailyReportTableRow[]) {
  return JSON.stringify(rows.filter((row) => Object.values(row).some(Boolean)));
}

function renderMetaCard(label: string, value: string) {
  return `
    <td class="meta-card">
      <div class="meta-label">${escapeHtml(label)}</div>
      <div class="meta-value">${escapeHtml(value || "-")}</div>
    </td>
  `;
}

function renderDetailRow(label: string, value: string, label2: string, value2: string) {
  return `
    <tr>
      <th>${escapeHtml(label)}</th>
      <td>${escapeHtml(value || "-")}</td>
      <th>${escapeHtml(label2)}</th>
      <td>${escapeHtml(value2 || "-")}</td>
    </tr>
  `;
}

function renderRows(rows: DailyReportTableRow[], columns: { key: string; label: string }[], emptyText: string) {
  if (rows.length === 0) {
    return `<tr><td colspan="${columns.length}" class="muted">${escapeHtml(emptyText)}</td></tr>`;
  }

  return rows.map((row, index) => `
    <tr>
      ${columns.map((column) => {
        const value = column.key === "index" ? String(index + 1) : row[column.key] || "";
        return `<td>${escapeHtml(value || "-")}</td>`;
      }).join("")}
    </tr>
  `).join("");
}

function renderPhotoGrid(photos: DailyReportPhoto[]) {
  if (photos.length === 0) {
    return `<div class="empty-photo">ไม่มีรูปภาพแนบในรายงานฉบับนี้</div>`;
  }

  const rows: DailyReportPhoto[][] = [];
  for (let index = 0; index < photos.length; index += 2) {
    rows.push(photos.slice(index, index + 2));
  }

  return `
    <table class="photo-table">
      ${rows.map((row, rowIndex) => `
        <tr>
          ${row.map((photo, cellIndex) => {
            const photoIndex = rowIndex * 2 + cellIndex + 1;
            return `
              <td class="photo-cell">
                <img src="${photo.dataUrl}" alt="${escapeHtml(photo.name)}">
                <div class="caption">รูปที่ ${photoIndex}: ${escapeHtml(photo.name)}</div>
              </td>
            `;
          }).join("")}
          ${row.length === 1 ? `<td class="photo-cell"></td>` : ""}
        </tr>
      `).join("")}
    </table>
  `;
}

export function buildDailyReportHtml(report: DailyReportPayload, photos: DailyReportPhoto[], photoCount = photos.length) {
  const logoDataUrl = getLogoDataUrl();
  const projectPeriod = `${formatThaiDate(report.project_start_date)} - ${formatThaiDate(report.project_end_date)}`;
  const machineryCount = report.machinery.length;
  const materialCount = report.materials.length;

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&display=swap');
    @page { size: A4; margin: 10mm 10mm; }
    body {
      margin: 0;
      color: #111111;
      font-family: "Kanit", "Noto Sans Thai", "Tahoma", "Arial", sans-serif;
      font-size: 9.6px;
      line-height: 1.28;
    }
    .doc-header {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 2px solid #111111;
      margin-bottom: 8px;
    }
    .doc-header td {
      border: 0;
      padding: 0 0 8px 0;
      vertical-align: middle;
    }
    .logo-cell {
      width: 128px;
      padding-right: 14px !important;
    }
    .logo-cell img {
      width: 112px;
      height: auto;
      display: block;
    }
    .company-name {
      margin: 0;
      color: #111111;
      font-size: 17px;
      line-height: 1.1;
      font-weight: 800;
      letter-spacing: 0;
    }
    .company-address {
      margin-top: 3px;
      color: #4b5563;
      font-size: 9px;
    }
    .report-title {
      margin-top: 4px;
      color: #111111;
      font-size: 12px;
      font-weight: 800;
    }
    .report-subtitle {
      margin-top: 3px;
      color: #374151;
      font-size: 9px;
    }
    .doc-control-table {
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 7px;
      table-layout: fixed;
    }
    .doc-control-table th {
      background: #111111;
      color: #ffffff;
      border: 1px solid #111111;
      padding: 4px 5px;
      font-size: 8.5px;
      text-align: left;
    }
    .doc-control-table td {
      border: 1px solid #d1d5db;
      padding: 4px 5px;
      font-size: 9px;
      font-weight: 700;
    }
    .meta-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 5px 0;
      margin: 0 -5px 7px -5px;
    }
    .meta-card {
      width: 25%;
      border: 1px solid #d1d5db;
      border-left: 3px solid #f97316;
      background: #f9fafb;
      padding: 5px 7px;
      vertical-align: top;
    }
    .meta-label {
      color: #6b7280;
      font-size: 8px;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .meta-value {
      color: #111111;
      font-size: 10px;
      font-weight: 800;
    }
    .section {
      margin-top: 7px;
      page-break-inside: avoid;
    }
    .section h2 {
      margin: 0 0 4px;
      color: #111111;
      font-size: 10px;
      font-weight: 800;
      border-left: 3px solid #f97316;
      padding-left: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .detail-table th {
      width: 18%;
      background: #f3f4f6;
      color: #374151;
      font-weight: 700;
      text-align: left;
    }
    .detail-table td {
      width: 32%;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 4px 5px;
      vertical-align: top;
      word-break: break-word;
    }
    .data-table {
      font-size: 8.8px;
      margin-bottom: 5px;
    }
    .data-table th {
      background: #1d1d1d;
      color: #ffffff;
      font-weight: 800;
      text-align: left;
      border-color: #1d1d1d;
      padding: 4px 5px;
    }
    .data-table td {
      padding: 4px 5px;
    }
    .resource-layout {
      width: 100%;
      border-collapse: separate;
      border-spacing: 6px 0;
      margin: 0 -6px 6px;
      table-layout: fixed;
    }
    .resource-layout > tbody > tr > td {
      width: 50%;
      border: 0;
      padding: 0 6px;
      vertical-align: top;
    }
    .summary-table th {
      width: 18%;
      background: #f3f4f6;
      color: #374151;
      font-weight: 800;
      text-align: left;
    }
    .summary-table td {
      min-height: 28px;
    }
    .text-box {
      border: 1px solid #d1d5db;
      min-height: 32px;
      padding: 5px 6px;
      white-space: normal;
    }
    .muted, .empty-photo { color: #64748b; }
    .photo-section {
      page-break-inside: auto;
    }
    .photo-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 5px;
      margin: 0 -5px;
    }
    .photo-cell {
      width: 50%;
      border: 1px solid #d1d5db;
      padding: 4px;
      page-break-inside: avoid;
      vertical-align: top;
    }
    .photo-cell img {
      width: 100%;
      height: 132px;
      object-fit: cover;
      display: block;
    }
    .caption {
      margin-top: 4px;
      color: #64748b;
      font-size: 8.5px;
    }
    .signature-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
    }
    .signature-table td {
      border: 0;
      width: 33.333%;
      text-align: center;
      padding: 4px 18px 0;
      color: #111111;
    }
    .signature-line {
      margin: 16px 0 4px;
      border-top: 1px solid #111111;
      height: 1px;
    }
    .stamp {
      color: #64748b;
      font-size: 8.5px;
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
        <div class="report-title">Daily Site Report / รายงานประจำวัน</div>
        <div class="report-subtitle">${escapeHtml(report.project_id)} | ${escapeHtml(report.project_name || "-")} | เลขที่เอกสาร: ${escapeHtml(report.document_no)}</div>
      </td>
    </tr>
  </table>

  <table class="doc-control-table">
    <tr>
      <th>Document No.</th>
      <th>Report Date</th>
      <th>Project Code</th>
      <th>Prepared By</th>
      <th>Generated At</th>
    </tr>
    <tr>
      <td>${escapeHtml(report.document_no)}</td>
      <td>${escapeHtml(formatThaiDate(report.date))}</td>
      <td>${escapeHtml(report.project_id)}</td>
      <td>${escapeHtml(report.prepared_by_name || "-")}</td>
      <td>${escapeHtml(formatThaiDateTime(report.prepared_at))}</td>
    </tr>
  </table>

  <table class="meta-table">
    <tr>
      ${renderMetaCard("วันที่รายงาน", formatThaiDate(report.date))}
      ${renderMetaCard("สภาพอากาศ", report.weather || "-")}
      ${renderMetaCard("บุคลากรรวม", `${report.workers || "0"} คน`)}
      ${renderMetaCard("เครื่องจักร/วัสดุ/รูป", `${machineryCount}/${materialCount}/${photoCount}`)}
    </tr>
  </table>

  <div class="section">
    <h2>ข้อมูลโครงการ</h2>
    <table class="detail-table">
      ${renderDetailRow("ชื่อโครงการ", report.project_name, "หมายเลขโครงการ", report.project_id)}
      ${renderDetailRow("เจ้าของโครงการ", report.project_owner, "ระยะเวลาโครงการ", projectPeriod)}
      ${renderDetailRow("สถานที่ตั้ง", report.project_location, "ผู้จัดทำรายงาน", `${report.prepared_by_name || "-"} / ${report.prepared_by_position || "-"}`)}
    </table>
  </div>

  <div class="section">
    <h2>Resource Log / ตารางทรัพยากรประจำวัน</h2>
    <table class="resource-layout">
      <tr>
        <td>
          <table class="data-table">
            <thead><tr><th style="width: 30px;">ลำดับ</th><th>บุคลากร</th><th style="width: 54px;">จำนวน</th><th>หมายเหตุ</th></tr></thead>
            <tbody>${renderRows(report.personnel, [
              { key: "index", label: "ลำดับ" },
              { key: "role", label: "บุคลากร" },
              { key: "qty", label: "จำนวน" },
              { key: "note", label: "หมายเหตุ" },
            ], "ไม่มีข้อมูลบุคลากร")}</tbody>
          </table>
        </td>
        <td>
          <table class="data-table">
            <thead><tr><th style="width: 30px;">ลำดับ</th><th>เครื่องมือ/เครื่องจักร</th><th style="width: 46px;">จำนวน</th><th style="width: 54px;">ชม.</th></tr></thead>
            <tbody>${renderRows(report.machinery, [
              { key: "index", label: "ลำดับ" },
              { key: "name", label: "เครื่องมือ/เครื่องจักร" },
              { key: "qty", label: "จำนวน" },
              { key: "hours", label: "ชม." },
            ], "ไม่มีข้อมูลเครื่องมือ/เครื่องจักร")}</tbody>
          </table>
        </td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h2>Work Summary / สรุปการปฏิบัติงาน</h2>
    <table class="summary-table">
      <tr>
        <th>งานที่ปฏิบัติ</th>
        <td>${nl2br(report.work_done || "-")}</td>
      </tr>
      <tr>
        <th>ปัญหา/อุปสรรค</th>
        <td>${nl2br(report.issues || "-")}</td>
      </tr>
      <tr>
        <th>แนวทางแก้ไข</th>
        <td>${nl2br(report.solutions || "-")}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h2>วัสดุที่นำไปใช้</h2>
    <table class="data-table">
      <thead><tr><th style="width: 40px;">ลำดับ</th><th>รายการวัสดุ</th><th style="width: 90px;">จำนวน</th><th style="width: 90px;">หน่วย</th><th>หมายเหตุ</th></tr></thead>
      <tbody>${renderRows(report.materials, [
        { key: "index", label: "ลำดับ" },
        { key: "name", label: "รายการวัสดุ" },
        { key: "qty", label: "จำนวน" },
        { key: "unit", label: "หน่วย" },
        { key: "note", label: "หมายเหตุ" },
      ], "ไม่มีข้อมูลวัสดุ")}</tbody>
    </table>
  </div>

  <table class="signature-table">
    <tr>
      <td></td>
      <td>
        ผู้จัดทำรายงาน
        <div class="signature-line"></div>
        <div>${escapeHtml(report.prepared_by_name || "-")}</div>
        <div class="stamp">${escapeHtml(report.prepared_by_position || "-")}</div>
        <div class="stamp">${escapeHtml(report.prepared_by_email || "")}</div>
      </td>
      <td></td>
    </tr>
  </table>

  ${photos.length > 0 ? `<div class="section photo-section">
    <h2>รูปภาพประกอบรายงาน</h2>
    ${renderPhotoGrid(photos)}
  </div>` : ""}
</body>
</html>`;
}

export function buildDailyReportLineFlex({
  report,
  pdfUrl,
  photosFolderUrl,
  photoCount = 0,
}: {
  report: DailyReportPayload;
  pdfUrl?: string;
  photosFolderUrl?: string;
  photoCount?: number;
}) {
  const hasIssues = Boolean(report.issues?.trim());
  const footerContents = [
    ...(pdfUrl ? [{
      type: "button",
      style: "primary",
      color: "#111827",
      action: { type: "uri", label: "เปิด PDF รายงาน", uri: pdfUrl },
    }] : []),
    ...(photosFolderUrl ? [{
      type: "button",
      style: "secondary",
      action: { type: "uri", label: "ดูรูปภาพประกอบ", uri: photosFolderUrl },
    }] : []),
  ];

  return {
    type: "flex",
    altText: `รายงานประจำวัน | ${report.project_name || report.project_id} | ${report.document_no}`,
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
          { type: "text", text: "PMC CONNEXT DAILY REPORT", color: "#7dd3fc", weight: "bold", size: "xs" },
          { type: "text", text: "รายงานประจำวัน", color: "#ffffff", weight: "bold", size: "lg", margin: "xs" },
          { type: "text", text: report.document_no || report.report_id, color: "#fef3c7", size: "sm", margin: "xs", wrap: true },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "18px",
        contents: [
          { type: "text", text: report.project_name || report.project_id, color: "#0f172a", weight: "bold", size: "lg", wrap: true },
          lineInfoRow("วันที่", formatThaiDate(report.date)),
          lineInfoRow("สภาพอากาศ", report.weather || "-"),
          lineInfoRow("บุคลากรรวม", `${report.workers || "0"} คน`),
          lineInfoRow("ผู้จัดทำ", report.prepared_by_name || "-"),
          { type: "separator", margin: "md", color: "#e5e7eb" },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            margin: "md",
            contents: [
              { type: "text", text: "งานที่ปฏิบัติ", color: "#64748b", size: "xs" },
              { type: "text", text: trimLineText(report.work_done || "-"), color: "#0f172a", size: "sm", wrap: true },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            margin: "sm",
            contents: [
              { type: "text", text: "ปัญหา/อุปสรรค", color: "#64748b", size: "xs" },
              {
                type: "text",
                text: hasIssues ? trimLineText(report.issues) : "ไม่มี",
                color: hasIssues ? "#b91c1c" : "#0f172a",
                size: "sm",
                weight: hasIssues ? "bold" : "regular",
                wrap: true,
              },
            ],
          },
          ...(photoCount > 0 ? [{ type: "text", text: `แนบรูปภาพ ${photoCount} รูป`, color: "#94a3b8", size: "xxs", margin: "sm" }] : []),
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

function lineInfoRow(label: string, value: string) {
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

function trimLineText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 360 ? `${normalized.slice(0, 357)}...` : normalized;
}
