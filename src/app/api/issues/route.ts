import { NextResponse } from "next/server";
import { insert, update, findAll, findAllRaw } from "@/lib/sheetsCrud";
import { ensureSchema } from "@/lib/sheetsSetup";
import { getProjectContext } from "@/lib/siteContext";
import { isSupabaseBackend } from "@/lib/supabaseRest";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

async function findIssueRowIndex(sheetId: string, projectId: string | undefined, issueId: string) {
  const rows = await findAllRaw("Issues", sheetId);
  const match = rows.find((row) => {
    if (String(row.issue_id || "").trim() !== issueId) return false;
    return !projectId || String(row.project_id || "").trim() === projectId;
  });
  return match?._rowIndex;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project_id");
    const { sheetId } = await getProjectContext(projectId);
    if (!isSupabaseBackend()) await ensureSchema(sheetId);
    
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
    if (!isSupabaseBackend()) await ensureSchema(sheetId);

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
    const { _rowIndex, issue_id, project_id, ...updates } = body;
    const issueId = typeof issue_id === "string" ? issue_id.trim() : "";
    const legacyRowIndex = _rowIndex ? String(_rowIndex) : "";

    if (!issueId && !legacyRowIndex) {
      return NextResponse.json({ error: "Missing issue_id for update" }, { status: 400 });
    }

    const { sheetId } = await getProjectContext(project_id);
    const fallbackRowIndex = legacyRowIndex || (issueId ? await findIssueRowIndex(sheetId, project_id, issueId) : undefined);
    const rowKey = isSupabaseBackend() && issueId ? issueId : legacyRowIndex || issueId;
    await update("Issues", rowKey, { ...updates, ...(issueId ? { issue_id: issueId } : {}) }, sheetId, fallbackRowIndex);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
