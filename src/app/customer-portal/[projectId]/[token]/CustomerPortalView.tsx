"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Copy,
  FileCheck2,
  FileText,
  Image as ImageIcon,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { CustomerPortalAction, CustomerPortalData } from "@/lib/customerPortal";

type Response = { success: boolean; data: CustomerPortalData };
type PortalView = "overview" | "schedule" | "documents";
type ScheduleTask = CustomerPortalData["schedule"]["tasks"][number] & { summary_child_count?: number };
type PortalDocument = CustomerPortalData["documents"][number];
type DocumentFilter = "all" | "pending" | "approved" | "other";

const actionIcons = {
  decision: ClipboardCheck,
  vo: FileCheck2,
  qc: ListChecks,
  memo: FileText,
  defect: AlertCircle,
};

function dateValue(value: string) {
  if (!value) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+07:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string, fallback = "-") {
  const date = dateValue(value);
  if (!date) return value || fallback;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function hasTaskScheduleDates(task: Pick<ScheduleTask, "start" | "end">) {
  return Boolean(dateValue(task.start) || dateValue(task.end));
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function statusLabel(status: string) {
  return ({ "To Do": "ยังไม่เริ่ม", "In Progress": "กำลังดำเนินการ", Review: "รอตรวจ", Done: "เสร็จแล้ว" } as Record<string, string>)[status] || status || "-";
}

function taskOrder(task: ScheduleTask) {
  return Number(task.order_index || 0) || 999999;
}

function isHeadingTask(task: ScheduleTask) {
  return task.task_type === "heading";
}

function toInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getTaskDepth(task: ScheduleTask, taskMap: Map<string, ScheduleTask>) {
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

function getTaskLevelLabel(task: ScheduleTask, taskMap: Map<string, ScheduleTask>) {
  return `${isHeadingTask(task) ? "H" : "งาน H"}${getTaskDepth(task, taskMap) + 1}`;
}

function getScheduleHeadingDisplay(depth: number) {
  if (depth === 0) return { row: "bg-slate-950 text-white", badge: "bg-white/15 text-white", meta: "text-white/60" };
  if (depth === 1) return { row: "bg-amber-50 text-slate-950", badge: "bg-amber-100 text-amber-900", meta: "text-amber-800" };
  return { row: "bg-white text-slate-950", badge: "bg-slate-100 text-slate-700", meta: "text-slate-500" };
}

function summarizeHeading(task: ScheduleTask, descendants: ScheduleTask[]) {
  const workDescendants = descendants.filter((item) => !isHeadingTask(item));
  const dates = workDescendants
    .flatMap((item) => [dateValue(item.start), dateValue(item.end)])
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());
  const progress = workDescendants.length
    ? Math.round(workDescendants.reduce((sum, item) => sum + Number(item.percent_done || 0), 0) / workDescendants.length)
    : 0;

  return {
    ...task,
    start: dates[0] ? toInputDate(dates[0]) : "",
    end: dates[dates.length - 1] ? toInputDate(dates[dates.length - 1]) : "",
    percent_done: String(progress),
    summary_child_count: workDescendants.length,
  };
}

function buildTaskRows(tasks: ScheduleTask[]) {
  const sorted = [...tasks].sort((a, b) => taskOrder(a) - taskOrder(b));
  const taskIds = new Set(sorted.map((task) => task.task_id));
  const childrenByParent = new Map<string, ScheduleTask[]>();

  sorted.forEach((task) => {
    if (!task.parent_task_id || !taskIds.has(task.parent_task_id)) return;
    const current = childrenByParent.get(task.parent_task_id) || [];
    current.push(task);
    childrenByParent.set(task.parent_task_id, current);
  });

  const rows: ScheduleTask[] = [];
  const visited = new Set<string>();
  const collecting = new Set<string>();

  const collectDescendants = (task: ScheduleTask): ScheduleTask[] => {
    if (collecting.has(task.task_id)) return [];
    collecting.add(task.task_id);
    const descendants = (childrenByParent.get(task.task_id) || []).flatMap((child) => [child, ...collectDescendants(child)]);
    collecting.delete(task.task_id);
    return descendants;
  };

  const visit = (task: ScheduleTask) => {
    if (visited.has(task.task_id)) return;
    visited.add(task.task_id);
    const hasChildren = Boolean((childrenByParent.get(task.task_id) || []).length);
    rows.push(isHeadingTask(task) || hasChildren ? summarizeHeading({ ...task, task_type: "heading" }, collectDescendants(task)) : task);
    (childrenByParent.get(task.task_id) || []).forEach(visit);
  };

  sorted.forEach((task) => {
    if (!task.parent_task_id || !taskIds.has(task.parent_task_id)) visit(task);
  });
  sorted.forEach((task) => {
    if (!visited.has(task.task_id)) visit(task);
  });

  return rows;
}

function copyUrlWithFallback(url: string) {
  const fallbackCopy = () => {
    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  };

  if (!navigator.clipboard?.writeText) {
    fallbackCopy();
    return;
  }

  void navigator.clipboard.writeText(url).catch(fallbackCopy);
}

export default function CustomerPortalView({ projectId, token }: { projectId: string; token: string }) {
  const [view, setView] = useState<PortalView>("overview");
  const [copied, setCopied] = useState(false);
  const [scheduleTab, setScheduleTab] = useState<"plan" | "gantt">("plan");
  const key = `/api/customer-portal/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}`;
  const { data: response, error, isLoading, isValidating, mutate } = useSWR<Response>(key, fetcher, {
    refreshInterval: 20_000,
    revalidateOnFocus: true,
  });
  const data = response?.data;
  const currentUrl = typeof window === "undefined" ? "" : window.location.href;
  const timeline = useMemo(() => data?.timeline || [], [data?.timeline]);
  const tasks = useMemo(() => buildTaskRows(data?.schedule.tasks || []), [data?.schedule.tasks]);
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.task_id, task])), [tasks]);
  const workTasks = useMemo(() => tasks.filter((task) => !isHeadingTask(task)), [tasks]);
  const completedTasks = workTasks.filter((task) => task.status === "Done" || Number(task.percent_done || 0) >= 100).length;
  const inProgressTasks = workTasks.filter((task) => task.status === "In Progress").length;

  useEffect(() => {
    const syncView = () => {
      if (window.location.hash === "#schedule") setView("schedule");
      else if (window.location.hash === "#documents") setView("documents");
      else setView("overview");
    };
    syncView();
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, []);

  function copyPortalUrl() {
    copyUrlWithFallback(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8fa] text-slate-500">
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold shadow-sm">
          <RefreshCw className="animate-spin text-orange-600" size={18} />
          กำลังโหลดข้อมูลโครงการ
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8fa] p-5">
        <section className="max-w-md rounded-lg border border-red-100 bg-white p-7 text-center shadow-sm">
          <AlertCircle className="mx-auto text-red-600" size={34} />
          <h1 className="mt-4 text-xl font-extrabold text-slate-950">ไม่สามารถเปิด Customer Portal ได้</h1>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-500">ลิงก์อาจไม่ถูกต้อง หรือข้อมูลโครงการยังไม่พร้อมใช้งาน</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-950">
      <div className="mx-auto grid min-h-screen max-w-[1500px] grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-white px-5 py-5 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r lg:py-7">
          <div className="flex items-center justify-between gap-4 lg:block">
            <div>
              <p className="text-xl font-black tracking-tight text-slate-950">PMC CONNEXT</p>
              <p className="mt-1 text-xs font-bold uppercase text-slate-400">Customer Portal</p>
            </div>
            <button
              type="button"
              onClick={copyPortalUrl}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 lg:mt-6 lg:w-full lg:gap-2 lg:px-3"
              title="คัดลอกลิงก์"
            >
              <Copy size={17} />
              <span className="hidden text-sm font-extrabold lg:inline">{copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}</span>
            </button>
          </div>

          <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:mt-6 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
            <NavItem href="#overview" icon={ShieldCheck} label="ภาพรวม" active={view === "overview"} onClick={() => setView("overview")} />
            <NavItem href="#schedule" icon={CalendarDays} label="แผนงาน" active={view === "schedule"} onClick={() => setView("schedule")} />
            <NavItem href="#documents" icon={FileText} label="เอกสาร" active={view === "documents"} onClick={() => setView("documents")} />
          </nav>

          <div className="mt-6 hidden rounded-lg border border-slate-200 bg-slate-50 p-3 lg:block">
            <p className="text-xs font-bold text-slate-500">ลิงก์อ่านอย่างเดียว</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">ใช้สำหรับติดตามสถานะโครงการ ไม่สามารถแก้ไขข้อมูลหลังบ้านได้</p>
          </div>
        </aside>

        {view === "overview" ? (
          <OverviewView
            data={data}
            timeline={timeline}
            currentUrl={currentUrl}
            copied={copied}
            isValidating={isValidating}
            onRefresh={() => mutate()}
            onCopy={copyPortalUrl}
          />
        ) : view === "schedule" ? (
          <ScheduleView
            data={data}
            tasks={tasks}
            taskMap={taskMap}
            workTasks={workTasks}
            completedTasks={completedTasks}
            inProgressTasks={inProgressTasks}
            tab={scheduleTab}
            setTab={setScheduleTab}
            isValidating={isValidating}
            onRefresh={() => mutate()}
          />
        ) : (
          <DocumentsView data={data} isValidating={isValidating} onRefresh={() => mutate()} />
        )}
      </div>
    </main>
  );
}

