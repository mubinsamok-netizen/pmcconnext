import { NextResponse } from "next/server";
import { invalidateDriveFilesCache, readDriveFolderFiles } from "@/lib/driveFilesCache";
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

    return NextResponse.json({ success: true, data: files, project: context.project, limitReached: files.length >= 500 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// Expire in a separate request so the subsequent GET can fill the shared cache
// after Next.js has committed the invalidation. No Drive or business data is written.
export async function POST(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    const folderId = String(context.project.drive_folder_id || "").trim();
    if (folderId && !invalidateDriveFilesCache(folderId)) {
      return NextResponse.json({ error: "รีเฟรชรายการ Drive ไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 503 });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
