import { NextResponse } from "next/server";
import { deleteRow, findAll, insert, update } from "@/lib/sheetsCrud";
import { createSessionNotification } from "@/lib/notifications";
import { ensureSchema } from "@/lib/sheetsSetup";
import { getProjectContext } from "@/lib/siteContext";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project_id");
    const { sheetId } = await getProjectContext(projectId);
    await ensureSchema(sheetId);
    
    let tasks = await findAll("Tasks", sheetId);
    if (projectId) {
      tasks = tasks.filter(t => t.project_id === projectId);
    }
    
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
    await ensureSchema(sheetId);

    const existingTasks = (await findAll("Tasks", sheetId)).filter((task) => task.project_id === project_id);
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

    try {
      await createSessionNotification({
        project_id,
        type: "schedule_task_created",
        title: "เพิ่มงานในแผนงาน",
        message: `${name} (${assignee || "ยังไม่ระบุผู้รับผิดชอบ"})`,
        link: `/dashboard/sites/${encodeURIComponent(project_id)}/schedule`,
      });
    } catch (error) {
      console.warn("Failed to create task notification:", error);
    }

    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { _rowIndex, project_id, ...updates } = body;

    if (!_rowIndex) {
      return NextResponse.json({ error: "Missing _rowIndex for update" }, { status: 400 });
    }

    const { sheetId } = await getProjectContext(project_id);
    await update("Tasks", Number(_rowIndex), updates, sheetId);

    if (updates.status || updates.percent_done) {
      try {
        await createSessionNotification({
          project_id,
          type: "schedule_task_updated",
          title: "อัปเดตความคืบหน้างาน",
          message: updates.status ? `เปลี่ยนสถานะเป็น ${updates.status}` : `อัปเดตความคืบหน้าเป็น ${updates.percent_done}%`,
          link: `/dashboard/sites/${encodeURIComponent(project_id)}/schedule`,
        });
      } catch (error) {
        console.warn("Failed to create task update notification:", error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rowIndex = Number(searchParams.get("_rowIndex"));
    const projectId = searchParams.get("project_id");

    if (!rowIndex) {
      return NextResponse.json({ error: "Missing _rowIndex for delete" }, { status: 400 });
    }

    const { sheetId } = await getProjectContext(projectId);
    await deleteRow("Tasks", rowIndex, sheetId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
