import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/currentSession";
import { canAccessProject, isAdminRole } from "@/lib/authz";
import { canAccessSiteSegment } from "@/lib/siteAccess";
import { readProjectCatalog } from "./projectCatalog";

export type MasterProject = {
  project_id: string;
  name: string;
  client?: string;
  project_type?: string;
  description?: string;
  address?: string;
  province?: string;
  district?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  budget?: string;
  contract_no?: string;
  site_link?: string;
  pm_name?: string;
  se_name?: string;
  architect_name?: string;
  cover_file_id?: string;
  cover_url?: string;
  site_sheet_id?: string;
  drive_folder_id?: string;
  sales_customer_id?: string;
  sales_stage?: string;
  deposit_status?: string;
  line_group_id?: string;
  line_group_name?: string;
  line_notify_enabled?: string;
};


function isQuotaExceeded(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Quota exceeded");
}

function fallbackMasterProject(projectId: string): MasterProject {
  return {
    project_id: projectId,
    name: projectId,
    status: "Planning",
  };
}

export async function getMasterProjects() {
  return await readProjectCatalog() as unknown as MasterProject[];
}

export async function getMasterProject(projectId: string, options: { siteSegment?: string } = {}) {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/");
  }

  const decodedProjectId = decodeURIComponent(projectId);
  let projects: MasterProject[];

  try {
    projects = await getMasterProjects();
  } catch (error) {
    if (isQuotaExceeded(error) && isAdminRole(session.user.role)) {
      console.warn(`Using minimal project fallback for ${decodedProjectId} because Google Sheets read quota is temporarily exceeded.`);
      return fallbackMasterProject(decodedProjectId);
    }
    throw error;
  }

  const project = projects.find((item) => item.project_id === decodedProjectId);

  if (
    !project ||
    !(await canAccessProject(decodedProjectId, session.user, projects)) ||
    !canAccessSiteSegment(session.user.role, options.siteSegment || "")
  ) {
    notFound();
  }

  return project;
}
