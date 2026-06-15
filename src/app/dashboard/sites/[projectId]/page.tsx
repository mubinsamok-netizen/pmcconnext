import Link from "next/link";
import { getServerSession } from "next-auth";
import type { ComponentType, ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bug,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  FileSignature,
  FileText,
  Flag,
  FolderOpen,
  Image as ImageIcon,
  LayoutDashboard,
  ListChecks,
  NotebookTabs,
  ReceiptText,
  Sheet,
  Sparkles,
  StickyNote,
  TrendingUp,
} from "lucide-react";
import SiteWeatherCard from "@/components/SiteWeatherCard";
import SiteCalendarPanel, { type SiteCalendarEvent } from "./SiteCalendarPanel";
import { authOptions } from "@/lib/authOptions";
import type { MasterProject } from "@/lib/masterProjects";
import { getMasterProject } from "@/lib/masterProjects";
import { findAllBatch, findAllRaw } from "@/lib/sheetsCrud";
import { ensureSchema } from "@/lib/sheetsSetup";
import { isSupabaseBackend, shouldFallbackToSheets } from "@/lib/supabaseRest";
import { isForemanRole } from "@/lib/siteAccess";
import { getProjectContext } from "@/lib/siteContext";
import { getSiteWeather } from "@/lib/siteWeather";
import {
  getAlertState,
  getLifecycleReminderTargets,
  getWarrantyReminderTargets,
  type SheetRecord as LifecycleSheetRecord,
} from "@/lib/projectLifecycle";

export const dynamic = "force-dynamic";

type SiteValue = string | number | boolean | null | undefined;
type SiteRecord = Record<string, SiteValue>;
type IconType = ComponentType<{ size?: number; className?: string }>;

