import { getMasterProjects } from "@/lib/masterProjects";
import { findAll, findAllRaw } from "@/lib/sheetsCrud";
import { getProjectContext } from "@/lib/siteContext";
import { isSupabaseReadEnabled, readWithSheetsFallback, shouldFallbackToSheets } from "@/lib/supabaseRest";
import { getSupabaseMilestones, getSupabaseTasks } from "@/lib/supabaseReadModel";

type ScheduleRow = Record<string, string | number | undefined>;

type PublicMasterProject = {
  project_id: string;
  name?: string;
  client?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  active?: string;
};

function onlyProject(rows: ScheduleRow[], projectId: string) {
  return rows.filter((row) => String(row.project_id || "") === projectId);
}

function mergeRows(primary: ScheduleRow[], fallback: ScheduleRow[], idField: string) {
  const merged = new Map<string, ScheduleRow>();
  fallback.forEach((row, index) => merged.set(String(row[idField] || `fallback-${index}`), row));
  primary.forEach((row, index) => merged.set(String(row[idField] || `primary-${index}`), row));
  return Array.from(merged.values());
}

async function getPublicMasterProject(projectId: string) {
  const projects = await getMasterProjects() as PublicMasterProject[];
  const project = projects.find((item) => item.project_id === projectId && item.active !== "FALSE");
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return project;
}

export async function getPublicScheduleData(projectId: string) {
  const project = await getPublicMasterProject(projectId);
  const { sheetId } = await getProjectContext(projectId);

  const readSheetTasks = async () => onlyProject(await findAllRaw("Tasks", sheetId), projectId);
  const readSheetMilestones = async () => onlyProject(await findAll("Milestones", sheetId), projectId);

  const [tasks, milestones] = await Promise.all([
    isSupabaseReadEnabled("site")
      ? readWithSheetsFallback("public schedule tasks", async () => {
          const primary = await getSupabaseTasks(projectId);
          return shouldFallbackToSheets() ? mergeRows(primary, await readSheetTasks(), "task_id") : primary;
        }, readSheetTasks)
      : readSheetTasks(),
    isSupabaseReadEnabled("site")
      ? readWithSheetsFallback("public schedule milestones", () => getSupabaseMilestones(projectId), readSheetMilestones)
      : readSheetMilestones(),
  ]);

  return {
    project: {
      project_id: project.project_id,
      name: project.name,
      client: project.client || "",
      status: project.status || "",
      start_date: project.start_date || "",
      end_date: project.end_date || "",
    },
    tasks: tasks.map((task) => ({
      task_id: String(task.task_id || ""),
      name: String(task.name || ""),
      assignee: String(task.assignee || ""),
      start: String(task.start || task.planned_start || ""),
      end: String(task.end || task.planned_end || ""),
      status: String(task.status || "To Do"),
      percent_done: String(task.percent_done || "0"),
      category: String(task.category || ""),
      order_index: String(task.order_index || ""),
      task_type: String(task.task_type || "subtask"),
      parent_task_id: String(task.parent_task_id || ""),
    })),
    milestones: milestones.map((milestone) => ({
      milestone_id: String(milestone.milestone_id || ""),
      title: String(milestone.title || ""),
      date: String(milestone.date || ""),
      type: String(milestone.type || ""),
      color: String(milestone.color || "#f97316"),
    })),
    updated_at: new Date().toISOString(),
  };
}
