import Link from "next/link";
import { AlertTriangle, CalendarDays, ListChecks, Clock3, FileSignature, NotebookTabs, Bug, FileText } from "lucide-react";
import type { MasterProject } from "@/lib/masterProjects";
import { formatDate, getDailyReportWarning, type DashboardData } from "./overviewData";
import { KpiCard } from "./OverviewUi";

export default async function OverviewPrimary({ project, data, isForeman }: { project: MasterProject; data: Promise<DashboardData>; isForeman: boolean }) {
  const dashboard = await data;
  const dailyReportWarning = getDailyReportWarning(project, dashboard.reports);
  return <>
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

  </>;
}
