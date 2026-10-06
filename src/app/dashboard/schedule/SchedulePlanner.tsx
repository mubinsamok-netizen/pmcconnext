"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  CheckCircle2,
  ClipboardCheck,
  CircleDot,
  Download,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Flag,
  GripVertical,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  Printer,
  Search,
  Send,
  Share2,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { CUSTOMER_DECISION_PHASES, CUSTOMER_DECISION_STATUSES } from "@/lib/customerDecisions";
import { fetcher } from "@/lib/fetcher";
import { downloadScheduleWorkbook } from "@/lib/scheduleExcel";

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
  use_custom_phase: boolean;
  custom_phase: string;
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

type ScheduleTemplateCategory = {
  id: string;
  wbs: string;
  name: string;
  taskCount: number;
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

type TimelineFocusRange = {
  start: string;
  end: string;
};
type TaskPatch = Partial<Omit<Task, "task_id" | "project_id" | "_rowIndex">>;
type TaskDateForm = {
  start: string;
  end: string;
};
type CollapsedState = Record<string, Record<string, boolean>>;
type GanttPrintSegment = {
  start: Date;
  end: Date;
  index: number;
  total: number;
};

const TASK_STATUSES = ["To Do", "In Progress", "Review", "Done"];
const TASK_TYPES = [
  { value: "heading", label: "หัวข้อ / กลุ่มงาน" },
  { value: "subtask", label: "งานจริง" },
];

const TASK_STATUS_LABELS: Record<string, string> = {
  "To Do": "ยังไม่เริ่ม",
  "In Progress": "กำลังดำเนินการ",
  Review: "รอตรวจ",
  Done: "เสร็จแล้ว",
};

const TASK_STATUS_TONES: Record<string, { screen: string; print: string; svgFill: string; svgStroke: string }> = {
  "To Do": {
    screen: "bg-slate-100 text-slate-700",
    print: "print-status-todo",
    svgFill: "#f1f5f9",
    svgStroke: "#64748b",
  },
  "In Progress": {
    screen: "bg-blue-50 text-blue-700",
    print: "print-status-progress",
    svgFill: "#dbeafe",
    svgStroke: "#2563eb",
  },
  Review: {
    screen: "bg-amber-50 text-amber-700",
    print: "print-status-review",
    svgFill: "#fef3c7",
    svgStroke: "#d97706",
  },
  Done: {
    screen: "bg-emerald-50 text-emerald-700",
    print: "print-status-done",
    svgFill: "#dcfce7",
    svgStroke: "#16a34a",
  },
};

const STATUS_PROGRESS_PRESETS: Record<string, number> = {
  "To Do": 0,
  "In Progress": 50,
  Review: 95,
  Done: 100,
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
const PLAN_PRINT_ROWS_PER_PAGE = 28;
const GANTT_PRINT_ROWS_PER_PAGE = 20;
const GANTT_PRINT_SVG_WIDTH = 1500;
const GANTT_PRINT_LEFT_WIDTH = 410;
const GANTT_PRINT_CHART_WIDTH = GANTT_PRINT_SVG_WIDTH - GANTT_PRINT_LEFT_WIDTH - 28;
const GANTT_PRINT_HEADER_HEIGHT = 86;
const GANTT_PRINT_ROW_HEIGHT = 34;
const DECISION_SAVE_TIMEOUT_MS = 25000;
const DECISION_EVIDENCE_UPLOAD_TIMEOUT_MS = 90000;
const DECISION_EVIDENCE_MAX_FILE_SIZE = 10 * 1024 * 1024;
const DECISION_EVIDENCE_MAX_TOTAL_SIZE = 25 * 1024 * 1024;

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
  use_custom_phase: false,
  custom_phase: "",
  title: "",
  decision_before: "",
  decision_status: "ต้องยืนยัน",
  impact_if_changed: "",
  result_note: "",
  evidence_note: "",
  decided_at: "",
  decided_by: "",
  order_index: "",
};

const AUTO_CATEGORY_COLORS = ["#ea580c", "#2563eb", "#0f766e", "#7c3aed", "#be123c", "#4d7c0f", "#0369a1"];

const CUSTOM_DECISION_PHASE_VALUE = "__custom_decision_phase__";

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

function diffDays(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function maxDate(a: Date, b: Date) {
  return a > b ? a : b;
}

function minDate(a: Date, b: Date) {
  return a < b ? a : b;
}

function chunkList<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks.length ? chunks : [[]];
}

function chunkPlanPrintRows(tasks: Task[], size: number) {
  const chunks = chunkList(tasks, size).filter((chunk) => chunk.length > 0);
  if (!chunks.length) return [[]];
  for (let index = 0; index < chunks.length - 1; index += 1) {
    const chunk = chunks[index];
    const lastTask = chunk[chunk.length - 1];
    if (lastTask && isHeadingTask(lastTask)) {
      chunks[index + 1] = [lastTask, ...chunks[index + 1]];
      chunk.pop();
    }
  }
  return chunks.filter((chunk) => chunk.length > 0);
}

function truncateText(value: string | undefined, maxLength: number) {
  const text = value || "-";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function buildGanttPrintSegments(timeline: Timeline): GanttPrintSegment[] {
  return [{ start: timeline.start, end: timeline.end, index: 1, total: 1 }];
}

function buildGanttPrintTicks(segment: GanttPrintSegment) {
  const totalDays = Math.max(1, diffDays(segment.start, segment.end) + 1);
  const step = totalDays <= 35 ? 3 : 7;
  const ticks = [];
  for (let day = 0; day < totalDays; day += step) {
    ticks.push(addDays(segment.start, day));
  }
  const lastTick = ticks[ticks.length - 1] || segment.start;
  if (diffDays(lastTick, segment.end) >= 6) ticks.push(segment.end);
  return ticks;
}

function buildGanttPrintMonthMarkers(segment: GanttPrintSegment) {
  const markers: Date[] = [];
  const cursor = new Date(segment.start.getFullYear(), segment.start.getMonth(), 1, 12);
  if (cursor < segment.start) cursor.setMonth(cursor.getMonth() + 1);
  while (cursor <= segment.end) {
    markers.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return markers;
}

function daysBetween(start?: string, end?: string) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) return "";
  return String(Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1));
}

function getInitialTab(tab?: string | null): ActiveTab {
  if (tab === "gantt") return "plan";
  return tab === "tracker" || tab === "plan" || tab === "decisions" ? tab : "plan";
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

function hasTaskScheduleDates(task: Pick<Task, "start" | "end">) {
  return Boolean(parseDate(task.start) || parseDate(task.end));
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max);
}

function normalizeProgressValue(value: string | number | undefined) {
  const parsed = Number(value);
  return String(Math.round(clamp(Number.isFinite(parsed) ? parsed : 0)));
}

function getStatusForProgress(value: string | number | undefined) {
  const progress = Number(normalizeProgressValue(value));
  if (progress <= 0) return "To Do";
  if (progress >= 100) return "Done";
  return "In Progress";
}

function getProgressForStatus(status: string, currentProgress?: string | number) {
  if (status === "In Progress") {
    const progress = Number(normalizeProgressValue(currentProgress));
    if (progress > 0 && progress < 100) return String(progress);
  }

  return String(STATUS_PROGRESS_PRESETS[status] ?? 0);
}

function buildTaskProgressPatch(progress: string | number | undefined): TaskPatch {
  const percentDone = normalizeProgressValue(progress);
  return {
    percent_done: percentDone,
    status: getStatusForProgress(percentDone),
  };
}

