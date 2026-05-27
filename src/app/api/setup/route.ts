import { NextResponse } from "next/server";
import { createSiteSpreadsheet, ensureMasterSchema, ensureSchema } from "@/lib/sheetsSetup";
import { findAllMaster, findAllRaw, insert, insertMaster, updateMaster } from "@/lib/sheetsCrud";

const SITE_DATA_TABLES = ["Tasks", "Milestones", "Daily_Reports", "Budget", "Materials", "Issues"] as const;

async function migrateLegacyWorkspaceData() {
  const [masterProjects, masterTeam] = await Promise.all([
    findAllMaster("Projects"),
    findAllMaster("Team"),
  ]);

  const migrated = {
    projects: 0,
    team: 0,
  };

  if (masterProjects.length === 0) {
    const legacyProjects = await findAllRaw("Projects");
    for (const project of legacyProjects) {
      await insertMaster("Projects", {
        project_id: project.project_id,
        name: project.name,
        client: project.client,
        start_date: project.start_date,
        end_date: project.end_date,
        status: project.status || "Planning",
        budget: project.budget,
        site_sheet_id: "",
        drive_folder_id: project.drive_folder_id,
        active: "TRUE",
      });
      migrated.projects += 1;
    }
  }

  if (masterTeam.length === 0) {
    const legacyTeam = await findAllRaw("Team");
    for (const member of legacyTeam) {
      await insertMaster("Team", {
        member_id: member.member_id,
        name: member.name,
        role: member.role,
        email: member.email,
        password: member.password,
        phone: member.phone,
        project_ids: member.project_ids,
        active: "TRUE",
      });
      migrated.team += 1;
    }
  }

  return migrated;
}

async function migrateLegacySiteData() {
  const masterProjects = await findAllMaster("Projects");
  const migrated = {
    siteSheets: 0,
    rows: 0,
    skipped: 0,
  };

  for (const project of masterProjects) {
    if (!project.project_id || project.site_sheet_id) continue;

    let siteSheetId = "";
    try {
      siteSheetId = await createSiteSpreadsheet(
        `${project.project_id} - ${project.name || "Site"} Data`,
        String(project.drive_folder_id || "")
      );
    } catch (error) {
      console.error(`Failed to create site sheet for ${project.project_id}:`, error);
      migrated.skipped += 1;
      continue;
    }

    await updateMaster("Projects", project._rowIndex, { site_sheet_id: siteSheetId });
    migrated.siteSheets += 1;

    for (const tableName of SITE_DATA_TABLES) {
      const legacyRows = await findAllRaw(tableName);
      const projectRows = legacyRows.filter((row) => row.project_id === project.project_id);
      for (const row of projectRows) {
        await insert(tableName, row, siteSheetId);
        migrated.rows += 1;
      }
    }
  }

  return migrated;
}

export async function POST() {
  try {
    const [siteResult, masterResult] = await Promise.all([ensureSchema(), ensureMasterSchema()]);
    if (siteResult.success && masterResult.success) {
      const workspace = await migrateLegacyWorkspaceData();
      const siteData = await migrateLegacySiteData();
      return NextResponse.json({ message: "Schema ensured successfully", migrated: { workspace, siteData } }, { status: 200 });
    } else {
      return NextResponse.json({
        error: "Failed to ensure schema",
        details: {
          site: siteResult.success ? null : siteResult.error,
          master: masterResult.success ? null : masterResult.error,
        },
      }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Internal server error", details: error }, { status: 500 });
  }
}
