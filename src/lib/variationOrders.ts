export type VoType = "VO+" | "VO-" | "VO0";
import { formatBangkokDateTime } from "@/lib/bangkokDateTime";
import { applyLineFlexTheme, LINE_FLEX_HERO_IMAGES } from "@/lib/lineFlexTheme";

export type VoItemRowType = "group" | "detail" | "note";
export type VoItemChangeType = "add" | "deduct";

export type VoStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "billed"
  | "partial_payment"
  | "paid"
  | "overdue"
  | "work_unlocked"
  | "expired"
  | "cancelled";

export type VoItemInput = {
  item_no?: number | string;
  sort_order?: number | string;
  row_type?: VoItemRowType | string;
  change_type?: VoItemChangeType | VoType | string;
  parent_item_no?: number | string;
  description?: string;
  unit?: string;
  quantity?: number | string;
  unit_price?: number | string;
  material_unit_price?: number | string;
  material_amount?: number | string;
  labor_unit_price?: number | string;
  labor_amount?: number | string;
  amount?: number | string;
};

export type VoItem = {
  item_no: number;
  sort_order: number;
  row_type: VoItemRowType;
  change_type: VoItemChangeType;
  parent_item_no?: number;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  material_unit_price: number;
  material_amount: number;
  labor_unit_price: number;
  labor_amount: number;
  amount: number;
};

export type VoTaxSettings = {
  vat_rate?: number | string;
  vat_exempt?: boolean | string;
  withholding_tax?: number | string;
};

export type VoCalculation = {
  items: VoItem[];
  subtotal: number;
  increase_total: number;
  decrease_total: number;
  net_change: number;
  vo_type: VoType;
  vat_rate: number;
  vat_exempt: boolean;
  withholding_tax: number;
  vat_amount: number;
  wht_amount: number;
  grand_total: number;
  net_payable: number;
  contract_before: number;
  contract_after: number;
};

export type VoRecord = Record<string, string | number | undefined> & {
  _rowIndex?: number;
  vo_id: string;
  project_id: string;
  revision_no?: string;
  original_vo_id?: string;
  vo_type?: VoType | string;
  title?: string;
  description?: string;
  status?: VoStatus | string;
  subtotal?: string | number;
  grand_total?: string | number;
  net_payable?: string | number;
  contract_before?: string | number;
  contract_after?: string | number;
  approval_deadline?: string;
  approval_token?: string;
  approval_url?: string;
  customer_approved_at?: string | number;
  customer_approved_by?: string;
  customer_approval_note?: string;
  sent_to_customer_at?: string | number;
  line_group_id?: string;
  line_message?: string;
  client_name?: string;
  task_plan_status?: string;
  evidence_json?: string;
  rejection_json?: string;
  linked_tasks_json?: string;
  document_refs_json?: string;
  extension_days?: string | number;
  created_at?: string | number;
  updated_at?: string | number;
};

export type VoItemRecord = Record<string, string | number | undefined> & {
  _rowIndex?: number;
  item_id: string;
  vo_id: string;
  project_id: string;
  row_type?: VoItemRowType | string;
  change_type?: VoItemChangeType | VoType | string;
  parent_item_no?: string | number;
  sort_order?: string | number;
  material_unit_price?: string | number;
  material_amount?: string | number;
  labor_unit_price?: string | number;
  labor_amount?: string | number;
};

export const VO_TYPE_LABELS: Record<VoType, string> = {
  "VO+": "งานเพิ่ม",
  "VO-": "งานลด",
  VO0: "งานเพิ่ม-ลด (ผสม)",
};

export const VO_STATUS_LABELS: Record<VoStatus, string> = {
  draft: "ร่าง",
  pending_approval: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ลูกค้าไม่อนุมัติ",
  billed: "วางบิลแล้ว",
  partial_payment: "ชำระบางส่วน",
  paid: "ชำระครบ",
  overdue: "เกินกำหนด",
  work_unlocked: "เข้าแผน/ปิดงานแล้ว",
  expired: "หมดอายุ",
  cancelled: "ยกเลิก",
};

