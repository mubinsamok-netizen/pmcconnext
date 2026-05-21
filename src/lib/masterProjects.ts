import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { canAccessProject, isAdminRole } from "@/lib/authz";
import { canAccessSiteSegment } from "@/lib/siteAccess";
import { findAllMaster } from "./sheetsCrud";

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

const MASTER_PROJECTS_CACHE_TTL_MS = 60 * 1000;
let masterProjectsCache: { expiresAt: number; promise: Promise<MasterProject[]> } | null = null;

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
  const now = Date.now();

  if (masterProjectsCache && masterProjectsCache.expiresAt > now) {
    return masterProjectsCache.promise;
  }

  const promise = findAllMaster("Projects") as unknown as Promise<MasterProject[]>;
  masterProjectsCache = {
    expiresAt: now + MASTER_PROJECTS_CACHE_TTL_MS,
    promise,
  };

  try {
    return await promise;
  } catch (error) {
    masterProjectsCache = null;
    throw error;
  }
}

export async function getMasterProject(projectId: string, options: { siteSegment?: string } = {}) {
  const session = await getServerSession(authOptions);
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
    !(await canAccessProject(decodedProjectId, session.user)) ||
    !canAccessSiteSegment(session.user.role, options.siteSegment || "")
  ) {
    notFound();
  }

  return project;
}
