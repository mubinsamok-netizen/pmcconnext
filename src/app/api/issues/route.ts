import { NextResponse } from "next/server";
import { insert, update, findAll } from "@/lib/sheetsCrud";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project_id");
    
    let issues = await findAll("Issues");
    if (projectId) {
      issues = issues.filter(i => i.project_id === projectId);
    }
    
    return NextResponse.json({ success: true, data: issues });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { project_id, title, priority, status, due_date, owner } = body;

    if (!project_id || !title) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const issueData = {
      issue_id: `ISS-${Date.now().toString().slice(-6)}`,
      project_id,
      title,
      priority: priority || "Medium",
      status: status || "Open",
      due_date: due_date || "",
      owner: owner || ""
    };

    const result = await insert("Issues", issueData);

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

    await update("Issues", _rowIndex, updates);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