export const VO_STATUS_STYLES: Record<VoStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_approval: "bg-amber-50 text-amber-700",
  approved: "bg-sky-50 text-sky-700",
  billed: "bg-orange-50 text-orange-700",
  partial_payment: "bg-purple-50 text-purple-700",
  paid: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  expired: "bg-stone-100 text-stone-700",
  overdue: "bg-red-100 text-red-800",
  work_unlocked: "bg-green-100 text-green-800",
  cancelled: "bg-slate-100 text-slate-600",
};

export const VO_FINANCIAL_STATUSES = new Set<VoStatus>([
  "approved",
  "billed",
  "partial_payment",
  "paid",
  "overdue",
  "work_unlocked",
]);

export function asVoType(value?: string): VoType {
  if (value === "VO-" || value === "VO0") return value;
  return "VO+";
}

export function asVoStatus(value?: string): VoStatus {
  const normalized = String(value || "draft") as VoStatus;
  if (normalized in VO_STATUS_LABELS) return normalized;
  return "draft";
}

export function isVoFinanciallyActive(vo?: Pick<VoRecord, "status">) {
  return VO_FINANCIAL_STATUSES.has(asVoStatus(String(vo?.status || "")));
}

export function numberValue(value?: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "").replace(/,/g, "").trim();
  if (!cleaned) return 0;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function boolValue(value?: string | boolean | null) {
  if (typeof value === "boolean") return value;
  return String(value || "").toLowerCase() === "true";
}

export function asVoItemRowType(value?: string): VoItemRowType {
  if (value === "detail" || value === "note") return value;
  return "group";
}

export function asVoItemChangeType(value?: string, fallback: VoType | VoItemChangeType | string = "VO+"): VoItemChangeType {
  const normalized = String(value || "").trim().toLowerCase();
  if (["deduct", "decrease", "minus", "vo-", "group_deduct", "งานลด", "ลด", "-"].includes(normalized)) return "deduct";
  if (["add", "increase", "plus", "vo+", "group_add", "งานเพิ่ม", "เพิ่ม", "+"].includes(normalized)) return "add";
  return String(fallback).toLowerCase() === "vo-" || String(fallback).toLowerCase() === "deduct" ? "deduct" : "add";
}

export function storedVoItemRowType(rowType: VoItemRowType, changeType?: VoItemChangeType | string) {
  if (rowType !== "group") return rowType;
  return asVoItemChangeType(String(changeType || "")) === "deduct" ? "group_deduct" : "group_add";
}

export function resolveVoItemChangeType(
  item: Pick<VoItemInput, "row_type" | "change_type" | "parent_item_no" | "item_no">,
  items: Array<Pick<VoItemInput, "row_type" | "change_type" | "parent_item_no" | "item_no">> = [],
  defaultVoType: VoType = "VO+",
) {
  if (asVoItemRowType(String(item.row_type || "")) === "group") {
    return asVoItemChangeType(String(item.change_type || item.row_type || ""), defaultVoType);
  }
  const parent = items.find((candidate) => (
    asVoItemRowType(String(candidate.row_type || "")) === "group" &&
    String(candidate.item_no || "") === String(item.parent_item_no || "")
  ));
  return parent
    ? asVoItemChangeType(String(parent.change_type || parent.row_type || ""), defaultVoType)
    : asVoItemChangeType(String(item.change_type || item.row_type || ""), defaultVoType);
}

export function signedVoItemAmount(
  item: Pick<VoItemInput, "row_type" | "change_type" | "parent_item_no" | "item_no" | "amount">,
  items: Array<Pick<VoItemInput, "row_type" | "change_type" | "parent_item_no" | "item_no">> = [],
  defaultVoType: VoType = "VO+",
) {
  const amount = Math.abs(numberValue(item.amount));
  return resolveVoItemChangeType(item, items, defaultVoType) === "deduct" ? -amount : amount;
}

