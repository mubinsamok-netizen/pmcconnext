import { findAllMaster } from "@/lib/sheetsCrud";
import { ensureMasterSchema } from "@/lib/sheetsSetup";
import { getAppRole, roleMatches } from "@/lib/roles";

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

export async function getAccessibleProjectIds(user?: SessionUserLike | null) {
  if (!user?.email && !user?.googleSub) return new Set<string>();
  if (isAdminRole(user.role)) return null;

  await ensureMasterSchema();

  const email = normalizeEmail(user.email);
  const googleSub = user.googleSub || "";
  const [userSites, team] = await Promise.all([
    findAllMaster("UserSites"),
    findAllMaster("Team"),
  ]);

  const ids = new Set<string>();

  userSites.forEach((site) => {
    const matchesEmail = email && normalizeEmail(site.email) === email;
    const matchesGoogleSub = googleSub && site.google_sub === googleSub;
    if (site.active !== "FALSE" && (matchesEmail || matchesGoogleSub) && site.project_id) {
      ids.add(site.project_id);
    }
  });

  const member = team.find((item) => (
    normalizeEmail(item.email) === email || (googleSub && item.google_sub === googleSub)
  ));

  String(member?.project_ids || "")
    .split(",")
    .map((projectId) => projectId.trim())
    .filter(Boolean)
    .forEach((projectId) => ids.add(projectId));

  return ids;
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
