export const APP_ROLES = ["Admin", "Project Manager", "Engineer", "Staff"] as const;

export type AppRole = (typeof APP_ROLES)[number];

const ROLE_ALIASES: Record<string, AppRole> = {
  admin: "Admin",
  administrator: "Admin",
  "project manager": "Project Manager",
  project_manager: "Project Manager",
  projectmanager: "Project Manager",
  pm: "Project Manager",
  engineer: "Engineer",
  "site engineer": "Engineer",
  site_engineer: "Engineer",
  staff: "Staff",
  accounting: "Staff",
  accountant: "Staff",
  finance: "Staff",
  office: "Staff",
  "office staff": "Staff",
  office_staff: "Staff",
  backoffice: "Staff",
  "back office": "Staff",
};

export function normalizeRoleKey(role?: string | null) {
  return String(role || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function toAppRole(role?: string | null) {
  const normalized = normalizeRoleKey(role);
  return ROLE_ALIASES[normalized] || ROLE_ALIASES[normalized.replace(/\s+/g, "_")];
}

export function getAppRole(role?: string | null, fallback: AppRole = "Staff"): AppRole {
  return toAppRole(role) || fallback;
}

export function isAppRole(role?: string | null) {
  return Boolean(toAppRole(role));
}

export function roleMatches(userRole: string | null | undefined, allowedRoles: string[]) {
  const userAppRole = toAppRole(userRole);
  const userRawRole = normalizeRoleKey(userRole);

  return allowedRoles.some((allowedRole) => {
    const allowedAppRole = toAppRole(allowedRole);
    if (allowedAppRole && userAppRole) return allowedAppRole === userAppRole;
    return normalizeRoleKey(allowedRole) === userRawRole;
  });
}
