import fs from "fs";
import path from "path";
import { formatThaiDate, formatThaiDateTime, parseJsonRows, stringifyRows, type DailyReportTableRow } from "./dailyReports";

export type WeeklyReportTableRow = DailyReportTableRow;

export type WeeklyReportPayload = {
  report_id: string;
  document_no: string;
  project_id: string;
  project_name: string;
  project_location: string;
  project_start_date: string;
  project_end_date: string;
  project_owner: string;
  week_start: string;
  week_end: string;
  work_quantities: WeeklyReportTableRow[];
  materials: WeeklyReportTableRow[];
  machinery: WeeklyReportTableRow[];
  personnel: WeeklyReportTableRow[];
  progress: WeeklyReportTableRow[];
  instructions: WeeklyReportTableRow[];
  approvals: WeeklyReportTableRow[];
  daily_summaries: WeeklyReportTableRow[];
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

function renderRows(rows: WeeklyReportTableRow[], columns: { key: string; label: string }[], emptyText: string) {
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

function renderMeta(label: string, value: string) {
  return `
    <td class="meta-card">
      <div class="meta-label">${escapeHtml(label)}</div>
      <div class="meta-value">${escapeHtml(value || "-")}</div>
    </td>
  `;
}

function countRows(rows: WeeklyReportTableRow[]) {
  return rows.filter((row) => Object.values(row).some(Boolean)).length;
}

export function parseWeeklyRows(value: FormDataEntryValue | null) {
  return parseJsonRows(value);
}

export function stringifyWeeklyRows(rows: WeeklyReportTableRow[]) {
  return stringifyRows(rows);
}

export function buildWeeklyReportHtml(report: WeeklyReportPayload) {
  const logoDataUrl = getLogoDataUrl();
  const projectPeriod = `${formatThaiDate(report.project_start_date)} - ${formatThaiDate(report.project_end_date)}`;
  const reportPeriod = `${formatThaiDate(report.week_start)} - ${formatThaiDate(report.week_end)}`;

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&display=swap');
    @page { size: A4 landscape; margin: 9mm; }
    body {
      margin: 0;
      color: #111111;
      font-family: "Kanit", "Noto Sans Thai", "Tahoma", "Arial", sans-serif;
      font-size: 8.6px;
      line-height: 1.25;
    }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #d1d5db; padding: 3.5px 4px; vertical-align: top; word-break: break-word; }
    .header { border-bottom: 2px solid #111111; margin-bottom: 6px; }
    .header td { border: 0; padding: 0 0 7px; vertical-align: middle; }
    .logo-cell { width: 118px; padding-right: 12px !important; }
    .logo-cell img { width: 104px; height: auto; display: block; }
    .company { font-size: 17px; font-weight: 800; line-height: 1.1; }
    .address { color: #4b5563; font-size: 8.5px; margin-top: 2px; }
    .title { font-size: 12px; font-weight: 800; margin-top: 4px; }
    .subtitle { color: #374151; font-size: 8.5px; margin-top: 2px; }
    .control th { background: #111111; color: #ffffff; border-color: #111111; text-align: left; font-size: 8px; }
    .control td { font-weight: 700; font-size: 8.3px; }
    .meta-table { border-collapse: separate; border-spacing: 5px 0; margin: 6px -5px 7px; }
    .meta-card { width: 20%; border: 1px solid #d1d5db; border-left: 3px solid #f97316; background: #f9fafb; padding: 4px 6px; }
    .meta-label { color: #6b7280; font-size: 7.5px; font-weight: 700; }
    .meta-value { color: #111111; font-size: 9px; font-weight: 800; margin-top: 1px; }
    .section { margin-top: 6px; page-break-inside: avoid; }
    .section h2 { margin: 0 0 3px; border-left: 3px solid #f97316; padding-left: 6px; font-size: 9.5px; }
    .info th, .summary th { width: 15%; background: #f3f4f6; color: #374151; text-align: left; font-weight: 800; }
    .data { font-size: 8px; }
    .data th { background: #1d1d1d; color: #ffffff; border-color: #1d1d1d; text-align: left; font-weight: 800; }
    .two-col { border-collapse: separate; border-spacing: 6px 0; margin: 0 -6px; }
    .two-col > tbody > tr > td { width: 50%; border: 0; padding: 0 6px; }
    .muted { color: #64748b; }
    .signature { margin-top: 10px; }
    .signature td { border: 0; text-align: center; padding: 4px 18px 0; }
    .line { border-top: 1px solid #111111; margin: 15px 0 4px; height: 1px; }
    .stamp { color: #64748b; font-size: 7.8px; }
    .executive {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 5px 7px;
      margin-top: 6px;
    }
  </style>
</head>
<body>
  <table class="header">
    <tr>
      <td class="logo-cell">${logoDataUrl ? `<img src="${logoDataUrl}" alt="Pichayamongkol Construction Co., Ltd.">` : ""}</td>
      <td>
        <div class="company">Pichayamongkol Construction Co., Ltd.</div>
        <div class="address">276/1 Soi Phuttha Bucha 36, Bang Mot, Thung Khru, Bangkok 10140</div>
        <div class="title">Weekly Progress Report / รายงานประจำสัปดาห์</div>
        <div class="subtitle">${escapeHtml(report.project_id)} | ${escapeHtml(report.project_name)} | เลขที่เอกสาร: ${escapeHtml(report.document_no)}</div>
      </td>
    </tr>
  </table>

  <table class="control">
    <tr>
      <th>Document No.</th>
      <th>Weekly Period</th>
      <th>Project Code</th>
      <th>Field Engineer</th>
      <th>Project Manager</th>
      <th>Generated At</th>
    </tr>
    <tr>
      <td>${escapeHtml(report.document_no)}</td>
      <td>${escapeHtml(reportPeriod)}</td>
      <td>${escapeHtml(report.project_id)}</td>
      <td>${escapeHtml(report.field_engineer_name || "-")}</td>
      <td>${escapeHtml(report.project_manager_name || "-")}</td>
      <td>${escapeHtml(formatThaiDateTime(report.prepared_at))}</td>
    </tr>
  </table>

  <table class="meta-table">
    <tr>
      ${renderMeta("ช่วงรายงาน", reportPeriod)}
      ${renderMeta("ปริมาณงาน", `${countRows(report.work_quantities)} รายการ`)}
      ${renderMeta("ความก้าวหน้า", `${countRows(report.progress)} หมวด`)}
      ${renderMeta("คำสั่ง/แก้ไข", `${countRows(report.instructions)} รายการ`)}
      ${renderMeta("เอกสารอนุมัติ", `${countRows(report.approvals)} รายการ`)}
    </tr>
  </table>

  <div class="section">
    <h2>Project Information / ข้อมูลโครงการ</h2>
    <table class="info">
      ${renderInfoRow("ชื่อโครงการ", report.project_name, "หมายเลขโครงการ", report.project_id)}
      ${renderInfoRow("เจ้าของโครงการ", report.project_owner, "ระยะเวลาโครงการ", projectPeriod)}
      ${renderInfoRow("สถานที่ตั้ง", report.project_location, "ช่วงรายงาน", reportPeriod)}
    </table>
  </div>

  <div class="section">
    <h2>Executive Weekly Summary / สรุปภาพรวมประจำสัปดาห์</h2>
    <div class="executive">
      รายงานฉบับนี้สรุปจาก Daily Report ในช่วง ${escapeHtml(reportPeriod)} จำนวน ${countRows(report.daily_summaries)} วัน
      โดยใช้ข้อมูลบุคลากร วัสดุ เครื่องจักร ปัญหา และรายการงานที่ดำเนินการจริงจากรายงานประจำวัน
      พร้อมอ้างอิงความก้าวหน้าจากแผนงาน/Tasks ของโครงการ
    </div>
  </div>

  <div class="section">
    <h2>Daily Report Source Summary / ข้อมูลตั้งต้นจากรายงานประจำวัน</h2>
    <table class="data">
      <thead><tr><th style="width:75px;">วันที่</th><th>สภาพอากาศ</th><th style="width:55px;">คนงาน</th><th>งานที่ปฏิบัติ</th><th>ปัญหา/แนวทางแก้ไข</th></tr></thead>
      <tbody>${renderRows(report.daily_summaries, [
        { key: "date", label: "วันที่" },
        { key: "weather", label: "สภาพอากาศ" },
        { key: "workers", label: "คนงาน" },
        { key: "work_done", label: "งานที่ปฏิบัติ" },
        { key: "issues", label: "ปัญหา/แนวทางแก้ไข" },
      ], "ไม่มี Daily Report ในช่วงสัปดาห์นี้")}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Weekly Work Quantity / ตารางปริมาณงานที่ทำได้</h2>
    <table class="data">
      <thead><tr><th style="width:30px;">ลำดับ</th><th>หมวดงาน</th><th>รายการงาน</th><th style="width:70px;">แผน</th><th style="width:80px;">สัปดาห์นี้</th><th style="width:70px;">สะสม</th><th style="width:45px;">หน่วย</th><th>หมายเหตุ</th></tr></thead>
      <tbody>${renderRows(report.work_quantities, [
        { key: "index", label: "ลำดับ" },
        { key: "category", label: "หมวดงาน" },
        { key: "item", label: "รายการงาน" },
        { key: "planned", label: "แผน" },
        { key: "this_week", label: "สัปดาห์นี้" },
        { key: "cumulative", label: "สะสม" },
        { key: "unit", label: "หน่วย" },
        { key: "note", label: "หมายเหตุ" },
      ], "ไม่มีข้อมูลปริมาณงาน")}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Weekly Progress / ตารางแสดงความก้าวหน้าของงานในสัปดาห์</h2>
    <table class="data">
      <thead><tr><th style="width:30px;">ลำดับ</th><th>หมวดงาน</th><th style="width:70px;">แผน %</th><th style="width:70px;">จริง %</th><th style="width:60px;">ส่วนต่าง</th><th style="width:85px;">สถานะ</th><th>หมายเหตุ</th></tr></thead>
      <tbody>${renderRows(report.progress, [
        { key: "index", label: "ลำดับ" },
        { key: "category", label: "หมวดงาน" },
        { key: "planned_percent", label: "แผน %" },
        { key: "actual_percent", label: "จริง %" },
        { key: "variance", label: "ส่วนต่าง" },
        { key: "status", label: "สถานะ" },
        { key: "note", label: "หมายเหตุ" },
      ], "ไม่มีข้อมูลความก้าวหน้า")}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Resource & Material Summary / สรุปทรัพยากรและวัสดุ</h2>
    <table class="two-col">
      <tr>
        <td>
          <table class="data">
            <thead><tr><th style="width:28px;">ลำดับ</th><th>วัสดุ</th><th style="width:58px;">สัปดาห์นี้</th><th style="width:58px;">สะสม</th><th style="width:40px;">หน่วย</th></tr></thead>
            <tbody>${renderRows(report.materials, [
              { key: "index", label: "ลำดับ" },
              { key: "name", label: "วัสดุ" },
              { key: "this_week", label: "สัปดาห์นี้" },
              { key: "cumulative", label: "สะสม" },
              { key: "unit", label: "หน่วย" },
            ], "ไม่มีข้อมูลวัสดุ")}</tbody>
          </table>
        </td>
        <td>
          <table class="data">
            <thead><tr><th style="width:28px;">ลำดับ</th><th>เครื่องมือ/เครื่องจักร</th><th style="width:48px;">จำนวน</th><th style="width:55px;">วัน/ชม.</th><th>หมายเหตุ</th></tr></thead>
            <tbody>${renderRows(report.machinery, [
              { key: "index", label: "ลำดับ" },
              { key: "name", label: "เครื่องมือ/เครื่องจักร" },
              { key: "qty", label: "จำนวน" },
              { key: "usage", label: "วัน/ชม." },
              { key: "note", label: "หมายเหตุ" },
            ], "ไม่มีข้อมูลเครื่องมือ/เครื่องจักร")}</tbody>
          </table>
        </td>
      </tr>
    </table>
  </div>

  <div class="section">
    <table class="two-col">
      <tr>
        <td>
          <h2>Personnel / ตารางบุคลากร</h2>
          <table class="data">
            <thead><tr><th style="width:28px;">ลำดับ</th><th>ตำแหน่ง/ประเภท</th><th style="width:70px;">เฉลี่ย/วัน</th><th style="width:65px;">วันทำงาน</th><th>หมายเหตุ</th></tr></thead>
            <tbody>${renderRows(report.personnel, [
              { key: "index", label: "ลำดับ" },
              { key: "role", label: "ตำแหน่ง/ประเภท" },
              { key: "avg_qty", label: "เฉลี่ย/วัน" },
              { key: "work_days", label: "วันทำงาน" },
              { key: "note", label: "หมายเหตุ" },
            ], "ไม่มีข้อมูลบุคลากร")}</tbody>
          </table>
        </td>
        <td>
          <h2>Instructions & Corrective Actions / คำสั่งและการแก้ไข</h2>
          <table class="data">
            <thead><tr><th style="width:58px;">วันที่</th><th>รายการ</th><th style="width:70px;">ผู้สั่งการ</th><th style="width:70px;">สถานะ</th></tr></thead>
            <tbody>${renderRows(report.instructions, [
              { key: "date", label: "วันที่" },
              { key: "description", label: "รายการ" },
              { key: "ordered_by", label: "ผู้สั่งการ" },
              { key: "status", label: "สถานะ" },
            ], "ไม่มีคำสั่งหรือการแก้ไข")}</tbody>
          </table>
        </td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h2>Approval / RFA / RFI Summary / ตารางสรุปเอกสารขอความเห็นชอบและอนุมัติประจำสัปดาห์</h2>
    <table class="data">
      <thead><tr><th style="width:30px;">ลำดับ</th><th style="width:85px;">เลขที่เอกสาร</th><th style="width:70px;">ประเภท</th><th>เรื่อง</th><th style="width:70px;">วันที่ส่ง</th><th style="width:75px;">สถานะ</th><th style="width:90px;">ผู้รับผิดชอบ</th><th>หมายเหตุ</th></tr></thead>
      <tbody>${renderRows(report.approvals, [
        { key: "index", label: "ลำดับ" },
        { key: "document_no", label: "เลขที่เอกสาร" },
        { key: "type", label: "ประเภท" },
        { key: "subject", label: "เรื่อง" },
        { key: "submitted_date", label: "วันที่ส่ง" },
        { key: "status", label: "สถานะ" },
        { key: "owner", label: "ผู้รับผิดชอบ" },
        { key: "note", label: "หมายเหตุ" },
      ], "ไม่มีเอกสารขอความเห็นชอบและอนุมัติในสัปดาห์นี้")}</tbody>
    </table>
  </div>

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
