import { SHEET_ID } from "./google";
import { getMasterProjects } from "./masterProjects";

type MasterProject = {
  project_id: string;
  site_sheet_id?: string;
  drive_folder_id?: string;
};

export async function getProjectContext(projectId?: string | null) {
  if (!projectId) {
    return {
      sheetId: SHEET_ID,
      driveFolderId: "",
    };
  }

  let project: MasterProject | undefined;

  try {
    const projects = await getMasterProjects() as MasterProject[];
    project = projects.find((item) => item.project_id === projectId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Quota exceeded")) {
      throw new Error("Google Sheets quota exceeded while resolving project workspace");
    } else {
      throw error;
    }
  }

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const siteSheetId = String(project.site_sheet_id || "").trim();
  if (!siteSheetId) {
    throw new Error(`Project ${projectId} has no site sheet`);
  }

  return {
    sheetId: siteSheetId,
    driveFolderId: project?.drive_folder_id || "",
  };
}
