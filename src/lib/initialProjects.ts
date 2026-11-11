import type { Session } from "next-auth";
import { filterProjectsForUser } from "@/lib/authz";
import { findAllMasterRaw } from "@/lib/sheetsCrud";
import { getSupabaseProjects } from "@/lib/supabaseReadModel";
import { isSupabaseBackend, isSupabaseReadEnabled, readWithSheetsFallback } from "@/lib/supabaseRest";
import { getSupabaseSiteSchemaName, isSupabaseSiteSchemaMode } from "@/lib/supabaseSchema";
import { readCachedProjectList } from "@/lib/projectListCache";

export async function readInitialProjects(user: NonNullable<Session["user"]>) {
  const load = () => isSupabaseReadEnabled("projects")
    ? readWithSheetsFallback("projects", getSupabaseProjects, () => findAllMasterRaw("Projects"))
    : findAllMasterRaw("Projects");
  const rows = await readCachedProjectList(load);
  const projects = await filterProjectsForUser(rows.filter(row => row.active !== "FALSE"), user);
  return projects.map(project => {
    const id = String(project.project_id || "").trim();
    const schemaMode = isSupabaseBackend() && isSupabaseSiteSchemaMode() && Boolean(id);
    return { ...project, project_id: id, name: String(project.name || id), site_storage_mode: schemaMode ? "supabase_schema" : "google_sheet", site_schema_name: schemaMode ? getSupabaseSiteSchemaName(id) : "" };
  });
}
