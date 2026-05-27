import { supabaseRpc, supabaseSelect } from "@/lib/supabaseRest";

type ProjectSchemaRow = {
  project_id?: string | null;
  site_sheet_id?: string | null;
};

const schemaCache = new Map<string, Promise<string>>();

function isEnabled(value?: string) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export function isSupabaseSiteSchemaMode() {
  return isEnabled(process.env.SUPABASE_SITE_SCHEMA_MODE);
}

export function getSupabaseMasterSchema() {
  return String(process.env.SUPABASE_MASTER_SCHEMA || "").trim() || undefined;
}

function normalizeIdentifierPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getSupabaseSiteSchemaName(projectId: string) {
  const prefix = String(process.env.SUPABASE_SITE_SCHEMA_PREFIX || "site_").trim() || "site_";
  const normalized = normalizeIdentifierPart(projectId);
  if (!normalized) throw new Error("Cannot create Supabase site schema without project_id");
  return `${prefix}${normalized}`.slice(0, 63);
}

export async function resolveSupabaseProjectId(workspaceKey?: string | null) {
  const key = String(workspaceKey || "").trim();
  if (!key) return "";

  const cached = schemaCache.get(key);
  if (cached) return cached;

  const promise = supabaseSelect<ProjectSchemaRow>("projects", {
    or: `(project_id.eq.${key},site_sheet_id.eq.${key})`,
    limit: "1",
  }, {
    schema: getSupabaseMasterSchema(),
  }).then((rows) => String(rows[0]?.project_id || key).trim());

  schemaCache.set(key, promise);
  return promise;
}

export async function getSupabaseSiteSchema(workspaceKey?: string | null) {
  if (!isSupabaseSiteSchemaMode()) return undefined;
  const projectId = await resolveSupabaseProjectId(workspaceKey);
  return projectId ? getSupabaseSiteSchemaName(projectId) : undefined;
}

export async function createSupabaseSiteSchema(projectId: string) {
  if (!isSupabaseSiteSchemaMode()) return "";
  const schemaName = getSupabaseSiteSchemaName(projectId);
  await supabaseRpc("create_site_schema", {
    p_project_id: projectId,
    p_schema_name: schemaName,
  });
  schemaCache.set(projectId, Promise.resolve(projectId));
  schemaCache.set(schemaName, Promise.resolve(projectId));
  return schemaName;
}
