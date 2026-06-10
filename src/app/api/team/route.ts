import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getAppRole } from "@/lib/roles";
import { hasPermission, permissionDeniedMessage } from "@/lib/permissions";
import { isSupabaseBackend, isSupabaseReadEnabled, readWithSheetsFallback } from "@/lib/supabaseRest";
import { getSupabaseTeamMembers } from "@/lib/supabaseReadModel";
import { serializeProjectIds } from "@/lib/projectIds";
import { deleteRowMaster, findAllMaster, insertMaster, updateMaster } from "@/lib/sheetsCrud";
import { ensureMasterSchema } from "@/lib/sheetsSetup";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

function normalizeText(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isActiveRecord(record: Record<string, unknown>) {
  return normalizeText(record.active || "TRUE") !== "false";
}

function normalizeTeamRecord(record: Record<string, unknown>) {
  return {
    ...record,
    project_ids: serializeProjectIds(record.project_ids),
  };
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !hasPermission(session.user.role, "team.manage")) {
    return NextResponse.json({ error: permissionDeniedMessage("team.manage") }, { status: 403 });
  }
  return null;
}

export async function GET() {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const readSheetsTeam = async () => {
      if (!isSupabaseBackend()) await ensureMasterSchema();
      return await findAllMaster("Team");
    };

    const team = isSupabaseReadEnabled("admin")
      ? await readWithSheetsFallback("team", getSupabaseTeamMembers, readSheetsTeam)
      : await readSheetsTeam();
    return NextResponse.json({ success: true, data: team.filter(isActiveRecord).map(normalizeTeamRecord) });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    if (!isSupabaseBackend()) await ensureMasterSchema();

    const body = await req.json();
    const { name, email, password, phone, role, project_ids } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const existingTeam = await findAllMaster("Team");
    if (existingTeam.some((user) => user.email === email)) {
      return NextResponse.json({ error: "อีเมลนี้มีอยู่ในระบบแล้ว" }, { status: 400 });
    }

    const memberId = `M-${Date.now().toString().slice(-6)}`;
    const projectIds = serializeProjectIds(project_ids);
    const roleValue = getAppRole(String(role || "Staff"));
    const assignedProjectIds = roleValue === "Admin" ? "" : projectIds;

    const memberData = {
      member_id: memberId,
      name,
      email,
      password,
      phone: phone || "",
      role: roleValue,
      project_ids: assignedProjectIds,
      active: "TRUE",
    };

    const result = await insertMaster("Team", memberData);

    await Promise.all(serializeProjectIds(assignedProjectIds).split(",").filter(Boolean).map((projectId) => (
      insertMaster("UserSites", {
        user_site_id: `US-${Date.now().toString().slice(-6)}-${projectId}`,
        email,
        google_sub: "",
        project_id: projectId,
        role: roleValue,
        active: "TRUE",
      })
    )));

    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: unknown) {
    console.error("Failed to create team member:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    if (!isSupabaseBackend()) await ensureMasterSchema();

    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("member_id") || "";
    const rowIndex = searchParams.get("_rowIndex") || "";

    if (!memberId && !rowIndex) {
      return NextResponse.json({ error: "Missing member id" }, { status: 400 });
    }

    const existingTeam = await findAllMaster("Team");
    const currentMember = existingTeam.find((user) => (
      (memberId && String(user.member_id || "") === memberId) ||
      (rowIndex && String(user._rowIndex || "") === rowIndex)
    ));

    if (!currentMember) {
      return NextResponse.json({ error: "ไม่พบพนักงานที่ต้องการลบ" }, { status: 404 });
    }

    const currentEmail = normalizeText(currentMember.email);
    const sessionEmail = normalizeText(session?.user?.email);
    const currentGoogleSub = normalizeText(currentMember.google_sub);
    const sessionGoogleSub = normalizeText(session?.user?.googleSub);
    const sessionMemberId = normalizeText(session?.user?.id);

    if (
      (memberId && normalizeText(memberId) === sessionMemberId) ||
      (currentEmail && currentEmail === sessionEmail) ||
      (currentGoogleSub && currentGoogleSub === sessionGoogleSub)
    ) {
      return NextResponse.json({ error: "ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้" }, { status: 400 });
    }

    await updateMaster(
      "Team",
      String(currentMember.member_id || currentMember._rowIndex),
      { active: "FALSE" },
      currentMember._rowIndex
    );

    const existingUserSites = await findAllMaster("UserSites");
    const accessRows = existingUserSites.filter((item) => {
      const itemEmail = normalizeText(item.email);
      const itemGoogleSub = normalizeText(item.google_sub);
      return (
        (currentEmail && itemEmail === currentEmail) ||
        (currentGoogleSub && itemGoogleSub === currentGoogleSub)
      );
    });

    for (const item of accessRows) {
      await updateMaster(
        "UserSites",
        String(item.user_site_id || item._rowIndex),
        { active: "FALSE" },
        item._rowIndex
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        member_id: currentMember.member_id || memberId,
        deactivated_access_count: accessRows.length,
      },
    });
  } catch (error: unknown) {
    console.error("Failed to delete team member:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    if (!isSupabaseBackend()) await ensureMasterSchema();

    const body = await req.json();
    const { _rowIndex, member_id, name, email, password, phone, role, project_ids } = body;

    if (!_rowIndex || !member_id || !name || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const projectIds = serializeProjectIds(project_ids);
    const roleValue = getAppRole(String(role || "Staff"));
    const assignedProjectIds = roleValue === "Admin" ? "" : projectIds;

    const existingTeam = await findAllMaster("Team");
    const currentMember = existingTeam.find((user) => String(user._rowIndex) === String(_rowIndex));
    const duplicatedEmail = existingTeam.some((user) => (
      user.email === email && String(user._rowIndex) !== String(_rowIndex)
    ));

    if (duplicatedEmail) {
      return NextResponse.json({ error: "อีเมลนี้มีอยู่ในระบบแล้ว" }, { status: 400 });
    }

    const teamPatch = {
      member_id,
      name,
      email,
      phone: phone || "",
      role: roleValue,
      project_ids: assignedProjectIds,
      active: "TRUE",
    } as Record<string, string>;

    if (password !== undefined) {
      teamPatch.password = String(password || "");
    }

    await updateMaster("Team", _rowIndex, teamPatch);

    const existingUserSites = await findAllMaster("UserSites");
    const rowsToDelete = existingUserSites
      .filter((item) => item.email === email || item.email === currentMember?.email)
      .map((item) => item._rowIndex)
      .filter(Boolean)
      .sort((a, b) => Number(b) - Number(a));

    for (const rowIndex of rowsToDelete) {
      await deleteRowMaster("UserSites", rowIndex);
    }

    await Promise.all(serializeProjectIds(assignedProjectIds).split(",").filter(Boolean).map((projectId) => (
      insertMaster("UserSites", {
        user_site_id: `US-${Date.now().toString().slice(-6)}-${projectId}`,
        email,
        google_sub: currentMember?.google_sub || "",
        project_id: projectId,
        role: roleValue,
        active: "TRUE",
      })
    )));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Failed to update team member:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
