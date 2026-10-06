import { createHmac, timingSafeEqual } from "node:crypto";
import { getPublicScheduleData } from "@/lib/publicScheduleData";
import { findAllBatch } from "@/lib/sheetsCrud";
import { getProjectContext } from "@/lib/siteContext";
import { DEFECT_ROUND_STATUS_LABELS } from "@/lib/defects";
import { MEMO_STATUS_LABELS, isTrueText } from "@/lib/siteMemos";
import { QC_APPROVAL_LABELS, QC_STATUS_LABELS, getQcApprovalReadiness, parseQcItems } from "@/lib/qcChecklists";
import { VO_STATUS_LABELS, asVoStatus, formatMoney } from "@/lib/variationOrders";

const TOKEN_VERSION = "v1";

type PortalValue = string | number | undefined;
type PortalRow = Record<string, PortalValue>;

type PortalProject = {
  project_id: string;
  name: string;
  client: string;
  status: string;
  start_date: string;
  end_date: string;
};

export type CustomerPortalAction = {
  id: string;
  type: "decision" | "vo" | "qc" | "memo" | "defect";
  title: string;
  detail: string;
  status: string;
  date: string;
  href: string;
};

export type CustomerPortalDocument = {
  id: string;
  type: "decision" | "vo" | "qc" | "memo" | "defect";
  typeLabel: string;
  title: string;
  detail: string;
  status: string;
  statusGroup: "pending" | "approved" | "rejected" | "closed" | "draft";
  date: string;
  approvedAt: string;
  amount: string;
  documentNo: string;
  pdfUrl: string;
  actionUrl: string;
  attachmentUrl: string;
};

export type CustomerPortalData = {
  project: PortalProject;
  metrics: {
    progress: number;
    scheduleHealth: "good" | "watch" | "risk";
    scheduleHealthLabel: string;
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    nextMilestone: string;
    nextMilestoneDate: string;
    openDefects: number;
    pendingActions: number;
  };
  latestUpdate: {
    title: string;
    date: string;
    weather: string;
    workers: string;
    workDone: string;
    issues: string;
    solutions: string;
    pdfUrl: string;
    photoUrl: string;
    photosFolderUrl: string;
  };
  reports: {
    dailyCount: number;
    weeklyCount: number;
    monthlyCount: number;
    latestWeeklyPdfUrl: string;
    latestMonthlyPdfUrl: string;
  };
  summaries: {
    defects: { total: number; open: number; fixed: number; passed: number; latestStatus: string };
    qc: { total: number; pending: number; approved: number; latestStatus: string };
    vo: { total: number; pending: number; approved: number; totalAmount: string };
    memos: { total: number; waitingAck: number; acknowledged: number; latestStatus: string };
  };
  actions: CustomerPortalAction[];
  documents: CustomerPortalDocument[];
  schedule: {
    tasks: Array<{
      task_id: string;
      name: string;
      assignee: string;
      start: string;
      end: string;
      status: string;
      percent_done: string;
      category: string;
      order_index: string;
      task_type: string;
      parent_task_id: string;
    }>;
  };
  timeline: Array<{
    id: string;
    title: string;
    start: string;
    end: string;
    status: string;
    percent: number;
    type: "task" | "milestone";
  }>;
  updated_at: string;
};

function getSigningSecret() {
  const secret = process.env.CUSTOMER_PORTAL_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("CUSTOMER_PORTAL_SECRET or NEXTAUTH_SECRET is not configured");
  return secret;
}

function signatureFor(projectId: string) {
  return createHmac("sha256", getSigningSecret())
    .update(`customer-portal:${TOKEN_VERSION}:${projectId}`)
    .digest("base64url");
}

export function createCustomerPortalToken(projectId: string) {
  return `${TOKEN_VERSION}.${signatureFor(projectId)}`;
}

