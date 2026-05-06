import fs from "fs";
import path from "path";
import { formatThaiDate, formatThaiDateTime, stringifyRows, type DailyReportTableRow } from "./dailyReports";

export type MonthlyReportTableRow = DailyReportTableRow;

export type MonthlyReportPayload = {
  report_id: string;
  document_no: string;
  project_id: string;
  project_name: string;
  project_location: string;
  project_start_date: string;
  project_end_date: string;
  project_owner: string;
  month: string;
  month_start: string;
  month_end: string;
  preface: string;
  meeting_summary: string;
  next_month_plan_note: string;
  weekly_reports: MonthlyReportTableRow[];
  daily_summary: MonthlyReportTableRow[];
  progress: MonthlyReportTableRow[];
  next_month_plan: MonthlyReportTableRow[];
  photos: MonthlyReportTableRow[];
  weather: MonthlyReportTableRow[];
  personnel: MonthlyReportTableRow[];
  machinery: MonthlyReportTableRow[];
  materials: MonthlyReportTableRow[];
  issues: MonthlyReportTableRow[];
  approvals: MonthlyReportTableRow[];
  certifications: MonthlyReportTableRow[];
  inspections: MonthlyReportTableRow[];
  field_engineer_name: string;
  field_engineer_email: string;
  field_engineer_position: string;
  project_manager_name: string;
  prepared_at: string;
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
  return escapeHtml(value || "-").replaceAll("\n", "<br>");
}

function countRows(rows: MonthlyReportTableRow[]) {
  return rows.filter((row) => Object.values(row).some(Boolean)).length;
}

function renderRows(rows: MonthlyReportTableRow[], columns: { key: string; label: string; width?: string }[], emptyText: string) {
  const widths = columns.map((column) => column.width ? ` style="width:${column.width};"` : "");
  if (rows.length === 0) {
    return `
      <thead><tr>${columns.map((column, index) => `<th${widths[index]}>${escapeHtml(column.label)}</th>`).join("")}</tr></thead>
      <tbody><tr><td colspan="${columns.length}" class="muted">${escapeHtml(emptyText)}</td></tr></tbody>
    `;
  }

  return `
    <thead><tr>${columns.map((column, index) => `<th${widths[index]}>${escapeHtml(column.label)}</th>`).join("")}</tr></thead>
    <tbody>
      ${rows.map((row, rowIndex) => `
        <tr>
          ${columns.map((column) => {
            const value = column.key === "index" ? String(rowIndex + 1) : row[column.key] || "";
            return `<td>${escapeHtml(value || "-")}</td>`;
          }).join("")}
        </tr>
      `).join("")}
    </tbody>
  `;
}

function renderInfoRow(label: string, value: string, label2: string, value2: string) {
  return `
    <tr>
      <th>${escapeHtml(label)}</th>
      <td>${escapeHtml(value || "-")}</td>
      <th>${escapeHtml(label2)}</th>
      <td>${escapeHtml(value2 || "-")}</td>
    </tr>
  `;
}

function renderMetric(label: string, value: string) {
  return `
    <td class="metric">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(value)}</div>
    </td>
  `;
}

function renderSection(title: string, body: string, options: { pageBreak?: boolean; compact?: boolean } = {}) {
  return `
    <section class="section ${options.pageBreak ? "page-break" : ""} ${options.compact ? "compact" : ""}">
      <h2>${escapeHtml(title)}</h2>
      ${body}
    </section>
  `;
}

export function stringifyMonthlyRows(rows: MonthlyReportTableRow[]) {
  return stringifyRows(rows);
}