function NavItem({ href, icon: Icon, label, active = false, onClick }: { href: string; icon: typeof ShieldCheck; label: string; active?: boolean; onClick: () => void }) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-extrabold transition ${active ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-950"}`}
    >
      <Icon size={17} />
      {label}
    </a>
  );
}

function OverviewView({
  data,
  timeline,
  currentUrl,
  copied,
  isValidating,
  onRefresh,
  onCopy,
}: {
  data: CustomerPortalData;
  timeline: CustomerPortalData["timeline"];
  currentUrl: string;
  copied: boolean;
  isValidating: boolean;
  onRefresh: () => void;
  onCopy: () => void;
}) {
  return (
    <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-orange-600 px-2.5 py-1 text-xs font-black text-white">{data.project.project_id}</span>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{data.project.name}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {data.project.client || "ลูกค้า"} / {formatDate(data.project.start_date)} - {formatDate(data.project.end_date)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
            <Wifi size={15} />
            อัปเดตอัตโนมัติ
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={15} className={isValidating ? "animate-spin" : ""} />
            ล่าสุด {formatTime(data.updated_at)}
          </button>
        </div>
      </header>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <section id="overview" className="scroll-mt-6 grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
            <ProgressPanel progress={data.metrics.progress} />
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <OverviewMetric label="งานทั้งหมด" value={String(data.metrics.totalTasks)} detail={`${data.metrics.completedTasks} งานเสร็จแล้ว`} />
              <OverviewMetric label="กำลังดำเนินการ" value={String(data.metrics.inProgressTasks)} detail="อัปเดตจากแผนงาน" />
              <OverviewMetric label="Defect คงค้าง" value={String(data.metrics.openDefects)} detail={data.metrics.openDefects ? "ต้องติดตาม" : "ไม่มีคงค้าง"} tone={data.metrics.openDefects ? "red" : "green"} />
              <OverviewMetric label="รอลูกค้า" value={String(data.metrics.pendingActions)} detail="รายการที่ต้องดำเนินการ" tone={data.metrics.pendingActions ? "orange" : "green"} />
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <Panel title="อัปเดตล่าสุด" action={data.latestUpdate.pdfUrl ? { label: "เปิด PDF", href: data.latestUpdate.pdfUrl } : undefined}>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <InfoBlock label="วันที่รายงาน" value={formatDate(data.latestUpdate.date)} />
                  <InfoBlock label="สภาพอากาศ" value={data.latestUpdate.weather || "-"} />
                  <InfoBlock label="คนงาน" value={data.latestUpdate.workers ? `${data.latestUpdate.workers} คน` : "-"} />
                </div>
                <TextBlock label="งานที่ดำเนินการ" value={data.latestUpdate.workDone || "ยังไม่มีรายงานล่าสุด"} />
                <TextBlock label="ปัญหา/อุปสรรค" value={data.latestUpdate.issues || "ไม่มีรายงานปัญหา"} muted={!data.latestUpdate.issues} />
              </div>
            </Panel>

            <Panel title="ภาพหน้างาน">
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                {data.latestUpdate.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.latestUpdate.photoUrl} alt="ภาพหน้างานล่าสุด" className="h-64 w-full object-cover" />
                ) : (
                  <div className="grid h-64 place-items-center bg-[linear-gradient(135deg,#f8fafc,#eef2f7)] text-center">
                    <div>
                      <ImageIcon className="mx-auto text-slate-400" size={32} />
                      <p className="mt-3 text-sm font-bold text-slate-500">ยังไม่มีภาพแนบในรายงานล่าสุด</p>
                    </div>
                  </div>
                )}
              </div>
              {data.latestUpdate.photosFolderUrl ? (
                <a href={data.latestUpdate.photosFolderUrl} className="mt-3 inline-flex items-center gap-1.5 text-sm font-extrabold text-orange-700 hover:text-orange-800">
                  เปิดโฟลเดอร์รูปภาพ <ArrowUpRight size={15} />
                </a>
              ) : null}
            </Panel>
          </section>

          <Panel title="แผนงานล่าสุด">
            <div className="space-y-3">
              {timeline.length ? timeline.map((item) => (
                <TimelineRow key={`${item.type}-${item.id}`} item={item} />
              )) : (
                <EmptyState text="ยังไม่มีข้อมูลแผนงานสำหรับแสดงให้ลูกค้า" />
              )}
            </div>
          </Panel>
        </div>

        <aside className="space-y-5">
          <Panel title="รอลูกค้าดำเนินการ">
            <div className="space-y-3">
              {data.actions.length ? data.actions.map((action) => <ActionRow key={`${action.type}-${action.id}`} action={action} />) : <EmptyState text="ตอนนี้ไม่มีรายการรอลูกค้าดำเนินการ" />}
            </div>
          </Panel>

          <Panel title="สถานะเอกสาร">
            <div className="grid gap-3">
              <SummaryRow label="Defect" value={`${data.summaries.defects.open}/${data.summaries.defects.total}`} detail={data.summaries.defects.latestStatus} tone={data.summaries.defects.open ? "red" : "green"} />
              <SummaryRow label="QC" value={`${data.summaries.qc.approved}/${data.summaries.qc.total}`} detail={data.summaries.qc.latestStatus} tone={data.summaries.qc.pending ? "orange" : "green"} />
              <SummaryRow label="VO" value={`${data.summaries.vo.pending}/${data.summaries.vo.total}`} detail={`${data.summaries.vo.totalAmount} บาท`} tone={data.summaries.vo.pending ? "orange" : "green"} />
              <SummaryRow label="Memo" value={`${data.summaries.memos.waitingAck}/${data.summaries.memos.total}`} detail={data.summaries.memos.latestStatus} tone={data.summaries.memos.waitingAck ? "orange" : "green"} />
            </div>
          </Panel>

          <Panel title="รายงานล่าสุด" action={data.reports.latestWeeklyPdfUrl ? { label: "Weekly PDF", href: data.reports.latestWeeklyPdfUrl } : undefined}>
            <div className="grid grid-cols-3 gap-2">
              <InfoBlock label="Daily" value={String(data.reports.dailyCount)} />
              <InfoBlock label="Weekly" value={String(data.reports.weeklyCount)} />
              <InfoBlock label="Monthly" value={String(data.reports.monthlyCount)} />
            </div>
            {data.reports.latestMonthlyPdfUrl ? (
              <a href={data.reports.latestMonthlyPdfUrl} className="mt-3 inline-flex items-center gap-1.5 text-sm font-extrabold text-orange-700 hover:text-orange-800">
                เปิด Monthly PDF <ArrowUpRight size={15} />
              </a>
            ) : null}
          </Panel>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-black text-slate-950">แชร์ลิงก์นี้ให้ลูกค้า</p>
            <div className="mt-3 flex gap-2">
              <input
                value={currentUrl}
                readOnly
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 outline-none"
              />
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white hover:bg-slate-800"
                title="คัดลอกลิงก์"
              >
                <Copy size={16} />
              </button>
            </div>
            {copied ? <p className="mt-2 text-xs font-bold text-emerald-700">คัดลอกลิงก์แล้ว</p> : null}
          </div>
        </aside>
      </div>
    </section>
  );
}

