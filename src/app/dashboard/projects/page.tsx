"use client";

import { Building2, Calendar, Filter, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import ConfirmDialog from "@/components/ConfirmDialog";
import { fetcher } from "@/lib/fetcher";
import { isForemanRole } from "@/lib/siteAccess";

type Project = {
  project_id: string;
  name: string;
  client?: string;
  address?: string;
  province?: string;
  se_name?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  percent_done?: string;
  cover_file_id?: string;
  cover_url?: string;
  site_sheet_id?: string;
  drive_folder_id?: string;
  deposit_status?: string;
  tasks_count?: string;
  completed_tasks?: string;
  overdue_tasks?: string;
  delay_days?: string;
  progress_source?: string;
};

type ProjectsResponse = {
  success: boolean;
  data: Project[];
};

const validStatuses = new Set(["Planning", "In Progress", "On Hold", "Completed", "Cancelled"]);
const ALL_ENGINEERS = "__all__";
const UNASSIGNED_ENGINEER = "__unassigned__";
const statusStyles = {
  Planning: {
    badge: "border-sky-100 bg-sky-50 text-sky-700",
    progress: "bg-sky-500",
    visual: "from-sky-50 via-white to-orange-50",
    icon: "bg-white/90 text-sky-500 ring-sky-100",
    orb: "bg-sky-200/40",
    label: "bg-sky-500 text-white",
  },
  "In Progress": {
    badge: "border-orange-100 bg-orange-50 text-orange-700",
    progress: "bg-orange-500",
    visual: "from-orange-50 via-white to-amber-50",
    icon: "bg-white/90 text-orange-500 ring-orange-100",
    orb: "bg-orange-200/45",
    label: "bg-orange-500 text-white",
  },
  "On Hold": {
    badge: "border-amber-100 bg-amber-50 text-amber-700",
    progress: "bg-amber-500",
    visual: "from-amber-50 via-white to-slate-50",
    icon: "bg-white/90 text-amber-500 ring-amber-100",
    orb: "bg-amber-200/45",
    label: "bg-amber-500 text-white",
  },
  Completed: {
    badge: "border-emerald-100 bg-emerald-50 text-emerald-700",
    progress: "bg-emerald-500",
    visual: "from-emerald-50 via-white to-teal-50",
    icon: "bg-white/90 text-emerald-500 ring-emerald-100",
    orb: "bg-emerald-200/45",
    label: "bg-emerald-500 text-white",
  },
  Cancelled: {
    badge: "border-rose-100 bg-rose-50 text-rose-700",
    progress: "bg-rose-500",
    visual: "from-rose-50 via-white to-slate-50",
    icon: "bg-white/90 text-rose-500 ring-rose-100",
    orb: "bg-rose-200/40",
    label: "bg-rose-500 text-white",
  },
};

function getStatusStyle(status: string) {
  return statusStyles[status as keyof typeof statusStyles] || statusStyles.Planning;
}

function getStatus(status?: string) {
  if (!status || !validStatuses.has(status)) return "Planning";
  return status;
}

function toIsoDate(date?: string | number) {
  const value = String(date ?? "").trim();
  if (!value) return "";

  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 0 && numericValue < 100000) {
    const sheetEpoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(sheetEpoch + Math.floor(numericValue) * 86400000);
    return parsed.toISOString().slice(0, 10);
  }

  const slashMatch = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
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

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function getStartDate(startDate?: string) {
  const normalizedDate = toIsoDate(startDate);
  if (normalizedDate) return normalizedDate;
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return "ยังไม่กำหนดวันเริ่ม";
  return startDate;
}

function getEndDate(endDate?: string) {
  const normalizedDate = toIsoDate(endDate);
  if (normalizedDate) return normalizedDate;
  if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return "ยังไม่กำหนดวันสิ้นสุด";
  return endDate;
}

function getProgress(percentDone?: string) {
  return `${getProgressValue(percentDone)}%`;
}

function getProgressValue(percentDone?: string) {
  const value = Number(percentDone || 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function getCount(value?: string) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function normalizeEngineerName(value?: string) {
  return String(value || "").trim();
}

function extractDriveFileId(url?: string) {
  if (!url) return "";
  return url.match(/\/d\/([^/]+)/)?.[1] || url.match(/[?&]id=([^&]+)/)?.[1] || "";
}

function getCoverSrc(project: Project) {
  const fileId = project.cover_file_id || extractDriveFileId(project.cover_url);
  if (fileId) return `/api/drive/files/${encodeURIComponent(fileId)}`;
  return project.cover_url || "";
}

function ProjectCover({
  src,
  alt,
  name,
  projectId,
  status,
  progress,
}: {
  src: string;
  alt: string;
  name: string;
  projectId: string;
  status: string;
  progress: number;
}) {
  const [failed, setFailed] = useState(false);
  const style = getStatusStyle(status);

  if (!src || failed) {
    return (
      <div className={`absolute inset-0 overflow-hidden bg-gradient-to-br ${style.visual}`}>
        <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.06)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className={`absolute -right-10 -top-12 h-36 w-36 rounded-full blur-2xl ${style.orb}`} />
        <div className={`absolute -bottom-14 left-8 h-36 w-36 rounded-full blur-2xl ${style.orb}`} />
        <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-5">
          <div className="min-w-0 space-y-2">
            <h3 className="line-clamp-2 text-[23px] font-extrabold leading-tight text-slate-950 transition group-hover:text-orange-600">
              {name}
            </h3>
            <span className={`inline-flex max-w-full rounded-full px-3 py-1 text-xs font-extrabold shadow-sm ${style.label}`}>
              <span className="truncate">{projectId}</span>
            </span>
            <div className="h-1.5 w-24 rounded-full bg-white/80 shadow-sm">
              <div className={`h-full rounded-full ${style.progress}`} style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className={`grid h-20 w-20 shrink-0 place-items-center rounded-3xl shadow-sm ring-1 ${style.icon}`}>
            <Building2 size={44} strokeWidth={1.9} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized
        sizes="(max-width: 1280px) 100vw, 380px"
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-gray-950/70 via-gray-950/25 to-transparent" />
      <div className="absolute bottom-5 left-5 right-5 min-w-0 space-y-2">
        <h3 className="line-clamp-2 text-[23px] font-extrabold leading-tight text-white drop-shadow-sm">
          {name}
        </h3>
        <span className="inline-flex max-w-full rounded-full bg-white/92 px-3 py-1 text-xs font-extrabold text-slate-700 shadow-sm backdrop-blur">
          <span className="truncate">{projectId}</span>
        </span>
      </div>
    </>
  );
}

function DatePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-slate-50 px-3.5 py-3 ring-1 ring-slate-100">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
        <Calendar size={14} />
        {label}
      </div>
      <div className="mt-1 truncate text-[15px] font-extrabold text-slate-800">
        {value}
      </div>

    </div>
  );
}

function HealthPill({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "green" | "red";
}) {
  const toneClass = {
    slate: "bg-slate-50 ring-slate-100 text-slate-800",
    green: "bg-emerald-50 ring-emerald-100 text-emerald-700",
    red: "bg-red-50 ring-red-100 text-red-700",
  }[tone];

  const labelClass = {
    slate: "text-slate-400",
    green: "text-emerald-500",
    red: "text-red-400",
  }[tone];

  return (
    <div className={`rounded-2xl px-3.5 py-3 ring-1 ${toneClass}`}>
      <div className={`text-xs font-bold ${labelClass}`}>{label}</div>
      <div className="mt-1 text-[15px] font-extrabold">{value}</div>
    </div>
  );
}

export default function ProjectsPage() {
  const { data: session } = useSession();
  const { data, error, isLoading, mutate } = useSWR<ProjectsResponse>("/api/projects", fetcher);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteProject, setPendingDeleteProject] = useState<Project | null>(null);
  const [engineerFilter, setEngineerFilter] = useState(ALL_ENGINEERS);
  const projects = useMemo(() => data?.data || [], [data?.data]);
  const isForeman = isForemanRole(session?.user?.role);
  const engineerOptions = useMemo(() => {
    const counts = new Map<string, number>();
    projects.forEach((project) => {
      const engineer = normalizeEngineerName(project.se_name) || UNASSIGNED_ENGINEER;
      counts.set(engineer, (counts.get(engineer) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([value, count]) => ({
        value,
        count,
        label: value === UNASSIGNED_ENGINEER ? "ยังไม่ระบุ Site Engineer" : value,
      }))
      .sort((a, b) => {
        if (a.value === UNASSIGNED_ENGINEER) return 1;
        if (b.value === UNASSIGNED_ENGINEER) return -1;
        return a.label.localeCompare(b.label, "th");
      });
  }, [projects]);
  const filteredProjects = useMemo(() => {
    if (engineerFilter === ALL_ENGINEERS) return projects;
    return projects.filter((project) => {
      const engineer = normalizeEngineerName(project.se_name) || UNASSIGNED_ENGINEER;
      return engineer === engineerFilter;
    });
  }, [engineerFilter, projects]);
  const activeEngineerLabel = engineerFilter === ALL_ENGINEERS
    ? "ทุก Site Engineer"
    : engineerOptions.find((option) => option.value === engineerFilter)?.label || "ทุก Site Engineer";

  const handleDelete = async (project: Project) => {
    setDeletingId(project.project_id);
    try {
      const response = await fetch("/api/projects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.project_id }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "ไม่สามารถลบไซต์งานได้");

      await mutate();
      setPendingDeleteProject(null);
    } catch (deleteError) {
      alert(deleteError instanceof Error ? deleteError.message : "ไม่สามารถลบไซต์งานได้");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">ไซต์งาน</h2>
          <p className="text-gray-500">เลือกไซต์เพื่อดูภาพรวม แผนงาน รายงานประจำวัน และไฟล์ของโครงการ</p>
        </div>
        {!isForeman && (
          <Link
            href="/dashboard/projects/new"
            className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 font-medium text-white transition hover:bg-orange-700"
          >
            <Plus size={20} />
            สร้างไซต์งาน
          </Link>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-red-600">
          ไม่สามารถดึงข้อมูลไซต์งานจาก Master Sheet ได้
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600">
              <Filter size={18} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900">กรองไซต์งานตาม Site Engineer</div>
              <div className="mt-0.5 text-xs font-medium text-slate-500">
                แสดง {filteredProjects.length} จาก {projects.length} ไซต์ · {activeEngineerLabel}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={engineerFilter}
              onChange={(event) => setEngineerFilter(event.target.value)}
              className="h-10 min-w-[260px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
              aria-label="กรองไซต์งานตาม Site Engineer"
            >
              <option value={ALL_ENGINEERS}>ทุก Site Engineer ({projects.length})</option>
              {engineerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({option.count})
                </option>
              ))}
            </select>
            {engineerFilter !== ALL_ENGINEERS && (
              <button
                type="button"
                onClick={() => setEngineerFilter(ALL_ENGINEERS)}
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 hover:text-orange-600"
              >
                ล้างฟิลเตอร์
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {filteredProjects.map((project) => {
          const status = getStatus(project.status);
          const statusStyle = getStatusStyle(status);
          const location = project.address || project.province || project.client || "ยังไม่ระบุที่ตั้ง";
          const coverSrc = getCoverSrc(project);
          const progress = getProgressValue(project.percent_done);
          const tasksCount = getCount(project.tasks_count);
          const completedTasks = getCount(project.completed_tasks);
          const overdueTasks = getCount(project.overdue_tasks);
          const delayDays = getCount(project.delay_days);

          return (
            <div
              key={project.project_id}
              className="group relative overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_18px_40px_rgba(15,23,42,0.1)]"
            >
              <Link href={`/dashboard/sites/${project.project_id}`} className="grid min-h-[210px] grid-cols-1 xl:grid-cols-[380px_minmax(420px,1fr)_310px]">
                <div className="relative min-h-[170px] overflow-hidden bg-slate-50 lg:min-h-full">
                  <ProjectCover
                    src={coverSrc}
                    alt={project.name || project.project_id}
                    name={project.name || project.project_id}
                    projectId={project.project_id}
                    status={status}
                    progress={progress}
                  />
                  <div className={`absolute left-4 top-4 rounded-full border px-3.5 py-1.5 text-sm font-extrabold shadow-sm backdrop-blur ${statusStyle.badge}`}>
                    {status}
                  </div>
                </div>

                <div className="flex min-w-0 flex-col justify-between gap-4 p-5 xl:p-6">
                  <p className="flex items-start gap-2.5 text-[15px] leading-7 text-slate-600">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                      <MapPin size={16} />
                    </span>
                    <span className="line-clamp-2">{location}</span>
                  </p>

                  <div className="grid grid-cols-2 gap-3 xl:max-w-[560px]">
                    <DatePill label="เริ่ม" value={getStartDate(project.start_date)} />
                    <DatePill label="สิ้นสุด" value={getEndDate(project.end_date)} />
                  </div>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px] font-medium text-slate-600">
                    <span>Site Engineer: {project.se_name || "-"}</span>
                  </div>
                </div>

                <div className="flex min-w-0 flex-col justify-between gap-4 border-t border-slate-100 bg-slate-50/60 p-5 xl:border-l xl:border-t-0 xl:p-6">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3 text-[15px] font-bold text-slate-700">
                      <span className="truncate">ความก้าวหน้าโครงการ</span>
                      <div className="shrink-0 text-lg font-extrabold text-slate-950">{getProgress(project.percent_done)}</div>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full transition-all duration-500 ${statusStyle.progress}`} style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <HealthPill label="งานเสร็จ" value={`${completedTasks}/${tasksCount}`} />
                    <HealthPill
                      label="งานล่าช้า"
                      value={overdueTasks > 0 ? `${overdueTasks} งาน / ${delayDays} วัน` : "ไม่มี"}
                      tone={overdueTasks > 0 ? "red" : "green"}
                    />
                  </div>
                </div>
              </Link>

              {!isForeman && (
              <div className="absolute right-4 top-4 z-10 flex items-center gap-2 xl:left-[276px] xl:right-auto">
                <Link
                  href={`/dashboard/projects/${project.project_id}/edit`}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/95 text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:text-orange-600 hover:ring-orange-200"
                  aria-label={`แก้ไข ${project.name || project.project_id}`}
                  title="แก้ไขไซต์งาน"
                >
                  <Pencil size={17} />
                </Link>
                <button
                  type="button"
                  onClick={() => setPendingDeleteProject(project)}
                  disabled={deletingId === project.project_id}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/95 text-red-600 shadow-sm ring-1 ring-red-200 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`ลบ ${project.name || project.project_id}`}
                  title="ลบไซต์งาน"
                >
                  <Trash2 size={17} />
                </button>
              </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="col-span-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 bg-white py-12 text-center text-gray-500">
            <span>กำลังโหลดไซต์งาน...</span>
          </div>
        )}

        {projects.length === 0 && !isLoading && !error && (
          <div className="col-span-full rounded-2xl border border-dashed border-gray-200 bg-white py-12 text-center text-gray-500">
            ยังไม่มีไซต์งานใน Master Sheet
          </div>
        )}

        {projects.length > 0 && filteredProjects.length === 0 && !isLoading && !error && (
          <div className="col-span-full rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 py-12 text-center text-orange-700">
            ไม่มีไซต์งานของ {activeEngineerLabel}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDeleteProject)}
        title="ลบไซต์งาน?"
        message={`ต้องการลบ "${pendingDeleteProject?.name || pendingDeleteProject?.project_id || "-"}" ออกจากรายการใช่ไหม`}
        confirmLabel="ลบ"
        cancelLabel="ยกเลิก"
        loading={Boolean(pendingDeleteProject && deletingId === pendingDeleteProject.project_id)}
        onConfirm={() => {
          if (pendingDeleteProject) void handleDelete(pendingDeleteProject);
        }}
        onCancel={() => setPendingDeleteProject(null)}
      />
    </div>
  );
}
