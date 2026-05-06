import Link from "next/link";
import { getServerSession } from "next-auth";
import type { ComponentType, ReactNode } from "react";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Bug,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
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
  WalletCards,
} from "lucide-react";
import SiteWeatherCard from "@/components/SiteWeatherCard";
import { authOptions } from "@/lib/authOptions";
import type { MasterProject } from "@/lib/masterProjects";
import { getMasterProject } from "@/lib/masterProjects";
import { findAll } from "@/lib/sheetsCrud";
import { ensureSchema } from "@/lib/sheetsSetup";
import { isForemanRole } from "@/lib/siteAccess";
import { getProjectContext } from "@/lib/siteContext";
import { getSiteWeather } from "@/lib/siteWeather";

export const dynamic = "force-dynamic";

type SiteValue = string | number | boolean | null | undefined;
type SiteRecord = Record<string, SiteValue>;
type IconType = ComponentType<{ size?: number; className?: string }>;

type PlanningSummary = {
  workTaskCount: number;
  plannedTaskCount: number;
  completedTaskCount: number;
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
  pendingPaymentCount: number;
  draftPaymentCount: number;
  paymentAmount: number;
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
  actions: DashboardAction[];
  recent: RecentItem[];
  error: string;
};

const emptyPlanning: PlanningSummary = {
  workTaskCount: 0,
  plannedTaskCount: 0,
  completedTaskCount: 0,
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
    pendingPaymentCount: 0,
    draftPaymentCount: 0,
    paymentAmount: 0,
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
  actions: [],
  recent: [],
  error: "",
};

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

function formatMoney(value: number) {
  return new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: 0,
  }).format(value);
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

