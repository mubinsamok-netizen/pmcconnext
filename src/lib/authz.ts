import { invalidateAuthorizationCache, readCachedAuthorization } from "./menuDataCache";
import { readProjectCatalog } from "./projectCatalog";
import { findAllMasterRaw } from "@/lib/sheetsCrud";
import { parseProjectIds } from "@/lib/projectIds";
import { getAppRole, roleMatches } from "@/lib/roles";
import { isSupabaseReadEnabled, readWithSheetsFallback } from "@/lib/supabaseRest";
import { getSupabaseTeamMembers, getSupabaseUserProjectAccess } from "@/lib/supabaseReadModel";

type SessionUserLike = {
  name?: string | null;
  email?: string | null;
  role?: string | null;
  googleSub?: string | null;
};

type ProjectLike = Record<string, unknown> & {
  project_id?: string;
  pm_name?: unknown;
  se_name?: unknown;
};
type ProjectSource = ProjectLike[] | Promise<ProjectLike[]>;

const accessibleProjectIdsCache = new Map<string, {
  promise: Promise<Set<string> | null>;
}>();

function normalizeEmail(email?: string | null) {
  return (email || "").trim().toLowerCase();
}

function normalizeText(value?: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isInactiveRecord(record: Record<string, unknown>) {
  return normalizeText(record.active) === "false";
}

function accessCacheKey(user?: SessionUserLike | null) {
  return [
    normalizeText(user?.name),
    normalizeEmail(user?.email),
    user?.googleSub || "",
    getAppRole(user?.role) || user?.role || "",
    isSupabaseReadEnabled("auth") ? "supabase" : "sheets",
  ].join("|");
}

export function isAdminRole(role?: string | null) {
  return getAppRole(role) === "Admin";
}

export { getAppRole, roleMatches };

function findActiveMember(user: SessionUserLike | null | undefined, team: Record<string, unknown>[]) {
  const email = normalizeEmail(user?.email);
  const googleSub = user?.googleSub || "";
  return team.find((item) => (
    !isInactiveRecord(item) &&
    (normalizeEmail(String(item.email || "")) === email || (googleSub && String(item.google_sub || "") === googleSub))
  ));
}

function collectAccessibleProjectIds({
  user,
  userSites,
  team,
  projects,
}: {
  user?: SessionUserLike | null;
  userSites: Record<string, unknown>[];
  team: Record<string, unknown>[];
  projects: Record<string, unknown>[];
}) {
  const email = normalizeEmail(user?.email);
  const googleSub = user?.googleSub || "";
  const ids = new Set<string>();

  userSites.forEach((site) => {
    const matchesEmail = email && normalizeEmail(String(site.email || "")) === email;
    const matchesGoogleSub = googleSub && String(site.google_sub || "") === googleSub;
    if (!isInactiveRecord(site) && (matchesEmail || matchesGoogleSub) && site.project_id) {
      parseProjectIds(site.project_id).forEach((projectId) => ids.add(projectId));
    }
  });

  const member = findActiveMember(user, team);

  parseProjectIds(member?.project_ids).forEach((projectId) => ids.add(projectId));

  const appRole = getAppRole(String(member?.role || user?.role || ""));
  const assignedName = normalizeText(member?.name || user?.name);
  if (assignedName && (appRole === "Engineer" || appRole === "Project Manager")) {
    projects.forEach((project) => {
      if (!project.project_id || isInactiveRecord(project)) return;

      const isAssigned = appRole === "Engineer"
        ? normalizeText(project.se_name) === assignedName
        : normalizeText(project.pm_name) === assignedName;

      if (isAssigned) ids.add(String(project.project_id));
    });
  }

  return ids;
}

async function readAccessibleProjectIds(user: SessionUserLike, source: "sheets" | "supabase", suppliedProjects?: ProjectSource) {
  const [userSites, team] = await Promise.all(source === "supabase"
    ? [getSupabaseUserProjectAccess(), getSupabaseTeamMembers()]
    : [findAllMasterRaw("UserSites"), findAllMasterRaw("Team")]);
  const member = findActiveMember(user, team);
  const role = getAppRole(String(member?.role || user.role || ""));
  const name = normalizeText(member?.name || user.name);
  const needsAssignments = Boolean(name) && (role === "Engineer" || role === "Project Manager");
  // Staff/Foreman use explicit grants. Assignment-based roles reuse the caller's list.
  const projects = needsAssignments ? await (suppliedProjects ?? readProjectCatalog()) : [];
  return collectAccessibleProjectIds({ user, userSites, team, projects });
}

export function clearProjectAccessCache() {
  accessibleProjectIdsCache.clear();
  invalidateAuthorizationCache();
}

export async function getAccessibleProjectIds(user?: SessionUserLike | null, suppliedProjects?: ProjectSource) {
  if (!user?.email && !user?.googleSub) return new Set<string>();
  if (isAdminRole(user.role)) return null;

  const cacheKey = accessCacheKey(user);
  const pending = accessibleProjectIdsCache.get(cacheKey);
  if (pending) return pending.promise;
  const promise = readCachedAuthorization(cacheKey, () => isSupabaseReadEnabled("auth")
    ? readWithSheetsFallback(
      "authorization",
      () => readAccessibleProjectIds(user, "supabase", suppliedProjects),
      () => readAccessibleProjectIds(user, "sheets", suppliedProjects)
    )
    : readAccessibleProjectIds(user, "sheets", suppliedProjects));
  // Share concurrent reads only; completed grants live in the invalidatable shared cache.
  accessibleProjectIdsCache.set(cacheKey, { promise });
  try {
    return await promise;
  } finally {
    if (accessibleProjectIdsCache.get(cacheKey)?.promise === promise) accessibleProjectIdsCache.delete(cacheKey);
  }
}

export async function filterProjectsForUser<T extends ProjectLike>(projects: T[], user?: SessionUserLike | null) {
  const accessibleIds = await getAccessibleProjectIds(user, projects);
  if (accessibleIds === null) return projects;
  return projects.filter((project) => project.project_id && accessibleIds.has(project.project_id));
}

export async function canAccessProject(projectId: string, user?: SessionUserLike | null, suppliedProjects?: ProjectSource) {
  const accessibleIds = await getAccessibleProjectIds(user, suppliedProjects);
  if (accessibleIds === null) return true;
  return accessibleIds.has(projectId);
}
