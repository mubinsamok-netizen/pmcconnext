"use client";

import { useMemo, useState } from "react";
import { BarChart3, CalendarDays, CheckCircle2, Clock3, RefreshCw, Wifi } from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

type Task = {
  task_id: string; name: string; assignee: string; start: string; end: string; status: string;
  percent_done: string; category: string; order_index: string; task_type: string; parent_task_id: string;
  summary_child_count?: number;
};
type Milestone = { milestone_id: string; title: string; date: string; type: string; color: string };
type ScheduleData = {
  project: { project_id: string; name: string; client: string; status: string; start_date: string; end_date: string };
  tasks: Task[]; milestones: Milestone[]; updated_at: string;
};
type Response = { success: boolean; data: ScheduleData };

function dateValue(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string) {
  const date = dateValue(value);
  return date ? new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "-";
}

function hasTaskScheduleDates(task: Pick<Task, "start" | "end">) {
  return Boolean(dateValue(task.start) || dateValue(task.end));
}

function statusLabel(status: string) {
  return ({ "To Do": "ยังไม่เริ่ม", "In Progress": "กำลังดำเนินการ", Review: "รอตรวจ", Done: "เสร็จแล้ว" } as Record<string, string>)[status] || status;
}

function taskOrder(task: Task) {
  return Number(task.order_index || 0) || 999999;
}

function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => taskOrder(a) - taskOrder(b));
}

function isHeadingTask(task: Task) {
  return task.task_type === "heading";
}

function toInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
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
  return `${isHeadingTask(task) ? "H" : "งาน H"}${getTaskDepth(task, taskMap) + 1}`;
}

function getPublicHeadingDisplay(depth: number) {
  if (depth === 0) {
    return {
      row: "bg-slate-900 text-white",
      badge: "bg-white/15 text-white",
      meta: "text-white/60",
    };
  }

  if (depth === 1) {
    return {
      row: "bg-amber-50 text-slate-950",
      badge: "bg-amber-100 text-amber-900",
      meta: "text-amber-800",
    };
  }

  return {
    row: "bg-white text-slate-950",
    badge: "bg-slate-100 text-slate-700",
    meta: "text-slate-500",
  };
}

