import type { ComponentType } from "react";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  ClipboardList,
  FileSignature,
  FileText,
  FolderOpen,
  NotebookTabs,
  ReceiptText,
  StickyNote,
} from "lucide-react";
import type { SiteCalendarEvent } from "./SiteCalendarPanel";
import type { MasterProject } from "@/lib/masterProjects";
import { findAllBatch } from "@/lib/sheetsCrud";
import { ensureSchema } from "@/lib/sheetsSetup";
import { isSupabaseBackend } from "@/lib/supabaseRest";
import { getProjectContext } from "@/lib/siteContext";
import {
  getAlertState,
  getLifecycleReminderTargets,
  getWarrantyReminderTargets,
  type SheetRecord as LifecycleSheetRecord,
} from "@/lib/projectLifecycle";


export type SiteValue = string | number | boolean | null | undefined;
export type SiteRecord = Record<string, SiteValue>;
export type IconType = ComponentType<{ size?: number; className?: string }>;

export type PlanningSummary = {
  workTaskCount: number;
  plannedTaskCount: number;
  completedTaskCount: number;
  averageProgress: number;
  overdueTasks: SiteRecord[];
  dueSoonTasks: SiteRecord[];
  milestoneCount: number;
  planCoverage: number;
  planStart: string;
  planEnd: string;
  nextMilestone: string;
  openIssues: number;
  highPriorityItems: number;
};

export type CommercialSummary = {
  voCount: number;
  openVoCount: number;
  voAmount: number;
};

export type DefectSummary = {
  roundCount: number;
  openItems: number;
  fixedItems: number;
  passedItems: number;
  acknowledgedRounds: number;
  latestRound: string;
};

export type NotesSummary = {
  activeCount: number;
  pinnedCount: number;
  urgentCount: number;
  followUpDue: number;
  latestTitle: string;
};

export type MemoSummary = {
  totalCount: number;
  waitingAckCount: number;
  acknowledgedCount: number;
  timeImpactCount: number;
  extensionDays: number;
  approvedExtensionDays: number;
  latestTitle: string;
};

export type FilesSummary = {
  totalCount: number;
  imageCount: number;
  documentCount: number;
  latestTitle: string;
};

export type ReportsSummary = {
  dailyCount: number;
  weeklyCount: number;
  monthlyCount: number;
  latestDailyDate: string;
  latestDailyTitle: string;
};

export type DashboardAction = {
  title: string;
  detail: string;
  href: string;
  icon: IconType;
  tone: "red" | "orange" | "green" | "blue";
};

export type RecentItem = {
  title: string;
  detail: string;
  date: string;
  href: string;
  icon: IconType;
};

export type DashboardData = {
  planning: PlanningSummary;
  commercial: CommercialSummary;
  defects: DefectSummary;
  notes: NotesSummary;
  memos: MemoSummary;
  files: FilesSummary;
  reports: ReportsSummary;
  lifecycleAlerts: DashboardAction[];
  actions: DashboardAction[];
  recent: RecentItem[];
  calendarEvents: SiteCalendarEvent[];
  error: string;
};

const emptyPlanning: PlanningSummary = {
  workTaskCount: 0,
  plannedTaskCount: 0,
  completedTaskCount: 0,
  averageProgress: 0,
  overdueTasks: [],
  dueSoonTasks: [],
  milestoneCount: 0,
  planCoverage: 0,
  planStart: "",
  planEnd: "",
  nextMilestone: "",
  openIssues: 0,
  highPriorityItems: 0,
};

const emptyData: DashboardData = {
  planning: emptyPlanning,
  commercial: {
    voCount: 0,
    openVoCount: 0,
    voAmount: 0,
  },
  defects: {
    roundCount: 0,
    openItems: 0,
    fixedItems: 0,
    passedItems: 0,
    acknowledgedRounds: 0,
    latestRound: "",
  },
  notes: {
    activeCount: 0,
    pinnedCount: 0,
    urgentCount: 0,
    followUpDue: 0,
    latestTitle: "",
  },
  memos: {
    totalCount: 0,
    waitingAckCount: 0,
    acknowledgedCount: 0,
    timeImpactCount: 0,
    extensionDays: 0,
    approvedExtensionDays: 0,
    latestTitle: "",
  },
  files: {
    totalCount: 0,
    imageCount: 0,
    documentCount: 0,
    latestTitle: "",
  },
  reports: {
    dailyCount: 0,
    weeklyCount: 0,
    monthlyCount: 0,
    latestDailyDate: "",
    latestDailyTitle: "",
  },
  lifecycleAlerts: [],
  actions: [],
  recent: [],
  calendarEvents: [],
  error: "",
};

const DAILY_REPORT_STALE_DAYS = 7;

export function stringValue(value?: SiteValue) {
  return String(value ?? "").trim();
}

