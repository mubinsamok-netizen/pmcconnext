import { createHash } from "node:crypto";
import { revalidateTag, unstable_cache } from "next/cache";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function prefix() {
  return `pmc-menu-v1:${digest(JSON.stringify([
    process.env.VERCEL_ENV, process.env.VERCEL_GIT_COMMIT_REF,
    process.env.DATA_BACKEND, process.env.DATA_BACKEND_FALLBACK,
    process.env.SUPABASE_URL, process.env.SUPABASE_MASTER_SCHEMA,
    process.env.SUPABASE_SITE_SCHEMA_MODE, process.env.SUPABASE_SITE_SCHEMA_PREFIX,
    process.env.SUPABASE_EXPERIMENTAL_SITE_READS, process.env.SUPABASE_EXPERIMENTAL_ADMIN_READS,
    process.env.GOOGLE_MASTER_SHEET_ID, process.env.MASTER_SHEET_ID, process.env.GOOGLE_SHEET_ID,
  ]))}`;
}
const tag = (kind: string, value = "") => `${prefix()}:${kind}:${digest(value)}`;
function normalize(table: string) {
  const name = table.replace(/_/g, "").toLowerCase();
  // Sheets and Postgres names must invalidate the same master data entry.
  return ({ teammembers: "team", userprojectaccess: "usersites" } as Record<string, string>)[name] || name;
}

// Cache data only. Callers must authenticate/authorize before entering this scope.
// Write paths continue to call their existing uncached readers.
export function readSiteMenuData<T>(
  context: { project: { project_id: string }; siteSheetId: string },
  view: string,
  load: () => Promise<T>,
  seconds = 30,
  masterTables: string[] = [],
): Promise<T> {
  const scope = [context.project.project_id, context.siteSheetId];
  return unstable_cache(load, [prefix(), view, ...scope], {
    revalidate: seconds,
    tags: [tag("sites"), ...scope.filter(Boolean).map((value) => tag("site", value)), ...masterTables.map((table) => tag("master", normalize(table)))],
  })();
}

export function readMasterMenuData<T>(table: string, load: () => Promise<T>, seconds = 60): Promise<T> {
  return unstable_cache(load, [prefix(), "master", normalize(table)], {
    revalidate: seconds, tags: [tag("master", normalize(table))],
  })();
}

export function invalidateAuthorizationCache() {
  expire([tag("authorization")]);
}

// Never use a stale grant after its TTL, even while Next refreshes the entry.
export async function readCachedAuthorization(
  identity: string,
  load: () => Promise<Set<string> | null>,
): Promise<Set<string> | null> {
  const snapshot = await unstable_cache(async () => {
    const ids = await load();
    return { ids: ids === null ? null : [...ids], expiresAt: Date.now() + 60_000 };
  }, [prefix(), "authorization", digest(identity)], {
    revalidate: 60, tags: [tag("authorization")],
  })();
  if (snapshot.expiresAt <= Date.now()) return load();
  return snapshot.ids === null ? null : new Set(snapshot.ids);
}

function expire(tags: string[]) {
  try {
    for (const value of new Set(tags)) revalidateTag(value, { expire: 0 });
  } catch (error) {
    // A cache failure must not turn a completed write into a retry/duplicate write.
    console.error("Menu cache invalidation failed; entries expire by TTL", error);
  }
}

export function invalidateMenuDataForWrite(table: string, scopes: string[] = [], updatedFields?: string[]) {
  const name = normalize(table);
  if (name === "team" && updatedFields?.length && updatedFields.every((field) =>
    ["last_login_at", "auth_provider", "member_id", "updated_at"].includes(field))) {
    // A login timestamp changes the staff list, but not grants/site data for every user.
    expire([tag("master", name)]);
    return;
  }
  if (["projects", "team", "usersites"].includes(name)) {
    expire([tag("authorization"), tag("sites"), tag("master", name)]);
    return;
  }
  if (["customers", "contractors", "laborrates", "auditlogs"].includes(name)) {
    expire([tag("master", name)]);
    return;
  }
  // Scope by either project ID or sheet/schema ID, supporting both storage backends.
  const values = scopes.filter(Boolean);
  expire(values.length ? values.map((scope) => tag("site", scope)) : [tag("sites")]);
}
