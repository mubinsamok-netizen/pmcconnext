import fs from "fs";
import path from "path";
import { formatBangkokDateTime } from "@/lib/bangkokDateTime";
import {
  VO_STATUS_LABELS,
  VO_TYPE_LABELS,
  asVoStatus,
  asVoType,
  formatMoney,
  formatThaiDate,
  safeJsonParse,
  type VoItemRecord,
  type VoRecord,
} from "@/lib/variationOrders";

type ProjectLike = {
  project_id?: string;
  name?: string;
  client?: string;
  contract_no?: string;
  address?: string;
  district?: string;
  province?: string;
  pm_name?: string;
};

type DocumentInput = {
  vo: VoRecord;
  items: VoItemRecord[];
  project?: ProjectLike;
  title?: string;
};

type PaymentLike = Record<string, string | number | undefined>;

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

function nl2br(value?: string | number | null) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function formatThaiDateTime(value?: string | number | null) {
  return formatBangkokDateTime(value);
}

function numberCell(value?: string | number) {
  return `<td class="num">${formatMoney(value)}</td>`;
}

function documentShell(title: string, subtitle: string, body: string) {
  const logoDataUrl = getLogoDataUrl();
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4; margin: 11mm 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      font-family: "Kanit", "Noto Sans Thai", "Tahoma", "Arial", sans-serif;
      font-size: 10px;
      line-height: 1.45;
      background: #ffffff;
    }
    .doc { min-height: 275mm; border: 1.4px solid #111827; padding: 9mm; position: relative; }
    .header { display: grid; grid-template-columns: 34mm 1fr auto; gap: 8mm; align-items: center; border-bottom: 2px solid #111827; padding-bottom: 6mm; }
    .logo { width: 30mm; height: 14mm; object-fit: contain; }
    .company { font-size: 15px; font-weight: 800; letter-spacing: 0; }
    .addr { margin-top: 1mm; color: #64748b; font-size: 8.2px; max-width: 110mm; }
    .doc-code { text-align: right; }
    .doc-code .label { color: #f97316; font-size: 8px; font-weight: 800; text-transform: uppercase; }
    .doc-code .value { margin-top: 1mm; font-size: 13px; font-weight: 800; color: #111827; }
    .title { margin: 6mm 0 4mm; }
    .title .eyebrow { color: #f97316; font-size: 8.5px; font-weight: 800; text-transform: uppercase; }
    h1 { margin: 1mm 0 0; font-size: 19px; line-height: 1.15; font-weight: 800; }
    .subtitle { color: #64748b; font-size: 9px; margin-top: 1mm; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
    .box { border: 1px solid #d1d5db; border-radius: 5px; padding: 3mm; background: #f8fafc; }
    .box h2 { margin: 0 0 2mm; font-size: 10px; color: #111827; }
    .info { width: 100%; border-collapse: collapse; }
    .info th, .info td { border: 0; padding: 1mm 0; vertical-align: top; }
    .info th { width: 30%; color: #64748b; text-align: left; font-weight: 700; }
    table.data { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 4mm; }
    .data th { background: #111827; color: #ffffff; border: 1px solid #111827; padding: 2mm; text-align: left; font-size: 8.4px; }
    .data td { border: 1px solid #d1d5db; padding: 2mm; vertical-align: top; word-break: break-word; }
    .data .num { text-align: right; font-variant-numeric: tabular-nums; }
    .summary { margin-top: 3mm; margin-left: auto; width: 80mm; border-collapse: collapse; }
    .summary th, .summary td { border: 1px solid #d1d5db; padding: 2mm; }
    .summary th { text-align: left; background: #f8fafc; }
    .summary td { text-align: right; font-weight: 800; }
    .summary .grand th, .summary .grand td { background: #fff7ed; color: #c2410c; font-size: 11px; }
    .quick-summary { display: grid; grid-template-columns: 1.1fr 0.9fr 0.9fr; gap: 3mm; margin: 4mm 0; }
    .quick-card { border: 1px solid #d1d5db; border-radius: 6px; background: #f8fafc; padding: 3mm; min-height: 18mm; }
    .quick-card .label { color: #64748b; font-size: 8px; font-weight: 800; }
    .quick-card .value { margin-top: 1mm; color: #111827; font-size: 14px; font-weight: 900; }
    .quick-card .hint { margin-top: 0.5mm; color: #64748b; font-size: 8px; }
    .evidence-box { margin-top: 4mm; border: 1px solid #fdba74; border-radius: 6px; background: #fff7ed; padding: 3mm; }
    .evidence-box h2 { margin: 0 0 2mm; color: #9a3412; font-size: 10px; }
    .evidence-list { margin: 0; padding-left: 5mm; color: #7c2d12; }
    .evidence-list li { margin: 0.8mm 0; }
    .note { margin-top: 4mm; border-left: 3px solid #f97316; padding: 2mm 3mm; background: #fff7ed; color: #7c2d12; }
    .timestamp-corner { position: absolute; top: 29mm; right: 9mm; width: 58mm; border: 1px solid #fdba74; border-radius: 6px; background: #fff7ed; padding: 2mm 3mm; color: #7c2d12; font-size: 8px; }
    .timestamp-corner strong { display: block; color: #9a3412; font-size: 9px; }
    .signatures { position: absolute; left: 9mm; right: 9mm; bottom: 9mm; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; }
    .flow-signatures { position: static; margin-top: 12mm; }
    .sig { text-align: center; color: #111827; }
    .sig .line { border-top: 1px solid #111827; margin: 16mm 0 1.5mm; }
    .sig .role { color: #64748b; font-size: 8.2px; }
    .sig .stamp { margin-top: 0.8mm; color: #111827; font-size: 8px; font-weight: 700; }
    .badge { display: inline-block; border-radius: 999px; padding: 1mm 2.5mm; background: #fff7ed; color: #c2410c; font-weight: 800; font-size: 8px; }
    .paid-stamp { border: 2px solid #16a34a; color: #15803d; display: inline-block; padding: 2mm 5mm; font-size: 15px; font-weight: 800; transform: rotate(-3deg); }
    .page-break { page-break-before: always; }
  </style>
</head>
<body>
  <main class="doc">
    <section class="header">
      ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="Pichayamongkol Construction">` : `<div></div>`}
      <div>
        <div class="company">Pichayamongkol Construction Co., Ltd.</div>
        <div class="addr">276/1 Soi Phuttha Bucha 36, Bang Mot, Thung Khru, Bangkok 10140</div>
      </div>
      <div class="doc-code">
        <div class="label">${escapeHtml(subtitle)}</div>
        <div class="value">${escapeHtml(title)}</div>
      </div>
    </section>
    ${body}
  </main>
</body>
</html>`;
}

function renderCommonInfo({ vo, project }: DocumentInput) {
  const voType = asVoType(String(vo.vo_type || ""));
  const status = asVoStatus(String(vo.status || ""));
  const location = [project?.address, project?.district, project?.province].filter(Boolean).join(" ");

  return `
    <div class="grid">
      <div class="box">
        <h2>ข้อมูลโครงการ</h2>
        <table class="info">
          <tr><th>โครงการ</th><td>${escapeHtml(project?.name || vo.project_id)}</td></tr>
          <tr><th>ลูกค้า</th><td>${escapeHtml(vo.client_name || project?.client || "-")}</td></tr>
          <tr><th>สถานที่</th><td>${escapeHtml(location || "-")}</td></tr>
        </table>
      </div>
      <div class="box">
        <h2>ข้อมูลงานเพิ่ม-ลด</h2>
        <table class="info">
          <tr><th>เลขที่ VO</th><td><strong>${escapeHtml(vo.vo_id)}</strong></td></tr>
          <tr><th>ประเภท</th><td><span class="badge">${escapeHtml(VO_TYPE_LABELS[voType])}</span></td></tr>
          <tr><th>สถานะ</th><td>${escapeHtml(VO_STATUS_LABELS[status])}</td></tr>
          <tr><th>กำหนดอนุมัติ</th><td>${escapeHtml(formatThaiDate(vo.approval_deadline))}</td></tr>
        </table>
      </div>
    </div>
  `;
}

function renderItems(items: VoItemRecord[]) {
  return `
    <table class="data">
      <thead>
        <tr>
          <th style="width:11mm;">ลำดับ</th>
          <th>รายการตามหลักฐาน</th>
          <th style="width:22mm;">จำนวน</th>
          <th style="width:20mm;">หน่วย</th>
          <th style="width:32mm;">ยอดตามหลักฐาน</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, index) => `
          <tr>
            <td class="num">${escapeHtml(item.item_no || index + 1)}</td>
            <td>${escapeHtml(item.description || "-")}</td>
            <td class="num">${escapeHtml(item.quantity || "0")}</td>
            <td>${escapeHtml(item.unit || "-")}</td>
            ${numberCell(item.amount)}
          </tr>
        `).join("")}
        ${items.length === 0 ? `<tr><td colspan="5" style="text-align:center;color:#64748b;">ไม่มีรายการ</td></tr>` : ""}
      </tbody>
    </table>
  `;
}

function renderSummary(vo: VoRecord) {
  return `
    <table class="summary">
      <tr class="grand"><th>ยอดตามหลักฐาน</th><td>${formatMoney(vo.grand_total)} บาท</td></tr>
    </table>
  `;
}

function renderEvidence(input: DocumentInput) {
  const { vo } = input;
  const documentRefs = safeJsonParse<Array<Record<string, string | number>>>(vo.document_refs_json, []);
  const fileLines = documentRefs
    .map((file) => String(file.file_name || file.name || file.original_name || "").trim())
    .filter(Boolean);
  const noteLines = String(vo.supporting_docs || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const lines = [...noteLines, ...fileLines];

  return `
    <section class="evidence-box">
      <h2>หลักฐานแนบ / หมายเหตุ</h2>
      ${lines.length > 0 ? `
        <ul class="evidence-list">
          ${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
        </ul>
      ` : `<div style="color:#9a3412;">แนบหลักฐานในระบบแล้ว หรือรอแนบเพิ่มเติม</div>`}
    </section>
  `;
}

export function buildVoSheetHtml(input: DocumentInput) {
  const { vo, items } = input;
  const voType = asVoType(String(vo.vo_type || ""));
  const status = asVoStatus(String(vo.status || ""));
  const body = `
    <section class="title">
      <div class="eyebrow">Evidence Variation Sheet</div>
      <h1>ใบงานเพิ่ม-ลด</h1>
      <div class="subtitle">สรุปรายการและหลักฐานแนบสำหรับบันทึกงานไซต์</div>
    </section>
    ${renderCommonInfo(input)}
    <section class="quick-summary">
      <div class="quick-card">
        <div class="label">ชื่องาน</div>
        <div class="value">${escapeHtml(vo.title || "-")}</div>
        <div class="hint">${escapeHtml(VO_TYPE_LABELS[voType])} / ${escapeHtml(VO_STATUS_LABELS[status])}</div>
      </div>
      <div class="quick-card">
        <div class="label">ยอดตามหลักฐาน</div>
        <div class="value">${formatMoney(vo.grand_total)} บาท</div>
        <div class="hint">อ้างอิงจากเอกสารแนบ</div>
      </div>
      <div class="quick-card">
        <div class="label">จำนวนวันเพิ่ม</div>
        <div class="value">${formatMoney(vo.extension_days)} วัน</div>
        <div class="hint">ใช้สำหรับประกอบแผนงาน</div>
      </div>
    </section>
    <div class="note"><strong>เหตุผล / รายละเอียด:</strong><br>${nl2br(vo.description || "-")}</div>
    ${renderEvidence(input)}
    ${renderItems(items)}
    ${renderSummary(vo)}
    <section class="signatures">
      <div class="sig"><div class="line"></div><strong>ผู้จัดทำ</strong><div class="role">${escapeHtml(vo.created_by_name || "-")}</div></div>
      <div class="sig"><div class="line"></div><strong>ผู้ตรวจสอบ</strong><div class="role">Project Manager</div></div>
      <div class="sig"><div class="line"></div><strong>ลูกค้า/ผู้อนุมัติ</strong><div class="role">${escapeHtml(vo.client_name || "-")}</div></div>
    </section>
  `;
  return documentShell(vo.vo_id, "VO Sheet", body);
}

export function buildApprovalCertificateHtml(input: DocumentInput) {
  const { vo, items } = input;
  const evidence = safeJsonParse<Record<string, string>>(vo.evidence_json, {});
  const customerApprovedBy = evidence.client_approved_by || String(vo.customer_approved_by || "") || vo.client_name || "-";
  const customerApprovedAt = evidence.approved_at || String(vo.customer_approved_at || "") || evidence.client_approved_date || "";
  const customerApprovalStamp = customerApprovedAt !== "" ? formatThaiDateTime(customerApprovedAt) : "-";
  const body = `
    <section class="title">
      <div class="eyebrow">Approval Certificate</div>
      <h1>หนังสือรับรองการอนุมัติงานเพิ่ม-ลด</h1>
      <div class="subtitle">${escapeHtml(vo.title || "-")}</div>
    </section>
    ${renderCommonInfo(input)}
    ${renderItems(items)}
    ${renderSummary(vo)}
    <div class="box" style="margin-top:4mm;">
      <h2>หลักฐานการอนุมัติแทนลูกค้า</h2>
      <table class="info">
        <tr><th>ผู้ยืนยันฝั่งลูกค้า</th><td>${escapeHtml(evidence.client_approved_by || "-")}</td></tr>
        <tr><th>วันที่ลูกค้ายืนยัน</th><td>${escapeHtml(customerApprovalStamp)}</td></tr>
        <tr><th>ช่องทาง</th><td>${escapeHtml(evidence.channel || "-")}</td></tr>
        <tr><th>หลักฐาน</th><td>${escapeHtml(evidence.evidence_type || "-")} / ${escapeHtml(evidence.evidence_filename || "-")}</td></tr>
        <tr><th>คำอธิบาย</th><td>${nl2br(evidence.evidence_description || "-")}</td></tr>
      </table>
    </div>
    <div class="note">
      บันทึกตามความยินยอมของลูกค้าผ่าน ${escapeHtml(evidence.channel || "-")}
      วันที่ ${escapeHtml(customerApprovalStamp)}
    </div>
    <section class="signatures">
      <div class="sig"><div class="line"></div><strong>ออฟฟิศผู้บันทึก</strong><div class="role">${escapeHtml(evidence.confirmed_by_office || vo.created_by_name || "-")}</div></div>
      <div class="sig"><div class="line"></div><strong>Project Manager</strong><div class="role">${escapeHtml(input.project?.pm_name || "-")}</div></div>
      <div class="sig"><div class="line"></div><strong>ลูกค้า/ผู้ยืนยัน</strong><div class="role">${escapeHtml(customerApprovedBy)}</div><div class="stamp">ยืนยันเมื่อ ${escapeHtml(customerApprovalStamp)}</div></div>
    </section>
  `;
  return documentShell(`${vo.vo_id}-APP`, "Approval Certificate", body);
}

export function buildInvoiceHtml(input: DocumentInput) {
  const { vo, items } = input;
  const body = `
    <section class="title">
      <div class="eyebrow">Invoice</div>
      <h1>ใบแจ้งหนี้งานเพิ่ม-ลด</h1>
      <div class="subtitle">Invoice No. ${escapeHtml(vo.invoice_no || "-")} / Due ${escapeHtml(formatThaiDate(vo.due_date))}</div>
    </section>
    ${renderCommonInfo(input)}
    ${renderItems(items)}
    ${renderSummary(vo)}
    <div class="note">
      โปรดชำระเงินภายในวันที่ ${escapeHtml(formatThaiDate(vo.due_date))}
      และอ้างอิงเลขที่ ${escapeHtml(vo.vo_id)} ในหลักฐานการชำระเงิน
    </div>
    <section class="signatures">
      <div class="sig"><div class="line"></div><strong>ผู้จัดทำใบแจ้งหนี้</strong><div class="role">Accounting</div></div>
      <div class="sig"><div class="line"></div><strong>ผู้ตรวจสอบ</strong><div class="role">Project Manager</div></div>
      <div class="sig"><div class="line"></div><strong>ผู้รับเอกสาร</strong><div class="role">${escapeHtml(vo.client_name || "-")}</div></div>
    </section>
  `;
  return documentShell(String(vo.invoice_no || `${vo.vo_id}-INV`), "Invoice", body);
}

export function buildReceiptHtml(input: DocumentInput & { payment?: PaymentLike; receiptNo?: string }) {
  const { vo, items, payment } = input;
  const receiptNo = input.receiptNo || String(payment?.receipt_no || `RCP-${vo.vo_id}`);
  const body = `
    <section class="title">
      <div class="eyebrow">Receipt</div>
      <h1>ใบเสร็จรับเงินงานเพิ่ม-ลด</h1>
      <div class="subtitle">Receipt No. ${escapeHtml(receiptNo)} / Invoice ${escapeHtml(vo.invoice_no || "-")}</div>
    </section>
    ${renderCommonInfo(input)}
    <div class="box" style="margin-top:4mm;">
      <h2>ข้อมูลการรับชำระ</h2>
      <table class="info">
        <tr><th>วันที่รับชำระ</th><td>${escapeHtml(formatThaiDate(payment?.paid_date || vo.updated_at))}</td></tr>
        <tr><th>ช่องทาง</th><td>${escapeHtml(payment?.payment_method || "-")}</td></tr>
        <tr><th>เลขอ้างอิง</th><td>${escapeHtml(payment?.payment_ref || "-")}</td></tr>
        <tr><th>จำนวนเงินที่รับ</th><td><strong>${formatMoney(payment?.amount_paid)} บาท</strong></td></tr>
      </table>
    </div>
    ${renderItems(items)}
    ${renderSummary(vo)}
    <div class="note">
      ยอดรับชำระสะสม ${formatMoney(vo.amount_paid)} บาท / ยอดคงเหลือ ${formatMoney(vo.balance)} บาท
    </div>
    <div style="margin-top:5mm;">${Number(vo.balance || 0) <= 0 ? `<span class="paid-stamp">PAID</span>` : `<span class="badge">PARTIAL PAYMENT</span>`}</div>
    <section class="signatures">
      <div class="sig"><div class="line"></div><strong>ผู้รับเงิน</strong><div class="role">Accounting</div></div>
      <div class="sig"><div class="line"></div><strong>ผู้ตรวจสอบ</strong><div class="role">Project Manager</div></div>
      <div class="sig"><div class="line"></div><strong>ผู้ชำระเงิน/ลูกค้า</strong><div class="role">${escapeHtml(vo.client_name || "-")}</div></div>
    </section>
  `;
  return documentShell(receiptNo, "Receipt", body);
}

export function buildVoClearanceReportHtml(input: DocumentInput & { taskCount?: number }) {
  const { vo, items, taskCount = 0 } = input;
  const body = `
    <section class="title">
      <div class="eyebrow">VO Clearance Report</div>
      <h1>รายงานปิดสถานะงานเพิ่ม-ลด</h1>
      <div class="subtitle">${escapeHtml(vo.title || "-")}</div>
    </section>
    ${renderCommonInfo(input)}
    ${renderItems(items)}
    ${renderSummary(vo)}
    <div class="box" style="margin-top:4mm;">
      <h2>สรุปการดำเนินการ</h2>
      <table class="info">
        <tr><th>สถานะชำระเงิน</th><td>${Number(vo.balance || 0) <= 0 ? "ชำระครบแล้ว" : "ยังมียอดคงเหลือ"}</td></tr>
        <tr><th>จำนวน task ที่เกี่ยวข้อง</th><td>${escapeHtml(taskCount)}</td></tr>
        <tr><th>การแสดงในแผนงาน</th><td>งานยังอยู่ในแผนงานตามวันที่ PM กำหนด และ badge การชำระเงินถูกอัปเดตแล้ว</td></tr>
      </table>
    </div>
    <div class="note">
      เอกสารนี้ใช้เป็นหลักฐานภายในว่า VO ได้ผ่านขั้นตอนรับชำระและอัปเดตสถานะแผนงานที่เกี่ยวข้องแล้ว
    </div>
    <section class="signatures">
      <div class="sig"><div class="line"></div><strong>Accounting</strong><div class="role">บันทึกรับชำระ</div></div>
      <div class="sig"><div class="line"></div><strong>Project Manager</strong><div class="role">รับทราบผลกระทบแผนงาน</div></div>
      <div class="sig"><div class="line"></div><strong>Site Engineer</strong><div class="role">ดำเนินงานตามแผน</div></div>
    </section>
  `;
  return documentShell(`${vo.vo_id}-CLR`, "Clearance Report", body);
}

export function buildVoMonthlyReportHtml({
  project,
  vos,
  month,
  preparedBy,
  scopeLabel,
  generatedAt,
}: {
  project?: ProjectLike;
  vos: VoRecord[];
  month: string;
  preparedBy?: string;
  scopeLabel?: string;
  generatedAt?: string;
}) {
  const totalPlus = vos.filter((vo) => vo.vo_type === "VO+").reduce((sum, vo) => sum + Number(vo.grand_total || 0), 0);
  const totalMinus = vos.filter((vo) => vo.vo_type === "VO-").reduce((sum, vo) => sum + Number(vo.grand_total || 0), 0);
  const outstanding = vos.reduce((sum, vo) => sum + Number(vo.balance || 0), 0);
  const paid = vos.reduce((sum, vo) => sum + Number(vo.amount_paid || 0), 0);
  const monthLabel = (() => {
    const date = new Date(`${month}-01T00:00:00+07:00`);
    if (Number.isNaN(date.getTime())) return month;
    return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(date);
  })();
  const reportScope = scopeLabel || monthLabel;
  const generatedStamp = formatThaiDateTime(generatedAt || new Date().toISOString());

  const rows = vos.map((vo, index) => {
    const type = asVoType(String(vo.vo_type || ""));
    const status = asVoStatus(String(vo.status || ""));
    return `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(vo.vo_id)}</strong></td>
        <td>${escapeHtml(VO_TYPE_LABELS[type])}</td>
        <td>${escapeHtml(vo.title || "-")}</td>
        <td class="num">${formatMoney(vo.grand_total)}</td>
        <td>${escapeHtml(VO_STATUS_LABELS[status])}</td>
        <td class="num">${formatMoney(vo.balance)}</td>
      </tr>
    `;
  }).join("");

  const body = `
    <div class="timestamp-corner">
      <strong>Timestamp อ้างอิง</strong>
      โหลดข้อมูลเมื่อ ${escapeHtml(generatedStamp)}<br>
      ขอบเขตรายงาน: ${escapeHtml(reportScope)}
    </div>
    <section class="title">
      <div class="eyebrow">Variation Order Register Report</div>
      <h1>รายงานทะเบียนงานเพิ่ม-ลด</h1>
      <div class="subtitle">${escapeHtml(reportScope)} / ${escapeHtml(project?.name || project?.project_id || "-")}</div>
    </section>
    <div class="grid">
      <div class="box">
        <h2>ข้อมูลโครงการ</h2>
        <table class="info">
          <tr><th>โครงการ</th><td>${escapeHtml(project?.name || project?.project_id || "-")}</td></tr>
          <tr><th>ลูกค้า</th><td>${escapeHtml(project?.client || "-")}</td></tr>
          <tr><th>จัดทำโดย</th><td>${escapeHtml(preparedBy || "-")}</td></tr>
          <tr><th>โหลดข้อมูลเมื่อ</th><td>${escapeHtml(generatedStamp)}</td></tr>
        </table>
      </div>
      <div class="box">
        <h2>สรุปตัวเลข</h2>
        <table class="info">
          <tr><th>VO ทั้งหมด</th><td>${vos.length} รายการ</td></tr>
          <tr><th>งานเพิ่ม</th><td>${formatMoney(totalPlus)} บาท</td></tr>
          <tr><th>งานลด</th><td>${formatMoney(totalMinus)} บาท</td></tr>
          <tr><th>รับชำระแล้ว</th><td>${formatMoney(paid)} บาท</td></tr>
          <tr><th>ค้างชำระ</th><td>${formatMoney(outstanding)} บาท</td></tr>
        </table>
      </div>
    </div>
    <table class="data">
      <thead>
        <tr>
          <th style="width:10mm;">#</th>
          <th style="width:32mm;">VO No.</th>
          <th style="width:22mm;">ประเภท</th>
          <th>ชื่องาน</th>
          <th style="width:28mm;">มูลค่า</th>
          <th style="width:28mm;">สถานะ</th>
          <th style="width:28mm;">ค้างชำระ</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="7" style="text-align:center;color:#64748b;">ไม่มี VO ในขอบเขตรายงานนี้</td></tr>`}</tbody>
    </table>
    <div class="note">
      รายงานนี้สรุปรายการงานเพิ่ม-ลดตามข้อมูลที่โหลด ณ timestamp ด้านบน เพื่อใช้อ้างอิงในการประชุมหรือตรวจสอบย้อนหลัง
    </div>
    <section class="signatures flow-signatures">
      <div class="sig"><div class="line"></div><strong>ผู้จัดทำ</strong><div class="role">${escapeHtml(preparedBy || "-")}</div></div>
      <div class="sig"><div class="line"></div><strong>Project Manager</strong><div class="role">ตรวจสอบ</div></div>
      <div class="sig"><div class="line"></div><strong>Owner/ผู้บริหาร</strong><div class="role">รับทราบ</div></div>
    </section>
  `;
  return documentShell(`VO-REG-${project?.project_id || "PROJECT"}-${month}`, "Register Report", body);
}
