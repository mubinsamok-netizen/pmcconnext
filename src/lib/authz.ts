import { findAllMaster } from "@/lib/sheetsCrud";
import { getAppRole, roleMatches } from "@/lib/roles";
import { isSupabaseReadEnabled, readWithSheetsFallback } from "@/lib/supabaseRest";
import { getSupabaseTeamMembers, getSupabaseUserProjectAccess } from "@/lib/supabaseReadModel";

type SessionUserLike = {
  email?: string | null;
  role?: string | null;
  googleSub?: string | null;
};

type ProjectLike = Record<string, unknown> & {
  project_id?: string;
};

function normalizeEmail(email?: string | null) {
  return (email || "").trim().toLowerCase();
}

export function isAdminRole(role?: string | null) {
  return getAppRole(role) === "Admin";
}

export { getAppRole, roleMatches };

function collectAccessibleProjectIds({
  user,
  userSites,
  team,
}: {
  user?: SessionUserLike | null;
  userSites: Record<string, unknown>[];
  team: Record<string, unknown>[];
}) {
  const email = normalizeEmail(user?.email);
  const googleSub = user?.googleSub || "";
  const ids = new Set<string>();

  userSites.forEach((site) => {
    const matchesEmail = email && normalizeEmail(String(site.email || "")) === email;
    const matchesGoogleSub = googleSub && String(site.google_sub || "") === googleSub;
    if (site.active !== "FALSE" && (matchesEmail || matchesGoogleSub) && site.project_id) {
      ids.add(String(site.project_id));
    }
  });

  const member = team.find((item) => (
    normalizeEmail(String(item.email || "")) === email || (googleSub && String(item.google_sub || "") === googleSub)
  ));

  String(member?.project_ids || "")
    .split(",")
    .map((projectId) => projectId.trim())
    .filter(Boolean)
    .forEach((projectId) => ids.add(projectId));

  return ids;
}

async function getAccessibleProjectIdsFromSheets(user?: SessionUserLike | null) {
  const [userSites, team] = await Promise.all([
    findAllMaster("UserSites"),
    findAllMaster("Team"),
  ]);

  return collectAccessibleProjectIds({ user, userSites, team });
}

async function getAccessibleProjectIdsFromSupabase(user?: SessionUserLike | null) {
  const [userSites, team] = await Promise.all([
    getSupabaseUserProjectAccess(),
    getSupabaseTeamMembers(),
  ]);

  return collectAccessibleProjectIds({ user, userSites, team });
}

export async function getAccessibleProjectIds(user?: SessionUserLike | null) {
  if (!user?.email && !user?.googleSub) return new Set<string>();
  if (isAdminRole(user.role)) return null;

  if (isSupabaseReadEnabled("auth")) {
    return await readWithSheetsFallback(
      "authorization",
      () => getAccessibleProjectIdsFromSupabase(user),
      () => getAccessibleProjectIdsFromSheets(user)
    );
  }

  return await getAccessibleProjectIdsFromSheets(user);
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