export function parseDate(value?: SiteValue) {
  const raw = stringValue(value);
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value?: SiteValue) {
  const date = parseDate(value);
  if (!date) return stringValue(value);
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function dateKey(value?: SiteValue) {
  return parseDate(value)?.getTime() ?? 0;
}

export function numberValue(value?: SiteValue) {
  const parsed = Number(stringValue(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function clampPercent(value?: SiteValue) {
  return Math.max(0, Math.min(100, numberValue(value)));
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function toDateInputValue(value?: SiteValue) {
  const date = parseDate(value);
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export function buildDriveFolderUrl(folderId?: SiteValue) {
  const value = stringValue(folderId);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://drive.google.com/drive/folders/${encodeURIComponent(value)}`;
}

export function isHighPriority(value?: SiteValue) {
  const status = stringValue(value).toLowerCase();
  return ["high", "urgent", "critical", "สูง", "ด่วน", "เร่งด่วน"].includes(status);
}

export function isTruthyText(value?: SiteValue) {
  return ["true", "1", "yes", "y", "ใช่"].includes(stringValue(value).toLowerCase());
}

export function isClosedStatus(status?: SiteValue) {
  const normalized = stringValue(status).toLowerCase();
  return ["closed", "done", "resolved", "cancelled", "completed", "paid", "approved", "ผ่าน", "ปิดงาน", "เสร็จ", "ยกเลิก"].includes(normalized);
}

export function isTaskDone(task: SiteRecord) {
  return isClosedStatus(task.status) || numberValue(task.percent_done) >= 100;
}

export function isProjectRow(projectId: string) {
  return (row: SiteRecord) => stringValue(row.project_id) === projectId;
}

export function daysUntil(value?: SiteValue) {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

export function daysSince(value?: SiteValue) {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - date.getTime()) / 86_400_000));
}

export function getDailyReportWarning(project: MasterProject, reports: ReportsSummary) {
  if (isClosedStatus(project.status)) return "";

  const latestDate = reports.latestDailyDate;
  const missingDays = daysSince(latestDate || project.start_date);
  if (missingDays === null || missingDays <= DAILY_REPORT_STALE_DAYS) return "";

  if (latestDate) {
    return `ไม่ได้รายงานประจำวันมา ${missingDays} วัน (ล่าสุด ${formatDate(latestDate)})`;
  }

  return `ยังไม่มีรายงานประจำวันมา ${missingDays} วัน`;
}

export function statusLabel(value?: SiteValue) {
  const status = stringValue(value);
  return status || "In Progress";
}

export function itemTitle(row: SiteRecord, fallback: string) {
  return stringValue(row.title || row.name || row.description || row.summary || row.document_no || row.doc_no || row.ref_no || row.file_name) || fallback;
}

export function calendarTone(status?: SiteValue, date?: SiteValue): SiteCalendarEvent["tone"] {
  const remaining = daysUntil(date);
  if (remaining !== null && remaining < 0 && !isClosedStatus(status)) return "red";
  if (isClosedStatus(status)) return "green";
  if (isHighPriority(status)) return "orange";
  const normalized = stringValue(status).toLowerCase();
  if (["pending", "pending_approval", "รอลูกค้า", "ต้องยืนยัน", "ส่งแจ้งเตือนแล้ว", "waiting_ack"].includes(normalized)) return "orange";
  return "blue";
}

export function calendarEvent({
  id,
  date,
  title,
  detail,
  source,
  href,
  tone = "blue",
  time = "",
}: {
  id: string;
  date?: SiteValue;
  title: string;
  detail: string;
  source: SiteCalendarEvent["source"];
  href: string;
  tone?: SiteCalendarEvent["tone"];
  time?: string;
}): SiteCalendarEvent | null {
  const day = toDateInputValue(date);
  if (!day) return null;
  return { id, date: day, title, detail, source, href, tone, time };
}

export function calendarDateRange(start?: SiteValue, end?: SiteValue) {
  const startDate = parseDate(start);
  if (!startDate) return [];
  const endDate = parseDate(end) || startDate;
  const first = startDate.getTime() <= endDate.getTime() ? startDate : endDate;
  const last = startDate.getTime() <= endDate.getTime() ? endDate : startDate;
  const days: string[] = [];
  const cursor = new Date(first);
  cursor.setHours(12, 0, 0, 0);
  last.setHours(12, 0, 0, 0);

  while (cursor.getTime() <= last.getTime() && days.length < 180) {
    days.push(toDateInputValue(cursor.toISOString()));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

export function compactCalendarEvents(events: Array<SiteCalendarEvent | null>) {
  return events
    .filter((event): event is SiteCalendarEvent => Boolean(event))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "th"))
    .slice(0, 2500);
}

export function buildCalendarEvents(project: MasterProject, rows: {
  tasks: SiteRecord[];
  milestones: SiteRecord[];
  customerDecisions: SiteRecord[];
  qcChecklists: SiteRecord[];
  issues: SiteRecord[];
  materials: SiteRecord[];
  dailyReports: SiteRecord[];
  weeklyReports: SiteRecord[];
  monthlyReports: SiteRecord[];
  defectRounds: SiteRecord[];
  defectItems: SiteRecord[];
  documents: SiteRecord[];
  variationOrders: SiteRecord[];
  voFinanceLedger: SiteRecord[];
  siteNotes: SiteRecord[];
  siteMemos: SiteRecord[];
  lifecycle?: SiteRecord;
  warranty?: SiteRecord;
}) {
  const events: Array<SiteCalendarEvent | null> = [];
  const projectId = project.project_id;
  const scheduleHref = `/dashboard/sites/${projectId}/schedule`;
  const reportsHref = `/dashboard/sites/${projectId}/reports`;
  const lifecycleHref = `/dashboard/sites/${projectId}/lifecycle`;
  const detailsHref = `/dashboard/sites/${projectId}/details`;

  events.push(calendarEvent({
    id: `project-start-${projectId}`,
    date: project.start_date,
    title: `เริ่มโครงการ: ${project.name}`,
    detail: project.client || project.project_id,
    source: "โครงการ",
    href: detailsHref,
    tone: "blue",
  }));
  events.push(calendarEvent({
    id: `project-end-${projectId}`,
    date: project.end_date,
    title: `สิ้นสุดโครงการ: ${project.name}`,
    detail: statusLabel(project.status),
    source: "โครงการ",
    href: detailsHref,
    tone: calendarTone(project.status, project.end_date),
  }));

  rows.tasks.forEach((task) => {
    const start = task.planned_start || task.start;
    const end = task.planned_end || task.end;
    const activeDates = calendarDateRange(start, end);
    if (activeDates.length === 0) return;
    const title = itemTitle(task, "งานแผนงาน");
    const detail = stringValue(task.assignee) || statusLabel(task.status);
    const taskId = stringValue(task.task_id || title);
    const isHeading = stringValue(task.task_type) === "heading";

    activeDates.forEach((day, index) => {
      const isFirst = index === 0;
      const isLast = index === activeDates.length - 1;
      const label =
        activeDates.length === 1
          ? title
          : isFirst
            ? `เริ่ม: ${title}`
            : isLast
              ? `ครบกำหนด: ${title}`
              : isHeading
                ? `ช่วงงาน: ${title}`
                : title;
      events.push(calendarEvent({
        id: `task-active-${taskId}-${day}`,
        date: day,
        title: label,
        detail,
        source: "แผนงาน",
        href: scheduleHref,
        tone: isTaskDone(task) ? "green" : calendarTone(task.status, day),
      }));
    });
  });

  rows.milestones.forEach((milestone) => {
    events.push(calendarEvent({
      id: `milestone-${stringValue(milestone.milestone_id || milestone.title)}-${toDateInputValue(milestone.date)}`,
      date: milestone.date,
      title: itemTitle(milestone, "Milestone"),
      detail: stringValue(milestone.type) || "Milestone",
      source: "Milestone",
      href: scheduleHref,
      tone: "green",
    }));
  });

  rows.customerDecisions.forEach((decision) => {
    const status = stringValue(decision.decision_status);
    events.push(calendarEvent({
      id: `decision-notified-${stringValue(decision.decision_id || decision.title)}`,
      date: decision.notified_at || decision.updated_at || decision.created_at,
      title: itemTitle(decision, "รายการลูกค้าต้องตัดสินใจ"),
      detail: status || "รอลูกค้าตัดสินใจ",
      source: "ตัดสินใจ",
      href: scheduleHref,
      tone: calendarTone(status || "รอลูกค้า", decision.notified_at || decision.updated_at),
    }));
    events.push(calendarEvent({
      id: `decision-confirmed-${stringValue(decision.decision_id || decision.title)}`,
      date: decision.decided_at,
      title: `ยืนยันแล้ว: ${itemTitle(decision, "รายการลูกค้าตัดสินใจ")}`,
      detail: stringValue(decision.decided_by) || "ลูกค้า",
      source: "ตัดสินใจ",
      href: scheduleHref,
      tone: "green",
    }));
  });

  rows.qcChecklists.forEach((qc) => {
    const href = `/dashboard/sites/${projectId}/qc-checklists`;
    events.push(calendarEvent({
      id: `qc-inspection-${stringValue(qc.qc_id || qc.title)}`,
      date: qc.inspection_date,
      title: `ตรวจ QC: ${itemTitle(qc, "QC Checklist")}`,
      detail: statusLabel(qc.status || qc.approval_status),
      source: "QC",
      href,
      tone: calendarTone(qc.status || qc.approval_status, qc.inspection_date),
    }));
    events.push(calendarEvent({
      id: `qc-approved-${stringValue(qc.qc_id || qc.title)}`,
      date: qc.customer_approved_at,
      title: `QC อนุมัติ: ${itemTitle(qc, "QC Checklist")}`,
      detail: stringValue(qc.customer_approved_by) || "ลูกค้า",
      source: "QC",
      href,
      tone: "green",
    }));
  });

  rows.issues.forEach((issue) => {
    events.push(calendarEvent({
      id: `issue-due-${stringValue(issue.issue_id || issue.title)}`,
      date: issue.due_date,
      title: `ครบกำหนด Issue: ${itemTitle(issue, "Issue")}`,
      detail: stringValue(issue.owner || issue.priority) || statusLabel(issue.status),
      source: "Issue",
      href: "/dashboard/issues",
      tone: calendarTone(issue.status || issue.priority, issue.due_date),
    }));
  });

  rows.materials.forEach((material) => {
    const href = "/dashboard/materials";
    const title = itemTitle(material, "วัสดุ");
    events.push(calendarEvent({
      id: `material-order-${stringValue(material.material_id || title)}`,
      date: material.order_date,
      title: `สั่งวัสดุ: ${title}`,
      detail: stringValue(material.supplier || material.quantity || material.qty_actual || material.unit) || statusLabel(material.status),
      source: "วัสดุ",
      href,
      tone: calendarTone(material.status, material.order_date),
    }));
    events.push(calendarEvent({
      id: `material-delivery-${stringValue(material.material_id || title)}`,
      date: material.delivery_date,
      title: `ส่งวัสดุ: ${title}`,
      detail: stringValue(material.supplier || material.quantity || material.qty_actual || material.unit) || statusLabel(material.status),
      source: "วัสดุ",
      href,
      tone: calendarTone(material.status, material.delivery_date),
    }));
  });

  rows.defectRounds.forEach((round) => {
    events.push(calendarEvent({
      id: `defect-round-${stringValue(round.round_id || round.document_no)}`,
      date: round.inspection_date,
      title: itemTitle(round, "รอบตรวจ Defect"),
      detail: statusLabel(round.status),
      source: "Defect",
      href: `/dashboard/sites/${projectId}/defects`,
      tone: calendarTone(round.status, round.inspection_date),
    }));
  });

  rows.defectItems.forEach((item) => {
    events.push(calendarEvent({
      id: `defect-due-${stringValue(item.item_id || item.item_no)}`,
      date: item.due_date,
      title: `ครบกำหนดแก้: ${itemTitle(item, "Defect")}`,
      detail: stringValue(item.owner || item.zone || item.work_category) || statusLabel(item.status),
      source: "Defect",
      href: `/dashboard/sites/${projectId}/defects`,
      tone: calendarTone(item.status, item.due_date),
    }));
  });

  rows.variationOrders.forEach((vo) => {
    const href = `/dashboard/sites/${projectId}/variation-orders`;
    events.push(calendarEvent({
      id: `vo-approval-${stringValue(vo.vo_id || vo.title)}`,
      date: vo.approval_deadline,
      title: `กำหนดอนุมัติ VO: ${itemTitle(vo, "Variation Order")}`,
      detail: `${formatMoney(numberValue(vo.grand_total || vo.net_payable || vo.amount_due))} บาท`,
      source: "VO",
      href,
      tone: calendarTone(vo.status, vo.approval_deadline),
    }));
    events.push(calendarEvent({
      id: `vo-approved-${stringValue(vo.vo_id || vo.title)}`,
      date: vo.customer_approved_at,
      title: `VO อนุมัติ: ${itemTitle(vo, "Variation Order")}`,
      detail: stringValue(vo.customer_approved_by) || statusLabel(vo.status),
      source: "VO",
      href,
      tone: "green",
    }));
    events.push(calendarEvent({
      id: `vo-payment-${stringValue(vo.vo_id || vo.title)}`,
      date: vo.due_date,
      title: `ครบกำหนดชำระ: ${itemTitle(vo, "Variation Order")}`,
      detail: `${formatMoney(numberValue(vo.balance || vo.amount_due))} บาท`,
      source: "VO",
      href,
      tone: calendarTone(vo.payment_status || vo.status, vo.due_date),
    }));
  });

  rows.voFinanceLedger.forEach((entry) => {
    events.push(calendarEvent({
      id: `vo-ledger-${stringValue(entry.ledger_id || entry.ref_no || entry.summary)}`,
      date: entry.entry_date,
      title: itemTitle(entry, "รายการบัญชี VO"),
      detail: stringValue(entry.ref_no || entry.entry_type) || `${formatMoney(numberValue(entry.debit || entry.credit))} บาท`,
      source: "บัญชี",
      href: `/dashboard/sites/${projectId}/variation-orders`,
      tone: numberValue(entry.balance) > 0 ? "orange" : "green",
    }));
  });

  rows.siteMemos.forEach((memo) => {
    const href = `/dashboard/sites/${projectId}/memos`;
    events.push(calendarEvent({
      id: `memo-event-${stringValue(memo.memo_id || memo.document_no)}`,
      date: memo.event_date || memo.issue_date,
      title: itemTitle(memo, "Memo"),
      detail: statusLabel(memo.status),
      source: "Memo",
      href,
      tone: calendarTone(memo.status, memo.event_date || memo.issue_date),
    }));
    events.push(calendarEvent({
      id: `memo-ack-${stringValue(memo.memo_id || memo.document_no)}`,
      date: memo.acknowledged_date,
      title: `รับทราบ Memo: ${itemTitle(memo, "Memo")}`,
      detail: stringValue(memo.acknowledged_by) || "ลูกค้า",
      source: "Memo",
      href,
      tone: "green",
    }));
  });

  rows.siteNotes.forEach((note) => {
    events.push(calendarEvent({
      id: `note-follow-${stringValue(note.note_id || note.title)}`,
      date: note.follow_up_date,
      title: itemTitle(note, "ติดตามบันทึกหน้างาน"),
      detail: stringValue(note.category || note.priority) || "Follow-up",
      source: "บันทึก",
      href: `/dashboard/sites/${projectId}/notes`,
      tone: calendarTone(note.priority, note.follow_up_date),
    }));
  });

  rows.dailyReports.forEach((report) => {
    events.push(calendarEvent({
      id: `daily-report-${stringValue(report.report_id || report.date)}`,
      date: report.date,
      title: itemTitle(report, "รายงานประจำวัน"),
      detail: stringValue(report.weather || report.work_done) || "Daily Report",
      source: "รายงาน",
      href: reportsHref,
      tone: "slate",
    }));
  });

  rows.weeklyReports.forEach((report) => {
    events.push(calendarEvent({
      id: `weekly-report-${stringValue(report.report_id || report.week_start)}`,
      date: report.week_end || report.week_start,
      title: itemTitle(report, "รายงานประจำสัปดาห์"),
      detail: report.week_start && report.week_end ? `${formatDate(report.week_start)} - ${formatDate(report.week_end)}` : "Weekly Report",
      source: "รายงาน",
      href: reportsHref,
      tone: "slate",
    }));
  });

  rows.monthlyReports.forEach((report) => {
    events.push(calendarEvent({
      id: `monthly-report-${stringValue(report.report_id || report.month || report.month_end)}`,
      date: report.month_end || report.month_start || report.month,
      title: itemTitle(report, "รายงานประจำเดือน"),
      detail: stringValue(report.month) || "Monthly Report",
      source: "รายงาน",
      href: reportsHref,
      tone: "slate",
    }));
  });

  rows.documents.forEach((document) => {
    events.push(calendarEvent({
      id: `document-upload-${stringValue(document.document_id || document.drive_file_id || document.title)}`,
      date: document.created_at || document.updated_at,
      title: itemTitle(document, "เอกสารไซต์"),
      detail: stringValue(document.category || document.uploaded_by_name) || "อัปโหลดเอกสาร",
      source: "เอกสาร",
      href: `/dashboard/sites/${projectId}/files`,
      tone: "blue",
    }));
  });

  const lifecycleEvents: Array<{ key: string; label: string; date?: SiteValue; tone?: SiteCalendarEvent["tone"] }> = [
    { key: "design_start_date", label: "เริ่มออกแบบ", date: rows.lifecycle?.design_start_date, tone: "blue" },
    { key: "design_done_date", label: "ออกแบบเสร็จ", date: rows.lifecycle?.design_done_date, tone: "green" },
    { key: "contract_signed_date", label: "เซ็นสัญญา", date: rows.lifecycle?.contract_signed_date, tone: "green" },
    { key: "drawing_start_date", label: "เริ่มแบบก่อสร้าง", date: rows.lifecycle?.drawing_start_date, tone: "blue" },
    { key: "drawing_done_date", label: "แบบก่อสร้างเสร็จ", date: rows.lifecycle?.drawing_done_date, tone: "green" },
    { key: "permit_submitted_date", label: "ยื่นขออนุญาต", date: rows.lifecycle?.permit_submitted_date, tone: "orange" },
    { key: "permit_received_date", label: "ได้รับใบอนุญาต", date: rows.lifecycle?.permit_received_date, tone: "green" },
    { key: "permit_expiry_date", label: "ใบอนุญาตหมดอายุ", date: rows.lifecycle?.permit_expiry_date },
    { key: "temporary_electric_install_date", label: "ติดตั้งไฟชั่วคราว", date: rows.lifecycle?.temporary_electric_install_date, tone: "blue" },
    { key: "temporary_electric_expiry_date", label: "ไฟชั่วคราวหมดอายุ", date: rows.lifecycle?.temporary_electric_expiry_date },
    { key: "temporary_water_install_date", label: "ติดตั้งน้ำชั่วคราว", date: rows.lifecycle?.temporary_water_install_date, tone: "blue" },
    { key: "temporary_water_expiry_date", label: "น้ำชั่วคราวหมดอายุ", date: rows.lifecycle?.temporary_water_expiry_date },
    { key: "demolition_waiting_date", label: "รอรื้อถอน", date: rows.lifecycle?.demolition_waiting_date, tone: "orange" },
    { key: "demolition_done_date", label: "รื้อถอนเสร็จ", date: rows.lifecycle?.demolition_done_date, tone: "green" },
    { key: "construction_start_date", label: "เริ่มก่อสร้าง", date: rows.lifecycle?.construction_start_date, tone: "blue" },
    { key: "construction_end_date", label: "สิ้นสุดก่อสร้าง", date: rows.lifecycle?.construction_end_date },
  ];
  lifecycleEvents.forEach((item) => {
    events.push(calendarEvent({
      id: `lifecycle-${projectId}-${item.key}`,
      date: item.date,
      title: item.label,
      detail: statusLabel(rows.lifecycle?.current_status),
      source: "Lifecycle",
      href: lifecycleHref,
      tone: item.tone || calendarTone(rows.lifecycle?.current_status, item.date),
    }));
  });

  const warrantyEvents: Array<{ key: string; label: string; date?: SiteValue; tone?: SiteCalendarEvent["tone"] }> = [
    { key: "handover_date", label: "วันส่งมอบงาน", date: rows.warranty?.handover_date, tone: "green" },
    { key: "structure_retention_date", label: "Retention โครงสร้าง", date: rows.warranty?.structure_retention_date, tone: "orange" },
    { key: "structure_expiry_date", label: "หมดประกันโครงสร้าง", date: rows.warranty?.structure_expiry_date },
    { key: "roof_retention_date", label: "Retention หลังคา", date: rows.warranty?.roof_retention_date, tone: "orange" },
    { key: "roof_expiry_date", label: "หมดประกันหลังคา", date: rows.warranty?.roof_expiry_date },
    { key: "architecture_retention_date", label: "Retention สถาปัตย์", date: rows.warranty?.architecture_retention_date, tone: "orange" },
    { key: "architecture_expiry_date", label: "หมดประกันสถาปัตย์", date: rows.warranty?.architecture_expiry_date },
  ];
  warrantyEvents.forEach((item) => {
    events.push(calendarEvent({
      id: `warranty-${projectId}-${item.key}`,
      date: item.date,
      title: item.label,
      detail: project.name,
      source: "ประกัน",
      href: lifecycleHref,
      tone: item.tone || calendarTone("", item.date),
    }));
  });

  return compactCalendarEvents(events);
}

export function isForemanVisibleHref(href: string) {
  return !["/defects", "/variation-orders", "/rfa", "/rfi", "/lifecycle"].some((segment) => href.includes(segment));
}

export async function getDashboardData(project: MasterProject, suppliedRows?: Promise<Record<string, SiteRecord[]>>, includeCalendar = true): Promise<DashboardData> {
  try {
    const rows = suppliedRows ? await suppliedRows : await (async () => {
    const { sheetId } = await getProjectContext(project.project_id);
    if (!isSupabaseBackend()) await ensureSchema(sheetId);

    return await findAllBatch([
      "Tasks",
      "Milestones",
      "Customer_Decisions",
      "QC_Checklists",
      "Issues",
      "Materials",
      "Daily_Reports",
      "Weekly_Reports",
      "Monthly_Reports",
      "Defect_Rounds",
      "Defect_Items",
      "Project_Documents",
      "Variation_Orders",
      "VO_Finance_Ledger",
      "Site_Notes",
      "Site_Memos",
      "Project_Lifecycle",
      "Project_Warranty",
    ], sheetId) as Record<string, SiteRecord[]>;

    })();

    const tasks = rows.Tasks || [];
    const milestones = rows.Milestones || [];
    const customerDecisions = rows.Customer_Decisions || [];
    const qcChecklists = rows.QC_Checklists || [];
    const issues = rows.Issues || [];
    const materials = rows.Materials || [];
    const dailyReports = rows.Daily_Reports || [];
    const weeklyReports = rows.Weekly_Reports || [];
    const monthlyReports = rows.Monthly_Reports || [];
    const defectRounds = rows.Defect_Rounds || [];
    const defectItems = rows.Defect_Items || [];
    const documents = rows.Project_Documents || [];
    const variationOrders = rows.Variation_Orders || [];
    const voFinanceLedger = rows.VO_Finance_Ledger || [];
    const siteNotes = rows.Site_Notes || [];
    const siteMemos = rows.Site_Memos || [];
    const lifecycles = rows.Project_Lifecycle || [];
    const warranties = rows.Project_Warranty || [];

    const belongsToProject = isProjectRow(project.project_id);
    const projectTasks = tasks.filter((task) => belongsToProject(task) && stringValue(task.task_type) !== "heading");
    const projectCalendarTasks = tasks.filter(belongsToProject);
    const projectMilestones = milestones.filter(belongsToProject);
    const projectCustomerDecisions = customerDecisions.filter((decision) => belongsToProject(decision) && stringValue(decision.active) !== "FALSE");
    const projectQcChecklists = qcChecklists.filter((qc) => belongsToProject(qc) && stringValue(qc.active) !== "FALSE");
    const projectIssues = issues.filter(belongsToProject);
    const projectMaterials = materials.filter(belongsToProject);
    const projectDailyReports = dailyReports.filter(belongsToProject);
    const projectWeeklyReports = weeklyReports.filter(belongsToProject);
    const projectMonthlyReports = monthlyReports.filter(belongsToProject);
    const projectDefectRounds = defectRounds.filter(belongsToProject);
    const projectDefectItems = defectItems.filter(belongsToProject);
    const projectDocuments = documents.filter(belongsToProject);
    const projectVariationOrders = variationOrders.filter(belongsToProject);
    const projectVoFinanceLedger = voFinanceLedger.filter(belongsToProject);
    const projectNotes = siteNotes.filter((note) => belongsToProject(note) && !isTruthyText(note.archived));
    const projectMemos = siteMemos.filter(belongsToProject);
    const projectLifecycle = lifecycles.find(belongsToProject);
    const projectWarranty = warranties.find(belongsToProject);

    const plannedTasks = projectTasks.filter((task) => parseDate(task.planned_start || task.start) && parseDate(task.planned_end || task.end));
    const completedTasks = projectTasks.filter(isTaskDone);
    const overdueTasks = projectTasks
      .filter((task) => {
        const remaining = daysUntil(task.planned_end || task.end);
        return remaining !== null && remaining < 0 && !isTaskDone(task);
      })
      .sort((a, b) => dateKey(a.planned_end || a.end) - dateKey(b.planned_end || b.end));
    const dueSoonTasks = projectTasks
      .filter((task) => {
        const remaining = daysUntil(task.planned_end || task.end);
        return remaining !== null && remaining >= 0 && remaining <= 7 && !isTaskDone(task);
      })
      .sort((a, b) => dateKey(a.planned_end || a.end) - dateKey(b.planned_end || b.end));
    const planDates = plannedTasks
      .flatMap((task) => [parseDate(task.planned_start || task.start), parseDate(task.planned_end || task.end)])
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => a.getTime() - b.getTime());
    const nextMilestone = projectMilestones
      .map((milestone) => ({ row: milestone, date: parseDate(milestone.date) }))
      .filter((milestone) => {
        const remaining = daysUntil(milestone.row.date);
        return milestone.date && remaining !== null && remaining >= 0;
      })
      .sort((a, b) => Number(a.date) - Number(b.date))[0];
    const openIssues = projectIssues.filter((issue) => !isClosedStatus(issue.status));
    const highPriorityIssues = openIssues.filter((issue) => isHighPriority(issue.priority));
    const highPriorityTasks = projectTasks.filter((task) => !isTaskDone(task) && isHighPriority(task.priority));

    const activeVos = projectVariationOrders.filter((vo) => !isClosedStatus(vo.status) || stringValue(vo.status).toLowerCase() === "approved");
    const openVos = projectVariationOrders.filter((vo) => !isClosedStatus(vo.status));

    const openDefectItems = projectDefectItems.filter((item) => !isClosedStatus(item.status) && !["fixed", "repaired", "แก้แล้ว"].includes(stringValue(item.status).toLowerCase()));
    const fixedDefectItems = projectDefectItems.filter((item) => ["fixed", "repaired", "แก้แล้ว", "รอตรวจ"].includes(stringValue(item.status).toLowerCase()));
    const passedDefectItems = projectDefectItems.filter((item) => isClosedStatus(item.status));
    const acknowledgedRounds = projectDefectRounds.filter((round) => stringValue(round.acknowledged_date || round.acknowledged_by)).length;
    const latestRound = [...projectDefectRounds].sort((a, b) => dateKey(b.inspection_date || b.updated_at || b.created_at) - dateKey(a.inspection_date || a.updated_at || a.created_at))[0];

    const pinnedNotes = projectNotes.filter((note) => isTruthyText(note.pinned));
    const urgentNotes = projectNotes.filter((note) => isHighPriority(note.priority));
    const followUpNotes = projectNotes.filter((note) => {
      const remaining = daysUntil(note.follow_up_date);
      return remaining !== null && remaining <= 3;
    });
    const latestNote = [...projectNotes].sort((a, b) => dateKey(b.updated_at || b.created_at) - dateKey(a.updated_at || a.created_at))[0];
    const memoAcknowledgedStatuses = new Set(["acknowledged", "extension_approved", "closed"]);
    const memoRejectedStatuses = new Set(["rejected", "cancelled"]);
    const waitingAckMemos = projectMemos.filter((memo) => (
      isTruthyText(memo.requires_customer_ack) &&
      !memoAcknowledgedStatuses.has(stringValue(memo.status)) &&
      !memoRejectedStatuses.has(stringValue(memo.status))
    ));
    const acknowledgedMemos = projectMemos.filter((memo) => memoAcknowledgedStatuses.has(stringValue(memo.status)));
    const timeImpactMemos = projectMemos.filter((memo) => isTruthyText(memo.has_time_impact) && !memoRejectedStatuses.has(stringValue(memo.status)));
    const approvedExtensionMemos = projectMemos.filter((memo) => ["extension_approved", "closed"].includes(stringValue(memo.status)));
    const latestMemo = [...projectMemos].sort((a, b) => dateKey(b.updated_at || b.issued_at || b.created_at) - dateKey(a.updated_at || a.issued_at || a.created_at))[0];

    const imageDocuments = projectDocuments.filter((document) => stringValue(document.mime_type).startsWith("image/"));
    const latestDocument = [...projectDocuments].sort((a, b) => dateKey(b.updated_at || b.created_at) - dateKey(a.updated_at || a.created_at))[0];
    const latestDailyReport = [...projectDailyReports].sort((a, b) => dateKey(b.date || b.updated_at || b.created_at) - dateKey(a.date || a.updated_at || a.created_at))[0];

    const planning: PlanningSummary = {
      workTaskCount: projectTasks.length,
      plannedTaskCount: plannedTasks.length,
      completedTaskCount: completedTasks.length,
      averageProgress: projectTasks.length
        ? Math.round(projectTasks.reduce((sum, task) => sum + clampPercent(task.percent_done), 0) / projectTasks.length)
        : 0,
      overdueTasks,
      dueSoonTasks,
      milestoneCount: projectMilestones.length,
      planCoverage: projectTasks.length ? Math.round((plannedTasks.length / projectTasks.length) * 100) : 0,
      planStart: planDates[0]?.toISOString().slice(0, 10) ?? "",
      planEnd: planDates[planDates.length - 1]?.toISOString().slice(0, 10) ?? "",
      nextMilestone: nextMilestone ? `${itemTitle(nextMilestone.row, "Milestone")} (${formatDate(nextMilestone.row.date)})` : "",
      openIssues: openIssues.length,
      highPriorityItems: highPriorityIssues.length + highPriorityTasks.length,
    };

    const commercial: CommercialSummary = {
      voCount: projectVariationOrders.length,
      openVoCount: openVos.length,
      voAmount: activeVos.reduce((sum, vo) => sum + numberValue(vo.grand_total || vo.net_payable || vo.amount_due || vo.subtotal), 0),
    };

    const defects: DefectSummary = {
      roundCount: projectDefectRounds.length,
      openItems: openDefectItems.length,
      fixedItems: fixedDefectItems.length,
      passedItems: passedDefectItems.length,
      acknowledgedRounds,
      latestRound: latestRound ? itemTitle(latestRound, "รอบตรวจส่งมอบ") : "",
    };

    const notes: NotesSummary = {
      activeCount: projectNotes.length,
      pinnedCount: pinnedNotes.length,
      urgentCount: urgentNotes.length,
      followUpDue: followUpNotes.length,
      latestTitle: latestNote ? itemTitle(latestNote, "บันทึกหน้างาน") : "",
    };

    const memos: MemoSummary = {
      totalCount: projectMemos.length,
      waitingAckCount: waitingAckMemos.length,
      acknowledgedCount: acknowledgedMemos.length,
      timeImpactCount: timeImpactMemos.length,
      extensionDays: timeImpactMemos.reduce((sum, memo) => sum + Math.max(0, Math.round(numberValue(memo.extension_days))), 0),
      approvedExtensionDays: approvedExtensionMemos.reduce((sum, memo) => sum + Math.max(0, Math.round(numberValue(memo.extension_days))), 0),
      latestTitle: latestMemo ? itemTitle(latestMemo, "Memo ล่าสุด") : "",
    };

    const files: FilesSummary = {
      totalCount: projectDocuments.length,
      imageCount: imageDocuments.length,
      documentCount: projectDocuments.length - imageDocuments.length,
      latestTitle: latestDocument ? itemTitle(latestDocument, "ไฟล์ล่าสุด") : "",
    };

    const reports: ReportsSummary = {
      dailyCount: projectDailyReports.length,
      weeklyCount: projectWeeklyReports.length,
      monthlyCount: projectMonthlyReports.length,
      latestDailyDate: stringValue(latestDailyReport?.date),
      latestDailyTitle: latestDailyReport ? itemTitle(latestDailyReport, "รายงานประจำวัน") : "",
    };
    const lifecycleAlerts = buildLifecycleAlerts(project.project_id, projectLifecycle, projectWarranty);

    const actions = buildActions(project.project_id, {
      planning,
      commercial,
      defects,
      notes,
      memos,
      reports,
      lifecycleAlerts,
    });
    const recent = buildRecent(project.project_id, {
      latestNote,
      latestMemo,
      latestDocument,
      latestDailyReport,
      latestRound,
      latestVo: [...projectVariationOrders].sort((a, b) => dateKey(b.updated_at || b.created_at) - dateKey(a.updated_at || a.created_at))[0],
    });
    const calendarEvents = includeCalendar ? buildCalendarEvents(project, {
      tasks: projectCalendarTasks,
      milestones: projectMilestones,
      customerDecisions: projectCustomerDecisions,
      qcChecklists: projectQcChecklists,
      issues: projectIssues,
      materials: projectMaterials,
      dailyReports: projectDailyReports,
      weeklyReports: projectWeeklyReports,
      monthlyReports: projectMonthlyReports,
      defectRounds: projectDefectRounds,
      defectItems: projectDefectItems,
      documents: projectDocuments,
      variationOrders: projectVariationOrders,
      voFinanceLedger: projectVoFinanceLedger,
      siteNotes: projectNotes,
      siteMemos: projectMemos,
      lifecycle: projectLifecycle,
      warranty: projectWarranty,
    }) : [];

    return {
      planning,
      commercial,
      defects,
      notes,
      memos,
      files,
      reports,
      lifecycleAlerts,
      actions,
      recent,
      calendarEvents,
      error: "",
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...emptyData,
      error: message.includes("Quota exceeded")
        ? "Google Sheets quota เต็มชั่วคราว จึงยังสรุปข้อมูลของไซต์นี้ไม่ได้ในตอนนี้"
        : "ยังไม่สามารถโหลดข้อมูลภาพรวมของไซต์นี้ได้",
    };
  }
}

export function buildActions(
  projectId: string,
  summaries: {
    planning: PlanningSummary;
    commercial: CommercialSummary;
    defects: DefectSummary;
    notes: NotesSummary;
    memos: MemoSummary;
    reports: ReportsSummary;
    lifecycleAlerts: DashboardAction[];
  },
) {
  const actions: DashboardAction[] = [...summaries.lifecycleAlerts];

  if (summaries.planning.overdueTasks.length > 0) {
    actions.push({
      title: `งานเลยกำหนด ${summaries.planning.overdueTasks.length} รายการ`,
      detail: itemTitle(summaries.planning.overdueTasks[0], "ตรวจแผนงานที่เลยกำหนด"),
      href: `/dashboard/sites/${projectId}/schedule`,
      icon: AlertTriangle,
      tone: "red",
    });
  }

  if (summaries.defects.openItems > 0) {
    actions.push({
      title: `Defect รอแก้ ${summaries.defects.openItems} รายการ`,
      detail: summaries.defects.latestRound || "ติดตามรูปหลังแก้และสถานะปิดงาน",
      href: `/dashboard/sites/${projectId}/defects`,
      icon: Bug,
      tone: "orange",
    });
  }

  if (summaries.memos.waitingAckCount > 0) {
    actions.push({
      title: `Memo รอลูกค้ารับทราบ ${summaries.memos.waitingAckCount} รายการ`,
      detail: summaries.memos.latestTitle || `ขอเพิ่มเวลารวม ${summaries.memos.extensionDays} วัน`,
      href: `/dashboard/sites/${projectId}/memos`,
      icon: FileSignature,
      tone: "orange",
    });
  }

  if (summaries.notes.followUpDue > 0 || summaries.notes.urgentCount > 0) {
    actions.push({
      title: `บันทึกที่ต้องติดตาม ${Math.max(summaries.notes.followUpDue, summaries.notes.urgentCount)} รายการ`,
      detail: summaries.notes.latestTitle || "เปิดบันทึกหน้างานเพื่อตรวจเรื่องค้าง",
      href: `/dashboard/sites/${projectId}/notes`,
      icon: StickyNote,
      tone: "orange",
    });
  }

  if (summaries.commercial.openVoCount > 0) {
    actions.push({
      title: `VO เปิดอยู่ ${summaries.commercial.openVoCount} ใบ`,
      detail: `มูลค่ารวม ${formatMoney(summaries.commercial.voAmount)} บาท`,
      href: `/dashboard/sites/${projectId}/variation-orders`,
      icon: ReceiptText,
      tone: "blue",
    });
  }

  if (!summaries.reports.latestDailyDate) {
    actions.push({
      title: "ยังไม่มีรายงานประจำวัน",
      detail: "เริ่มบันทึกรายงานหน้างานเพื่อให้ timeline มีหลักฐานครบ",
      href: `/dashboard/sites/${projectId}/reports`,
      icon: FileText,
      tone: "green",
    });
  }

  if (actions.length === 0) {
    actions.push({
      title: "ไม่มีรายการเร่งด่วน",
      detail: "ข้อมูลหลักยังอยู่ในสถานะเรียบร้อย ใช้หน้านี้เป็นจุดตรวจภาพรวมประจำวัน",
      href: `/dashboard/sites/${projectId}/schedule`,
      icon: CheckCircle2,
      tone: "green",
    });
  }

  return actions.slice(0, 6);
}

export function buildLifecycleAlerts(projectId: string, lifecycle?: SiteRecord, warranty?: SiteRecord): DashboardAction[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targets = [
    ...getLifecycleReminderTargets(projectId, lifecycle as LifecycleSheetRecord | undefined),
    ...getWarrantyReminderTargets(projectId, warranty as LifecycleSheetRecord | undefined),
  ];

  const alerts: Array<DashboardAction & { sortKey: number }> = [];

  targets.forEach((target) => {
    const state = getAlertState(today, target);
    if (!state) return;

    const detail =
      state.days < 0
        ? `เลยกำหนด ${Math.abs(state.days)} วัน · ${formatDate(target.dueDate)}`
        : state.days === 0
          ? `ครบกำหนดวันนี้ · ${formatDate(target.dueDate)}`
          : `เหลือ ${state.days} วัน · ${formatDate(target.dueDate)}`;
    const tone: DashboardAction["tone"] = state.kind === "overdue" ? "red" : "orange";

    alerts.push({
      title: target.title,
      detail,
      href: target.link,
      icon: AlertTriangle,
      tone,
      sortKey: state.days < 0 ? state.days : state.days + 1000,
    });
  });

  return alerts
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((alert) => ({
      title: alert.title,
      detail: alert.detail,
      href: alert.href,
      icon: alert.icon,
      tone: alert.tone,
    }));
}

export function buildRecent(
  projectId: string,
  rows: {
    latestNote?: SiteRecord;
    latestMemo?: SiteRecord;
    latestDocument?: SiteRecord;
    latestDailyReport?: SiteRecord;
    latestRound?: SiteRecord;
    latestVo?: SiteRecord;
  },
) {
  const items: RecentItem[] = [
    rows.latestNote && {
      title: itemTitle(rows.latestNote, "บันทึกหน้างาน"),
      detail: "บันทึกหน้างาน",
      date: stringValue(rows.latestNote.updated_at || rows.latestNote.created_at),
      href: `/dashboard/sites/${projectId}/notes`,
      icon: NotebookTabs,
    },
    rows.latestDailyReport && {
      title: itemTitle(rows.latestDailyReport, "รายงานประจำวัน"),
      detail: "รายงานประจำวัน",
      date: stringValue(rows.latestDailyReport.date || rows.latestDailyReport.updated_at),
      href: `/dashboard/sites/${projectId}/reports`,
      icon: ClipboardList,
    },
    rows.latestMemo && {
      title: itemTitle(rows.latestMemo, "Memo"),
      detail: `Memo ${statusLabel(rows.latestMemo.status)}`,
      date: stringValue(rows.latestMemo.updated_at || rows.latestMemo.issued_at || rows.latestMemo.created_at),
      href: `/dashboard/sites/${projectId}/memos`,
      icon: FileSignature,
    },
    rows.latestDocument && {
      title: itemTitle(rows.latestDocument, "ไฟล์ล่าสุด"),
      detail: stringValue(rows.latestDocument.category) || "ไฟล์ไซต์",
      date: stringValue(rows.latestDocument.updated_at || rows.latestDocument.created_at),
      href: `/dashboard/sites/${projectId}/files`,
      icon: FolderOpen,
    },
    rows.latestRound && {
      title: itemTitle(rows.latestRound, "รอบตรวจ Defect"),
      detail: "Defect",
      date: stringValue(rows.latestRound.inspection_date || rows.latestRound.updated_at),
      href: `/dashboard/sites/${projectId}/defects`,
      icon: Bug,
    },
    rows.latestVo && {
      title: itemTitle(rows.latestVo, "Variation Order"),
      detail: `VO ${statusLabel(rows.latestVo.status)}`,
      date: stringValue(rows.latestVo.updated_at || rows.latestVo.created_at),
      href: `/dashboard/sites/${projectId}/variation-orders`,
      icon: ReceiptText,
    },
  ].filter(Boolean) as RecentItem[];

  return items.sort((a, b) => dateKey(b.date) - dateKey(a.date)).slice(0, 6);
}