export function normalizeVoItems(items: VoItemInput[], defaultVoType: VoType = "VO+") {
  const normalized = items
    .map((item, index) => {
      const rowType = asVoItemRowType(String(item.row_type || ""));
      const quantity = numberValue(item.quantity);
      const materialUnitPrice = numberValue(item.material_unit_price);
      const laborUnitPrice = numberValue(item.labor_unit_price);
      const hasCostBreakdown = item.material_unit_price !== undefined || item.labor_unit_price !== undefined;
      const unitPrice = hasCostBreakdown ? materialUnitPrice + laborUnitPrice : numberValue(item.unit_price);
      return {
        item_no: Number(item.item_no || index + 1),
        sort_order: Number(item.sort_order || index + 1),
        row_type: rowType,
        change_type: asVoItemChangeType(String(item.change_type || item.row_type || ""), defaultVoType),
        parent_item_no: item.parent_item_no === undefined || item.parent_item_no === "" ? undefined : Number(item.parent_item_no),
        description: String(item.description || "").trim(),
        unit: rowType === "note" ? "" : String(item.unit || (rowType === "group" ? "LS" : "")).trim(),
        quantity,
        unit_price: unitPrice,
        material_unit_price: materialUnitPrice,
        material_amount: rowType === "note" ? 0 : quantity * materialUnitPrice,
        labor_unit_price: laborUnitPrice,
        labor_amount: rowType === "note" ? 0 : quantity * laborUnitPrice,
        amount: rowType === "note" ? 0 : quantity * unitPrice,
      };
    })
    .filter((item) => item.description || item.quantity || item.unit_price)
    .sort((a, b) => a.sort_order - b.sort_order);

  const withInheritedType = normalized.map((item) => {
    if (item.row_type === "group") return item;
    const parent = normalized.find((candidate) => candidate.row_type === "group" && candidate.item_no === item.parent_item_no);
    return { ...item, change_type: parent?.change_type || item.change_type };
  });

  return withInheritedType.map((item) => {
    if (item.row_type !== "group") return item;
    const children = withInheritedType.filter((candidate) => (
      candidate.row_type === "detail" && candidate.parent_item_no === item.item_no
    ));
    if (children.length === 0) return item;
    return {
      ...item,
      material_amount: children.reduce((sum, child) => sum + child.material_amount, 0),
      labor_amount: children.reduce((sum, child) => sum + child.labor_amount, 0),
      amount: children.reduce((sum, child) => sum + child.amount, 0),
    };
  });
}

export function calculateVoTotals({
  items,
  tax,
  defaultVoType = "VO+",
}: {
  items: VoItemInput[];
  tax?: VoTaxSettings;
  defaultVoType?: VoType;
}): VoCalculation {
  const normalizedItems = normalizeVoItems(items, defaultVoType);
  const groupItems = normalizedItems.filter((item) => item.row_type === "group");
  const billableItems = groupItems.length > 0
    ? groupItems
    : normalizedItems.filter((item) => item.row_type === "detail");
  const increaseTotal = billableItems
    .filter((item) => item.change_type === "add")
    .reduce((sum, item) => sum + item.amount, 0);
  const decreaseTotal = billableItems
    .filter((item) => item.change_type === "deduct")
    .reduce((sum, item) => sum + item.amount, 0);
  const subtotal = increaseTotal - decreaseTotal;
  const voType: VoType = increaseTotal > 0 && decreaseTotal > 0 ? "VO0" : decreaseTotal > 0 ? "VO-" : "VO+";
  const vatRate = numberValue(tax?.vat_rate || 7);
  const vatExempt = boolValue(tax?.vat_exempt);
  const withholdingTax = numberValue(tax?.withholding_tax);
  const vatAmount = vatExempt ? 0 : subtotal * (vatRate / 100);
  const grandTotal = Math.abs(subtotal + vatAmount);
  const whtAmount = grandTotal * (withholdingTax / 100);
  const netPayable = grandTotal - whtAmount;

  return {
    items: normalizedItems,
    subtotal,
    increase_total: increaseTotal,
    decrease_total: decreaseTotal,
    net_change: subtotal,
    vo_type: voType,
    vat_rate: vatRate,
    vat_exempt: vatExempt,
    withholding_tax: withholdingTax,
    vat_amount: vatAmount,
    wht_amount: whtAmount,
    grand_total: grandTotal,
    net_payable: netPayable,
    contract_before: 0,
    contract_after: 0,
  };
}

export function formatMoney(value?: string | number | null) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numberValue(value));
}

export function formatThaiDate(value?: string | number) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export function todayBangkok() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Bangkok",
  });
  return formatter.format(new Date());
}

