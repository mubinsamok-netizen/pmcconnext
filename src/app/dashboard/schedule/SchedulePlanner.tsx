"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  CheckCircle2,
  ClipboardCheck,
  CircleDot,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Flag,
  GripVertical,
  Loader2,
  Plus,
  Printer,
  Search,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { CUSTOMER_DECISION_PHASES, CUSTOMER_DECISION_STATUSES } from "@/lib/customerDecisions";
import { fetcher } from "@/lib/fetcher";

type Project = {
  project_id: string;
  name: string;
  client?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
};

type Task = {
  _rowIndex?: number | string;
  task_id: string;
  project_id: string;
  name: string;
  assignee?: string;
  start?: string;
  end?: string;
  status?: string;
  percent_done?: string;
  category?: string;
  duration_days?: string;
  priority?: string;
  notes?: string;
  order_index?: string;
  task_type?: string;
  parent_task_id?: string;
  planned_start?: string;
  planned_end?: string;
  linked_vo_id?: string;
  vo_badge?: string;
  payment_note?: string;
  gantt_locked?: string;
  unlock_date?: string;
  unlock_reason?: string;
  summary_child_count?: number;
  is_collapsed?: boolean;
};

type Milestone = {
  _rowIndex?: number | string;
  milestone_id: string;
  project_id: string;
  title: string;
  date: string;
  type?: string;
  color?: string;
  notes?: string;
};

type CustomerDecision = {
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
  line_group_id?: string;
  decided_at?: string;
  decided_by?: string;
  pdf_file_id?: string;
  pdf_url?: string;
  issued_at?: string;
  order_index?: string;
};

type DecisionEvidenceFile = {
  file_id?: string;
  file_name?: string;
  file_url?: string;
  mime_type?: string;
};

type UploadPayload = {
  name: string;
  type: string;
  dataUrl: string;
};

type TaskForm = {
  _rowIndex?: number | string;
  task_id?: string;
  name: string;
  category: string;
  assignee: string;
  start: string;
  end: string;
  status: string;
  percent_done: string;
  priority: string;
  notes: string;
  order_index: string;
  task_type: string;
  parent_task_id: string;
  planned_start: string;
  planned_end: string;
};

type MilestoneForm = {
  _rowIndex?: number | string;
  milestone_id?: string;
  title: string;
  date: string;
  type: string;
  color: string;
  notes: string;
};

type CustomerDecisionForm = {
  decision_id?: string;
  phase: string;
  title: string;
  decision_before: string;
  decision_status: string;
  impact_if_changed: string;
  result_note: string;
  evidence_note: string;
  decided_at: string;
  decided_by: string;
  order_index: string;
};

type ApiListResponse<T> = {
  success: boolean;
  data: T[];
};

type CustomerDecisionResponse = ApiListResponse<CustomerDecision> & {
  line?: {
    test_mode?: boolean;
    target_group_id?: string;
    target_group_name?: string;
  };
};

type PrintTarget = "plan" | "gantt" | null;
type ActiveTab = "tracker" | "plan" | "gantt" | "decisions";
type Timeline = {
  start: Date;
  end: Date;
  totalDays: number;
  dayTicks: { key: string; date: Date; left: number }[];
  monthGroups: { label: string; left: number; width: number }[];
};
type TaskPatch = Partial<Omit<Task, "task_id" | "project_id" | "_rowIndex">>;
type TaskDateForm = {
  start: string;
  end: string;
};
type CollapsedState = Record<string, Record<string, boolean>>;

const TASK_STATUSES = ["To Do", "In Progress", "Review", "Done"];
const TASK_TYPES = [
  { value: "heading", label: "H1 หัวข้อหลัก" },
  { value: "subtask", label: "งานย่อย" },
];

const TASK_STATUS_LABELS: Record<string, string> = {
  "To Do": "ยังไม่เริ่ม",
  "In Progress": "กำลังดำเนินการ",
  Review: "รอตรวจ",
  Done: "เสร็จแล้ว",
};

const TRACKER_COLUMN_STYLES: Record<string, { dot: string; badge: string; surface: string }> = {
  "To Do": { dot: "bg-gray-400", badge: "bg-gray-100 text-gray-700", surface: "bg-gray-50" },
  "In Progress": { dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700", surface: "bg-blue-50/40" },
  Review: { dot: "bg-orange-500", badge: "bg-orange-50 text-orange-700", surface: "bg-orange-50/40" },
  Done: { dot: "bg-green-500", badge: "bg-green-50 text-green-700", surface: "bg-green-50/40" },
};

const TASK_CATEGORIES = [
  "งานเตรียมการ",
  "งานโครงสร้าง",
  "งานสถาปัตย์",
  "งานระบบ MEP",
  "งานตกแต่งภายใน",
  "งานภายนอก",
  "งานตรวจสอบ",
  "งานทั่วไป",
];
const CUSTOM_HEADING_VALUE = "__custom_heading__";

const CATEGORY_COLORS: Record<string, string> = {
  "งานเตรียมการ": "#6b4f3f",
  "งานโครงสร้าง": "#c0392b",
  "งานสถาปัตย์": "#d97706",
  "งานระบบ MEP": "#2563eb",
  "งานตกแต่งภายใน": "#2f8a3e",
  "งานภายนอก": "#7c3aed",
  "งานตรวจสอบ": "#f97316",
  "งานทั่วไป": "#607d8b",
};

const MILESTONE_TYPES = ["งวดงาน", "ตรวจงาน", "ส่งมอบ", "อื่น ๆ"];
const MILESTONE_COLORS = ["#f97316", "#2563eb", "#16a34a", "#dc2626", "#7c3aed", "#0f766e"];
const COLLAPSED_STORAGE_KEY = "pmc.schedule.collapsedHeadings.v1";

const emptyTaskForm: TaskForm = {
  name: "",
  category: TASK_CATEGORIES[TASK_CATEGORIES.length - 1],
  assignee: "",
  start: "",
  end: "",
  status: "To Do",
  percent_done: "0",
  priority: "ปกติ",
  notes: "",
  order_index: "",
  task_type: "subtask",
  parent_task_id: "",
  planned_start: "",
  planned_end: "",
};

const emptyMilestoneForm: MilestoneForm = {
  title: "",
  date: "",
  type: "งวดงาน",
  color: "#f97316",
  notes: "",
};

const emptyDecisionForm: CustomerDecisionForm = {
  phase: CUSTOMER_DECISION_PHASES[0],
  title: "",
  decision_before: "",
  decision_status: "ยังไม่ถึงเวลา",
  impact_if_changed: "",
  result_note: "",
  evidence_note: "",
  decided_at: "",
  decided_by: "",
  order_index: "",
};

function parseDate(value?: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0);
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(start?: string, end?: string) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) return "";
  return String(Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1));
}

function getTaskDuration(task: Pick<Task, "duration_days" | "start" | "end">) {
  const explicitDuration = Number(task.duration_days || 0);
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) return explicitDuration;
  const fallbackDuration = Number(daysBetween(task.start, task.end) || 1);
  return Number.isFinite(fallbackDuration) && fallbackDuration > 0 ? fallbackDuration : 1;
}

function getInitialTab(tab?: string | null): ActiveTab {
  return tab === "tracker" || tab === "plan" || tab === "gantt" || tab === "decisions" ? tab : "plan";
}

function formatDate(value?: string, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }) {
  const date = parseDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("th-TH", options).format(date);
}