function ScheduleView({
  data,
  tasks,
  taskMap,
  workTasks,
  completedTasks,
  inProgressTasks,
  tab,
  setTab,
  isValidating,
  onRefresh,
}: {
  data: CustomerPortalData;
  tasks: ScheduleTask[];
  taskMap: Map<string, ScheduleTask>;
  workTasks: ScheduleTask[];
  completedTasks: number;
  inProgressTasks: number;
  tab: "plan" | "gantt";
  setTab: (tab: "plan" | "gantt") => void;
  isValidating: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="min-w-0">
      <header className="bg-slate-950 text-white">
        <div className="px-4 py-7 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-400">PMC CONNEXT · Live Schedule</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{data.project.name}</h1>
              <p className="mt-2 text-sm font-semibold text-slate-400">{data.project.project_id} · {data.project.client || "แผนงานโครงการ"}</p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-300">
              <Wifi size={15} />
              อัปเดตอัตโนมัติ
            </div>
          </div>
        </div>
      </header>

      <div className="space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <ScheduleMetric label="งานทั้งหมด" value={String(workTasks.length)} icon={<CalendarDays size={18} />} />
          <ScheduleMetric label="เสร็จแล้ว" value={String(completedTasks)} icon={<CheckCircle2 size={18} />} />
          <ScheduleMetric label="กำลังดำเนินการ" value={String(inProgressTasks)} icon={<Clock3 size={18} />} />
          <ScheduleMetric label="ความคืบหน้ารวม" value={`${data.metrics.progress}%`} icon={<BarChart3 size={18} />} accent />
        </div>

        <LiveScheduleTable
          tasks={tasks}
          taskMap={taskMap}
          workTasks={workTasks}
          progress={data.metrics.progress}
          tab={tab}
          setTab={setTab}
          updatedAt={data.updated_at}
          isValidating={isValidating}
          onRefresh={onRefresh}
        />
      </div>
    </section>
  );
}

