import { NextResponse } from "next/server";
import { readDriveFolderFiles } from "@/lib/driveFilesCache";
import { getErrorMessage, getSiteApiContext } from "@/lib/siteApi";

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const driveFolderId = String(context.project.drive_folder_id || "").trim();
    if (!driveFolderId) {
      return NextResponse.json({ success: true, data: [], project: context.project });
    }

    // ?fresh=1 bypasses the 60 second cache (used right after uploads and by the refresh button).
    const fresh = new URL(req.url).searchParams.get("fresh") === "1";
    const files = await readDriveFolderFiles(driveFolderId, fresh);

    return NextResponse.json({ success: true, data: files, project: context.project });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
