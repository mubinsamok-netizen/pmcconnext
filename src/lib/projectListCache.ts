import { createHash } from "node:crypto";
import { revalidateTag, unstable_cache } from "next/cache";

// Use the existing Data Cache API without enabling Cache Components across the app.
const CACHE_SECONDS = 60;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function namespace() {
  return digest(JSON.stringify([
    process.env.VERCEL_ENV, process.env.VERCEL_GIT_COMMIT_REF,
    process.env.DATA_BACKEND, process.env.DATA_BACKEND_FALLBACK,
    process.env.SUPABASE_URL, process.env.SUPABASE_MASTER_SCHEMA,
    process.env.SUPABASE_SITE_SCHEMA_MODE, process.env.SUPABASE_SITE_SCHEMA_PREFIX,
    process.env.GOOGLE_MASTER_SHEET_ID || process.env.MASTER_SHEET_ID || process.env.GOOGLE_SHEET_ID,
  ]));
}

function tag(kind: string, scope = "") {
  return `pmc-projects-v1:${namespace()}:${kind}:${scope ? digest(scope) : "all"}`;
}

export function readCachedProjectList<T>(load: () => Promise<T>): Promise<T> {
  return unstable_cache(load, [tag("list")], {
    revalidate: CACHE_SECONDS, tags: [tag("list")],
  })();
}

export function readCachedProjectHealth<T>(
  project: Record<string, string | number | undefined>,
  load: () => Promise<T>
): Promise<T> {
  // Date-dependent warnings must not reuse yesterday's calculation.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const scopes = [String(project.project_id || ""), String(project.site_sheet_id || "")].filter(Boolean);
  return unstable_cache(load, [tag("health"), digest(JSON.stringify(project)), today], {
    revalidate: CACHE_SECONDS,
    tags: [tag("health"), ...scopes.map((scope) => tag("health", scope))],
  })();
}

export function invalidateProjectListForWrite(table: string, scopes: string[] = []) {
  const normalized = table.toLowerCase();
  const isProject = normalized === "projects";
  if (!isProject && !["tasks", "daily_reports", "project_lifecycle", "project_warranty"].includes(normalized)) return;

  try {
    if (isProject) revalidateTag(tag("list"), { expire: 0 });
    const targets = isProject || scopes.length === 0
      ? [tag("health")]
      : [...new Set(scopes.filter(Boolean))].map((scope) => tag("health", scope));
    for (const target of targets) revalidateTag(target, { expire: 0 });
  } catch (error) {
    // A cache failure after a successful write must never trigger a duplicate write/fallback.
    console.error("Project list cache invalidation failed; entries expire after 60 seconds", error);
  }
}