type PlanningSummary = {
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

type CommercialSummary = {
  voCount: number;
  openVoCount: number;
  voAmount: number;
};

type DefectSummary = {
  roundCount: number;
  openItems: number;
  fixedItems: number;
  passedItems: number;
  acknowledgedRounds: number;
  latestRound: string;
};

type NotesSummary = {
  activeCount: number;
  pinnedCount: number;
  urgentCount: number;
  followUpDue: number;
  latestTitle: string;
};

type MemoSummary = {
  totalCount: number;
  waitingAckCount: number;
  acknowledgedCount: number;
  timeImpactCount: number;
  extensionDays: number;
  approvedExtensionDays: number;
  latestTitle: string;
};

type FilesSummary = {
  totalCount: number;
  imageCount: number;
  documentCount: number;
  latestTitle: string;
};

type ReportsSummary = {
  dailyCount: number;
  weeklyCount: number;
  monthlyCount: number;
  latestDailyDate: string;
  latestDailyTitle: string;
};

type DashboardAction = {
  title: string;
  detail: string;
  href: string;
  icon: IconType;
  tone: "red" | "orange" | "green" | "blue";
};

type RecentItem = {
  title: string;
  detail: string;
  date: string;
  href: string;
  icon: IconType;
};

type DashboardData = {
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

function stringValue(value?: SiteValue) {
  return String(value ?? "").trim();
}

function parseDate(value?: SiteValue) {
  const raw = stringValue(value);
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value?: SiteValue) {
  const date = parseDate(value);
  if (!date) return stringValue(value);
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function dateKey(value?: SiteValue) {
  return parseDate(value)?.getTime() ?? 0;
}

function numberValue(value?: SiteValue) {
  const parsed = Number(stringValue(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampPercent(value?: SiteValue) {
  return Math.max(0, Math.min(100, numberValue(value)));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: 0,
  }).format(value);
}

function toDateInputValue(value?: SiteValue) {
  const date = parseDate(value);
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function buildDriveFolderUrl(folderId?: SiteValue) {
  const value = stringValue(folderId);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://drive.google.com/drive/folders/${encodeURIComponent(value)}`;
}

function isHighPriority(value?: SiteValue) {
  const status = stringValue(value).toLowerCase();
  return ["high", "urgent", "critical", "สูง", "ด่วน", "เร่งด่วน"].includes(status);
}

function isTruthyText(value?: SiteValue) {
  return ["true", "1", "yes", "y", "ใช่"].includes(stringValue(value).toLowerCase());
}

function isClosedStatus(status?: SiteValue) {
  const normalized = stringValue(status).toLowerCase();
  return ["closed", "done", "resolved", "cancelled", "completed", "paid", "approved", "ผ่าน", "ปิดงาน", "เสร็จ", "ยกเลิก"].includes(normalized);
}

function isTaskDone(task: SiteRecord) {
  return isClosedStatus(task.status) || numberValue(task.percent_done) >= 100;
}

function isProjectRow(projectId: string) {
  return (row: SiteRecord) => stringValue(row.project_id) === projectId;
}

function mergeRowsById(primary: SiteRecord[], fallback: SiteRecord[], idField: string) {
  const merged = new Map<string, SiteRecord>();

  fallback.forEach((row, index) => {
    const key = stringValue(row[idField] || row._rowIndex || `fallback-${index}`);
    merged.set(key, row);
  });

  primary.forEach((row, index) => {
    const key = stringValue(row[idField] || row._rowIndex || `primary-${index}`);
    merged.set(key, row);
  });

  return Array.from(merged.values());
}

function daysUntil(value?: SiteValue) {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function daysSince(value?: SiteValue) {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - date.getTime()) / 86_400_000));
}

function getDailyReportWarning(project: MasterProject, reports: ReportsSummary) {
  if (isClosedStatus(project.status)) return "";

  const latestDate = reports.latestDailyDate;
  const missingDays = daysSince(latestDate || project.start_date);
  if (missingDays === null || missingDays <= DAILY_REPORT_STALE_DAYS) return "";

  if (latestDate) {
    return `ไม่ได้รายงานประจำวันมา ${missingDays} วัน (ล่าสุด ${formatDate(latestDate)})`;
  }

  return `ยังไม่มีรายงานประจำวันมา ${missingDays} วัน`;
}

function statusLabel(value?: SiteValue) {
  const status = stringValue(value);
  return status || "In Progress";
}

function itemTitle(row: SiteRecord, fallback: string) {
  return stringValue(row.title || row.name || row.description || row.summary || row.document_no || row.doc_no || row.ref_no || row.file_name) || fallback;
}

function calendarTone(status?: SiteValue, date?: SiteValue): SiteCalendarEvent["tone"] {
  const remaining = daysUntil(date);
  if (remaining !== null && remaining < 0 && !isClosedStatus(status)) return "red";
  if (isClosedStatus(status)) return "green";
  if (isHighPriority(status)) return "orange";
  const normalized = stringValue(status).toLowerCase();
  if (["pending", "pending_approval", "รอลูกค้า", "ต้องยืนยัน", "ส่งแจ้งเตือนแล้ว", "waiting_ack"].includes(normalized)) return "orange";
  return "blue";
}

function calendarEvent({
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

function calendarDateRange(start?: SiteValue, end?: SiteValue) {
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

function compactCalendarEvents(events: Array<SiteCalendarEvent | null>) {
  return events
    .filter((event): event is SiteCalendarEvent => Boolean(event))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "th"))
    .slice(0, 2500);
}

function buildCalendarEvents(project: MasterProject, rows: {
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

function isForemanVisibleHref(href: string) {
  return !["/defects", "/variation-orders", "/rfa", "/rfi", "/lifecycle"].some((segment) => href.includes(segment));
}

async function getDashboardData(project: MasterProject): Promise<DashboardData> {
  try {
    const { sheetId } = await getProjectContext(project.project_id);
    if (!isSupabaseBackend()) await ensureSchema(sheetId);

    const rows = await findAllBatch([
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

    const tasksFromBatch = rows.Tasks || [];
    const tasks = isSupabaseBackend() && shouldFallbackToSheets()
      ? mergeRowsById(tasksFromBatch, await findAllRaw("Tasks", sheetId) as SiteRecord[], "task_id")
      : tasksFromBatch;
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
    const calendarEvents = buildCalendarEvents(project, {
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
    });

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

function buildActions(
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

function buildLifecycleAlerts(projectId: string, lifecycle?: SiteRecord, warranty?: SiteRecord): DashboardAction[] {
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

function buildRecent(
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

export default async function SiteDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getMasterProject(projectId);
  const [dashboard, weather, session] = await Promise.all([
    getDashboardData(project),
    getSiteWeather(project),
    getServerSession(authOptions),
  ]);
  const isForeman = isForemanRole(session?.user?.role);
  const remainingDays = daysUntil(project.end_date);
  const progressPercent = dashboard.planning.averageProgress;
  const visibleActions = isForeman ? dashboard.actions.filter((action) => isForemanVisibleHref(action.href)) : dashboard.actions;
  const visibleRecent = isForeman ? dashboard.recent.filter((item) => isForemanVisibleHref(item.href)) : dashboard.recent;
  const visibleCalendarEvents = isForeman ? dashboard.calendarEvents.filter((event) => isForemanVisibleHref(event.href)) : dashboard.calendarEvents;
  const dailyReportWarning = getDailyReportWarning(project, dashboard.reports);
  const driveFolderUrl = buildDriveFolderUrl(project.drive_folder_id);
  const actionItems =
    visibleActions.length > 0
      ? visibleActions
      : [
          {
            title: "ไม่มีรายการเร่งด่วน",
            detail: "ตรวจแผนงาน รายงาน และบันทึกหน้างานได้จากทางลัดด้านล่าง",
            href: `/dashboard/sites/${project.project_id}/schedule`,
            icon: CheckCircle2,
            tone: "green" as const,
          },
        ];

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4">
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 p-4 lg:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-extrabold text-orange-700">
                <LayoutDashboard size={14} />
                ภาพรวมโครงการ
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">{project.project_id}</span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{statusLabel(project.status)}</span>
            </div>
            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-3xl font-extrabold tracking-tight text-gray-950">{project.name}</h2>
                <p className="mt-1 text-sm font-semibold text-gray-500">{project.client || "ไม่ระบุลูกค้า"}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 lg:min-w-[410px]">
                <InfoCard label="เริ่ม" value={formatDate(project.start_date) || "-"} />
                <InfoCard label="สิ้นสุด" value={formatDate(project.end_date) || "-"} />
                <InfoCard
                  label="คงเหลือ"
                  value={remainingDays === null ? "-" : remainingDays >= 0 ? `${remainingDays} วัน` : `เลย ${Math.abs(remainingDays)} วัน`}
                  tone={remainingDays !== null && remainingDays < 0 ? "red" : "gray"}
                />
              </div>
            </div>
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs font-bold text-gray-500">
                <span>ความคืบหน้าจากแผนงาน</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-orange-600" style={{ width: `${Math.min(progressPercent, 100)}%` }} />
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 bg-gray-50 p-4 xl:border-l xl:border-t-0">
            <SiteWeatherCard weather={weather} />
          </div>
        </div>
      </section>

      {dashboard.error && (
        <p className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          {dashboard.error}
        </p>
      )}

      {dailyReportWarning && (
        <Link
          href={`/dashboard/sites/${project.project_id}/reports`}
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{dailyReportWarning}</span>
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiCard
          icon={CalendarDays}
          label="แจ้งเตือนเอกสาร"
          value={String(dashboard.lifecycleAlerts.length)}
          detail="ใกล้ครบกำหนดจาก Lifecycle"
          tone={dashboard.lifecycleAlerts.some((alert) => alert.tone === "red") ? "red" : dashboard.lifecycleAlerts.length ? "orange" : "green"}
          href={`/dashboard/sites/${project.project_id}/lifecycle`}
        />
        <KpiCard icon={ListChecks} label="แผนงานครบถ้วน" value={`${dashboard.planning.planCoverage}%`} detail={`${dashboard.planning.plannedTaskCount}/${dashboard.planning.workTaskCount} งาน`} />
        <KpiCard icon={Clock3} label="งานที่ต้องจับตา" value={String(dashboard.planning.overdueTasks.length + dashboard.planning.dueSoonTasks.length)} detail="เลยกำหนด / ครบใน 7 วัน" tone={dashboard.planning.overdueTasks.length ? "red" : "orange"} />
        <KpiCard icon={FileSignature} label="Memo รอรับทราบ" value={String(dashboard.memos.waitingAckCount)} detail={`${dashboard.memos.extensionDays} วันเพิ่มที่ขอ`} tone={dashboard.memos.waitingAckCount ? "orange" : "green"} />
        {isForeman ? (
          <KpiCard icon={NotebookTabs} label="บันทึกที่ต้องติดตาม" value={String(dashboard.notes.followUpDue)} detail={`${dashboard.notes.activeCount} notes ในไซต์`} tone={dashboard.notes.followUpDue ? "orange" : "green"} />
        ) : (
          <KpiCard icon={Bug} label="Defect เปิดอยู่" value={String(dashboard.defects.openItems)} detail={`${dashboard.defects.fixedItems} แก้แล้ว, ${dashboard.defects.passedItems} ปิดแล้ว`} tone={dashboard.defects.openItems ? "red" : "green"} />
        )}
        <KpiCard icon={FileText} label="รายงานล่าสุด" value={dashboard.reports.latestDailyDate ? formatDate(dashboard.reports.latestDailyDate) : "-"} detail={`${dashboard.reports.dailyCount} daily reports`} tone="blue" />
      </section>

      <SiteCalendarPanel events={visibleCalendarEvents} projectId={project.project_id} initialDate={toDateInputValue(new Date().toISOString())} />

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel title="สิ่งที่ควรทำตอนนี้" icon={Sparkles} href={`/dashboard/sites/${project.project_id}/schedule`} actionLabel="เปิดแผนงาน">
          <div className="space-y-3">
            {actionItems.map((action) => (
              <ActionRow key={`${action.title}-${action.href}`} action={action} />
            ))}
          </div>
        </Panel>

        <Panel title="กิจกรรมล่าสุด" icon={TrendingUp} href={`/dashboard/sites/${project.project_id}/notes`} actionLabel="เปิดบันทึก">
          {visibleRecent.length > 0 ? (
            <div className="space-y-3">
              {visibleRecent.map((item) => (
                <RecentRow key={`${item.title}-${item.href}`} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState text="ยังไม่มี activity ล่าสุดจากรายงาน บันทึก ไฟล์ หรือเอกสารของไซต์นี้" />
          )}
        </Panel>
      </div>

      <div className={`grid gap-4 ${isForeman ? "xl:grid-cols-2" : "xl:grid-cols-3"}`}>
        <Panel title="แผนงานและ Milestone" icon={BarChart3} href={`/dashboard/sites/${project.project_id}/schedule?tab=gantt`} actionLabel="Gantt">
          <div className="grid grid-cols-2 gap-3">
            <SmallMetric label="งานทั้งหมด" value={String(dashboard.planning.workTaskCount)} />
            <SmallMetric label="เสร็จแล้ว" value={String(dashboard.planning.completedTaskCount)} />
            <SmallMetric label="Milestone" value={String(dashboard.planning.milestoneCount)} />
            <SmallMetric label="Priority สูง" value={String(dashboard.planning.highPriorityItems)} tone={dashboard.planning.highPriorityItems ? "red" : "green"} />
          </div>
          <InfoStrip
            icon={CalendarDays}
            label="ช่วงแผนงาน"
            value={dashboard.planning.planStart && dashboard.planning.planEnd ? `${formatDate(dashboard.planning.planStart)} - ${formatDate(dashboard.planning.planEnd)}` : "ยังไม่ได้กรอกช่วงแผนงาน"}
          />
          <InfoStrip icon={Flag} label="Milestone ถัดไป" value={dashboard.planning.nextMilestone || "ยังไม่มี Milestone ถัดไป"} />
        </Panel>

        {!isForeman && (
          <Panel title="คุณภาพงานและส่งมอบ" icon={Bug} href={`/dashboard/sites/${project.project_id}/defects`} actionLabel="Defect">
            <div className="grid grid-cols-2 gap-3">
              <SmallMetric label="รอบตรวจ" value={String(dashboard.defects.roundCount)} />
              <SmallMetric label="ลูกค้ารับทราบ" value={`${dashboard.defects.acknowledgedRounds}/${dashboard.defects.roundCount}`} tone="green" />
              <SmallMetric label="รอแก้" value={String(dashboard.defects.openItems)} tone={dashboard.defects.openItems ? "red" : "green"} />
              <SmallMetric label="แก้/ปิดแล้ว" value={String(dashboard.defects.fixedItems + dashboard.defects.passedItems)} />
            </div>
            <InfoStrip icon={CheckCircle2} label="รอบล่าสุด" value={dashboard.defects.latestRound || "ยังไม่มีรอบตรวจส่งมอบ"} />
          </Panel>
        )}

        {!isForeman && (
          <Panel title="การเงินและเอกสารอนุมัติ" icon={ReceiptText} href={`/dashboard/sites/${project.project_id}/variation-orders`} actionLabel="VO">
            <div className="grid grid-cols-2 gap-3">
              <SmallMetric label="VO ทั้งหมด" value={String(dashboard.commercial.voCount)} />
              <SmallMetric label="VO เปิดอยู่" value={String(dashboard.commercial.openVoCount)} tone={dashboard.commercial.openVoCount ? "orange" : "green"} />
              <SmallMetric label="มูลค่า VO" value={formatMoney(dashboard.commercial.voAmount)} suffix="บาท" />
            </div>
          </Panel>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="บันทึกข้อความ / Memo" icon={FileSignature} href={`/dashboard/sites/${project.project_id}/memos`} actionLabel="เปิด Memo">
          <div className="grid grid-cols-2 gap-3">
            <SmallMetric label="Memo ทั้งหมด" value={String(dashboard.memos.totalCount)} />
            <SmallMetric label="รอรับทราบ" value={String(dashboard.memos.waitingAckCount)} tone={dashboard.memos.waitingAckCount ? "orange" : "green"} />
            <SmallMetric label="รับทราบแล้ว" value={String(dashboard.memos.acknowledgedCount)} tone="green" />
            <SmallMetric label="มีผลต่อเวลา" value={String(dashboard.memos.timeImpactCount)} tone={dashboard.memos.timeImpactCount ? "orange" : "green"} />
          </div>
          <InfoStrip icon={CalendarDays} label="วันที่ขอเพิ่ม" value={`${dashboard.memos.extensionDays} วัน / อนุมัติแล้ว ${dashboard.memos.approvedExtensionDays} วัน`} />
          <InfoStrip icon={FileSignature} label="Memo ล่าสุด" value={dashboard.memos.latestTitle || "ยังไม่มีบันทึกข้อความ"} />
        </Panel>

        <Panel title="บันทึกหน้างาน" icon={NotebookTabs} href={`/dashboard/sites/${project.project_id}/notes`} actionLabel="เปิด Notes">
          <div className="grid grid-cols-2 gap-3">
            <SmallMetric label="บันทึกใช้งาน" value={String(dashboard.notes.activeCount)} />
            <SmallMetric label="ปักหมุด" value={String(dashboard.notes.pinnedCount)} />
            <SmallMetric label="ด่วน" value={String(dashboard.notes.urgentCount)} tone={dashboard.notes.urgentCount ? "red" : "green"} />
            <SmallMetric label="ต้องติดตาม" value={String(dashboard.notes.followUpDue)} tone={dashboard.notes.followUpDue ? "orange" : "green"} />
          </div>
          <InfoStrip icon={StickyNote} label="ล่าสุด" value={dashboard.notes.latestTitle || "ยังไม่มีบันทึกหน้างาน"} />
        </Panel>

        <Panel title="ไฟล์และรายงาน" icon={FolderOpen} href={`/dashboard/sites/${project.project_id}/files`} actionLabel="เปิดไฟล์">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SmallMetric label="ไฟล์ทั้งหมด" value={String(dashboard.files.totalCount)} />
            <SmallMetric label="รูปภาพ" value={String(dashboard.files.imageCount)} />
            <SmallMetric label="เอกสาร" value={String(dashboard.files.documentCount)} />
            <SmallMetric label="รายงานรวม" value={String(dashboard.reports.dailyCount + dashboard.reports.weeklyCount + dashboard.reports.monthlyCount)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <InfoStrip icon={ImageIcon} label="ไฟล์ล่าสุด" value={dashboard.files.latestTitle || "ยังไม่มีไฟล์ในไซต์"} />
            <InfoStrip icon={ClipboardList} label="Daily report ล่าสุด" value={dashboard.reports.latestDailyTitle || "ยังไม่มีรายงานประจำวัน"} />
          </div>
        </Panel>
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-gray-950">ทางลัดและแหล่งข้อมูลไซต์</h3>
            <p className="text-sm font-semibold text-gray-500">เก็บลิงก์ที่ใช้บ่อยไว้ท้ายหน้า ไม่ให้รบกวน dashboard หลัก</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <QuickLink href={`/dashboard/sites/${project.project_id}/reports`} label="รายงาน" icon={ClipboardList} />
            <QuickLink href={`/dashboard/sites/${project.project_id}/files`} label="ไฟล์" icon={FolderOpen} />
            <QuickLink href={`/dashboard/sites/${project.project_id}/notes`} label="บันทึก" icon={NotebookTabs} />
            <QuickLink href={`/dashboard/sites/${project.project_id}/memos`} label="Memo" icon={FileSignature} />
            {driveFolderUrl ? <ExternalQuickLink href={driveFolderUrl} label="อัปโหลดไฟล์ใหญ่ใน Drive" icon={FolderOpen} /> : null}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ResourceRow icon={Sheet} label="Site Google Sheet" value={project.site_sheet_id || "ยังไม่ได้กำหนด"} />
          <ResourceRow
            icon={FolderOpen}
            label="Site Drive Folder"
            value={project.drive_folder_id || "ยังไม่ได้กำหนด"}
            actionHref={driveFolderUrl}
            actionLabel="เปิดโฟลเดอร์เพื่ออัปโหลด"
          />
        </div>
      </section>
    </div>
  );
}

function InfoCard({
  label,
  value,
  tone = "gray",
}: {
  label: string;
  value: string;
  tone?: "gray" | "red";
}) {
  const toneClass = tone === "red" ? "border-red-100 bg-red-50 text-red-700" : "border-gray-100 bg-gray-50 text-gray-950";
  return (
    <div className={`min-w-0 rounded-2xl border p-2.5 ${toneClass}`}>
      <p className="truncate text-[11px] font-extrabold uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-1 truncate text-sm font-extrabold sm:text-base">{value}</p>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "gray",
  href,
}: {
  icon: IconType;
  label: string;
  value: string;
  detail: string;
  tone?: "gray" | "orange" | "green" | "red" | "blue";
  href?: string;
}) {
  const toneClass = {
    gray: "bg-white text-gray-950 border-gray-200",
    orange: "bg-orange-50 text-orange-800 border-orange-100",
    green: "bg-emerald-50 text-emerald-800 border-emerald-100",
    red: "bg-red-50 text-red-800 border-red-100",
    blue: "bg-blue-50 text-blue-800 border-blue-100",
  }[tone];
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-extrabold text-current opacity-65">{label}</p>
        <Icon size={18} className="shrink-0 opacity-70" />
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-1 truncate text-xs font-semibold opacity-65">{detail}</p>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`block rounded-2xl border p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${toneClass}`}>
        {content}
      </Link>
    );
  }

  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${toneClass}`}>
      {content}
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  href,
  actionLabel,
  children,
}: {
  title: string;
  icon: IconType;
  href: string;
  actionLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
            <Icon size={18} />
          </span>
          <h3 className="text-lg font-extrabold text-gray-950">{title}</h3>
        </div>
        <Link href={href} className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-xs font-extrabold text-gray-700 hover:bg-gray-50">
          {actionLabel}
        </Link>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ActionRow({ action }: { action: DashboardAction }) {
  const toneClass = {
    red: "bg-red-50 text-red-700 border-red-100",
    orange: "bg-orange-50 text-orange-700 border-orange-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
  }[action.tone];
  const Icon = action.icon;

  return (
    <Link href={action.href} className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 transition hover:border-orange-200 hover:bg-orange-50/40">
      <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${toneClass}`}>
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <span className="block font-extrabold text-gray-950">{action.title}</span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-gray-500">{action.detail}</span>
      </span>
    </Link>
  );
}

function RecentRow({ item }: { item: RecentItem }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 transition hover:border-orange-200 hover:bg-orange-50/40">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-orange-700 shadow-sm">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-extrabold text-gray-950">{item.title}</span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-gray-500">{item.detail}</span>
      </span>
      <span className="hidden shrink-0 text-xs font-bold text-gray-400 sm:block">{formatDate(item.date) || "-"}</span>
    </Link>
  );
}

function SmallMetric({
  label,
  value,
  suffix,
  tone = "gray",
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "gray" | "orange" | "green" | "red";
}) {
  const toneClass = {
    gray: "bg-gray-50 text-gray-950 border-gray-100",
    orange: "bg-orange-50 text-orange-800 border-orange-100",
    green: "bg-emerald-50 text-emerald-800 border-emerald-100",
    red: "bg-red-50 text-red-800 border-red-100",
  }[tone];
  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <p className="truncate text-xs font-extrabold opacity-65">{label}</p>
      <p className="mt-1 truncate text-xl font-extrabold tracking-tight">
        {value}
        {suffix && <span className="ml-1 text-xs font-bold opacity-60">{suffix}</span>}
      </p>
    </div>
  );
}

function InfoStrip({
  icon: Icon,
  label,
  value,
}: {
  icon: IconType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-gray-50 p-3">
      <Icon size={18} className="mt-0.5 shrink-0 text-orange-600" />
      <div className="min-w-0">
        <p className="text-xs font-extrabold text-gray-500">{label}</p>
        <p className="mt-0.5 truncate text-sm font-bold text-gray-950">{value}</p>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5 text-center text-sm font-semibold text-gray-500">
      {text}
    </div>
  );
}

function QuickLink({ href, label, icon: Icon }: { href: string; label: string; icon: IconType }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
      <Icon size={16} />
      {label}
    </Link>
  );
}

function ExternalQuickLink({ href, label, icon: Icon }: { href: string; label: string; icon: IconType }) {
  return (
    <a href={href} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800">
      <Icon size={16} />
      {label}
      <ExternalLink size={14} />
    </a>
  );
}

function ResourceRow({
  icon: Icon,
  label,
  value,
  actionHref,
  actionLabel,
}: {
  icon: IconType;
  label: string;
  value: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-gray-50 p-3">
      <Icon size={18} className="mt-0.5 shrink-0 text-orange-600" />
      <div className="min-w-0 flex-1">
        <p className="font-extrabold text-gray-900">{label}</p>
        <p className="truncate text-sm font-semibold text-gray-500">{value}</p>
        {actionHref ? (
          <a href={actionHref} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-extrabold text-gray-700 hover:bg-gray-50">
            {actionLabel || "เปิดลิงก์"}
            <ExternalLink size={13} />
          </a>
        ) : null}
      </div>
    </div>
  );
}
