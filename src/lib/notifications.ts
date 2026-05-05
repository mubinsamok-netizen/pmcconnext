import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { canAccessProject, isAdminRole } from "@/lib/authz";
import { roleMatches, toAppRole } from "@/lib/roles";
import { insertMaster } from "@/lib/sheetsCrud";
import { ensureMasterSchema } from "@/lib/sheetsSetup";

type SessionUserLike = {
  name?: string | null;
  email?: string | null;
  role?: string | null;
  googleSub?: string | null;
};

type NotificationInput = {
  project_id?: string;
  target_email?: string;
  target_role?: string;
  target_google_sub?: string;
  type: string;
  title: string;
  message?: string;
  link?: string;
  created_by_email?: string;
  created_by_name?: string;
};

export type NotificationRecord = {
  _rowIndex?: number;
  notification_id: string;
  project_id?: string;
  target_email?: string;
  target_role?: string;
  target_google_sub?: string;
  type?: string;
  title?: string;
  message?: string;
  link?: string;
  is_read?: string;
  created_at?: string;
  read_at?: string;
  created_by_email?: string;
  created_by_name?: string;
  is_generated?: string;
};

function normalizeEmail(email?: string | null) {
  return (email || "").trim().toLowerCase();
}

function normalizeRole(role?: string | null) {
  return String(toAppRole(role) || role || "").trim();
}

export function isUnread(notification: NotificationRecord) {
  return notification.is_read !== "TRUE";
}

export async function createNotification(input: NotificationInput) {
  await ensureMasterSchema();

  const now = new Date().toISOString();
  const id = `NTF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  return insertMaster("Notifications", {
    notification_id: id,
    project_id: input.project_id || "",
    target_email: normalizeEmail(input.target_email),
    target_role: input.target_role ? toAppRole(input.target_role) || input.target_role : "",
    target_google_sub: input.target_google_sub || "",
    type: input.type,
    title: input.title,
    message: input.message || "",
    link: input.link || "",
    is_read: "FALSE",
    created_at: now,
    read_at: "",
    created_by_email: normalizeEmail(input.created_by_email),
    created_by_name: input.created_by_name || "",
  });
}

export async function createSessionNotification(input: NotificationInput) {
  const session = await getServerSession(authOptions);
  return createNotification({
    ...input,
    created_by_email: input.created_by_email || session?.user?.email || "",
    created_by_name: input.created_by_name || session?.user?.name || "",
  });
}

export async function canUserSeeNotification(notification: NotificationRecord, user?: SessionUserLike | null) {
  if (!user?.email && !user?.googleSub) return false;
  if (isAdminRole(user.role)) return true;

  const userEmail = normalizeEmail(user.email);
  const targetEmail = normalizeEmail(notification.target_email);
  const targetRole = normalizeRole(notification.target_role);
  const targetGoogleSub = notification.target_google_sub || "";

  if (targetEmail && targetEmail !== userEmail) return false;
  if (targetGoogleSub && targetGoogleSub !== user.googleSub) return false;
  if (targetRole && !roleMatches(user.role, [targetRole])) return false;

  if (notification.project_id) {
    return canAccessProject(notification.project_id, user);
  }

  return Boolean(targetEmail || targetGoogleSub || targetRole);
}