export function addCalendarDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00+07:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addWorkingDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00+07:00`);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
}

export function getThaiYear(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return new Date().getFullYear() + 543;
  return date.getFullYear() + 543;
}

export function createNextVoId(projectCode: string, createdDate: string, existingVos: VoRecord[]) {
  const year = getThaiYear(createdDate);
  const prefix = `${projectCode}-${year}-VO-`;
  const nextSeq = existingVos
    .map((vo) => String(vo.vo_id || ""))
    .filter((id) => id.startsWith(prefix) && !/-R\d+$/.test(id))
    .map((id) => Number(id.slice(prefix.length, prefix.length + 3)))
    .filter(Number.isFinite)
    .reduce((max, value) => Math.max(max, value), 0) + 1;

  return `${prefix}${String(nextSeq).padStart(3, "0")}`;
}

export function createRevisionVoId(originalVoId: string, existingVos: VoRecord[]) {
  const prefix = `${originalVoId}-R`;
  const nextRevision = existingVos
    .map((vo) => String(vo.vo_id || ""))
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)))
    .filter(Number.isFinite)
    .reduce((max, value) => Math.max(max, value), 0) + 1;

  return `${prefix}${nextRevision}`;
}

export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (!value || typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function getDaysOverdue(deadline?: string | number) {
  if (!deadline) return 0;
  const today = new Date(`${todayBangkok()}T00:00:00+07:00`);
  const due = new Date(`${deadline}T00:00:00+07:00`);
  if (Number.isNaN(due.getTime())) return 0;
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
}

export function validateRequired(fields: Record<string, unknown>, labels: Record<string, string>) {
  return Object.entries(labels)
    .filter(([key]) => {
      const value = fields[key];
      if (Array.isArray(value)) return value.length === 0;
      return value === undefined || value === null || String(value).trim() === "";
    })
    .map(([, label]) => label);
}

export function createVoApprovalToken() {
  const cryptoSource = globalThis.crypto;
  if (cryptoSource?.randomUUID) return cryptoSource.randomUUID().replaceAll("-", "");
  if (cryptoSource?.getRandomValues) {
    const bytes = new Uint8Array(18);
    cryptoSource.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

function flexInfoRow(label: string, value: string) {
  return {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      { type: "text", text: label, color: "#64748B", size: "xs", flex: 3, weight: "bold" },
      { type: "text", text: value || "-", color: "#0F172A", size: "xs", flex: 5, weight: "bold", wrap: true },
    ],
  };
}

export function buildVoApprovalLineMessage({
  projectName,
  projectId,
  voId,
  title,
  total,
  extensionDays,
}: {
  projectName?: string;
  projectId: string;
  voId: string;
  title?: string;
  total?: string | number;
  extensionDays?: string | number;
}) {
  return [
    "ขออนุมัติงานเพิ่ม-ลด",
    `โครงการ: ${projectName || projectId}`,
    `เลขที่: ${voId}`,
    `รายการ: ${title || "-"}`,
    `มูลค่า: ${formatMoney(total)} บาท`,
    `วันเพิ่ม: ${formatMoney(extensionDays)} วัน`,
    "กรุณาตรวจเอกสารและกดอนุมัติในลิงก์นี้ เพื่อใช้เป็นหลักฐานตามสัญญาครับ",
  ].join("\n");
}

export function buildVoApprovalLineFlex({
  projectName,
  projectId,
  voId,
  voType,
  title,
  total,
  extensionDays,
  deadline,
  pdfUrl,
  attachmentUrl,
  attachmentCount,
  approvalUrl,
}: {
  projectName?: string;
  projectId: string;
  voId: string;
  voType?: string;
  title?: string;
  total?: string | number;
  extensionDays?: string | number;
  deadline?: string | number;
  pdfUrl?: string;
  attachmentUrl?: string;
  attachmentCount?: number;
  approvalUrl: string;
}) {
  const type = asVoType(voType);
  return applyLineFlexTheme({
    type: "flex",
    altText: `VO approval | ${projectName || projectId} | ${voId}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0F172A",
        paddingAll: "18px",
        contents: [
          { type: "text", text: "PMC CONNEXT VO APPROVAL", color: "#67E8F9", size: "xs", weight: "bold" },
          { type: "text", text: "อนุมัติงานเพิ่ม-ลด", color: "#FFFFFF", size: "xl", weight: "bold", margin: "sm", wrap: true },
          { type: "text", text: voId, color: "#FEF3C7", size: "sm", weight: "bold", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        contents: [
          { type: "text", text: projectName || projectId, color: "#020617", size: "lg", weight: "bold", wrap: true },
          flexInfoRow("ประเภท", VO_TYPE_LABELS[type]),
          flexInfoRow("รายการ", title || "-"),
          flexInfoRow("มูลค่า", `${formatMoney(total)} บาท`),
          flexInfoRow("วันเพิ่ม", `${formatMoney(extensionDays)} วัน`),
          flexInfoRow("กำหนดอนุมัติ", formatThaiDate(deadline)),
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#FFF7ED",
            cornerRadius: "8px",
            paddingAll: "12px",
            contents: [
              { type: "text", text: "หมายเหตุสำคัญ", color: "#C2410C", size: "xs", weight: "bold" },
              { type: "text", text: "การอนุมัตินี้ใช้เป็นหลักฐานประกอบการวางบิลและปรับแผนงานตามสัญญา", color: "#7C2D12", size: "xs", wrap: true, margin: "xs" },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "16px",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: "#0F766E",
            action: { type: "uri", label: "อนุมัติ VO", uri: approvalUrl },
          },
          ...(pdfUrl ? [{
            type: "button",
            style: "secondary",
            height: "sm",
            color: "#E2E8F0",
            action: { type: "uri", label: "เปิด PDF VO", uri: pdfUrl },
          }] : []),
          ...(attachmentUrl && attachmentCount ? [{
            type: "button",
            style: "secondary",
            height: "sm",
            color: "#FFEDD5",
            action: { type: "uri", label: `ดูไฟล์แนบ (${attachmentCount})`, uri: attachmentUrl },
          }] : []),
        ],
      },
    },
  }, {
    heroImageUrl: LINE_FLEX_HERO_IMAGES.variationOrder,
    badgeText: "VARIATION ORDER",
    metadataTypography: "comfortable",
  });
}

