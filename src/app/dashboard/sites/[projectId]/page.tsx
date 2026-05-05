import Link from "next/link";
import type { ComponentType } from "react";
import {
  BarChart3,
  CalendarDays,
  Flag,
  FileQuestion,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  Sheet,
} from "lucide-react";
import { findAll } from "@/lib/sheetsCrud";
import { ensureSchema } from "@/lib/sheetsSetup";
import type { MasterProject } from "@/lib/masterProjects";
import { getMasterProject } from "@/lib/masterProjects";
import { getProjectContext } from "@/lib/siteContext";
import { getSiteWeather } from "@/lib/siteWeather";
import SiteWeatherCard from "@/components/SiteWeatherCard";

export const dynamic = "force-dynamic";

type SiteRecord = Record<string, string | number | undefined>;

type PlanningSummary = {
  workTaskCount: number;
  plannedTaskCount: number;
  milestoneCount: number;
  planCoverage: number;
  planStart: string;
  planEnd: string;
  nextMilestone: string;
  openIssues: number;
  highPriorityItems: number;
  error: string;
};

function parseDate(value?: string | number) {
  if (!value) return null;
  const raw = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value?: string | number) {
  return String(value || "");
}

function isOpenStatus(status?: string | number) {
  const normalized = String(status || "").trim().toLowerCase();
  return !["closed", "done", "resolved", "cancelled", "completed"].includes(normalized);
}

async function getPlanningSummary(project: MasterProject): Promise<PlanningSummary> {
  const fallback: PlanningSummary = {
    workTaskCount: 0,
    plannedTaskCount: 0,
    milestoneCount: 0,
    planCoverage: 0,
    planStart: "",
    planEnd: "",
    nextMilestone: "",
    openIssues: 0,
    highPriorityItems: 0,
    error: "",
  };

  try {
    const { sheetId } = await getProjectContext(project.project_id);
    await ensureSchema(sheetId);

    const [tasks, milestones, issues] = await Promise.all([
      findAll("Tasks", sheetId) as Promise<SiteRecord[]>,
      findAll("Milestones", sheetId) as Promise<SiteRecord[]>,
      findAll("Issues", sheetId) as Promise<SiteRecord[]>,
    ]);

    const projectTasks = tasks.filter((task) => task.project_id === project.project_id && task.task_type !== "heading");
    const projectMilestones = milestones.filter((milestone) => milestone.project_id === project.project_id);
    const projectIssues = issues.filter((issue) => issue.project_id === project.project_id);
    const plannedTasks = projectTasks.filter((task) => parseDate(task.planned_start || task.start) && parseDate(task.planned_end || task.end));
    const planDates = plannedTasks
      .flatMap((task) => [parseDate(task.planned_start || task.start), parseDate(task.planned_end || task.end)])
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => a.getTime() - b.getTime());

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextMilestone = projectMilestones
      .map((milestone) => ({ title: String(milestone.title || ""), date: parseDate(milestone.date), rawDate: milestone.date }))
      .filter((milestone) => milestone.date && milestone.date >= today)
      .sort((a, b) => Number(a.date) - Number(b.date))[0];

    const openIssues = projectIssues.filter((issue) => isOpenStatus(issue.status));
    const highPriorityIssues = openIssues.filter((issue) => String(issue.priority || "").toLowerCase() === "high" || String(issue.priority || "") === "สูง");
    const highPriorityTasks = projectTasks.filter((task) => String(task.priority || "") === "สูง");

    return {
      workTaskCount: projectTasks.length,
      plannedTaskCount: plannedTasks.length,
      milestoneCount: projectMilestones.length,
      planCoverage: projectTasks.length ? Math.round((plannedTasks.length / projectTasks.length) * 100) : 0,
      planStart: formatDate(planDates[0]?.toISOString().slice(0, 10)),
      planEnd: formatDate(planDates[planDates.length - 1]?.toISOString().slice(0, 10)),
      nextMilestone: nextMilestone ? `${nextMilestone.title || "Milestone"} (${formatDate(nextMilestone.rawDate)})` : "",
      openIssues: openIssues.length,
      highPriorityItems: highPriorityIssues.length + highPriorityTasks.length,
      error: "",
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...fallback,
      error: message.includes("Quota exceeded")
        ? "Google Sheets quota เต็มชั่วคราว จึงยังสรุปแผนงานไม่ได้ในตอนนี้"
        : "ยังไม่สามารถโหลดสรุปแผนงานของไซต์นี้ได้",
    };
  }
}

