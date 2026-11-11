import { clampPercent, isProjectRow, stringValue, type SiteRecord } from "./overviewData";

export default async function OverviewProgress({ rows, projectId }: { rows: Promise<Record<string, SiteRecord[]>>; projectId: string }) {
  let data: Record<string, SiteRecord[]>;
  try {
    data = await rows;
  } catch {
    return <p role="alert" className="mt-4 text-sm text-amber-700">ยังไม่สามารถโหลดความคืบหน้าจากแผนงานได้</p>;
  }
  const belongs = isProjectRow(projectId);
  const tasks = (data.Tasks || []).filter((task) => belongs(task) && stringValue(task.task_type) !== "heading");
  const percent = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + clampPercent(task.percent_done), 0) / tasks.length) : 0;
  return <div className="mt-4">
    <div className="mb-2 flex items-center justify-between text-xs font-bold text-gray-500"><span>ความคืบหน้าจากแผนงาน</span><span>{percent}%</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-orange-600" style={{ width: `${Math.min(percent, 100)}%` }} /></div>
  </div>;
}
