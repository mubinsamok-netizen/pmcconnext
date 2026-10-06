import fs from "fs";
import path from "path";
import { formatBangkokDateTime } from "@/lib/bangkokDateTime";
import {
  VO_STATUS_LABELS,
  VO_TYPE_LABELS,
  asVoItemRowType,
  asVoStatus,
  asVoType,
  formatMoney,
  formatThaiDate,
  isVoFinanciallyActive,
  numberValue,
  calculateVoTotals,
  resolveVoItemChangeType,
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

function documentShell(
  title: string,
  subtitle: string,
  body: string,
  options?: { landscape?: boolean; variant?: "vo-sheet" },
) {
  const logoDataUrl = getLogoDataUrl();
  const landscape = Boolean(options?.landscape);
  const variant = options?.variant || "";
  const pageMargin = variant === "vo-sheet" ? "6mm 7mm 7mm" : "11mm 10mm";
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4${landscape ? " landscape" : ""}; margin: ${pageMargin}; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      font-family: "Kanit", "Noto Sans Thai", "Tahoma", "Arial", sans-serif;
      font-size: 10px;
      line-height: 1.45;
      background: #ffffff;
      text-rendering: geometricPrecision;
      -webkit-font-smoothing: antialiased;
    }
    .doc { min-height: ${landscape ? "188mm" : "275mm"}; border: 1.4px solid #111827; padding: 9mm; position: relative; }
    .header { display: grid; grid-template-columns: 34mm 1fr auto; gap: 8mm; align-items: center; border-bottom: 2px solid #111827; padding-bottom: 6mm; }
    .logo { width: 30mm; height: 14mm; object-fit: contain; image-rendering: auto; }
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
    .data.compact th, .data.compact td { padding: 1.25mm; font-size: 7.4px; }
    .data .group-row td { background: #e5e7eb; font-weight: 800; border-color: #9ca3af; }
    .data .detail-row td:nth-child(2) { padding-left: 4mm; }
    .data .note-row td { background: #fffbeb; color: #92400e; font-style: italic; }
    .data thead { display: table-header-group; }
    .data tfoot { display: table-row-group; }
    .data tr { break-inside: avoid; page-break-inside: avoid; }
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
    .evidence-link { display: inline-block; margin-left: 2mm; border: 1px solid #f97316; border-radius: 4px; padding: 0.5mm 2mm; color: #c2410c; font-size: 8px; font-weight: 800; text-decoration: none; white-space: nowrap; }
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
    .doc.vo-sheet { min-height: 197mm; border: 0; border-top: 2.2mm solid #f05a16; padding: 3.5mm 0 0; }
    .vo-sheet .header { grid-template-columns: 36mm 1fr 72mm; gap: 5mm; min-height: 18mm; padding: 0 0 3.5mm; border-bottom: 1.2px solid #cbd5e1; }
    .vo-sheet .logo { width: 35mm; height: 13mm; }
    .vo-sheet .company { color: #0f172a; font-size: 15px; line-height: 1.2; }
    .vo-sheet .addr { margin-top: 0.8mm; color: #64748b; font-size: 8px; }
    .vo-sheet .doc-code { border-left: 1.2px solid #cbd5e1; padding: 1mm 0 1mm 5mm; }
    .vo-sheet .doc-code .label { color: #ea580c; font-size: 7.8px; letter-spacing: 0; }
    .vo-sheet .doc-code .value { color: #0f172a; font-size: 12px; }
    .vo-document-title { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8mm; padding: 3.2mm 0 2.8mm; }
    .vo-document-title h1 { margin: 0; color: #0f172a; font-size: 18px; }
    .vo-document-title .english { margin-top: 0.5mm; color: #ea580c; font-size: 7.8px; font-weight: 800; }
    .vo-document-title .issue { min-width: 32mm; border-left: 2px solid #f05a16; padding-left: 4mm; text-align: right; color: #64748b; font-size: 8px; }
    .vo-document-title .issue strong { color: #0f172a; font-size: 9px; }
    .vo-meta { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; margin-bottom: 2.5mm; border: 1px solid #cbd5e1; }
    .vo-meta th, .vo-meta td { border: 0; border-bottom: 1px solid #e2e8f0; padding: 1.1mm 2mm; vertical-align: top; }
    .vo-meta tr:last-child th, .vo-meta tr:last-child td { border-bottom: 0; }
    .vo-meta th:nth-child(3), .vo-meta td:nth-child(4) { border-left: 1px solid #e2e8f0; }
    .vo-meta th { width: 22mm; background: #f8fafc; color: #64748b; text-align: left; font-size: 7.8px; font-weight: 800; }
    .vo-meta td { color: #0f172a; font-size: 8.6px; font-weight: 700; }
    .vo-meta .document-value { font-weight: 800; }
    .vo-reference { display: grid; grid-template-columns: minmax(0, 1fr) 37mm 37mm 42mm; overflow: hidden; border: 1px solid #cbd5e1; margin-bottom: 2.7mm; background: #ffffff; }
    .vo-reference > div { min-width: 0; padding: 1.35mm 2.4mm; }
    .vo-reference > div + div { border-left: 1px solid #cbd5e1; }
    .vo-reference .add { background: #eff6ff; }
    .vo-reference .deduct { background: #fef2f2; }
    .vo-reference .net { background: #fff7ed; }
    .vo-reference .label { color: #64748b; font-size: 7.5px; font-weight: 800; }
    .vo-reference .value { margin-top: 0.45mm; color: #0f172a; font-size: 10.4px; font-weight: 900; overflow-wrap: anywhere; }
    .vo-reference .add .value, .vo-reference .deduct .value, .vo-reference .net .value { text-align: right; font-variant-numeric: tabular-nums; }
    .vo-reference .add .value { color: #1d4ed8; }
    .vo-reference .deduct .value { color: #b91c1c; }
    .vo-sheet table.data { margin-top: 0; }
    .vo-sheet .data th { background: #0f172a; border-color: #334155; padding: 1.35mm 1.4mm; font-size: 7.8px; line-height: 1.3; }
    .vo-sheet .data thead tr + tr th { background: #172033; color: #cbd5e1; }
    .vo-sheet .data thead .table-reference th { background: #020617; color: #ffffff; border-color: #020617; padding: 1.7mm 2mm; }
    .vo-sheet .table-reference-content { display: flex; justify-content: space-between; align-items: center; gap: 6mm; font-size: 8.2px; }
    .vo-sheet .table-reference-content span:last-child { color: #fdba74; }
    .vo-sheet .table-reference-content span:last-child { white-space: nowrap; }
    .vo-sheet .data td { border-color: #cbd5e1; padding: 1.2mm 1.45mm; color: #334155; font-size: 8.2px; line-height: 1.32; }
    .vo-sheet .data .type-cell { color: #374151; font-size: 7px; font-weight: 700; white-space: nowrap; }
    .vo-sheet .data .sequence { text-align: center; color: #475569; font-weight: 800; }
    .vo-sheet .data .group-row td { background: #eaf2ff; color: #0f172a; border-top: 1.5px solid #94a3b8; border-bottom-color: #bfd0e6; font-weight: 900; }
    .vo-sheet .data .group-row .sequence { color: #1d4ed8; font-size: 9px; }
    .vo-sheet .data .group-row.deduct-row td { background: #fef2f2; border-bottom-color: #fecaca; }
    .vo-sheet .data .group-row.deduct-row .sequence, .vo-sheet .data .group-row.deduct-row .group-kind { color: #b91c1c; }
    .vo-sheet .data .group-row.deduct-row .group-dot { background: #dc2626; }
    .vo-sheet .data .detail-row.deduct-row td:last-child { color: #b91c1c; }
    .vo-sheet .data .group-label { display: flex; align-items: center; gap: 2mm; }
    .vo-sheet .data .group-dot { width: 2.1mm; height: 2.1mm; flex: 0 0 auto; border-radius: 50%; background: #2563eb; }
    .vo-sheet .data .group-kind { margin-top: 0.2mm; color: #1d4ed8; font-size: 6.7px; font-weight: 800; text-transform: uppercase; }
    .vo-sheet .data .group-row { break-after: avoid-page; page-break-after: avoid; }
    .vo-sheet .data .group-row + .detail-row { break-before: avoid-page; page-break-before: avoid; }
    .vo-sheet .data .detail-row td:nth-child(2) { padding-left: 4.5mm; color: #0f172a; font-weight: 600; }
    .vo-sheet .data .detail-row:nth-child(even) td { background: #f8fafc; }
    .vo-sheet .data .note-row td { background: #fffbeb; color: #92400e; }
    .vo-sheet .data .document-total td { padding-top: 1.55mm; padding-bottom: 1.55mm; font-size: 8.5px; font-weight: 900; }
    .vo-sheet .data .increase-total td { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
    .vo-sheet .data .decrease-total td { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
    .vo-sheet .data .net-total td { background: #0f172a; color: #ffffff; border-color: #0f172a; font-size: 9px; }
    .vo-sheet .summary { width: 92mm; margin-top: 2.5mm; }
    .vo-sheet .summary th, .vo-sheet .summary td { border-color: #9ca3af; padding: 1.5mm 2mm; font-size: 8px; }
    .vo-sheet .summary .grand th, .vo-sheet .summary .grand td { background: #f3f4f6; color: #111827; border-top: 1.5px solid #374151; font-size: 9px; }
    .vo-notes-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm; margin-top: 3mm; break-inside: avoid; page-break-inside: avoid; }
    .vo-sheet .vo-notes-grid .note, .vo-sheet .evidence-box { margin-top: 0; min-height: 17mm; border: 1px solid #9ca3af; border-radius: 0; background: #ffffff; padding: 2mm 2.5mm; color: #374151; }
    .vo-sheet .vo-notes-grid .note { border-left: 3px solid #4b5563; }
    .vo-sheet .evidence-box h2 { margin-bottom: 1mm; color: #111827; font-size: 8.4px; }
    .vo-sheet .evidence-list { color: #374151; }
    .vo-sheet .evidence-link { border-color: #9ca3af; color: #374151; }
    .vo-sheet .flow-signatures { margin-top: 4mm; padding-top: 0.5mm; break-inside: avoid; page-break-inside: avoid; }
    .vo-sheet .sig .line { margin-top: 7mm; border-color: #475569; }
    .vo-sheet .sig strong { font-size: 8.6px; }
    .vo-sheet .sig .role { margin-top: 0.5mm; font-size: 7.6px; }
    .vo-sheet .approval-section { margin-top: 3mm; }
    .vo-sheet .approval-document-title { padding-top: 2mm; padding-bottom: 2mm; }
    .vo-sheet .approval-meta th, .vo-sheet .approval-meta td { padding-top: 0.8mm; padding-bottom: 0.8mm; }
    .vo-sheet .approval-reference > div { padding-top: 1mm; padding-bottom: 1mm; }
    .vo-sheet .approval-section-title { display: flex; justify-content: space-between; align-items: center; gap: 6mm; background: #020617; color: #ffffff; padding: 1.7mm 2mm; font-size: 8.2px; font-weight: 800; break-after: avoid-page; page-break-after: avoid; }
    .vo-sheet .approval-section-title span { color: #fdba74; font-size: 7.6px; white-space: nowrap; }
    .vo-sheet .approval-decisions { margin-top: 0; }
    .vo-sheet .approval-decisions th { background: #172033; }
    .vo-sheet .approval-decisions th, .vo-sheet .approval-decisions td { padding-top: 1mm; padding-bottom: 1mm; }
    .vo-sheet .approval-audit { display: grid; grid-template-columns: 31mm 38mm 47mm 38mm 1fr; margin-top: 3mm; border: 1px solid #cbd5e1; break-inside: avoid; page-break-inside: avoid; }
    .vo-sheet .approval-audit > div { min-width: 0; padding: 1.35mm 2mm; }
    .vo-sheet .approval-audit > div + div { border-left: 1px solid #e2e8f0; }
    .vo-sheet .approval-audit .audit-title { background: #0f172a; color: #ffffff; display: flex; align-items: center; font-size: 8.2px; font-weight: 900; }
    .vo-sheet .approval-audit .label { color: #64748b; font-size: 7.1px; font-weight: 800; }
    .vo-sheet .approval-audit .value { margin-top: 0.35mm; color: #0f172a; font-size: 7.9px; font-weight: 800; line-height: 1.3; overflow-wrap: anywhere; }
    .vo-sheet .approval-audit .record { background: #fff7ed; }
    .vo-sheet .approval-audit .record .value { color: #7c2d12; }
    .vo-sheet .approval-signatures { margin-top: 1.5mm; }
    .vo-sheet .approval-signatures .sig .line { margin-top: 2.5mm; margin-bottom: 0.8mm; }
    .vo-sheet .approval-signatures .sig strong { font-size: 7.8px; }
    .vo-sheet .approval-signatures .sig .role, .vo-sheet .approval-signatures .sig .stamp { margin-top: 0.2mm; font-size: 7px; line-height: 1.2; }
  </style>
</head>
<body>
  <main class="doc ${variant}">
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

function renderItems(
  items: VoItemRecord[],
  options?: {
    showRowType?: boolean;
    documentTotal?: string | number;
    documentNo?: string;
    defaultVoType?: ReturnType<typeof asVoType>;
    increaseTotal?: string | number;
    decreaseTotal?: string | number;
    netChange?: string | number;
  },
) {
  const showRowType = Boolean(options?.showRowType);
  const columnCount = showRowType ? 10 : 9;
  let groupSequence = 0;
  let detailSequence = 0;
  const rowTypeLabel = (rowType: ReturnType<typeof asVoItemRowType>) => {
    if (rowType === "detail") return "รายละเอียดย่อย";
    if (rowType === "note") return "หมายเหตุ";
    return "รายการหลัก";
  };
  const costCells = (item: VoItemRecord, showGroupTotalsOnly = false) => {
    const hasCostBreakdown = String(item.material_unit_price ?? "").trim() !== "" || String(item.labor_unit_price ?? "").trim() !== "";
    const materialUnit = numberValue(item.material_unit_price);
    const laborUnit = !hasCostBreakdown
      ? numberValue(item.unit_price)
      : numberValue(item.labor_unit_price);
    const materialAmount = !hasCostBreakdown
      ? 0
      : item.material_amount === undefined
      ? numberValue(item.quantity) * materialUnit
      : numberValue(item.material_amount);
    const laborAmount = !hasCostBreakdown
      ? numberValue(item.amount)
      : item.labor_amount === undefined
      ? numberValue(item.quantity) * laborUnit
      : numberValue(item.labor_amount);
    return `
      <td class="num">${showGroupTotalsOnly ? "" : formatMoney(item.quantity)}</td>
      <td>${showGroupTotalsOnly ? "" : escapeHtml(item.unit || "-")}</td>
      <td class="num">${showGroupTotalsOnly ? "" : formatMoney(materialUnit)}</td>
      <td class="num">${formatMoney(materialAmount)}</td>
      <td class="num">${showGroupTotalsOnly ? "" : formatMoney(laborUnit)}</td>
      <td class="num">${formatMoney(laborAmount)}</td>
      <td class="num" style="font-weight:800;">${formatMoney(item.amount)}</td>
    `;
  };

  return `
    <table class="data compact">
      <colgroup>
        ${showRowType ? `<col style="width:23mm;">` : ""}
        <col style="width:${showRowType ? "9mm" : "10mm"};">
        <col>
        <col style="width:${showRowType ? "16mm" : "17mm"};">
        <col style="width:14mm;">
        <col style="width:20mm;">
        <col style="width:21mm;">
        <col style="width:20mm;">
        <col style="width:21mm;">
        <col style="width:24mm;">
      </colgroup>
      <thead>
        ${options?.documentNo ? `
          <tr class="table-reference">
            <th colspan="${columnCount}">
              <div class="table-reference-content"><span>ตารางรายการงานเพิ่ม-ลด</span><span>เลขที่ ${escapeHtml(options.documentNo)}</span></div>
            </th>
          </tr>
        ` : ""}
        <tr>
          ${showRowType ? `<th rowspan="2">ประเภทแถว</th>` : ""}
          <th rowspan="2">ลำดับ</th>
          <th rowspan="2">รายการ</th>
          <th rowspan="2">ปริมาณ</th>
          <th rowspan="2">หน่วย</th>
          <th colspan="2" style="text-align:center;">ค่าวัสดุ</th>
          <th colspan="2" style="text-align:center;">ค่าแรง</th>
          <th rowspan="2" style="text-align:right;">รวมเป็นเงิน</th>
        </tr>
        <tr>
          <th style="text-align:right;">ต่อหน่วย</th>
          <th style="text-align:right;">รวม</th>
          <th style="text-align:right;">ต่อหน่วย</th>
          <th style="text-align:right;">รวม</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, index) => {
          const rowType = asVoItemRowType(String(item.row_type || ""));
          const changeType = resolveVoItemChangeType(item, items, options?.defaultVoType || "VO+");
          const deduct = changeType === "deduct";
          if (rowType === "note") {
            return `<tr class="note-row">${showRowType ? `<td class="type-cell">${rowTypeLabel(rowType)}</td>` : ""}<td class="sequence">•</td><td colspan="8"><strong>หมายเหตุ:</strong> ${escapeHtml(item.description || "-")}</td></tr>`;
          }
          if (rowType === "group") {
            groupSequence += 1;
            detailSequence = 0;
          } else {
            detailSequence += 1;
          }
          const displayItemNo = rowType === "group"
            ? String(groupSequence)
            : groupSequence > 0
            ? `${groupSequence}.${detailSequence}`
            : String(item.item_no || index + 1);
          const hasChildren = rowType === "group" && items.some((candidate) => (
            asVoItemRowType(String(candidate.row_type || "")) !== "group" &&
            String(candidate.parent_item_no || "") === String(item.item_no || "")
          ));
          if (rowType === "group") {
            return `
              <tr class="group-row ${deduct ? "deduct-row" : "add-row"}">
                ${showRowType ? `<td class="type-cell">${rowTypeLabel(rowType)}</td>` : ""}
                <td class="sequence">${escapeHtml(displayItemNo)}</td>
                <td colspan="7">
                  <div class="group-label">
                    <span class="group-dot"></span>
                    <div><div>${escapeHtml(item.description || "-")}</div><div class="group-kind">${deduct ? "งานลด (−)" : "งานเพิ่ม (+)"}</div></div>
                  </div>
                </td>
                <td class="num" style="font-weight:900;">${deduct ? "−" : "+"}${formatMoney(item.amount)}</td>
              </tr>
            `;
          }
          return `
            <tr class="detail-row ${deduct ? "deduct-row" : "add-row"}">
              ${showRowType ? `<td class="type-cell">${rowTypeLabel(rowType)}</td>` : ""}
              <td class="sequence">${escapeHtml(displayItemNo)}</td>
              <td>${escapeHtml(item.description || "-")}</td>
              ${costCells({ ...item, amount: deduct ? -Math.abs(numberValue(item.amount)) : Math.abs(numberValue(item.amount)) }, hasChildren)}
            </tr>
          `;
        }).join("")}
        ${items.length === 0 ? `<tr><td colspan="${columnCount}" style="text-align:center;color:#64748b;">ไม่มีรายการ</td></tr>` : ""}
      </tbody>
      ${options?.increaseTotal !== undefined || options?.decreaseTotal !== undefined ? `
        <tfoot>
          <tr class="document-total increase-total"><td colspan="${columnCount - 1}" style="text-align:right;">รวมงานเพิ่ม</td><td class="num">+${formatMoney(options?.increaseTotal)} บาท</td></tr>
          <tr class="document-total decrease-total"><td colspan="${columnCount - 1}" style="text-align:right;">หักรวมงานลด</td><td class="num">−${formatMoney(options?.decreaseTotal)} บาท</td></tr>
          <tr class="document-total net-total"><td colspan="${columnCount - 1}" style="text-align:right;">ส่วนต่างสุทธิ</td><td class="num">${numberValue(options?.netChange) > 0 ? "+" : numberValue(options?.netChange) < 0 ? "−" : ""}${formatMoney(Math.abs(numberValue(options?.netChange)))} บาท</td></tr>
        </tfoot>
      ` : options?.documentTotal !== undefined ? `
        <tfoot>
          <tr class="document-total">
            <td colspan="${columnCount - 1}" style="text-align:right;">ยอดรวมรายการ</td>
            <td class="num">${formatMoney(options.documentTotal)} บาท</td>
          </tr>
        </tfoot>
      ` : ""}
    </table>
  `;
}

function renderSummary(vo: VoRecord, items?: VoItemRecord[]) {
  const calculation = items
    ? calculateVoTotals({ items, defaultVoType: asVoType(String(vo.vo_type || "")), tax: { vat_exempt: true } })
    : null;
  return `
    <table class="summary">
      ${calculation ? `<tr><th>รวมงานเพิ่ม</th><td>+${formatMoney(calculation.increase_total)} บาท</td></tr>` : ""}
      ${calculation ? `<tr><th>หักรวมงานลด</th><td>−${formatMoney(calculation.decrease_total)} บาท</td></tr>` : ""}
      <tr class="grand"><th>ส่วนต่างสุทธิ</th><td>${calculation && calculation.net_change > 0 ? "+" : calculation && calculation.net_change < 0 ? "−" : ""}${formatMoney(Math.abs(calculation?.net_change ?? numberValue(vo.grand_total)))} บาท</td></tr>
    </table>
  `;
}

function renderItemDecisionEvidence(vo: VoRecord) {
  const evidence = safeJsonParse<{
    item_decisions?: Array<Record<string, string | number | undefined>>;
    item_decision_summary?: Record<string, string | number | undefined>;
  }>(vo.evidence_json, {});
  const decisions = Array.isArray(evidence.item_decisions) ? evidence.item_decisions : [];
  if (decisions.length === 0) return "";

  const summary = evidence.item_decision_summary || {};
  const resultLabel = (value?: string | number) => String(value || "") === "rejected" ? "ไม่อนุมัติ" : "อนุมัติ";
  const resultColor = (value?: string | number) => String(value || "") === "rejected" ? "#b91c1c" : "#047857";

  return `
    <section class="approval-section">
      <div class="approval-section-title">
        <strong>ผลการพิจารณารายการหลักจากลูกค้า</strong>
        <span>อนุมัติ ${escapeHtml(summary.approved_items || 0)} / ไม่อนุมัติ ${escapeHtml(summary.rejected_items || 0)} / ยอดสุทธิที่อนุมัติ ${formatMoney(summary.approved_amount)} บาท</span>
      </div>
      <table class="data compact approval-decisions">
        <thead>
          <tr>
            <th style="width:11mm;">ลำดับ</th>
            <th>รายการ</th>
            <th style="width:24mm;">ผล</th>
            <th style="width:30mm;">ยอด</th>
            <th style="width:46mm;">หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          ${decisions.map((item, index) => `
            <tr>
              <td class="num">${escapeHtml(item.item_no || index + 1)}</td>
              <td>${escapeHtml(item.description || "-")}</td>
              <td style="font-weight:800;color:${resultColor(item.decision)};">${escapeHtml(resultLabel(item.decision))}</td>
              ${numberCell(item.amount)}
              <td>${nl2br(item.note || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

export function buildVoSheetHtml(input: DocumentInput) {
  const { vo, items, project } = input;
  const voType = asVoType(String(vo.vo_type || ""));
  const calculation = calculateVoTotals({ items, defaultVoType: voType, tax: { vat_exempt: true } });
  const status = asVoStatus(String(vo.status || ""));
  const location = [project?.address, project?.district, project?.province].filter(Boolean).join(" ");
  const issuedDate = formatThaiDate(String(vo.updated_at || vo.created_at || "").slice(0, 10));
  const body = `
    <section class="vo-document-title">
      <div>
        <h1>ใบเปลี่ยนแปลงงาน (งานเพิ่ม-ลด)</h1>
        <div class="english">VARIATION ORDER / WORK CHANGE RECORD</div>
      </div>
      <div class="issue">วันที่ออกเอกสาร<br><strong>${escapeHtml(issuedDate)}</strong></div>
    </section>
    <table class="vo-meta">
      <colgroup>
        <col style="width:22mm;"><col>
        <col style="width:25mm;"><col style="width:60mm;">
      </colgroup>
      <tbody>
        <tr><th>โครงการ</th><td>${escapeHtml(project?.name || vo.project_id || "-")}</td><th>เลขที่เอกสาร</th><td class="document-value">${escapeHtml(vo.vo_id)}</td></tr>
        <tr><th>ลูกค้า</th><td>${escapeHtml(vo.client_name || project?.client || "-")}</td><th>ประเภทงาน</th><td>${escapeHtml(VO_TYPE_LABELS[calculation.vo_type])}</td></tr>
        <tr><th>สถานที่</th><td>${escapeHtml(location || "-")}</td><th>สถานะ</th><td>${escapeHtml(VO_STATUS_LABELS[status])}</td></tr>
        <tr><th>เลขที่สัญญา</th><td>${escapeHtml(project?.contract_no || "-")}</td><th>กำหนดอนุมัติ</th><td>${escapeHtml(formatThaiDate(vo.approval_deadline))}</td></tr>
      </tbody>
    </table>
    <section class="vo-reference">
      <div>
        <div class="label">ชื่องาน / ขอบเขตการเปลี่ยนแปลง</div>
        <div class="value">${escapeHtml(vo.title || "-")}</div>
      </div>
      <div class="add">
        <div class="label">รวมงานเพิ่ม</div>
        <div class="value">+${formatMoney(calculation.increase_total)}</div>
      </div>
      <div class="deduct">
        <div class="label">หักงานลด</div>
        <div class="value">−${formatMoney(calculation.decrease_total)}</div>
      </div>
      <div class="net">
        <div class="label">ส่วนต่างสุทธิ</div>
        <div class="value">${calculation.net_change > 0 ? "+" : calculation.net_change < 0 ? "−" : ""}${formatMoney(Math.abs(calculation.net_change))} บาท</div>
      </div>
    </section>
    ${renderItems(items, {
      documentNo: vo.vo_id,
      defaultVoType: voType,
      increaseTotal: calculation.increase_total,
      decreaseTotal: calculation.decrease_total,
      netChange: calculation.net_change,
    })}
    <section class="signatures flow-signatures">
      <div class="sig"><div class="line"></div><strong>ผู้จัดทำ</strong><div class="role">${escapeHtml(vo.created_by_name || "-")}</div></div>
      <div class="sig"><div class="line"></div><strong>ผู้ตรวจสอบ</strong><div class="role">Project Manager</div></div>
      <div class="sig"><div class="line"></div><strong>ลูกค้า/ผู้อนุมัติ</strong><div class="role">${escapeHtml(vo.client_name || "-")}</div></div>
    </section>
  `;
  return documentShell(vo.vo_id, "Variation Order", body, { landscape: true, variant: "vo-sheet" });
}

export function buildApprovalCertificateHtml(input: DocumentInput) {
  const { vo, items, project } = input;
  const evidence = safeJsonParse<Record<string, string>>(vo.evidence_json, {});
  const voType = asVoType(String(vo.vo_type || ""));
  const calculation = calculateVoTotals({ items, defaultVoType: voType, tax: { vat_exempt: true } });
  const status = asVoStatus(String(vo.status || ""));
  const location = [project?.address, project?.district, project?.province].filter(Boolean).join(" ");
  const customerApprovedBy = evidence.client_approved_by || String(vo.customer_approved_by || "") || vo.client_name || "-";
  const customerApprovedAt = evidence.approved_at || String(vo.customer_approved_at || "") || evidence.client_approved_date || "";
  const customerApprovalStamp = customerApprovedAt !== "" ? formatThaiDateTime(customerApprovedAt) : "-";
  const certificateDate = formatThaiDate(String(customerApprovedAt || vo.updated_at || vo.created_at || "").slice(0, 10));
  const body = `
    <section class="vo-document-title approval-document-title">
      <div>
        <h1>หนังสือรับรองการอนุมัติงานเพิ่ม-ลด</h1>
        <div class="english">APPROVAL CERTIFICATE / CUSTOMER CONFIRMATION RECORD</div>
      </div>
      <div class="issue">วันที่รับรองเอกสาร<br><strong>${escapeHtml(certificateDate)}</strong></div>
    </section>
    <table class="vo-meta approval-meta">
      <colgroup>
        <col style="width:22mm;"><col>
        <col style="width:25mm;"><col style="width:60mm;">
      </colgroup>
      <tbody>
        <tr><th>โครงการ</th><td>${escapeHtml(project?.name || vo.project_id || "-")}</td><th>เลขที่อ้างอิง VO</th><td class="document-value">${escapeHtml(vo.vo_id)}</td></tr>
        <tr><th>ลูกค้า</th><td>${escapeHtml(vo.client_name || project?.client || "-")}</td><th>ประเภทงาน</th><td>${escapeHtml(VO_TYPE_LABELS[calculation.vo_type])}</td></tr>
        <tr><th>สถานที่</th><td>${escapeHtml(location || "-")}</td><th>สถานะ</th><td>${escapeHtml(VO_STATUS_LABELS[status])}</td></tr>
        <tr><th>เลขที่สัญญา</th><td>${escapeHtml(project?.contract_no || "-")}</td><th>วันที่ลูกค้ายืนยัน</th><td>${escapeHtml(customerApprovalStamp)}</td></tr>
      </tbody>
    </table>
    <section class="vo-reference approval-reference">
      <div>
        <div class="label">ชื่องาน / ขอบเขตการเปลี่ยนแปลง</div>
        <div class="value">${escapeHtml(vo.title || "-")}</div>
      </div>
      <div class="add">
        <div class="label">รวมงานเพิ่ม</div>
        <div class="value">+${formatMoney(calculation.increase_total)}</div>
      </div>
      <div class="deduct">
        <div class="label">หักงานลด</div>
        <div class="value">-${formatMoney(calculation.decrease_total)}</div>
      </div>
      <div class="net">
        <div class="label">ส่วนต่างสุทธิ</div>
        <div class="value">${calculation.net_change > 0 ? "+" : calculation.net_change < 0 ? "-" : ""}${formatMoney(Math.abs(calculation.net_change))} บาท</div>
      </div>
    </section>
    ${renderItems(items, {
      documentNo: vo.vo_id,
      defaultVoType: voType,
      increaseTotal: calculation.increase_total,
      decreaseTotal: calculation.decrease_total,
      netChange: calculation.net_change,
    })}
    ${renderItemDecisionEvidence(vo)}
    <section class="approval-audit">
      <div class="audit-title">หลักฐานการยืนยันจากลูกค้า</div>
      <div><div class="label">ผู้ยืนยันฝั่งลูกค้า</div><div class="value">${escapeHtml(customerApprovedBy)}</div></div>
      <div><div class="label">วันที่และเวลายืนยัน</div><div class="value">${escapeHtml(customerApprovalStamp)}</div></div>
      <div><div class="label">ช่องทาง / หลักฐาน</div><div class="value">${escapeHtml(evidence.channel || "-")} / ${escapeHtml(evidence.evidence_type || "-")}</div></div>
      <div class="record"><div class="label">บันทึกการยืนยัน</div><div class="value">${nl2br(evidence.evidence_description || `ลูกค้ายืนยันผลการพิจารณาผ่าน ${evidence.channel || "ระบบ"}`)}</div></div>
    </section>
    <section class="signatures flow-signatures approval-signatures">
      <div class="sig"><div class="line"></div><strong>ผู้บันทึก</strong><div class="role">${escapeHtml(evidence.confirmed_by_office || vo.created_by_name || "-")}</div></div>
      <div class="sig"><div class="line"></div><strong>ผู้ตรวจสอบ</strong><div class="role">${escapeHtml(project?.pm_name || "Project Manager")}</div></div>
      <div class="sig"><div class="line"></div><strong>ลูกค้า/ผู้ยืนยัน</strong><div class="role">${escapeHtml(customerApprovedBy)}</div><div class="stamp">ยืนยันเมื่อ ${escapeHtml(customerApprovalStamp)}</div></div>
    </section>
  `;
  return documentShell(`${vo.vo_id}-APP`, "Approval Certificate", body, { landscape: true, variant: "vo-sheet" });
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
    ${renderItems(items, { defaultVoType: asVoType(String(vo.vo_type || "")) })}
    ${renderSummary(vo, items)}
    <div class="note">
      โปรดชำระเงินภายในวันที่ ${escapeHtml(formatThaiDate(vo.due_date))}
      และอ้างอิงเลขที่ ${escapeHtml(vo.vo_id)} ในหลักฐานการชำระเงิน
    </div>
    <section class="signatures flow-signatures">
      <div class="sig"><div class="line"></div><strong>ผู้จัดทำใบแจ้งหนี้</strong><div class="role">Accounting</div></div>
      <div class="sig"><div class="line"></div><strong>ผู้ตรวจสอบ</strong><div class="role">Project Manager</div></div>
      <div class="sig"><div class="line"></div><strong>ผู้รับเอกสาร</strong><div class="role">${escapeHtml(vo.client_name || "-")}</div></div>
    </section>
  `;
  return documentShell(String(vo.invoice_no || `${vo.vo_id}-INV`), "Invoice", body, { landscape: true });
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
    ${renderItems(items, { defaultVoType: asVoType(String(vo.vo_type || "")) })}
    ${renderSummary(vo, items)}
    <div class="note">
      ยอดรับชำระสะสม ${formatMoney(vo.amount_paid)} บาท / ยอดคงเหลือ ${formatMoney(vo.balance)} บาท
    </div>
    <div style="margin-top:5mm;">${Number(vo.balance || 0) <= 0 ? `<span class="paid-stamp">PAID</span>` : `<span class="badge">PARTIAL PAYMENT</span>`}</div>
    <section class="signatures flow-signatures">
      <div class="sig"><div class="line"></div><strong>ผู้รับเงิน</strong><div class="role">Accounting</div></div>
      <div class="sig"><div class="line"></div><strong>ผู้ตรวจสอบ</strong><div class="role">Project Manager</div></div>
      <div class="sig"><div class="line"></div><strong>ผู้ชำระเงิน/ลูกค้า</strong><div class="role">${escapeHtml(vo.client_name || "-")}</div></div>
    </section>
  `;
  return documentShell(receiptNo, "Receipt", body, { landscape: true });
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
    ${renderItems(items, { defaultVoType: asVoType(String(vo.vo_type || "")) })}
    ${renderSummary(vo, items)}
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
    <section class="signatures flow-signatures">
      <div class="sig"><div class="line"></div><strong>Accounting</strong><div class="role">บันทึกรับชำระ</div></div>
      <div class="sig"><div class="line"></div><strong>Project Manager</strong><div class="role">รับทราบผลกระทบแผนงาน</div></div>
      <div class="sig"><div class="line"></div><strong>Site Engineer</strong><div class="role">ดำเนินงานตามแผน</div></div>
    </section>
  `;
  return documentShell(`${vo.vo_id}-CLR`, "Clearance Report", body, { landscape: true });
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
  const financialVos = vos.filter(isVoFinanciallyActive);
  const totalPlus = financialVos.filter((vo) => vo.vo_type === "VO+").reduce((sum, vo) => sum + Number(vo.grand_total || 0), 0);
  const totalMinus = financialVos.filter((vo) => vo.vo_type === "VO-").reduce((sum, vo) => sum + Number(vo.grand_total || 0), 0);
  const outstanding = financialVos.reduce((sum, vo) => sum + Number(vo.balance || 0), 0);
  const paid = financialVos.reduce((sum, vo) => sum + Number(vo.amount_paid || 0), 0);
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
        <td class="num">${formatMoney(isVoFinanciallyActive(vo) ? vo.balance : 0)}</td>
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
          <th style="width:28mm;">มูลค่าเสนอ</th>
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
