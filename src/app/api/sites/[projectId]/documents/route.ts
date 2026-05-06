import { NextResponse } from "next/server";
import { findOrCreateFolder, uploadFile } from "@/lib/drive";
import { hasPermission, permissionDeniedMessage } from "@/lib/permissions";
import { findAll, insert } from "@/lib/sheetsCrud";
import { getErrorMessage, getSiteApiContext, makeId } from "@/lib/siteApi";

function safeFolderName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "Other";
}

function isSheetsReadQuotaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Quota exceeded") && message.includes("Read requests");
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const rows = await findAll("Project_Documents", context.siteSheetId);
    const documents = rows
      .filter((row) => row.project_id === context.project.project_id)
      .sort((a, b) => new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime());

    return NextResponse.json({ success: true, data: documents, project: context.project });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    if (!hasPermission(context.session.user?.role, "siteDocument.upload")) {
      return NextResponse.json({ error: permissionDeniedMessage("siteDocument.upload") }, { status: 403 });
    }

    const driveFolderId = String(context.project.drive_folder_id || "").trim();
    if (!driveFolderId) {
      return NextResponse.json({ error: "Project has no Google Drive folder" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "กรุณาเลือกไฟล์ PDF" }, { status: 400 });
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "รองรับเฉพาะไฟล์ PDF" }, { status: 400 });
    }

    const category = String(formData.get("category") || "other");
    const title = String(formData.get("title") || file.name).trim() || file.name;
    const notes = String(formData.get("notes") || "");
    let rows: Awaited<ReturnType<typeof findAll>> = [];
    try {
      rows = await findAll("Project_Documents", context.siteSheetId);
    } catch (error: unknown) {
      if (!isSheetsReadQuotaError(error)) throw error;
      console.warn("Project document version lookup skipped because Sheets read quota is temporarily exceeded.");
    }

    const currentVersions = rows
      .filter((row) => (
        row.project_id === context.project.project_id &&
        String(row.category || "") === category &&
        String(row.title || "") === title
      ))
      .map((row) => Number(row.version_number || 0))
      .filter(Number.isFinite);
    const versionNumber = Math.max(0, ...currentVersions) + 1;

    const documentsFolder = await findOrCreateFolder("Project Documents", driveFolderId);
    const categoryFolder = await findOrCreateFolder(safeFolderName(category), documentsFolder.id || driveFolderId);
    const bytes = Buffer.from(await file.arrayBuffer());
    const storedName = `v${versionNumber}-${Date.now()}-${file.name}`;
    const uploaded = await uploadFile(storedName, file.type || "application/pdf", bytes, categoryFolder.id || driveFolderId);

    const data = {
      document_id: makeId("DOC"),
      project_id: context.project.project_id,
      category,
      title,
      version_number: String(versionNumber),
      file_name: file.name,
      mime_type: file.type || "application/pdf",
      file_size: String(file.size),
      drive_file_id: uploaded.id || "",
      drive_url: uploaded.webViewLink || uploaded.webContentLink || "",
      notes,
      uploaded_by_email: context.session.user?.email || "",
      uploaded_by_name: context.session.user?.name || "",
    };
    const result = await insert("Project_Documents", data, context.siteSheetId);

    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
