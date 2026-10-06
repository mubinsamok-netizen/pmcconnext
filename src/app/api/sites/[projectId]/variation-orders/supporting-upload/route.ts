import { NextResponse } from "next/server";
import { findOrCreateFolder, uploadFile } from "@/lib/drive";
import { hasPermission, permissionDeniedMessage } from "@/lib/permissions";
import { getErrorMessage, getSiteApiContext } from "@/lib/siteApi";

const MAX_SUPPORTING_FILE_SIZE = 3.75 * 1024 * 1024;

function text(value: unknown) {
  return String(value || "").trim();
}

function safeFolderName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "Other";
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    if (!context.session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(context.session.user.role, "vo.create")) {
      return NextResponse.json({ error: permissionDeniedMessage("vo.create") }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const voId = text(formData.get("vo_id"));
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "กรุณาเลือกไฟล์หลักฐาน" }, { status: 400 });
    }
    if (file.size > MAX_SUPPORTING_FILE_SIZE) {
      return NextResponse.json({ error: "ทางสำรองผ่านระบบรองรับไฟล์ไม่เกิน 3.75 MB ต่อไฟล์" }, { status: 413 });
    }

    const rootFolderId = text(context.project.drive_folder_id);
    if (!rootFolderId) {
      return NextResponse.json({ error: "โครงการยังไม่ได้ตั้งค่า Google Drive folder" }, { status: 400 });
    }

    const voRoot = await findOrCreateFolder("Variation Orders", rootFolderId);
    let parentFolderId = voRoot.id || rootFolderId;
    if (voId) {
      const voFolder = await findOrCreateFolder(safeFolderName(voId), parentFolderId);
      const supportingFolder = await findOrCreateFolder("Supporting Docs", voFolder.id || parentFolderId);
      parentFolderId = supportingFolder.id || voFolder.id || parentFolderId;
    } else {
      const incomingFolder = await findOrCreateFolder("Incoming Supporting Docs", parentFolderId);
      parentFolderId = incomingFolder.id || parentFolderId;
    }

    const mimeType = file.type || "application/octet-stream";
    const uploaded = await uploadFile(
      `${Date.now()}-${safeFolderName(file.name)}`,
      mimeType,
      Buffer.from(await file.arrayBuffer()),
      parentFolderId
    );
    const fileUrl = uploaded.webViewLink || uploaded.webContentLink || "";
    if (!uploaded.id || !fileUrl) throw new Error("Google Drive ไม่ส่งข้อมูลไฟล์กลับมาครบ");

    return NextResponse.json({
      success: true,
      data: {
        file_id: uploaded.id,
        file_name: file.name,
        file_url: fileUrl,
        mime_type: mimeType,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "อัปโหลดไฟล์หลักฐานไม่สำเร็จ") }, { status: 500 });
  }
}
