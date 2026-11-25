import { readSiteMenuData } from "@/lib/menuDataCache";
import { getSiteApiContext } from "@/lib/siteApi";
import { createScheduleReadTiming } from "@/lib/scheduleReadTiming";
import { NextResponse } from "next/server";
import { deleteRow, findAll, insert, update } from "@/lib/sheetsCrud";
import { ensureSchema } from "@/lib/sheetsSetup";
import { getProjectContext } from "@/lib/siteContext";
import { isSupabaseBackend, isSupabaseReadEnabled, readWithSheetsFallback } from "@/lib/supabaseRest";
import { getSupabaseMilestones } from "@/lib/supabaseReadModel";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

async function findMilestoneRowIndex(sheetId: string, projectId: string | null, milestoneId: string) {
  const rows = await findAll("Milestones", sheetId);
  const row = rows.find((milestone) => (
    milestone.milestone_id === milestoneId &&
    (!projectId || milestone.project_id === projectId)
  ));
  return row?._rowIndex;
}

export async function GET(req: Request) {
  const timing = createScheduleReadTiming();
  let source: "none" | "supabase" | "sheets" | "sheets_fallback" | "cache" = "none";
  const respond = (body: Record<string, unknown>, status = 200) => timing.finish(NextResponse.json(body, { status }), performance.now(), source);
  try {
    const projectId = new URL(req.url).searchParams.get("project_id");
    const context = projectId ? await timing.measure("site_context", () => getSiteApiContext(projectId, false, { readOnly: true })) : null;
    if (context && "error" in context) return respond({ error: context.error }, context.status);
    const readSheets = async () => {
      source = source === "supabase" ? "sheets_fallback" : "sheets";
      const { sheetId } = context ? { sheetId: context.siteSheetId } : await getProjectContext(projectId);
      const rows = await timing.measure("sheets_read", () => findAll("Milestones", sheetId, undefined, { fresh: true }));
      return projectId ? rows.filter((row) => String(row.project_id || "") === projectId) : rows;
    };
    const load = async () => {
      if (!isSupabaseReadEnabled("site")) return readSheets();
      source = "supabase";
      return readWithSheetsFallback("milestones", () => timing.measure("supabase_read", () => getSupabaseMilestones(projectId)), readSheets);
    };
    let loaded = false;
    const loadMeasured = () => { loaded = true; return load(); };
    const data = context ? await timing.measure("menu_read", () => readSiteMenuData(context, "milestones", loadMeasured)) : await load();
    if (context && !loaded) source = "cache";
    return respond({ success: true, data });
  } catch (error: unknown) {
    return respond({ error: getErrorMessage(error) }, 500);
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
    if (!isSupabaseBackend()) await ensureSchema(sheetId);

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
    const { _rowIndex, milestone_id, project_id, ...updates } = body;
    const milestoneId = typeof milestone_id === "string" ? milestone_id.trim() : "";
    const legacyRowIndex = _rowIndex ? String(_rowIndex) : "";

    if (!milestoneId && !legacyRowIndex) {
      return NextResponse.json({ error: "Missing milestone_id for update" }, { status: 400 });
    }

    const { sheetId } = await getProjectContext(project_id);
    const fallbackRowIndex = isSupabaseBackend()
      ? legacyRowIndex || undefined
      : legacyRowIndex || (milestoneId ? await findMilestoneRowIndex(sheetId, project_id, milestoneId) : undefined);
    const rowKey = isSupabaseBackend() && milestoneId ? milestoneId : legacyRowIndex || milestoneId;
    await update("Milestones", rowKey, { ...updates, ...(milestoneId ? { milestone_id: milestoneId } : {}) }, sheetId, fallbackRowIndex);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rowIndex = searchParams.get("_rowIndex") || "";
    const milestoneId = searchParams.get("milestone_id") || "";
    const projectId = searchParams.get("project_id");

    if (!milestoneId && !rowIndex) {
      return NextResponse.json({ error: "Missing milestone_id for delete" }, { status: 400 });
    }

    const { sheetId } = await getProjectContext(projectId);
    const fallbackRowIndex = isSupabaseBackend()
      ? rowIndex || undefined
      : rowIndex || (milestoneId ? await findMilestoneRowIndex(sheetId, projectId, milestoneId) : undefined);
    const rowKey = isSupabaseBackend() && milestoneId ? milestoneId : rowIndex || milestoneId;
    await deleteRow("Milestones", rowKey, sheetId, fallbackRowIndex);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