function buildTaskStatusPatch(status: string, currentProgress?: string | number): TaskPatch {
  const percentDone = getProgressForStatus(status, currentProgress);
  return {
    status,
    percent_done: percentDone,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง";
}

function percentBetween(date: Date, start: Date, totalDays: number) {
  const diff = date.getTime() - start.getTime();
  return clamp((diff / (totalDays * 86400000)) * 100);
}

function buildTimelineForRange(start: Date, end: Date): Timeline {
  const rangeStart = start <= end ? start : end;
  const rangeEnd = end >= start ? end : start;
  const totalDays = Math.max(1, diffDays(rangeStart, rangeEnd));
  const dayStep = totalDays <= 14 ? 1 : totalDays <= 45 ? 3 : totalDays <= 120 ? 7 : totalDays <= 240 ? 14 : 30;
  const dayTicks = [];

  for (let day = 0; day <= totalDays; day += dayStep) {
    const current = addDays(rangeStart, day);
    dayTicks.push({
      key: toInputDate(current),
      date: current,
      left: percentBetween(current, rangeStart, totalDays),
    });
  }

  if (toInputDate(dayTicks[dayTicks.length - 1]?.date || rangeStart) !== toInputDate(rangeEnd)) {
    dayTicks.push({
      key: toInputDate(rangeEnd),
      date: rangeEnd,
      left: 100,
    });
  }

  const monthGroups: { label: string; left: number; width: number }[] = [];
  const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1, 12);
  while (cursor <= rangeEnd) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12);
    const visibleStart = monthStart < rangeStart ? rangeStart : monthStart;
    const visibleEnd = monthEnd > rangeEnd ? rangeEnd : monthEnd;
    const left = percentBetween(visibleStart, rangeStart, totalDays);
    const right = percentBetween(visibleEnd, rangeStart, totalDays);
    monthGroups.push({
      label: new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(monthStart),
      left,
      width: Math.max(3, right - left),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return { start: rangeStart, end: rangeEnd, totalDays, dayTicks, monthGroups };
}

function normalizeTask(task: Task, index: number): Task {
  const start = task.start || task.planned_start || "";
  const end = task.end || task.planned_end || "";
  const fallbackCategory = TASK_CATEGORIES[TASK_CATEGORIES.length - 1];
  const normalizedProgress = normalizeProgressValue(task.percent_done);
  const normalizedStatus = task.status || getStatusForProgress(normalizedProgress);
  const progressPatch = normalizedStatus === "In Progress"
    ? buildTaskProgressPatch(normalizedProgress)
    : buildTaskStatusPatch(normalizedStatus, normalizedProgress);
  return {
    ...task,
    start,
    end,
    status: progressPatch.status || "To Do",
    percent_done: progressPatch.percent_done || "0",
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

function getTaskDepth(task: Task, taskMap: Map<string, Task>) {
  let depth = 0;
  let parentId = task.parent_task_id || "";
  const seen = new Set<string>([task.task_id]);

  while (parentId && !seen.has(parentId)) {
    const parent = taskMap.get(parentId);
    if (!parent) break;
    depth += 1;
    seen.add(parentId);
    parentId = parent.parent_task_id || "";
  }

  return depth;
}

function getTaskLevelLabel(task: Task, taskMap: Map<string, Task>) {
  const level = getTaskDepth(task, taskMap) + 1;
  return isHeadingTask(task) ? `H${level} กลุ่มงาน` : `H${level} งาน`;
}

function getHeadingDisplay(depth: number) {
  if (depth === 0) {
    return {
      row: "bg-slate-900 text-white",
      border: "border-slate-800",
      toggle: "border border-white/20 bg-white/10 text-white hover:bg-white/20",
      badge: "bg-white/15 text-white",
      meta: "text-white/75",
      secondaryButton: "bg-white/10 text-white hover:bg-white/20",
      editButton: "text-white/75 hover:bg-white/10 hover:text-white",
      deleteButton: "text-white/75 hover:bg-red-500 hover:text-white",
    };
  }

  if (depth === 1) {
    return {
      row: "bg-amber-50 text-slate-950",
      border: "border-amber-200",
      toggle: "border border-amber-300 bg-white text-amber-800 hover:bg-amber-100",
      badge: "bg-amber-100 text-amber-900",
      meta: "text-amber-800",
      secondaryButton: "bg-amber-100 text-amber-900 hover:bg-amber-200",
      editButton: "text-slate-500 hover:bg-amber-100 hover:text-amber-800",
      deleteButton: "text-slate-500 hover:bg-red-50 hover:text-red-600",
    };
  }

  return {
    row: "bg-white text-slate-950",
    border: "border-slate-200",
    toggle: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
    badge: "bg-slate-100 text-slate-700",
    meta: "text-slate-500",
    secondaryButton: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    editButton: "text-slate-400 hover:bg-orange-50 hover:text-orange-600",
    deleteButton: "text-slate-400 hover:bg-red-50 hover:text-red-600",
  };
}

function getGanttHeadingTone(depth: number) {
  if (depth === 0) {
    return {
      row: "border-slate-800",
      left: "border-slate-800 bg-slate-900 text-white",
      chart: "bg-slate-950",
      dot: "#f97316",
      meta: "text-white/70",
      bar: "#f97316",
      barText: "#ffffff",
    };
  }

  if (depth === 1) {
    return {
      row: "border-amber-200",
      left: "border-amber-200 bg-amber-50 text-slate-950",
      chart: "bg-amber-50/45",
      dot: "#f59e0b",
      meta: "text-amber-800",
      bar: "#f59e0b",
      barText: "#111827",
    };
  }

  return {
    row: "border-slate-200",
    left: "border-slate-200 bg-white text-slate-950",
    chart: "bg-white",
    dot: "#64748b",
    meta: "text-slate-500",
    bar: "#64748b",
    barText: "#ffffff",
  };
}

function getDescendantTasks(parentTask: Task, tasks: Task[]) {
  const childrenByParent = new Map<string, Task[]>();
  tasks.forEach((task) => {
    if (!task.parent_task_id) return;
    const current = childrenByParent.get(task.parent_task_id) || [];
    current.push(task);
    childrenByParent.set(task.parent_task_id, current);
  });

  const descendants: Task[] = [];
  const visit = (taskId: string) => {
    const children = childrenByParent.get(taskId) || [];
    children.forEach((child) => {
      descendants.push(child);
      visit(child.task_id);
    });
  };

  visit(parentTask.task_id);
  return descendants;
}

function getParentTaskName(task: Task, taskMap: Map<string, Task>) {
  if (!task.parent_task_id) return "";
  return taskMap.get(task.parent_task_id)?.name || "";
}

function getTaskCategoryName(task: Task, taskMap: Map<string, Task>) {
  let rootTask = task;
  const seen = new Set<string>();

  while (rootTask.parent_task_id && !seen.has(rootTask.task_id)) {
    seen.add(rootTask.task_id);
    const parent = taskMap.get(rootTask.parent_task_id);
    if (!parent) break;
    rootTask = parent;
  }

  if (rootTask.task_id !== task.task_id || isHeadingTask(rootTask)) {
    return rootTask.name || rootTask.category || task.category || "";
  }

  return task.category || task.name || "";
}

function getTaskCategoryColor(task: Task, taskMap: Map<string, Task>) {
  const categoryName = getTaskCategoryName(task, taskMap);
  if (CATEGORY_COLORS[categoryName]) return CATEGORY_COLORS[categoryName];
  const hash = Array.from(categoryName || task.task_id).reduce(
    (value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0,
    0
  );
  return AUTO_CATEGORY_COLORS[hash % AUTO_CATEGORY_COLORS.length];
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

function getHeadingSummaryTask(heading: Task, descendants: Task[], collapsed: boolean): Task {
  const workDescendants = descendants.filter((child) => !isHeadingTask(child));
  const childDates = workDescendants
    .flatMap((child) => [parseDate(child.start), parseDate(child.end)])
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());
  const progressSum = workDescendants.reduce((sum, child) => sum + clamp(Number(child.percent_done || 0)), 0);
  const start = childDates[0] ? toInputDate(childDates[0]) : "";
  const end = childDates[childDates.length - 1] ? toInputDate(childDates[childDates.length - 1]) : "";
  const planPercent = workDescendants.length ? Math.round(progressSum / workDescendants.length) : 0;

  return {
    ...heading,
    start,
    end,
    planned_start: start,
    planned_end: end,
    duration_days: daysBetween(start, end),
    percent_done: String(planPercent),
    summary_child_count: workDescendants.length,
    is_collapsed: collapsed,
  };
}

function buildTaskRows(tasks: Task[], collapsedHeadings: Record<string, boolean>) {
  const sorted = sortTaskList(tasks);
  const taskIds = new Set(sorted.map((task) => task.task_id));
  const taskMap = new Map(sorted.map((task) => [task.task_id, task]));
  const childrenByParent = new Map<string, Task[]>();

  sorted.forEach((task) => {
    if (!task.parent_task_id || !taskIds.has(task.parent_task_id)) return;
    const current = childrenByParent.get(task.parent_task_id) || [];
    current.push(task);
    childrenByParent.set(task.parent_task_id, current);
  });

  const ordered: Task[] = [];
  const descendantsCache = new Map<string, Task[]>();
  const collecting = new Set<string>();

  const collectDescendants = (task: Task): Task[] => {
    const cached = descendantsCache.get(task.task_id);
    if (cached) return cached;
    if (collecting.has(task.task_id)) return [];
    collecting.add(task.task_id);
    const descendants = (childrenByParent.get(task.task_id) || []).flatMap((child) => [child, ...collectDescendants(child)]);
    collecting.delete(task.task_id);
    descendantsCache.set(task.task_id, descendants);
    return descendants;
  };

  const visited = new Set<string>();
  const visit = (task: Task) => {
    if (visited.has(task.task_id)) return;
    visited.add(task.task_id);
    const hasChildren = Boolean((childrenByParent.get(task.task_id) || []).length);
    if (isHeadingTask(task) || hasChildren) {
      const collapsed = Boolean(collapsedHeadings[task.task_id]);
      ordered.push(getHeadingSummaryTask({ ...task, task_type: "heading" }, collectDescendants(task), collapsed));
      if (!collapsed) {
        (childrenByParent.get(task.task_id) || []).forEach(visit);
      }
      return;
    }

    ordered.push(task);
    (childrenByParent.get(task.task_id) || []).forEach(visit);
  };

  sorted.forEach((task) => {
    if (!task.parent_task_id || !taskIds.has(task.parent_task_id)) {
      visit(task);
    }
  });
  sorted.forEach((task) => {
    if (visited.has(task.task_id)) return;

    let parentId = task.parent_task_id || "";
    const seen = new Set<string>();
    let hiddenByCollapsedAncestor = false;
    while (parentId && !seen.has(parentId)) {
      if (visited.has(parentId)) {
        hiddenByCollapsedAncestor = true;
        break;
      }
      seen.add(parentId);
      parentId = taskMap.get(parentId)?.parent_task_id || "";
    }

    if (!hiddenByCollapsedAncestor) visit(task);
  });

  return ordered;
}

function getTaskOutlineNumber(task: Task, visibleRows: Task[], allRows: Task[]) {
  const rows = sortTaskList(allRows.length ? allRows : visibleRows);
  const taskIds = new Set(rows.map((item) => item.task_id));
  const childrenByParent = new Map<string, Task[]>();

  rows.forEach((item) => {
    if (!item.parent_task_id || !taskIds.has(item.parent_task_id)) return;
    const current = childrenByParent.get(item.parent_task_id) || [];
    current.push(item);
    childrenByParent.set(item.parent_task_id, current);
  });

  const findPath = (items: Task[], prefix: number[] = [], seen = new Set<string>()): number[] | null => {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (seen.has(item.task_id)) continue;
      const path = [...prefix, index + 1];
      if (item.task_id === task.task_id) return path;
      const nextSeen = new Set(seen);
      nextSeen.add(item.task_id);
      const childPath = findPath(childrenByParent.get(item.task_id) || [], path, nextSeen);
      if (childPath) return childPath;
    }

    return null;
  };

  const roots = rows.filter((item) => !item.parent_task_id || !taskIds.has(item.parent_task_id));
  const path = findPath(roots);
  if (path) return path.join(".");

  const visibleIndex = visibleRows.findIndex((item) => item.task_id === task.task_id);
  if (visibleIndex >= 0) {
    return String(visibleIndex + 1);
  }

  return String(getTaskOrder(task));
}

function dateRangeLabel(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", year: "numeric" });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function getTrackerColumnStyle(status: string) {
  return TRACKER_COLUMN_STYLES[status] || TRACKER_COLUMN_STYLES["To Do"];
}

function getTaskStatusTone(status?: string) {
  return TASK_STATUS_TONES[status || "To Do"] || TASK_STATUS_TONES["To Do"];
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

function validateDecisionEvidenceFiles(files: File[]) {
  const oversized = files.find((file) => file.size > DECISION_EVIDENCE_MAX_FILE_SIZE);
  if (oversized) {
    throw new Error(`ไฟล์ "${oversized.name}" ใหญ่เกิน 10 MB กรุณาลดขนาดไฟล์ก่อนแนบ`);
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > DECISION_EVIDENCE_MAX_TOTAL_SIZE) {
    throw new Error("ไฟล์แนบรวมกันใหญ่เกิน 25 MB กรุณาแนบทีละน้อยเพื่อให้ระบบอัปโหลดได้เสถียร");
  }
}

async function postDecisionJson(projectId: string, body: Record<string, unknown>, timeoutMs: number, timeoutMessage: string) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`/api/sites/${encodeURIComponent(projectId)}/customer-decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || "Failed to save customer decision");
    }
    return json;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export default function SchedulePlanner({ projects, showPageHeader = false }: { projects: Project[]; showPageHeader?: boolean }) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => getInitialTab(searchParams.get("tab")));
  const [selectedProject, setSelectedProject] = useState(projects[0]?.project_id || "");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ทั้งหมด");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [showScheduleTemplateModal, setShowScheduleTemplateModal] = useState(false);
  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTaskForm);
  const [milestoneForm, setMilestoneForm] = useState<MilestoneForm>(emptyMilestoneForm);
  const [decisionForm, setDecisionForm] = useState<CustomerDecisionForm>(emptyDecisionForm);
  const [selectedTemplateCategoryIds, setSelectedTemplateCategoryIds] = useState<string[]>([]);
  const [decisionEvidenceFiles, setDecisionEvidenceFiles] = useState<File[]>([]);
  const [currentDecisionPhase, setCurrentDecisionPhase] = useState<string>("โครงสร้าง");
  const [saving, setSaving] = useState(false);
  const [importingScheduleTemplate, setImportingScheduleTemplate] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [message, setMessage] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [printTarget, setPrintTarget] = useState<PrintTarget>(null);
  const [quickDateEdit, setQuickDateEdit] = useState(false);
  const [ganttDatedOnly, setGanttDatedOnly] = useState(false);
  const [ganttExpanded, setGanttExpanded] = useState(false);
  const [ganttFocusRange, setGanttFocusRange] = useState<TimelineFocusRange | null>(null);
  const [dateEditTask, setDateEditTask] = useState<Task | null>(null);
  const [dateEditForm, setDateEditForm] = useState<TaskDateForm>({ start: "", end: "" });
  const [collapsedByProject, setCollapsedByProject] = useState<CollapsedState>(readCollapsedState);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<Task | null>(null);
  const [planDragTask, setPlanDragTask] = useState<Task | null>(null);
  const [milestoneDeleteOpen, setMilestoneDeleteOpen] = useState(false);
  const planDragRef = useRef<{ task: Task; startX: number; startY: number; dragging: boolean } | null>(null);
  const suppressPlanDragClickRef = useRef(false);

  useEffect(() => {
    const handleAfterPrint = () => setPrintTarget(null);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  const selectedProjectData = projects.find((project) => project.project_id === selectedProject);
  const taskKey = selectedProject ? `/api/tasks?project_id=${selectedProject}` : null;
  const milestoneKey = selectedProject ? `/api/milestones?project_id=${selectedProject}` : null;
  const decisionKey = selectedProject && activeTab === "decisions" ? `/api/sites/${encodeURIComponent(selectedProject)}/customer-decisions` : null;
  const scheduleTemplateKey = showScheduleTemplateModal ? "/api/tasks/template" : null;

  const { data: taskRes, isLoading: tasksLoading, mutate: mutateTasks } = useSWR<ApiListResponse<Task>>(taskKey, fetcher);
  const { data: milestoneRes, isLoading: milestonesLoading, mutate: mutateMilestones } = useSWR<ApiListResponse<Milestone>>(milestoneKey, fetcher);
  const { data: decisionRes, isLoading: decisionsLoading, mutate: mutateDecisions } = useSWR<CustomerDecisionResponse>(decisionKey, fetcher);
  const { data: scheduleTemplateRes, isLoading: scheduleTemplateLoading } = useSWR<ApiListResponse<ScheduleTemplateCategory>>(scheduleTemplateKey, fetcher);

  const tasks = useMemo(() => (taskRes?.data ?? []).map(normalizeTask), [taskRes?.data]);
  const milestones = useMemo(() => milestoneRes?.data ?? [], [milestoneRes?.data]);
  const decisions = useMemo(() => decisionRes?.data ?? [], [decisionRes?.data]);
  const scheduleTemplateCategories = useMemo(() => scheduleTemplateRes?.data ?? [], [scheduleTemplateRes?.data]);
  const collapsedHeadings = useMemo(() => collapsedByProject[selectedProject] || {}, [collapsedByProject, selectedProject]);

  const sortedTasks = useMemo(() => sortTaskList(tasks), [tasks]);
  const visibleTaskRows = useMemo(() => buildTaskRows(tasks, collapsedHeadings), [collapsedHeadings, tasks]);
  const ganttTaskRows = useMemo(() => {
    return ganttDatedOnly ? visibleTaskRows.filter(hasTaskScheduleDates) : visibleTaskRows;
  }, [ganttDatedOnly, visibleTaskRows]);
  const datedGanttTaskCount = useMemo(() => visibleTaskRows.filter(hasTaskScheduleDates).length, [visibleTaskRows]);

  const taskMap = useMemo(() => new Map(sortedTasks.map((task) => [task.task_id, task])), [sortedTasks]);
  const parentTaskOptions = useMemo(() => sortedTasks, [sortedTasks]);
  const taskIdsWithChildren = useMemo(() => {
    const ids = new Set<string>();
    sortedTasks.forEach((task) => {
      if (task.parent_task_id) ids.add(task.parent_task_id);
    });
    return ids;
  }, [sortedTasks]);
  const leafTasks = useMemo(() => {
    return tasks.filter((task) => !isHeadingTask(task) && !taskIdsWithChildren.has(task.task_id));
  }, [taskIdsWithChildren, tasks]);
  const descendantTasksById = useMemo(() => {
    return new Map(sortedTasks.map((task) => [task.task_id, getDescendantTasks(task, sortedTasks)]));
  }, [sortedTasks]);

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
    ganttTaskRows.forEach((task) => {
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
    return buildTimelineForRange(paddedStart, paddedEnd);
  }, [ganttTaskRows, selectedProjectData?.end_date, selectedProjectData?.start_date, sortedMilestones]);

  const displayedTimeline = useMemo(() => {
    if (!ganttFocusRange) return timeline;
    const start = parseDate(ganttFocusRange.start);
    const end = parseDate(ganttFocusRange.end);
    return start && end ? buildTimelineForRange(start, end) : timeline;
  }, [ganttFocusRange, timeline]);

  const stats = useMemo(() => {
    const workTasks = leafTasks;
    const done = workTasks.filter((task) => task.status === "Done").length;
    const inProgress = workTasks.filter((task) => task.status === "In Progress").length;
    const late = workTasks.filter((task) => {
      const end = parseDate(task.end);
      return end && end < new Date() && task.status !== "Done";
    }).length;
    const totalProgress = workTasks.reduce((sum, task) => sum + clamp(Number(task.percent_done || 0)), 0);
    return {
      total: workTasks.length,
      done,
      inProgress,
      late,
      average: workTasks.length ? Math.round(totalProgress / workTasks.length) : 0,
    };
  }, [leafTasks]);

  const today = new Date();
  const todayLeft = today >= displayedTimeline.start && today <= displayedTimeline.end
    ? percentBetween(today, displayedTimeline.start, displayedTimeline.totalDays)
    : null;

  async function copyRealtimeLink() {
    if (!selectedProject || sharing) return;
    setSharing(true);
    setMessage("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(selectedProject)}/schedule-share`, { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || "ไม่สามารถสร้างลิงก์ได้");
      setShareUrl(result.url);
      try {
        await navigator.clipboard.writeText(result.url);
        setMessage("คัดลอกลิงก์ดูแผนงาน Realtime แล้ว ผู้รับลิงก์จะดูได้อย่างเดียวและข้อมูลอัปเดตทุก 10 วินาที");
      } catch {
        setMessage("สร้างลิงก์ดูแผนงาน Realtime แล้ว สามารถคัดลอกจากช่องด้านล่างได้");
      }
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    } finally {
      setSharing(false);
    }
  }

  const isLoading = tasksLoading || milestonesLoading;
  const showProjectSelector = projects.length > 1;

  const handlePrint = (target: Exclude<PrintTarget, null>) => {
    setPrintTarget(target);
    window.setTimeout(() => window.print(), 80);
  };

  const handleExportExcel = async () => {
    if (!selectedProjectData || exportingExcel) return;
    setExportingExcel(true);
    setMessage("");

    try {
      const exportRows = buildTaskRows(tasks, {});
      const exportTaskMap = new Map(sortedTasks.map((task) => [task.task_id, task]));

      await downloadScheduleWorkbook({
        projectCode: selectedProjectData.project_id,
        projectName: selectedProjectData.name,
        clientName: selectedProjectData.client || "",
        timelineStart: toInputDate(displayedTimeline.start),
        timelineEnd: toInputDate(displayedTimeline.end),
        rows: exportRows.map((task) => {
          const duration = Number(task.duration_days || daysBetween(task.start, task.end));
          const progress = Number(normalizeProgressValue(task.percent_done));
          return {
            wbs: getTaskOutlineNumber(task, exportRows, sortedTasks),
            name: task.name,
            level: getTaskLevelLabel(task, exportTaskMap),
            depth: getTaskDepth(task, exportTaskMap),
            assignee: isHeadingTask(task) ? "" : task.assignee || "",
            start: task.start || "",
            end: task.end || "",
            durationDays: Number.isFinite(duration) && duration > 0 ? duration : null,
            progress,
            status: TASK_STATUS_LABELS[getStatusForProgress(progress)] || "-",
            notes: task.notes || "",
            color: getTaskCategoryColor(task, exportTaskMap),
            isHeading: isHeadingTask(task),
          };
        }),
        milestones: sortedMilestones.map((milestone) => ({
          title: milestone.title,
          date: milestone.date,
          type: milestone.type || "Milestone",
          notes: milestone.notes || "",
          color: milestone.color || "#475569",
        })),
      });
      setMessage("ดาวน์โหลดไฟล์ Excel แผนงานเรียบร้อยแล้ว");
    } catch (error: unknown) {
      setMessage(`ดาวน์โหลด Excel ไม่สำเร็จ: ${getErrorMessage(error)}`);
    } finally {
      setExportingExcel(false);
    }
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
    const parentTask = sortedTasks.find((task) => task.task_id === parentTaskId);
    setTaskForm({
      ...emptyTaskForm,
      task_type: taskType,
      name: isHeading ? (parentTaskId ? "" : TASK_CATEGORIES[0]) : "",
      category: isHeading ? (parentTask ? getTaskCategoryName(parentTask, taskMap) : TASK_CATEGORIES[0]) : "",
      order_index: String(sortedTasks.length + 1),
      parent_task_id: parentTaskId,
      start: isHeading ? "" : todayInput,
      end: isHeading ? "" : todayInput,
      planned_start: isHeading ? "" : todayInput,
      planned_end: isHeading ? "" : todayInput,
    });
    setShowTaskForm(true);
  };

  const openScheduleTemplateModal = () => {
    setMessage("");
    setSelectedTemplateCategoryIds([]);
    setShowScheduleTemplateModal(true);
  };

  const requestScheduleTemplateImport = async ({
    categoryIds,
    importAll = false,
    closeModal = false,
  }: {
    categoryIds?: string[];
    importAll?: boolean;
    closeModal?: boolean;
  }) => {
    if (!selectedProject || importingScheduleTemplate || (!importAll && !categoryIds?.length)) return;

    setImportingScheduleTemplate(true);
    setMessage("");

    try {
      const res = await fetch("/api/tasks/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selectedProject,
          ...(importAll ? { import_all: true } : { category_ids: categoryIds }),
        }),
      });

      const json = await res.json() as {
        data?: Task[];
        count?: number;
        reused_count?: number;
        category_count?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Failed to import schedule template");

      const importedTasks = json.data || [];
      void mutateTasks((current) => current ? {
        ...current,
        data: [...current.data, ...importedTasks],
      } : current, { revalidate: false });
      void mutateTasks().catch(() => undefined);
      if (closeModal) setShowScheduleTemplateModal(false);
      const insertedCount = json.count ?? importedTasks.length;
      const reusedText = json.reused_count ? ` และใช้รายการเดิม ${json.reused_count} รายการ` : "";
      if (importAll && insertedCount === 0 && json.reused_count) {
        setMessage(`แผนงานครบตามแม่แบบแล้ว ใช้รายการเดิม ${json.reused_count} รายการ`);
      } else {
        const actionLabel = importAll ? "สร้างแผนงานทั้งโครงการ" : "เติมโครงสร้างแผนงานจากแม่แบบ";
        const categoryText = json.category_count ? ` ${json.category_count} หมวด` : "";
        setMessage(`${actionLabel}แล้ว${categoryText} เพิ่ม ${insertedCount} รายการ${reusedText}`);
      }
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    } finally {
      setImportingScheduleTemplate(false);
    }
  };

  const importScheduleTemplate = async () => {
    await requestScheduleTemplateImport({
      categoryIds: selectedTemplateCategoryIds,
      closeModal: true,
    });
  };

  const importFullScheduleTemplate = async () => {
    await requestScheduleTemplateImport({ importAll: true });
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

  const canDropPlanTaskFrom = (sourceTask: Task, targetTask: Task) => {
    return Boolean(
      !saving &&
      !isHeadingTask(sourceTask) &&
      !isHeadingTask(targetTask) &&
      sourceTask.task_id !== targetTask.task_id &&
      (sourceTask.parent_task_id || "") === (targetTask.parent_task_id || "")
    );
  };

  const canDropPlanTask = (targetTask: Task) => {
    return Boolean(planDragTask && canDropPlanTaskFrom(planDragTask, targetTask));
  };

  const resetPlanPointerDrag = () => {
    planDragRef.current = null;
    setPlanDragTask(null);
  };

  const handlePlanTaskPointerDown = (event: React.PointerEvent<HTMLButtonElement>, task: Task) => {
    if (saving || isHeadingTask(task)) return;
    event.stopPropagation();
    planDragRef.current = { task, startX: event.clientX, startY: event.clientY, dragging: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePlanTaskPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragState = planDragRef.current;
    if (!dragState) return;

    const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (!dragState.dragging && distance > 6) {
      dragState.dragging = true;
      setPlanDragTask(dragState.task);
    }
    if (dragState.dragging) event.preventDefault();
  };

  const handlePlanTaskPointerUp = async (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const dragState = planDragRef.current;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }

    if (!dragState) return;
    resetPlanPointerDrag();
    if (!dragState.dragging) return;

    event.preventDefault();
    suppressPlanDragClickRef.current = true;
    const dropElement = document.elementFromPoint(event.clientX, event.clientY);
    const dropRow = dropElement instanceof HTMLElement ? dropElement.closest<HTMLElement>("[data-plan-task-id]") : null;
    const targetTaskId = dropRow?.dataset.planTaskId || "";
    const targetTask = sortedTasks.find((item) => item.task_id === targetTaskId);
    if (!targetTask || !canDropPlanTaskFrom(dragState.task, targetTask)) return;

    const targetPosition = sortedTasks.findIndex((item) => item.task_id === targetTask.task_id) + 1;
    if (targetPosition > 0) await moveTaskToPosition(dragState.task, targetPosition);
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
    const progressPatch = isHeading ? {} : buildTaskStatusPatch(taskForm.status, taskForm.percent_done);
    const payload = {
      ...taskForm,
      ...progressPatch,
      project_id: selectedProject,
      category: isHeading
        ? parentTask ? getTaskCategoryName(parentTask, taskMap) || taskForm.name : taskForm.name
        : parentTask ? getTaskCategoryName(parentTask, taskMap) || parentTask.name : taskForm.category,
      order_index: taskForm.order_index || String(sortedTasks.length + 1),
      parent_task_id: taskForm.parent_task_id,
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
      const tasksToDelete = [task, ...(descendantTasksById.get(task.task_id) || [])];
      const params = new URLSearchParams({ project_id: task.project_id });
      if (task.task_id) params.set("task_id", task.task_id);
      if (task._rowIndex) params.set("_rowIndex", String(task._rowIndex));
      const res = await fetch(`/api/tasks?${params.toString()}`, { method: "DELETE" });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete task");
      }

      const deletedIds = new Set(tasksToDelete.map((item) => item.task_id).filter(Boolean));
      const deletedRowIndexes = new Set(tasksToDelete.map((item) => item._rowIndex).filter(Boolean));
      void mutateTasks((current) => current ? {
        ...current,
        data: current.data.filter((item) => !(
          deletedIds.has(item.task_id) || deletedRowIndexes.has(item._rowIndex)
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
      use_custom_phase: !CUSTOMER_DECISION_PHASES.includes(currentDecisionPhase as typeof CUSTOMER_DECISION_PHASES[number]),
      custom_phase: CUSTOMER_DECISION_PHASES.includes(currentDecisionPhase as typeof CUSTOMER_DECISION_PHASES[number]) ? "" : currentDecisionPhase,
      order_index: String(decisions.length + 1),
    });
    setDecisionEvidenceFiles([]);
    setShowDecisionForm(true);
  };

  const openEditDecision = (decision: CustomerDecision) => {
    const hasKnownPhase = CUSTOMER_DECISION_PHASES.includes(decision.phase as typeof CUSTOMER_DECISION_PHASES[number]);
    setMessage("");
    setDecisionForm({
      decision_id: decision.decision_id,
      phase: hasKnownPhase ? decision.phase : CUSTOMER_DECISION_PHASES[0],
      use_custom_phase: Boolean(decision.phase && !hasKnownPhase),
      custom_phase: hasKnownPhase ? "" : decision.phase || "",
      title: decision.title || "",
      decision_before: decision.decision_before || "",
      decision_status: decision.decision_status || "ต้องยืนยัน",
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
    const resolvedPhase = (decisionForm.use_custom_phase ? decisionForm.custom_phase : decisionForm.phase).trim();
    if (!selectedProject || !resolvedPhase || !decisionForm.title.trim()) {
      setMessage("กรุณากรอกช่วงงานและรายการที่ต้องให้ลูกค้าตัดสินใจ");
      return;
    }

    try {
      validateDecisionEvidenceFiles(decisionEvidenceFiles);
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
      return;
    }

    setSaving(true);
    setMessage(decisionEvidenceFiles.length > 0 ? "กำลังบันทึกรายการก่อน แล้วจะอัปโหลดหลักฐานต่อให้" : "");

    try {
      const evidenceFilesToUpload = [...decisionEvidenceFiles];
      const decisionPayload = {
        action: "save",
        ...decisionForm,
        phase: resolvedPhase,
      };
      const json = await postDecisionJson(selectedProject, {
        ...decisionPayload,
        evidence_uploads: [],
      }, DECISION_SAVE_TIMEOUT_MS, "บันทึกรายการนานเกินไป กรุณาลองใหม่อีกครั้ง");

      await mutateDecisions();
      setCurrentDecisionPhase(resolvedPhase);
      setShowDecisionForm(false);
      setDecisionEvidenceFiles([]);
      const savedDecisionId = String(json.data?.decision_id || decisionForm.decision_id || "");
      if (evidenceFilesToUpload.length > 0 && savedDecisionId) {
        setSaving(false);
        setMessage("บันทึกรายการแล้ว กำลังอัปโหลดหลักฐานต่อเบื้องหลัง...");
        void uploadDecisionEvidenceInBackground(selectedProject, savedDecisionId, evidenceFilesToUpload, decisionPayload);
        return;
      }

      setMessage("บันทึกรายการที่ลูกค้าต้องตัดสินใจเรียบร้อยแล้ว");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const uploadDecisionEvidenceInBackground = async (
    projectId: string,
    decisionId: string,
    files: File[],
    decisionPayload: Record<string, unknown>
  ) => {
    try {
      const evidenceUploads = await Promise.all(files.map(fileToUploadPayload));
      await postDecisionJson(projectId, {
        ...decisionPayload,
        decision_id: decisionId,
        evidence_uploads: evidenceUploads,
      }, DECISION_EVIDENCE_UPLOAD_TIMEOUT_MS, "อัปโหลดหลักฐานนานเกินไป รายการถูกบันทึกแล้ว แต่ไฟล์ยังไม่สำเร็จ กรุณาแนบใหม่ภายหลัง");
      await mutateDecisions();
      setMessage("บันทึกรายการและอัปโหลดหลักฐานเรียบร้อยแล้ว");
    } catch (error: unknown) {
      setMessage(`${getErrorMessage(error)} (รายการถูกบันทึกแล้ว สามารถแก้ไขรายการเพื่อแนบหลักฐานใหม่ได้)`);
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

  const scheduleTabs: { key: ActiveTab; label: string; compactLabel: string; detail: string; icon: React.ReactNode; count: number }[] = [
    {
      key: "tracker",
      label: "Task Tracker",
      compactLabel: "ติดตามงาน",
      detail: "ติดตามงานย่อย",
      icon: <CheckSquare size={16} />,
      count: leafTasks.length,
    },
    {
      key: "plan",
      label: "ตารางแผนงาน",
      compactLabel: "แผนงาน",
      detail: "H1-H4 + งานจริง",
      icon: <FileSpreadsheet size={16} />,
      count: sortedTasks.length,
    },
    {
      key: "decisions",
      label: "รายการต้องตัดสินใจ",
      compactLabel: "การตัดสินใจ",
      detail: "ลูกค้า + วิศวกร",
      icon: <ClipboardCheck size={16} />,
      count: waitingDecisionCount,
    },
  ];

  return (
    <section className="schedule-print-surface space-y-4">
      <div className={`schedule-screen-only ${showPageHeader ? "schedule-page-heading" : "schedule-command-bar schedule-context-bar"}`}>
        {showPageHeader && (
          <div className="schedule-page-title">
            <span className="schedule-page-title-icon"><CalendarRange size={23} /></span>
            <div className="min-w-0">
              <h2>แผนงานก่อสร้าง</h2>
              <p>ติดตามแผนงานจริงและความคืบหน้า</p>
            </div>
          </div>
        )}

        {showProjectSelector ? (
          <div className="schedule-project-picker">
            <label htmlFor="schedule-project-select">โครงการ</label>
            <select
              id="schedule-project-select"
              value={selectedProject}
              onChange={(event) => {
                setSelectedProject(event.target.value);
                setGanttFocusRange(null);
              }}
              aria-label="เลือกโครงการ"
            >
              {projects.map((project) => (
                <option key={project.project_id} value={project.project_id}>
                  {project.project_id} - {project.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="schedule-project-summary">
            <div className="min-w-0">
              <h3>{selectedProjectData?.name || selectedProject}</h3>
              <p>
                {selectedProjectData?.project_id || selectedProject} | {selectedProjectData?.client || "ไม่ระบุลูกค้า"} | {selectedProjectData?.status || "Planning"}
              </p>
            </div>
            <button type="button" onClick={copyRealtimeLink} disabled={sharing}>
              {sharing ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />}
              สร้างลิงก์ Realtime
            </button>
          </div>
        )}

        <div className={`schedule-tabs ${showPageHeader ? "is-compact" : ""}`}>
          {scheduleTabs.map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={isActive ? "is-active" : ""}
              >
                <span className="schedule-tab-icon">{tab.icon}</span>
                <span className="schedule-tab-copy">
                  <strong>{showPageHeader ? tab.compactLabel : tab.label}</strong>
                  {!showPageHeader && <small>{tab.detail}</small>}
                </span>
                <span className="schedule-tab-count">{tab.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {message && (
        <div className="schedule-screen-only px-4 py-3 rounded-xl bg-orange-50 text-orange-700 border border-orange-100 text-sm">
          {message}
        </div>
      )}

      {shareUrl && (
        <div className="schedule-screen-only flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:flex-row sm:items-center">
          <input
            readOnly
            value={shareUrl}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="ลิงก์ดูแผนงาน Realtime"
            className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800"
          >
            <ExternalLink size={15} />
            เปิดหน้าดู
          </a>
        </div>
      )}

      {activeTab === "tracker" ? (
        <TaskTrackerPanel
          tasks={leafTasks}
          allTasks={sortedTasks}
          loading={isLoading}
          saving={saving}
          projectName={selectedProjectData?.name || "-"}
          onCreateTask={() => openNewTask("subtask")}
          onEditTask={openEditTask}
          onStatusChange={(task, status) => saveTaskPatch(task, buildTaskStatusPatch(status, task.percent_done), "อัปเดตสถานะงานเรียบร้อยแล้ว")}
        />
      ) : activeTab === "plan" ? (
        <UnifiedScheduleWorkspace
          project={selectedProjectData}
          tasks={visibleTaskRows}
          allTasks={sortedTasks}
          milestones={sortedMilestones}
          timeline={displayedTimeline}
          fullTimeline={timeline}
          focusRange={ganttFocusRange}
          todayLeft={todayLeft}
          loading={isLoading}
          showDatedOnly={ganttDatedOnly}
          expanded={ganttExpanded}
          importingTemplate={importingScheduleTemplate}
          exportingExcel={exportingExcel}
          onCreateTask={() => openNewTask("subtask")}
          onCreateHeading={() => openNewTask("heading")}
          onCreateSubtask={(parentTaskId) => openNewTask("subtask", parentTaskId)}
          onImportFullTemplate={importFullScheduleTemplate}
          onOpenTemplate={openScheduleTemplateModal}
          onExportExcel={handleExportExcel}
          onPrint={() => handlePrint("gantt")}
          onTimelineRangeChange={setGanttFocusRange}
          onToggleDatedOnly={() => setGanttDatedOnly((value) => !value)}
          onToggleExpanded={() => setGanttExpanded((value) => !value)}
          onEditTask={openEditTask}
          onSaveTaskPatch={saveTaskPatch}
          onDeleteTask={setPendingDeleteTask}
          onEditTaskDate={openDateEditTask}
          onToggleHeading={toggleHeading}
          onCreateMilestone={openNewMilestone}
          onEditMilestone={openEditMilestone}
        />
      ) : false ? (
        <div className="schedule-screen-only bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-5 border-l-4 border-orange-600 bg-white flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">แผนงานก่อสร้าง</h3>
              <p className="text-sm text-gray-500 mt-1">
                {selectedProjectData?.name || "-"} | {selectedProjectData?.client || "ไม่ระบุลูกค้า"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openNewTask("subtask")}
                className="inline-flex items-center gap-2 rounded-lg bg-[#10294b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0b1f39]"
              >
                <Plus size={16} />
                เพิ่มงาน
              </button>
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
              <button
                type="button"
                onClick={openScheduleTemplateModal}
                disabled={importingScheduleTemplate}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-70"
              >
                {importingScheduleTemplate ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                สร้างร่างแผนงานจากแม่แบบ
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-5 bg-gray-50 border-y border-gray-100">
            <SummaryCard label="งานทั้งหมด" value={stats.total} />
            <SummaryCard label="เสร็จแล้ว" value={stats.done} tone="green" />
            <SummaryCard label="กำลังดำเนินการ" value={stats.inProgress} tone="blue" />
            <SummaryCard label="ล่าช้า" value={stats.late} tone="red" />
            <SummaryCard label="ความคืบหน้ารวม" value={`${stats.average}%`} tone="orange" />
          </div>

          <div className="schedule-board-grid">
            <div className="schedule-plan-table-panel">
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
                        เพิ่มหัวข้อหลัก
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
                        ใช้ปุ่ม + ในแถวหัวข้อเพื่อเพิ่ม H2/H3/H4 หรืองานจริงใต้หัวข้อนั้นทันที
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
                  const taskDepth = getTaskDepth(task, taskMap);
                  const taskLevelLabel = getTaskLevelLabel(task, taskMap);
                  const headingDisplay = getHeadingDisplay(taskDepth);
                  const isDropTarget = canDropPlanTask(task);
                  const isDraggingTask = Boolean(planDragTask && planDragTask.task_id === task.task_id);

                  if (isHeading) {
                    return (
                      <tr key={task.task_id} className={`border-b ${headingDisplay.border}`}>
                        <td colSpan={11} className={`${headingDisplay.row} px-4 py-2`}>
                          <div className="flex flex-wrap items-center justify-between gap-3" style={{ paddingLeft: `${Math.min(taskDepth, 5) * 30}px` }}>
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="w-10 shrink-0 text-right font-extrabold tabular-nums">{outlineNumber}</span>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleHeading(task.task_id);
                                }}
                                className={`grid h-5 w-5 shrink-0 place-items-center rounded ${headingDisplay.toggle}`}
                                title={task.is_collapsed ? "เปิดหัวข้อย่อย" : "ซ่อนหัวข้อย่อย"}
                                aria-label={task.is_collapsed ? "เปิดหัวข้อย่อย" : "ซ่อนหัวข้อย่อย"}
                              >
                                {task.is_collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                              </button>
                              <span className="truncate text-base font-extrabold">{task.name}</span>
                              <span className={`rounded px-2 py-0.5 text-xs font-bold ${headingDisplay.badge}`}>{taskLevelLabel}</span>
                              <span className={`rounded px-2 py-0.5 text-xs font-bold ${headingDisplay.badge}`}>{task.summary_child_count || 0} งานย่อย</span>
                              <span className={`text-xs font-semibold ${headingDisplay.meta}`}>{formatDateShort(task.start)} - {formatDateShort(task.end)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openNewTask("heading", task.task_id)}
                                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-bold ${headingDisplay.secondaryButton}`}
                              >
                                <Plus size={14} />
                                หัวข้อย่อย
                              </button>
                              <button
                                type="button"
                                onClick={() => openNewTask("subtask", task.task_id)}
                                className="inline-flex items-center gap-1 rounded-md bg-orange-500 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-orange-400"
                              >
                                <Plus size={14} />
                                งานย่อย
                              </button>
                              <button onClick={() => openEditTask(task)} className={`rounded-md p-1.5 ${headingDisplay.editButton}`} title="แก้ไข">
                                <Edit3 size={15} />
                              </button>
                              <button onClick={() => setPendingDeleteTask(task)} className={`rounded-md p-1.5 ${headingDisplay.deleteButton}`} title="ลบ">
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
                    data-plan-task-id={task.task_id}
                    onClick={() => quickDateEdit && openDateEditTask(task)}
                    className={`border-b border-gray-100 hover:bg-orange-50/30 ${quickDateEdit ? "cursor-pointer" : ""} ${isHeading ? "bg-gray-50" : ""} ${isDropTarget ? "bg-orange-50 ring-1 ring-inset ring-orange-200" : ""} ${isDraggingTask ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-4 text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onPointerDown={(event) => handlePlanTaskPointerDown(event, task)}
                          onPointerMove={handlePlanTaskPointerMove}
                          onPointerUp={(event) => void handlePlanTaskPointerUp(event)}
                          onPointerCancel={resetPlanPointerDrag}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (suppressPlanDragClickRef.current) {
                              suppressPlanDragClickRef.current = false;
                              return;
                            }
                            promptMoveTask(task);
                          }}
                          disabled={saving}
                          className="ml-6 inline-flex min-w-14 cursor-grab items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 font-semibold text-gray-700 hover:border-orange-300 hover:text-orange-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                          title="ลากเพื่อย้ายลำดับ หรือคลิกเพื่อระบุลำดับ"
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
                      <div className={`${isHeading ? "text-base font-extrabold" : "font-bold"} text-gray-900 flex items-center gap-2`} style={{ paddingLeft: `${Math.min(taskDepth, 5) * 18}px` }}>
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
                          {taskLevelLabel}
                        </span>
                        {!isHeading && parentTaskName && <span>ใต้: {parentTaskName}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4">{task.assignee || "-"}</td>
                    <td className="px-4 py-4 font-semibold">{formatDateShort(task.start)}</td>
                    <td className="px-4 py-4 font-semibold">{formatDateShort(task.end)}</td>
                    <td className="px-4 py-4 text-center">{task.duration_days || daysBetween(task.start, task.end) || "-"}</td>
                    <td className="px-4 py-4">
                      <InlineTaskProgress
                        key={`${task.task_id || task._rowIndex}-${task.percent_done || 0}`}
                        task={task}
                        saving={saving}
                        onProgressChange={(targetTask, progress) => saveTaskPatch(
                          targetTask,
                          buildTaskProgressPatch(progress),
                          "อัปเดตความคืบหน้างานเรียบร้อยแล้ว"
                        )}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 rounded-md text-xs font-semibold ${getTaskStatusTone(task.status).screen}`}>
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
                        <button
                          type="button"
                          onClick={() => openNewTask("subtask", task.task_id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-orange-50 px-2 py-1.5 text-xs font-extrabold text-orange-700 hover:bg-orange-100"
                          title="เพิ่มงานย่อยใต้รายการนี้"
                        >
                          <Plus size={14} />
                          งานย่อย
                        </button>
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

            <div className="schedule-gantt-board-panel">
              <GanttPanel
                tasks={ganttTaskRows}
                milestones={sortedMilestones}
                timeline={timeline}
                todayLeft={todayLeft}
                loading={isLoading}
                onEditMilestone={openEditMilestone}
                onEditTaskDate={openDateEditTask}
                onToggleHeading={toggleHeading}
                quickDateEdit={quickDateEdit}
                showDatedOnly={ganttDatedOnly}
                onToggleDatedOnly={() => setGanttDatedOnly((value) => !value)}
                datedTaskCount={datedGanttTaskCount}
                totalTaskCount={visibleTaskRows.length}
                expanded={ganttExpanded}
                onToggleExpanded={() => setGanttExpanded((value) => !value)}
              />
            </div>
          </div>

          <aside className="grid grid-cols-1 gap-5 p-5 pt-0 lg:grid-cols-2">
            <MilestonePanel milestones={sortedMilestones} onEdit={openEditMilestone} />
            <OverallStatus stats={stats} totalTasks={stats.total} />
          </aside>
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
              tasks={ganttTaskRows}
              milestones={sortedMilestones}
              timeline={timeline}
              todayLeft={todayLeft}
              loading={isLoading}
              onEditMilestone={openEditMilestone}
              onEditTaskDate={openDateEditTask}
              onToggleHeading={toggleHeading}
              quickDateEdit={quickDateEdit}
              showDatedOnly={ganttDatedOnly}
              onToggleDatedOnly={() => setGanttDatedOnly((value) => !value)}
              datedTaskCount={datedGanttTaskCount}
              totalTaskCount={visibleTaskRows.length}
              expanded={ganttExpanded}
              onToggleExpanded={() => setGanttExpanded((value) => !value)}
            />

            <aside className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <MilestonePanel milestones={sortedMilestones} onEdit={openEditMilestone} />
              <OverallStatus stats={stats} totalTasks={stats.total} />
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
        tasks={ganttTaskRows}
        milestones={sortedMilestones}
        timeline={displayedTimeline}
        todayLeft={todayLeft}
      />

      {showScheduleTemplateModal && (
        <ScheduleTemplateModal
          categories={scheduleTemplateCategories}
          selectedCategoryIds={selectedTemplateCategoryIds}
          loading={scheduleTemplateLoading}
          importing={importingScheduleTemplate}
          onToggleCategory={(categoryId) => {
            setSelectedTemplateCategoryIds((current) => (
              current.includes(categoryId)
                ? current.filter((id) => id !== categoryId)
                : [...current, categoryId]
            ));
          }}
          onSelectAll={() => setSelectedTemplateCategoryIds(scheduleTemplateCategories.map((category) => category.id))}
          onClear={() => setSelectedTemplateCategoryIds([])}
          onClose={() => setShowScheduleTemplateModal(false)}
          onImport={importScheduleTemplate}
        />
      )}

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
          parentOptions={parentTaskOptions}
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
        message={`ต้องการลบงาน "${pendingDeleteTask?.name || "-"}" หรือไม่${pendingDeleteTask && isHeadingTask(pendingDeleteTask) ? " ระบบจะลบหัวข้อย่อยและงานจริงใต้หัวข้อนี้ด้วย" : ""}`}
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

function InlineScheduleCell({
  value,
  displayValue,
  inputType = "text",
  inputMin,
  inputMax,
  buttonClassName,
  inputClassName,
  ariaLabel,
  required = false,
  onCommit,
}: {
  value: string;
  displayValue?: string;
  inputType?: "text" | "date" | "number";
  inputMin?: number;
  inputMax?: number;
  buttonClassName: string;
  inputClassName?: string;
  ariaLabel: string;
  required?: boolean;
  onCommit: (value: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [savingCell, setSavingCell] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    if (inputType === "text") inputRef.current?.select();
  }, [editing, inputType]);

  const finishEditing = async () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      setDraft(value);
      setEditing(false);
      return;
    }

    const nextValue = draft.trim();
    if ((required && !nextValue) || nextValue === value) {
      setDraft(value);
      setEditing(false);
      return;
    }

    setSavingCell(true);
    const saved = await onCommit(nextValue);
    if (!saved) setDraft(value);
    setSavingCell(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={inputType}
        min={inputMin}
        max={inputMax}
        value={draft}
        disabled={savingCell}
        aria-label={ariaLabel}
        aria-busy={savingCell}
        className={inputClassName || buttonClassName}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void finishEditing()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            cancelRef.current = true;
            event.currentTarget.blur();
          } else if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={buttonClassName}
      title={`${ariaLabel} (Enter เพื่อแก้ไข)`}
      aria-label={ariaLabel}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {(displayValue ?? value) || "-"}
    </button>
  );
}

function UnifiedScheduleWorkspace({
  project,
  tasks,
  allTasks,
  milestones,
  timeline,
  fullTimeline,
  focusRange,
  todayLeft,
  loading,
  showDatedOnly,
  expanded,
  importingTemplate,
  exportingExcel,
  onCreateTask,
  onCreateHeading,
  onCreateSubtask,
  onImportFullTemplate,
  onOpenTemplate,
  onExportExcel,
  onPrint,
  onTimelineRangeChange,
  onToggleDatedOnly,
  onToggleExpanded,
  onEditTask,
  onSaveTaskPatch,
  onDeleteTask,
  onEditTaskDate,
  onToggleHeading,
  onCreateMilestone,
  onEditMilestone,
}: {
  project?: Project;
  tasks: Task[];
  allTasks: Task[];
  milestones: Milestone[];
  timeline: Timeline;
  fullTimeline: Timeline;
  focusRange: TimelineFocusRange | null;
  todayLeft: number | null;
  loading: boolean;
  showDatedOnly: boolean;
  expanded: boolean;
  importingTemplate: boolean;
  exportingExcel: boolean;
  onCreateTask: () => void;
  onCreateHeading: () => void;
  onCreateSubtask: (parentTaskId: string) => void;
  onImportFullTemplate: () => void;
  onOpenTemplate: () => void;
  onExportExcel: () => void;
  onPrint: () => void;
  onTimelineRangeChange: (range: TimelineFocusRange | null) => void;
  onToggleDatedOnly: () => void;
  onToggleExpanded: () => void;
  onEditTask: (task: Task) => void;
  onSaveTaskPatch: (task: Task, patch: TaskPatch, successMessage: string) => Promise<boolean>;
  onDeleteTask: (task: Task) => void;
  onEditTaskDate: (task: Task) => void;
  onToggleHeading: (taskId: string) => void;
  onCreateMilestone: () => void;
  onEditMilestone: (milestone: Milestone) => void;
}) {
  const LEFT_WIDTH = 932;
  const scrollRef = useRef<HTMLDivElement>(null);
  const monthInputRef = useRef<HTMLInputElement>(null);
  const customStartInputRef = useRef<HTMLInputElement>(null);
  const customEndInputRef = useRef<HTMLInputElement>(null);
  const [zoom, setZoom] = useState(1);
  const [chartViewportWidth, setChartViewportWidth] = useState(520);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [rangeMode, setRangeMode] = useState<"month" | "custom">("month");
  const [selectedMonth, setSelectedMonth] = useState(toInputDate(fullTimeline.start).slice(0, 7));
  const [customStart, setCustomStart] = useState(focusRange?.start || toInputDate(fullTimeline.start));
  const [customEnd, setCustomEnd] = useState(focusRange?.end || toInputDate(fullTimeline.end));
  const [rangeError, setRangeError] = useState("");
  const chartWidth = Math.round(chartViewportWidth * zoom);
  const taskMap = useMemo(() => new Map(allTasks.map((task) => [task.task_id, task])), [allTasks]);
  const schedulableTasks = useMemo(() => allTasks.filter((task) => !isHeadingTask(task)), [allTasks]);
  const datedCount = useMemo(() => schedulableTasks.filter(hasTaskScheduleDates).length, [schedulableTasks]);
  const canFilterDated = datedCount > 0;
  const displayTasks = useMemo(
    () => showDatedOnly && canFilterDated ? tasks.filter(hasTaskScheduleDates) : tasks,
    [canFilterDated, showDatedOnly, tasks]
  );
  const milestonePositions = useMemo(() => milestones.flatMap((milestone) => {
    const date = parseDate(milestone.date);
    if (!date) return [];
    return [{ milestone, left: percentBetween(date, timeline.start, timeline.totalDays) }];
  }), [milestones, timeline]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const observer = new ResizeObserver(([entry]) => {
      setChartViewportWidth(Math.max(440, Math.floor(entry.contentRect.width - LEFT_WIDTH)));
    });
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  const moveTimeline = (direction: number) => {
    scrollRef.current?.scrollBy({ left: direction * 320, behavior: "smooth" });
  };

  const focusToday = () => {
    if (todayLeft === null) {
      const today = new Date();
      onTimelineRangeChange({
        start: toInputDate(new Date(today.getFullYear(), today.getMonth(), 1, 12)),
        end: toInputDate(new Date(today.getFullYear(), today.getMonth() + 1, 0, 12)),
      });
      return;
    }
    if (!scrollRef.current) return;
    const viewport = scrollRef.current.clientWidth;
    const target = LEFT_WIDTH + (todayLeft / 100) * chartWidth - viewport / 2;
    scrollRef.current.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  };

  const toggleRangePicker = () => {
    if (!rangePickerOpen) {
      const startValue = focusRange?.start || toInputDate(fullTimeline.start);
      const endValue = focusRange?.end || toInputDate(fullTimeline.end);
      setRangeMode(focusRange ? "custom" : "month");
      setSelectedMonth(startValue.slice(0, 7));
      setCustomStart(startValue);
      setCustomEnd(endValue);
      setRangeError("");
    }
    setRangePickerOpen((value) => !value);
  };

  const applyTimelineRange = () => {
    if (rangeMode === "month") {
      const monthValue = monthInputRef.current?.value || selectedMonth;
      const [year, month] = monthValue.split("-").map(Number);
      if (!year || !month) {
        setRangeError("กรุณาเลือกเดือน");
        return;
      }
      onTimelineRangeChange({
        start: toInputDate(new Date(year, month - 1, 1, 12)),
        end: toInputDate(new Date(year, month, 0, 12)),
      });
      setRangePickerOpen(false);
      return;
    }

    const startValue = customStartInputRef.current?.value || customStart;
    const endValue = customEndInputRef.current?.value || customEnd;
    const start = parseDate(startValue);
    const end = parseDate(endValue);
    if (!start || !end) {
      setRangeError("กรุณาระบุวันเริ่มและวันสิ้นสุด");
      return;
    }
    if (end < start) {
      setRangeError("วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่ม");
      return;
    }
    onTimelineRangeChange({ start: startValue, end: endValue });
    setRangePickerOpen(false);
  };

  const resetTimelineRange = () => {
    onTimelineRangeChange(null);
    setRangeError("");
    setRangePickerOpen(false);
  };

  const changeZoom = (next: number) => setZoom(clamp(next, 0.75, 1.75));

  const saveInlineName = (task: Task, name: string) => onSaveTaskPatch(task, {
    name,
    ...(isHeadingTask(task) && !task.parent_task_id ? { category: name } : {}),
  }, "อัปเดตชื่องานเรียบร้อยแล้ว");

  const saveInlineAssignee = (task: Task, assignee: string) => onSaveTaskPatch(
    task,
    { assignee },
    "อัปเดตผู้รับผิดชอบเรียบร้อยแล้ว"
  );

  const saveInlineDate = (task: Task, field: "start" | "end", value: string) => {
    let start = field === "start" ? value : task.planned_start || task.start || "";
    let end = field === "end" ? value : task.planned_end || task.end || "";
    const startDate = parseDate(start);
    const endDate = parseDate(end);

    if (startDate && endDate && startDate > endDate) {
      if (field === "start") end = value;
      else start = value;
    }

    return onSaveTaskPatch(task, {
      start,
      end,
      planned_start: start,
      planned_end: end,
      duration_days: daysBetween(start, end),
    }, "อัปเดตวันที่ในแผนงานเรียบร้อยแล้ว");
  };

  const saveInlineProgress = (task: Task, progress: string) => onSaveTaskPatch(
    task,
    buildTaskProgressPatch(progress),
    "อัปเดตความคืบหน้างานเรียบร้อยแล้ว"
  );

  const saveInlineNotes = (task: Task, notes: string) => onSaveTaskPatch(
    task,
    { notes },
    "อัปเดตหมายเหตุเรียบร้อยแล้ว"
  );

  return (
    <section className={`schedule-screen-only unified-schedule-workspace ${expanded ? "is-expanded" : ""}`}>
      <header className="unified-schedule-titlebar">
        <div className="min-w-0">
          <h3>แผนงานก่อสร้าง</h3>
          <p>{project?.name || "-"} · {project?.client || "ไม่ระบุลูกค้า"}</p>
        </div>
        <div className="unified-schedule-actions">
          <button type="button" onClick={onCreateTask} className="is-primary">
            <Plus size={17} /> เพิ่มงาน
          </button>
          <button
            type="button"
            onClick={onImportFullTemplate}
            disabled={importingTemplate}
            className="is-template-primary"
            title="เติมแม่แบบแผนงานครบทุกหมวดจนถึงส่งมอบบ้าน โดยไม่สร้างรายการเดิมซ้ำ"
          >
            {importingTemplate ? <Loader2 size={17} className="animate-spin" /> : <CheckSquare size={17} />}
            {importingTemplate ? "กำลังสร้าง..." : "สร้างทั้งโครงการ"}
          </button>
          <button type="button" onClick={onOpenTemplate} disabled={importingTemplate}>
            <FileSpreadsheet size={17} /> เลือกบางหมวด
          </button>
          <button type="button" onClick={onExportExcel} disabled={exportingExcel} title="ดาวน์โหลดแผนงานและ Gantt เป็นไฟล์ Excel">
            {exportingExcel ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
            {exportingExcel ? "กำลังสร้าง..." : "Excel"}
          </button>
          <button type="button" onClick={onPrint} title="พิมพ์แผนงานตามช่วงเวลาที่กำลังแสดง">
            <Printer size={17} /> พิมพ์ที่แสดง
          </button>
        </div>
      </header>

      <div className="unified-schedule-toolbar">
        <div className="unified-schedule-row-actions">
          <button type="button" onClick={onCreateHeading}><Plus size={15} /> หมวดงาน</button>
          <button type="button" onClick={onCreateMilestone}><Flag size={15} /> Milestone</button>
          <button
            type="button"
            onClick={onToggleDatedOnly}
            disabled={!canFilterDated}
            className={showDatedOnly && canFilterDated ? "is-active" : ""}
            title={canFilterDated ? "แสดงเฉพาะงานจริงที่กำหนดวันที่แล้ว" : "ยังไม่มีงานจริงที่กำหนดวันที่"}
          >
            <CalendarDays size={15} /> มีวันที่ {datedCount}/{schedulableTasks.length}
          </button>
        </div>
        <div className="unified-schedule-time-controls">
          <button type="button" onClick={() => moveTimeline(-1)} title="เลื่อนไทม์ไลน์ไปก่อนหน้า" aria-label="เลื่อนไทม์ไลน์ไปก่อนหน้า"><ArrowDown className="rotate-90" size={17} /></button>
          <button type="button" onClick={focusToday} className="is-today">วันนี้</button>
          <button type="button" onClick={() => moveTimeline(1)} title="เลื่อนไทม์ไลน์ไปถัดไป" aria-label="เลื่อนไทม์ไลน์ไปถัดไป"><ArrowUp className="rotate-90" size={17} /></button>
          <div className="unified-schedule-range-picker">
            <button type="button" onClick={toggleRangePicker} className={`unified-schedule-range ${focusRange ? "is-focused" : ""}`} aria-expanded={rangePickerOpen}>
              <CalendarRange size={16} /> {dateRangeLabel(timeline.start, timeline.end)}
            </button>
            {rangePickerOpen && (
              <div className="unified-schedule-range-popover">
                <div className="unified-schedule-range-popover-head">
                  <strong>ช่วงเวลาที่แสดง</strong>
                  <button type="button" onClick={() => setRangePickerOpen(false)} aria-label="ปิด"><X size={16} /></button>
                </div>
                <div className="unified-schedule-range-modes">
                  <button type="button" onClick={() => { setRangeMode("month"); setRangeError(""); }} className={rangeMode === "month" ? "is-active" : ""}>เลือกเดือน</button>
                  <button type="button" onClick={() => { setRangeMode("custom"); setRangeError(""); }} className={rangeMode === "custom" ? "is-active" : ""}>กำหนดเอง</button>
                </div>
                {rangeMode === "month" ? (
                  <label className="unified-schedule-range-field">
                    <span>เดือน</span>
                    <input ref={monthInputRef} type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
                  </label>
                ) : (
                  <div className="unified-schedule-range-fields">
                    <label className="unified-schedule-range-field">
                      <span>วันเริ่ม</span>
                      <input ref={customStartInputRef} type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
                    </label>
                    <label className="unified-schedule-range-field">
                      <span>วันสิ้นสุด</span>
                      <input ref={customEndInputRef} type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
                    </label>
                  </div>
                )}
                {rangeError && <p className="unified-schedule-range-error">{rangeError}</p>}
                <div className="unified-schedule-range-actions">
                  <button type="button" onClick={resetTimelineRange}>ทั้งโครงการ</button>
                  <button type="button" onClick={applyTimelineRange} className="is-primary">แสดงช่วงนี้</button>
                </div>
              </div>
            )}
          </div>
          <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="ระดับการแสดงไทม์ไลน์">
            <option value={0.8}>ย่อ</option>
            <option value={1}>พอดี</option>
            <option value={1.35}>ขยาย</option>
            <option value={1.7}>ละเอียด</option>
          </select>
          <button type="button" onClick={() => changeZoom(zoom - 0.15)} title="ย่อไทม์ไลน์" aria-label="ย่อไทม์ไลน์"><ZoomOut size={17} /></button>
          <button type="button" onClick={() => changeZoom(zoom + 0.15)} title="ขยายไทม์ไลน์" aria-label="ขยายไทม์ไลน์"><ZoomIn size={17} /></button>
          <button type="button" onClick={onToggleExpanded} title={expanded ? "ออกจากเต็มจอ" : "เต็มจอ"} aria-label={expanded ? "ออกจากเต็มจอ" : "เต็มจอ"}>
            {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="unified-schedule-scroll">
        <div className="unified-schedule-canvas" style={{ width: `${LEFT_WIDTH + chartWidth}px` }}>
          <div className="unified-schedule-row unified-schedule-header" style={{ gridTemplateColumns: `${LEFT_WIDTH}px ${chartWidth}px` }}>
            <div className="unified-schedule-left unified-schedule-left-columns">
              <span>ลำดับ / งาน (WBS)</span>
              <span>ผู้รับผิดชอบ</span>
              <span>วันเริ่ม</span>
              <span>วันสิ้นสุด</span>
              <span>% งาน</span>
              <span>หมายเหตุ</span>
            </div>
            <div className="unified-schedule-timeline-head" style={{ width: `${chartWidth}px` }}>
              {timeline.monthGroups.map((month) => (
                <span key={`${month.label}-${month.left}`} className="unified-schedule-month" style={{ left: `${month.left}%`, width: `${month.width}%` }}>
                  {month.label}
                </span>
              ))}
              <div className="unified-schedule-ticks">
                {timeline.dayTicks.map((tick) => (
                  <span key={tick.key} className={tick.left >= 97 ? "is-end" : ""} style={{ left: `${tick.left}%` }}>
                    <small>{new Intl.DateTimeFormat("th-TH", { weekday: "short" }).format(tick.date)}</small>
                    <strong>{tick.date.getDate()}</strong>
                  </span>
                ))}
              </div>
              {todayLeft !== null && <span className="unified-schedule-today-head" style={{ left: `${todayLeft}%` }}>วันนี้</span>}
              {milestonePositions.map(({ milestone, left }) => (
                <button
                  key={milestone.milestone_id}
                  type="button"
                  className="unified-schedule-milestone-head"
                  style={{ left: `${left}%`, backgroundColor: milestone.color || "#475569" }}
                  title={`${milestone.title} · ${formatDateShort(milestone.date)}`}
                  aria-label={`Milestone ${milestone.title}`}
                  onClick={() => onEditMilestone(milestone)}
                />
              ))}
            </div>
          </div>

          {loading ? (
            <div className="unified-schedule-loading"><Loader2 size={20} className="animate-spin" /> กำลังโหลดแผนงาน...</div>
          ) : displayTasks.length === 0 ? (
            <div className="unified-schedule-loading">ยังไม่มีงานที่แสดงในแผนงาน</div>
          ) : displayTasks.map((task) => {
            const isHeading = isHeadingTask(task);
            const depth = getTaskDepth(task, taskMap);
            const outlineNumber = getTaskOutlineNumber(task, tasks, allTasks);
            const plannedStart = parseDate(task.planned_start) || parseDate(task.start) || parseDate(task.end);
            const plannedEnd = parseDate(task.planned_end) || parseDate(task.end) || plannedStart;
            const intersectsTimeline = Boolean(plannedStart && plannedEnd && plannedStart <= timeline.end && plannedEnd >= timeline.start);
            const visibleStart = plannedStart ? maxDate(plannedStart, timeline.start) : timeline.start;
            const visibleEnd = plannedEnd ? minDate(plannedEnd, timeline.end) : visibleStart;
            const left = percentBetween(visibleStart, timeline.start, timeline.totalDays);
            const right = percentBetween(visibleEnd, timeline.start, timeline.totalDays);
            const plannedWidth = intersectsTimeline ? Math.max(0.9, right - left) : 0;
            const barColor = getTaskCategoryColor(task, taskMap);

            return (
              <div
                key={task.task_id}
                className={`unified-schedule-row ${isHeading ? "is-heading" : ""}`}
                style={{
                  gridTemplateColumns: `${LEFT_WIDTH}px ${chartWidth}px`,
                  ...(isHeading ? { "--heading-color": barColor } : {}),
                } as React.CSSProperties}
              >
                <div className="unified-schedule-left unified-schedule-left-columns">
                  <div className="unified-schedule-task-cell group" style={{ paddingLeft: `${12 + Math.min(depth, 5) * 16}px` }}>
                    <span className="unified-schedule-wbs">{outlineNumber}</span>
                    {isHeading && (
                      <button type="button" onClick={() => onToggleHeading(task.task_id)} className="unified-schedule-collapse" aria-label={task.is_collapsed ? "เปิดหมวดงาน" : "ย่อหมวดงาน"}>
                        {task.is_collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      </button>
                    )}
                    <div className="unified-schedule-task-copy">
                      <InlineScheduleCell
                        value={task.name}
                        buttonClassName="unified-schedule-task-name is-clickable"
                        inputClassName="unified-schedule-task-name unified-schedule-cell-input is-name"
                        ariaLabel={`แก้ไขชื่องาน ${task.name}`}
                        required
                        onCommit={(name) => saveInlineName(task, name)}
                      />
                    </div>
                    <span className="unified-schedule-task-actions">
                      {isHeading && <button type="button" onClick={() => onCreateSubtask(task.task_id)} title="เพิ่มงานย่อย"><Plus size={13} /></button>}
                      <button type="button" onClick={() => onEditTask(task)} title="แก้ไขงาน"><Edit3 size={13} /></button>
                      <button type="button" onClick={() => onDeleteTask(task)} title="ลบงาน"><Trash2 size={13} /></button>
                    </span>
                  </div>
                  {isHeading ? (
                    <span />
                  ) : (
                    <InlineScheduleCell
                      value={task.assignee || ""}
                      buttonClassName="unified-schedule-inline-edit"
                      inputClassName="unified-schedule-cell-input"
                      ariaLabel={`แก้ไขผู้รับผิดชอบของ ${task.name}`}
                      onCommit={(assignee) => saveInlineAssignee(task, assignee)}
                    />
                  )}
                  {isHeading ? (
                    <span>{formatDateShort(task.planned_start || task.start)}</span>
                  ) : (
                    <InlineScheduleCell
                      value={task.planned_start || task.start || ""}
                      displayValue={formatDateShort(task.planned_start || task.start)}
                      inputType="date"
                      buttonClassName="unified-schedule-inline-edit is-date"
                      inputClassName="unified-schedule-cell-input is-date"
                      ariaLabel={`แก้ไขวันเริ่มของ ${task.name}`}
                      onCommit={(start) => saveInlineDate(task, "start", start)}
                    />
                  )}
                  {isHeading ? (
                    <span>{formatDateShort(task.planned_end || task.end)}</span>
                  ) : (
                    <InlineScheduleCell
                      value={task.planned_end || task.end || ""}
                      displayValue={formatDateShort(task.planned_end || task.end)}
                      inputType="date"
                      buttonClassName="unified-schedule-inline-edit is-date"
                      inputClassName="unified-schedule-cell-input is-date"
                      ariaLabel={`แก้ไขวันสิ้นสุดของ ${task.name}`}
                      onCommit={(end) => saveInlineDate(task, "end", end)}
                    />
                  )}
                  {isHeading ? (
                    <span className="unified-schedule-progress-value">{normalizeProgressValue(task.percent_done)}%</span>
                  ) : (
                    <InlineScheduleCell
                      value={normalizeProgressValue(task.percent_done)}
                      displayValue={`${normalizeProgressValue(task.percent_done)}%`}
                      inputType="number"
                      inputMin={0}
                      inputMax={100}
                      buttonClassName="unified-schedule-inline-edit is-progress"
                      inputClassName="unified-schedule-cell-input is-progress"
                      ariaLabel={`แก้ไขเปอร์เซ็นต์ความคืบหน้าของ ${task.name}`}
                      onCommit={(progress) => saveInlineProgress(task, progress)}
                    />
                  )}
                  <InlineScheduleCell
                    value={task.notes || ""}
                    buttonClassName="unified-schedule-inline-edit is-note"
                    inputClassName="unified-schedule-cell-input is-note"
                    ariaLabel={`แก้ไขหมายเหตุของ ${task.name}`}
                    onCommit={(notes) => saveInlineNotes(task, notes)}
                  />
                </div>
                <div
                  className={`unified-schedule-chart-cell ${!isHeading ? "is-editable" : ""}`}
                  onClick={() => !isHeading && onEditTaskDate(task)}
                  title={isHeading ? undefined : "แก้ไขวันที่เริ่มและสิ้นสุด"}
                >
                  {timeline.dayTicks.map((tick) => <i key={tick.key} className="unified-schedule-gridline" style={{ left: `${tick.left}%` }} />)}
                  {milestonePositions.map(({ milestone, left: milestoneLeft }) => (
                    <i key={milestone.milestone_id} className="unified-schedule-milestone-line" style={{ left: `${milestoneLeft}%`, borderColor: milestone.color || "#94a3b8" }} />
                  ))}
                  {todayLeft !== null && <i className="unified-schedule-today-line" style={{ left: `${todayLeft}%` }} />}
                  {intersectsTimeline && (
                    <>
                      <span
                        className="unified-schedule-plan-bar"
                        style={{ left: `${left}%`, width: `${plannedWidth}%` }}
                        title={`แผน ${formatDateShort(task.planned_start || task.start)} - ${formatDateShort(task.planned_end || task.end)}`}
                      />
                      {isHeading && <span className="unified-schedule-end-marker" style={{ left: `${right}%` }} />}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <footer className="unified-schedule-legend" aria-label="คำอธิบายสัญลักษณ์">
        <span><i className="is-plan" /> แผน</span>
        <span><i className="is-milestone" /> เหตุการณ์สำคัญ (Milestone)</span>
      </footer>
    </section>
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
  showDatedOnly,
  onToggleDatedOnly,
  datedTaskCount,
  totalTaskCount,
  expanded,
  onToggleExpanded,
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
  showDatedOnly: boolean;
  onToggleDatedOnly: () => void;
  datedTaskCount: number;
  totalTaskCount: number;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.task_id, task])), [tasks]);
  const hiddenUndatedCount = Math.max(0, totalTaskCount - datedTaskCount);

  return (
    <div className={`${expanded ? "fixed inset-4 z-[80] flex max-h-[calc(100vh-2rem)] flex-col" : "flex flex-col"} bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden`}>
      <div className="gantt-panel-heading flex flex-col gap-4 border-l-4 border-orange-600 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-2xl font-bold text-gray-900">แผนภูมิแกนต์ (Gantt Chart)</h3>
          <p className="text-sm text-gray-500 mt-1">
            ช่วงเวลา: {dateRangeLabel(timeline.start, timeline.end)}
            {showDatedOnly && hiddenUndatedCount > 0 ? ` · ซ่อนงานที่ยังไม่ใส่วันที่ ${hiddenUndatedCount} รายการ` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onToggleDatedOnly}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition ${showDatedOnly ? "border-orange-300 bg-orange-50 text-orange-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
            title="แสดงเฉพาะงานที่ใส่วันที่แล้ว"
          >
            <CalendarDays size={16} />
            เฉพาะงานมีวันที่
            <span className="rounded-md bg-white px-1.5 py-0.5 text-xs text-gray-500">{datedTaskCount}/{totalTaskCount}</span>
          </button>
          <button
            type="button"
            onClick={onToggleExpanded}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
            title={expanded ? "ย่อ Gantt Chart" : "ขยาย Gantt Chart"}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {expanded ? "ย่อ" : "ขยาย"}
          </button>
        </div>
      </div>

      <div className={`gantt-scroll min-h-0 overflow-auto ${expanded ? "flex-1" : "max-h-[620px]"}`}>
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
              <div className="h-80 grid place-items-center text-gray-400">
                {showDatedOnly ? "ยังไม่มีงานที่ใส่วันที่สำหรับ Gantt Chart" : "ยังไม่มี task สำหรับโครงการนี้"}
              </div>
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
              const taskDepth = getTaskDepth(task, taskMap);
              const taskLevelLabel = getTaskLevelLabel(task, taskMap);
              const headingDisplay = getHeadingDisplay(taskDepth);
              const ganttTone = getGanttHeadingTone(taskDepth);

              return (
                <div
                  key={task.task_id}
                  onClick={() => quickDateEdit && !isHeading && onEditTaskDate?.(task)}
                  className={`grid grid-cols-[300px_1fr] min-h-[60px] border-b ${quickDateEdit && !isHeading ? "cursor-pointer hover:bg-orange-50/30" : ""} ${isHeading ? ganttTone.row : "border-gray-100 gantt-child-row"}`}
                >
                  <div className={`px-5 py-3 border-r flex items-center justify-between gap-3 ${isHeading ? ganttTone.left : "border-gray-100 bg-white"}`} style={{ paddingLeft: `${isHeading ? 18 + Math.min(taskDepth, 5) * 28 : 48 + Math.min(taskDepth, 5) * 16}px` }}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {isHeading && onToggleHeading && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleHeading(task.task_id);
                            }}
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded ${headingDisplay.toggle}`}
                            title={task.is_collapsed ? "เปิดหัวข้อย่อย" : "ซ่อนหัวข้อย่อย"}
                            aria-label={task.is_collapsed ? "เปิดหัวข้อย่อย" : "ซ่อนหัวข้อย่อย"}
                          >
                            {task.is_collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          </button>
                        )}
                        <span className={`gantt-category-dot ${isHeading ? "w-3 h-3 rounded-[3px]" : "w-2.5 h-2.5 rounded-full"}`} style={{ backgroundColor: isHeading ? ganttTone.dot : color, borderColor: isHeading ? ganttTone.dot : color }} />
                        <strong className={`${isHeading ? "text-base" : "text-sm text-gray-900"} truncate`}>{task.name}</strong>
                      </div>
                      <div className={`mt-1 flex flex-wrap items-center gap-1.5 pl-5 text-xs ${isHeading ? ganttTone.meta : "text-gray-500"}`}>
                        <span>{isHeading ? taskLevelLabel : `${taskLevelLabel} • ${task.assignee || "-"}`}</span>
                        {!isHeading && task.linked_vo_id && (
                          <span className="rounded-md bg-orange-50 px-1.5 py-0.5 font-extrabold text-orange-700">
                            {task.vo_badge || "VO"} · {task.linked_vo_id}
                          </span>
                        )}
                      </div>
                    </div>
                    {!isHeading && <span className="px-2 py-1 bg-red-50 text-red-600 rounded-md text-xs font-bold">{progress}%</span>}
                  </div>
                  <div className={`relative ${isHeading ? ganttTone.chart : "bg-white"}`}>
                    {hasTaskDates ? (
                      <div
                        className={`gantt-task-bar absolute top-1/2 -translate-y-1/2 rounded-md text-xs font-bold flex items-center px-3 overflow-hidden shadow-sm ${isHeading ? "h-5" : "h-8"}`}
                        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: isHeading ? ganttTone.bar : color, borderColor: isHeading ? ganttTone.bar : color, boxShadow: `inset 0 0 0 999px ${isHeading ? ganttTone.bar : color}`, color: isHeading ? ganttTone.barText : "#ffffff" }}
                        title={`${task.name}: ${formatDateShort(task.start)} - ${formatDateShort(task.end)}`}
                      >
                        {!isHeading && <span className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${progress}%` }} />}
                        <span className="relative truncate">{task.name}</span>
                      </div>
                    ) : (
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 rounded-md border border-dashed border-gray-200 px-3 py-1 text-xs font-semibold text-gray-400">
                        ยังไม่ได้ใส่วันที่
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
  const phaseOptions = Array.from(new Set([
    ...CUSTOMER_DECISION_PHASES,
    ...decisions.map((decision) => decision.phase).filter(Boolean),
  ]));

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
                {phaseOptions.map((phase) => (
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
          <div className="mb-4 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm md:grid-cols-5">
            {[
              ["1", "เพิ่มรายการ", "เลือกหมวดหรือเขียนเอง"],
              ["2", "สร้าง PDF", "ออกเอกสารให้ลูกค้าดู"],
              ["3", "ส่ง LINE", "แนบ PDF และลิงก์อนุมัติ"],
              ["4", "บันทึกผล", "เติมผู้ยืนยันและหลักฐาน"],
              ["5", "PDF สมบูรณ์", "สร้างใหม่พร้อมหลักฐานครบ"],
            ].map(([step, title, detail]) => (
              <div key={step} className="rounded-xl bg-white px-3 py-3 shadow-sm">
                <div className="text-xs font-black text-blue-500">STEP {step}</div>
                <div className="mt-1 font-extrabold text-gray-900">{title}</div>
                <div className="mt-0.5 text-xs font-medium text-gray-500">{detail}</div>
              </div>
            ))}
          </div>

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
  const hasPdf = Boolean(decision.pdf_url);
  const sendDisabled = saving || !hasPdf;

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
            disabled={sendDisabled}
            onClick={() => onNotifyLine(decision)}
            title={hasPdf ? "ส่ง LINE ให้ลูกค้า" : "กรุณาสร้าง PDF ก่อนส่ง LINE"}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-extrabold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            <Send size={14} />
            {hasPdf ? "ส่ง LINE ให้ลูกค้า" : "รอสร้าง PDF"}
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
              {evidenceCount} ไฟล์{hasPdf ? ` / ${decision.document_no || "PDF ออกแล้ว"}` : " / ยังไม่สร้าง PDF"}
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
            บันทึกผล/หลักฐาน
          </button>
          <button type="button" onClick={() => onIssuePdf(decision)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">
            <FileText size={14} />
            {hasPdf ? "สร้าง PDF ใหม่" : "สร้าง PDF"}
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
          ) : decisions.map((decision) => {
            const hasPdf = Boolean(decision.pdf_url);

            return (
              <tr key={decision.decision_id} className="align-top hover:bg-orange-50/30">
                <td className="px-5 py-4 font-bold text-gray-900">{decision.phase}</td>
                <td className="px-5 py-4">
                  <div className="font-extrabold text-gray-950">{decision.title}</div>
                  {decision.result_note ? <div className="mt-1 text-xs text-gray-500">ผลตัดสินใจ: {decision.result_note}</div> : null}
                  {decision.evidence_note ? <div className="mt-1 text-xs text-gray-500">หลักฐาน: {decision.evidence_note}</div> : null}
                  <div className="mt-1 text-xs text-gray-400">ไฟล์แนบ {parseDecisionEvidence(decision.evidence_files_json).length} ไฟล์{hasPdf ? ` / ${decision.document_no || "PDF ออกแล้ว"}` : " / ยังไม่สร้าง PDF"}</div>
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
                    <button disabled={saving || !hasPdf} onClick={() => onNotifyLine(decision)} className="rounded-lg bg-slate-950 p-2 text-white hover:bg-slate-800 disabled:opacity-60" title={hasPdf ? "ส่ง LINE ให้ลูกค้า" : "กรุณาสร้าง PDF ก่อนส่ง LINE"}>
                      <Send size={15} />
                    </button>
                    <button onClick={() => onEdit(decision)} className="rounded-lg p-2 text-gray-400 hover:bg-orange-50 hover:text-orange-600" title="บันทึกผล/หลักฐาน">
                      <Edit3 size={15} />
                    </button>
                    <button disabled={saving} onClick={() => onIssuePdf(decision)} className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-60" title={hasPdf ? "สร้าง PDF ใหม่" : "สร้าง PDF"}>
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InlineTaskProgress({
  task,
  saving,
  onProgressChange,
}: {
  task: Task;
  saving: boolean;
  onProgressChange: (task: Task, progress: string) => Promise<boolean>;
}) {
  const savedProgress = normalizeProgressValue(task.percent_done);
  const [currentProgress, setCurrentProgress] = useState(savedProgress);

  const commitProgress = async () => {
    const nextProgress = normalizeProgressValue(currentProgress);
    if (nextProgress === savedProgress || saving) return;

    const saved = await onProgressChange(task, nextProgress);
    if (!saved) setCurrentProgress(savedProgress);
  };

  return (
    <div
      className="flex w-44 items-center gap-2"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={currentProgress}
        disabled={saving}
        onChange={(event) => setCurrentProgress(normalizeProgressValue(event.target.value))}
        onPointerUp={() => void commitProgress()}
        onBlur={() => void commitProgress()}
        onKeyUp={(event) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Enter"].includes(event.key)) {
            void commitProgress();
          }
        }}
        className="h-2 w-28 cursor-pointer accent-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={`Progress ${task.name}`}
      />
      <span className="w-10 text-right text-xs font-bold text-orange-700">{currentProgress}%</span>
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
  allTasks,
  loading,
  saving,
  projectName,
  onCreateTask,
  onEditTask,
  onStatusChange,
}: {
  tasks: Task[];
  allTasks: Task[];
  loading: boolean;
  saving: boolean;
  projectName: string;
  onCreateTask: () => void;
  onEditTask: (task: Task) => void;
  onStatusChange: (task: Task, status: string) => Promise<boolean>;
}) {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const taskMap = useMemo(() => new Map(allTasks.map((task) => [task.task_id, task])), [allTasks]);
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

function ScheduleTemplateModal({
  categories,
  selectedCategoryIds,
  loading,
  importing,
  onToggleCategory,
  onSelectAll,
  onClear,
  onClose,
  onImport,
}: {
  categories: ScheduleTemplateCategory[];
  selectedCategoryIds: string[];
  loading: boolean;
  importing: boolean;
  onToggleCategory: (categoryId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onClose: () => void;
  onImport: () => void;
}) {
  const selectedCount = categories
    .filter((category) => selectedCategoryIds.includes(category.id))
    .reduce((sum, category) => sum + category.taskCount, 0);

  return (
    <div className="schedule-screen-only schedule-modal-backdrop fixed inset-0 z-50 flex bg-black/40 backdrop-blur-sm">
      <div className="schedule-modal-panel w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 p-5">
          <div>
            <h3 className="text-lg font-bold text-gray-900">เติมโครงสร้างแผนงานจากแม่แบบ</h3>
            <p className="mt-1 text-sm text-gray-500">{selectedCategoryIds.length} หมวด | {selectedCount} รายการงาน</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="schedule-modal-body p-5">
          <p className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
            ระบบจะใช้หัวข้อเดิมและเติมเฉพาะระดับงานที่ขาด โดยไม่เปลี่ยนวันหรือความคืบหน้าของรายการเดิม
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" onClick={onSelectAll} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-orange-300 hover:text-orange-700">
              เลือกทั้งหมด
            </button>
            <button type="button" onClick={onClear} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-red-300 hover:text-red-600">
              ล้างที่เลือก
            </button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm font-semibold text-gray-500">
              <Loader2 size={16} className="animate-spin" />
              กำลังโหลดแม่แบบ
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {categories.map((category) => {
                const checked = selectedCategoryIds.includes(category.id);

                return (
                  <label
                    key={category.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                      checked ? "border-orange-300 bg-orange-50" : "border-gray-200 bg-white hover:border-orange-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleCategory(category.id)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-200"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-extrabold text-gray-900">{category.wbs} {category.name}</span>
                      <span className="mt-1 block text-xs font-semibold text-gray-500">{category.taskCount} รายการ</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-gray-100 p-5">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-medium text-gray-600 transition hover:bg-gray-100">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onImport}
            disabled={importing || loading || selectedCategoryIds.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 font-medium text-white transition hover:bg-orange-700 disabled:opacity-70"
          >
            {importing ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
            เติมโครงสร้างแผนงาน
          </button>
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
  const parentTaskMap = new Map(parentOptions.map((task) => [task.task_id, task]));
  const currentTaskId = form.task_id || "";
  const availableParents = parentOptions.filter((task) => (
    task.task_id !== form.task_id &&
    task._rowIndex !== form._rowIndex &&
    !(() => {
      if (!currentTaskId) return false;
      let parentId = task.parent_task_id || "";
      const seen = new Set<string>();
      while (parentId && !seen.has(parentId)) {
        if (parentId === currentTaskId) return true;
        seen.add(parentId);
        parentId = parentTaskMap.get(parentId)?.parent_task_id || "";
      }
      return false;
    })()
  ));
  const isHeadingForm = form.task_type === "heading";
  const headingSelectValue = isHeadingForm && TASK_CATEGORIES.includes(form.name) ? form.name : CUSTOM_HEADING_VALUE;

  return (
    <div className="schedule-screen-only schedule-modal-backdrop fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex">
      <div className="schedule-modal-panel bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-gray-100 flex shrink-0 items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{form.task_id || form._rowIndex ? "แก้ไขแผนงาน" : "เพิ่มแผนงาน"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="schedule-modal-body p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="ประเภทงาน">
              <select
                value={form.task_type}
                onChange={(event) => {
                  const nextType = event.target.value;
                  onChange((prev) => ({
                    ...prev,
                    task_type: nextType,
                    name: nextType === "heading"
                      ? prev.name || (prev.parent_task_id ? "" : TASK_CATEGORIES[0])
                      : (TASK_CATEGORIES.includes(prev.name) ? "" : prev.name),
                    category: nextType === "heading"
                      ? (TASK_CATEGORIES.includes(prev.name) ? prev.name : prev.category)
                      : prev.category,
                  }));
                }}
                className="schedule-input"
              >
                {TASK_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </Field>
            <Field label="หัวข้อแม่">
              <select
                value={form.parent_task_id}
                onChange={(event) => onChange((prev) => ({ ...prev, parent_task_id: event.target.value }))}
                className="schedule-input"
              >
                <option value="">ไม่มี / เป็น H1</option>
                {availableParents.map((task) => (
                  <option key={task.task_id} value={task.task_id}>
                    {getTaskLevelLabel(task, parentTaskMap)} - {task.name}
                  </option>
                ))}
              </select>
            </Field>
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

          {isHeadingForm && (
            <Field label="ชื่อหัวข้อ / เลือกจากหมวดงาน">
              <select
                value={headingSelectValue}
                onChange={(event) => {
                  const value = event.target.value;
                  onChange((prev) => ({
                    ...prev,
                    name: value === CUSTOM_HEADING_VALUE ? "" : value,
                    category: value === CUSTOM_HEADING_VALUE ? prev.category : value,
                  }));
                }}
                className="schedule-input"
              >
                {TASK_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                <option value={CUSTOM_HEADING_VALUE}>อื่นๆ / กรอกเอง</option>
              </select>
            </Field>
          )}

          {(!isHeadingForm || headingSelectValue === CUSTOM_HEADING_VALUE) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{isHeadingForm ? "ชื่อหัวข้ออื่นๆ" : "ชื่องาน"}</label>
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
              หัวข้อเป็นกลุ่มงานได้หลายชั้น เช่น H1/H2/H3 วันที่ ระยะเวลา และความคืบหน้าจะคำนวณจากงานจริงใต้หัวข้อนั้นอัตโนมัติ
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
              <select
                value={form.status}
                onChange={(event) => onChange((prev) => ({ ...prev, ...buildTaskStatusPatch(event.target.value, prev.percent_done) }))}
                className="schedule-input"
              >
                {TASK_STATUSES.map((status) => <option key={status} value={status}>{TASK_STATUS_LABELS[status]}</option>)}
              </select>
            </Field>
            <Field label="ความคืบหน้า (%)">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={normalizeProgressValue(form.percent_done)}
                onChange={(event) => onChange((prev) => ({ ...prev, ...buildTaskProgressPatch(event.target.value) }))}
                className="w-full accent-orange-600"
              />
              <div className="mt-1 text-xs font-extrabold text-orange-700">{normalizeProgressValue(form.percent_done)}%</div>
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
    <div className="schedule-screen-only schedule-modal-backdrop fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex">
      <div className="schedule-modal-panel bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-gray-100 flex shrink-0 items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">แก้ไขวันที่ task</h3>
            <p className="text-sm text-gray-500 mt-1">{task.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="schedule-modal-body p-5 space-y-4">
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
    <div className="schedule-screen-only schedule-modal-backdrop fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex">
      <div className="schedule-modal-panel bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-gray-100 flex shrink-0 items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{form.milestone_id || form._rowIndex ? "แก้ไข Milestone" : "เพิ่ม Milestone"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="schedule-modal-body p-5 space-y-4">
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
  const phaseSelectValue = form.use_custom_phase ? CUSTOM_DECISION_PHASE_VALUE : form.phase;
  const isResultMode = Boolean(form.decision_id);

  return (
    <div className="schedule-screen-only fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{isResultMode ? "บันทึกผล/หลักฐานการตัดสินใจ" : "เพิ่มรายการต้องตัดสินใจ"}</h3>
            <p className="mt-1 text-sm text-gray-500">
              {isResultMode ? "เติมผลที่ลูกค้ายืนยัน พร้อมแนบหลักฐานประกอบหลังคุย LINE" : "สร้างรายการตั้งต้นเพื่อออก PDF และส่งให้ลูกค้าตัดสินใจ"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="max-h-[calc(92vh-84px)] space-y-4 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="ช่วงงาน / สถานะงาน">
              <select
                value={phaseSelectValue}
                onChange={(event) => {
                  const value = event.target.value;
                  onChange((prev) => ({
                    ...prev,
                    use_custom_phase: value === CUSTOM_DECISION_PHASE_VALUE,
                    phase: value === CUSTOM_DECISION_PHASE_VALUE ? prev.phase : value,
                    custom_phase: value === CUSTOM_DECISION_PHASE_VALUE ? prev.custom_phase : "",
                  }));
                }}
                className="schedule-input"
              >
                {CUSTOMER_DECISION_PHASES.map((phase) => <option key={phase} value={phase}>{phase}</option>)}
                <option value={CUSTOM_DECISION_PHASE_VALUE}>อื่น ๆ / เขียนเอง</option>
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

          {form.use_custom_phase ? (
            <Field label="ช่วงงานที่เขียนเอง">
              <input
                required
                value={form.custom_phase}
                onChange={(event) => onChange((prev) => ({ ...prev, custom_phase: event.target.value }))}
                className="schedule-input"
                placeholder="เช่น งานบิวท์อิน, งานระบบไฟ, รายการเฉพาะหน้างาน"
              />
            </Field>
          ) : null}

          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {isResultMode ? (
              <>
                Flow แนะนำ: บันทึกผู้ยืนยัน วันที่ ผลการตัดสินใจ และหลักฐาน จากนั้นกด <strong>สร้าง PDF ใหม่</strong> ที่การ์ดรายการเพื่อออกเอกสารฉบับสมบูรณ์
              </>
            ) : (
              <>
                Flow แนะนำ: บันทึกรายการนี้ก่อน จากนั้นกด <strong>สร้าง PDF</strong> แล้วค่อยกด <strong>ส่ง LINE ให้ลูกค้า</strong> ที่การ์ดรายการ
              </>
            )}
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

          {isResultMode ? (
            <>
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
            </>
          ) : null}

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-bold text-gray-900">{isResultMode ? "แนบหลักฐาน" : "แนบรูปภาพประกอบ"}</div>
                <p className="mt-1 text-xs font-medium text-gray-500">
                  {isResultMode ? "รองรับรูปภาพ แคปหน้าจอ LINE หรือไฟล์เอกสารประกอบ" : "ใช้แนบรูปภาพประกอบรายการก่อนสร้าง PDF ส่งให้ลูกค้าตัดสินใจ"}
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
                <Upload size={16} />
                {isResultMode ? "เลือกไฟล์หลักฐาน" : "เลือกไฟล์ประกอบ"}
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

            {isResultMode && existingEvidence.length > 0 ? (
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
              {isResultMode ? "บันทึกผล/หลักฐาน" : "บันทึกรายการ"}
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
  const rowPages = chunkPlanPrintRows(tasks, PLAN_PRINT_ROWS_PER_PAGE);
  const totalPages = rowPages.length;
  const printedAt = new Intl.DateTimeFormat("th-TH", { dateStyle: "long" }).format(new Date());
  const taskMap = new Map(tasks.map((task) => [task.task_id, task]));

  return (
    <div className={`schedule-print-doc plan-print-doc ${active ? "is-printing" : ""}`}>
      {rowPages.map((rowTasks, pageIndex) => (
        <section key={`plan-page-${pageIndex}`} className="plan-print-page">
          <PrintHeader title="Project Schedule / แผนงานโครงการ" project={project} />
          <PrintMetaGrid
            items={[
              { label: "วันที่พิมพ์", value: printedAt },
              { label: "หัวข้อหลัก", value: headingCount },
              { label: "งานย่อยที่แสดง", value: workTasks.length },
              { label: "ความครบถ้วนแผน", value: `${stats.average}%` },
              { label: "หน้า", value: `${pageIndex + 1} / ${totalPages}` },
              { label: "แถวในหน้านี้", value: rowTasks.length },
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
              {rowTasks.map((task) => {
                const isHeading = isHeadingTask(task);
                const outline = getTaskOutlineNumber(task, tasks, tasks);
                const taskDepth = getTaskDepth(task, taskMap);

                if (isHeading) {
                  return (
                    <tr key={task.task_id} className={`print-heading-task print-heading-depth-${Math.min(taskDepth, 2)}`}>
                      <td>{outline}</td>
                      <td colSpan={8} style={{ paddingLeft: `${8 + Math.min(taskDepth, 5) * 18}px` }}>
                        <strong>{task.name}</strong>
                        <span>{task.summary_child_count || 0} งานย่อย | {formatDateShort(task.start)} - {formatDateShort(task.end)}</span>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={task.task_id}>
                    <td>{outline}</td>
                    <td className="print-child-task-name" style={{ paddingLeft: `${18 + Math.min(taskDepth, 5) * 14}px` }}>{task.name}</td>
                    <td>{task.assignee || "-"}</td>
                    <td>{formatDateShort(task.start)}</td>
                    <td>{formatDateShort(task.end)}</td>
                    <td>{task.duration_days || daysBetween(task.start, task.end) || "-"}</td>
                    <td>{task.percent_done || 0}%</td>
                    <td>
                      <span className={`print-status-pill ${getTaskStatusTone(task.status).print}`}>
                        {TASK_STATUS_LABELS[task.status || "To Do"]}
                      </span>
                    </td>
                    <td>{task.notes || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pageIndex === totalPages - 1 ? <PrintSignatures /> : null}
        </section>
      ))}
    </div>
  );
}

function GanttPrintDocument({
  active,
  project,
  tasks,
  milestones,
  timeline,
  todayLeft,
}: {
  active: boolean;
  project?: Project;
  tasks: Task[];
  milestones: Milestone[];
  timeline: Timeline;
  todayLeft: number | null;
}) {
  const printSegments = buildGanttPrintSegments(timeline);
  const rowPages = chunkList(tasks, GANTT_PRINT_ROWS_PER_PAGE);
  const totalPages = printSegments.length * rowPages.length;
  const printedAt = new Intl.DateTimeFormat("th-TH", { dateStyle: "long" }).format(new Date());

  return (
    <div className={`schedule-print-doc gantt-print-doc ${active ? "is-printing" : ""}`}>
      {printSegments.flatMap((segment, segmentIndex) => rowPages.map((rowTasks, rowPageIndex) => {
        const pageNumber = segmentIndex * rowPages.length + rowPageIndex + 1;
        return (
          <section key={`${segment.index}-${rowPageIndex}`} className="gantt-print-page">
            <PrintHeader title="Construction Schedule / แผนงานก่อสร้าง WBS และ Gantt" project={project} />
            <PrintMetaGrid
              items={[
                { label: "วันที่พิมพ์", value: printedAt },
                { label: "ช่วงเวลาโครงการ", value: dateRangeLabel(timeline.start, timeline.end) },
                { label: "หน้า", value: `${pageNumber} / ${totalPages}` },
                { label: "รายการในหน้านี้", value: `${rowTasks.length} / ${tasks.length}` },
              ]}
            />
            <GanttPrintSvg
              tasks={rowTasks}
              allTasks={tasks}
              milestones={milestones}
              segment={segment}
              today={todayLeft === null ? null : new Date()}
            />
            {pageNumber === totalPages ? <PrintSignatures /> : null}
          </section>
        );
      }))}
    </div>
  );
}

function GanttPrintSvg({
  tasks,
  allTasks,
  milestones,
  segment,
  today,
}: {
  tasks: Task[];
  allTasks: Task[];
  milestones: Milestone[];
  segment: GanttPrintSegment;
  today: Date | null;
}) {
  const taskMap = new Map(allTasks.map((task) => [task.task_id, task]));
  const ticks = buildGanttPrintTicks(segment);
  const monthMarkers = buildGanttPrintMonthMarkers(segment);
  const monthLabels = monthMarkers.some((date) => toInputDate(date) === toInputDate(segment.start))
    ? monthMarkers
    : [segment.start, ...monthMarkers];
  const totalDays = Math.max(1, diffDays(segment.start, segment.end) + 1);
  const svgHeight = GANTT_PRINT_HEADER_HEIGHT + Math.max(1, tasks.length) * GANTT_PRINT_ROW_HEIGHT + 44;
  const chartX = GANTT_PRINT_LEFT_WIDTH;
  const rowStartY = GANTT_PRINT_HEADER_HEIGHT;

  const xForDate = (date: Date) => {
    const offset = diffDays(segment.start, date);
    return chartX + clamp(offset / totalDays, 0, 1) * GANTT_PRINT_CHART_WIDTH;
  };

  const xForEndDate = (date: Date) => {
    const offset = diffDays(segment.start, addDays(date, 1));
    return chartX + clamp(offset / totalDays, 0, 1) * GANTT_PRINT_CHART_WIDTH;
  };

  const todayX = today && today >= segment.start && today <= segment.end ? xForDate(today) : null;

  return (
    <svg className="gantt-print-svg" viewBox={`0 0 ${GANTT_PRINT_SVG_WIDTH} ${svgHeight}`} role="img" aria-label="Construction schedule WBS and Gantt chart">
      <rect x="0" y="0" width={GANTT_PRINT_SVG_WIDTH} height={svgHeight} fill="#ffffff" />
      <rect x="0" y="0" width={GANTT_PRINT_SVG_WIDTH} height={GANTT_PRINT_HEADER_HEIGHT} fill="#f8fafc" />
      <rect x="0" y="0" width={GANTT_PRINT_LEFT_WIDTH} height={GANTT_PRINT_HEADER_HEIGHT} fill="#ffffff" />
      <line x1="0" y1={GANTT_PRINT_HEADER_HEIGHT} x2={GANTT_PRINT_SVG_WIDTH} y2={GANTT_PRINT_HEADER_HEIGHT} stroke="#cbd5e1" strokeWidth="1.5" />
      <text x="18" y="31" fill="#0f172a" fontSize="17" fontWeight="800">WBS / งาน / ผู้รับผิดชอบ / วันที่</text>
      <text x="18" y="57" fill="#64748b" fontSize="11">รายการในหน้านี้ {tasks.length} รายการ</text>
      <g transform={`translate(${chartX + 18} 16)`}>
        <line x1="0" y1="0" x2="28" y2="0" stroke="#f97316" strokeWidth="5" />
        <text x="36" y="4" fill="#475569" fontSize="10" fontWeight="700">แผน</text>
      </g>

      {monthLabels.map((date) => {
        const x = xForDate(date);
        const alignEnd = x > chartX + GANTT_PRINT_CHART_WIDTH - 80;
        return (
          <g key={`month-${toInputDate(date)}`}>
            <line x1={x} y1="34" x2={x} y2={svgHeight} stroke="#cbd5e1" strokeWidth="1.2" strokeDasharray="5 5" />
            <text x={x + (alignEnd ? -6 : 6)} y="50" fill="#0f172a" fontSize="12" fontWeight="800" textAnchor={alignEnd ? "end" : "start"}>
              {new Intl.DateTimeFormat("th-TH", { month: "short", year: "2-digit" }).format(date)}
            </text>
          </g>
        );
      })}

      {ticks.map((date) => {
        const x = xForDate(date);
        const alignEnd = x > chartX + GANTT_PRINT_CHART_WIDTH - 45;
        return (
          <g key={`tick-${toInputDate(date)}`}>
            <line x1={x} y1="56" x2={x} y2={svgHeight} stroke="#e5e7eb" strokeWidth="1" />
            <text x={x + (alignEnd ? -4 : 4)} y="73" fill="#64748b" fontSize="10" textAnchor={alignEnd ? "end" : "start"}>
              {new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short" }).format(date)}
            </text>
          </g>
        );
      })}

      {todayX !== null ? (
        <g>
          <line x1={todayX} y1="0" x2={todayX} y2={svgHeight} stroke="#dc2626" strokeWidth="2.5" />
          <rect x={todayX - 28} y="7" width="56" height="20" rx="10" fill="#dc2626" />
          <text x={todayX} y="21" fill="#ffffff" fontSize="10" fontWeight="800" textAnchor="middle">TODAY</text>
        </g>
      ) : null}

      {tasks.length === 0 ? (
        <text x={GANTT_PRINT_SVG_WIDTH / 2} y={rowStartY + 36} fill="#64748b" fontSize="18" textAnchor="middle">No tasks in this page</text>
      ) : null}

      {tasks.map((task, index) => {
        const y = rowStartY + index * GANTT_PRINT_ROW_HEIGHT;
        const isHeading = isHeadingTask(task);
        const taskDepth = getTaskDepth(task, taskMap);
        const taskStart = parseDate(task.start) || parseDate(task.end);
        const taskEnd = parseDate(task.end) || taskStart;
        const categoryColor = getTaskCategoryColor(task, taskMap);
        const outline = getTaskOutlineNumber(task, allTasks, allTasks);
        const intersects = taskStart && taskEnd && taskStart <= segment.end && taskEnd >= segment.start;
        const barStart = taskStart ? maxDate(taskStart, segment.start) : segment.start;
        const barEnd = taskEnd ? minDate(taskEnd, segment.end) : segment.start;
        const barX = xForDate(barStart);
        const barW = Math.max(4, xForEndDate(barEnd) - barX);

        return (
          <g key={`${task.task_id}-${index}`}>
            <rect x="0" y={y} width={GANTT_PRINT_SVG_WIDTH} height={GANTT_PRINT_ROW_HEIGHT} fill={isHeading ? `${categoryColor}14` : (index % 2 === 0 ? "#ffffff" : "#fbfdff")} />
            {isHeading ? <rect x="0" y={y} width="5" height={GANTT_PRINT_ROW_HEIGHT} fill={categoryColor} /> : null}
            <line x1="0" y1={y + GANTT_PRINT_ROW_HEIGHT} x2={GANTT_PRINT_SVG_WIDTH} y2={y + GANTT_PRINT_ROW_HEIGHT} stroke="#e5e7eb" strokeWidth="1" />
            <line x1={GANTT_PRINT_LEFT_WIDTH} y1={y} x2={GANTT_PRINT_LEFT_WIDTH} y2={y + GANTT_PRINT_ROW_HEIGHT} stroke="#cbd5e1" strokeWidth="1.4" />
            <text x={16 + Math.min(taskDepth, 5) * 16} y={y + 15} fill={isHeading ? categoryColor : "#475569"} fontSize="11" fontWeight="800">{outline}</text>
            <text x={58 + Math.min(taskDepth, 5) * 16} y={y + 15} fill="#111827" fontSize={isHeading ? "13" : "12"} fontWeight={isHeading ? "800" : "500"}>
              {isHeading ? truncateText(task.name, Math.max(28, 52 - taskDepth * 4)) : truncateText(task.name, Math.max(24, 44 - taskDepth * 3))}
            </text>
            <text x={58 + Math.min(taskDepth, 5) * 16} y={y + 29} fill="#64748b" fontSize="10">
              {isHeading ? `${task.summary_child_count || 0} งานย่อย` : `${truncateText(task.assignee || "-", 18)} • ${formatDateShort(task.start)}-${formatDateShort(task.end)}`}
            </text>
            {intersects ? (
              <g>
                <rect x={barX} y={y + 14} width={barW} height="6" rx="3" fill="#f97316" />
                {isHeading && barW > 54 ? (
                  <text x={barX + 8} y={y + 30} fill="#475569" fontSize="9" fontWeight="800">
                    {truncateText(task.name, Math.max(8, Math.floor(barW / 8)))}
                  </text>
                ) : null}
              </g>
            ) : (
              <text x={chartX + 10} y={y + 24} fill="#94a3b8" fontSize="10">
                {taskStart && taskEnd ? "อยู่นอกช่วงที่เลือก" : "ยังไม่กำหนดวันที่"}
              </text>
            )}
          </g>
        );
      })}

      {milestones.map((milestone) => {
        const date = parseDate(milestone.date);
        if (!date || date < segment.start || date > segment.end) return null;
        const x = xForDate(date);
        return (
          <g key={milestone.milestone_id}>
            <line x1={x} y1="0" x2={x} y2={svgHeight} stroke={milestone.color || "#f97316"} strokeWidth="2" strokeDasharray="4 4" />
            <rect x={x - 5} y="36" width="10" height="10" transform={`rotate(45 ${x} 41)`} fill={milestone.color || "#f97316"} />
            <text x={x + 7} y="42" fill="#111827" fontSize="10" fontWeight="800">{truncateText(milestone.title, 24)}</text>
          </g>
        );
      })}
    </svg>
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
