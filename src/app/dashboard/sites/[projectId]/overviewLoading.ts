import { readSiteMenuData } from "@/lib/menuDataCache";
import type { MasterProject } from "@/lib/masterProjects";
import { findAllBatch } from "@/lib/sheetsCrud";
import { getProjectContext } from "@/lib/siteContext";
import { getDashboardData, type SiteRecord } from "./overviewData";

const PRIMARY = ["Milestones", "Issues", "Daily_Reports", "Defect_Rounds", "Defect_Items", "Site_Notes", "Site_Memos", "Project_Lifecycle", "Project_Warranty"] as const;
const SECONDARY = ["Customer_Decisions", "QC_Checklists", "Materials", "Weekly_Reports", "Monthly_Reports", "Project_Documents", "Variation_Orders", "VO_Finance_Ledger"] as const;

// Each table is read once per page render. Existing Sheets/Supabase fallback rules remain in findAllBatch.
export function createOverviewStreams(project: MasterProject) {
  const context = (async () => {
    const { sheetId } = await getProjectContext(project.project_id);
    return sheetId;
  })();
  async function read(tables: Parameters<typeof findAllBatch>[0]) {
    const siteSheetId = await context;
    return await readSiteMenuData({ project, siteSheetId }, `overview:${tables.join(",")}`, () =>
      findAllBatch(tables, siteSheetId, { projectId: project.project_id, overviewOnly: true, fresh: true })
    ) as Record<string, SiteRecord[]>;
  }
  const tasks = read(["Tasks"]);
  const primaryRows = Promise.all([tasks, read([...PRIMARY])]).then(([work, other]) => ({ ...work, ...other }));
  const completeRows = Promise.all([primaryRows, read([...SECONDARY])]).then(([primary, secondary]) => ({ ...primary, ...secondary }));
  const primary = getDashboardData(project, primaryRows, false);
  const complete = getDashboardData(project, completeRows);
  // Catch for the progress boundary even if rendering is interrupted before that boundary starts.
  void tasks.catch(() => undefined);
  return { tasks, primary, complete };
}
