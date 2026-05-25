import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { canAccessProject, isAdminRole } from "@/lib/authz";
import { findAllMaster } from "@/lib/sheetsCrud";
import { ensureSchema } from "@/lib/sheetsSetup";
import { isSupabaseBackend } from "@/lib/supabaseRest";

export type SiteApiProject = Record<string, string | number | undefined> & {
  project_id: string;
  name?: string;
  site_sheet_id?: string;
  drive_folder_id?: string;
};

export async function getSiteApiContext(projectId: string, requireAdmin = false) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: "Unauthorized", status: 401 as const };
  }

  if (requireAdmin && !isAdminRole(session.user.role)) {
    return { error: "Admin only", status: 403 as const };
  }

  if (!(await canAccessProject(projectId, session.user))) {
    return { error: "Forbidden", status: 403 as const };
  }

  const projects = await findAllMaster("Projects") as unknown as SiteApiProject[];
  const project = projects.find((item) => item.project_id === projectId && item.active !== "FALSE");
  if (!project) {
    return { error: "Project not found", status: 404 as const };
  }

  const siteSheetId = String(project.site_sheet_id || "").trim();
  if (!siteSheetId) {
    return { error: "Project has no site sheet", status: 400 as const };
  }

  if (!isSupabaseBackend()) await ensureSchema(siteSheetId);

  return { session, project, siteSheetId };
}

export function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function getErrorMessage(error: unknown, fallback = "Internal server error") {
  return error instanceof Error ? error.message : fallback;
}