function formatDateShort(value?: string) {
  const date = parseDate(value);
  if (!date) return "-";
  const buddhistYear = String(date.getFullYear() + 543).slice(-2);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${buddhistYear}`;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง";
}

function percentBetween(date: Date, start: Date, totalDays: number) {
  const diff = date.getTime() - start.getTime();
  return clamp((diff / (totalDays * 86400000)) * 100);
}

function normalizeTask(task: Task, index: number): Task {
  const start = task.start || task.planned_start || "";
  const end = task.end || task.planned_end || "";
  const fallbackCategory = TASK_CATEGORIES[TASK_CATEGORIES.length - 1];
  return {
    ...task,
    start,
    end,
    status: task.status || "To Do",
    percent_done: task.percent_done || "0",
    category: task.category || (task.task_type === "heading" ? task.name : fallbackCategory),
    duration_days: task.duration_days || daysBetween(start, end),
    priority: task.priority || "ปกติ",
    notes: task.notes || "",
    order_index: task.order_index || String(index + 1),
    task_type: task.task_type || "subtask",
    parent_task_id: task.parent_task_id || "",
    planned_start: task.planned_start || start,
    planned_end: task.planned_end || end,
    linked_vo_id: task.linked_vo_id || "",
    vo_badge: task.vo_badge || "",
    payment_note: task.payment_note || "",
    gantt_locked: task.gantt_locked || "",
    unlock_date: task.unlock_date || "",
    unlock_reason: task.unlock_reason || "",
  };
}

function getTaskOrder(task: Task) {
  return Number(task.order_index || 0) || 999999;
}

function isHeadingTask(task: Task) {
  return task.task_type === "heading";
}

function getParentTaskName(task: Task, taskMap: Map<string, Task>) {
  if (!task.parent_task_id) return "";
  return taskMap.get(task.parent_task_id)?.name || "";
}

function getTaskCategoryName(task: Task, taskMap: Map<string, Task>) {
  if (isHeadingTask(task)) return task.name || task.category || "";
  if (task.parent_task_id) {
    const parent = taskMap.get(task.parent_task_id);
    if (parent) return parent.name || parent.category || "";
  }
  return task.category || "";
}

function getTaskCategoryColor(task: Task, taskMap: Map<string, Task>) {
  const categoryName = getTaskCategoryName(task, taskMap);
  return CATEGORY_COLORS[categoryName] || "#607d8b";
}

function readCollapsedState(): CollapsedState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    return raw ? JSON.parse(raw) as CollapsedState : {};
  } catch {
    return {};
  }
}

function writeCollapsedState(state: CollapsedState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(state));
}

function sortTaskList(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const orderDiff = getTaskOrder(a) - getTaskOrder(b);
    if (orderDiff !== 0) return orderDiff;
    const aDate = parseDate(a.start)?.getTime() || 0;
    const bDate = parseDate(b.start)?.getTime() || 0;
    return aDate - bDate;
  });
}

function getHeadingSummaryTask(heading: Task, children: Task[], collapsed: boolean): Task {
  const childDates = children
    .flatMap((child) => [parseDate(child.start), parseDate(child.end)])
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());
  const plannedChildren = children.filter((child) => parseDate(child.start) && parseDate(child.end)).length;
  const start = childDates[0] ? toInputDate(childDates[0]) : "";
  const end = childDates[childDates.length - 1] ? toInputDate(childDates[childDates.length - 1]) : "";
  const planPercent = children.length ? Math.round((plannedChildren / children.length) * 100) : 0;

  return {
    ...heading,
    start,
    end,
    planned_start: start,
    planned_end: end,
    duration_days: daysBetween(start, end),
    percent_done: String(planPercent),
    summary_child_count: children.length,
    is_collapsed: collapsed,
  };
}

function buildTaskRows(tasks: Task[], collapsedHeadings: Record<string, boolean>) {
  const sorted = sortTaskList(tasks);
  const headingIds = new Set(sorted.filter(isHeadingTask).map((task) => task.task_id));
  const childrenByParent = new Map<string, Task[]>();

  sorted.forEach((task) => {
    if (isHeadingTask(task) || !task.parent_task_id || !headingIds.has(task.parent_task_id)) return;
    const current = childrenByParent.get(task.parent_task_id) || [];
    current.push(task);
    childrenByParent.set(task.parent_task_id, current);
  });

  const ordered: Task[] = [];
  sorted.forEach((task) => {
    if (isHeadingTask(task)) {
      const children = childrenByParent.get(task.task_id) || [];
      const collapsed = Boolean(collapsedHeadings[task.task_id]);
      ordered.push(getHeadingSummaryTask(task, children, collapsed));
      if (!collapsed) ordered.push(...children);
      return;
    }

    if (!task.parent_task_id || !headingIds.has(task.parent_task_id)) {
      ordered.push(task);
    }
  });

  return ordered;
}

function getTaskOutlineNumber(task: Task, visibleRows: Task[], allRows: Task[]) {
  const visibleHeadings = visibleRows.filter(isHeadingTask);
  if (isHeadingTask(task)) {
    const headingIndex = visibleHeadings.findIndex((item) => item.task_id === task.task_id);
    return headingIndex >= 0 ? String(headingIndex + 1) : String(getTaskOrder(task));
  }

  if (task.parent_task_id) {
    const parentIndex = visibleHeadings.findIndex((item) => item.task_id === task.parent_task_id);
    const siblings = sortTaskList(allRows.filter((item) => item.parent_task_id === task.parent_task_id && !isHeadingTask(item)));
    const childIndex = siblings.findIndex((item) => item.task_id === task.task_id);
    if (parentIndex >= 0 && childIndex >= 0) return `${parentIndex + 1}.${childIndex + 1}`;
  }

  const looseIndex = visibleRows.filter((item) => !isHeadingTask(item) && !item.parent_task_id).findIndex((item) => item.task_id === task.task_id);
  return looseIndex >= 0 ? String(looseIndex + 1) : String(getTaskOrder(task));
}

function dateRangeLabel(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", year: "numeric" });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function getTrackerColumnStyle(status: string) {
  return TRACKER_COLUMN_STYLES[status] || TRACKER_COLUMN_STYLES["To Do"];
}

function getDecisionStatusClass(status?: string) {
  const value = status || "";
  if (value === "ยืนยันแล้ว") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "รอลูกค้า" || value === "ส่งแจ้งเตือนแล้ว") return "border-blue-200 bg-blue-50 text-blue-700";
  if (value === "ต้องยืนยัน") return "border-orange-200 bg-orange-50 text-orange-700";
  if (value === "เลยจุดตัดสินใจ") return "border-red-200 bg-red-50 text-red-700";
  return "border-gray-200 bg-gray-50 text-gray-600";
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function parseDecisionEvidence(value?: string | number) {
  if (!value) return [] as DecisionEvidenceFile[];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.filter(Boolean) as DecisionEvidenceFile[] : [];
  } catch {
    return [];
  }
}

async function fileToUploadPayload(file: File) {
  return new Promise<UploadPayload>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error("อ่านไฟล์แนบไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

export default function SchedulePlanner({ projects }: { projects: Project[] }) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => getInitialTab(searchParams.get("tab")));
  const [selectedProject, setSelectedProject] = useState(projects[0]?.project_id || "");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ทั้งหมด");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTaskForm);
  const [milestoneForm, setMilestoneForm] = useState<MilestoneForm>(emptyMilestoneForm);
  const [decisionForm, setDecisionForm] = useState<CustomerDecisionForm>(emptyDecisionForm);
  const [decisionEvidenceFiles, setDecisionEvidenceFiles] = useState<File[]>([]);
  const [currentDecisionPhase, setCurrentDecisionPhase] = useState<string>("โครงสร้าง");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [printTarget, setPrintTarget] = useState<PrintTarget>(null);
  const [quickDateEdit, setQuickDateEdit] = useState(false);
  const [dateEditTask, setDateEditTask] = useState<Task | null>(null);
  const [dateEditForm, setDateEditForm] = useState<TaskDateForm>({ start: "", end: "" });
  const [collapsedByProject, setCollapsedByProject] = useState<CollapsedState>(readCollapsedState);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<Task | null>(null);
  const [milestoneDeleteOpen, setMilestoneDeleteOpen] = useState(false);

  useEffect(() => {
    const handleAfterPrint = () => setPrintTarget(null);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  const selectedProjectData = projects.find((project) => project.project_id === selectedProject);
  const taskKey = selectedProject ? `/api/tasks?project_id=${selectedProject}` : null;
  const milestoneKey = selectedProject ? `/api/milestones?project_id=${selectedProject}` : null;
  const decisionKey = selectedProject && activeTab === "decisions" ? `/api/sites/${encodeURIComponent(selectedProject)}/customer-decisions` : null;

  const { data: taskRes, isLoading: tasksLoading, mutate: mutateTasks } = useSWR<ApiListResponse<Task>>(taskKey, fetcher);
  const { data: milestoneRes, isLoading: milestonesLoading, mutate: mutateMilestones } = useSWR<ApiListResponse<Milestone>>(milestoneKey, fetcher);
  const { data: decisionRes, isLoading: decisionsLoading, mutate: mutateDecisions } = useSWR<CustomerDecisionResponse>(decisionKey, fetcher);

  const tasks = useMemo(() => (taskRes?.data ?? []).map(normalizeTask), [taskRes?.data]);
  const milestones = useMemo(() => milestoneRes?.data ?? [], [milestoneRes?.data]);
  const decisions = useMemo(() => decisionRes?.data ?? [], [decisionRes?.data]);
  const collapsedHeadings = useMemo(() => collapsedByProject[selectedProject] || {}, [collapsedByProject, selectedProject]);

  const sortedTasks = useMemo(() => sortTaskList(tasks), [tasks]);
  const visibleTaskRows = useMemo(() => buildTaskRows(tasks, collapsedHeadings), [collapsedHeadings, tasks]);

  const taskMap = useMemo(() => new Map(sortedTasks.map((task) => [task.task_id, task])), [sortedTasks]);
  const headingTasks = useMemo(() => sortedTasks.filter(isHeadingTask), [sortedTasks]);

  const filteredTasks = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return visibleTaskRows.filter((task) => {
      const matchesStatus = statusFilter === "ทั้งหมด" || task.status === statusFilter;
      const matchesKeyword = !keyword || [task.name, task.assignee, getParentTaskName(task, taskMap), task.notes]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
      return matchesStatus && matchesKeyword;
    });
  }, [searchTerm, statusFilter, taskMap, visibleTaskRows]);

  const sortedMilestones = useMemo(() => {
    return [...milestones].sort((a, b) => (parseDate(a.date)?.getTime() || 0) - (parseDate(b.date)?.getTime() || 0));
  }, [milestones]);

  const highlightedDecisions = useMemo(() => {
    return decisions.filter((decision) => decision.phase === currentDecisionPhase);
  }, [currentDecisionPhase, decisions]);

  const waitingDecisionCount = useMemo(() => {
    return decisions.filter((decision) => ["ต้องยืนยัน", "รอลูกค้า", "ส่งแจ้งเตือนแล้ว"].includes(decision.decision_status || "")).length;
  }, [decisions]);

  const timeline = useMemo(() => {
    const dates: Date[] = [];
    visibleTaskRows.forEach((task) => {
      const start = parseDate(task.start);
      const end = parseDate(task.end);
      if (start) dates.push(start);
      if (end) dates.push(end);
    });

    sortedMilestones.forEach((milestone) => {
      const date = parseDate(milestone.date);
      if (date) dates.push(date);
    });

    const projectStart = parseDate(selectedProjectData?.start_date);
    const projectEnd = parseDate(selectedProjectData?.end_date);
    if (!dates.length && projectStart) dates.push(projectStart);
    if (!dates.length && projectEnd) dates.push(projectEnd);

    const today = new Date();
    const start = dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : addDays(today, -7);
    const end = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : addDays(today, 45);
    const paddedStart = addDays(start, -2);
    const paddedEnd = addDays(end, 2);
    const totalDays = Math.max(1, Math.round((paddedEnd.getTime() - paddedStart.getTime()) / 86400000));
    const dayStep = totalDays <= 50 ? 1 : totalDays <= 110 ? 3 : totalDays <= 220 ? 7 : 14;

    const dayTicks = [];
    for (let day = 0; day <= totalDays; day += dayStep) {
      const current = addDays(paddedStart, day);
      dayTicks.push({
        key: toInputDate(current),
        date: current,
        left: percentBetween(current, paddedStart, totalDays),
      });
    }

    const monthGroups: { label: string; left: number; width: number }[] = [];
    let cursor = new Date(paddedStart.getFullYear(), paddedStart.getMonth(), 1, 12);
    if (cursor < paddedStart) cursor = new Date(paddedStart.getFullYear(), paddedStart.getMonth(), 1, 12);
    while (cursor <= paddedEnd) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12);
      const visibleStart = monthStart < paddedStart ? paddedStart : monthStart;
      const visibleEnd = monthEnd > paddedEnd ? paddedEnd : monthEnd;
      const left = percentBetween(visibleStart, paddedStart, totalDays);
      const right = percentBetween(visibleEnd, paddedStart, totalDays);
      monthGroups.push({
        label: new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(monthStart),
        left,
        width: Math.max(3, right - left),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return { start: paddedStart, end: paddedEnd, totalDays, dayTicks, monthGroups };
  }, [selectedProjectData?.end_date, selectedProjectData?.start_date, sortedMilestones, visibleTaskRows]);

  const stats = useMemo(() => {
    const done = tasks.filter((task) => task.status === "Done").length;
    const inProgress = tasks.filter((task) => task.status === "In Progress").length;
    const late = tasks.filter((task) => {
      const end = parseDate(task.end);
      return end && end < new Date() && task.status !== "Done";
    }).length;
    const durationTotals = tasks.reduce(
      (acc, task) => {
        if (isHeadingTask(task)) return acc;
        const durationDays = getTaskDuration(task);
        return {
          progress: acc.progress + durationDays * clamp(Number(task.percent_done || 0)),
          days: acc.days + durationDays,
        };
      },
      { progress: 0, days: 0 }
    );
    return {
      done,
      inProgress,
      late,
      average: durationTotals.days ? Math.round(durationTotals.progress / durationTotals.days) : 0,
    };
  }, [tasks]);

  const today = new Date();
  const todayLeft = today >= timeline.start && today <= timeline.end
    ? percentBetween(today, timeline.start, timeline.totalDays)
    : null;

  const isLoading = tasksLoading || milestonesLoading;
  const showProjectSelector = projects.length > 1;

  const handlePrint = (target: Exclude<PrintTarget, null>) => {
    setPrintTarget(target);
    window.setTimeout(() => window.print(), 80);
  };

  const toggleHeading = (taskId: string) => {
    if (!selectedProject) return;
    setCollapsedByProject((current) => {
      const projectState = { ...(current[selectedProject] || {}) };
      projectState[taskId] = !projectState[taskId];
      const next = { ...current, [selectedProject]: projectState };
      writeCollapsedState(next);
      return next;
    });
  };

  const openNewTask = (taskType: "heading" | "subtask" = "subtask", parentTaskId = "") => {
    setMessage("");
    const todayInput = toInputDate(new Date());
    const isHeading = taskType === "heading";
    setTaskForm({
      ...emptyTaskForm,
      task_type: taskType,
      name: isHeading ? TASK_CATEGORIES[0] : "",
      category: isHeading ? TASK_CATEGORIES[0] : "",
      order_index: String(sortedTasks.length + 1),
      parent_task_id: isHeading ? "" : parentTaskId,
      start: isHeading ? "" : todayInput,
      end: isHeading ? "" : todayInput,
      planned_start: isHeading ? "" : todayInput,
      planned_end: isHeading ? "" : todayInput,
    });
    setShowTaskForm(true);
  };

  const openEditTask = (task: Task) => {
    setMessage("");
    setTaskForm({
      _rowIndex: task._rowIndex,
      task_id: task.task_id,
      name: task.name,
      category: task.category || (isHeadingTask(task) ? task.name : ""),
      assignee: task.assignee || "",
      start: task.start || "",
      end: task.end || "",
      status: task.status || "To Do",
      percent_done: task.percent_done || "0",
      priority: task.priority || "ปกติ",
      notes: task.notes || "",
      order_index: task.order_index || "",
      task_type: task.task_type || "subtask",
      parent_task_id: task.parent_task_id || "",
      planned_start: task.planned_start || task.start || "",
      planned_end: task.planned_end || task.end || "",
    });
    setShowTaskForm(true);
  };

  const openDateEditTask = (task: Task) => {
    if ((!task.task_id && !task._rowIndex) || isHeadingTask(task)) return;
    setMessage("");
    setDateEditTask(task);
    setDateEditForm({
      start: task.start || "",
      end: task.end || "",
    });
  };

  const saveTaskPatch = async (task: Task, patch: TaskPatch, successMessage: string) => {
    if (!task.task_id && !task._rowIndex) return false;

    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.task_id, _rowIndex: task._rowIndex, project_id: task.project_id, ...patch }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to update task");
      }

      void mutateTasks((current) => current ? {
        ...current,
        data: current.data.map((item) => (
          (task.task_id && item.task_id === task.task_id) || item._rowIndex === task._rowIndex
            ? { ...item, ...patch }
            : item
        )),
      } : current, { revalidate: false });
      void mutateTasks().catch(() => undefined);
      setMessage(successMessage);
      return true;
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveTaskDates = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dateEditTask) return;

    const saved = await saveTaskPatch(dateEditTask, {
      start: dateEditForm.start,
      end: dateEditForm.end,
      planned_start: dateEditForm.start,
      planned_end: dateEditForm.end,
      duration_days: daysBetween(dateEditForm.start, dateEditForm.end),
    }, "อัปเดตวันที่ของ task เรียบร้อยแล้ว");
    if (saved) setDateEditTask(null);
  };

  const moveTaskToPosition = async (task: Task, position: number) => {
    const currentIndex = sortedTasks.findIndex((item) => item.task_id === task.task_id);
    if (currentIndex < 0 || saving) return;

    const targetIndex = clamp(Math.round(position), 1, sortedTasks.length) - 1;
    if (targetIndex === currentIndex) return;

    const nextTasks = [...sortedTasks];
    const [movedTask] = nextTasks.splice(currentIndex, 1);
    nextTasks.splice(targetIndex, 0, movedTask);

    setSaving(true);
    setMessage("");

    try {
      await Promise.all(nextTasks.map((item, index) => {
        if ((!item.task_id && !item._rowIndex) || item.order_index === String(index + 1)) return Promise.resolve();
        return fetch("/api/tasks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: item.task_id, _rowIndex: item._rowIndex, project_id: item.project_id, order_index: String(index + 1) }),
        }).then(async (res) => {
          if (!res.ok) {
            const json = await res.json();
            throw new Error(json.error || "Failed to reorder task");
          }
        });
      }));

      void mutateTasks((current) => current ? {
        ...current,
        data: nextTasks.map((item, index) => ({ ...item, order_index: String(index + 1) })),
      } : current, { revalidate: false });
      void mutateTasks().catch(() => undefined);
      setMessage("อัปเดตลำดับงานเรียบร้อยแล้ว ลำดับนี้จะถูกใช้ตอนพิมพ์ด้วย");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const promptMoveTask = (task: Task) => {
    const currentPosition = sortedTasks.findIndex((item) => item.task_id === task.task_id) + 1;
    const value = window.prompt(`ย้าย "${task.name}" ไปเป็นลำดับที่`, String(currentPosition));
    if (!value) return;

    const nextPosition = Number(value);
    if (!Number.isFinite(nextPosition)) return;
    void moveTaskToPosition(task, nextPosition);
  };

  const saveTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject || !taskForm.name) return;

    setSaving(true);
    setMessage("");

    const isHeading = taskForm.task_type === "heading";
    const plannedStart = isHeading ? "" : taskForm.planned_start || taskForm.start;
    const plannedEnd = isHeading ? "" : taskForm.planned_end || taskForm.end;
    const parentTask = sortedTasks.find((task) => task.task_id === taskForm.parent_task_id);
    const payload = {
      ...taskForm,
      project_id: selectedProject,
      category: isHeading ? taskForm.name : parentTask?.name || "",
      order_index: taskForm.order_index || String(sortedTasks.length + 1),
      parent_task_id: isHeading ? "" : taskForm.parent_task_id,
      start: plannedStart,
      end: plannedEnd,
      planned_start: plannedStart,
      planned_end: plannedEnd,
      duration_days: daysBetween(plannedStart, plannedEnd),
    };

    try {
      const res = await fetch("/api/tasks", {
        method: taskForm.task_id || taskForm._rowIndex ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to save task");
      }

      const json = await res.json() as { data?: Task };
      const savedTask = (json.data || payload) as Task;
      void mutateTasks((current) => {
        if (!current) return current;
        const taskId = savedTask.task_id || taskForm.task_id;
        const exists = current.data.some((item) => (
          (taskId && item.task_id === taskId) || item._rowIndex === savedTask._rowIndex
        ));
        return {
          ...current,
          data: exists
            ? current.data.map((item) => (
              (taskId && item.task_id === taskId) || item._rowIndex === savedTask._rowIndex
                ? { ...item, ...savedTask }
                : item
            ))
            : [...current.data, savedTask],
        };
      }, { revalidate: false });
      void mutateTasks().catch(() => undefined);
      setShowTaskForm(false);
      setMessage("บันทึกแผนงานเรียบร้อยแล้ว");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async (task: Task) => {
    if (!task.task_id && !task._rowIndex) return;

    setSaving(true);
    setMessage("");

    try {
      const params = new URLSearchParams({
        project_id: task.project_id,
      });
      if (task.task_id) params.set("task_id", task.task_id);
      if (task._rowIndex) params.set("_rowIndex", String(task._rowIndex));
      const res = await fetch(`/api/tasks?${params.toString()}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete task");
      }

      void mutateTasks((current) => current ? {
        ...current,
        data: current.data.filter((item) => !(
          (task.task_id && item.task_id === task.task_id) || item._rowIndex === task._rowIndex
        )),
      } : current, { revalidate: false });
      void mutateTasks().catch(() => undefined);
      setPendingDeleteTask(null);
      setMessage("ลบแผนงานเรียบร้อยแล้ว");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const openNewMilestone = () => {
    setMessage("");
    setMilestoneForm({
      ...emptyMilestoneForm,
      date: toInputDate(new Date()),
    });
    setShowMilestoneForm(true);
  };

  const openEditMilestone = (milestone: Milestone) => {
    setMessage("");
    setMilestoneForm({
      _rowIndex: milestone._rowIndex,
      milestone_id: milestone.milestone_id,
      title: milestone.title,
      date: milestone.date,
      type: milestone.type || "งวดงาน",
      color: milestone.color || "#f97316",
      notes: milestone.notes || "",
    });
    setShowMilestoneForm(true);
  };

  const saveMilestone = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject || !milestoneForm.title || !milestoneForm.date) return;

    setSaving(true);
    setMessage("");

    const payload = {
      ...milestoneForm,
      project_id: selectedProject,
    };

    try {
      const res = await fetch("/api/milestones", {
        method: milestoneForm.milestone_id || milestoneForm._rowIndex ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to save milestone");
      }

      const json = await res.json() as { data?: Milestone };
      const savedMilestone = (json.data || payload) as Milestone;
      void mutateMilestones((current) => {
        if (!current) return current;
        const milestoneId = savedMilestone.milestone_id || milestoneForm.milestone_id;
        const exists = current.data.some((item) => (
          (milestoneId && item.milestone_id === milestoneId) || item._rowIndex === savedMilestone._rowIndex
        ));
        return {
          ...current,
          data: exists
            ? current.data.map((item) => (
              (milestoneId && item.milestone_id === milestoneId) || item._rowIndex === savedMilestone._rowIndex
                ? { ...item, ...savedMilestone }
                : item
            ))
            : [...current.data, savedMilestone],
        };
      }, { revalidate: false });
      void mutateMilestones().catch(() => undefined);
      setShowMilestoneForm(false);
      setMessage("บันทึก Milestone เรียบร้อยแล้ว");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const deleteMilestone = async () => {
    if (!milestoneForm.milestone_id && !milestoneForm._rowIndex) return;

    setSaving(true);
    setMessage("");

    try {
      const params = new URLSearchParams({
        project_id: selectedProject,
      });
      if (milestoneForm.milestone_id) params.set("milestone_id", milestoneForm.milestone_id);
      if (milestoneForm._rowIndex) params.set("_rowIndex", String(milestoneForm._rowIndex));
      const res = await fetch(`/api/milestones?${params.toString()}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete milestone");
      }

      void mutateMilestones((current) => current ? {
        ...current,
        data: current.data.filter((item) => !(
          (milestoneForm.milestone_id && item.milestone_id === milestoneForm.milestone_id) || item._rowIndex === milestoneForm._rowIndex
        )),
      } : current, { revalidate: false });
      void mutateMilestones().catch(() => undefined);
      setShowMilestoneForm(false);
      setMilestoneDeleteOpen(false);
      setMessage("ลบ Milestone เรียบร้อยแล้ว");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const openNewDecision = () => {
    setMessage("");
    setDecisionForm({
      ...emptyDecisionForm,
      phase: currentDecisionPhase || CUSTOMER_DECISION_PHASES[0],
      order_index: String(decisions.length + 1),
    });
    setDecisionEvidenceFiles([]);
    setShowDecisionForm(true);
  };

  const openEditDecision = (decision: CustomerDecision) => {
    setMessage("");
    setDecisionForm({
      decision_id: decision.decision_id,
      phase: decision.phase || CUSTOMER_DECISION_PHASES[0],
      title: decision.title || "",
      decision_before: decision.decision_before || "",
      decision_status: decision.decision_status || "ยังไม่ถึงเวลา",
      impact_if_changed: decision.impact_if_changed || "",
      result_note: decision.result_note || "",
      evidence_note: decision.evidence_note || "",
      decided_at: decision.decided_at || "",
      decided_by: decision.decided_by || "",
      order_index: String(decision.order_index || ""),
    });
    setDecisionEvidenceFiles([]);
    setShowDecisionForm(true);
  };

  const saveDecision = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject || !decisionForm.title) return;

    setSaving(true);
    setMessage("");

    try {
      const evidenceUploads = await Promise.all(decisionEvidenceFiles.map(fileToUploadPayload));
      const res = await fetch(`/api/sites/${encodeURIComponent(selectedProject)}/customer-decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", ...decisionForm, evidence_uploads: evidenceUploads }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to save customer decision");
      }

      await mutateDecisions();
      setShowDecisionForm(false);
      setDecisionEvidenceFiles([]);
      setMessage("บันทึกรายการที่ลูกค้าต้องตัดสินใจเรียบร้อยแล้ว");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const deleteDecision = async (decision: CustomerDecision) => {
    if (!selectedProject || !window.confirm(`ลบรายการ "${decision.title}" ใช่ไหม?`)) return;

    setSaving(true);
    setMessage("");

    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(selectedProject)}/customer-decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", decision_id: decision.decision_id }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete customer decision");
      }

      await mutateDecisions();
      setMessage("ลบรายการที่ลูกค้าต้องตัดสินใจเรียบร้อยแล้ว");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const notifyDecisionLine = async (decision: CustomerDecision) => {
    if (!selectedProject) return;

    setSaving(true);
    setMessage("");

    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(selectedProject)}/customer-decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notify_line", decision_id: decision.decision_id }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to send LINE notification");
      }

      await mutateDecisions();
      setMessage(json.data?.test_mode
        ? `ส่ง LINE ทดสอบไปยังกลุ่ม ${json.data.line_group_id} แล้ว`
        : "ส่ง LINE แจ้งเตือนเข้ากลุ่มลูกค้าเรียบร้อยแล้ว");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const issueDecisionPdf = async (decision: CustomerDecision) => {
    if (!selectedProject) return;

    setSaving(true);
    setMessage("");

    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(selectedProject)}/customer-decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "issue_pdf", decision_id: decision.decision_id }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to issue PDF");
      }

      await mutateDecisions();
      setMessage("ออก PDF รายการต้องตัดสินใจเรียบร้อยแล้ว");
      const pdfUrl = json.data?.pdf_url;
      if (pdfUrl) window.open(String(pdfUrl), "_blank", "noopener,noreferrer");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const scheduleTabs: { key: ActiveTab; label: string; detail: string; icon: React.ReactNode; count: number }[] = [
    {
      key: "tracker",
      label: "Task Tracker",
      detail: "ติดตามงานย่อย",
      icon: <CheckSquare size={16} />,
      count: tasks.filter((task) => !isHeadingTask(task)).length,
    },
    {
      key: "plan",
      label: "ตารางแผนงาน",
      detail: "H1 + งานย่อย",
      icon: <FileSpreadsheet size={16} />,
      count: visibleTaskRows.length,
    },
    {
      key: "gantt",
      label: "Gantt Chart",
      detail: "Timeline + Milestone",
      icon: <BarChart3 size={16} />,
      count: milestones.length,
    },
    {
      key: "decisions",
      label: "รายการต้องตัดสินใจ",
      detail: "ลูกค้า + วิศวกร",
      icon: <ClipboardCheck size={16} />,
      count: waitingDecisionCount,
    },
  ];

  return (
    <section className="schedule-print-surface space-y-5">
      <div className="schedule-screen-only bg-white border border-gray-200 rounded-2xl shadow-sm p-4 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {showProjectSelector ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="font-medium text-gray-700">โครงการ:</label>
              <select
                value={selectedProject}
                onChange={(event) => setSelectedProject(event.target.value)}
                className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-200 min-w-[280px]"
              >
                {projects.map((project) => (
                  <option key={project.project_id} value={project.project_id}>
                    {project.project_id} - {project.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900 truncate">{selectedProjectData?.name || selectedProject}</h3>
              <p className="text-sm text-gray-500 truncate">
                {selectedProjectData?.project_id || selectedProject} | {selectedProjectData?.client || "ไม่ระบุลูกค้า"} | {selectedProjectData?.status || "Planning"}
              </p>
            </div>
          )}

          <div className="grid w-full gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-1.5 shadow-inner sm:w-auto sm:grid-cols-2 xl:grid-cols-4">
            {scheduleTabs.map((tab) => {
              const isActive = activeTab === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex min-w-[168px] items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    isActive ? "bg-orange-600 text-white shadow-sm" : "text-gray-500 hover:bg-white hover:text-gray-900"
                  }`}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isActive ? "bg-white/15 text-white" : "bg-white text-gray-400"}`}>
                    {tab.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold leading-tight">{tab.label}</span>
                    <span className={`mt-0.5 block truncate text-[11px] font-semibold leading-tight ${isActive ? "text-white/75" : "text-gray-400"}`}>
                      {tab.detail}
                    </span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${isActive ? "bg-white/20 text-white" : "bg-white text-gray-500"}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {message && (
        <div className="schedule-screen-only px-4 py-3 rounded-xl bg-orange-50 text-orange-700 border border-orange-100 text-sm">
          {message}
        </div>
      )}

      {activeTab === "tracker" ? (
        <TaskTrackerPanel
          tasks={sortedTasks}
          loading={isLoading}
          saving={saving}
          projectName={selectedProjectData?.name || "-"}
          onCreateTask={() => openNewTask("subtask")}
          onEditTask={openEditTask}
          onStatusChange={(task, status) => saveTaskPatch(task, { status }, "อัปเดตสถานะงานเรียบร้อยแล้ว")}
        />
      ) : activeTab === "plan" ? (
        <div className="schedule-screen-only bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-5 border-l-4 border-orange-600 bg-white flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">แผนงานโครงการ</h3>
              <p className="text-sm text-gray-500 mt-1">
                {selectedProjectData?.name || "-"} | {selectedProjectData?.client || "ไม่ระบุลูกค้า"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handlePrint("plan")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-semibold"
              >
                <Printer size={16} />
                Print
              </button>
              <button
                type="button"
                onClick={() => setQuickDateEdit((value) => !value)}
                className={`inline-flex items-center gap-2 px-4 py-2 border rounded-lg transition text-sm font-semibold ${quickDateEdit ? "bg-orange-50 border-orange-300 text-orange-700" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}
              >
                <CalendarClock size={16} />
                แก้วันที่เร็ว
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-5 bg-gray-50 border-y border-gray-100">
            <SummaryCard label="งานทั้งหมด" value={tasks.length} />
            <SummaryCard label="เสร็จแล้ว" value={stats.done} tone="green" />
            <SummaryCard label="กำลังดำเนินการ" value={stats.inProgress} tone="blue" />
            <SummaryCard label="ล่าช้า" value={stats.late} tone="red" />
            <SummaryCard label="ความคืบหน้ารวม" value={`${stats.average}%`} tone="orange" />
          </div>

          <div className="p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h4 className="font-bold text-gray-900">รายการงาน</h4>
              <p className="text-sm text-gray-500">
                {quickDateEdit ? "โหมดแก้วันที่เร็วเปิดอยู่: คลิก task เพื่อเลือกวันที่เริ่มและสิ้นสุด" : "เพิ่ม ลบ แก้ไขแผนงาน แล้วข้อมูลจะไปแสดงใน Gantt Chart อัตโนมัติ"}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="ค้นหางาน, ช่าง, ทีม..."
                  className="w-full sm:w-[300px] pl-9 pr-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-200 text-sm"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-200 text-sm"
              >
                <option value="ทั้งหมด">ทุกสถานะ ({tasks.length})</option>
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>{TASK_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-sm">
              <thead className="bg-[#1d1d1d] text-white">
                <tr className="bg-white text-gray-700">
                  <th colSpan={11} className="border-b border-gray-200 px-4 py-3 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openNewTask("heading")}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-orange-300 hover:text-orange-700"
                      >
                        <Plus size={15} />
                        เพิ่มงานหลัก
                      </button>
                      <button
                        type="button"
                        onClick={() => openNewTask("subtask")}
                        className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700"
                      >
                        <Plus size={15} />
                        เพิ่มงานย่อย
                      </button>
                      <span className="text-xs font-medium text-gray-400">
                        ใช้ปุ่ม + ในแถวงานหลักเพื่อเพิ่มงานย่อยใต้หัวข้อนั้นทันที
                      </span>
                    </div>
                  </th>
                </tr>
                <tr>
                  <th className="px-4 py-3 text-left w-36">ลำดับ</th>
                  <th className="px-4 py-3 text-left min-w-[250px]">ชื่องาน</th>
                  <th className="px-4 py-3 text-left">ช่าง/ผู้รับผิดชอบ</th>
                  <th className="px-4 py-3 text-left">เริ่ม</th>
                  <th className="px-4 py-3 text-left">สิ้นสุด</th>
                  <th className="px-4 py-3 text-center">วัน</th>
                  <th className="px-4 py-3 text-left">ความคืบหน้า</th>
                  <th className="px-4 py-3 text-left">สถานะ</th>
                  <th className="px-4 py-3 text-left">Priority</th>
                  <th className="px-4 py-3 text-left">หมายเหตุ</th>
                  <th className="px-4 py-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center text-gray-400">
                      <Loader2 className="inline animate-spin mr-2" size={18} />
                      กำลังโหลดแผนงาน...
                    </td>
                  </tr>
                ) : filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center text-gray-400">
                      ยังไม่มีรายการงานในโครงการนี้
                    </td>
                  </tr>
                ) : filteredTasks.map((task) => {
                  const taskOrder = sortedTasks.findIndex((item) => item.task_id === task.task_id) + 1;
                  const isHeading = isHeadingTask(task);
                  const parentTaskName = getParentTaskName(task, taskMap);
                  const outlineNumber = getTaskOutlineNumber(task, visibleTaskRows, sortedTasks);

                  if (isHeading) {
                    return (
                      <tr key={task.task_id} className="border-b border-gray-200">
                        <td colSpan={11} className="bg-slate-800 px-4 py-2 text-white">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleHeading(task.task_id);
                                }}
                                className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/10 text-white hover:bg-white/20"
                                title={task.is_collapsed ? "เปิดหัวข้อย่อย" : "ซ่อนหัวข้อย่อย"}
                                aria-label={task.is_collapsed ? "เปิดหัวข้อย่อย" : "ซ่อนหัวข้อย่อย"}
                              >
                                {task.is_collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                              </button>
                              <span className="w-8 shrink-0 text-right font-extrabold">{outlineNumber}</span>
                              <span className="truncate text-base font-extrabold">{task.name}</span>
                              <span className="rounded bg-white/15 px-2 py-0.5 text-xs font-bold">{task.summary_child_count || 0} งานย่อย</span>
                              <span className="text-xs font-semibold text-white/75">{formatDateShort(task.start)} - {formatDateShort(task.end)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openNewTask("subtask", task.task_id)}
                                className="inline-flex items-center gap-1 rounded-md bg-orange-500 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-orange-400"
                              >
                                <Plus size={14} />
                                งานย่อย
                              </button>
                              <button onClick={() => openEditTask(task)} className="rounded-md p-1.5 text-white/75 hover:bg-white/10 hover:text-white" title="แก้ไข">
                                <Edit3 size={15} />
                              </button>
                              <button onClick={() => setPendingDeleteTask(task)} className="rounded-md p-1.5 text-white/75 hover:bg-red-500 hover:text-white" title="ลบ">
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                  <tr
                    key={task.task_id}
                    onClick={() => quickDateEdit && openDateEditTask(task)}
                    className={`border-b border-gray-100 hover:bg-orange-50/30 ${quickDateEdit ? "cursor-pointer" : ""} ${isHeading ? "bg-gray-50" : ""}`}
                  >
                    <td className="px-4 py-4 text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            promptMoveTask(task);
                          }}
                          disabled={saving}
                          className="inline-flex min-w-14 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 font-semibold text-gray-700 hover:border-orange-300 hover:text-orange-700 disabled:opacity-50 ml-6"
                          title="คลิกเพื่อย้ายไปลำดับที่ต้องการ"
                        >
                          <GripVertical size={14} />
                          {outlineNumber}
                        </button>
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void moveTaskToPosition(task, taskOrder - 1);
                            }}
                            disabled={saving || taskOrder <= 1}
                            className="rounded text-gray-400 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-30"
                            title="ย้ายขึ้น"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void moveTaskToPosition(task, taskOrder + 1);
                            }}
                            disabled={saving || taskOrder >= sortedTasks.length}
                            className="rounded text-gray-400 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-30"
                            title="ย้ายลง"
                          >
                            <ArrowDown size={14} />
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className={`${isHeading ? "text-base font-extrabold" : "font-bold"} text-gray-900 flex items-center gap-2`}>
                        {isHeading && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleHeading(task.task_id);
                            }}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-orange-300 hover:text-orange-700"
                            title={task.is_collapsed ? "เปิดหัวข้อย่อย" : "ซ่อนหัวข้อย่อย"}
                            aria-label={task.is_collapsed ? "เปิดหัวข้อย่อย" : "ซ่อนหัวข้อย่อย"}
                          >
                            {task.is_collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                          </button>
                        )}
                        {!isHeading && <span className="mr-2 text-gray-300">└</span>}
                        {task.name}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                        <span>{task.task_id}</span>
                        {isHeading && <span>{task.summary_child_count || 0} งานย่อย</span>}
                        <span className={`rounded px-2 py-0.5 font-semibold ${isHeading ? "bg-gray-900 text-white" : "bg-orange-50 text-orange-700"}`}>
                          {isHeading ? "H1 หัวข้อหลัก" : "งานย่อย"}
                        </span>
                        {!isHeading && parentTaskName && <span>ใต้: {parentTaskName}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4">{task.assignee || "-"}</td>
                    <td className="px-4 py-4 font-semibold">{formatDateShort(task.start)}</td>
                    <td className="px-4 py-4 font-semibold">{formatDateShort(task.end)}</td>
                    <td className="px-4 py-4 text-center">{task.duration_days || daysBetween(task.start, task.end) || "-"}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-orange-600 rounded-full" style={{ width: `${clamp(Number(task.percent_done || 0))}%` }} />
                        </div>
                        <span className="text-xs font-bold text-orange-700">{task.percent_done || 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold">
                        {TASK_STATUS_LABELS[task.status || "To Do"]}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={task.priority === "สูง" ? "text-red-600 font-bold" : "text-gray-600"}>
                        {task.priority || "ปกติ"}
                      </span>
                    </td>
                    <td className="px-4 py-4 max-w-[220px] text-gray-500">{task.notes || "-"}</td>
                    <td className="px-4 py-4" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openEditTask(task)} className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg" title="แก้ไข">
                          <Edit3 size={16} />
                        </button>
                        <button onClick={() => setPendingDeleteTask(task)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="ลบ">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "gantt" ? (
        <div className="schedule-screen-only space-y-5">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">Gantt Chart</h3>
              <p className="text-sm text-gray-500 mt-1">
                {selectedProjectData?.name || "-"} - แผนภูมิแกนต์แสดงไทม์ไลน์งานจากตารางแผนงาน
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handlePrint("gantt")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-semibold"
              >
                <Printer size={16} />
                Print
              </button>
              <button
                type="button"
                onClick={() => setQuickDateEdit((value) => !value)}
                className={`inline-flex items-center gap-2 px-4 py-2 border rounded-lg transition text-sm font-semibold ${quickDateEdit ? "bg-orange-50 border-orange-300 text-orange-700" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}
              >
                <CalendarClock size={16} />
                แก้วันที่เร็ว
              </button>
              <button
                type="button"
                onClick={openNewMilestone}
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition text-sm font-semibold"
              >
                <Plus size={16} />
                เพิ่ม Milestone
              </button>
            </div>
          </div>

          <div className="space-y-5">
            <GanttPanel
              tasks={visibleTaskRows}
              milestones={sortedMilestones}
              timeline={timeline}
              todayLeft={todayLeft}
              loading={isLoading}
              onEditMilestone={openEditMilestone}
              onEditTaskDate={openDateEditTask}
              onToggleHeading={toggleHeading}
              quickDateEdit={quickDateEdit}
            />

            <aside className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <MilestonePanel milestones={sortedMilestones} onEdit={openEditMilestone} />
              <OverallStatus stats={stats} totalTasks={tasks.length} />
            </aside>
          </div>
        </div>
      ) : (
        <CustomerDecisionPanel
          decisions={decisions}
          highlightedDecisions={highlightedDecisions}
          currentPhase={currentDecisionPhase}
          lineInfo={decisionRes?.line}
          loading={decisionsLoading}
          saving={saving}
          onPhaseChange={setCurrentDecisionPhase}
          onCreate={openNewDecision}
          onEdit={openEditDecision}
          onDelete={deleteDecision}
          onNotifyLine={notifyDecisionLine}
          onIssuePdf={issueDecisionPdf}
        />
      )}

      <PlanPrintDocument
        active={printTarget === "plan"}
        project={selectedProjectData}
        tasks={visibleTaskRows}
        stats={stats}
      />
      <GanttPrintDocument
        active={printTarget === "gantt"}
        project={selectedProjectData}
        tasks={visibleTaskRows}
        milestones={sortedMilestones}
        timeline={timeline}
        stats={stats}
        todayLeft={todayLeft}
      />

      {showTaskForm && (
        <TaskModal
          form={taskForm}
          saving={saving}
          onClose={() => setShowTaskForm(false)}
          onDelete={taskForm.task_id || taskForm._rowIndex ? () => {
            const task = tasks.find((item) => (
              (taskForm.task_id && item.task_id === taskForm.task_id) ||
              (taskForm._rowIndex && item._rowIndex === taskForm._rowIndex)
            ));
            if (task) setPendingDeleteTask(task);
          } : undefined}
          onSubmit={saveTask}
          onChange={setTaskForm}
          parentOptions={headingTasks}
        />
      )}

      {dateEditTask && (
        <TaskDateModal
          task={dateEditTask}
          form={dateEditForm}
          saving={saving}
          onClose={() => setDateEditTask(null)}
          onSubmit={saveTaskDates}
          onChange={setDateEditForm}
        />
      )}

      {showMilestoneForm && (
        <MilestoneModal
          form={milestoneForm}
          saving={saving}
          onClose={() => setShowMilestoneForm(false)}
          onDelete={milestoneForm.milestone_id || milestoneForm._rowIndex ? () => setMilestoneDeleteOpen(true) : undefined}
          onSubmit={saveMilestone}
          onChange={setMilestoneForm}
        />
      )}

      {showDecisionForm && (
        <CustomerDecisionModal
          form={decisionForm}
          saving={saving}
          onClose={() => setShowDecisionForm(false)}
          onSubmit={saveDecision}
          onChange={setDecisionForm}
          evidenceFiles={decisionEvidenceFiles}
          onEvidenceFilesChange={setDecisionEvidenceFiles}
          existingEvidence={parseDecisionEvidence(decisions.find((decision) => decision.decision_id === decisionForm.decision_id)?.evidence_files_json)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteTask)}
        title="ลบงาน?"
        message={`ต้องการลบงาน "${pendingDeleteTask?.name || "-"}" หรือไม่`}
        confirmLabel="ลบ"
        cancelLabel="ยกเลิก"
        loading={saving}
        onConfirm={() => {
          if (pendingDeleteTask) void deleteTask(pendingDeleteTask);
        }}
        onCancel={() => setPendingDeleteTask(null)}
      />

      <ConfirmDialog
        open={milestoneDeleteOpen}
        title="ลบ Milestone?"
        message={`ต้องการลบ Milestone "${milestoneForm.title || "-"}" หรือไม่`}
        confirmLabel="ลบ"
        cancelLabel="ยกเลิก"
        loading={saving}
        onConfirm={() => {
          void deleteMilestone();
        }}
        onCancel={() => setMilestoneDeleteOpen(false)}
      />
    </section>
  );
}

function SummaryCard({ label, value, tone = "gray" }: { label: string; value: string | number; tone?: "gray" | "green" | "blue" | "red" | "orange" }) {
  const tones = {
    gray: "border-gray-200 text-gray-900",
    green: "border-green-200 text-green-700",
    blue: "border-blue-200 text-blue-700",
    red: "border-red-200 text-red-700",
    orange: "border-orange-200 text-orange-700",
  };

  return (
    <div className={`bg-white border rounded-xl px-4 py-3 ${tones[tone]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function GanttPanel({
  tasks,
  milestones,
  timeline,
  todayLeft,
  loading,
  onEditMilestone,
  onEditTaskDate,
  onToggleHeading,
  quickDateEdit = false,
}: {
  tasks: Task[];
  milestones: Milestone[];
  timeline: Timeline;
  todayLeft: number | null;
  loading: boolean;
  onEditMilestone: (milestone: Milestone) => void;
  onEditTaskDate?: (task: Task) => void;
  onToggleHeading?: (taskId: string) => void;
  quickDateEdit?: boolean;
}) {
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.task_id, task])), [tasks]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="gantt-panel-heading px-5 py-5 border-l-4 border-orange-600">
        <h3 className="text-2xl font-bold text-gray-900">แผนภูมิแกนต์ (Gantt Chart)</h3>
        <p className="text-sm text-gray-500 mt-1">ช่วงเวลา: {dateRangeLabel(timeline.start, timeline.end)}</p>
      </div>

      <div className="overflow-auto max-h-[620px] gantt-scroll">
        <div className="min-w-[1560px]">
          <div className="grid grid-cols-[300px_1fr] bg-[#1d1d1d] text-white sticky top-0 z-30">
            <div className="px-5 py-5 font-bold border-r border-white/10 flex items-end">ชื่องาน / ผู้รับผิดชอบ</div>
            <div className="relative h-[92px]">
              {timeline.monthGroups.map((month) => (
                <div
                  key={`${month.label}-${month.left}`}
                  className="absolute top-0 h-10 border-l border-white/10 text-center text-sm font-bold pt-3"
                  style={{ left: `${month.left}%`, width: `${month.width}%` }}
                >
                  {month.label}
                </div>
              ))}
              <div className="absolute left-0 right-0 bottom-0 h-[52px] border-t border-white/10">
                {timeline.dayTicks.map((tick) => (
                  <div
                    key={tick.key}
                    className="absolute top-0 h-full border-l border-white/10 px-1 pt-2 text-center text-[11px] text-gray-300"
                    style={{ left: `${tick.left}%` }}
                  >
                    <div>{new Intl.DateTimeFormat("th-TH", { weekday: "short" }).format(tick.date)}</div>
                    <div className="font-bold text-white">{tick.date.getDate()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative">
            <GanttOverlay timeline={timeline} milestones={milestones} todayLeft={todayLeft} onEditMilestone={onEditMilestone} />

            {loading ? (
              <div className="h-80 flex items-center justify-center text-gray-400">
                <Loader2 className="animate-spin mr-2" size={20} />
                กำลังโหลด Gantt Chart...
              </div>
            ) : tasks.length === 0 ? (
              <div className="h-80 grid place-items-center text-gray-400">ยังไม่มี task สำหรับโครงการนี้</div>
            ) : tasks.map((task) => {
              const taskStart = parseDate(task.start) || parseDate(task.end) || timeline.start;
              const taskEnd = parseDate(task.end) || taskStart;
              const left = percentBetween(taskStart, timeline.start, timeline.totalDays);
              const right = percentBetween(taskEnd, timeline.start, timeline.totalDays);
              const width = Math.max(1.2, right - left);
              const progress = clamp(Number(task.percent_done || 0));
              const isHeading = isHeadingTask(task);
              const color = getTaskCategoryColor(task, taskMap);
              const hasTaskDates = Boolean(parseDate(task.start) || parseDate(task.end));

              return (
                <div
                  key={task.task_id}
                  onClick={() => quickDateEdit && !isHeading && onEditTaskDate?.(task)}
                  className={`grid grid-cols-[300px_1fr] min-h-[60px] border-b border-gray-100 ${quickDateEdit && !isHeading ? "cursor-pointer hover:bg-orange-50/30" : ""} ${isHeading ? "bg-gray-50" : "gantt-child-row"}`}
                >
                  <div className={`px-5 py-3 bg-white border-r border-gray-100 flex items-center justify-between gap-3 ${isHeading ? "" : "pl-12"}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {isHeading && onToggleHeading && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleHeading(task.task_id);
                            }}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-orange-300 hover:text-orange-700"
                            title={task.is_collapsed ? "เปิดหัวข้อย่อย" : "ซ่อนหัวข้อย่อย"}
                            aria-label={task.is_collapsed ? "เปิดหัวข้อย่อย" : "ซ่อนหัวข้อย่อย"}
                          >
                            {task.is_collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                          </button>
                        )}
                        <span className={`gantt-category-dot ${isHeading ? "w-3 h-3 rounded-[3px]" : "w-2.5 h-2.5 rounded-full"}`} style={{ backgroundColor: isHeading ? "#111827" : color, borderColor: isHeading ? "#111827" : color }} />
                        <strong className={`${isHeading ? "text-base" : "text-sm"} text-gray-900 truncate`}>{task.name}</strong>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-5 text-xs text-gray-500">
                        <span>{isHeading ? "H1 หัวข้อหลัก" : task.assignee || "-"}</span>
                        {!isHeading && task.linked_vo_id && (
                          <span className="rounded-md bg-orange-50 px-1.5 py-0.5 font-extrabold text-orange-700">
                            {task.vo_badge || "VO"} · {task.linked_vo_id}
                          </span>
                        )}
                      </div>
                    </div>
                    {!isHeading && <span className="px-2 py-1 bg-red-50 text-red-600 rounded-md text-xs font-bold">{progress}%</span>}
                  </div>
                  <div className="relative bg-white">
                    {hasTaskDates ? (
                      <div
                        className={`gantt-task-bar absolute top-1/2 -translate-y-1/2 rounded-md text-white text-xs font-bold flex items-center px-3 overflow-hidden shadow-sm ${isHeading ? "h-5" : "h-8"}`}
                        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: isHeading ? "#111827" : color, borderColor: isHeading ? "#111827" : color, boxShadow: `inset 0 0 0 999px ${isHeading ? "#111827" : color}` }}
                        title={`${task.name}: ${formatDateShort(task.start)} - ${formatDateShort(task.end)}`}
                      >
                        {!isHeading && <span className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${progress}%` }} />}
                        <span className="relative truncate">{task.name}</span>
                      </div>
                    ) : (
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 rounded-md border border-dashed border-gray-200 px-3 py-1 text-xs font-semibold text-gray-400">
                        ยังไม่มีงานย่อย
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <GanttLegend />
    </div>
  );
}

function CustomerDecisionPanel({
  decisions,
  highlightedDecisions,
  currentPhase,
  lineInfo,
  loading,
  saving,
  onPhaseChange,
  onCreate,
  onEdit,
  onDelete,
  onNotifyLine,
  onIssuePdf,
}: {
  decisions: CustomerDecision[];
  highlightedDecisions: CustomerDecision[];
  currentPhase: string;
  lineInfo?: CustomerDecisionResponse["line"];
  loading: boolean;
  saving: boolean;
  onPhaseChange: (phase: string) => void;
  onCreate: () => void;
  onEdit: (decision: CustomerDecision) => void;
  onDelete: (decision: CustomerDecision) => void;
  onNotifyLine: (decision: CustomerDecision) => void;
  onIssuePdf: (decision: CustomerDecision) => void;
}) {
  const confirmedCount = decisions.filter((decision) => decision.decision_status === "ยืนยันแล้ว").length;
  const waitingCount = decisions.filter((decision) => ["ต้องยืนยัน", "รอลูกค้า", "ส่งแจ้งเตือนแล้ว"].includes(decision.decision_status || "")).length;
  const overdueCount = decisions.filter((decision) => decision.decision_status === "เลยจุดตัดสินใจ").length;

  return (
    <div className="schedule-screen-only space-y-5">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-l-4 border-orange-600 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">รายการต้องตัดสินใจ</h3>
              <p className="mt-1 text-sm text-gray-500">
                รายการเตือนลูกค้าและวิศวกรก่อนงานเดินไปถึงจุดที่เปลี่ยนยาก
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={currentPhase}
                onChange={(event) => onPhaseChange(event.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-orange-200"
              >
                {CUSTOMER_DECISION_PHASES.map((phase) => (
                  <option key={phase} value={phase}>{phase}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={onCreate}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700"
              >
                <Plus size={16} />
                เพิ่มรายการ
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-y border-gray-100 bg-gray-50 p-5 md:grid-cols-4">
          <SummaryCard label="ทั้งหมด" value={decisions.length} />
          <SummaryCard label="รอตัดสินใจ" value={waitingCount} tone="orange" />
          <SummaryCard label="ยืนยันแล้ว" value={confirmedCount} tone="green" />
          <SummaryCard label="เลยจุด" value={overdueCount} tone="red" />
        </div>

        <div className="p-5">
          <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 font-extrabold text-orange-800">
                  <Bell size={18} />
                  ช่วงงานปัจจุบัน: {currentPhase}
                </div>
                <p className="mt-1 text-sm font-medium text-orange-700">
                  รายการในช่วงนี้จะถูกดันขึ้นมาให้เห็นก่อน เพื่อกดแจ้งเตือนลูกค้าในกลุ่ม LINE ได้ทันที
                </p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-gray-500 shadow-sm">
                LINE: {lineInfo?.test_mode ? "โหมดทดสอบ" : "กลุ่มโครงการ"} {lineInfo?.target_group_id ? `(${lineInfo.target_group_id})` : ""}
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {loading ? (
                <div className="col-span-full rounded-xl border border-dashed border-orange-200 bg-white p-6 text-center text-sm text-orange-700">
                  <Loader2 className="mr-2 inline animate-spin" size={16} />
                  กำลังโหลดรายการ...
                </div>
              ) : highlightedDecisions.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-orange-200 bg-white p-6 text-center text-sm text-orange-700">
                  ไม่มีรายการที่ผูกกับช่วงงานนี้
                </div>
              ) : highlightedDecisions.map((decision) => (
                <DecisionCard
                  key={decision.decision_id}
                  decision={decision}
                  saving={saving}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onNotifyLine={onNotifyLine}
                  onIssuePdf={onIssuePdf}
                />
              ))}
            </div>
          </div>
        </div>

        <DecisionTable
          decisions={decisions}
          loading={loading}
          saving={saving}
          onEdit={onEdit}
          onDelete={onDelete}
          onNotifyLine={onNotifyLine}
          onIssuePdf={onIssuePdf}
        />
      </div>
    </div>
  );
}

function DecisionCard({
  decision,
  saving,
  onEdit,
  onDelete,
  onNotifyLine,
  onIssuePdf,
}: {
  decision: CustomerDecision;
  saving: boolean;
  onEdit: (decision: CustomerDecision) => void;
  onDelete: (decision: CustomerDecision) => void;
  onNotifyLine: (decision: CustomerDecision) => void;
  onIssuePdf: (decision: CustomerDecision) => void;
}) {
  const evidenceCount = parseDecisionEvidence(decision.evidence_files_json).length;

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:border-orange-200 hover:shadow-md">
      <div className="border-b border-gray-100 bg-gradient-to-r from-orange-50 to-white px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-orange-200 bg-white px-2.5 py-1 text-xs font-extrabold text-orange-700">
                {decision.phase || "-"}
              </span>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-extrabold ${getDecisionStatusClass(decision.decision_status)}`}>
                {decision.decision_status || "ยังไม่ถึงเวลา"}
              </span>
            </div>
            <h4 className="mt-3 text-lg font-extrabold leading-snug text-gray-950">{decision.title}</h4>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => onNotifyLine(decision)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-extrabold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            <Send size={14} />
            ส่ง LINE
          </button>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-gray-400">ต้องตัดสินใจก่อน</div>
            <div className="mt-1 text-sm font-bold text-gray-900">{decision.decision_before}</div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-gray-400">หลักฐาน / PDF</div>
            <div className="mt-1 text-sm font-bold text-gray-900">
              {evidenceCount} ไฟล์{decision.pdf_url ? ` / ${decision.document_no || "PDF ออกแล้ว"}` : ""}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-3 text-sm text-orange-900">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-orange-500">ผลถ้าเปลี่ยนหลังจากนี้</div>
          <div className="mt-1 font-semibold leading-relaxed">{decision.impact_if_changed}</div>
        </div>

        {decision.result_note || decision.notified_at ? (
          <div className="rounded-xl border border-gray-100 px-3 py-3 text-xs text-gray-500">
            {decision.result_note ? <div><strong className="text-gray-700">ผลตัดสินใจ:</strong> {decision.result_note}</div> : null}
            {decision.notified_at ? <div className="mt-1"><strong className="text-gray-700">แจ้งเตือนล่าสุด:</strong> {formatDateTime(decision.notified_at)}</div> : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={() => onEdit(decision)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">
            <Edit3 size={14} />
            แก้ไข/บันทึกผล
          </button>
          <button type="button" onClick={() => onIssuePdf(decision)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">
            <FileText size={14} />
            ออก PDF
          </button>
          {decision.pdf_url ? (
            <a href={String(decision.pdf_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">
              <ExternalLink size={14} />
              เปิด PDF
            </a>
          ) : null}
          <button type="button" onClick={() => onDelete(decision)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100">
            <Trash2 size={14} />
            ลบ
          </button>
        </div>
      </div>
    </article>
  );
}

function DecisionTable({
  decisions,
  loading,
  saving,
  onEdit,
  onDelete,
  onNotifyLine,
  onIssuePdf,
}: {
  decisions: CustomerDecision[];
  loading: boolean;
  saving: boolean;
  onEdit: (decision: CustomerDecision) => void;
  onDelete: (decision: CustomerDecision) => void;
  onNotifyLine: (decision: CustomerDecision) => void;
  onIssuePdf: (decision: CustomerDecision) => void;
}) {
  return (
    <div className="overflow-x-auto border-t border-gray-100">
      <table className="w-full min-w-[1080px] text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-100 text-sm text-gray-700">
          <tr>
            <th className="px-5 py-4 text-[15px] font-black leading-snug">ช่วงงาน / สถานะงาน</th>
            <th className="px-5 py-4 text-[15px] font-black leading-snug">รายการที่ต้องให้ลูกค้าตัดสินใจ</th>
            <th className="px-5 py-4 text-[15px] font-black leading-snug">ต้องตัดสินใจก่อน</th>
            <th className="px-5 py-4 text-[15px] font-black leading-snug">สถานะการตัดสินใจ</th>
            <th className="px-5 py-4 text-[15px] font-black leading-snug">ผลถ้าเปลี่ยนหลังจากนี้</th>
            <th className="px-5 py-4 text-center text-[15px] font-black leading-snug">จัดการ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading ? (
            <tr>
              <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                <Loader2 className="mr-2 inline animate-spin" size={16} />
                กำลังโหลดรายการ...
              </td>
            </tr>
          ) : decisions.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                ยังไม่มีรายการที่ลูกค้าต้องตัดสินใจ
              </td>
            </tr>
          ) : decisions.map((decision) => (
            <tr key={decision.decision_id} className="align-top hover:bg-orange-50/30">
              <td className="px-5 py-4 font-bold text-gray-900">{decision.phase}</td>
              <td className="px-5 py-4">
                <div className="font-extrabold text-gray-950">{decision.title}</div>
                {decision.result_note ? <div className="mt-1 text-xs text-gray-500">ผลตัดสินใจ: {decision.result_note}</div> : null}
                {decision.evidence_note ? <div className="mt-1 text-xs text-gray-500">หลักฐาน: {decision.evidence_note}</div> : null}
                <div className="mt-1 text-xs text-gray-400">ไฟล์แนบ {parseDecisionEvidence(decision.evidence_files_json).length} ไฟล์</div>
              </td>
              <td className="px-5 py-4 text-gray-700">{decision.decision_before}</td>
              <td className="px-5 py-4">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-extrabold ${getDecisionStatusClass(decision.decision_status)}`}>
                  {decision.decision_status || "ยังไม่ถึงเวลา"}
                </span>
              </td>
              <td className="px-5 py-4 text-gray-700">{decision.impact_if_changed}</td>
              <td className="px-5 py-4">
                <div className="flex items-center justify-center gap-2">
                  <button disabled={saving} onClick={() => onNotifyLine(decision)} className="rounded-lg bg-slate-950 p-2 text-white hover:bg-slate-800 disabled:opacity-60" title="ส่ง LINE">
                    <Send size={15} />
                  </button>
                  <button onClick={() => onEdit(decision)} className="rounded-lg p-2 text-gray-400 hover:bg-orange-50 hover:text-orange-600" title="แก้ไข">
                    <Edit3 size={15} />
                  </button>
                  <button disabled={saving} onClick={() => onIssuePdf(decision)} className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-60" title="ออก PDF">
                    <FileText size={15} />
                  </button>
                  {decision.pdf_url ? (
                    <a href={String(decision.pdf_url)} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600" title="เปิด PDF">
                      <ExternalLink size={15} />
                    </a>
                  ) : null}
                  <button onClick={() => onDelete(decision)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" title="ลบ">
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GanttOverlay({
  timeline,
  milestones,
  todayLeft,
  onEditMilestone,
}: {
  timeline: Timeline;
  milestones: Milestone[];
  todayLeft: number | null;
  onEditMilestone: (milestone: Milestone) => void;
}) {
  return (
    <div className="absolute inset-y-0 left-[300px] right-0 pointer-events-none">
      {timeline.dayTicks.map((tick) => (
        <div key={`grid-${tick.key}`} className="absolute top-0 bottom-0 border-l border-gray-100" style={{ left: `${tick.left}%` }} />
      ))}
      {todayLeft !== null && (
        <div className="absolute top-0 bottom-0 border-l-2 border-red-500 z-20" style={{ left: `${todayLeft}%` }}>
          <span className="absolute top-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
            TODAY LINE
          </span>
        </div>
      )}
      {milestones.map((milestone) => {
        const date = parseDate(milestone.date);
        if (!date) return null;
        const left = percentBetween(date, timeline.start, timeline.totalDays);
        return (
          <button
            key={milestone.milestone_id}
            type="button"
            onClick={() => onEditMilestone(milestone)}
            className="absolute top-0 bottom-0 w-0 border-l-2 border-dashed pointer-events-auto"
            style={{ left: `${left}%`, borderColor: milestone.color || "#f97316" }}
            title={milestone.title}
          >
            <span
              className="absolute top-12 -translate-x-1/2 rotate-45 w-3.5 h-3.5 rounded-[2px] shadow-sm"
              style={{ backgroundColor: milestone.color || "#f97316" }}
            />
          </button>
        );
      })}
    </div>
  );
}

function GanttLegend() {
  return (
    <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap gap-4 bg-white">
      {TASK_CATEGORIES.map((category) => (
      <span key={category} className="inline-flex items-center gap-2 text-xs text-gray-600">
          <span className="gantt-category-dot w-3 h-3 rounded" style={{ backgroundColor: CATEGORY_COLORS[category], borderColor: CATEGORY_COLORS[category] }} />
          {category}
        </span>
      ))}
      <span className="ml-auto inline-flex items-center gap-2 text-xs font-bold text-red-600">
        <span className="w-5 border-t-2 border-red-600" />
        TODAY LINE
      </span>
    </div>
  );
}

function TaskTrackerPanel({
  tasks,
  loading,
  saving,
  projectName,
  onCreateTask,
  onEditTask,
  onStatusChange,
}: {
  tasks: Task[];
  loading: boolean;
  saving: boolean;
  projectName: string;
  onCreateTask: () => void;
  onEditTask: (task: Task) => void;
  onStatusChange: (task: Task, status: string) => Promise<boolean>;
}) {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.task_id, task])), [tasks]);
  const trackerTasks = useMemo(() => tasks.filter((task) => !isHeadingTask(task)), [tasks]);

  const handleDragStart = (event: React.DragEvent, task: Task) => {
    setDraggedTask(task);
    event.dataTransfer.setData("text/plain", task.task_id);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (event: React.DragEvent, status: string) => {
    event.preventDefault();
    if (!draggedTask || draggedTask.status === status || saving) {
      setDraggedTask(null);
      return;
    }

    await onStatusChange(draggedTask, status);
    setDraggedTask(null);
  };

  return (
    <div className="schedule-screen-only bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-5 border-l-4 border-orange-600 bg-white flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-gray-900">ติดตามงานย่อย (Task Tracker)</h3>
          <p className="text-sm text-gray-500 mt-1">{projectName} - ลากการ์ดงานย่อยเพื่อเปลี่ยนสถานะงาน</p>
        </div>
        <button
          type="button"
          onClick={onCreateTask}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition text-sm font-semibold w-fit"
        >
          <Plus size={16} />
          เพิ่มงานใหม่
        </button>
      </div>

      <div className="p-5 bg-gray-50">
        {loading ? (
          <div className="h-[420px] flex items-center justify-center text-gray-400">
            <Loader2 className="animate-spin mr-2" size={20} />
            กำลังโหลด Task Tracker...
          </div>
        ) : (
          <div className="flex gap-5 overflow-x-auto pb-3 custom-scrollbar">
            {TASK_STATUSES.map((status) => {
              const columnTasks = trackerTasks.filter((task) => (task.status || "To Do") === status);
              const style = getTrackerColumnStyle(status);

              return (
                <section
                  key={status}
                  onDragOver={handleDragOver}
                  onDrop={(event) => handleDrop(event, status)}
                  className={`w-80 min-h-[520px] shrink-0 rounded-2xl border border-gray-200 ${style.surface} overflow-hidden`}
                >
                  <div className="h-14 px-4 bg-white border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                      <h4 className="font-bold text-gray-900">{status}</h4>
                    </div>
                    <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                      {columnTasks.length}
                    </span>
                  </div>

                  <div className="p-3 space-y-3">
                    {columnTasks.map((task) => {
                      const parentName = getParentTaskName(task, taskMap) || "ไม่ระบุหัวข้อหลัก";

                      return (
                        <article
                          key={task.task_id}
                          draggable={!saving}
                          onDragStart={(event) => handleDragStart(event, task)}
                          className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing hover:border-orange-300 transition"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${style.badge}`}>
                              {task.task_id}
                            </span>
                            <button
                              type="button"
                              onClick={() => onEditTask(task)}
                              className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg"
                              title="แก้ไขงาน"
                            >
                              <Edit3 size={15} />
                            </button>
                          </div>

                          <h5 className="mt-3 text-sm text-gray-900 line-clamp-2 font-bold">
                            {task.name}
                          </h5>

                          {task.linked_vo_id && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-md bg-orange-50 px-2 py-1 text-[11px] font-extrabold text-orange-700">
                                {task.vo_badge || "VO"}
                              </span>
                              <span className="truncate text-[11px] font-semibold text-gray-500">
                                {task.linked_vo_id}
                              </span>
                            </div>
                          )}

                          <div className="mt-3 space-y-2 text-xs text-gray-500">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="shrink-0 rounded-md bg-gray-100 px-2 py-1 font-semibold text-gray-600">
                                หัวข้อหลัก
                              </span>
                              <span className="truncate font-medium text-gray-700">{parentName}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="min-w-0 truncate">
                                <span className="font-semibold text-gray-600">ช่าง: </span>
                                {task.assignee || "-"}
                              </span>
                              {task.end && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-100 bg-gray-50 px-2 py-1">
                                  <CalendarDays size={12} />
                                  {formatDateShort(task.end)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-orange-600 rounded-full" style={{ width: `${clamp(Number(task.percent_done || 0))}%` }} />
                          </div>
                        </article>
                      );
                    })}

                    {columnTasks.length === 0 && (
                      <div className="h-28 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-400 text-sm bg-white/70">
                        ลากการ์ดมาวางที่นี่
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MilestonePanel({ milestones, onEdit }: { milestones: Milestone[]; onEdit: (milestone: Milestone) => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Flag size={18} className="text-orange-600" />
        <h3 className="font-bold text-gray-900">Milestones</h3>
      </div>

      {milestones.length === 0 ? (
        <div className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl p-4 text-center">
          ยังไม่มี Milestone
        </div>
      ) : (
        <div className="space-y-3">
          {milestones.map((milestone) => (
            <button
              key={milestone.milestone_id}
              onClick={() => onEdit(milestone)}
              className="w-full text-left p-3 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/40 transition group"
            >
              <div className="flex items-start gap-3">
                <span className="mt-1 w-3 h-3 rotate-45 rounded-[2px] shrink-0" style={{ backgroundColor: milestone.color || "#f97316" }} />
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{milestone.title}</div>
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                    <CalendarDays size={12} />
                    {formatDate(milestone.date)}
                  </div>
                  <div className="mt-2 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                    {milestone.type || "Milestone"}
                  </div>
                </div>
                <Edit3 size={14} className="ml-auto text-gray-300 group-hover:text-orange-500" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OverallStatus({ stats, totalTasks }: { stats: { done: number; average: number }; totalTasks: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      <h3 className="font-bold text-gray-900 mb-4">สถานะโดยรวม</h3>
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-gray-600">
            <CircleDot size={16} className="text-blue-500" />
            Progress เฉลี่ย
          </span>
          <strong>{stats.average}%</strong>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-orange-500" style={{ width: `${stats.average}%` }} />
        </div>
        <div className="flex items-center justify-between pt-2">
          <span className="flex items-center gap-2 text-gray-600">
            <CheckCircle2 size={16} className="text-green-600" />
            งานเสร็จแล้ว
          </span>
          <strong>{stats.done} / {totalTasks}</strong>
        </div>
      </div>
    </div>
  );
}

function TaskModal({
  form,
  saving,
  onClose,
  onDelete,
  onSubmit,
  onChange,
  parentOptions,
}: {
  form: TaskForm;
  saving: boolean;
  onClose: () => void;
  onDelete?: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onChange: React.Dispatch<React.SetStateAction<TaskForm>>;
  parentOptions: Task[];
}) {
  const availableParents = parentOptions.filter((task) => (
    task.task_id !== form.task_id && task._rowIndex !== form._rowIndex
  ));
  const isHeadingForm = form.task_type === "heading";
  const headingSelectValue = isHeadingForm && TASK_CATEGORIES.includes(form.name) ? form.name : CUSTOM_HEADING_VALUE;

  return (
    <div className="schedule-screen-only fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{form.task_id || form._rowIndex ? "แก้ไขแผนงาน" : "เพิ่มแผนงาน"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="ประเภทงาน">
              <select
                value={form.task_type}
                onChange={(event) => onChange((prev) => ({
                  ...prev,
                  task_type: event.target.value,
                  parent_task_id: event.target.value === "heading" ? "" : prev.parent_task_id,
                  name: event.target.value === "heading" ? (TASK_CATEGORIES.includes(prev.name) ? prev.name : TASK_CATEGORIES[0]) : (TASK_CATEGORIES.includes(prev.name) ? "" : prev.name),
                  category: event.target.value === "heading" ? (TASK_CATEGORIES.includes(prev.name) ? prev.name : TASK_CATEGORIES[0]) : "",
                }))}
                className="schedule-input"
              >
                {TASK_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </Field>
            {isHeadingForm ? (
              <Field label="หมวดงาน / H1">
                <select
                  value={headingSelectValue}
                  onChange={(event) => {
                    const value = event.target.value;
                    onChange((prev) => ({
                      ...prev,
                      name: value === CUSTOM_HEADING_VALUE ? "" : value,
                      category: value === CUSTOM_HEADING_VALUE ? "" : value,
                    }));
                  }}
                  className="schedule-input"
                >
                  {TASK_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                  <option value={CUSTOM_HEADING_VALUE}>อื่นๆ / กรอกเอง</option>
                </select>
              </Field>
            ) : (
              <Field label="อยู่ใต้ H1">
                <select
                  value={form.parent_task_id}
                  onChange={(event) => onChange((prev) => ({ ...prev, parent_task_id: event.target.value }))}
                  className="schedule-input"
                >
                  <option value="">ไม่ระบุ</option>
                  {availableParents.map((task) => <option key={task.task_id} value={task.task_id}>{task.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="ลำดับ">
              <input
                type="number"
                min="1"
                value={form.order_index}
                onChange={(event) => onChange((prev) => ({ ...prev, order_index: event.target.value }))}
                className="schedule-input"
              />
            </Field>
          </div>

          {(!isHeadingForm || headingSelectValue === CUSTOM_HEADING_VALUE) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{isHeadingForm ? "หัวข้อหลักอื่นๆ" : "ชื่องาน"}</label>
              <input
                autoFocus
                required
                value={form.name}
                onChange={(event) => onChange((prev) => ({ ...prev, name: event.target.value, category: isHeadingForm ? event.target.value : prev.category }))}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-200 outline-none"
                placeholder={isHeadingForm ? "เช่น งานภูมิทัศน์" : "เช่น งานติดตั้งวงกบไม้"}
              />
            </div>
          )}

          <div className={`${isHeadingForm ? "hidden" : "grid"} grid-cols-1 md:grid-cols-2 gap-4`}>
            <Field label="ช่าง/ผู้รับผิดชอบ">
              <input value={form.assignee} onChange={(event) => onChange((prev) => ({ ...prev, assignee: event.target.value }))} className="schedule-input" placeholder="เช่น ช.สม" />
            </Field>
            <Field label="Priority">
              <select value={form.priority} onChange={(event) => onChange((prev) => ({ ...prev, priority: event.target.value }))} className="schedule-input">
                <option value="ปกติ">ปกติ</option>
                <option value="กลาง">กลาง</option>
                <option value="สูง">สูง</option>
              </select>
            </Field>
          </div>

          {isHeadingForm && (
            <div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-orange-700">
              H1 เป็นหัวข้อหลักเท่านั้น วันที่ ระยะเวลา และความครบถ้วนจะคำนวณจากงานย่อยอัตโนมัติ
            </div>
          )}

          <div className={`${isHeadingForm ? "hidden" : "grid"} grid-cols-1 md:grid-cols-4 gap-4`}>
            <Field label="เริ่ม">
              <input type="date" value={form.planned_start || form.start} onChange={(event) => onChange((prev) => ({ ...prev, start: event.target.value, planned_start: event.target.value }))} className="schedule-input" />
            </Field>
            <Field label="สิ้นสุด">
              <input type="date" value={form.planned_end || form.end} onChange={(event) => onChange((prev) => ({ ...prev, end: event.target.value, planned_end: event.target.value }))} className="schedule-input" />
            </Field>
            <Field label="สถานะ">
              <select value={form.status} onChange={(event) => onChange((prev) => ({ ...prev, status: event.target.value }))} className="schedule-input">
                {TASK_STATUSES.map((status) => <option key={status} value={status}>{TASK_STATUS_LABELS[status]}</option>)}
              </select>
            </Field>
            <Field label="ความคืบหน้า (%)">
              <input type="number" min="0" max="100" value={form.percent_done} onChange={(event) => onChange((prev) => ({ ...prev, percent_done: event.target.value }))} className="schedule-input" />
            </Field>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <textarea
              value={form.notes}
              onChange={(event) => onChange((prev) => ({ ...prev, notes: event.target.value }))}
              className="w-full px-4 py-2 min-h-[92px] border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-200 outline-none resize-none"
              placeholder="ระบุเงื่อนไข วัสดุ หรือข้อควรระวัง"
            />
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {onDelete ? (
              <button type="button" onClick={onDelete} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition font-medium">
                <Trash2 size={16} />
                ลบ
              </button>
            ) : <div />}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition">ยกเลิก</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 disabled:opacity-70 transition">
                {saving && <Loader2 size={16} className="animate-spin" />}
                บันทึก
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskDateModal({
  task,
  form,
  saving,
  onClose,
  onSubmit,
  onChange,
}: {
  task: Task;
  form: TaskDateForm;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onChange: React.Dispatch<React.SetStateAction<TaskDateForm>>;
}) {
  return (
    <div className="schedule-screen-only fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">แก้ไขวันที่ task</h3>
            <p className="text-sm text-gray-500 mt-1">{task.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="วันที่เริ่ม">
              <input type="date" value={form.start} onChange={(event) => onChange((prev) => ({ ...prev, start: event.target.value }))} className="schedule-input" />
            </Field>
            <Field label="วันที่สิ้นสุด">
              <input type="date" value={form.end} onChange={(event) => onChange((prev) => ({ ...prev, end: event.target.value }))} className="schedule-input" />
            </Field>
          </div>

          <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
            ระยะเวลา: <strong>{daysBetween(form.start, form.end) || "-"} วัน</strong>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition">ยกเลิก</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 disabled:opacity-70 transition">
              {saving && <Loader2 size={16} className="animate-spin" />}
              บันทึกวันที่
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
    </label>
  );
}

function MilestoneModal({
  form,
  saving,
  onClose,
  onDelete,
  onSubmit,
  onChange,
}: {
  form: MilestoneForm;
  saving: boolean;
  onClose: () => void;
  onDelete?: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onChange: React.Dispatch<React.SetStateAction<MilestoneForm>>;
}) {
  return (
    <div className="schedule-screen-only fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{form.milestone_id || form._rowIndex ? "แก้ไข Milestone" : "เพิ่ม Milestone"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <Field label="ชื่อ Milestone">
            <input required value={form.title} onChange={(event) => onChange((prev) => ({ ...prev, title: event.target.value }))} className="schedule-input" placeholder="เช่น งวดที่ 1 งานฐานราก" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="วันที่">
              <input required type="date" value={form.date} onChange={(event) => onChange((prev) => ({ ...prev, date: event.target.value }))} className="schedule-input" />
            </Field>
            <Field label="ประเภท">
              <select value={form.type} onChange={(event) => onChange((prev) => ({ ...prev, type: event.target.value }))} className="schedule-input">
                {MILESTONE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </Field>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">สี</label>
            <div className="flex flex-wrap gap-2">
              {MILESTONE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onChange((prev) => ({ ...prev, color }))}
                  className={`w-9 h-9 rounded-full border-2 transition ${form.color === color ? "border-gray-900 scale-105" : "border-white"}`}
                  style={{ backgroundColor: color }}
                  aria-label={`เลือกสี ${color}`}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รายละเอียดเพิ่มเติม</label>
            <textarea value={form.notes} onChange={(event) => onChange((prev) => ({ ...prev, notes: event.target.value }))} className="w-full px-4 py-2 min-h-[92px] border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-200 outline-none resize-none" />
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {onDelete ? (
              <button type="button" onClick={onDelete} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition font-medium">
                <Trash2 size={16} />
                ลบ
              </button>
            ) : <div />}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition">ยกเลิก</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 disabled:opacity-70 transition">
                {saving && <Loader2 size={16} className="animate-spin" />}
                บันทึก
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function CustomerDecisionModal({
  form,
  saving,
  onClose,
  onSubmit,
  onChange,
  evidenceFiles,
  onEvidenceFilesChange,
  existingEvidence,
}: {
  form: CustomerDecisionForm;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onChange: React.Dispatch<React.SetStateAction<CustomerDecisionForm>>;
  evidenceFiles: File[];
  onEvidenceFilesChange: React.Dispatch<React.SetStateAction<File[]>>;
  existingEvidence: DecisionEvidenceFile[];
}) {
  return (
    <div className="schedule-screen-only fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{form.decision_id ? "แก้ไขรายการต้องตัดสินใจ" : "เพิ่มรายการต้องตัดสินใจ"}</h3>
            <p className="mt-1 text-sm text-gray-500">ใช้บันทึกว่าลูกค้าต้องยืนยันเรื่องใดก่อนผ่านช่วงงานนั้น</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="max-h-[calc(92vh-84px)] space-y-4 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="ช่วงงาน / สถานะงาน">
              <select value={form.phase} onChange={(event) => onChange((prev) => ({ ...prev, phase: event.target.value }))} className="schedule-input">
                {CUSTOMER_DECISION_PHASES.map((phase) => <option key={phase} value={phase}>{phase}</option>)}
              </select>
            </Field>
            <Field label="สถานะการตัดสินใจ">
              <select value={form.decision_status} onChange={(event) => onChange((prev) => ({ ...prev, decision_status: event.target.value }))} className="schedule-input">
                {CUSTOMER_DECISION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </Field>
            <Field label="ลำดับ">
              <input value={form.order_index} onChange={(event) => onChange((prev) => ({ ...prev, order_index: event.target.value }))} className="schedule-input" />
            </Field>
          </div>

          <Field label="รายการที่ต้องให้ลูกค้าตัดสินใจ">
            <input required value={form.title} onChange={(event) => onChange((prev) => ({ ...prev, title: event.target.value }))} className="schedule-input" />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="ต้องตัดสินใจก่อน">
              <input required value={form.decision_before} onChange={(event) => onChange((prev) => ({ ...prev, decision_before: event.target.value }))} className="schedule-input" />
            </Field>
            <Field label="ผลถ้าเปลี่ยนหลังจากนี้">
              <input required value={form.impact_if_changed} onChange={(event) => onChange((prev) => ({ ...prev, impact_if_changed: event.target.value }))} className="schedule-input" />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="ผู้ยืนยัน">
              <input value={form.decided_by} onChange={(event) => onChange((prev) => ({ ...prev, decided_by: event.target.value }))} className="schedule-input" placeholder="เช่น คุณกัน / คุณฝน" />
            </Field>
            <Field label="วันที่ยืนยัน">
              <input type="date" value={form.decided_at} onChange={(event) => onChange((prev) => ({ ...prev, decided_at: event.target.value }))} className="schedule-input" />
            </Field>
          </div>

          <Field label="ผลการตัดสินใจ / หมายเหตุ">
            <textarea value={form.result_note} onChange={(event) => onChange((prev) => ({ ...prev, result_note: event.target.value }))} className="min-h-[86px] w-full resize-none rounded-lg border border-gray-200 px-4 py-2 outline-none focus:ring-2 focus:ring-orange-200" />
          </Field>

          <Field label="หลักฐานอ้างอิง">
            <textarea value={form.evidence_note} onChange={(event) => onChange((prev) => ({ ...prev, evidence_note: event.target.value }))} className="min-h-[76px] w-full resize-none rounded-lg border border-gray-200 px-4 py-2 outline-none focus:ring-2 focus:ring-orange-200" placeholder="เช่น ลูกค้าตอบใน LINE วันที่..., แนบรูปตัวอย่าง, เลขเอกสาร..." />
          </Field>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-bold text-gray-900">แนบหลักฐาน</div>
                <p className="mt-1 text-xs font-medium text-gray-500">รองรับรูปภาพ แคปหน้าจอ LINE หรือไฟล์เอกสารประกอบ</p>
              </div>
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
                <Upload size={16} />
                เลือกไฟล์
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  className="sr-only"
                  onChange={(event) => {
                    const nextFiles = Array.from(event.target.files || []);
                    onEvidenceFilesChange((current) => [...current, ...nextFiles].slice(0, 10));
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>

            {existingEvidence.length > 0 ? (
              <div className="mt-4 rounded-lg bg-white p-3">
                <div className="text-xs font-extrabold text-gray-500">ไฟล์ที่แนบแล้ว</div>
                <div className="mt-2 grid gap-2">
                  {existingEvidence.map((file, index) => (
                    <a key={`${file.file_id || file.file_name}-${index}`} href={String(file.file_url || "#")} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50">
                      <span className="truncate font-semibold text-gray-700">{file.file_name || "หลักฐานอ้างอิง"}</span>
                      <ExternalLink size={14} className="shrink-0 text-gray-400" />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {evidenceFiles.length > 0 ? (
              <div className="mt-4 rounded-lg bg-white p-3">
                <div className="text-xs font-extrabold text-gray-500">ไฟล์ใหม่ที่จะอัปโหลด</div>
                <div className="mt-2 grid gap-2">
                  {evidenceFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm">
                      <span className="truncate font-semibold text-gray-700">{file.name}</span>
                      <button type="button" onClick={() => onEvidenceFilesChange((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-medium text-gray-600 transition hover:bg-gray-100">ยกเลิก</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 font-medium text-white transition hover:bg-orange-700 disabled:opacity-70">
              {saving && <Loader2 size={16} className="animate-spin" />}
              บันทึก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PrintHeader({ title, project }: { title: string; project?: Project }) {
  return (
    <div className="print-doc-header">
      <Image src="/logo.png" alt="Pichayamongkol Construction Co., Ltd." width={150} height={48} priority />
      <div>
        <h1>Pichayamongkol Construction Co., Ltd.</h1>
        <p>276/1 Soi Phuttha Bucha 36, Bang Mot, Thung Khru, Bangkok 10140</p>
        <strong>{title}</strong>
        <p>{project?.project_id || "-"} | {project?.name || "-"} | ลูกค้า: {project?.client || "-"}</p>
      </div>
    </div>
  );
}

function PrintMetaGrid({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="print-doc-meta-grid">
      {items.map((item) => (
        <div key={item.label} className="print-doc-meta-card">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function PlanPrintDocument({ active, project, tasks, stats }: { active: boolean; project?: Project; tasks: Task[]; stats: { average: number }; }) {
  const workTasks = tasks.filter((task) => !isHeadingTask(task));
  const headingCount = tasks.filter(isHeadingTask).length;
  const printedAt = new Intl.DateTimeFormat("th-TH", { dateStyle: "long" }).format(new Date());

  return (
    <div className={`schedule-print-doc plan-print-doc ${active ? "is-printing" : ""}`}>
      <PrintHeader title="Project Schedule / แผนงานโครงการ" project={project} />
      <PrintMetaGrid
        items={[
          { label: "วันที่พิมพ์", value: printedAt },
          { label: "หัวข้อหลัก", value: headingCount },
          { label: "งานย่อยที่แสดง", value: workTasks.length },
          { label: "ความครบถ้วนแผน", value: `${stats.average}%` },
        ]}
      />
      <table className="print-plan-table">
        <thead>
          <tr>
            <th>ลำดับ</th>
            <th>ชื่องาน</th>
            <th>ผู้รับผิดชอบ</th>
            <th>เริ่ม</th>
            <th>สิ้นสุด</th>
            <th>วัน</th>
            <th>Progress</th>
            <th>สถานะ</th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const isHeading = isHeadingTask(task);
            const outline = getTaskOutlineNumber(task, tasks, tasks);

            if (isHeading) {
              return (
                <tr key={task.task_id} className="print-heading-task">
                  <td>{outline}</td>
                  <td colSpan={8}>
                    <strong>{task.name}</strong>
                    <span>{task.summary_child_count || 0} งานย่อย | {formatDateShort(task.start)} - {formatDateShort(task.end)}</span>
                  </td>
                </tr>
              );
            }

            return (
              <tr key={task.task_id}>
                <td>{outline}</td>
                <td className="print-child-task-name">{task.name}</td>
                <td>{task.assignee || "-"}</td>
                <td>{formatDateShort(task.start)}</td>
                <td>{formatDateShort(task.end)}</td>
                <td>{task.duration_days || daysBetween(task.start, task.end) || "-"}</td>
                <td>{task.percent_done || 0}%</td>
                <td>{TASK_STATUS_LABELS[task.status || "To Do"]}</td>
                <td>{task.notes || "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <PrintSignatures />
    </div>
  );
}

function GanttPrintDocument({
  active,
  project,
  tasks,
  milestones,
  timeline,
  stats,
  todayLeft,
}: {
  active: boolean;
  project?: Project;
  tasks: Task[];
  milestones: Milestone[];
  timeline: Timeline;
  stats: { average: number };
  todayLeft: number | null;
}) {
  const workTasks = tasks.filter((task) => !isHeadingTask(task));

  return (
    <div className={`schedule-print-doc gantt-print-doc ${active ? "is-printing" : ""}`}>
      <PrintHeader title="Gantt Chart / แผนภูมิแกนต์" project={project} />
      <PrintMetaGrid
        items={[
          { label: "ช่วงเวลา", value: dateRangeLabel(timeline.start, timeline.end) },
          { label: "แถวที่แสดง", value: tasks.length },
          { label: "งานย่อยที่แสดง", value: workTasks.length },
          { label: "ความครบถ้วนแผน", value: `${stats.average}%` },
        ]}
      />
      <div className="print-gantt">
        <GanttPanel
          tasks={tasks}
          milestones={milestones}
          timeline={timeline}
          todayLeft={todayLeft}
          loading={false}
          onEditMilestone={() => undefined}
        />
      </div>
      <PrintSignatures />
    </div>
  );
}

function PrintSignatures() {
  return (
    <div className="print-signatures">
      <div>ผู้จัดทำ<br /><span>(........................................)</span></div>
      <div>ผู้ตรวจสอบ<br /><span>(........................................)</span></div>
      <div>ผู้อนุมัติ<br /><span>(........................................)</span></div>
    </div>
  );
}
