import { NextResponse } from "next/server";
import { deleteRow, findAllRaw, insert, update } from "@/lib/sheetsCrud";
import { ensureSchema } from "@/lib/sheetsSetup";
import { getProjectContext } from "@/lib/siteContext";
import { isSupabaseBackend, isSupabaseReadEnabled, readWithSheetsFallback } from "@/lib/supabaseRest";
import { getSupabaseTasks } from "@/lib/supabaseReadModel";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

async function findTaskRowIndex(sheetId: string, projectId: string | null, taskId: string) {
  const rows = await findAllRaw("Tasks", sheetId);
  const row = rows.find((task) => (
    task.task_id === taskId &&
    (!projectId || task.project_id === projectId)
  ));
  return row?._rowIndex;
}

function filterProjectTasks<T extends Record<string, string | number | undefined>>(tasks: T[], projectId?: string | null) {
  if (!projectId) return tasks;
  return tasks.filter((task) => String(task.project_id || "") === projectId);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project_id");

    const readSheetsTasks = async () => {
      const { sheetId } = await getProjectContext(projectId);
      if (!isSupabaseBackend()) await ensureSchema(sheetId);

      return filterProjectTasks(await findAllRaw("Tasks", sheetId), projectId);
    };

    if (isSupabaseReadEnabled("site")) {
      const tasks = await readWithSheetsFallback("tasks", () => getSupabaseTasks(projectId), readSheetsTasks);
      return NextResponse.json({ success: true, data: tasks });
    }

    const tasks = await readSheetsTasks();
    return NextResponse.json({ success: true, data: tasks });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      project_id,
      name,
      assignee,
      start,
      end,
      status,
      percent_done,
      category,
      duration_days,
      priority,
      notes,
      order_index,
      task_type,
      parent_task_id,
      planned_start,
      planned_end,
    } = body;

    if (!project_id || !name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { sheetId } = await getProjectContext(project_id);
    if (!isSupabaseBackend()) await ensureSchema(sheetId);

    const existingTasks = order_index
      ? []
      : isSupabaseReadEnabled("site")
        ? await getSupabaseTasks(project_id)
        : filterProjectTasks(await findAllRaw("Tasks", sheetId), project_id);
    const nextOrder = existingTasks.length + 1;

    const taskData = {
      task_id: `TSK-${Date.now().toString().slice(-6)}`,
      project_id,
      name,
      assignee: assignee || "",
      start: start || "",
      end: end || "",
      status: status || "To Do",
      percent_done: percent_done || "0",
      category: category || "งานทั่วไป",
      duration_days: duration_days || "",
      priority: priority || "ปกติ",
      notes: notes || "",
      order_index: order_index || String(nextOrder),
      task_type: task_type || "subtask",
      parent_task_id: parent_task_id || "",
      planned_start: planned_start || start || "",
      planned_end: planned_end || end || "",
    };

    const result = await insert("Tasks", taskData, sheetId);
    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { _rowIndex, task_id, project_id, ...updates } = body;
    const taskId = typeof task_id === "string" ? task_id.trim() : "";
    const legacyRowIndex = _rowIndex ? String(_rowIndex) : "";

    if (!taskId && !legacyRowIndex) {
      return NextResponse.json({ error: "Missing task_id for update" }, { status: 400 });
    }

    const { sheetId } = await getProjectContext(project_id);
    const fallbackRowIndex = isSupabaseBackend()
      ? legacyRowIndex || undefined
      : legacyRowIndex || (taskId ? await findTaskRowIndex(sheetId, project_id, taskId) : undefined);
    const rowKey = isSupabaseBackend() && taskId ? taskId : legacyRowIndex || taskId;
    await update("Tasks", rowKey, { ...updates, ...(taskId ? { task_id: taskId } : {}) }, sheetId, fallbackRowIndex);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rowIndex = searchParams.get("_rowIndex") || "";
    const taskId = searchParams.get("task_id") || "";
    const projectId = searchParams.get("project_id");

    if (!taskId && !rowIndex) {
      return NextResponse.json({ error: "Missing task_id for delete" }, { status: 400 });
    }

    const { sheetId } = await getProjectContext(projectId);
    const fallbackRowIndex = isSupabaseBackend()
      ? rowIndex || undefined
      : rowIndex || (taskId ? await findTaskRowIndex(sheetId, projectId, taskId) : undefined);
    const rowKey = isSupabaseBackend() && taskId ? taskId : rowIndex || taskId;
    await deleteRow("Tasks", rowKey, sheetId, fallbackRowIndex);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
