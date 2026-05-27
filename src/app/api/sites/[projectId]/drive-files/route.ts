import { NextResponse } from "next/server";
import { listDriveFolderFiles } from "@/lib/drive";
import { getErrorMessage, getSiteApiContext } from "@/lib/siteApi";

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const driveFolderId = String(context.project.drive_folder_id || "").trim();
    if (!driveFolderId) {
      return NextResponse.json({ success: true, data: [], project: context.project });
    }

    const files = await listDriveFolderFiles(driveFolderId, {
      recursive: true,
      maxDepth: 4,
      pageSize: 100,
      maxFiles: 500,
    });

    return NextResponse.json({ success: true, data: files, project: context.project });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