function daysUntil(value?: SiteValue) {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function statusLabel(value?: SiteValue) {
  const status = stringValue(value);
  return status || "In Progress";
}

function itemTitle(row: SiteRecord, fallback: string) {
  return stringValue(row.title || row.name || row.description || row.document_no || row.doc_no || row.file_name) || fallback;
}

function isForemanVisibleHref(href: string) {
  return !["/defects", "/variation-orders", "/payments", "/rfa", "/rfi", "/lifecycle"].some((segment) => href.includes(segment));
}

async function getDashboardData(project: MasterProject): Promise<DashboardData> {
  try {
    const { sheetId } = await getProjectContext(project.project_id);
    await ensureSchema(sheetId);

    const [
      tasks,
      milestones,
      issues,
      dailyReports,
      weeklyReports,
      monthlyReports,
      defectRounds,
      defectItems,
      documents,
      variationOrders,
      paymentClaims,
      siteNotes,
      siteMemos,
    ] = await Promise.all([
      findAll("Tasks", sheetId) as Promise<SiteRecord[]>,
      findAll("Milestones", sheetId) as Promise<SiteRecord[]>,
      findAll("Issues", sheetId) as Promise<SiteRecord[]>,
      findAll("Daily_Reports", sheetId) as Promise<SiteRecord[]>,
      findAll("Weekly_Reports", sheetId) as Promise<SiteRecord[]>,
      findAll("Monthly_Reports", sheetId) as Promise<SiteRecord[]>,
      findAll("Defect_Rounds", sheetId) as Promise<SiteRecord[]>,
      findAll("Defect_Items", sheetId) as Promise<SiteRecord[]>,
      findAll("Project_Documents", sheetId) as Promise<SiteRecord[]>,
      findAll("Variation_Orders", sheetId) as Promise<SiteRecord[]>,
      findAll("Payment_Claims", sheetId) as Promise<SiteRecord[]>,
      findAll("Site_Notes", sheetId) as Promise<SiteRecord[]>,
      findAll("Site_Memos", sheetId) as Promise<SiteRecord[]>,
    ]);

    const belongsToProject = isProjectRow(project.project_id);
    const projectTasks = tasks.filter((task) => belongsToProject(task) && stringValue(task.task_type) !== "heading");
    const projectMilestones = milestones.filter(belongsToProject);
    const projectIssues = issues.filter(belongsToProject);
    const projectDailyReports = dailyReports.filter(belongsToProject);
    const projectWeeklyReports = weeklyReports.filter(belongsToProject);
    const projectMonthlyReports = monthlyReports.filter(belongsToProject);
    const projectDefectRounds = defectRounds.filter(belongsToProject);
    const projectDefectItems = defectItems.filter(belongsToProject);
    const projectDocuments = documents.filter(belongsToProject);
    const projectVariationOrders = variationOrders.filter(belongsToProject);
    const projectPaymentClaims = paymentClaims.filter(belongsToProject);
    const projectNotes = siteNotes.filter((note) => belongsToProject(note) && !isTruthyText(note.archived));
    const projectMemos = siteMemos.filter(belongsToProject);

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
    const activeClaims = projectPaymentClaims.filter((claim) => !["cancelled", "rejected", "ยกเลิก"].includes(stringValue(claim.status).toLowerCase()));
    const pendingPaymentClaims = activeClaims.filter((claim) => !isClosedStatus(claim.status));
    const draftPaymentClaims = activeClaims.filter((claim) => ["draft", "ฉบับร่าง"].includes(stringValue(claim.status).toLowerCase()));

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
      pendingPaymentCount: pendingPaymentClaims.length,
      draftPaymentCount: draftPaymentClaims.length,
      paymentAmount: pendingPaymentClaims.reduce((sum, claim) => sum + numberValue(claim.net_payable || claim.gross_amount), 0),
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

    const actions = buildActions(project.project_id, {
      planning,
      commercial,
      defects,
      notes,
      memos,
      reports,
    });
    const recent = buildRecent(project.project_id, {
      latestNote,
      latestMemo,
      latestDocument,
      latestDailyReport,
      latestRound,
      latestVo: [...projectVariationOrders].sort((a, b) => dateKey(b.updated_at || b.created_at) - dateKey(a.updated_at || a.created_at))[0],
      latestClaim: [...projectPaymentClaims].sort((a, b) => dateKey(b.updated_at || b.created_at) - dateKey(a.updated_at || a.created_at))[0],
    });

    return {
      planning,
      commercial,
      defects,
      notes,
      memos,
      files,
      reports,
      actions,
      recent,
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
  },
) {
  const actions: DashboardAction[] = [];

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

  if (summaries.commercial.draftPaymentCount > 0 || summaries.commercial.pendingPaymentCount > 0) {
    actions.push({
      title: `ใบเบิกเงินรอดำเนินการ ${summaries.commercial.pendingPaymentCount} ใบ`,
      detail: `ยอดรอตรวจ ${formatMoney(summaries.commercial.paymentAmount)} บาท`,
      href: `/dashboard/sites/${projectId}/payments`,
      icon: WalletCards,
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

function buildRecent(
  projectId: string,
  rows: {
    latestNote?: SiteRecord;
    latestMemo?: SiteRecord;
    latestDocument?: SiteRecord;
    latestDailyReport?: SiteRecord;
    latestRound?: SiteRecord;
    latestVo?: SiteRecord;
    latestClaim?: SiteRecord;
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
    rows.latestClaim && {
      title: itemTitle(rows.latestClaim, "ใบเบิกเงิน"),
      detail: `Payment ${statusLabel(rows.latestClaim.status)}`,
      date: stringValue(rows.latestClaim.updated_at || rows.latestClaim.created_at || rows.latestClaim.created_date),
      href: `/dashboard/sites/${projectId}/payments`,
      icon: Banknote,
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
  const progressPercent = dashboard.planning.workTaskCount
    ? Math.round((dashboard.planning.completedTaskCount / dashboard.planning.workTaskCount) * 100)
    : 0;
  const visibleActions = isForeman ? dashboard.actions.filter((action) => isForemanVisibleHref(action.href)) : dashboard.actions;
  const visibleRecent = isForeman ? dashboard.recent.filter((item) => isForemanVisibleHref(item.href)) : dashboard.recent;
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
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 p-5 lg:p-6">
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
              <div className="grid grid-cols-3 gap-2 lg:min-w-[420px]">
                <InfoCard label="เริ่ม" value={formatDate(project.start_date) || "-"} />
                <InfoCard label="สิ้นสุด" value={formatDate(project.end_date) || "-"} />
                <InfoCard
                  label="คงเหลือ"
                  value={remainingDays === null ? "-" : remainingDays >= 0 ? `${remainingDays} วัน` : `เลย ${Math.abs(remainingDays)} วัน`}
                  tone={remainingDays !== null && remainingDays < 0 ? "red" : "gray"}
                />
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs font-bold text-gray-500">
                <span>ความคืบหน้าจากแผนงาน</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-orange-600" style={{ width: `${Math.min(progressPercent, 100)}%` }} />
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 bg-gray-50 p-5 xl:border-l xl:border-t-0">
            <SiteWeatherCard weather={weather} />
          </div>
        </div>
      </section>

      {dashboard.error && (
        <p className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          {dashboard.error}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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
          <Panel title="การเงินและเอกสารอนุมัติ" icon={WalletCards} href={`/dashboard/sites/${project.project_id}/variation-orders`} actionLabel="VO / เบิกเงิน">
            <div className="grid grid-cols-2 gap-3">
              <SmallMetric label="VO ทั้งหมด" value={String(dashboard.commercial.voCount)} />
              <SmallMetric label="VO เปิดอยู่" value={String(dashboard.commercial.openVoCount)} tone={dashboard.commercial.openVoCount ? "orange" : "green"} />
              <SmallMetric label="มูลค่า VO" value={formatMoney(dashboard.commercial.voAmount)} suffix="บาท" />
              <SmallMetric label="ใบเบิกรอปิด" value={String(dashboard.commercial.pendingPaymentCount)} tone={dashboard.commercial.pendingPaymentCount ? "orange" : "green"} />
            </div>
            <InfoStrip icon={Banknote} label="ยอดใบเบิกที่ยังรอดำเนินการ" value={`${formatMoney(dashboard.commercial.paymentAmount)} บาท`} />
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
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ResourceRow icon={Sheet} label="Site Google Sheet" value={project.site_sheet_id || "ยังไม่ได้กำหนด"} />
          <ResourceRow icon={FolderOpen} label="Site Drive Folder" value={project.drive_folder_id || "ยังไม่ได้กำหนด"} />
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
    <div className={`min-w-0 rounded-2xl border p-3 ${toneClass}`}>
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
}: {
  icon: IconType;
  label: string;
  value: string;
  detail: string;
  tone?: "gray" | "orange" | "green" | "red" | "blue";
}) {
  const toneClass = {
    gray: "bg-white text-gray-950 border-gray-200",
    orange: "bg-orange-50 text-orange-800 border-orange-100",
    green: "bg-emerald-50 text-emerald-800 border-emerald-100",
    red: "bg-red-50 text-red-800 border-red-100",
    blue: "bg-blue-50 text-blue-800 border-blue-100",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-extrabold text-current opacity-65">{label}</p>
        <Icon size={18} className="shrink-0 opacity-70" />
      </div>
      <p className="mt-3 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-1 truncate text-xs font-semibold opacity-65">{detail}</p>
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
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
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

function ResourceRow({
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
        <p className="font-extrabold text-gray-900">{label}</p>
        <p className="truncate text-sm font-semibold text-gray-500">{value}</p>
      </div>
    </div>
  );
}
