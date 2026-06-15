export type SheetRecord = Record<string, string | number | undefined>;

export type LifecycleStatus =
  | "design"
  | "contract"
  | "construction_drawing"
  | "permit_submitted"
  | "permit_issued"
  | "temporary_electric"
  | "temporary_water"
  | "waiting_demolition"
  | "demolition_done"
  | "construction"
  | "handover";

export const lifecycleStatusOptions: { value: LifecycleStatus; label: string }[] = [
  { value: "design", label: "ออกแบบ" },
  { value: "contract", label: "เซ็นสัญญา" },
  { value: "construction_drawing", label: "เขียนแบบก่อสร้าง" },
  { value: "permit_submitted", label: "ยื่นขออนุญาตก่อสร้าง" },
  { value: "permit_issued", label: "ใบอนุญาตก่อสร้าง" },
  { value: "temporary_electric", label: "ไฟฟ้าชั่วคราว" },
  { value: "temporary_water", label: "ประปาชั่วคราว" },
  { value: "waiting_demolition", label: "รอรื้อถอน" },
  { value: "demolition_done", label: "รื้อถอนเสร็จแล้ว" },
  { value: "construction", label: "อยู่ระหว่างก่อสร้าง" },
  { value: "handover", label: "ส่งมอบบ้าน" },
];

export const lifecycleStatusLabels = Object.fromEntries(
  lifecycleStatusOptions.map((option) => [option.value, option.label])
) as Record<LifecycleStatus, string>;

export const documentCategoryOptions = [
  { value: "contract", label: "สัญญา" },
  { value: "permit", label: "ใบอนุญาต" },
  { value: "house_plan", label: "แบบบ้าน" },
  { value: "construction_drawing", label: "แบบก่อสร้าง" },
  { value: "other", label: "อื่น ๆ" },
];

export const warrantyTypeOptions = [
  { key: "structure", label: "รับประกันโครงสร้างหลัก 20 ปี", years: 20, alertDays: 90 },
  { key: "roof", label: "รับประกันหลังคาและการรั่วซึม 5 ปี", years: 5, alertDays: 60 },
  { key: "architecture", label: "รับประกันงานสถาปัตยกรรม 1 ปี", years: 1, alertDays: 30 },
];

export type ReminderTarget = {
  key: string;
  title: string;
  dueDate: string;
  alertDays: number;
  link: string;
};

export function isIsoDate(value?: string | number) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export function toIsoDate(value?: string | number) {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const numericValue = Number(text);
  if (Number.isFinite(numericValue) && numericValue > 0 && numericValue < 100000) {
    const sheetEpoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(sheetEpoch + Math.floor(numericValue) * 86400000);
    return parsed.toISOString().slice(0, 10);
  }

  const slashMatch = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (slashMatch) {
    const [, first, second, yearValue] = slashMatch;
    let year = Number(yearValue);
    if (year < 100) year += 2000;
    if (year > 2400) year -= 543;

    const firstNumber = Number(first);
    const secondNumber = Number(second);
    const isMonthFirst = firstNumber <= 12 && secondNumber > 12;
    const day = isMonthFirst ? secondNumber : firstNumber;
    const month = isMonthFirst ? firstNumber : secondNumber;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function addYears(date: string, years: number) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  parsed.setFullYear(parsed.getFullYear() + years);
  return parsed.toISOString().slice(0, 10);
}

export function daysBetween(from: Date, dueDate: string) {
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - start.getTime()) / 86400000);
}

export function getLifecycleReminderTargets(projectId: string, lifecycle?: SheetRecord): ReminderTarget[] {
  if (!lifecycle) return [];
  const link = `/dashboard/sites/${encodeURIComponent(projectId)}/lifecycle`;
  const targets: ReminderTarget[] = [];
  const submittedDate = toIsoDate(lifecycle.permit_submitted_date);

  if (isIsoDate(submittedDate)) {
    targets.push({
      key: "permit-submitted-45-days",
      title: "ยื่นขออนุญาตก่อสร้างใกล้ครบ 45 วัน",
      dueDate: addDays(submittedDate, 45),
      alertDays: 7,
      link,
    });
  }

  [
    { key: "permit_expiry_date", title: "ใบอนุญาตก่อสร้างใกล้หมดอายุ", alertDays: 30 },
    { key: "temporary_electric_expiry_date", title: "ไฟฟ้าชั่วคราวใกล้หมดอายุ", alertDays: 30 },
    { key: "temporary_water_expiry_date", title: "ประปาชั่วคราวใกล้หมดอายุ", alertDays: 30 },
    { key: "construction_end_date", title: "ระยะเวลาก่อสร้างใกล้ครบกำหนด", alertDays: 15 },
  ].forEach((item) => {
    const dueDate = toIsoDate(lifecycle[item.key]);
    if (!isIsoDate(dueDate)) return;
    targets.push({
      key: item.key,
      title: item.title,
      dueDate,
      alertDays: item.alertDays,
      link,
    });
  });

  return targets;
}

export function getWarrantyReminderTargets(projectId: string, warranty?: SheetRecord): ReminderTarget[] {
  if (!warranty) return [];
  const handoverDate = toIsoDate(warranty.handover_date);
  const link = `/dashboard/sites/${encodeURIComponent(projectId)}/lifecycle`;
  const targets: ReminderTarget[] = [];

  warrantyTypeOptions.forEach((option) => {
    const explicitExpiryDate = toIsoDate(warranty[`${option.key}_expiry_date`]);
    const dueDate = isIsoDate(explicitExpiryDate)
      ? explicitExpiryDate
      : isIsoDate(handoverDate)
        ? addYears(handoverDate, option.years)
        : "";
    if (!dueDate) return;

    targets.push({
      key: `${option.key}-warranty-expiry`,
      title: `${option.label} ใกล้หมดอายุ`,
      dueDate,
      alertDays: option.alertDays,
      link,
    });
  });

  return targets;
}

export function getAlertState(today: Date, target: ReminderTarget) {
  const days = daysBetween(today, target.dueDate);
  if (days === null) return null;
  if (days < 0) return { kind: "overdue" as const, days };
  if (days <= target.alertDays) return { kind: "due_soon" as const, days };
  return null;
}