export function verifyCustomerPortalToken(projectId: string, token: string) {
  const expected = createCustomerPortalToken(projectId);
  const actualBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown) {
  const numeric = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function dateValue(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00+07:00` : raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateTime(value: unknown) {
  return dateValue(value)?.getTime() ?? 0;
}

function activeProjectRows(projectId: string, rows?: PortalRow[]) {
  return (rows || []).filter((row) => text(row.project_id) === projectId && text(row.active).toUpperCase() !== "FALSE");
}

function latestByDate<T extends PortalRow>(rows: T[], fields: string[]) {
  return [...rows].sort((a, b) => Math.max(...fields.map((field) => dateTime(b[field]))) - Math.max(...fields.map((field) => dateTime(a[field]))))[0];
}

function labelFor(labels: Record<string, string>, value: unknown, fallback = "-") {
  const key = text(value);
  return labels[key] || key || fallback;
}

function isClosedStatus(value: unknown) {
  const status = text(value).toLowerCase();
  return ["done", "closed", "approved", "customer_approved", "acknowledged", "paid", "cancelled", "rejected", "ผ่าน", "ปิดงาน", "เสร็จ"].includes(status);
}

function documentStatusGroup(value: unknown, hasAction = false): CustomerPortalDocument["statusGroup"] {
  const status = text(value).toLowerCase();
  if (status.includes("reject") || status.includes("cancel") || status.includes("ยกเลิก") || status.includes("ไม่อนุมัติ")) return "rejected";
  if (
    ["done", "closed", "approved", "customer_approved", "acknowledged", "paid", "billed", "work_unlocked", "passed"].includes(status) ||
    status.includes("ยืนยันแล้ว") ||
    status.includes("อนุมัติ") ||
    status.includes("รับทราบแล้ว") ||
    status.includes("ปิด")
  ) {
    return "approved";
  }
  if (
    hasAction ||
    status.includes("pending") ||
    status.includes("overdue") ||
    status.includes("sent") ||
    status.includes("ready") ||
    status.includes("waiting") ||
    status.includes("รอ") ||
    status.includes("ต้องยืนยัน") ||
    status.includes("ส่งแจ้งเตือน")
  ) {
    return "pending";
  }
  if (status.includes("closed") || status.includes("ปิด")) return "closed";
  return "draft";
}

function firstText(...values: unknown[]) {
  return text(values.find((value) => text(value)));
}

function documentDate(item: PortalRow, fields: string[]) {
  return firstText(...fields.map((field) => item[field]));
}

function documentSortDate(item: CustomerPortalDocument) {
  return Math.max(dateTime(item.approvedAt), dateTime(item.date));
}

function firstUrlFromJson(value: unknown) {
  try {
    const parsed = JSON.parse(text(value) || "[]");
    if (!Array.isArray(parsed)) return "";
    const first = parsed.find((item) => item && typeof item === "object" && (item.file_url || item.url || item.webViewLink));
    return text(first?.file_url || first?.url || first?.webViewLink);
  } catch {
    return "";
  }
}

function folderUrl(folderId: unknown) {
  const value = text(folderId);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://drive.google.com/drive/folders/${encodeURIComponent(value)}`;
}

function scheduleHealth({
  totalTasks,
  completedTasks,
  overdueTasks,
}: {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
}) {
  if (overdueTasks > 0) return { scheduleHealth: "risk" as const, scheduleHealthLabel: "มีงานล่าช้า" };
  if (totalTasks > 0 && completedTasks / totalTasks < 0.35) return { scheduleHealth: "watch" as const, scheduleHealthLabel: "ควรติดตามใกล้ชิด" };
  return { scheduleHealth: "good" as const, scheduleHealthLabel: "อยู่ในเกณฑ์ดี" };
}

function getUpcomingMilestone(milestones: CustomerPortalData["timeline"]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return milestones
    .filter((item) => item.type === "milestone" && dateValue(item.start) && (dateValue(item.start)?.getTime() || 0) >= today.getTime())
    .sort((a, b) => dateTime(a.start) - dateTime(b.start))[0];
}

function normalizeTimeline(schedule: Awaited<ReturnType<typeof getPublicScheduleData>>) {
  const tasks = schedule.tasks
    .filter((task) => text(task.task_type) !== "heading")
    .map((task) => ({
      id: text(task.task_id),
      title: text(task.name) || "งานในแผน",
      start: text(task.start),
      end: text(task.end),
      status: text(task.status) || "To Do",
      percent: Math.max(0, Math.min(100, numberValue(task.percent_done))),
      type: "task" as const,
    }));

  const milestones = schedule.milestones.map((milestone) => ({
    id: text(milestone.milestone_id || milestone.title),
    title: text(milestone.title) || "Milestone",
    start: text(milestone.date),
    end: text(milestone.date),
    status: text(milestone.type) || "Milestone",
    percent: 100,
    type: "milestone" as const,
  }));

  return [...tasks, ...milestones]
    .filter((item) => item.start || item.end)
    .sort((a, b) => dateTime(a.start || a.end) - dateTime(b.start || b.end))
    .slice(0, 14);
}

function buildActions({
  decisions,
  vos,
  qc,
  memos,
  defectRounds,
}: {
  decisions: PortalRow[];
  vos: PortalRow[];
  qc: PortalRow[];
  memos: PortalRow[];
  defectRounds: PortalRow[];
}) {
  const actions: CustomerPortalAction[] = [];

  decisions
    .filter((item) => !isClosedStatus(item.decision_status) && (item.approval_url || text(item.decision_status).includes("ลูกค้า") || text(item.decision_status).includes("ยืนยัน")))
    .forEach((item) => actions.push({
      id: text(item.decision_id),
      type: "decision",
      title: text(item.title) || "รายการที่ต้องตัดสินใจ",
      detail: text(item.phase || item.decision_before),
      status: text(item.decision_status) || "รอลูกค้าตัดสินใจ",
      date: text(item.notified_at || item.updated_at || item.created_at),
      href: text(item.approval_url || item.pdf_url),
    }));

  vos
    .filter((item) => ["pending_approval", "overdue"].includes(text(item.status)) || (item.approval_url && !isClosedStatus(item.status)))
    .forEach((item) => actions.push({
      id: text(item.vo_id),
      type: "vo",
      title: text(item.title) || text(item.vo_id) || "Variation Order",
      detail: `${labelFor(VO_STATUS_LABELS, asVoStatus(text(item.status)))} / ${formatMoney(item.grand_total)} บาท`,
      status: labelFor(VO_STATUS_LABELS, asVoStatus(text(item.status))),
      date: text(item.approval_deadline || item.sent_to_customer_at || item.updated_at),
      href: text(item.approval_url || item.pdf_url),
    }));

  qc
    .filter((item) => ["pending"].includes(text(item.approval_status)) || ["ready_for_customer", "sent_to_customer"].includes(text(item.status)))
    .forEach((item) => actions.push({
      id: text(item.qc_id),
      type: "qc",
      title: text(item.title) || "QC Checklist",
      detail: getQcApprovalReadiness(parseQcItems(item.items_json)).summary,
      status: labelFor(QC_APPROVAL_LABELS, item.approval_status || "pending"),
      date: text(item.sent_to_customer_at || item.inspection_date || item.updated_at),
      href: text(item.approval_url || item.pdf_url),
    }));

  memos
    .filter((item) => isTrueText(item.requires_customer_ack) && !["acknowledged", "closed", "extension_approved"].includes(text(item.status)))
    .forEach((item) => actions.push({
      id: text(item.memo_id),
      type: "memo",
      title: text(item.title) || "Memo",
      detail: text(item.detail).slice(0, 90),
      status: labelFor(MEMO_STATUS_LABELS, item.status || "sent"),
      date: text(item.sent_to_customer_at || item.issue_date || item.updated_at),
      href: text(item.acknowledgement_url || item.pdf_url),
    }));

  defectRounds
    .filter((item) => (item.approval_url || item.sent_to_customer_at) && !["acknowledged", "closed"].includes(text(item.status)))
    .forEach((item) => actions.push({
      id: text(item.round_id),
      type: "defect",
      title: text(item.title) || "Defect List",
      detail: `${text(item.item_count || "0")} รายการ / คงค้าง ${text(item.open_count || "0")}`,
      status: labelFor(DEFECT_ROUND_STATUS_LABELS, item.status || "issued"),
      date: text(item.sent_to_customer_at || item.inspection_date || item.updated_at),
      href: text(item.approval_url || item.pdf_url || item.tracking_pdf_url),
    }));

  return actions
    .filter((item) => item.href)
    .sort((a, b) => dateTime(b.date) - dateTime(a.date))
    .slice(0, 8);
}

function buildDocuments({
  decisions,
  vos,
  qc,
  memos,
  defectRounds,
}: {
  decisions: PortalRow[];
  vos: PortalRow[];
  qc: PortalRow[];
  memos: PortalRow[];
  defectRounds: PortalRow[];
}) {
  const documents: CustomerPortalDocument[] = [];

  decisions.forEach((item) => {
    const status = text(item.decision_status) || "ยังไม่ถึงเวลา";
    const actionUrl = text(item.approval_url);
    const statusGroup = documentStatusGroup(status, Boolean(actionUrl));
    documents.push({
      id: text(item.decision_id || item.document_no || item.title),
      type: "decision",
      typeLabel: "รายการตัดสินใจ",
      title: text(item.title) || "รายการที่ต้องตัดสินใจ",
      detail: [text(item.phase), [text(item.decision_before), text(item.decision_after)].filter(Boolean).join(" -> ")].filter(Boolean).join(" / "),
      status,
      statusGroup,
      date: documentDate(item, ["notified_at", "required_date", "updated_at", "created_at"]),
      approvedAt: documentDate(item, ["approved_at", "customer_approved_at", "confirmed_at", statusGroup === "approved" ? "updated_at" : ""]),
      amount: "",
      documentNo: firstText(item.document_no, item.decision_id),
      pdfUrl: text(item.pdf_url),
      actionUrl,
      attachmentUrl: firstUrlFromJson(item.attachments_json || item.evidence_files_json),
    });
  });

  vos.forEach((item) => {
    const rawStatus = text(item.status);
    const status = labelFor(VO_STATUS_LABELS, asVoStatus(rawStatus));
    const actionUrl = text(item.approval_url);
    documents.push({
      id: text(item.vo_id || item.document_no || item.title),
      type: "vo",
      typeLabel: "Variation Order",
      title: text(item.title) || text(item.vo_id) || "Variation Order",
      detail: [text(item.vo_type), text(item.description || item.reason || item.scope || item.note)].filter(Boolean).join(" / "),
      status,
      statusGroup: documentStatusGroup(rawStatus, Boolean(actionUrl)),
      date: documentDate(item, ["sent_to_customer_at", "approval_deadline", "created_at", "updated_at"]),
      approvedAt: documentDate(item, ["customer_approved_at", "approved_at", "paid_at"]),
      amount: numberValue(item.grand_total) ? `${formatMoney(item.grand_total)} บาท` : "",
      documentNo: firstText(item.document_no, item.vo_id),
      pdfUrl: text(item.pdf_url),
      actionUrl,
      attachmentUrl: text(item.approval_pdf_url || item.supporting_pdf_url) || firstUrlFromJson(item.attachments_json || item.evidence_files_json),
    });
  });

  qc.forEach((item) => {
    const rawStatus = text(item.approval_status || item.status);
    const status = item.approval_status ? labelFor(QC_APPROVAL_LABELS, item.approval_status) : labelFor(QC_STATUS_LABELS, item.status);
    const actionUrl = text(item.approval_url);
    documents.push({
      id: text(item.qc_id || item.document_no || item.title),
      type: "qc",
      typeLabel: "QC Checklist",
      title: text(item.title) || "QC Checklist",
      detail: getQcApprovalReadiness(parseQcItems(item.items_json)).summary,
      status,
      statusGroup: documentStatusGroup(rawStatus, Boolean(actionUrl) && rawStatus !== "approved"),
      date: documentDate(item, ["sent_to_customer_at", "inspection_date", "issued_at", "created_at", "updated_at"]),
      approvedAt: documentDate(item, ["customer_approved_at", "approved_at"]),
      amount: "",
      documentNo: firstText(item.document_no, item.qc_id),
      pdfUrl: text(item.pdf_url),
      actionUrl,
      attachmentUrl: firstUrlFromJson(item.evidence_files_json || item.attachments_json),
    });
  });

  memos.forEach((item) => {
    const rawStatus = text(item.status);
    const actionUrl = text(item.acknowledgement_url);
    documents.push({
      id: text(item.memo_id || item.document_no || item.title),
      type: "memo",
      typeLabel: "Site Memo",
      title: text(item.title) || "Memo",
      detail: text(item.detail),
      status: labelFor(MEMO_STATUS_LABELS, rawStatus || "draft"),
      statusGroup: documentStatusGroup(rawStatus, Boolean(actionUrl) && !["acknowledged", "closed", "extension_approved"].includes(rawStatus)),
      date: documentDate(item, ["sent_to_customer_at", "issue_date", "created_at", "updated_at"]),
      approvedAt: documentDate(item, ["acknowledged_at", "customer_approved_at", "closed_at"]),
      amount: "",
      documentNo: firstText(item.document_no, item.memo_id),
      pdfUrl: text(item.pdf_url),
      actionUrl,
      attachmentUrl: firstUrlFromJson(item.attachments_json || item.evidence_files_json),
    });
  });

  defectRounds.forEach((item) => {
    const rawStatus = text(item.status);
    const actionUrl = text(item.approval_url);
    documents.push({
      id: text(item.round_id || item.document_no || item.title),
      type: "defect",
      typeLabel: "Defect",
      title: text(item.title) || "Defect List",
      detail: `${text(item.item_count || "0")} รายการ / คงค้าง ${text(item.open_count || "0")}`,
      status: labelFor(DEFECT_ROUND_STATUS_LABELS, rawStatus || "issued"),
      statusGroup: documentStatusGroup(rawStatus, Boolean(actionUrl) && !["acknowledged", "closed"].includes(rawStatus)),
      date: documentDate(item, ["sent_to_customer_at", "inspection_date", "created_at", "updated_at"]),
      approvedAt: documentDate(item, ["acknowledged_at", "customer_approved_at", "closed_at"]),
      amount: "",
      documentNo: firstText(item.document_no, item.round_id),
      pdfUrl: text(item.tracking_pdf_url || item.pdf_url),
      actionUrl,
      attachmentUrl: text(item.pdf_url),
    });
  });

  return documents
    .filter((item) => item.id || item.title || item.pdfUrl || item.actionUrl)
    .sort((a, b) => documentSortDate(b) - documentSortDate(a))
    .slice(0, 120);
}

export async function getCustomerPortalData(projectId: string): Promise<CustomerPortalData> {
  const schedule = await getPublicScheduleData(projectId);
  const { sheetId } = await getProjectContext(projectId);
  const rows = await findAllBatch([
    "Daily_Reports",
    "Weekly_Reports",
    "Monthly_Reports",
    "Customer_Decisions",
    "QC_Checklists",
    "Defect_Rounds",
    "Defect_Items",
    "Variation_Orders",
    "Site_Memos",
  ], sheetId) as unknown as Record<string, PortalRow[]>;

  const dailyReports = activeProjectRows(projectId, rows.Daily_Reports);
  const weeklyReports = activeProjectRows(projectId, rows.Weekly_Reports);
  const monthlyReports = activeProjectRows(projectId, rows.Monthly_Reports);
  const decisions = activeProjectRows(projectId, rows.Customer_Decisions);
  const qc = activeProjectRows(projectId, rows.QC_Checklists);
  const defectRounds = activeProjectRows(projectId, rows.Defect_Rounds);
  const defectItems = activeProjectRows(projectId, rows.Defect_Items);
  const vos = activeProjectRows(projectId, rows.Variation_Orders);
  const memos = activeProjectRows(projectId, rows.Site_Memos);

  const timeline = normalizeTimeline(schedule);
  const workTasks = schedule.tasks.filter((task) => text(task.task_type) !== "heading");
  const completedTasks = workTasks.filter((task) => text(task.status) === "Done" || numberValue(task.percent_done) >= 100).length;
  const inProgressTasks = workTasks.filter((task) => text(task.status) === "In Progress").length;
  const progress = workTasks.length ? Math.round(workTasks.reduce((sum, task) => sum + numberValue(task.percent_done), 0) / workTasks.length) : 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueTasks = workTasks.filter((task) => {
    const end = dateValue(task.end);
    return end && end.getTime() < today.getTime() && text(task.status) !== "Done" && numberValue(task.percent_done) < 100;
  }).length;
  const health = scheduleHealth({ totalTasks: workTasks.length, completedTasks, overdueTasks });
  const nextMilestone = getUpcomingMilestone(timeline);

  const latestDaily = latestByDate(dailyReports, ["date", "prepared_at", "updated_at"]);
  const latestWeekly = latestByDate(weeklyReports, ["week_end", "prepared_at", "updated_at"]);
  const latestMonthly = latestByDate(monthlyReports, ["month_end", "prepared_at", "updated_at"]);
  const latestQc = latestByDate(qc, ["inspection_date", "issued_at", "updated_at"]);
  const latestMemo = latestByDate(memos, ["issue_date", "updated_at"]);
  const latestDefectRound = latestByDate(defectRounds, ["inspection_date", "updated_at"]);

  const openDefects = defectItems.filter((item) => !["fixed", "passed", "closed"].includes(text(item.status))).length;
  const fixedDefects = defectItems.filter((item) => text(item.status) === "fixed").length;
  const passedDefects = defectItems.filter((item) => text(item.status) === "passed").length;
  const pendingActions = buildActions({ decisions, vos, qc, memos, defectRounds });
  const documents = buildDocuments({ decisions, vos, qc, memos, defectRounds });
  const pendingQc = qc.filter((item) => ["pending"].includes(text(item.approval_status)) || ["ready_for_customer", "sent_to_customer"].includes(text(item.status))).length;
  const approvedQc = qc.filter((item) => ["approved"].includes(text(item.approval_status)) || ["customer_approved"].includes(text(item.status))).length;
  const pendingVos = vos.filter((item) => ["pending_approval", "overdue"].includes(text(item.status))).length;
  const approvedVos = vos.filter((item) => ["approved", "billed", "partial_payment", "paid", "work_unlocked"].includes(text(item.status))).length;
  const waitingMemos = memos.filter((item) => isTrueText(item.requires_customer_ack) && !["acknowledged", "closed", "extension_approved"].includes(text(item.status))).length;
  const acknowledgedMemos = memos.filter((item) => ["acknowledged", "closed", "extension_approved"].includes(text(item.status))).length;

  return {
    project: {
      project_id: schedule.project.project_id,
      name: schedule.project.name || projectId,
      client: schedule.project.client || "",
      status: schedule.project.status || "",
      start_date: schedule.project.start_date || "",
      end_date: schedule.project.end_date || "",
    },
    metrics: {
      progress,
      ...health,
      totalTasks: workTasks.length,
      completedTasks,
      inProgressTasks,
      nextMilestone: nextMilestone?.title || "",
      nextMilestoneDate: nextMilestone?.start || "",
      openDefects,
      pendingActions: pendingActions.length,
    },
    latestUpdate: {
      title: text(latestDaily?.document_no) || "Daily Report",
      date: text(latestDaily?.date),
      weather: text(latestDaily?.weather),
      workers: text(latestDaily?.workers),
      workDone: text(latestDaily?.work_done),
      issues: text(latestDaily?.issues),
      solutions: text(latestDaily?.solutions),
      pdfUrl: text(latestDaily?.pdf_url),
      photoUrl: firstUrlFromJson(latestDaily?.photos_json),
      photosFolderUrl: folderUrl(latestDaily?.photos_folder_id || latestDaily?.photos_month_folder_id),
    },
    reports: {
      dailyCount: dailyReports.length,
      weeklyCount: weeklyReports.length,
      monthlyCount: monthlyReports.length,
      latestWeeklyPdfUrl: text(latestWeekly?.pdf_url),
      latestMonthlyPdfUrl: text(latestMonthly?.pdf_url),
    },
    summaries: {
      defects: {
        total: defectItems.length,
        open: openDefects,
        fixed: fixedDefects,
        passed: passedDefects,
        latestStatus: labelFor(DEFECT_ROUND_STATUS_LABELS, latestDefectRound?.status),
      },
      qc: {
        total: qc.length,
        pending: pendingQc,
        approved: approvedQc,
        latestStatus: labelFor(QC_STATUS_LABELS, latestQc?.status || latestQc?.approval_status),
      },
      vo: {
        total: vos.length,
        pending: pendingVos,
        approved: approvedVos,
        totalAmount: formatMoney(vos.reduce((sum, item) => sum + numberValue(item.grand_total), 0)),
      },
      memos: {
        total: memos.length,
        waitingAck: waitingMemos,
        acknowledged: acknowledgedMemos,
        latestStatus: labelFor(MEMO_STATUS_LABELS, latestMemo?.status),
      },
    },
    actions: pendingActions,
    documents,
    schedule: {
      tasks: schedule.tasks,
    },
    timeline,
    updated_at: new Date().toISOString(),
  };
}
