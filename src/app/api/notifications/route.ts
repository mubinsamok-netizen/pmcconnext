import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { filterProjectsForUser } from "@/lib/authz";
import { canUserSeeNotification, isUnread, type NotificationRecord } from "@/lib/notifications";
import { getAlertState, getLifecycleReminderTargets, getWarrantyReminderTargets, type ReminderTarget } from "@/lib/projectLifecycle";
import { dispatchReminderIntegrations } from "@/lib/reminderIntegrations";
import { findAll, findAllBatch, findAllMaster, findAllMasterRaw, insertMaster, updateMaster } from "@/lib/sheetsCrud";
import { ensureMasterSchema } from "@/lib/sheetsSetup";
import { isSupabaseBackend } from "@/lib/supabaseRest";

type SheetRecord = Record<string, string | number | undefined>;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

function parseDate(date?: string | number) {
  const value = String(date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(from: Date, to: Date) {
  const start = new Date(from);
  const end = new Date(to);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

function isDoneTask(task: SheetRecord) {
  const status = String(task.status || "").toLowerCase();
  const percent = Number(task.percent_done || 0);
  return status === "done" || status === "completed" || percent >= 100;
}

async function getNotificationFallbackRowIndex(notification: NotificationRecord) {
  const numericRowIndex = Number(notification._rowIndex);
  if (Number.isFinite(numericRowIndex)) return numericRowIndex;

  const rawRows = await findAllMasterRaw("Notifications");
  return rawRows.find((row) => row.notification_id === notification.notification_id)?._rowIndex;
}

async function markNotificationRead(notification: NotificationRecord, readAt: string) {
  await updateMaster(
    "Notifications",
    notification.notification_id || notification._rowIndex || "",
    {
      is_read: "TRUE",
      read_at: readAt,
    },
    await getNotificationFallbackRowIndex(notification)
  );
}

function makeTaskAlert(project: SheetRecord, task: SheetRecord, kind: "overdue" | "due_soon", days: number): NotificationRecord {
  const projectId = String(project.project_id || "");
  const taskName = String(task.name || "งานย่อย");
  const projectName = String(project.name || projectId);

  return {
    notification_id: `AUTO-${kind}-${projectId}-${task.task_id || task._rowIndex}`,
    project_id: projectId,
    type: kind,
    title: kind === "overdue" ? "งานเลยกำหนด" : "งานใกล้ครบกำหนด",
    message: kind === "overdue"
      ? `${projectName}: ${taskName} เลยกำหนด ${Math.abs(days)} วัน`
      : `${projectName}: ${taskName} จะครบกำหนดใน ${days} วัน`,
    link: `/dashboard/sites/${encodeURIComponent(projectId)}/schedule`,
    is_read: "FALSE",
    created_at: new Date().toISOString(),
    is_generated: "TRUE",
  };
}

function makeProjectDateAlert(project: SheetRecord, target: ReminderTarget, kind: "overdue" | "due_soon", days: number): NotificationRecord {
  const projectId = String(project.project_id || "");
  const projectName = String(project.name || projectId);

  return {
    notification_id: `AUTO-${kind}-${projectId}-${target.key}`,
    project_id: projectId,
    type: kind,
    title: target.title,
    message: kind === "overdue"
      ? `${projectName}: ${target.title} เลยกำหนด ${Math.abs(days)} วัน`
      : `${projectName}: ${target.title} ในอีก ${days} วัน`,
    link: target.link,
    is_read: "FALSE",
    created_at: new Date().toISOString(),
    is_generated: "TRUE",
  };
}

async function persistProjectDateAlertOnce(
  alert: NotificationRecord,
  project: SheetRecord,
  target: ReminderTarget,
  existingNotificationIds: Set<string>
) {
  if (!alert.notification_id || existingNotificationIds.has(alert.notification_id)) return;

  await insertMaster("Notifications", {
    notification_id: alert.notification_id,
    project_id: alert.project_id || "",
    target_email: "",
    target_role: "Admin",
    target_google_sub: "",
    type: alert.type || "",
    title: alert.title || "",
    message: alert.message || "",
    link: alert.link || "",
    is_read: "FALSE",
    created_at: alert.created_at || new Date().toISOString(),
    read_at: "",
    created_by_email: "",
    created_by_name: "System",
  });

  existingNotificationIds.add(alert.notification_id);
  await dispatchReminderIntegrations({
    id: alert.notification_id,
    projectId: alert.project_id || "",
    projectName: String(project.name || alert.project_id || ""),
    title: alert.title || "",
    message: alert.message || "",
    link: alert.link || "",
    dueDate: target.dueDate,
  });
}

async function getGeneratedTaskAlerts(projects: SheetRecord[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const alerts: NotificationRecord[] = [];

  await Promise.all(projects.map(async (project) => {
    const projectId = String(project.project_id || "");
    const siteSheetId = String(project.site_sheet_id || "").trim();
    if (!projectId || !siteSheetId) return;

    try {
      const tasks = await findAll("Tasks", siteSheetId) as SheetRecord[];
      tasks
        .filter((task) => task.project_id === projectId && task.task_type !== "heading" && !isDoneTask(task))
        .forEach((task) => {
          const end = parseDate(task.planned_end || task.end);
          if (!end) return;
          const days = daysBetween(today, end);
          if (days < 0) {
            alerts.push(makeTaskAlert(project, task, "overdue", days));
          } else if (days <= 3) {
            alerts.push(makeTaskAlert(project, task, "due_soon", days));
          }
        });
    } catch (error) {
      console.warn(`Failed to build task notifications for ${projectId}:`, error);
    }
  }));

  return alerts;
}

async function getGeneratedProjectDateAlerts(projects: SheetRecord[], existingNotifications: NotificationRecord[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const alerts: NotificationRecord[] = [];
  const persistTasks: Promise<void>[] = [];
  const existingNotificationIds = new Set(existingNotifications.map((notification) => notification.notification_id).filter(Boolean));

  await Promise.all(projects.map(async (project) => {
    const projectId = String(project.project_id || "");
    const siteSheetId = String(project.site_sheet_id || "").trim();
    if (!projectId || !siteSheetId) return;

    try {
      const rows = await findAllBatch(["Project_Lifecycle", "Project_Warranty"], siteSheetId) as Record<string, SheetRecord[]>;
      const lifecycles = rows.Project_Lifecycle || [];
      const warranties = rows.Project_Warranty || [];
      const lifecycle = lifecycles.find((row) => row.project_id === projectId);
      const warranty = warranties.find((row) => row.project_id === projectId);
      const targets = [
        ...getLifecycleReminderTargets(projectId, lifecycle),
        ...getWarrantyReminderTargets(projectId, warranty),
      ];

      targets.forEach((target) => {
        const alertState = getAlertState(today, target);
        if (!alertState) return;
        const alert = makeProjectDateAlert(project, target, alertState.kind, alertState.days);
        alerts.push(alert);
        persistTasks.push(
          persistProjectDateAlertOnce(alert, project, target, existingNotificationIds).catch((error) => {
            console.warn(`Failed to persist external reminder for ${projectId}:`, error);
          })
        );
      });
    } catch (error) {
      console.warn(`Failed to build lifecycle notifications for ${projectId}:`, error);
    }
  }));

  await Promise.allSettled(persistTasks);

  return alerts;
}

export async function GET() {
  try {
    if (!isSupabaseBackend()) await ensureMasterSchema();

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [rawNotifications, rawProjects] = await Promise.all([
      findAllMaster("Notifications") as unknown as Promise<NotificationRecord[]>,
      findAllMaster("Projects") as unknown as Promise<SheetRecord[]>,
    ]);

    const activeProjects = rawProjects.filter((project) => project.active !== "FALSE");
    const accessibleProjects = await filterProjectsForUser(activeProjects, session.user);
    const [taskAlerts, projectDateAlerts] = await Promise.all([
      getGeneratedTaskAlerts(accessibleProjects),
      getGeneratedProjectDateAlerts(accessibleProjects, rawNotifications),
    ]);
    const generatedAlerts = [...taskAlerts, ...projectDateAlerts];

    const visibleNotifications = [];
    for (const notification of rawNotifications) {
      if (await canUserSeeNotification(notification, session.user)) {
        visibleNotifications.push(notification);
      }
    }

    const data = [...generatedAlerts, ...visibleNotifications]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 50);

    return NextResponse.json({
      success: true,
      data,
      unread_count: data.filter(isUnread).length,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    if (!isSupabaseBackend()) await ensureMasterSchema();

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const notificationId = String(body.notification_id || "");
    const markAll = Boolean(body.mark_all);
    const readAt = new Date().toISOString();
    const rawNotifications = await findAllMaster("Notifications") as unknown as NotificationRecord[];
    let updated = 0;

    for (const notification of rawNotifications) {
      if (!notification._rowIndex || notification.is_read === "TRUE") continue;
      if (!markAll && notification.notification_id !== notificationId) continue;
      if (!(await canUserSeeNotification(notification, session.user))) continue;

      await markNotificationRead(notification, readAt);
      updated += 1;
    }

    return NextResponse.json({ success: true, updated });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