function DocumentsView({
  data,
  isValidating,
  onRefresh,
}: {
  data: CustomerPortalData;
  isValidating: boolean;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<DocumentFilter>("all");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const documents = useMemo(() => data.documents || [], [data.documents]);
  const counts = useMemo(() => ({
    pending: documents.filter((item) => item.statusGroup === "pending").length,
    approved: documents.filter((item) => item.statusGroup === "approved").length,
    other: documents.filter((item) => item.statusGroup !== "pending" && item.statusGroup !== "approved").length,
  }), [documents]);
  const filteredDocuments = useMemo(() => {
    if (filter === "all") return documents;
    if (filter === "other") return documents.filter((item) => item.statusGroup !== "pending" && item.statusGroup !== "approved");
    return documents.filter((item) => item.statusGroup === filter);
  }, [documents, filter]);
  const selectedDocument = filteredDocuments.find((item) => documentKey(item) === selectedDocumentId) || filteredDocuments[0] || documents[0];
  const filters: Array<{ id: DocumentFilter; label: string; count: number }> = [
    { id: "all", label: "ทั้งหมด", count: documents.length },
    { id: "pending", label: "รออนุมัติ", count: counts.pending },
    { id: "approved", label: "อนุมัติแล้ว", count: counts.approved },
    { id: "other", label: "อื่นๆ", count: counts.other },
  ];

  return (
    <section className="min-w-0">
      <header className="bg-slate-950 text-white">
        <div className="px-4 py-7 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-400">PMC CONNEXT · Document Center</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">เอกสารและการอนุมัติ</h1>
              <p className="mt-2 text-sm font-semibold text-slate-400">{data.project.project_id} · {data.project.name}</p>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-300"
            >
              <RefreshCw size={15} className={isValidating ? "animate-spin" : ""} />
              ล่าสุด {formatTime(data.updated_at)}
            </button>
          </div>
        </div>
      </header>

      <div className="space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <DocumentMetric label="เอกสารทั้งหมด" value={String(documents.length)} tone="gray" />
          <DocumentMetric label="รออนุมัติ" value={String(counts.pending)} tone={counts.pending ? "orange" : "green"} />
          <DocumentMetric label="อนุมัติแล้ว" value={String(counts.approved)} tone="green" />
          <DocumentMetric label="อื่นๆ" value={String(counts.other)} tone={counts.other ? "red" : "gray"} />
        </div>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950">รายการเอกสาร</h2>
                <p className="mt-1 text-xs font-bold text-slate-400">PDF, หน้าดำเนินการ, และประวัติสถานะ</p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
                {filters.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id)}
                    className={`shrink-0 rounded-lg px-3 py-2 text-xs font-black ${filter === item.id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-950"}`}
                  >
                    {item.label} <span className="opacity-70">{item.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredDocuments.length ? filteredDocuments.map((item) => (
                <DocumentRow
                  key={`${item.type}-${item.id}`}
                  document={item}
                  active={selectedDocument ? documentKey(selectedDocument) === documentKey(item) : false}
                  onClick={() => setSelectedDocumentId(documentKey(item))}
                />
              )) : (
                <div className="p-4">
                  <EmptyState text="ยังไม่มีเอกสารในหมวดนี้" />
                </div>
              )}
            </div>
          </div>

          <DocumentDetail document={selectedDocument} />
        </section>
      </div>
    </section>
  );
}

