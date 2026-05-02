import { NextResponse } from "next/server";
import { insert, update, findAll } from "@/lib/sheetsCrud";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project_id");
    
    let tasks = await findAll("Tasks");
    if (projectId) {
      tasks = tasks.filter(t => t.project_id === projectId);
    }
    
    return NextResponse.json({ success: true, data: tasks });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { project_id, name, assignee, start, end, status } = body;

    if (!project_id || !name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const taskData = {
      task_id: `TSK-${Date.now().toString().slice(-6)}`,
      project_id,
      name,
      assignee: assignee || "",
      start: start || "",
      end: end || "",
      status: status || "To Do",
      percent_done: "0"
    };

    const result = await insert("Tasks", taskData);

    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { _rowIndex, ...updates } = body;

    if (!_rowIndex) {
      return NextResponse.json({ error: "Missing _rowIndex for update" }, { status: 400 });
    }

    await update("Tasks", _rowIndex, updates);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
