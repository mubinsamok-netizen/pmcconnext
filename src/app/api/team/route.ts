import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getAppRole } from "@/lib/roles";
import { hasPermission, permissionDeniedMessage } from "@/lib/permissions";
import { deleteRowMaster, findAllMaster, insertMaster, updateMaster } from "@/lib/sheetsCrud";
import { ensureMasterSchema } from "@/lib/sheetsSetup";

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

export async function GET() {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    await ensureMasterSchema();

    const team = await findAllMaster("Team");
    return NextResponse.json({ success: true, data: team });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    await ensureMasterSchema();

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
    const projectIds = Array.isArray(project_ids)
      ? project_ids.filter(Boolean).join(",")
      : typeof project_ids === "string" ? project_ids : "";
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

    await Promise.all(assignedProjectIds.split(",").filter(Boolean).map((projectId) => (
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

export async function PUT(req: Request) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    await ensureMasterSchema();

    const body = await req.json();
    const { _rowIndex, member_id, name, email, password, phone, role, project_ids } = body;

    if (!_rowIndex || !member_id || !name || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const projectIds = Array.isArray(project_ids)
      ? project_ids.filter(Boolean).join(",")
      : typeof project_ids === "string" ? project_ids : "";
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

    await updateMaster("Team", Number(_rowIndex), {
      member_id,
      name,
      email,
      password,
      phone: phone || "",
      role: roleValue,
      project_ids: assignedProjectIds,
      active: "TRUE",
    });

    const existingUserSites = await findAllMaster("UserSites");
    const rowsToDelete = existingUserSites
      .filter((item) => item.email === email || item.email === currentMember?.email)
      .map((item) => Number(item._rowIndex))
      .filter(Boolean)
      .sort((a, b) => b - a);

    for (const rowIndex of rowsToDelete) {
      await deleteRowMaster("UserSites", rowIndex);
    }

    await Promise.all(assignedProjectIds.split(",").filter(Boolean).map((projectId) => (
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