export function buildVoReviewResultLineFlex({
  projectName,
  projectId,
  voId,
  title,
  approvedItems,
  rejectedItems,
  approvedAmount,
  reviewedBy,
  reviewedAt,
  note,
  reviewUrl,
  dashboardUrl,
}: {
  projectName?: string;
  projectId: string;
  voId: string;
  title?: string;
  approvedItems: number;
  rejectedItems: number;
  approvedAmount?: string | number;
  reviewedBy?: string;
  reviewedAt?: string | number;
  note?: string;
  reviewUrl: string;
  dashboardUrl?: string;
}) {
  const resultMetric = (label: string, value: string, color: string, backgroundColor: string) => ({
    type: "box",
    layout: "vertical",
    flex: 1,
    backgroundColor,
    cornerRadius: "10px",
    paddingAll: "12px",
    contents: [
      { type: "text", text: label, color: "#475569", size: "sm", weight: "bold" },
      { type: "text", text: value, color, size: "xl", weight: "bold", margin: "sm" },
    ],
  });

  return applyLineFlexTheme({
    type: "flex",
    altText: `VO review result | ${projectName || projectId} | ${voId}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0F172A",
        paddingAll: "18px",
        contents: [
          { type: "text", text: "PMC CONNEXT VO RESULT", color: "#67E8F9", size: "xs", weight: "bold" },
          { type: "text", text: "ผลพิจารณางานเพิ่ม-ลด", color: "#FFFFFF", size: "xl", weight: "bold", margin: "sm", wrap: true },
          { type: "text", text: voId, color: "#FEF3C7", size: "sm", weight: "bold", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        contents: [
          { type: "text", text: projectName || projectId, color: "#020617", size: "lg", weight: "bold", wrap: true },
          flexInfoRow("รายการ", title || "-"),
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            margin: "sm",
            contents: [
              resultMetric("อนุมัติ", `${approvedItems} รายการ`, "#047857", "#ECFDF5"),
              resultMetric("ไม่อนุมัติ", `${rejectedItems} รายการ`, "#B91C1C", "#FEF2F2"),
            ],
          },
          flexInfoRow("ยอดที่อนุมัติ", `${formatMoney(approvedAmount)} บาท`),
          flexInfoRow("ผู้พิจารณา", reviewedBy || "ลูกค้า"),
          flexInfoRow("เวลาพิจารณา", formatBangkokDateTime(reviewedAt)),
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#FFF7ED",
            cornerRadius: "8px",
            paddingAll: "12px",
            contents: [
              { type: "text", text: "หมายเหตุจากลูกค้า", color: "#C2410C", size: "sm", weight: "bold" },
              { type: "text", text: note || "มีรายการที่ไม่อนุมัติ กรุณาตรวจรายละเอียดและออก VO ฉบับแก้ไข", color: "#7C2D12", size: "sm", wrap: true, margin: "xs", maxLines: 4 },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "16px",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: "#0F766E",
            action: { type: "uri", label: "ดูผลพิจารณารายรายการ", uri: reviewUrl },
          },
          ...(dashboardUrl ? [{
            type: "button",
            style: "secondary",
            height: "sm",
            color: "#E2E8F0",
            action: { type: "uri", label: "เปิดระบบ VO", uri: dashboardUrl },
          }] : []),
        ],
      },
    },
  }, {
    heroImageUrl: LINE_FLEX_HERO_IMAGES.variationOrder,
    badgeText: "VO REVIEW RESULT",
    metadataTypography: "comfortable",
  });
}

export function voFinancialEffect(vo?: Pick<VoRecord, "vo_type" | "grand_total" | "subtotal">) {
  const voType = asVoType(String(vo?.vo_type || ""));
  if (voType === "VO-") return -Math.abs(numberValue(vo?.grand_total));
  if (voType === "VO0") return numberValue(vo?.subtotal);
  return Math.abs(numberValue(vo?.grand_total));
}

export function buildVoApprovedLineFlex({
  projectName,
  projectId,
  voId,
  title,
  approvedBy,
  approvedAt,
  total,
  pdfUrl,
}: {
  projectName?: string;
  projectId: string;
  voId: string;
  title?: string;
  approvedBy?: string;
  approvedAt?: string;
  total?: string | number;
  pdfUrl?: string;
}) {
  return applyLineFlexTheme({
    type: "flex",
    altText: `VO approved | ${projectName || projectId} | ${voId}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0F172A",
        paddingAll: "18px",
        contents: [
          { type: "text", text: "PMC CONNEXT VO APPROVED", color: "#67E8F9", size: "xs", weight: "bold" },
          { type: "text", text: "อนุมัติ VO แล้ว", color: "#FFFFFF", size: "xl", weight: "bold", margin: "sm" },
          { type: "text", text: voId, color: "#BBF7D0", size: "sm", weight: "bold", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        contents: [
          { type: "text", text: projectName || projectId, color: "#020617", size: "lg", weight: "bold", wrap: true },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            contents: [
              { type: "text", text: "รายการงาน", color: "#64748B", size: "xs", weight: "bold" },
              { type: "text", text: title || "-", color: "#0F172A", size: "sm", weight: "bold", wrap: true, align: "start" },
            ],
          },
          flexInfoRow("มูลค่า", `${formatMoney(total)} บาท`),
          flexInfoRow("ผู้อนุมัติ", approvedBy || "-"),
          flexInfoRow("เวลา", formatBangkokDateTime(approvedAt)),
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#ECFDF5",
            cornerRadius: "8px",
            paddingAll: "12px",
            contents: [
              { type: "text", text: "สถานะงาน", color: "#047857", size: "xs", weight: "bold" },
              { type: "text", text: "ได้รับการอนุมัติแล้ว ทีมงานสามารถดำเนินงานนี้ต่อได้", color: "#064E3B", size: "xs", wrap: true, margin: "xs" },
            ],
          },
        ],
      },
      ...(pdfUrl ? {
        footer: {
          type: "box",
          layout: "vertical",
          paddingAll: "16px",
          contents: [{
            type: "button",
            style: "primary",
            height: "sm",
            color: "#0F172A",
            action: { type: "uri", label: "เปิด PDF หลักฐาน VO", uri: pdfUrl },
          }],
        },
      } : {}),
    },
  }, {
    heroImageUrl: LINE_FLEX_HERO_IMAGES.variationOrder,
    badgeText: "VO APPROVED",
  });
}
