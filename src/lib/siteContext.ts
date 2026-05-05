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
      console.warn("Using legacy site context fallback because Google Sheets quota is temporarily exceeded.");
    } else {
      throw error;
    }
  }

  return {
    sheetId: project?.site_sheet_id || SHEET_ID,
    driveFolderId: project?.drive_folder_id || "",
  };
}
