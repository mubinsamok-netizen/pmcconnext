import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { hasPermission, permissionDeniedMessage } from "@/lib/permissions";
import { findAll, findAllMaster } from "@/lib/sheetsCrud";
import { ensureMasterSchema, ensureSchema } from "@/lib/sheetsSetup";
import { getProjectContext } from "@/lib/siteContext";
import {
  getSupabaseMilestones,
  getSupabaseProjects,
  getSupabaseTasks,
  getSupabaseTeamMembers,
  type SheetLikeRecord,
} from "@/lib/supabaseReadModel";

type CompareTarget = "projects" | "team" | "tasks" | "milestones";
type CompareRow = SheetLikeRecord & Record<string, unknown>;

const TARGET_KEYS: Record<CompareTarget, string> = {
  projects: "project_id",
  team: "member_id",
  tasks: "task_id",
  milestones: "milestone_id",
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !hasPermission(session.user.role, "team.manage")) {
    return NextResponse.json({ error: permissionDeniedMessage("team.manage") }, { status: 403 });
  }
  return null;
}

function parseTarget(value: string | null): CompareTarget | null {
  if (value === "projects" || value === "team" || value === "tasks" || value === "milestones") {
    return value;
  }
  return null;
}

function compareByKey({
  target,
  sheetsRows,
  supabaseRows,
}: {
  target: CompareTarget;
  sheetsRows: CompareRow[];
  supabaseRows: CompareRow[];
}) {
  const key = TARGET_KEYS[target];
  const sheetsIds = new Set(sheetsRows.map((row) => String(row[key] || "")).filter(Boolean));
  const supabaseIds = new Set(supabaseRows.map((row) => String(row[key] || "")).filter(Boolean));

  const missingInSupabase = Array.from(sheetsIds).filter((id) => !supabaseIds.has(id)).sort();
  const missingInSheets = Array.from(supabaseIds).filter((id) => !sheetsIds.has(id)).sort();

  return {
    target,
    key,
    counts: {
      sheets: sheetsRows.length,
      supabase: supabaseRows.length,
    },
    match: sheetsRows.length === supabaseRows.length && missingInSupabase.length === 0 && missingInSheets.length === 0,
    missingInSupabase,
    missingInSheets,
  };
}

async function readSheetsRows(target: CompareTarget, projectId: string | null) {
  if (target === "projects") {
    await ensureMasterSchema();
    return await findAllMaster("Projects") as CompareRow[];
  }

  if (target === "team") {
    await ensureMasterSchema();
    return await findAllMaster("Team") as CompareRow[];
  }

  if (!projectId) {
    throw new Error("project_id is required when comparing tasks or milestones");
  }

  const { sheetId } = await getProjectContext(projectId);
  await ensureSchema(sheetId);

  if (target === "tasks") {
    const rows = await findAll("Tasks", sheetId) as CompareRow[];
    return rows.filter((row) => row.project_id === projectId);
  }

  const rows = await findAll("Milestones", sheetId) as CompareRow[];
  return rows.filter((row) => row.project_id === projectId);
}

async function readSupabaseRows(target: CompareTarget, projectId: string | null) {
  if (target === "projects") return await getSupabaseProjects() as CompareRow[];
  if (target === "team") return await getSupabaseTeamMembers() as CompareRow[];
  if (target === "tasks") return await getSupabaseTasks(projectId) as CompareRow[];
  return await getSupabaseMilestones(projectId) as CompareRow[];
}

export async function GET(req: Request) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const { searchParams } = new URL(req.url);
    const target = parseTarget(searchParams.get("target"));
    const projectId = searchParams.get("project_id");

    if (!target) {
      return NextResponse.json({
        error: "Invalid target",
        targets: Object.keys(TARGET_KEYS),
      }, { status: 400 });
    }

    const [sheetsRows, supabaseRows] = await Promise.all([
      readSheetsRows(target, projectId),
      readSupabaseRows(target, projectId),
    ]);

    return NextResponse.json({
      success: true,
      data: compareByKey({ target, sheetsRows, supabaseRows }),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