export default async function SiteDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getMasterProject(projectId);
  const [planning, weather] = await Promise.all([
    getPlanningSummary(project),
    getSiteWeather(project),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-stretch">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-extrabold text-orange-700">
                <LayoutDashboard size={14} />
                Site Dashboard
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">{project.project_id}</span>
            </div>
            <h2 className="mt-3 truncate text-3xl font-extrabold tracking-tight text-gray-950">{project.name}</h2>
            <p className="mt-1 text-sm font-medium text-gray-500">{project.client || "ไม่ระบุลูกค้า"}</p>
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <InfoCard label="สถานะไซต์" value={project.status || "Planning"} />
          <InfoCard label="วันเริ่มต้น" value={project.start_date || "-"} />
          <InfoCard label="วันสิ้นสุด" value={project.end_date || "-"} />
            </div>
          </div>
          <SiteWeatherCard weather={weather} />
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4">
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-orange-600">
                <ListChecks size={16} />
                Planning Dashboard
              </div>
              <h3 className="text-2xl font-extrabold text-gray-950 mt-2">สรุปแผนงานโครงการ</h3>
              <p className="text-sm font-medium leading-6 text-gray-500 mt-1">
                ข้อมูลนี้มาจากตารางแผนงานและ Milestone เพื่อใช้วางแผนก่อนเริ่มเทียบ actual
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/dashboard/sites/${project.project_id}/schedule?tab=plan`} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                <ListChecks size={16} />
                แผนงาน
              </Link>
              <Link href={`/dashboard/sites/${project.project_id}/schedule?tab=gantt`} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700">
                <BarChart3 size={16} />
                Gantt Chart
              </Link>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <PlanningMetric label="งานในแผน" value={String(planning.workTaskCount)} />
            <PlanningMetric label="ใส่วันครบ" value={`${planning.plannedTaskCount}/${planning.workTaskCount}`} />
            <PlanningMetric label="Milestone" value={String(planning.milestoneCount)} />
            <PlanningMetric label="ความครบถ้วน" value={`${planning.planCoverage}%`} tone="orange" />
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            <PlanningRow
              icon={CalendarDays}
              label="ช่วงแผนงาน"
              value={planning.planStart && planning.planEnd ? `${planning.planStart} - ${planning.planEnd}` : "ยังไม่ได้กรอกช่วงแผน"}
            />
            <PlanningRow
              icon={Flag}
              label="Milestone ถัดไป"
              value={planning.nextMilestone || "ยังไม่มี Milestone"}
            />
          </div>

          {planning.error && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 border border-amber-100">
              {planning.error}
            </p>
          )}
        </section>

        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5">
          <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-orange-600">
            <FileQuestion size={16} />
            สิ่งที่ควรผูกกับแผน
          </div>
          <h3 className="text-2xl font-extrabold text-gray-950 mt-2">RFA / RFI / Issue</h3>
          <p className="text-sm font-medium leading-6 text-gray-500 mt-1">
            ช่วงนี้ยังเป็น planning-only แต่ควรเห็นรายการที่อาจทำให้แผนสะดุดตั้งแต่หน้า dashboard
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <PlanningMetric label="Issue เปิดอยู่" value={String(planning.openIssues)} tone={planning.openIssues > 0 ? "red" : "green"} />
            <PlanningMetric label="Priority สูง" value={String(planning.highPriorityItems)} tone={planning.highPriorityItems > 0 ? "red" : "green"} />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/dashboard/sites/${project.project_id}/rfa`} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              RFA
            </Link>
            <Link href={`/dashboard/sites/${project.project_id}/rfi`} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              RFI
            </Link>
          </div>
        </section>
      </div>

      <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-lg font-extrabold text-gray-950 mb-4">ไฟล์ของไซต์นี้</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <ResourceRow icon={Sheet} label="Site Google Sheet" value={project.site_sheet_id || "ยังไม่ได้กำหนด"} />
          <ResourceRow icon={FolderOpen} label="Site Drive Folder" value={project.drive_folder_id || "ยังไม่ได้กำหนด"} />
        </div>
      </section>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-extrabold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-lg font-extrabold text-gray-950 mt-2">{value}</p>
    </div>
  );
}

function PlanningMetric({
  label,
  value,
  tone = "gray",
}: {
  label: string;
  value: string;
  tone?: "gray" | "orange" | "green" | "red";
}) {
  const toneClass = {
    gray: "bg-gray-50 text-gray-900 border-gray-100",
    orange: "bg-orange-50 text-orange-700 border-orange-100",
    green: "bg-green-50 text-green-700 border-green-100",
    red: "bg-red-50 text-red-700 border-red-100",
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs font-semibold opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function PlanningRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-gray-50 p-4">
      <Icon size={18} className="mt-0.5 text-orange-600" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-500">{label}</p>
        <p className="mt-1 font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function ResourceRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-gray-50 p-3">
      <Icon size={18} className="text-orange-600 mt-0.5" />
      <div className="min-w-0">
        <p className="font-semibold text-gray-900">{label}</p>
        <p className="text-gray-500 truncate">{value}</p>
      </div>
    </div>
  );
}