function documentKey(document: PortalDocument) {
  return `${document.type}-${document.id || document.title}`;
}

function documentTone(statusGroup: PortalDocument["statusGroup"]) {
  if (statusGroup === "pending") return "border-orange-200 bg-orange-50 text-orange-800";
  if (statusGroup === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (statusGroup === "rejected") return "border-red-200 bg-red-50 text-red-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function documentStatusText(statusGroup: PortalDocument["statusGroup"]) {
  return {
    pending: "รอดำเนินการ",
    approved: "ผ่านแล้ว",
    rejected: "ไม่ผ่าน",
    closed: "ปิดแล้ว",
    draft: "ฉบับร่าง",
  }[statusGroup];
}

function DocumentMetric({ label, value, tone }: { label: string; value: string; tone: "gray" | "orange" | "green" | "red" }) {
  const toneClass = {
    gray: "border-slate-200 bg-white text-slate-950",
    orange: "border-orange-200 bg-orange-50 text-orange-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    red: "border-red-200 bg-red-50 text-red-900",
  }[tone];
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-black opacity-60">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
    </div>
  );
}

function DocumentRow({ document, active, onClick }: { document: PortalDocument; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid w-full gap-3 p-4 text-left transition md:grid-cols-[minmax(0,1fr)_180px] md:items-center ${active ? "bg-slate-50" : "hover:bg-slate-50"}`}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-slate-950 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white">{document.typeLabel}</span>
          <span className={`rounded border px-2 py-1 text-[10px] font-black ${documentTone(document.statusGroup)}`}>{documentStatusText(document.statusGroup)}</span>
          {document.documentNo ? <span className="text-xs font-bold text-slate-400">{document.documentNo}</span> : null}
        </span>
        <span className="mt-2 block truncate text-sm font-black text-slate-950">{document.title}</span>
        <span className="mt-1 line-clamp-2 block text-xs font-semibold leading-5 text-slate-500">{document.detail || document.status}</span>
      </span>
      <span className="flex items-center justify-between gap-3 md:justify-end">
        <span className="text-left md:text-right">
          <span className="block text-xs font-black text-slate-400">วันที่เอกสาร</span>
          <span className="mt-1 block text-sm font-black text-slate-950">{formatDate(document.date)}</span>
        </span>
        <ArrowUpRight size={16} className="shrink-0 text-slate-300" />
      </span>
    </button>
  );
}

function DocumentDetail({ document }: { document?: PortalDocument }) {
  if (!document) {
    return (
      <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <EmptyState text="ยังไม่มีเอกสารสำหรับแสดงรายละเอียด" />
      </aside>
    );
  }

  return (
    <aside className="h-fit rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">{document.typeLabel}</p>
          <h2 className="mt-2 text-xl font-black leading-7 text-slate-950">{document.title}</h2>
        </div>
        <span className={`shrink-0 rounded border px-2 py-1 text-[10px] font-black ${documentTone(document.statusGroup)}`}>{documentStatusText(document.statusGroup)}</span>
      </div>

      <div className="mt-5 grid gap-3">
        <InfoBlock label="เลขที่เอกสาร" value={document.documentNo || "-"} />
        <InfoBlock label="สถานะ" value={document.status || "-"} />
        <InfoBlock label="วันที่เอกสาร" value={formatDate(document.date)} />
        <InfoBlock label="วันที่อนุมัติ/รับทราบ" value={formatDate(document.approvedAt)} />
        {document.amount ? <InfoBlock label="มูลค่า" value={document.amount} /> : null}
      </div>

      <div className="mt-5">
        <p className="text-xs font-black text-slate-400">รายละเอียดสำหรับตรวจสอบ</p>
        <p className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-700">
          {document.detail || "ไม่มีรายละเอียดเพิ่มเติม"}
        </p>
      </div>

      <div className="mt-5 grid gap-2">
        {document.pdfUrl ? (
          <a href={document.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
            <FileText size={16} />
            เปิด PDF
          </a>
        ) : null}
        {document.actionUrl ? (
          <a href={document.actionUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-black text-orange-800 hover:bg-orange-100">
            <ClipboardCheck size={16} />
            เปิดหน้าดำเนินการ
          </a>
        ) : null}
        {document.attachmentUrl && document.attachmentUrl !== document.pdfUrl ? (
          <a href={document.attachmentUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
            <ArrowUpRight size={16} />
            เปิดไฟล์แนบ
          </a>
        ) : null}
        {!document.pdfUrl && !document.actionUrl && !document.attachmentUrl ? <EmptyState text="เอกสารนี้ยังไม่มีลิงก์ PDF หรือไฟล์แนบ" /> : null}
      </div>
    </aside>
  );
}

function Panel({ title, action, children }: { title: string; action?: { label: string; href: string }; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
        {action?.href ? (
          <a href={action.href} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
            {action.label}
            <ArrowUpRight size={14} />
          </a>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ProgressPanel({ progress }: { progress: number }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
      <p className="text-sm font-black text-slate-300">ความคืบหน้า</p>
      <div className="mt-5 grid place-items-center">
        <div
          className="grid h-40 w-40 place-items-center rounded-full"
          style={{ background: `conic-gradient(#f97316 ${progress * 3.6}deg, rgba(255,255,255,0.12) 0deg)` }}
        >
          <div className="grid h-28 w-28 place-items-center rounded-full bg-slate-950">
            <div className="text-center">
              <p className="text-4xl font-black tracking-tight">{progress}%</p>
              <p className="mt-1 text-xs font-bold text-slate-400">Overall</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function OverviewMetric({ label, value, detail, tone = "gray" }: { label: string; value: string; detail: string; tone?: "gray" | "orange" | "green" | "red" }) {
  const toneClass = {
    gray: "border-slate-200 bg-white text-slate-950",
    orange: "border-orange-200 bg-orange-50 text-orange-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    red: "border-red-200 bg-red-50 text-red-900",
  }[tone];
  return (
    <div className={`min-h-[118px] rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-black opacity-60">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-xs font-bold leading-5 opacity-65">{detail}</p>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-950">{value || "-"}</p>
    </div>
  );
}

function TextBlock({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className={`mt-1 rounded-lg border border-slate-100 p-3 text-sm font-semibold leading-6 ${muted ? "bg-slate-50 text-slate-500" : "bg-white text-slate-800"}`}>
        {value}
      </p>
    </div>
  );
}

function ActionRow({ action }: { action: CustomerPortalAction }) {
  const Icon = actionIcons[action.type] || ClipboardCheck;
  return (
    <a href={action.href} className="group flex items-start gap-3 rounded-lg border border-orange-100 bg-orange-50 p-3 text-orange-950 transition hover:border-orange-200 hover:bg-orange-100">
      <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-orange-700 shadow-sm">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black leading-5">{action.title}</span>
        <span className="mt-0.5 block text-xs font-bold leading-5 opacity-70">{action.detail || action.status}</span>
      </span>
      <ArrowUpRight size={16} className="mt-1 shrink-0 opacity-60 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </a>
  );
}

function SummaryRow({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "orange" | "green" | "red" }) {
  const toneClass = {
    orange: "bg-orange-50 text-orange-800 border-orange-100",
    green: "bg-emerald-50 text-emerald-800 border-emerald-100",
    red: "bg-red-50 text-red-800 border-red-100",
  }[tone];
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${toneClass}`}>
      <div className="min-w-0">
        <p className="text-sm font-black">{label}</p>
        <p className="mt-0.5 truncate text-xs font-bold opacity-70">{detail || "-"}</p>
      </div>
      <p className="text-xl font-black">{value}</p>
    </div>
  );
}

function TimelineRow({ item }: { item: CustomerPortalData["timeline"][number] }) {
  const isMilestone = item.type === "milestone";
  return (
    <div className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {isMilestone ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Clock3 size={16} className="text-orange-600" />}
          <p className="truncate text-sm font-black text-slate-950">{item.title}</p>
        </div>
        <p className="mt-1 text-xs font-bold text-slate-500">{formatDate(item.start)} - {formatDate(item.end)}</p>
      </div>
      <div>
        <div className="h-2 rounded-full bg-white">
          <div className="h-full rounded-full bg-orange-600" style={{ width: `${isMilestone ? 100 : item.percent}%` }} />
        </div>
        <p className="mt-1 text-right text-xs font-black text-slate-500">{isMilestone ? "Milestone" : `${item.percent}%`}</p>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">
      {text}
    </div>
  );
}

function LiveScheduleTable({
  tasks,
  taskMap,
  workTasks,
  tab,
  setTab,
  updatedAt,
  isValidating,
  onRefresh,
}: {
  tasks: ScheduleTask[];
  taskMap: Map<string, ScheduleTask>;
  workTasks: ScheduleTask[];
  progress: number;
  tab: "plan" | "gantt";
  setTab: (tab: "plan" | "gantt") => void;
  updatedAt: string;
  isValidating: boolean;
  onRefresh: () => void;
}) {
  const ganttWorkTasks = useMemo(() => workTasks.filter(hasTaskScheduleDates), [workTasks]);
  const timeline = useMemo(() => {
    const dates = ganttWorkTasks
      .flatMap((task) => [dateValue(task.start), dateValue(task.end)])
      .filter((date): date is Date => Boolean(date));
    const start = dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : new Date();
    const end = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : new Date(start.getTime() + 86400000);
    const total = Math.max(1, end.getTime() - start.getTime());
    return { start, end, total };
  }, [ganttWorkTasks]);

  const position = (value: string) => {
    const date = dateValue(value);
    return date ? ((date.getTime() - timeline.start.getTime()) / timeline.total) * 100 : 0;
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <ScheduleTab active={tab === "plan"} onClick={() => setTab("plan")} label="ตารางแผนงาน" />
          <ScheduleTab active={tab === "gantt"} onClick={() => setTab("gantt")} label="Gantt Chart" />
        </div>
        <button onClick={onRefresh} className="inline-flex items-center gap-2 self-start rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">
          <RefreshCw size={14} className={isValidating ? "animate-spin" : ""} />
          อัปเดตล่าสุด {formatTime(updatedAt)}
        </button>
      </div>

      {tab === "plan" ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">งาน</th>
                <th className="px-4 py-3">ผู้รับผิดชอบ</th>
                <th className="px-4 py-3">เริ่ม</th>
                <th className="px-4 py-3">สิ้นสุด</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-5 py-3 text-right">ความคืบหน้า</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((task) => {
                const isHeading = isHeadingTask(task);
                const depth = getTaskDepth(task, taskMap);
                const headingDisplay = getScheduleHeadingDisplay(depth);
                return (
                  <tr key={task.task_id} className={isHeading ? `${headingDisplay.row} font-bold` : "hover:bg-slate-50"}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2" style={{ paddingLeft: `${Math.min(depth, 5) * 18}px` }}>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-black ${isHeading ? headingDisplay.badge : "bg-orange-50 text-orange-700"}`}>
                          {getTaskLevelLabel(task, taskMap)}
                        </span>
                        <span>{task.name}</span>
                        {isHeading ? <span className={`text-xs ${headingDisplay.meta}`}>({task.summary_child_count || 0} งาน)</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">{task.assignee || "-"}</td>
                    <td className="px-4 py-3.5">{formatDate(task.start)}</td>
                    <td className="px-4 py-3.5">{formatDate(task.end)}</td>
                    <td className="px-4 py-3.5">{isHeading ? "-" : statusLabel(task.status)}</td>
                    <td className="px-5 py-3.5 text-right">{task.percent_done || 0}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!tasks.length ? <p className="p-10 text-center text-slate-400">ยังไม่มีรายการแผนงาน</p> : null}
        </div>
      ) : (
        <div className="overflow-x-auto p-5">
          <div className="min-w-[900px]">
            <div className="mb-3 flex justify-between pl-[270px] text-xs text-slate-400">
              <span>{formatDate(timeline.start.toISOString().slice(0, 10))}</span>
              <span>{formatDate(timeline.end.toISOString().slice(0, 10))}</span>
            </div>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {ganttWorkTasks.map((task) => {
                const taskStart = task.start || task.end;
                const taskEnd = task.end || taskStart;
                const left = position(taskStart);
                const width = Math.max(1.2, position(taskEnd) - left);
                return (
                  <div key={task.task_id} className="grid grid-cols-[250px_1fr] items-center gap-4 px-3 py-3">
                    <div className="truncate text-sm font-semibold">{task.name}</div>
                    <div className="relative h-7 rounded bg-slate-100">
                      <div className="absolute top-1 h-5 rounded bg-orange-500" style={{ left: `${left}%`, width: `${width}%` }}>
                        <div className="h-full rounded bg-orange-700/35" style={{ width: `${Math.min(100, Number(task.percent_done || 0))}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {!ganttWorkTasks.length ? <p className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-400">ยังไม่มีงานที่ใส่วันที่สำหรับ Gantt Chart</p> : null}
          </div>
        </div>
      )}
    </section>
  );
}

function ScheduleMetric({ label, value, icon, accent = false }: { label: string; value: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${accent ? "border-orange-200 bg-orange-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function ScheduleTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg px-4 py-2 text-sm font-bold ${active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-900"}`}>
      {label}
    </button>
  );
}
