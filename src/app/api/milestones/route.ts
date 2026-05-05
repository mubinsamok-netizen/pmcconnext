import { NextResponse } from "next/server";
import { deleteRow, findAll, insert, update } from "@/lib/sheetsCrud";
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

    let milestones = await findAll("Milestones", sheetId);
    if (projectId) {
      milestones = milestones.filter((milestone) => milestone.project_id === projectId);
    }

    return NextResponse.json({ success: true, data: milestones });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { project_id, title, date, type, color, notes } = body;

    if (!project_id || !title || !date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { sheetId } = await getProjectContext(project_id);
    await ensureSchema(sheetId);

    const milestoneData = {
      milestone_id: `MS-${Date.now().toString().slice(-6)}`,
      project_id,
      title,
      date,
      type: type || "Milestone",
      color: color || "#f97316",
      notes: notes || "",
    };

    const result = await insert("Milestones", milestoneData, sheetId);

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
    await update("Milestones", Number(_rowIndex), updates, sheetId);

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
    await deleteRow("Milestones", rowIndex, sheetId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
