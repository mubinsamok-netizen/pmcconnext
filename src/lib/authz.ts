import { findAllMaster } from "@/lib/sheetsCrud";
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

const ACCESS_CACHE_TTL_MS = 60 * 1000;
const accessibleProjectIdsCache = new Map<string, {
  expiresAt: number;
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

  const member = team.find((item) => (
    !isInactiveRecord(item) &&
    (normalizeEmail(String(item.email || "")) === email || (googleSub && String(item.google_sub || "") === googleSub))
  ));

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

async function getAccessibleProjectIdsFromSheets(user?: SessionUserLike | null) {
  const [userSites, team, projects] = await Promise.all([
    findAllMaster("UserSites"),
    findAllMaster("Team"),
    findAllMaster("Projects"),
  ]);

  return collectAccessibleProjectIds({ user, userSites, team, projects });
}

async function getAccessibleProjectIdsFromSupabase(user?: SessionUserLike | null) {
  const [userSites, team, projects] = await Promise.all([
    getSupabaseUserProjectAccess(),
    getSupabaseTeamMembers(),
    findAllMaster("Projects"),
  ]);

  return collectAccessibleProjectIds({ user, userSites, team, projects });
}

export function clearProjectAccessCache() {
  accessibleProjectIdsCache.clear();
}

export async function getAccessibleProjectIds(user?: SessionUserLike | null) {
  if (!user?.email && !user?.googleSub) return new Set<string>();
  if (isAdminRole(user.role)) return null;

  const cacheKey = accessCacheKey(user);
  const cached = accessibleProjectIdsCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = isSupabaseReadEnabled("auth")
    ? readWithSheetsFallback(
      "authorization",
      () => getAccessibleProjectIdsFromSupabase(user),
      () => getAccessibleProjectIdsFromSheets(user)
    )
    : getAccessibleProjectIdsFromSheets(user);

  accessibleProjectIdsCache.set(cacheKey, {
    expiresAt: now + ACCESS_CACHE_TTL_MS,
    promise,
  });

  try {
    return await promise;
  } catch (error) {
    accessibleProjectIdsCache.delete(cacheKey);
    throw error;
  }
}

export async function filterProjectsForUser<T extends ProjectLike>(projects: T[], user?: SessionUserLike | null) {
  const accessibleIds = await getAccessibleProjectIds(user);
  if (accessibleIds === null) return projects;
  return projects.filter((project) => project.project_id && accessibleIds.has(project.project_id));
}

export async function canAccessProject(projectId: string, user?: SessionUserLike | null) {
  const accessibleIds = await getAccessibleProjectIds(user);
  if (accessibleIds === null) return true;
  return accessibleIds.has(projectId);
}
