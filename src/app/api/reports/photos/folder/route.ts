import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { findOrCreateFolder } from "@/lib/drive";
import { getMasterProjects, type MasterProject } from "@/lib/masterProjects";
import { getProjectContext } from "@/lib/siteContext";

type ProjectWithDrive = MasterProject & {
  drive_folder_id?: string;
};

function getMonthKey(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : new Date().toISOString().slice(0, 7);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

async function getProject(projectId: string) {
  try {
    const projects = await getMasterProjects() as ProjectWithDrive[];
    return projects.find((project) => project.project_id === projectId);
  } catch (error) {
    console.warn("Failed to load master project for photo folder context:", error);
    return undefined;
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const projectId = String(body?.project_id || "").trim();
    const date = String(body?.date || "").trim();

    if (!projectId || !date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const project = await getProject(projectId);
    const { driveFolderId } = await getProjectContext(projectId);
    const targetDriveFolderId = project?.drive_folder_id || driveFolderId;
    if (!targetDriveFolderId) {
      return NextResponse.json({ error: "Project Drive folder is not configured" }, { status: 400 });
    }

    const dailyReportsFolder = await findOrCreateFolder("Daily Reports", targetDriveFolderId);
    if (!dailyReportsFolder.id) throw new Error("Failed to create Daily Reports folder");

    const monthFolder = await findOrCreateFolder(getMonthKey(date), dailyReportsFolder.id);
    if (!monthFolder.id) throw new Error("Failed to create monthly report folder");

    const photosFolder = await findOrCreateFolder("Photos", monthFolder.id);
    if (!photosFolder.id) throw new Error("Failed to create Photos folder");

    return NextResponse.json({
      success: true,
      data: {
        folder_id: photosFolder.id,
        folder_url: photosFolder.webViewLink || `https://drive.google.com/drive/folders/${photosFolder.id}`,
      },
    });
  } catch (error: unknown) {
    console.error("Failed to resolve report photo folder:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
