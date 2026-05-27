import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { createResumableUploadSession, findOrCreateFolder } from "@/lib/drive";
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

function safeFileName(fileName: string) {
  const normalized = fileName.trim() || "photo.jpg";
  return normalized.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_");
}

async function getProject(projectId: string) {
  try {
    const projects = await getMasterProjects() as ProjectWithDrive[];
    return projects.find((project) => project.project_id === projectId);
  } catch (error) {
    console.warn("Failed to load master project for photo upload context:", error);
    return undefined;
  }
}

async function getDailyReportPhotoFolder(projectId: string, date: string) {
  const project = await getProject(projectId);
  const { driveFolderId } = await getProjectContext(projectId);
  const targetDriveFolderId = project?.drive_folder_id || driveFolderId;
  if (!targetDriveFolderId) throw new Error("Project Drive folder is not configured");

  const dailyReportsFolder = await findOrCreateFolder("Daily Reports", targetDriveFolderId);
  if (!dailyReportsFolder.id) throw new Error("Failed to create Daily Reports folder");

  const monthFolder = await findOrCreateFolder(getMonthKey(date), dailyReportsFolder.id);
  if (!monthFolder.id) throw new Error("Failed to create monthly report folder");

  const photosFolder = await findOrCreateFolder("Photos", monthFolder.id);
  if (!photosFolder.id) throw new Error("Failed to create Photos folder");

  return photosFolder;
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
    const fileName = safeFileName(String(body?.file_name || "photo.jpg"));
    const mimeType = String(body?.mime_type || "application/octet-stream");
    const size = Number(body?.size || 0);

    if (!projectId || !date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: "Invalid file size" }, { status: 400 });
    }

    const photosFolder = await getDailyReportPhotoFolder(projectId, date);
    const photosFolderId = photosFolder.id;
    if (!photosFolderId) throw new Error("Failed to resolve Photos folder");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const storedName = `${projectId}_${date}_${timestamp}_${fileName}`;
    const { uploadUrl } = await createResumableUploadSession({
      fileName: storedName,
      mimeType,
      size,
      parentId: photosFolderId,
    });

    return NextResponse.json({
      success: true,
      data: {
        upload_url: uploadUrl,
        folder_id: photosFolderId,
        folder_url: photosFolder.webViewLink || `https://drive.google.com/drive/folders/${photosFolderId}`,
        file_name: storedName,
      },
    });
  } catch (error: unknown) {
    console.error("Failed to create report photo upload session:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
