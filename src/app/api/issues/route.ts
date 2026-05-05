import { NextResponse } from "next/server";
import { insert, update, findAll } from "@/lib/sheetsCrud";
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
    
    let issues = await findAll("Issues", sheetId);
    if (projectId) {
      issues = issues.filter(i => i.project_id === projectId);
    }
    
    return NextResponse.json({ success: true, data: issues });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { project_id, title, priority, status, due_date, owner } = body;

    if (!project_id || !title) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { sheetId } = await getProjectContext(project_id);
    await ensureSchema(sheetId);

    const issueData = {
      issue_id: `ISS-${Date.now().toString().slice(-6)}`,
      project_id,
      title,
      priority: priority || "Medium",
      status: status || "Open",
      due_date: due_date || "",
      owner: owner || ""
    };

    const result = await insert("Issues", issueData, sheetId);

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
    await update("Issues", _rowIndex, updates, sheetId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
