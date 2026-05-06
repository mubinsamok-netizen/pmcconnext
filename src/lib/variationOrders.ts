export type VoType = "VO+" | "VO-" | "VO0";
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
  description?: string;
  unit?: string;
  quantity?: number | string;
  unit_price?: number | string;
};

export type VoItem = {
  item_no: number;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
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
  client_name?: string;
  task_plan_status?: string;
  evidence_json?: string;
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
};

export const VO_TYPE_LABELS: Record<VoType, string> = {
  "VO+": "งานเพิ่ม",
  "VO-": "งานลด",
  VO0: "งานสับเปลี่ยน",
};

export const VO_STATUS_LABELS: Record<VoStatus, string> = {
  draft: "ร่าง",
  pending_approval: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
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

export function asVoType(value?: string): VoType {
  if (value === "VO-" || value === "VO0") return value;
  return "VO+";
}

export function asVoStatus(value?: string): VoStatus {
  const normalized = String(value || "draft") as VoStatus;
  if (normalized in VO_STATUS_LABELS) return normalized;
  return "draft";
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

export function normalizeVoItems(items: VoItemInput[]) {
  return items
    .map((item, index) => {
      const quantity = numberValue(item.quantity);
      const unitPrice = numberValue(item.unit_price);
      return {
        item_no: Number(item.item_no || index + 1),
        description: String(item.description || "").trim(),
        unit: String(item.unit || "LS").trim() || "LS",
        quantity,
        unit_price: unitPrice,
        amount: quantity * unitPrice,
      };
    })
    .filter((item) => item.description || item.quantity || item.unit_price);
}

export function calculateVoTotals({
  items,
  tax,
  contractBefore,
  voType,
}: {
  items: VoItemInput[];
  tax?: VoTaxSettings;
  contractBefore?: string | number;
  voType?: string;
}): VoCalculation {
  const normalizedItems = normalizeVoItems(items);
  const subtotal = normalizedItems.reduce((sum, item) => sum + item.amount, 0);
  const vatRate = numberValue(tax?.vat_rate || 7);
  const vatExempt = boolValue(tax?.vat_exempt);
  const withholdingTax = numberValue(tax?.withholding_tax);
  const vatAmount = vatExempt ? 0 : subtotal * (vatRate / 100);
  const grandTotal = subtotal + vatAmount;
  const whtAmount = grandTotal * (withholdingTax / 100);
  const netPayable = grandTotal - whtAmount;
  const before = numberValue(contractBefore);
  const type = asVoType(voType);
  const contractAfter = type === "VO-" ? before - subtotal : type === "VO0" ? before : before + subtotal;

  return {
    items: normalizedItems,
    subtotal,
    vat_rate: vatRate,
    vat_exempt: vatExempt,
    withholding_tax: withholdingTax,
    vat_amount: vatAmount,
    wht_amount: whtAmount,
    grand_total: grandTotal,
    net_payable: netPayable,
    contract_before: before,
    contract_after: contractAfter,
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