function summarizeHeading(task: Task, descendants: Task[]) {
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

function buildTaskRows(tasks: Task[]) {
  const sorted = sortTasks(tasks);
  const taskIds = new Set(sorted.map((task) => task.task_id));
  const childrenByParent = new Map<string, Task[]>();

  sorted.forEach((task) => {
    if (!task.parent_task_id || !taskIds.has(task.parent_task_id)) return;
    const current = childrenByParent.get(task.parent_task_id) || [];
    current.push(task);
    childrenByParent.set(task.parent_task_id, current);
  });

  const rows: Task[] = [];
  const visited = new Set<string>();
  const collecting = new Set<string>();

  const collectDescendants = (task: Task): Task[] => {
    if (collecting.has(task.task_id)) return [];
    collecting.add(task.task_id);
    const descendants = (childrenByParent.get(task.task_id) || []).flatMap((child) => [child, ...collectDescendants(child)]);
    collecting.delete(task.task_id);
    return descendants;
  };

  const visit = (task: Task) => {
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

export default function PublicScheduleView({ projectId, token }: { projectId: string; token: string }) {
  const [tab, setTab] = useState<"plan" | "gantt">("plan");
  const key = `/api/schedule-view/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}`;
  const { data: response, error, isLoading, isValidating, mutate } = useSWR<Response>(key, fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
  });
  const data = response?.data;
  const tasks = useMemo(() => buildTaskRows(data?.tasks || []), [data?.tasks]);
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.task_id, task])), [tasks]);
  const workTasks = useMemo(() => tasks.filter((task) => task.task_type !== "heading"), [tasks]);
  const ganttWorkTasks = useMemo(() => workTasks.filter(hasTaskScheduleDates), [workTasks]);
  const progress = workTasks.length ? Math.round(workTasks.reduce((sum, task) => sum + Number(task.percent_done || 0), 0) / workTasks.length) : 0;
  const timeline = useMemo(() => {
    const dates = [...ganttWorkTasks.flatMap((task) => [dateValue(task.start), dateValue(task.end)]), ...(data?.milestones || []).map((item) => dateValue(item.date))].filter((date): date is Date => Boolean(date));
    const start = dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : new Date();
    const end = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : new Date(start.getTime() + 86400000);
    const total = Math.max(1, end.getTime() - start.getTime());
    return { start, end, total };
  }, [data?.milestones, ganttWorkTasks]);

  if (isLoading) return <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-500"><RefreshCw className="animate-spin" /></main>;
  if (error || !data) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-bold text-slate-900">ไม่สามารถเปิดแผนงานได้</h1><p className="mt-2 text-slate-500">ลิงก์อาจไม่ถูกต้อง หรือข้อมูลไม่พร้อมใช้งาน</p></div></main>;

  const position = (value: string) => {
    const date = dateValue(value);
    return date ? ((date.getTime() - timeline.start.getTime()) / timeline.total) * 100 : 0;
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-5 py-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-400">PMC CONNEXT · LIVE SCHEDULE</p><h1 className="mt-2 text-2xl font-bold md:text-3xl">{data.project.name}</h1><p className="mt-1 text-sm text-slate-400">{data.project.project_id} · {data.project.client || "แผนงานโครงการ"}</p></div>
            <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-300"><Wifi size={14} /> อัปเดตอัตโนมัติทุก 10 วินาที</div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-5 py-6">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="งานทั้งหมด" value={String(workTasks.length)} icon={<CalendarDays size={18} />} />
          <Metric label="เสร็จแล้ว" value={String(workTasks.filter((task) => task.status === "Done").length)} icon={<CheckCircle2 size={18} />} />
          <Metric label="กำลังดำเนินการ" value={String(workTasks.filter((task) => task.status === "In Progress").length)} icon={<Clock3 size={18} />} />
          <Metric label="ความคืบหน้ารวม" value={`${progress}%`} icon={<BarChart3 size={18} />} accent />
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2"><Tab active={tab === "plan"} onClick={() => setTab("plan")} label="ตารางแผนงาน" /><Tab active={tab === "gantt"} onClick={() => setTab("gantt")} label="Gantt Chart" /></div>
            <button onClick={() => mutate()} className="inline-flex items-center gap-2 self-start rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50"><RefreshCw size={14} className={isValidating ? "animate-spin" : ""} /> อัปเดตล่าสุด {new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(data.updated_at))}</button>
          </div>

          {tab === "plan" ? (
            <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">งาน</th><th className="px-4 py-3">ผู้รับผิดชอบ</th><th className="px-4 py-3">เริ่ม</th><th className="px-4 py-3">สิ้นสุด</th><th className="px-4 py-3">สถานะ</th><th className="px-5 py-3 text-right">ความคืบหน้า</th></tr></thead><tbody className="divide-y divide-slate-100">{tasks.map((task) => { const isHeading = isHeadingTask(task); const depth = getTaskDepth(task, taskMap); const headingDisplay = getPublicHeadingDisplay(depth); return <tr key={task.task_id} className={isHeading ? `${headingDisplay.row} font-bold` : "hover:bg-slate-50"}><td className="px-5 py-3.5"><div className="flex items-center gap-2" style={{ paddingLeft: `${Math.min(depth, 5) * 18}px` }}><span className={`rounded px-2 py-0.5 text-[10px] font-black ${isHeading ? headingDisplay.badge : "bg-orange-50 text-orange-700"}`}>{getTaskLevelLabel(task, taskMap)}</span><span>{task.name}</span>{isHeading ? <span className={`text-xs ${headingDisplay.meta}`}>({task.summary_child_count || 0} งาน)</span> : null}</div></td><td className="px-4 py-3.5">{task.assignee || "-"}</td><td className="px-4 py-3.5">{formatDate(task.start)}</td><td className="px-4 py-3.5">{formatDate(task.end)}</td><td className="px-4 py-3.5">{isHeading ? "-" : statusLabel(task.status)}</td><td className="px-5 py-3.5 text-right">{isHeading ? `${task.percent_done || 0}%` : `${task.percent_done || 0}%`}</td></tr>})}</tbody></table>{!tasks.length && <p className="p-10 text-center text-slate-400">ยังไม่มีรายการแผนงาน</p>}</div>
          ) : (
            <div className="overflow-x-auto p-5"><div className="min-w-[900px]"><div className="mb-3 flex justify-between pl-[270px] text-xs text-slate-400"><span>{formatDate(timeline.start.toISOString().slice(0, 10))}</span><span>{formatDate(timeline.end.toISOString().slice(0, 10))}</span></div><div className="divide-y divide-slate-100 rounded-xl border border-slate-100">{ganttWorkTasks.map((task) => { const taskStart = task.start || task.end; const taskEnd = task.end || taskStart; const left = position(taskStart); const width = Math.max(1.2, position(taskEnd) - left); return <div key={task.task_id} className="grid grid-cols-[250px_1fr] items-center gap-4 px-3 py-3"><div className="truncate text-sm font-semibold">{task.name}</div><div className="relative h-7 rounded bg-slate-100"><div className="absolute top-1 h-5 rounded bg-orange-500" style={{ left: `${left}%`, width: `${width}%` }}><div className="h-full rounded bg-orange-700/35" style={{ width: `${Math.min(100, Number(task.percent_done || 0))}%` }} /></div></div></div>})}</div>{!ganttWorkTasks.length && <p className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-400">ยังไม่มีงานที่ใส่วันที่สำหรับ Gantt Chart</p>}</div></div>
          )}
        </section>
        <p className="text-center text-xs text-slate-400">ลิงก์นี้ใช้สำหรับดูข้อมูลเท่านั้น การแก้ไขต้องทำผ่านระบบ PMC CONNEXT</p>
      </div>
    </main>
  );
}

function Metric({ label, value, icon, accent = false }: { label: string; value: string; icon: React.ReactNode; accent?: boolean }) {
  return <div className={`rounded-2xl border p-4 shadow-sm ${accent ? "border-orange-200 bg-orange-50" : "border-slate-200 bg-white"}`}><div className="flex items-center gap-2 text-xs font-semibold text-slate-500">{icon}{label}</div><p className="mt-2 text-2xl font-bold">{value}</p></div>;
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} className={`rounded-lg px-4 py-2 text-sm font-bold ${active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-900"}`}>{label}</button>;
}
