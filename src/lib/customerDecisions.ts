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
  evidenceCount?: number;
}) {
  const footerContents = [
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
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-size: 12px; line-height: 1.5; font-family: Arial, "Tahoma", sans-serif; }
    .page { min-height: 267mm; border: 1px solid #d1d5db; padding: 18px 22px; background: #fff; display: flex; flex-direction: column; }
    .evidence-page { page-break-before: always; display: block; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; border-bottom: 2px solid #f97316; padding-bottom: 12px; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img { width: 132px; height: auto; object-fit: contain; }
    .brand-title { font-size: 16px; font-weight: 900; color: #0f172a; }
    .brand-subtitle { margin-top: 2px; color: #64748b; font-size: 11px; }
    .company-address { margin-top: 4px; color: #475569; font-size: 10px; line-height: 1.35; }
    .doc-box { min-width: 164px; border: 1px solid #cbd5e1; padding: 9px 11px; text-align: right; }
    .doc-label { color: #475569; font-size: 10px; font-weight: 800; text-transform: uppercase; }
    .doc-no { margin-top: 3px; font-size: 15px; font-weight: 900; color: #0f172a; }
    h1 { margin: 14px 0 12px; text-align: center; font-size: 22px; line-height: 1.2; color: #0f172a; }
    h2 { margin: 0 0 8px; font-size: 15px; color: #0f172a; }
    .memo-lines { border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; margin-top: 8px; }
    .memo-line { display: grid; grid-template-columns: 116px 1fr 104px 1fr; border-bottom: 1px solid #e5e7eb; min-height: 32px; }
    .memo-line:last-child { border-bottom: 0; }
    .memo-label { padding: 8px; font-weight: 900; color: #0f172a; background: #f8fafc; }
    .memo-value { padding: 8px 10px; font-weight: 700; color: #111827; }
    .memo-value.full { grid-column: span 3; }
    .body-section { margin-top: 14px; }
    .detail { min-height: 52px; white-space: pre-wrap; border: 1px solid #e5e7eb; background: #f8fafc; padding: 10px; }
    .impact-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    .impact-table th, .impact-table td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
    .impact-table th { width: 170px; text-align: left; background: #f8fafc; color: #0f172a; }
    .notice { margin-top: 12px; border: 1px solid #fed7aa; background: #fff7ed; color: #9a3412; padding: 10px; font-weight: 700; }
    .file-list { margin: 8px 0 0; padding-left: 18px; color: #475569; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: auto; padding-top: 22px; }
    .signature { text-align: center; min-height: 74px; }
    .signature-line { border-top: 1px solid #64748b; margin: 34px 8px 7px; }
    .footer { margin-top: 14px; border-top: 1px solid #e5e7eb; padding-top: 8px; color: #64748b; font-size: 10px; display: flex; justify-content: space-between; gap: 12px; }
    .page-title { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; border-bottom: 2px solid #f97316; padding-bottom: 10px; }
    .page-title h1 { margin: 0; text-align: left; font-size: 20px; }
    .photo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 14px; }
    .photo-card { margin: 0; border: 1px solid #d1d5db; padding: 8px; min-height: 84mm; page-break-inside: avoid; }
    .photo-frame { height: 70mm; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #f8fafc; }
    .photo-frame img { width: 100%; height: 100%; object-fit: contain; }
    .photo-card figcaption { margin-top: 6px; color: #334155; font-size: 10px; font-weight: 700; }
    .empty-box { border: 1px dashed #cbd5e1; color: #64748b; padding: 18px; text-align: center; margin-top: 10px; }
  </style>
</head>
<body>
  <main class="page">
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
      </div>
    </header>

    <h1>บันทึกรายการที่ลูกค้าต้องตัดสินใจ</h1>

    <section class="memo-lines">
      <div class="memo-line">
        <div class="memo-label">โครงการ</div>
        <div class="memo-value">${escapeHtml(project.name || project.project_id || "-")}</div>
        <div class="memo-label">ลูกค้า</div>
        <div class="memo-value">${escapeHtml(project.client || "-")}</div>
      </div>
      <div class="memo-line">
        <div class="memo-label">สถานที่</div>
        <div class="memo-value full">${escapeHtml(location || "-")}</div>
      </div>
      <div class="memo-line">
        <div class="memo-label">ช่วงงาน</div>
        <div class="memo-value">${escapeHtml(decision.phase || "-")}</div>
        <div class="memo-label">สถานะ</div>
        <div class="memo-value">${escapeHtml(decision.decision_status || "-")}</div>
      </div>
      <div class="memo-line">
        <div class="memo-label">รายการ</div>
        <div class="memo-value full">${escapeHtml(decision.title || "-")}</div>
      </div>
      <div class="memo-line">
        <div class="memo-label">ต้องตัดสินใจก่อน</div>
        <div class="memo-value full">${escapeHtml(decision.decision_before || "-")}</div>
      </div>
    </section>

    <section class="body-section">
      <table class="impact-table">
        <tr>
          <th>ผลถ้าเปลี่ยนหลังจากนี้</th>
          <td>${escapeHtml(decision.impact_if_changed || "-")}</td>
        </tr>
        <tr>
          <th>ผู้ยืนยัน</th>
          <td>${escapeHtml(decision.decided_by || "-")}</td>
        </tr>
        <tr>
          <th>วันที่ยืนยัน</th>
          <td>${escapeHtml(formatThaiDate(decision.decided_at))}</td>
        </tr>
        <tr>
          <th>แจ้งเตือนล่าสุด</th>
          <td>${escapeHtml(formatThaiDate(decision.notified_at))}</td>
        </tr>
      </table>

      <h2 style="margin-top: 14px;">ผลการตัดสินใจ / หมายเหตุ</h2>
      <div class="detail">${escapeHtml(decision.result_note || "-")}</div>

      <h2 style="margin-top: 14px;">หลักฐานอ้างอิง</h2>
      <div class="detail">${escapeHtml(decision.evidence_note || "-")}</div>

      <div class="notice">เอกสารนี้ใช้เป็นบันทึกการแจ้งเตือนและยืนยันรายการที่ลูกค้าต้องตัดสินใจก่อนผ่านช่วงงานดังกล่าว หากมีการเปลี่ยนแปลงหลังจากจุดตัดสินใจ อาจมีผลต่อระยะเวลา ค่าใช้จ่าย หรือการดำเนินงานหน้างาน</div>

      <h2 style="margin-top: 14px;">ไฟล์แนบ</h2>
      ${evidenceFiles.length > 0 ? `
        <ul class="file-list">
          ${evidenceFiles.map((item) => `<li>${escapeHtml(item.file_name || "-")} (${escapeHtml(item.mime_type || "file")})</li>`).join("")}
        </ul>
      ` : `<div class="empty-box">ยังไม่มีไฟล์แนบ</div>`}
    </section>

    <section class="signatures">
      <div class="signature">
        <div class="signature-line"></div>
        <strong>ผู้จัดทำ</strong><br />
        ${escapeHtml(decision.issued_by_name || "")}<br />
        วันที่ ........../........../..........
      </div>
      <div class="signature">
        <div class="signature-line"></div>
        <strong>วิศวกร / ผู้ควบคุมงาน</strong><br />
        วันที่ ........../........../..........
      </div>
      <div class="signature">
        <div class="signature-line"></div>
        <strong>ลูกค้า / ผู้ยืนยัน</strong><br />
        ${escapeHtml(decision.decided_by || project.client || "")}<br />
        วันที่ ........../........../..........
      </div>
    </section>

    <footer class="footer">
      <span>Generated by PCM CONNEXT</span>
      <span>Page 1${evidenceImages.length ? " / 2" : ""}</span>
    </footer>
  </main>

  ${evidenceImages.length > 0 ? `
  <main class="page evidence-page">
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
      <span>Generated by PCM CONNEXT</span>
      <span>Page 2 / 2 | ${escapeHtml(new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }))}</span>
    </footer>
  </main>` : ""}
</body>
</html>`;
}