export function buildMonthlyReportHtml(report: MonthlyReportPayload) {
  const logoDataUrl = getLogoDataUrl();
  const monthLabel = new Intl.DateTimeFormat("th-TH", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${report.month_start}T00:00:00+07:00`));
  const projectPeriod = `${formatThaiDate(report.project_start_date)} - ${formatThaiDate(report.project_end_date)}`;
  const reportPeriod = `${formatThaiDate(report.month_start)} - ${formatThaiDate(report.month_end)}`;
  const averageProgress = report.progress
    .map((row) => Number(row.actual_percent || row.percent_done || 0))
    .filter((value) => Number.isFinite(value));
  const progressPercent = averageProgress.length
    ? `${Math.round(averageProgress.reduce((sum, value) => sum + value, 0) / averageProgress.length)}%`
    : "-";

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&display=swap');
    @page { size: A4; margin: 11mm 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111111;
      font-family: "Kanit", "Noto Sans Thai", "Tahoma", "Arial", sans-serif;
      font-size: 9.2px;
      line-height: 1.32;
    }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #d1d5db; padding: 4px 5px; vertical-align: top; word-break: break-word; }
    .cover {
      min-height: 270mm;
      border: 1px solid #111111;
      padding: 10mm 15mm 12mm;
      position: relative;
    }
    .cover-top { display: table; width: 100%; border-bottom: 2px solid #111111; padding-bottom: 5mm; }
    .cover-logo { display: table-cell; width: 34mm; vertical-align: middle; }
    .cover-logo img { width: 30mm; height: auto; display: block; }
    .cover-company { display: table-cell; vertical-align: middle; }
    .company { font-size: 18px; font-weight: 800; line-height: 1.08; }
    .address { color: #475569; font-size: 8.8px; margin-top: 2px; }
    .cover-title { margin-top: 13mm; }
    .cover-title .eyebrow { color: #f97316; font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .cover-title h1 { margin: 3mm 0 2mm; font-size: 27px; line-height: 1.12; font-weight: 800; }
    .cover-title .thai-title { font-size: 18px; font-weight: 700; color: #111111; }
    .cover-grid { margin-top: 7mm; }
    .cover-grid th { width: 32%; background: #f3f4f6; text-align: left; font-weight: 800; }
    .cover-footer { margin-top: 10mm; border-top: 2px solid #111111; padding-top: 5mm; }
    .header { border-bottom: 2px solid #111111; margin-bottom: 7px; }
    .header td { border: 0; padding: 0 0 7px; vertical-align: middle; }
    .logo-cell { width: 112px; padding-right: 12px !important; }
    .logo-cell img { width: 98px; height: auto; display: block; }
    .doc-company { font-size: 16px; font-weight: 800; line-height: 1.1; }
    .doc-title { margin-top: 3px; font-size: 11.5px; font-weight: 800; }
    .doc-subtitle { margin-top: 2px; color: #475569; font-size: 8.5px; }
    .control th { background: #111111; color: #ffffff; border-color: #111111; text-align: left; font-size: 8px; }
    .control td { font-weight: 700; font-size: 8.5px; }
    .metrics { border-collapse: separate; border-spacing: 5px 0; margin: 6px -5px 7px; }
    .metric { width: 20%; border: 1px solid #d1d5db; border-left: 3px solid #f97316; background: #f9fafb; padding: 5px 6px; }
    .metric-label { color: #64748b; font-size: 7.5px; font-weight: 700; }
    .metric-value { font-size: 11px; font-weight: 800; margin-top: 1px; }
    .section { margin-top: 7px; page-break-inside: avoid; }
    .section h2 { margin: 0 0 4px; border-left: 3px solid #f97316; padding-left: 6px; font-size: 10.2px; font-weight: 800; }
    .compact { margin-top: 5px; }
    .page-break { page-break-before: always; }
    .info th { width: 18%; background: #f3f4f6; color: #374151; text-align: left; font-weight: 800; }
    .data { font-size: 8.2px; }
    .data th { background: #1d1d1d; color: #ffffff; border-color: #1d1d1d; text-align: left; font-weight: 800; }
    .summary-box { border: 1px solid #cbd5e1; background: #f8fafc; padding: 6px 7px; min-height: 24px; }
    .two-col { border-collapse: separate; border-spacing: 6px 0; margin: 0 -6px; }
    .two-col > tbody > tr > td { width: 50%; border: 0; padding: 0 6px; }
    .muted { color: #64748b; }
    .toc td:first-child { width: 32px; text-align: center; font-weight: 800; }
    .signature { margin-top: 12px; }
    .signature td { border: 0; width: 33.333%; text-align: center; padding: 5px 18px 0; }
    .line { border-top: 1px solid #111111; margin: 16px 0 4px; height: 1px; }
    .stamp { color: #64748b; font-size: 8px; }
  </style>
</head>
<body>
  <div class="cover">
    <div class="cover-top">
      <div class="cover-logo">${logoDataUrl ? `<img src="${logoDataUrl}" alt="Pichayamongkol Construction Co., Ltd.">` : ""}</div>
      <div class="cover-company">
        <div class="company">Pichayamongkol Construction Co., Ltd.</div>
        <div class="address">276/1 Soi Phuttha Bucha 36, Bang Mot, Thung Khru, Bangkok 10140</div>
      </div>
    </div>
    <div class="cover-title">
      <div class="eyebrow">Monthly Construction Progress Report</div>
      <h1>รายงานผลความก้าวหน้าการก่อสร้างประจำเดือน</h1>
      <div class="thai-title">${escapeHtml(monthLabel)}</div>
    </div>
    <table class="cover-grid">
      ${renderInfoRow("ชื่อโครงการ", report.project_name, "เลขที่โครงการ", report.project_id)}
      ${renderInfoRow("เจ้าของโครงการ", report.project_owner, "เลขที่เอกสาร", report.document_no)}
      ${renderInfoRow("สถานที่ตั้ง", report.project_location, "ช่วงรายงาน", reportPeriod)}
    </table>
    <div class="cover-footer">
      <table>
        <tr>
          <td><strong>จัดทำโดย</strong><br>${escapeHtml(report.field_engineer_name || "-")}<br><span class="stamp">${escapeHtml(report.field_engineer_position || "วิศวกรสนาม")}</span></td>
          <td><strong>ตรวจสอบโดย</strong><br>${escapeHtml(report.project_manager_name || "-")}<br><span class="stamp">Project Manager</span></td>
          <td><strong>วันที่จัดทำ</strong><br>${escapeHtml(formatThaiDateTime(report.prepared_at))}</td>
        </tr>
      </table>
    </div>
  </div>

  <table class="header page-break">
    <tr>
      <td class="logo-cell">${logoDataUrl ? `<img src="${logoDataUrl}" alt="Pichayamongkol Construction Co., Ltd.">` : ""}</td>
      <td>
        <div class="doc-company">Pichayamongkol Construction Co., Ltd.</div>
        <div class="doc-title">Monthly Construction Progress Report / รายงานผลความก้าวหน้าการก่อสร้างประจำเดือน</div>
        <div class="doc-subtitle">${escapeHtml(report.project_id)} | ${escapeHtml(report.project_name)} | ${escapeHtml(report.document_no)}</div>
      </td>
    </tr>
  </table>

  <table class="control">
    <tr>
      <th>Document No.</th>
      <th>Report Month</th>
      <th>Project Code</th>
      <th>Field Engineer</th>
      <th>Project Manager</th>
      <th>Generated At</th>
    </tr>
    <tr>
      <td>${escapeHtml(report.document_no)}</td>
      <td>${escapeHtml(monthLabel)}</td>
      <td>${escapeHtml(report.project_id)}</td>
      <td>${escapeHtml(report.field_engineer_name || "-")}</td>
      <td>${escapeHtml(report.project_manager_name || "-")}</td>
      <td>${escapeHtml(formatThaiDateTime(report.prepared_at))}</td>
    </tr>
  </table>

  <table class="metrics">
    <tr>
      ${renderMetric("ช่วงรายงาน", reportPeriod)}
      ${renderMetric("Weekly Report", `${countRows(report.weekly_reports)} ฉบับ`)}
      ${renderMetric("Daily Report", `${countRows(report.daily_summary)} วัน`)}
      ${renderMetric("Progress เฉลี่ย", progressPercent)}
      ${renderMetric("ประเด็นติดตาม", `${countRows(report.issues)} รายการ`)}
    </tr>
  </table>

  ${renderSection("คำนำ / หมายเหตุรายงาน", `<div class="summary-box">${nl2br(report.preface)}</div>`)}
  ${renderSection("สารบัญ", `
    <table class="toc">
      <tr><td>1</td><td>ข้อมูลโครงการและบุคลากรโครงการ</td></tr>
      <tr><td>2</td><td>สรุปผลการประชุมและคำสั่ง/การแก้ไข</td></tr>
      <tr><td>3</td><td>สรุปผลความก้าวหน้าของงานในปัจจุบัน</td></tr>
      <tr><td>4</td><td>แผนการดำเนินงานในเดือนถัดไป</td></tr>
      <tr><td>5</td><td>รูปถ่าย แรงงาน เครื่องจักร สภาพอากาศ และวัสดุ</td></tr>
      <tr><td>6</td><td>เอกสารขออนุมัติ การรับรองงาน และการตรวจสอบงาน</td></tr>
    </table>
  `)}
  ${renderSection("ข้อมูลโครงการและบุคลากรโครงการ", `
    <table class="info">
      ${renderInfoRow("ชื่อโครงการ", report.project_name, "หมายเลขโครงการ", report.project_id)}
      ${renderInfoRow("เจ้าของโครงการ", report.project_owner, "ระยะเวลาโครงการ", projectPeriod)}
      ${renderInfoRow("สถานที่ตั้ง", report.project_location, "ช่วงรายงาน", reportPeriod)}
      ${renderInfoRow("วิศวกรสนาม", report.field_engineer_name, "ผู้จัดการโครงการ", report.project_manager_name)}
    </table>
  `)}
  ${renderSection("ผังพอสังเขปและผังบริเวณของโครงการ", `<div class="summary-box">ส่วนแนบผังโครงการสามารถเพิ่มจากไฟล์โครงการในระยะถัดไป ปัจจุบันรายงานฉบับนี้อ้างอิงข้อมูลสถานที่ตั้งและเอกสารโครงการในระบบ PMC CONNEXT</div>`)}
  ${renderSection("บันทึกการประชุม / สรุปผลการประชุม", `<div class="summary-box">${nl2br(report.meeting_summary)}</div>`)}

  ${renderSection("สรุปผลความก้าวหน้าของงานในปัจจุบัน", `
    <table class="data">
      ${renderRows(report.progress, [
        { key: "index", label: "ลำดับ", width: "32px" },
        { key: "category", label: "หมวดงาน" },
        { key: "item", label: "รายการงาน" },
        { key: "planned_percent", label: "% แผน", width: "52px" },
        { key: "actual_percent", label: "% จริง", width: "52px" },
        { key: "variance", label: "ส่วนต่าง", width: "52px" },
        { key: "status", label: "สถานะ", width: "72px" },
        { key: "note", label: "หมายเหตุ" },
      ], "ไม่มีข้อมูลความก้าวหน้าในเดือนนี้")}
    </table>
  `, { pageBreak: true })}
  ${renderSection("Weekly Report ที่ใช้ประกอบรายงาน", `
    <table class="data">
      ${renderRows(report.weekly_reports, [
        { key: "index", label: "ลำดับ", width: "32px" },
        { key: "week_period", label: "ช่วงสัปดาห์" },
        { key: "document_no", label: "เลขที่เอกสาร" },
        { key: "progress_count", label: "รายการ Progress", width: "80px" },
        { key: "issue_count", label: "ประเด็นติดตาม", width: "80px" },
      ], "ยังไม่มี Weekly Report ที่บันทึกในเดือนนี้")}
    </table>
  `)}
  ${renderSection("แผนการดำเนินงานในเดือนถัดไป", `
    <div class="summary-box">${nl2br(report.next_month_plan_note)}</div>
    <table class="data" style="margin-top:5px;">
      ${renderRows(report.next_month_plan, [
        { key: "index", label: "ลำดับ", width: "32px" },
        { key: "category", label: "หมวดงาน" },
        { key: "item", label: "รายการงาน" },
        { key: "period", label: "ช่วงแผน" },
        { key: "status", label: "สถานะ", width: "72px" },
        { key: "note", label: "หมายเหตุ" },
      ], "ยังไม่มี Tasks/Schedule ของเดือนถัดไป")}
    </table>
  `)}
  ${renderSection("ปัญหา อุปสรรค และแนวทางการแก้ไข", `
    <table class="data">
      ${renderRows(report.issues, [
        { key: "index", label: "ลำดับ", width: "32px" },
        { key: "date", label: "วันที่", width: "74px" },
        { key: "description", label: "ปัญหา/อุปสรรค" },
        { key: "solution", label: "แนวทางการแก้ไข" },
        { key: "status", label: "สถานะ", width: "78px" },
      ], "ไม่มีประเด็นปัญหาหรืออุปสรรคที่บันทึกในเดือนนี้")}
    </table>
  `)}

  ${renderSection("รูปถ่ายแสดงความก้าวหน้าของงาน", `
    <table class="data">
      ${renderRows(report.photos, [
        { key: "index", label: "ลำดับ", width: "32px" },
        { key: "date", label: "วันที่", width: "74px" },
        { key: "document_no", label: "Daily Report" },
        { key: "count", label: "จำนวนรูป", width: "60px" },
        { key: "folder_url", label: "โฟลเดอร์รูปภาพ" },
      ], "ไม่มีรูปภาพแนบในเดือนนี้")}
    </table>
  `, { pageBreak: true })}
  ${renderSection("ตารางแรงงานและเครื่องจักร", `
    <table class="two-col">
      <tr>
        <td>
          <table class="data">
            ${renderRows(report.personnel, [
              { key: "index", label: "ลำดับ", width: "30px" },
              { key: "role", label: "บุคลากร" },
              { key: "total_qty", label: "รวม", width: "54px" },
              { key: "avg_qty", label: "เฉลี่ย/วัน", width: "64px" },
              { key: "work_days", label: "วันทำงาน", width: "60px" },
            ], "ไม่มีข้อมูลแรงงาน")}
          </table>
        </td>
        <td>
          <table class="data">
            ${renderRows(report.machinery, [
              { key: "index", label: "ลำดับ", width: "30px" },
              { key: "name", label: "เครื่องจักร" },
              { key: "qty", label: "จำนวน", width: "54px" },
              { key: "hours", label: "ชม.", width: "54px" },
              { key: "note", label: "หมายเหตุ" },
            ], "ไม่มีข้อมูลเครื่องจักร")}
          </table>
        </td>
      </tr>
    </table>
  `)}
  ${renderSection("ตารางแสดงสภาพอากาศและวัสดุที่ใช้", `
    <table class="two-col">
      <tr>
        <td>
          <table class="data">
            ${renderRows(report.weather, [
              { key: "index", label: "ลำดับ", width: "30px" },
              { key: "weather", label: "สภาพอากาศ" },
              { key: "days", label: "จำนวนวัน", width: "60px" },
            ], "ไม่มีข้อมูลสภาพอากาศ")}
          </table>
        </td>
        <td>
          <table class="data">
            ${renderRows(report.materials, [
              { key: "index", label: "ลำดับ", width: "30px" },
              { key: "name", label: "วัสดุ" },
              { key: "qty", label: "จำนวน", width: "60px" },
              { key: "unit", label: "หน่วย", width: "54px" },
            ], "ไม่มีข้อมูลวัสดุ")}
          </table>
        </td>
      </tr>
    </table>
  `)}

  ${renderSection("ตารางสรุปเอกสารขออนุมัติต่าง ๆ", `
    <table class="data">
      ${renderRows(report.approvals, [
        { key: "index", label: "ลำดับ", width: "32px" },
        { key: "document_no", label: "เลขที่เอกสาร" },
        { key: "type", label: "ประเภท", width: "72px" },
        { key: "subject", label: "เรื่อง" },
        { key: "status", label: "สถานะ", width: "74px" },
        { key: "note", label: "หมายเหตุ" },
      ], "ยังไม่มีข้อมูลเอกสารขออนุมัติจากโมดูล RFA/RFI/Approval")}
    </table>
  `, { pageBreak: true })}
  ${renderSection("ตารางสรุปการรับรองงานก่อสร้าง", `
    <table class="data">
      ${renderRows(report.certifications, [
        { key: "index", label: "ลำดับ", width: "32px" },
        { key: "document_no", label: "เลขที่เอกสาร" },
        { key: "work_item", label: "รายการงาน" },
        { key: "status", label: "สถานะ", width: "78px" },
        { key: "note", label: "หมายเหตุ" },
      ], "ยังไม่มีข้อมูลการรับรองงานก่อสร้าง")}
    </table>
  `)}
  ${renderSection("แบบรายงานผลการตรวจสอบงานก่อสร้าง", `
    <table class="data">
      ${renderRows(report.inspections, [
        { key: "index", label: "ลำดับ", width: "32px" },
        { key: "date", label: "วันที่", width: "74px" },
        { key: "item", label: "รายการตรวจสอบ" },
        { key: "result", label: "ผลการตรวจสอบ", width: "90px" },
        { key: "note", label: "หมายเหตุ" },
      ], "ยังไม่มีข้อมูลแบบรายงานผลการตรวจสอบงานก่อสร้าง")}
    </table>
  `)}

  <table class="signature">
    <tr>
      <td>
        วิศวกรสนาม / Field Engineer
        <div class="line"></div>
        <div>${escapeHtml(report.field_engineer_name || "-")}</div>
        <div class="stamp">${escapeHtml(report.field_engineer_email || "")}</div>
      </td>
      <td>
        ผู้ตรวจสอบ / Project Manager
        <div class="line"></div>
        <div>${escapeHtml(report.project_manager_name || "-")}</div>
      </td>
      <td>
        รับทราบ / Owner Representative
        <div class="line"></div>
        <div class="stamp">(........................................)</div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
