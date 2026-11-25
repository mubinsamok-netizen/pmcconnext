import type { Session } from "next-auth";
import { filterProjectsForUser } from "@/lib/authz";
import { isSupabaseBackend } from "@/lib/supabaseRest";
import { getSupabaseSiteSchemaName, isSupabaseSiteSchemaMode } from "@/lib/supabaseSchema";
import { readProjectCatalog } from "@/lib/projectCatalog";

export async function readInitialProjects(user: NonNullable<Session["user"]>) {
  const rows = await readProjectCatalog();
  const projects = await filterProjectsForUser(rows.filter(row => row.active !== "FALSE"), user);
  return projects.map(project => {
    const id = String(project.project_id || "").trim();
    const schemaMode = isSupabaseBackend() && isSupabaseSiteSchemaMode() && Boolean(id);
    return { ...project, project_id: id, name: String(project.name || id), site_storage_mode: schemaMode ? "supabase_schema" : "google_sheet", site_schema_name: schemaMode ? getSupabaseSiteSchemaName(id) : "" };
  });
}
