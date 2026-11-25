import { Suspense } from "react";
import { LayoutDashboard } from "lucide-react";
import type { MasterProject } from "@/lib/masterProjects";
import CustomerPortalShareButton from "@/components/CustomerPortalShareButton";
import SiteWeatherCard from "@/components/SiteWeatherCard";
import { getSiteWeather } from "@/lib/siteWeather";
import { daysUntil, formatDate, statusLabel, type SiteRecord } from "./overviewData";
import { InfoCard } from "./OverviewUi";
import OverviewProgress from "./OverviewProgress";
import OverviewSkeleton from "./OverviewSkeleton";

async function OverviewWeather({ project }: { project: MasterProject }) {
  return <SiteWeatherCard weather={await getSiteWeather(project)} />;
}

export default function OverviewHeader({ project, isForeman, taskRows }: { project: MasterProject; isForeman: boolean; taskRows: Promise<Record<string, SiteRecord[]>> }) {
  const remainingDays = daysUntil(project.end_date);
  return (
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
            <Suspense fallback={<OverviewSkeleton label="กำลังเตรียมความคืบหน้า" compact />}>
              <OverviewProgress rows={taskRows} projectId={project.project_id} />
            </Suspense>
          </div>
          <div className="border-t border-gray-100 bg-gray-50 p-4 xl:border-l xl:border-t-0">
            <Suspense fallback={<OverviewSkeleton label="กำลังเตรียมข้อมูลอากาศ" />}><OverviewWeather project={project} /></Suspense>
            {!isForeman ? (
              <div className="mt-3">
                <CustomerPortalShareButton projectId={project.project_id} />
              </div>
            ) : null}
          </div>
        </div>
      </section>

  );
}
